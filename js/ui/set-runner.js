// ── Runner de sesión de fuerza ───────────────────────────
//
// Antes, el modo `sets` era el único de los once renderizadores que no emitía
// timer: la fuerza no tenía descanso ligado a la serie y había que arrancarlo a
// mano desde la barra global, con scroll arriba y abajo en cada serie.
//
// Este módulo pone encima una hoja a pantalla completa con dos fases —trabajo y
// descanso— que no baja durante la sesión y avanza sola por un índice plano de
// series. Un tap por serie, cero scroll.
//
// INVARIANTE: es una capa de PRESENTACIÓN. La `.sets-grid` sigue siendo la
// fuente de verdad y su DOM no se toca, porque:
//   · saveDraft() guarda los inputs de $exerciseList por índice posicional y
//     restoreDraft() descarta el borrador si la cuenta no cuadra;
//   · saveWorkout() busca con document.querySelector('[data-ex][data-set]').
// Por eso los campos del runner viven FUERA de $exerciseList y NO llevan
// data-ex / data-set / data-field. Cada edición hace writeBack() al input real.

import { esc } from '../utils.js';
import { beep, vibrate } from './audio.js';
import { exFmtTime } from './training-timer.js';
import { pictHtml, tipFor } from './exercise-pict.js';

// Descanso por familia de ejercicio. Son solo el punto de partida: los botones
// ±30s de la hoja guardan el valor ajustado, así que la app aprende tu ritmo en
// vez de obligarte a corregir en cada serie.
const DEFAULT_REST = { main: 120, assist: 90, kb: 60 };
const REST_KEY = 'arete_restPrefs';

function loadRestPrefs() {
  try { return { ...DEFAULT_REST, ...JSON.parse(localStorage.getItem(REST_KEY) || '{}') }; }
  catch { return { ...DEFAULT_REST }; }
}
let restPrefs = loadRestPrefs();

/** Familia a la que pertenece un ejercicio, para agrupar su descanso. */
function restFamily(ex) {
  const name = (ex?.name || '').toLowerCase();
  if (/kettlebell|\bkb\b|swing|turco|snatch|clean/.test(name)) return 'kb';
  return ex?.type === 'assist' ? 'assist' : 'main';
}

function rememberRest(ex, seconds) {
  if (ex?.rest) return;                    // el plan manda: no se sobrescribe
  restPrefs[restFamily(ex)] = seconds;
  try { localStorage.setItem(REST_KEY, JSON.stringify(restPrefs)); } catch { /* quota */ }
}

let sheet = null;          // elemento de la hoja
let sets = [];             // lista plana [{ex, exIdx, setIdx, name, rest}]
let idx = 0;
let phase = 'work';        // 'work' | 'rest'
let restLeft = 0, restTotal = 0, restTimer = null, restEndsAt = 0;
let lastBeep = -1;
let wakeLock = null;
let onDirty = null;        // avisa a training.js para que persista el borrador

// ── wake lock ────────────────────────────────────────────
async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* sin soporte o denegado */ }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

// ── descanso por tipo de ejercicio ───────────────────────
export function restForExercise(ex) {
  if (ex?.rest) return ex.rest;            // lo que diga el plan gana siempre
  return restPrefs[restFamily(ex)] ?? restPrefs.main;
}

// ── acceso a la grid real ────────────────────────────────
function input(exIdx, setIdx, field) {
  return document.querySelector(
    `#exerciseList input[data-ex="${exIdx}"][data-set="${setIdx}"][data-field="${field}"]`);
}
function label(exIdx, setIdx) {
  return document.querySelector(
    `#exerciseList .set-label[data-ex="${exIdx}"][data-set="${setIdx}"]`);
}
function isDone(exIdx, setIdx) {
  return !!label(exIdx, setIdx)?.classList.contains('set-done');
}

/** Escribe en el input real: la grid manda, el runner solo la refleja. */
function writeBack(n, kg, reps) {
  const s = sets[n];
  if (!s) return;
  const k = input(s.exIdx, s.setIdx, 'kg');
  const r = input(s.exIdx, s.setIdx, 'reps');
  if (k) { k.value = kg; k.classList.remove('prefilled'); }
  if (r) { r.value = reps; r.classList.remove('prefilled'); }
  onDirty?.();
}

// ── construcción de la lista plana ───────────────────────
/** Solo entran los ejercicios en modo `sets`; el resto los gobierna su timer. */
export function buildSetList(exercises) {
  const out = [];
  (exercises || []).forEach((ex, exIdx) => {
    const mode = ex.mode || (ex.type === 'hiit' || ex.type === 'density' ? 'result' : 'sets');
    if (mode !== 'sets') return;
    for (let s = 0; s < (ex.sets || 0); s++) {
      out.push({ ex, exIdx, setIdx: s, name: ex.name, rest: restForExercise(ex) });
    }
  });
  return out;
}

/** Primera serie sin marcar; -1 si están todas hechas. */
function firstPending() {
  return sets.findIndex(s => !isDone(s.exIdx, s.setIdx));
}

