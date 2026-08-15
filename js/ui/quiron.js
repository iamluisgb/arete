// Quirón, tu coach — panel de chat con el agente (Fase 3 del plan).
// Un turno es UNA llamada streameada con las herramientas puestas (`chatAgent`): si el
// modelo las pide, se ejecutan en local y una segunda vuelta streamea la respuesta con
// los resultados dentro. Retiró al protocolo de dos fases heredado de bookreader
// (recolección no-streaming que terminaba en "LISTO" + llamada aparte para responder).
// La conversación vive en localStorage 'areteQuiron', fuera de la db sincronizada.

import * as LLM from '../ai/llm.js';
import { buildSnapshot, buildReport, windowConversation, toApiMessages, estimateTokens, TOKEN_GUARD } from '../ai/context.js';
import { QUIRON_TOOLS, QUIRON_WRITE_TOOLS, WRITE_TOOL_NAMES, makeToolExecutor } from '../ai/tools.js';
import { buildSystemMessage } from '../ai/soul.js';
import { renderSettingsIndex, openSettingsPage } from './settings.js';
import {
  getPrograms, getProgramList, getAllPhases, getRunningProgramList,
  validateProgram, applyProgramProposal, undoProgramCommit, getProgramById,
  isBuiltinProgram, programPhaseKeys,
} from '../programs.js';
import {
  validateSession, normalizeSession, applySessionProposal, undoSessionCommit,
  catalogExerciseNames, unknownExercises, sessionRef,
} from '../sessions.js';
import { validateWorkout, normalizeWorkout, applyWorkout, undoWorkout, validateRun, normalizeRun, applyRun, undoRun } from '../data.js';
import { esc } from '../utils.js';
import { formatPace, formatRunDuration } from './running-helpers.js';
import { toast } from './toast.js';

// Callback para refrescar la app subyacente tras aplicar/deshacer un plan.
let onProgramsChanged = () => {};
// Callback para arrancar una sesión desde una propuesta (lo cablea app.js: aquí no
// se sabe nada de pestañas ni de borradores a medias).
let onStartSession = () => {};

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

