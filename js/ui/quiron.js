// Quirón, tu coach — panel de chat con el agente (Fase 3 del plan).
// Patrón por turno (heredado de bookreader): 1) fase de recolección con
// herramientas vía chatToolsLoop (no-streaming, el modelo responde "LISTO"
// cuando tiene datos), 2) respuesta final streameada con chatStream.
// La conversación vive en localStorage 'areteQuiron', fuera de la db sincronizada.

import * as LLM from '../ai/llm.js';
import { buildSnapshot, buildReport } from '../ai/context.js';
import { QUIRON_TOOLS, QUIRON_WRITE_TOOLS, makeToolExecutor } from '../ai/tools.js';
import { buildSystemMessage } from '../ai/soul.js';
import {
  getPrograms, getProgramList, getAllPhases, getRunningProgramList,
  validateProgram, applyProgramProposal, undoProgramCommit, getProgramById,
  isBuiltinProgram, programPhaseKeys,
} from '../programs.js';
import { validateWorkout, normalizeWorkout, applyWorkout, undoWorkout } from '../data.js';
import { esc } from '../utils.js';
import { toast } from './toast.js';

// Callback para refrescar la app subyacente tras aplicar/deshacer un plan.
let onProgramsChanged = () => {};

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
let dbRef = null;        // referencia a la db (para re-render de tarjetas persistidas)
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
    plannedPerWeek: sessionNames.length,
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
    if (m.role === 'user') appendBubble('user', mdLite(m.label || m.content));
    else if (m.role === 'assistant') {
      if (m.content?.trim()) appendBubble('assistant', mdLite(m.content));
      if (m.proposals) for (const p of m.proposals) els.msgs.appendChild(renderProposalCard(dbRef, p, m));
    }
    // 'data' (datos recuperados / informe): no se pinta
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

