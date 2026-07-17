// Quirón, tu coach — panel de chat con el agente (Fase 3 del plan).
// Patrón por turno (heredado de bookreader): 1) fase de recolección con
// herramientas vía chatToolsLoop (no-streaming, el modelo responde "LISTO"
// cuando tiene datos), 2) respuesta final streameada con chatStream.
// La conversación vive en localStorage 'areteQuiron', fuera de la db sincronizada.

import * as LLM from '../ai/llm.js';
import { buildSnapshot } from '../ai/context.js';
import { QUIRON_TOOLS, makeToolExecutor } from '../ai/tools.js';
import { buildSystemMessage } from '../ai/soul.js';
import { getPrograms, getProgramList, getAllPhases, getRunningProgramList } from '../programs.js';
import { esc } from '../utils.js';
import { toast } from './toast.js';

const CONVO_KEY = 'areteQuiron';
const ARCHIVE_KEY = 'areteQuironArchive';
const ARCHIVE_MAX = 15;
const GATHER_MAX_ROUNDS = 3;

const CHIPS = [
  '¿Qué toca hoy?',
  'Analiza mi última semana',
  '¿Subo peso en sentadilla?',
  '¿Necesito una descarga?',
];

let convo = [];          // [{role:'user'|'assistant'|'data', content}] — solo lo persistente
                         // 'data' = resultados de herramientas: no se pinta y viaja como 'user'
                         // (nan solo admite mensajes 'system' en el índice 0)
let busy = false;
let abortCtrl = null;
let els = {};

function loadConvo() {
  try {
    const c = JSON.parse(localStorage.getItem(CONVO_KEY));
    return Array.isArray(c) ? c : [];
  } catch { return []; }
}
function saveConvo() {
  try { localStorage.setItem(CONVO_KEY, JSON.stringify(convo)); }
  catch { /* llena: la conversación es prescindible */ }
}

// ── Archivo de conversaciones (local, fuera del backup de Drive) ────────────
// Al empezar una nueva conversación, la actual se archiva (cap 15, FIFO).
// El histórico durable del entrenamiento vive en la db; esto es solo para no
// perder un análisis reciente al abrir un tema nuevo.

function loadArchive() {
  try {
    const a = JSON.parse(localStorage.getItem(ARCHIVE_KEY));
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function saveArchive(a) {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(a.slice(0, ARCHIVE_MAX))); }
  catch { /* llena */ }
}
function archiveCurrent() {
  if (!convo.some(m => m.role === 'assistant')) return;   // nada que guardar
  const title = (convo.find(m => m.role === 'user')?.content || 'Conversación').slice(0, 60);
  saveArchive([{ ts: Date.now(), title, messages: convo }, ...loadArchive()]);
}

function renderHistoryList() {
  const list = document.getElementById('quironHistoryList');
  const arch = loadArchive();
  if (!arch.length) {
    list.innerHTML = '<p class="quiron-history-empty">Sin conversaciones guardadas. Al pulsar “nueva conversación”, la actual se guarda aquí.</p>';
    return;
  }
  list.innerHTML = arch.map((c, i) => {
    const d = new Date(c.ts);
    const when = d.toLocaleDateString('es', { day: 'numeric', month: 'short' }) + ' · ' +
      d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    const n = c.messages.filter(m => m.role !== 'data').length;
    return `<div class="quiron-history-item" data-idx="${i}">
      <div class="qh-text"><div class="qh-title">${esc(c.title)}</div><div class="qh-meta">${when} · ${n} mensajes</div></div>
      <button class="qh-del" data-del="${i}" aria-label="Borrar">✕</button>
    </div>`;
  }).join('');
}

function resumeConversation(idx) {
  const arch = loadArchive();
  const c = arch[idx];
  if (!c) return;
  archiveCurrent();
  // La retomada sale del archivo (vuelve a ser la activa)
  saveArchive(loadArchive().filter(x => x.ts !== c.ts));
  convo = c.messages;
  saveConvo();
  renderConvo();
}

// Contexto de programas para el snapshot (resuelto aquí; context.js queda puro)
function progContext(db) {
  const list = getProgramList();
  const active = list.find(p => p.id === (db.program || 'arete'));
  const phase = getAllPhases().find(p => p.id === db.phase);
  const sessionNames = Object.keys(getPrograms()[db.phase]?.sessions || {});
  const runProg = getRunningProgramList().find(p => p.id === db.runningProgram);
  return {
    name: active?.name, phaseName: phase?.name, sessionNames,
    runProgramName: runProg?.name, runWeek: runProg ? db.runningWeek : 0,
  };
}