// Qué se le enseña al atleta mientras corren las herramientas. Decir QUÉ se está
// mirando hace la espera más corta de lo que mide el reloj, y el bucle ya sabe los
// nombres: desperdiciarlos en un "consultando tus datos…" mudo era gratis y peor.
const TOOL_LABELS = {
  get_exercise_history: 'repasando tu histórico',
  get_workouts: 'repasando tus sesiones',
  get_runs: 'repasando tus carreras',
  get_body_logs: 'mirando tu peso y medidas',
  get_domain_profile: 'mirando tu perfil de dominios',
  get_program_detail: 'mirando tu plan',
  propose_program: 'preparando tu plan',
  propose_session: 'preparando la sesión',
  log_workout: 'anotando el entreno',
};
export function toolLabel(names = []) {
  const etiquetas = [...new Set(names.map(n => TOOL_LABELS[n]).filter(Boolean))];
  return etiquetas.length ? `${etiquetas.join(' · ')}…` : 'consultando tus datos…';
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
      if (m.proposals) for (const p of m.proposals) {
        if (p.discarded) continue;
        els.msgs.appendChild(renderProposalCard(dbRef, p, m));
      }
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
    // Solo viaja la ventana reciente, y sin los volcados de herramientas de turnos
    // anteriores: el modelo puede volver a pedirlos si los necesita (ver context.js).
    const history = toApiMessages(windowConversation(convo));

    const est = estimateTokens(system.content) + history.reduce((n, m) => n + estimateTokens(m.content), 0);
    if (est > TOKEN_GUARD &&
        !confirm(`El contexto de este turno es grande (~${Math.round(est / 1000)}k tokens): puede ser lento o caro. ¿Envío igualmente?`)) {
      bubble.remove();
      while (convo.length && convo[convo.length - 1].role !== 'assistant') convo.pop();
      saveConvo();
      return;
    }

    // 1) UNA llamada con las herramientas puestas, streameada. Si el modelo las pide, se
    //    ejecutan (lecturas locales, microsegundos) y la siguiente vuelta streamea la
    //    respuesta con los resultados dentro.
    //
    //    Sustituye al protocolo de dos fases (recolección no-streaming que terminaba en
    //    "LISTO" + llamada aparte para responder): eran 3-4 llamadas por turno y 13-22
    //    segundos de espera ciega antes del primer token, medidos el 2026-08-07. Aquí el
    //    texto empieza a salir en la primera llamada.
    // `gathered` acumula los volcados de las tools de LECTURA para guardarlos como
    // mensaje `data` del turno (ver el presupuesto de contexto en context.js). Se llena
    // dentro del `execute`, que corre en el bucle de chatAgent.
    const gathered = [];
    const proposals = [];
    let full = '';
    let truncated = false;
    if (!opts.skipGather) {
      const executor = makeToolExecutor(db, {
        getPrograms,
        validateProgram,
        onProposal: (p) => proposals.push(p),
        // Si el modelo pide una tool de escritura sin argumentos, se usa la petición del
        // atleta como intención en vez de perder el turno (ver `intent` en tools.js).
        askedBy: q,
      });

      const res = await LLM.chatAgent({
        messages: [system, ...history],
        tools: [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS],
        execute: async (name, args) => {
          const out = await executor(name, args);
          // Solo los volcados de LECTURA son datos. Lo que devuelven las tools de
          // escritura es una instrucción para el modelo ("dile en una frase que…"), y
          // colarla en el bloque `data` la deja viajando en los turnos siguientes como
          // si fuera histórico del atleta.
          if (!WRITE_TOOL_NAMES.has(name)) gathered.push(`[${name}(${JSON.stringify(args)})]\n${out}`);
          return out;
        },
        maxRounds: GATHER_MAX_ROUNDS,
        onToken: (tok) => {
          full += tok;
          bubble.innerHTML = mdLite(full);
          els.msgs.scrollTop = els.msgs.scrollHeight;
        },
        // La ronda llevaba herramientas: lo escrito era preámbulo ("voy a mirar tu
        // histórico"), no la respuesta. Se descarta antes de pintar la de verdad.
        onRoundReset: () => { full = ''; },
        onTools: (names) => {
          bubble.innerHTML = `<span class="q-typing">${esc(toolLabel(names))}</span>`;
          els.msgs.scrollTop = els.msgs.scrollHeight;
        },
        // Una escritura termina el turno en la tarjeta: no se pide respuesta después.
        stopAfterTools: () => proposals.length > 0,
        onDone: (info) => { truncated = info.truncated; },
        signal,
      });
      full = res.content || full;
    } else {
      // Informe: el bloque de datos ya viaja en `history` y no hay nada que preguntarle a
      // ninguna herramienta, así que es una sola llamada streameada, sin tools.
      full = await LLM.chatStream({
        messages: [system, ...history],
        onToken: (tok) => {
          bubble.innerHTML = mdLite((full += tok));
          els.msgs.scrollTop = els.msgs.scrollHeight;
        },
        onDone: (info) => { truncated = info.truncated; },
        signal,
      });
    }
    if (gathered.length) {
      convo.push({ role: 'data', content: gathered.join('\n\n') });
      history.push(...toApiMessages([convo[convo.length - 1]]));
    }

    // 2a) Si el modelo pidió crear/editar un plan o registrar un entreno: la app lo
    //     GENERA (JSON-en-contenido, fiable) y muestra la tarjeta de confirmación.
    //     No pasa por el stream normal.
    const writeRequests = proposals.filter(p => p.type === 'program_request' || p.type === 'session_request' || p.type === 'workout_request');
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
          } else if (req.type === 'session_request') {
            bubble.innerHTML = '<span class="q-typing">preparando la sesión…</span>';
            const { session, prose } = await generateSession(db, req, signal);
            proseParts.push(prose);
            built.push({ type: 'session', session, summary: session.desc || '', id: uid(), ts: Date.now() });
          } else {
            bubble.innerHTML = '<span class="q-typing">estructurando el entreno…</span>';
            const { sport, workout, run, prose } = await generateWorkout(db, req, signal);
            proseParts.push(prose);
            built.push({ type: 'workout', sport, workout, run, id: uid() });
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

    // 2b) La respuesta ya viene streameada del bucle de arriba: aquí solo se persiste.
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

// ── Generación de sesiones sueltas (Fase 5.5) ───────────────────────────────
// Una sesión, no un plan: se guarda en db.customSessions y se puede empezar al
// momento. Misma mecánica que el plan (prosa + bloque ```json, validar, 1 reintento),
// con una restricción extra: los nombres de ejercicio deben salir del catálogo,
// porque los que no casan pierden ilustración y consejo en el runner.

const SESSION_SCHEMA_HELP = () => `Forma EXACTA de una sesión (schema de Areté):
{ "name": "Empuje corto", "desc": "una frase con el objetivo", "exercises": [ { "name": "Press de Banca", "sets": 4, "reps": "6", "type": "main", "kg": 70 } ] }
- "sets" numérico; "reps" como texto ("5", "8-10", "F" al fallo, "2min").
- "type": "main" | "assist" | "extra".
- Un bloque HIIT: { "name": "HIIT final", "type": "hiit", "sets": 1, "reps": "Tiempo", "rounds": 3, "rest": "90s", "exercises": [ { "name": "Burpees", "reps": 10 } ] }.
- Modos especiales opcionales en "mode": sets, result, interval, tabata, rounds, ladder, pyramid, amrap, emom, superset. Sin "mode" son series normales.
- Entre 3 y 8 ejercicios. Incluye "kg" objetivo cuando puedas calibrarlo con su e1RM.
- Es UNA sola sesión: nada de semanas, fases ni progresión a varias semanas.
USA EXACTAMENTE estos nombres de ejercicio siempre que exista uno equivalente (los que no estén se quedan sin ilustración ni consejo en la app):
${catalogExerciseNames().join(' · ')}
Devuelve UN solo bloque \`\`\`json, sin texto después.`;

async function generateSession(db, req, signal) {
  const snapshot = buildSnapshot(db, progContext(db));
  const ask = (extra) => [
    buildSystemMessage(snapshot),
    { role: 'user', content: `Prepara UNA sesión de entrenamiento. Objetivo: ${req.goal}.\n\nResponde en DOS partes: (1) 2-3 frases en prosa explicando por qué esta sesión y cómo la has calibrado con mis datos, con nota de seguridad si aplica; (2) un ÚNICO bloque \`\`\`json con la sesión.\n\n${SESSION_SCHEMA_HELP()}${extra || ''}` },
  ];

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = attempt === 0 ? '' : `\n\nEl intento anterior falló: ${lastErr}. Corrígelo y devuelve la sesión completa.`;
    const full = await LLM.chatStream({ messages: ask(extra), maxTokens: 2048, signal });
    const { json, prose } = extractJsonBlock(full);
    if (!json) { lastErr = 'no devolviste un bloque ```json'; continue; }
    let parsed;
    try { parsed = JSON.parse(json); } catch { lastErr = 'el JSON no era parseable'; continue; }
    const session = normalizeSession(parsed);
    const err = validateSession(session);
    if (err) { lastErr = err; continue; }
    // Demasiados nombres fuera del catálogo: la sesión se vería pobre. Un reintento.
    const unknown = unknownExercises(session.exercises);
    if (attempt === 0 && unknown.length && unknown.length >= Math.ceil(session.exercises.length / 2)) {
      lastErr = `estos ejercicios no están en el catálogo: ${unknown.join(', ')}. Sustitúyelos por equivalentes de la lista`;
      continue;
    }
    return { session, prose: prose || 'Te he preparado esta sesión. Puedes empezarla ya o guardarla para luego.' };
  }
  throw new Error(lastErr || 'no se pudo generar una sesión válida');
}