// opts.label    → texto visible en la burbuja del usuario (si el prompt real es largo/técnico)
// opts.dataBlob → datos ya calculados por la app (p. ej. el informe); van adjuntos al turno
// opts.skipGather → saltar la fase de recolección con tools (cuando ya tenemos todo, p. ej. informe)
async function send(db, text, opts = {}) {
  const q = (text || '').trim();
  if (!q || busy) return;
  if (showSetupIfNeeded()) return;
  if (!navigator.onLine) { toast('Quirón necesita conexión', 'error'); return; }

  convo.push(opts.label ? { role: 'user', content: q, label: opts.label } : { role: 'user', content: q });
  appendBubble('user', mdLite(opts.label || q));
  if (opts.dataBlob) convo.push({ role: 'data', content: opts.dataBlob });
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

    // 1) Recolección + propuestas: el modelo pide herramientas de lectura si el
    //    snapshot no basta, y puede proponer escrituras (propose_program) que NO se
    //    aplican: se recogen para mostrar una tarjeta de confirmación tras el turno.
    const gathered = [];
    const proposals = [];
    if (!opts.skipGather) {
      const executor = makeToolExecutor(db, {
        getPrograms,
        validateProgram,
        onProposal: (p) => proposals.push(p),
      });
      try {
        await LLM.chatToolsLoop({
          messages: [
            system,
            ...history,
            { role: 'user', content: '[INSTRUCCIÓN DE LA APP] Esta es la fase de HERRAMIENTAS. Reglas:\n1) Si necesitas histórico que no esté en el snapshot, pide las tools de lectura.\n2) Si el atleta pide CREAR o EDITAR un plan: llama a propose_program describiendo el plan en `goal` (consulta antes su e1RM/marca para calibrar).\n3) Si el atleta describe un ENTRENO YA HECHO para registrarlo (ej. "hoy sentadilla 5x5 a 100"): llama a log_workout con esa descripción en `description`.\n4) En 2) y 3) NO escribas el plan/entreno como tabla — la app lo genera desde la herramienta. Si respondes "LISTO" sin llamar a la herramienta cuando se pide, se pierde.\n5) Cuando tengas los datos y (si procede) hayas llamado a la herramienta, responde exactamente "LISTO". NO respondas aún al atleta.' },
          ],
          tools: [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS],
          execute: async (name, args) => {
            const out = await executor(name, args);
            if (name !== 'propose_program') gathered.push(`[${name}(${JSON.stringify(args)})]\n${out}`);
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
    }
    if (gathered.length) {
      convo.push({ role: 'data', content: gathered.join('\n\n') });
      history.push(toApi(convo[convo.length - 1]));
    }

    // 2a) Si el modelo pidió crear/editar un plan o registrar un entreno: la app lo
    //     GENERA (JSON-en-contenido, fiable) y muestra la tarjeta de confirmación.
    //     No pasa por el stream normal.
    const writeRequests = proposals.filter(p => p.type === 'program_request' || p.type === 'workout_request');
    if (writeRequests.length) {
      const built = [];
      const proseParts = [];
      const uid = () => `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      for (const req of writeRequests) {
        try {
          if (req.type === 'program_request') {
            bubble.innerHTML = '<span class="q-typing">generando tu plan…</span>';
            const { program, prose } = await generatePlan(db, req, signal);
            proseParts.push(prose);
            built.push({ type: 'program', program, basedOn: req.basedOn || null, summary: program._meta?.desc || '', id: uid() });
          } else {
            bubble.innerHTML = '<span class="q-typing">estructurando el entreno…</span>';
            const { workout, prose } = await generateWorkout(db, req, signal);
            proseParts.push(prose);
            built.push({ type: 'workout', workout, id: uid() });
          }
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          proseParts.push(`No pude procesarlo: ${e.message}`);
        }
      }
      const proseText = proseParts.filter(Boolean).join('\n\n') || 'Listo para revisar.';
      bubble.innerHTML = mdLite(proseText);
      const msg = { role: 'assistant', content: proseText, proposals: built };
      convo.push(msg);
      saveConvo();
      for (const p of built) els.msgs.appendChild(renderProposalCard(db, p, msg));
      els.msgs.scrollTop = els.msgs.scrollHeight;
      return;
    }

    // 2b) Respuesta final, streameada.
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
      els.msgs.scrollTop = els.msgs.scrollHeight;
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

// Informe (Fase 5b): los agregados los calcula la app (buildReport); Quirón los
// convierte en el formato RESUMEN. Sin fase de recolección: ya tenemos todo.
function sendReport(db, period) {
  const pc = progContext(db);
  const dataBlob = buildReport(db, pc, { period });
  const label = period === 'month' ? '📊 Informe mensual' : '📊 Informe semanal';
  const instruction = `Genera mi INFORME ${period === 'month' ? 'del último mes' : 'de la última semana'} usando los DATOS DEL INFORME adjuntos (ya calculados por la app: cítalos, no los recalcules).\n\nEstructura EXACTA de la respuesta:\n1) Primero, SOLO la tabla RESUMEN dentro de un bloque de código \`\`\`.\n2) Después, FUERA del bloque de código, en prosa normal con **negritas** y lista numerada: 2-3 recomendaciones concretas y accionables. Termina con una nota de seguridad (no cargar sobre dolor).\n\nNO metas las recomendaciones dentro del bloque de código.`;
  send(db, instruction, { label, dataBlob, skipGather: true });
}

// Ofrece elegir periodo con dos botones inline (reusa el patrón de "Continuar").
function offerReport(db) {
  if (busy) return;
  const card = document.createElement('div');
  card.className = 'q-report-choice';
  card.innerHTML = `<span>¿Qué informe quieres?</span>
    <button class="q-chip" data-period="week">Semanal</button>
    <button class="q-chip" data-period="month">Mensual</button>`;
  els.msgs.appendChild(card);
  els.msgs.scrollTop = els.msgs.scrollHeight;
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-period]');
    if (!b) return;
    card.remove();
    sendReport(db, b.dataset.period);
  });
}

// ── Generación de planes (Fase 5.4): JSON-en-contenido ──────────────────────
// Los modelos rellenan mal objetos JSON grandes como argumentos de tool, pero sí
// emiten JSON grande fiablemente en el contenido. Pedimos prosa + un bloque ```json,
// extraemos y validamos; reintenta una vez con el error de validación.

const PLAN_SCHEMA_HELP = `Forma EXACTA del plan (schema de Areté):
- Fuerza: { "_meta": { "name": "...", "desc": "..." }, "1": { "name": "Semana 1", "desc": "...", "sessions": { "Día 1": [ { "name": "Sentadilla", "sets": 3, "reps": "5", "type": "main", "kg": 90 } ] } }, "2": { ... } }
- Running: añade "_meta": { ..., "sport": "running" }; los bloques de sesión llevan { "name", "mode": "run-steady"|"run-intervals", "duration", "zone", "pace", "distance", "reps" }.
Una clave numérica ("1","2",...) por fase o semana. type: "main" | "assist" | "hiit". En fuerza, incluye "kg" objetivo cuando puedas calibrar con el e1RM. Devuelve UN solo bloque \`\`\`json, sin texto después.`;

function extractJsonBlock(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/);
  return m ? { json: m[1].trim(), prose: text.slice(0, m.index).trim() } : { json: null, prose: text.trim() };
}