// Markdown mínimo: escapa HTML y da formato a código, negritas y listas.
export function mdLite(text) {
  const escaped = esc(text);
  const blocks = escaped.split(/```(?:\w*\n)?/);
  // Posiciones impares = dentro de ``` ``` (si el texto está bien balanceado;
  // si no, el último trozo abierto también se trata como código).
  return blocks.map((b, i) => {
    if (i % 2 === 1) return `<pre class="q-code">${b.replace(/\n$/, '')}</pre>`;
    let t = b.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.split('\n').map(line => {
      const m = /^\s*[-•]\s+(.*)$/.exec(line);
      return m ? `<div class="q-li">• ${m[1]}</div>` : line;
    }).join('\n');
    return t.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>').replace(/(<br>)?(<div class="q-li">)/g, '$2').replace(/(<\/div>)<br>/g, '$1');
  }).join('');
}

function appendBubble(role, html) {
  const el = document.createElement('div');
  el.className = `q-bubble q-${role}`;
  el.innerHTML = html;
  els.msgs.appendChild(el);
  els.msgs.scrollTop = els.msgs.scrollHeight;
  return el;
}

function renderConvo() {
  els.msgs.innerHTML = '';
  for (const m of convo) {
    if (m.role === 'user') appendBubble('user', mdLite(m.content));
    else if (m.role === 'assistant') appendBubble('assistant', mdLite(m.content));
    // 'data' (datos recuperados): no se pinta
  }
  updateChips();
}

function updateChips() {
  const empty = !convo.some(m => m.role === 'user');
  els.chips.innerHTML = empty
    ? CHIPS.map(c => `<button class="q-chip">${esc(c)}</button>`).join('')
    : '';
}

function setBusy(b) {
  busy = b;
  els.send.innerHTML = `<span class="material-symbols-outlined">${b ? 'stop' : 'arrow_upward'}</span>`;
  els.send.classList.toggle('q-stop', b);
  els.input.disabled = false;
}

function showSetupIfNeeded() {
  const needs = !LLM.hasKey();
  els.setup.hidden = !needs;
  els.inputbar.style.display = needs ? 'none' : '';
  els.chips.style.display = needs ? 'none' : '';
  return needs;
}

async function send(db, text) {
  const q = (text || '').trim();
  if (!q || busy) return;
  if (showSetupIfNeeded()) return;
  if (!navigator.onLine) { toast('Quirón necesita conexión', 'error'); return; }

  convo.push({ role: 'user', content: q });
  appendBubble('user', mdLite(q));
  updateChips();
  saveConvo();
  els.input.value = '';
  autoGrow();

  setBusy(true);
  abortCtrl = new AbortController();
  const signal = abortCtrl.signal;

  const bubble = appendBubble('assistant', '<span class="q-typing">consultando tus datos…</span>');

  try {
    const snapshot = buildSnapshot(db, progContext(db));
    const system = buildSystemMessage(snapshot);
    // 'data' viaja como user con prefijo (nan solo admite system en el índice 0)
    const toApi = (m) => m.role === 'data'
      ? { role: 'user', content: '[DATOS DEL HISTÓRICO — generados por la app, no por el atleta]\n' + m.content }
      : { role: m.role, content: m.content };
    const history = convo.map(toApi);

    // 1) Recolección: el modelo pide herramientas si el snapshot no basta.
    const gathered = [];
    try {
      await LLM.chatToolsLoop({
        messages: [
          system,
          ...history,
          { role: 'user', content: '[INSTRUCCIÓN DE LA APP] Antes de responder: si necesitas histórico que no esté en el snapshot, pide las herramientas necesarias. Cuando tengas los datos (o si el snapshot ya basta), responde exactamente "LISTO". NO respondas aún al atleta.' },
        ],
        tools: QUIRON_TOOLS,
        execute: async (name, args) => {
          const out = await makeToolExecutor(db, { getPrograms })(name, args);
          gathered.push(`[${name}(${JSON.stringify(args)})]\n${out}`);
          return out;
        },
        maxRounds: GATHER_MAX_ROUNDS,
        maxTokens: 1024,
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.warn('Recolección falló; respondo solo con el snapshot:', e);
    }
    if (gathered.length) {
      convo.push({ role: 'data', content: gathered.join('\n\n') });
      history.push(toApi(convo[convo.length - 1]));
    }

    // 2) Respuesta final, streameada.
    let full = '';
    let truncated = false;
    await LLM.chatStream({
      messages: [system, ...history],
      onToken: (tok) => {
        full += tok;
        bubble.innerHTML = mdLite(full);
        els.msgs.scrollTop = els.msgs.scrollHeight;
      },
      onDone: (info) => { truncated = info.truncated; },
      signal,
    });

    if (!full.trim()) { bubble.remove(); toast('Respuesta vacía del modelo', 'error'); }
    else {
      convo.push({ role: 'assistant', content: full });
      saveConvo();
      if (truncated) {
        const btn = document.createElement('button');
        btn.className = 'q-chip q-continue';
        btn.textContent = 'Continuar respuesta';
        btn.addEventListener('click', () => { btn.remove(); send(db, 'Continúa exactamente donde lo dejaste.'); });
        els.msgs.appendChild(btn);
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      bubble.innerHTML = '<span class="q-err">— detenido —</span>';
    } else {
      bubble.innerHTML = `<span class="q-err">${esc(e.message)}</span>`;
    }
    // El turno quedó sin respuesta: quita el user (y data) finales para reintentar limpio
    while (convo.length && convo[convo.length - 1].role !== 'assistant') convo.pop();
    saveConvo();
  } finally {
    setBusy(false);
    abortCtrl = null;
  }
}

function autoGrow() {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
}

function openPanel() {
  els.panel.classList.add('open');
  document.body.classList.add('quiron-open');
  showSetupIfNeeded();
  els.msgs.scrollTop = els.msgs.scrollHeight;
}
function closePanel() {
  els.panel.classList.remove('open');
  document.body.classList.remove('quiron-open');
}

// ── Ajustes (proveedor / key / modelo) ──────────────────────────────────────

function fillModelOptions(providerId) {
  const preset = LLM.PROVIDERS.find(p => p.id === providerId);
  els.setModelList.innerHTML = (preset?.models || []).map(m => `<option value="${esc(m)}">`).join('');
}

function initSettingsUI() {
  const preset = LLM.currentProvider();
  els.setProvider.value = preset ? preset.id : 'custom';
  els.setBaseUrl.value = LLM.getBaseUrl();
  els.setBaseUrl.readOnly = !!preset;
  els.setKey.value = LLM.getKey();
  els.setModel.value = LLM.getModel();
  fillModelOptions(preset?.id);

  els.setProvider.addEventListener('change', () => {
    const p = LLM.PROVIDERS.find(x => x.id === els.setProvider.value);
    if (p) {
      els.setBaseUrl.value = p.baseUrl;
      els.setBaseUrl.readOnly = true;
      els.setModel.value = p.models[0] || '';
    } else {
      els.setBaseUrl.readOnly = false;
      els.setBaseUrl.focus();
    }
    fillModelOptions(p?.id);
    persistSettings();
  });
  for (const el of [els.setBaseUrl, els.setKey, els.setModel]) {
    el.addEventListener('change', persistSettings);
  }
  els.setTest.addEventListener('click', async () => {
    persistSettings();
    els.setStatus.textContent = 'Probando…';
    els.setStatus.className = 'drive-status';
    els.setTest.disabled = true;
    try {
      await LLM.testConnection({ baseUrl: els.setBaseUrl.value, key: els.setKey.value, model: els.setModel.value });
      els.setStatus.textContent = '✓ Conexión correcta';
      els.setStatus.className = 'drive-status drive-success';
    } catch (e) {
      els.setStatus.textContent = e.message;
      els.setStatus.className = 'drive-status drive-error';
    } finally {
      els.setTest.disabled = false;
    }
  });
}

function persistSettings() {
  LLM.setBaseUrl(els.setBaseUrl.value);
  LLM.setKey(els.setKey.value);
  LLM.setModel(els.setModel.value);
  showSetupIfNeeded();
}

// ── Init ────────────────────────────────────────────────────────────────────

export function initQuiron(db) {
  els = {
    fab: document.getElementById('quironFab'),
    panel: document.getElementById('quironPanel'),
    msgs: document.getElementById('quironMsgs'),
    chips: document.getElementById('quironChips'),
    setup: document.getElementById('quironSetup'),
    inputbar: document.getElementById('quironInputBar'),
    input: document.getElementById('quironInput'),
    send: document.getElementById('quironSendBtn'),
    setProvider: document.getElementById('quironProvider'),
    setBaseUrl: document.getElementById('quironBaseUrl'),
    setKey: document.getElementById('quironKey'),
    setModel: document.getElementById('quironModel'),
    setModelList: document.getElementById('quironModelList'),
    setTest: document.getElementById('quironTestBtn'),
    setStatus: document.getElementById('quironAiStatus'),
  };

  convo = loadConvo();
  renderConvo();
  initSettingsUI();

  els.fab.addEventListener('click', openPanel);
  document.getElementById('quironCloseBtn').addEventListener('click', closePanel);
  document.getElementById('quironNewBtn').addEventListener('click', () => {
    if (busy) abortCtrl?.abort();
    archiveCurrent();
    convo = [];
    saveConvo();
    renderConvo();
  });

  // Historial de conversaciones
  const historyModal = document.getElementById('quironHistoryModal');
  document.getElementById('quironHistoryBtn').addEventListener('click', () => {
    renderHistoryList();
    historyModal.classList.add('open');
  });
  document.getElementById('quironHistoryClose').addEventListener('click', () => historyModal.classList.remove('open'));
  historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) { historyModal.classList.remove('open'); return; }
    const del = e.target.closest('.qh-del');
    if (del) {
      const arch = loadArchive();
      arch.splice(parseInt(del.dataset.del), 1);
      saveArchive(arch);
      renderHistoryList();
      return;
    }
    const item = e.target.closest('.quiron-history-item');
    if (item && !busy) {
      resumeConversation(parseInt(item.dataset.idx));
      historyModal.classList.remove('open');
    }
  });

  els.send.addEventListener('click', () => {
    if (busy) { abortCtrl?.abort(); return; }
    send(db, els.input.value);
  });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) send(db, els.input.value); }
  });
  els.input.addEventListener('input', autoGrow);

  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.q-chip');
    if (chip && !busy) send(db, chip.textContent);
  });

  document.getElementById('quironGoSettings').addEventListener('click', () => {
    closePanel();
    document.querySelector('nav button[data-sec="secSettings"]')?.click();
  });
}