// ── Ingesta de entrenos (Fase 5.1): estructurar texto → workout JSON ─────────

const WORKOUT_SCHEMA_HELP = `Forma EXACTA (JSON). Primero detecta el DEPORTE:
- FUERZA → { "sport": "strength", "date": "YYYY-MM-DD", "session": "nombre corto", "notes": "", "exercises": [ { "name": "Sentadilla", "sets": [ { "kg": "100", "reps": "5" }, { "kg": "100", "reps": "5" } ] } ] }
- CARRERA/RUNNING → { "sport": "running", "date": "YYYY-MM-DD", "session": "nombre corto", "type": "rodaje", "distance": 8.2, "duration": "45:30", "pace": "5:33", "notes": "" }
Reglas fuerza: una entrada por serie en "sets" (si dice "5x5 a 100", son 5 series de kg 100 reps 5). kg y reps como texto; kg "" si es peso corporal.
Reglas running: "distance" en km (decimal). "duration" y "pace" como "mm:ss" o "h:mm:ss". "type" uno de: rodaje, intervalos, tempo, fartlek, cuestas, competicion, libre. Convierte millas a km (1 mi = 1.609 km) si aplica y anótalo en notes.
Sé FIEL a lo que dice el atleta: no inventes. Devuelve UN solo bloque \`\`\`json, sin texto después.`;