async function generatePlan(db, req, signal) {
  const snapshot = buildSnapshot(db, progContext(db));
  let editContext = '';
  if (req.basedOn) {
    const base = getProgramById(req.basedOn);
    if (base) {
      const { _revisions, ...clean } = base;
      editContext = `\n\nEDITAS el plan existente "${base._meta?.name}" (id ${req.basedOn}). Su JSON actual es:\n${JSON.stringify(clean)}\nAplica los cambios pedidos y devuelve el plan ENTERO ya modificado.`;
    }
  }
  const ask = (extra) => [
    buildSystemMessage(snapshot),
    { role: 'user', content: `Genera un plan de entrenamiento. Objetivo: ${req.goal}.${editContext}\n\nResponde en DOS partes: (1) 2-3 frases en prosa explicando la calibración con mis datos y una nota de seguridad; (2) un ÚNICO bloque \`\`\`json con el plan completo.\n\n${PLAN_SCHEMA_HELP}${extra || ''}` },
  ];

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = attempt === 0 ? '' : `\n\nEl intento anterior falló: ${lastErr}. Corrígelo y devuelve el plan completo.`;
    const full = await LLM.chatStream({ messages: ask(extra), maxTokens: 4096, signal });
    const { json, prose } = extractJsonBlock(full);
    if (!json) { lastErr = 'no devolviste un bloque ```json'; continue; }
    let parsed;
    try { parsed = JSON.parse(json); } catch { lastErr = 'el JSON no era parseable'; continue; }
    const err = validateProgram(parsed);
    if (err) { lastErr = err; continue; }
    return { program: parsed, prose: prose || 'Te he preparado este plan. Revísalo y aplícalo si te encaja.' };
  }
  throw new Error(lastErr || 'no se pudo generar un plan válido');
}

// ── Ingesta de entrenos (Fase 5.1): estructurar texto → workout JSON ─────────

const WORKOUT_SCHEMA_HELP = `Forma EXACTA del entreno (JSON):
{ "date": "YYYY-MM-DD", "session": "nombre corto", "notes": "", "exercises": [ { "name": "Sentadilla", "sets": [ { "kg": "100", "reps": "5" }, { "kg": "100", "reps": "5" } ] } ] }
Reglas: una entrada por serie en "sets" (si dice "5x5 a 100", son 5 series de kg 100 reps 5). kg y reps como texto; kg "" si es peso corporal. Sé FIEL a lo que dice el atleta: no inventes series ni pesos. Devuelve UN solo bloque \`\`\`json, sin texto después.`;