// ── plantilla ────────────────────────────────────────────
function ensureSheet() {
  // isConnected, no solo la referencia: si el nodo se desprendió del documento
  // seguiríamos escribiendo en un árbol huérfano y el runner no pintaría nada.
  if (sheet?.isConnected) return sheet;
  sheet = document.createElement('div');
  sheet.className = 'set-runner';
  sheet.id = 'setRunner';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Sesión en curso');
  sheet.innerHTML = `
    <div class="sr-top"><span class="sr-ex"></span><span class="sr-pos"></span></div>
    <div class="sr-progress"></div>
    <div class="sr-phase sr-work">
      <div class="sr-illus"></div>
      <div class="sr-name"></div>
      <div class="sr-load">
        <label><input class="sr-in sr-kg" type="number" step="0.5" inputmode="decimal" aria-label="Peso en kilos"><span>kg</span></label>
        <span class="sr-x">×</span>
        <label><input class="sr-in sr-reps" type="text" inputmode="numeric" aria-label="Repeticiones"><span>reps</span></label>
      </div>
      <div class="sr-prev"></div>
    </div>
    <div class="sr-phase sr-rest">
      <div class="sr-ring">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle class="sr-track" cx="120" cy="120" r="106"/>
          <circle class="sr-prog" cx="120" cy="120" r="106"/>
        </svg>
        <div class="sr-ring-mid">
          <div class="sr-time" role="timer" aria-live="off">0:00</div>
          <div class="sr-lbl">Descanso</div>
        </div>
      </div>
      <div class="sr-adj">
        <button type="button" class="sr-adj-btn" data-adj="-30">−30s</button>
        <button type="button" class="sr-adj-btn" data-adj="30">+30s</button>
      </div>
      <div class="sr-did">
        <div class="sr-did-who"><div class="sr-did-k">Acabas de hacer</div><div class="sr-did-v"></div></div>
        <input class="sr-did-in sr-did-kg" type="number" step="0.5" inputmode="decimal" aria-label="Corregir peso">
        <span class="sr-did-x">×</span>
        <input class="sr-did-in sr-did-reps" type="text" inputmode="numeric" aria-label="Corregir repeticiones">
      </div>
      <div class="sr-tip"></div>
      <div class="sr-next"></div>
    </div>
    <button type="button" class="sr-cta"></button>
    <button type="button" class="sr-sub">Ver sesión completa</button>`;
  document.body.appendChild(sheet);
  bindSheet();
  return sheet;
}

const $ = sel => sheet.querySelector(sel);

// ── pintado ──────────────────────────────────────────────
const RING_C = 2 * Math.PI * 106;

function paintProgress() {
  $('.sr-progress').innerHTML = sets.map((s, n) => {
    const cls = isDone(s.exIdx, s.setIdx) ? 'd' : (n === idx ? 'a' : '');
    return `<i class="${cls}"></i>`;
  }).join('');
}

function paintRing() {
  const pct = restTotal ? Math.max(restLeft, 0) / restTotal : 0;
  const prog = $('.sr-prog');
  prog.style.strokeDasharray = RING_C;
  prog.style.strokeDashoffset = RING_C * (1 - pct);
  $('.sr-time').textContent = exFmtTime(Math.max(restLeft, 0));
  $('.sr-ring').classList.toggle('ending', restLeft <= 0);
}

function setPhase(p) {
  phase = p;
  sheet.classList.toggle('is-work', p === 'work');
  sheet.classList.toggle('is-rest', p === 'rest');
}

function showWork(n) {
  stopRest();
  idx = n;
  const s = sets[n];
  if (!s) return finish();
  $('.sr-ex').innerHTML = pictHtml(s.name) + esc(s.name);
  $('.sr-pos').textContent = `Serie ${s.setIdx + 1} de ${s.ex.sets}`;
  $('.sr-illus').innerHTML = pictHtml(s.name, 'lg');
  $('.sr-name').textContent = s.name;
  // se arranca del valor que ya tenga la grid (prefill o borrador)
  $('.sr-kg').value = input(s.exIdx, s.setIdx, 'kg')?.value || '';
  $('.sr-reps').value = input(s.exIdx, s.setIdx, 'reps')?.value || s.ex.reps || '';
  const prevK = input(s.exIdx, s.setIdx, 'kg')?.placeholder || '';
  const prevR = input(s.exIdx, s.setIdx, 'reps')?.placeholder || '';
  $('.sr-prev').textContent = (prevK && prevK !== '—')
    ? `La última vez: ${prevK} × ${prevR}` : '';
  const cta = $('.sr-cta');
  cta.textContent = 'Serie hecha ✓';
  cta.classList.remove('ready');
  setPhase('work');
  paintProgress();
}