// Clasifica un JSON de ingesta como carrera o fuerza y lo valida/normaliza.
// Devuelve { sport, workout } | { sport, run } | { err }.
function classifyIngest(parsed) {
  const isRun = parsed?.sport === 'running'
    || (!Array.isArray(parsed?.exercises) && (parsed?.distance != null || parsed?.duration != null));
  if (isRun) {
    const err = validateRun(parsed);
    return err ? { err } : { sport: 'running', run: normalizeRun(parsed) };
  }
  const err = validateWorkout(parsed);
  return err ? { err } : { sport: 'strength', workout: normalizeWorkout(parsed) };
}

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
    const c = classifyIngest(parsed);
    if (c.err) { lastErr = c.err; continue; }
    return { ...c, prose: prose || 'Entreno listo para revisar.' };
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

const VISION_PROMPT = `Esta es una CAPTURA de una app de registro de entrenamiento (Strong, Hevy, Garmin, Strava u otra). Primero detecta si es FUERZA (pesas, series/reps) o CARRERA (running: distancia, ritmo, tiempo). Extrae el entrenamiento a JSON con la forma que corresponda:

- FUERZA → { "sport": "strength", "date": "YYYY-MM-DD", "session": "nombre corto", "notes": "", "exercises": [ { "name": "Sentadilla", "sets": [ { "kg": "100", "reps": "5" } ] } ] }
- CARRERA → { "sport": "running", "date": "YYYY-MM-DD", "session": "nombre corto", "type": "rodaje", "distance": 8.2, "duration": "45:30", "pace": "5:33", "notes": "" }

Reglas fuerza: una entrada por serie en "sets". kg y reps como texto; kg "" si es peso corporal. Convierte libras a kg si la captura usa lb (1 lb = 0.4536 kg) y anótalo en notes.
Reglas running: "distance" en km (convierte millas si hace falta, 1 mi = 1.609 km). "duration" y "pace" como "mm:ss" o "h:mm:ss". "type" uno de: rodaje, intervalos, tempo, fartlek, cuestas, competicion, libre.
Usa la fecha de la captura si aparece; si no, déjala vacía. Sé FIEL a lo que se ve: no inventes. Responde con una frase breve y luego UN solo bloque \`\`\`json.`;

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
    const c = classifyIngest(parsed);
    if (c.err) { lastErr = c.err; continue; }
    return { ...c, prose: prose || 'He leído la captura. Revisa el entreno antes de guardarlo.' };
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
    const { sport, workout, run, prose } = await ingestFromImage(db, file, abortCtrl.signal);
    bubble.innerHTML = mdLite(prose);
    const p = { type: 'workout', sport, workout, run, id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
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
  // Descartar es una decisión, no un "ocultar": si no se persiste, la propuesta
  // reaparece al reabrir el panel (renderConvo repinta desde la conversación).
  discardBtn.addEventListener('click', () => { p.discarded = true; saveConvo(); card.remove(); });
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

// Tarjeta de una carrera ingerida (Fase 5.1) → va a runningLogs, no a workouts.
function renderRunCard(db, p, msg) {
  const card = document.createElement('div');
  card.className = 'q-proposal';
  const r = p.run;
  const typeLabel = r.type ? r.type.charAt(0).toUpperCase() + r.type.slice(1) : 'Carrera';
  const bits = [];
  if (r.distance) bits.push(`${r.distance} km`);
  if (r.duration) bits.push(formatRunDuration(r.duration));
  if (r.pace) bits.push(`${formatPace(r.pace)} /km`);
  card.innerHTML = `
    <div class="q-prop-head">
      <span class="material-symbols-outlined">directions_run</span>
      <div class="q-prop-titles">
        <div class="q-prop-title">${esc(r.session || typeLabel)}</div>
        <div class="q-prop-tag">Ya hecho · ${esc(r.date)} · ${esc(typeLabel)}</div>
      </div>
    </div>
    ${r.notes ? `<div class="q-prop-summary">${esc(r.notes)}</div>` : ''}
    <div class="q-prop-detail"><div class="q-prop-line">${esc(bits.join(' · ')) || '—'}</div></div>
    <div class="q-prop-actions">
      <button class="btn btn-outline btn-sm q-prop-discard">Descartar</button>
      <button class="btn btn-sm q-prop-apply"></button>
    </div>`;
  wireProposalActions(card, p, 'Registrar', `Carrera registrada — ${r.date} · verla en Running → Historial`,
    () => applyRun(db, r), (t) => undoRun(db, t));
  return card;
}

// Tarjeta de un entreno ingerido (Fase 5.1).
function renderWorkoutCard(db, p, msg) {
  if (p.sport === 'running') return renderRunCard(db, p, msg);
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
        <div class="q-prop-tag">Ya hecho · ${esc(w.date)} · ${w.exercises.length} ejercicio(s)</div>
      </div>
    </div>
    ${w.notes ? `<div class="q-prop-summary">${esc(w.notes)}</div>` : ''}
    <div class="q-prop-detail">${detail}</div>
    <div class="q-prop-actions">
      <button class="btn btn-outline btn-sm q-prop-discard">Descartar</button>
      <button class="btn btn-sm q-prop-apply"></button>
    </div>`;
  wireProposalActions(card, p, 'Registrar', `Entreno registrado — ${w.date} · verlo en Fuerza → Historial`,
    () => applyWorkout(db, w), (t) => undoWorkout(db, t));
  return card;
}

// Tarjeta de una SESIÓN suelta (Fase 5.5). Se distingue de las otras dos por el
// tiempo verbal ("Para hacer" vs "Ya hecho" vs "Plan"), no por el icono, que es
// donde de verdad se confunden. La acción principal es empezarla: guardar es lo
// secundario, porque el atleta que la pide quiere entrenar, no archivar.
function renderSessionCard(db, p, msg) {
  const card = document.createElement('div');
  card.className = 'q-proposal';
  const s = p.session || {};
  const exs = s.exercises || [];
  const detail = exs.map(ex => {
    const target = ex.type === 'hiit'
      ? `${ex.rounds || ''}${ex.rounds ? ' rondas' : 'HIIT'}`
      : `${ex.sets || ''}${ex.sets && ex.reps ? '×' : ''}${ex.reps || ''}${ex.kg ? ` · ${ex.kg} kg` : ''}`;
    return `<div class="q-prop-line">${esc(ex.name)}: ${esc(target)}</div>`;
  }).join('');

  card.innerHTML = `
    <div class="q-prop-head">
      <span class="material-symbols-outlined">bolt</span>
      <div class="q-prop-titles">
        <div class="q-prop-title">${esc(s.name || 'Sesión')}</div>
        <div class="q-prop-tag">Para hacer · ${exs.length} ejercicio(s)</div>
      </div>
    </div>
    ${p.summary ? `<div class="q-prop-summary">${esc(p.summary)}</div>` : ''}
    <button class="q-prop-toggle" type="button">Ver sesión</button>
    <div class="q-prop-detail" hidden>${detail}</div>
    <div class="q-prop-actions q-prop-actions-3">
      <button class="btn btn-outline btn-sm q-prop-discard">Descartar</button>
      <button class="btn btn-outline btn-sm q-prop-save">Guardar para luego</button>
      <button class="btn btn-sm q-prop-start">Empezar ahora</button>
    </div>`;

  card.querySelector('.q-prop-toggle').addEventListener('click', (e) => {
    const d = card.querySelector('.q-prop-detail');
    d.hidden = !d.hidden;
    e.target.textContent = d.hidden ? 'Ver sesión' : 'Ocultar';
  });

  const saveBtn = card.querySelector('.q-prop-save');
  const discardBtn = card.querySelector('.q-prop-discard');
  const paint = () => {
    saveBtn.textContent = p.applied ? '✓ Guardada' : 'Guardar para luego';
    saveBtn.disabled = !!p.applied;
    discardBtn.style.display = p.applied ? 'none' : '';
    card.classList.toggle('applied', !!p.applied);
  };
  paint();
  discardBtn.addEventListener('click', () => { p.discarded = true; saveConvo(); card.remove(); });

  // Guardar es idempotente: la primera vez crea la suelta, después reutiliza su id.
  const ensureSaved = () => {
    if (p.applied && p.sessionId) return p.sessionId;
    const taken = Object.keys(getPrograms()[db.phase]?.sessions || {});
    const { id } = applySessionProposal(db, p.session, { taken, sourceTs: p.ts });
    p.applied = true;
    p.sessionId = id;
    saveConvo();
    paint();
    onProgramsChanged();
    return id;
  };

  saveBtn.addEventListener('click', () => {
    let id;
    try { id = ensureSaved(); } catch (e) { toast('No se pudo guardar: ' + e.message, 'error'); return; }
    toast('Guardada en Fuerza → Plan → Tus sesiones', 'success', {
      action: 'Deshacer',
      onAction: () => {
        undoSessionCommit(db, { id });
        p.applied = false; p.sessionId = null;
        saveConvo(); paint(); onProgramsChanged();
        toast('Sesión descartada', 'info');
      },
    });
  });

  card.querySelector('.q-prop-start').addEventListener('click', () => {
    let id;
    try { id = ensureSaved(); } catch (e) { toast('No se pudo guardar: ' + e.message, 'error'); return; }
    closePanel();
    onStartSession(sessionRef(id), p.session?.name || '');
  });
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
  if (p.type === 'session') return renderSessionCard(db, p, msg);
  if (p.type !== 'program' && !p.program) {
    // Propuesta de una versión que no conocemos (o corrupta): no la interpretamos
    // como plan, que pintaría una tarjeta sin sentido y aplicable.
    const card = document.createElement('div');
    card.className = 'q-proposal';
    card.innerHTML = '<div class="q-prop-summary">Propuesta no reconocida por esta versión de la app.</div>';
    return card;
  }

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
        <div class="q-prop-tag">Plan · ${actionLabel} · ${nPhases} ${isRunning ? 'semanas' : 'fases'}</div>
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

// Quirón dejó de ser un FAB flotante y es un destino de la navegación: la sexta
// entrada del rail en escritorio, la sexta pestaña abajo en móvil. Abrirlo lo
// marca como el destino activo, igual que cualquier otra sección — es lo que
// significa "tener sitio propio" y no "flotar por encima de todo".
//
// Sigue siendo un panel y no una .section porque necesita el alto completo con
// su barra de entrada anclada abajo, y porque se abre desde otras pantallas
// ("Pedir una sesión") sin cambiar de pestaña.
function markNavActive(on) {
  const btn = document.getElementById('navQuiron');
  if (!btn) return;
  if (on) {
    // La pestaña de la sección se apaga visualmente mientras Quirón manda; su
    // estado real no se toca, así que cerrar el panel lo devuelve tal cual.
    document.querySelectorAll('nav button[data-sec].active').forEach(b => b.classList.add('nav-dimmed'));
    btn.classList.add('active');
    btn.setAttribute('aria-current', 'page');
  } else {
    document.querySelectorAll('nav button.nav-dimmed').forEach(b => b.classList.remove('nav-dimmed'));
    btn.classList.remove('active');
    btn.removeAttribute('aria-current');
  }
}

function openPanel() {
  els.panel.classList.add('open');
  document.body.classList.add('quiron-open');
  markNavActive(true);
  showSetupIfNeeded();
  els.msgs.scrollTop = els.msgs.scrollHeight;
}
function closePanel() {
  els.panel.classList.remove('open');
  document.body.classList.remove('quiron-open');
  markNavActive(false);
  document.getElementById('navQuiron')?.focus();
}

// ── Ajustes (proveedor / key / modelo) ──────────────────────────────────────

function fillModelOptions(providerId) {
  const preset = LLM.PROVIDERS.find(p => p.id === providerId);
  els.setModelList.innerHTML = (preset?.models || []).map(m => `<option value="${esc(m)}">`).join('');
}

// El bloque de la demo solo tiene sentido sin clave; el aviso de "estás en la demo",
// solo con ella puesta. Se repinta al guardar y al activar la demo.
function paintDemoUI() {
  const demo = LLM.isDemo();
  if (els.demoPanel) els.demoPanel.hidden = LLM.hasKey();
  if (els.demoOn) els.demoOn.hidden = !demo;
}

// Volcar los ajustes al formulario. Aparte del cableado porque también se llama al
// activar la demo, y repetir los addEventListener dejaría los oyentes duplicados.
function fillSettingsUI() {
  const preset = LLM.currentProvider();
  els.setProvider.value = preset ? preset.id : 'custom';
  els.setBaseUrl.value = LLM.getBaseUrl();
  els.setBaseUrl.readOnly = !!preset;
  // El token de la demo NO se enseña: es nuestro, no algo que el atleta haya escrito o
  // pueda reutilizar. Enseñarlo además invitaba a guardarlo contra otro proveedor, que
  // es exactamente cómo se rompía la demo (401 "API key inválida" a la primera).
  els.setKey.value = LLM.isDemo() ? '' : LLM.getKey();
  els.setModel.value = LLM.getModel();
  els.setVisionModel.value = LLM.getVisionModelSetting();
  fillModelOptions(preset?.id);
  paintDemoUI();
}

function initSettingsUI() {
  fillSettingsUI();
  wireDemoButtons();

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
      const text = await LLM.probeModel({ kind: 'text', baseUrl: els.setBaseUrl.value, key: els.setKey.value, model: els.setModel.value });
      // El slot de visión se prueba aparte y con una llamada multimodal: es la única
      // forma de saber si ese id existe y "ve", en vez de descubrirlo el día que el
      // atleta le hace una foto a su entreno.
      let visionNote = '';
      const visionModel = els.setVisionModel.value.trim() || (LLM.PROVIDERS.find(p => p.baseUrl === els.setBaseUrl.value.trim())?.id === 'nan' ? 'qwen3.6' : '');
      if (visionModel) {
        try {
          await LLM.probeModel({ kind: 'vision', baseUrl: els.setBaseUrl.value, key: els.setKey.value, model: visionModel });
          visionNote = ` · visión ✓ (${visionModel})`;
        } catch (e) {
          visionNote = ` · visión ✗ (${visionModel}): ${e.message}`;
        }
      }
      els.setStatus.textContent = `✓ Conexión correcta (${text.ms} ms)${visionNote}`;
      els.setStatus.className = visionNote.includes('✗') ? 'drive-status' : 'drive-status drive-success';
    } catch (e) {
      els.setStatus.textContent = e.message;
      els.setStatus.className = 'drive-status drive-error';
    } finally {
      els.setTest.disabled = false;
    }
  });
}

function persistSettings() {
  const key = els.setKey.value.trim();
  // Con la demo activa el campo de clave sale vacío a propósito, así que vaciarlo aquí
  // sería borrar el token por el mero hecho de tocar otro campo. Y si además la base URL
  // ya no es la del gateway (el atleta cambió de proveedor sin pegar su clave), lo que
  // NO se puede hacer es mandar el token del gateway a ese proveedor: es un 401 seguro.
  // En ese caso se conserva la demo entera y se avisa.
  const demoIntacta = !key && LLM.isGatewayUrl(els.setBaseUrl.value);
  const demoMovida = !key && !LLM.isGatewayUrl(els.setBaseUrl.value) && LLM.isDemo();
  if (demoMovida) {
    fillSettingsUI();                                  // deshacer el cambio de proveedor
    els.setStatus.className = 'drive-status';
    els.setStatus.textContent = 'Sigues con la demo. Para cambiar de proveedor, pega su clave.';
    return;
  }
  if (!demoIntacta) LLM.setKey(key);
  LLM.setBaseUrl(els.setBaseUrl.value);
  LLM.setModel(els.setModel.value);
  LLM.setVisionModel(els.setVisionModel.value);
  showSetupIfNeeded();
  paintDemoUI();
  renderSettingsIndex(dbRef);   // la fila "Quirón" del índice dice proveedor y modelo
}

// Demo self-service: un botón en Ajustes y otro en la pantalla de bienvenida del chat.
// Los dos hacen lo mismo —pedir token y autoconfigurar— porque los dos son sitios
// donde alguien se topa con "necesitas una API key" por primera vez.
function wireDemoButtons() {
  for (const [btn, out] of [[els.demoBtn, els.demoStatus], [els.setupDemoBtn, els.setupStatus]]) {
    if (!btn || btn.dataset.wired) continue;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      if (out) { out.className = 'drive-status'; out.textContent = 'Creando tu demo…'; }
      try {
        await LLM.requestDemoToken();
        if (out) { out.className = 'drive-status drive-success'; out.textContent = '✓ Listo, ya puedes preguntar'; }
        fillSettingsUI();            // repinta Ajustes con la config puesta
        renderSettingsIndex(dbRef);
        showSetupIfNeeded();         // el chat deja de pedir configuración
      } catch (e) {
        if (out) { out.className = 'drive-status drive-error'; out.textContent = `No se pudo activar la demo: ${e.message}`; }
        btn.disabled = false;
      }
    });
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

export function initQuiron(db, opts = {}) {
  dbRef = db;
  if (typeof opts.onProgramsChanged === 'function') onProgramsChanged = opts.onProgramsChanged;
  if (typeof opts.onStartSession === 'function') onStartSession = opts.onStartSession;
  els = {
    fab: document.getElementById('navQuiron'),
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
    // Demo self-service: bloque de Ajustes + botón de la pantalla de bienvenida.
    demoPanel: document.getElementById('quironDemoPanel'),
    demoBtn: document.getElementById('quironDemoBtn'),
    demoStatus: document.getElementById('quironDemoStatus'),
    demoOn: document.getElementById('quironDemoOn'),
    setupDemoBtn: document.getElementById('quironSetupDemoBtn'),
    setupStatus: document.getElementById('quironSetupStatus'),
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

  // Atajo desde otras pantallas ("Pedir una sesión" en Fuerza → Plan): abre el
  // panel con el prompt escrito, sin acoplar esas vistas a este módulo.
  document.addEventListener('arete:ask-quiron', (e) => {
    openPanel();
    const prompt = e.detail?.prompt;
    if (prompt && !busy) { els.input.value = prompt; autoGrow(); els.input.focus(); }
  });

  // "Configurar" desde el panel del chat aterriza en la subpágina de Quirón, no
  // en el índice de Ajustes: quien pulsa ahí ya sabe a qué va.
  document.getElementById('quironGoSettings').addEventListener('click', () => {
    closePanel();
    document.querySelector('nav button[data-sec="secSettings"]')?.click();
    openSettingsPage('setQuiron');
  });
}