async function generateWorkout(db, req, signal) {
  const hoy = new Date().toISOString().slice(0, 10);
  const sys = { role: 'system', content: `Estructuras entrenos ya realizados al schema de Areté. Hoy es ${hoy}. No inventes datos que el atleta no diga.` };
  const ask = (extra) => [sys, { role: 'user', content: `Registra este entreno: ${req.description}\n\nResponde en DOS partes: (1) una frase breve de confirmación en prosa; (2) un ÚNICO bloque \`\`\`json con el entreno.\n\n${WORKOUT_SCHEMA_HELP}${extra || ''}` }];

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = attempt === 0 ? '' : `\n\nEl intento anterior falló: ${lastErr}. Corrígelo.`;
    const full = await LLM.chatStream({ messages: ask(extra), maxTokens: 2048, signal });
    const { json, prose } = extractJsonBlock(full);
    if (!json) { lastErr = 'no devolviste un bloque ```json'; continue; }
    let parsed;
    try { parsed = JSON.parse(json); } catch { lastErr = 'el JSON no era parseable'; continue; }
    const err = validateWorkout(parsed);
    if (err) { lastErr = err; continue; }
    return { workout: normalizeWorkout(parsed), prose: prose || 'Entreno listo para revisar.' };
  }
  throw new Error(lastErr || 'no pude estructurar el entreno');
}

// ── Ingesta por captura (Fase 5.1): imagen → visión → workout ────────────────
// El vídeo/imagen se procesa EN EL CLIENTE: se reescala a ~1024px y se manda solo
// esa versión al modelo de visión (deepseek no tiene visión; en nan, qwen3.6).

const VISION_MAX_DIM = 1024;

// Reescala una imagen (File) a JPEG data URI con dimensión máxima VISION_MAX_DIM.
function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, VISION_MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('no se pudo leer la imagen')); };
    img.src = url;
  });
}

const VISION_PROMPT = `Esta es una CAPTURA de una app de registro de entrenamiento (Strong, Hevy, Garmin, Strava u otra). Extrae el entrenamiento a JSON.

Forma EXACTA:
{ "date": "YYYY-MM-DD", "session": "nombre corto", "notes": "", "exercises": [ { "name": "Sentadilla", "sets": [ { "kg": "100", "reps": "5" } ] } ] }

Reglas: una entrada por serie en "sets". kg y reps como texto; kg "" si es peso corporal. Convierte libras a kg si la captura usa lb (1 lb = 0.4536 kg) y anótalo en notes. Usa la fecha de la captura si aparece; si no, déjala vacía. Sé FIEL a lo que se ve: no inventes. Responde con una frase breve y luego UN solo bloque \`\`\`json.`;

async function ingestFromImage(db, file, signal) {
  const image = await downscaleImage(file);
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = attempt === 0 ? '' : `\n\nEl intento anterior falló: ${lastErr}. Devuelve solo el bloque \`\`\`json válido.`;
    const full = await LLM.chatVision({ image, prompt: VISION_PROMPT + extra, maxTokens: 2048, signal });
    const { json, prose } = extractJsonBlock(full);
    if (!json) { lastErr = 'no devolviste un bloque ```json'; continue; }
    let parsed;
    try { parsed = JSON.parse(json); } catch { lastErr = 'el JSON no era parseable'; continue; }
    const err = validateWorkout(parsed);
    if (err) { lastErr = err; continue; }
    return { workout: normalizeWorkout(parsed), prose: prose || 'He leído la captura. Revisa el entreno antes de guardarlo.' };
  }
  throw new Error(lastErr || 'no pude leer el entreno de la captura');
}