function showRest(n) {
  const s = sets[n];
  restTotal = restLeft = s.rest;
  restEndsAt = Date.now() + restLeft * 1000;
  lastBeep = -1;
  $('.sr-pos').textContent = `Serie ${s.setIdx + 1} de ${s.ex.sets} ✓`;
  $('.sr-did-v').textContent = `${s.name} · S${s.setIdx + 1}`;
  $('.sr-did-kg').value = $('.sr-kg').value;
  $('.sr-did-reps').value = $('.sr-reps').value;
  $('.sr-tip').textContent = tipFor(s.name);
  const nx = sets[n + 1];
  $('.sr-next').innerHTML = nx
    ? `Siguiente: <b>${esc(nx.name)} · S${nx.setIdx + 1}</b>`
    : '<b>Era la última serie</b>';
  const cta = $('.sr-cta');
  cta.textContent = 'Saltar descanso';
  cta.classList.remove('ready');
  setPhase('rest');
  paintRing();
  paintProgress();
  vibrate(35);
  restTimer = setInterval(tickRest, 250);
}

// El tiempo se calcula contra un instante absoluto, no acumulando ticks: así
// no hay drift si el navegador estrangula el intervalo en segundo plano.
function tickRest() {
  restLeft = Math.max(0, Math.round((restEndsAt - Date.now()) / 1000));
  paintRing();
  if (restLeft <= 3 && restLeft > 0 && restLeft !== lastBeep) {
    lastBeep = restLeft;
    beep(660 + (3 - restLeft) * 220, 100);
  }
  if (restLeft <= 0) {
    stopRest();
    beep(1200, 150);
    setTimeout(() => beep(1200, 150), 200);
    vibrate([200, 100, 200]);
    if (sets[idx + 1]) showWork(idx + 1); else finish();
  }
}

/** Confirma que el ajuste queda guardado; si no, parece que solo afecta a esta serie. */
function announceRest(seconds) {
  const el = $('.sr-lbl');
  if (!el) return;
  el.textContent = `Descanso · ${exFmtTime(seconds)} guardado`;
  clearTimeout(announceRest._t);
  announceRest._t = setTimeout(() => { el.textContent = 'Descanso'; }, 2200);
}

function stopRest() {
  if (restTimer) { clearInterval(restTimer); restTimer = null; }
}

function markDone() {
  const s = sets[idx];
  writeBack(idx, $('.sr-kg').value, $('.sr-reps').value);
  const l = label(s.exIdx, s.setIdx);
  if (l && !l.classList.contains('set-done')) l.click();  // reusa el marcado real
  if (sets[idx + 1]) showRest(idx);
  else finish();
}

function finish() {
  stopRest();
  close();
}

// ── ciclo de vida ────────────────────────────────────────
export function isRunnerOpen() {
  return !!sheet && sheet.classList.contains('up');
}

export function openRunner(n) {
  if (!sets.length) return;
  ensureSheet();
  const start = Number.isInteger(n) ? n : Math.max(firstPending(), 0);
  sheet.classList.add('up');
  document.body.classList.add('session-focus');
  acquireWakeLock();
  showWork(start);
}

export function close() {
  stopRest();
  releaseWakeLock();
  if (!sheet) return;
  sheet.classList.remove('up');
  document.body.classList.remove('session-focus');
}

/**
 * Prepara el runner para una sesión. Debe llamarse tras cada render de la lista.
 * @param {Array}    exercises  ejercicios de la sesión
 * @param {Function} dirty      callback para persistir el borrador
 */
export function prepareRunner(exercises, dirty) {
  sets = buildSetList(exercises);
  onDirty = dirty;
  if (isRunnerOpen()) close();
}

export function hasSets() { return sets.length > 0; }

// ── eventos ──────────────────────────────────────────────
function bindSheet() {
  $('.sr-cta').addEventListener('click', () => {
    if (phase === 'work') markDone();
    else if (sets[idx + 1]) showWork(idx + 1);
    else finish();
  });
  $('.sr-sub').addEventListener('click', () => {
    stopRest();
    releaseWakeLock();
    sheet.classList.remove('up');
    document.body.classList.remove('session-focus');
  });
  sheet.querySelectorAll('.sr-adj-btn').forEach(b => {
    b.addEventListener('click', () => {
      const d = parseInt(b.dataset.adj, 10);
      restLeft = Math.max(0, restLeft + d);
      restEndsAt = Date.now() + restLeft * 1000;
      restTotal = Math.max(restTotal, restLeft);
      paintRing();
      // el ajuste se recuerda para toda la familia: si alargas el descanso de
      // un básico, los básicos siguientes ya salen con ese valor
      const ajustado = Math.max(0, sets[idx].rest + d);
      sets.forEach(s => { if (restFamily(s.ex) === restFamily(sets[idx].ex) && !s.ex.rest) s.rest = ajustado; });
      rememberRest(sets[idx].ex, ajustado);
      announceRest(ajustado);
    });
  });
  // corregir la serie recién hecha sin volver a la lista
  ['.sr-did-kg', '.sr-did-reps'].forEach(sel => {
    $(sel).addEventListener('change', () => {
      writeBack(idx, $('.sr-did-kg').value, $('.sr-did-reps').value);
    });
  });
  // Escape cierra, como cualquier diálogo
  sheet.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); $('.sr-sub').click(); }
  });
}