// Flujo de adjuntar imagen: reescala, extrae, muestra tarjeta de revisión.
async function handleImage(db, file) {
  if (busy) return;
  if (!file || !file.type.startsWith('image/')) { toast('Selecciona una imagen', 'error'); return; }
  if (showSetupIfNeeded()) { openPanel(); return; }
  if (!LLM.hasVision()) { toast('Configura un modelo de visión en Ajustes → Quirón', 'error'); return; }
  if (!navigator.onLine) { toast('Quirón necesita conexión', 'error'); return; }

  appendBubble('user', '<span class="q-img-chip"><span class="material-symbols-outlined">image</span> Captura de entreno</span>');
  const bubble = appendBubble('assistant', '<span class="q-typing">leyendo la captura…</span>');
  setBusy(true);
  abortCtrl = new AbortController();
  try {
    const { workout, prose } = await ingestFromImage(db, file, abortCtrl.signal);
    bubble.innerHTML = mdLite(prose);
    const p = { type: 'workout', workout, id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    const msg = { role: 'assistant', content: prose, proposals: [p] };
    convo.push(msg);
    saveConvo();
    els.msgs.appendChild(renderWorkoutCard(db, p, msg));
    els.msgs.scrollTop = els.msgs.scrollHeight;
  } catch (e) {
    bubble.innerHTML = e.name === 'AbortError'
      ? '<span class="q-err">— detenido —</span>'
      : `<span class="q-err">${esc(e.message)}</span>`;
  } finally {
    setBusy(false);
    abortCtrl = null;
  }
}

// ── Propuestas de escritura (Fase 5.0/5.1): tarjeta de confirmación ──────────

// Cablea Aplicar/Descartar/Deshacer, común a planes y entrenos. `doApply` devuelve el
// token de undo; `doUndo(token)` lo revierte.
function wireProposalActions(card, p, applyLabel, successMsg, doApply, doUndo) {
  const applyBtn = card.querySelector('.q-prop-apply');
  const discardBtn = card.querySelector('.q-prop-discard');
  const paint = () => {
    applyBtn.textContent = p.applied ? '✓ Aplicado' : applyLabel;
    applyBtn.disabled = !!p.applied;
    discardBtn.style.display = p.applied ? 'none' : '';
    card.classList.toggle('applied', !!p.applied);
  };
  paint();
  discardBtn.addEventListener('click', () => card.remove());
  applyBtn.addEventListener('click', () => {
    if (p.applied) return;
    let token;
    try { token = doApply(); } catch (e) { toast('No se pudo aplicar: ' + e.message, 'error'); return; }
    p.applied = true;
    saveConvo();
    paint();
    onProgramsChanged();
    toast(successMsg, 'success', {
      action: 'Deshacer',
      onAction: () => {
        doUndo(token);
        p.applied = false;
        saveConvo();
        paint();
        onProgramsChanged();
        toast('Cambio deshecho', 'info');
      },
    });
  });
}

// Tarjeta de un entreno ingerido (Fase 5.1).
function renderWorkoutCard(db, p, msg) {
  const card = document.createElement('div');
  card.className = 'q-proposal';
  const w = p.workout;
  const detail = w.exercises.map(ex => {
    const sets = ex.sets.map(s => s.kg ? `${esc(s.kg)}×${esc(s.reps || '?')}` : esc(s.reps || '')).join(' ');
    return `<div class="q-prop-line">${esc(ex.name)}: ${sets}</div>`;
  }).join('');
  card.innerHTML = `
    <div class="q-prop-head">
      <span class="material-symbols-outlined">fitness_center</span>
      <div class="q-prop-titles">
        <div class="q-prop-title">${esc(w.session || 'Entreno')}</div>
        <div class="q-prop-tag">Registrar entreno · ${esc(w.date)} · ${w.exercises.length} ejercicio(s)</div>
      </div>
    </div>
    ${w.notes ? `<div class="q-prop-summary">${esc(w.notes)}</div>` : ''}
    <div class="q-prop-detail">${detail}</div>
    <div class="q-prop-actions">
      <button class="btn btn-outline btn-sm q-prop-discard">Descartar</button>
      <button class="btn btn-sm q-prop-apply"></button>
    </div>`;
  wireProposalActions(card, p, 'Registrar', `Entreno registrado — ${w.date}`,
    () => applyWorkout(db, w), (t) => undoWorkout(db, t));
  return card;
}

// ── Propuestas de escritura (Fase 5.0): tarjeta de confirmación ──────────────

function planStructure(program) {
  return programPhaseKeys(program).map(k => {
    const ph = program[k] || {};
    const sess = Object.keys(ph.sessions || {});
    return `${ph.name || 'Fase ' + k}: ${sess.length} sesión(es)${sess.length ? ' — ' + sess.join(', ') : ''}`;
  });
}

// Renderiza la tarjeta de una propuesta. `p` es mutable (p.applied) y vive en el
// mensaje del asistente (persiste en la conversación). Despacha por tipo.
function renderProposalCard(db, p, msg) {
  if (p.type === 'workout') return renderWorkoutCard(db, p, msg);

  const card = document.createElement('div');
  card.className = 'q-proposal';
  const program = p.program || {};
  const name = program._meta?.name || 'Plan';
  const isRunning = program._meta?.sport === 'running';
  let actionLabel = 'Nuevo plan';
  if (p.basedOn) {
    const base = getProgramById(p.basedOn);
    const baseName = base?._meta?.name || p.basedOn;
    actionLabel = isBuiltinProgram(p.basedOn) ? `Adaptación de ${esc(baseName)}` : `Edición de ${esc(baseName)}`;
  }
  const nPhases = programPhaseKeys(program).length;
  const detail = planStructure(program).map(s => `<div class="q-prop-line">${esc(s)}</div>`).join('');

  card.innerHTML = `
    <div class="q-prop-head">
      <span class="material-symbols-outlined">assignment</span>
      <div class="q-prop-titles">
        <div class="q-prop-title">${esc(name)}</div>
        <div class="q-prop-tag">${actionLabel} · ${nPhases} ${isRunning ? 'semanas' : 'fases'}</div>
      </div>
    </div>
    ${p.summary ? `<div class="q-prop-summary">${esc(p.summary)}</div>` : ''}
    <button class="q-prop-toggle" type="button">Ver plan</button>
    <div class="q-prop-detail" hidden>${detail}</div>
    <div class="q-prop-actions">
      <button class="btn btn-outline btn-sm q-prop-discard">Descartar</button>
      <button class="btn btn-sm q-prop-apply"></button>
    </div>`;

  card.querySelector('.q-prop-toggle').addEventListener('click', (e) => {
    const d = card.querySelector('.q-prop-detail');
    d.hidden = !d.hidden;
    e.target.textContent = d.hidden ? 'Ver plan' : 'Ocultar';
  });
  wireProposalActions(card, p, 'Aplicar plan', `Plan aplicado — ${name}`,
    () => applyProgramProposal(db, p).token, (t) => undoProgramCommit(db, t));
  return card;
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
  els.setVisionModel.value = LLM.getVisionModelSetting();
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
  for (const el of [els.setBaseUrl, els.setKey, els.setModel, els.setVisionModel]) {
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
  LLM.setVisionModel(els.setVisionModel.value);
  showSetupIfNeeded();
}

// ── Init ────────────────────────────────────────────────────────────────────

export function initQuiron(db, opts = {}) {
  dbRef = db;
  if (typeof opts.onProgramsChanged === 'function') onProgramsChanged = opts.onProgramsChanged;
  els = {
    fab: document.getElementById('quironFab'),
    panel: document.getElementById('quironPanel'),
    msgs: document.getElementById('quironMsgs'),
    chips: document.getElementById('quironChips'),
    setup: document.getElementById('quironSetup'),
    inputbar: document.getElementById('quironInputBar'),
    input: document.getElementById('quironInput'),
    send: document.getElementById('quironSendBtn'),
    attach: document.getElementById('quironAttachBtn'),
    imageInput: document.getElementById('quironImageInput'),
    setProvider: document.getElementById('quironProvider'),
    setBaseUrl: document.getElementById('quironBaseUrl'),
    setKey: document.getElementById('quironKey'),
    setModel: document.getElementById('quironModel'),
    setModelList: document.getElementById('quironModelList'),
    setVisionModel: document.getElementById('quironVisionModel'),
    setTest: document.getElementById('quironTestBtn'),
    setStatus: document.getElementById('quironAiStatus'),
  };

  convo = loadConvo();
  renderConvo();
  initSettingsUI();

  els.fab.addEventListener('click', openPanel);
  document.getElementById('quironCloseBtn').addEventListener('click', closePanel);
  document.getElementById('quironReportBtn').addEventListener('click', () => offerReport(db));

  // Adjuntar captura → ingesta de entreno
  els.attach.addEventListener('click', () => { if (!busy) els.imageInput.click(); });
  els.imageInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // permite re-seleccionar la misma imagen
    if (file) handleImage(db, file);
  });
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
