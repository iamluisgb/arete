import { saveDB, getSaveRevision } from '../data.js';
import { ROMAN } from '../constants.js';
import { getPrograms, getActiveProgram, getAllPhases } from '../programs.js';
import { listCustomSessions, getCustomSession, isSessionRef, refToId, sessionRef, touchCustomSession } from '../sessions.js';
import { esc, formatDateShort, phaseChipLabel } from '../utils.js';
import { toast } from './toast.js';
import { exFmtTime, parseDurationStr, buildTimerConfig, initExTimerEvents, stopExTimer, isExTimerActive } from './training-timer.js';
import { prepareRunner, openRunner, isRunnerOpen, hasSets, close as closeRunner } from './set-runner.js';
import { pictHtml } from './exercise-pict.js';

// Re-export for tests
export { exFmtTime, parseDurationStr, buildTimerConfig };

let editingId = null;
let _formExpanded = false;
let $exerciseList, $trainSession, $trainDate, $trainNotes, $prefillBanner, $prefillText, $saveBtn, $prCelebration, $prList, $sessionOverview;

// ── Referencias de sesión ────────────────────────────────
// El valor del <select> es el NOMBRE si la sesión viene del plan, y `cs:<id>` si
// es una suelta. Todo lo que antes leía `progs[db.phase].sessions[valor]` pasa por
// aquí, para que una suelta se comporte igual sin ser una fase.
//
// `_editSpec` cubre el caso en que se edita un entreno cuya suelta ya no existe:
// el workout se guardó con su especificación copiada (w.spec) y esa manda.
let _editSpec = null;

/** @returns {{name:string, exercises:Array, customId:?string}|null} */
export function resolveSession(db, ref) {
  if (isSessionRef(ref)) {
    const s = getCustomSession(db, refToId(ref));
    if (s) return { name: s.name, exercises: s.exercises, customId: s.id };
    // Suelta borrada: solo se puede resolver desde la copia del entreno en edición.
    return _editSpec && _editSpec.ref === ref ? _editSpec : null;
  }
  const exercises = getPrograms()[db.phase]?.sessions?.[ref];
  return exercises ? { name: ref, exercises, customId: null } : null;
}

/** Sesión seleccionada ahora mismo en el formulario */
function currentSession(db) {
  return resolveSession(db, $trainSession?.value);
}

// ── Session draft auto-save ──────────────────────────────
const DRAFT_KEY = 'arete_sessionDraft';
let _draftTimer = null;

function saveDraft() {
  if (editingId) return; // don't draft when editing existing
  const inputs = $exerciseList?.querySelectorAll('input');
  if (!inputs?.length) return;
  const values = [];
  let hasData = false;
  inputs.forEach(inp => {
    values.push(inp.value);
    if (inp.value && !inp.classList.contains('prefilled')) hasData = true;
  });
  // Collect set-done checks
  const checks = [];
  $exerciseList.querySelectorAll('.set-label.set-done').forEach(l => {
    checks.push({ ex: l.dataset.ex, set: l.dataset.set });
  });
  if (!hasData && !checks.length) { localStorage.removeItem(DRAFT_KEY); return; }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      session: $trainSession.value,
      date: $trainDate.value,
      notes: $trainNotes.value,
      values,
      checks,
      ts: Date.now()
    }));
  } catch { /* quota */ }
}

function scheduleDraft() {
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(saveDraft, 500);
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  clearTimeout(_draftTimer);
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    // Discard drafts older than 12 hours
    if (Date.now() - draft.ts > 12 * 60 * 60 * 1000) { clearDraft(); return false; }
    if (draft.session !== $trainSession.value) return false;
    const inputs = $exerciseList.querySelectorAll('input');
    if (inputs.length !== draft.values.length) return false;
    draft.values.forEach((v, i) => {
      if (v) { inputs[i].value = v; inputs[i].classList.remove('prefilled'); }
    });
    if (draft.notes) $trainNotes.value = draft.notes;
    if (draft.date) $trainDate.value = draft.date;
    // Restore set-done checks
    if (draft.checks?.length) {
      draft.checks.forEach(({ ex, set }) => {
        const label = $exerciseList.querySelector(`.set-label[data-ex="${ex}"][data-set="${set}"]`);
        if (label) _markSetDone(label);
      });
    }
    return true;
  } catch { return false; }
}



function cacheSelectors() {
  if ($trainSession) return;
  $exerciseList = document.getElementById('exerciseList');
  $trainSession = document.getElementById('trainSession');
  $trainDate = document.getElementById('trainDate');
  $trainNotes = document.getElementById('trainNotes');
  $prefillBanner = document.getElementById('prefillBanner');
  $prefillText = document.getElementById('prefillText');
  $saveBtn = document.getElementById('saveWorkoutBtn');
  $prCelebration = document.getElementById('prCelebration');
  $prList = document.getElementById('prList');
  $sessionOverview = document.getElementById('sessionOverview');
}

function clearEditState() {
  if (!editingId) return;
  editingId = null;
  $saveBtn.textContent = 'Guardar sesión';
  $saveBtn.style.background = '';
}

/** Populate session select dropdowns based on active phase */
export function populateSessions(db, opts = {}) {
  cacheSelectors();
  const progs = getPrograms();
  if (!progs[db.phase]) { db.phase = parseInt(Object.keys(progs)[0]) || 1; }
  const ss = Object.keys(progs[db.phase].sessions);
  const customs = listCustomSessions(db);
  const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;

  // Las sueltas van en su propio grupo: no son parte del plan y no deben
  // parecerlo. El <optgroup> lo separa sin inventar una fase.
  $trainSession.innerHTML = ss.map(s => opt(s, s)).join('')
    + (customs.length ? `<optgroup label="Tus sesiones">${customs.map(s => opt(sessionRef(s.id), s.name)).join('')}</optgroup>` : '');
  // El historial filtra por NOMBRE de sesión (los entrenos guardan el nombre).
  document.getElementById('historyFilter').innerHTML = '<option value="">Todas</option>'
    + ss.map(s => opt(s, s)).join('')
    + (customs.length ? `<optgroup label="Tus sesiones">${customs.map(s => opt(s.name, s.name)).join('')}</optgroup>` : '');

  const prog = getActiveProgram();
  const lastW = db.workouts.filter(w => !w.sessionId && w.phase === db.phase && (w.program || 'arete') === prog).sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (lastW && ss.length > 1) {
    const lastIdx = ss.indexOf(lastW.session);
    const nextIdx = (lastIdx + 1) % ss.length;
    $trainSession.value = ss[nextIdx];
  }
  // Una selección explícita (venir de una propuesta o del Plan) manda sobre la rotación.
  if (opts.select && [...$trainSession.options].some(o => o.value === opts.select)) {
    $trainSession.value = opts.select;
  }
  _formExpanded = !!opts.expand;
  loadSessionTemplate(db, true);
  // Restore draft if there's one saved for the current session (only when form shown)
  if (_formExpanded && restoreDraft()) toast('Borrador restaurado', 'info');
}

/**
 * Borrador vivo (<12 h) si lo hay, con el nombre legible de su sesión. Sirve para
 * no tirar a la basura un entreno a medias al saltar a otra sesión.
 * @returns {{ref:string, name:string, ts:number}|null}
 */
export function getLiveDraft(db) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d?.session || Date.now() - d.ts > 12 * 60 * 60 * 1000) return null;
    return { ref: d.session, name: resolveSession(db, d.session)?.name || d.session, ts: d.ts };
  } catch { return null; }
}

/** Descarta el borrador actual (lo usa el aviso al saltar de sesión). */
export function discardDraft() { clearDraft(); }

/**
 * Inicia una sesión protegiendo el entreno a medias. El borrador es una sola
 * ranura: saltar a otra sesión y guardarla lo borraba en silencio, y el salto más
 * probable es justo ese (preguntarle algo a Quirón en mitad del entreno).
 * @param {string} ref        nombre del plan o `cs:<id>`
 * @param {?number} phaseKey  fase de la sesión del plan (null en sueltas)
 * @param {Object} opts       { onStarted } — p. ej. cambiar a la pestaña Entrenar
 */
export function requestStartSession(db, ref, phaseKey, opts = {}) {
  cacheSelectors();
  const start = () => { selectAndStartSession(ref, phaseKey, db); opts.onStarted?.(); };
  const draft = getLiveDraft(db);
  if (!draft || draft.ref === ref) { start(); return; }

  const target = resolveSession(db, ref)?.name || ref;
  const mins = Math.round((Date.now() - draft.ts) / 60000);
  const ago = mins < 60 ? `hace ${mins} min` : `hace ${Math.round(mins / 60)} h`;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `<div class="modal">
    <h3>Tienes un entreno a medias</h3>
    <p class="draft-guard-text">Empezaste <strong>${esc(draft.name)}</strong> ${ago}. Si empiezas <strong>${esc(target)}</strong> ahora, ese borrador se pierde.</p>
    <div class="draft-guard-actions">
      <button class="btn" data-act="resume">Seguir con ${esc(draft.name)}</button>
      <button class="btn btn-outline" data-act="switch">Empezar ${esc(target)}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act && e.target !== overlay) return;
    overlay.remove();
    if (act === 'switch') { clearDraft(); start(); }
    else if (act === 'resume') {
      populateSessions(db, { select: draft.ref, expand: true });
      opts.onStarted?.();
    }
  });
}

// ── Exercise scroll spy dots ─────────────────────────────
let _exObserver = null;

function _setupExDots(count) {
  const $dots = document.getElementById('exerciseDots');
  if (!$dots) return;
  if (count < 3) { $dots.classList.remove('visible'); return; }
  $dots.innerHTML = Array.from({ length: count }, (_, i) =>
    // <button>, no <span>: es navegación entre ejercicios y tiene que existir
    // para el teclado y ser un objetivo de clic de verdad (el punto sigue
    // midiendo 8px, el área de pulsación 24).
    `<button type="button" class="ex-dot" data-dot="${i}" aria-label="Ir al ejercicio ${i + 1}"></button>`
  ).join('');
  $dots.classList.add('visible');

  // Click to scroll — se enlaza UNA vez: se re-renderiza en cada sesión y antes
  // acumulaba un listener por render.
  if (!$dots.dataset.bound) {
    $dots.dataset.bound = '1';
    $dots.addEventListener('click', (e) => {
      const dot = e.target.closest('.ex-dot');
      if (!dot) return;
      const card = $exerciseList.children[parseInt(dot.dataset.dot)];
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // IntersectionObserver
  if (_exObserver) _exObserver.disconnect();
  _exObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = Array.from($exerciseList.children).indexOf(entry.target);
        if (idx >= 0) {
          $dots.querySelectorAll('.ex-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
        }
      }
    });
  }, { threshold: 0.5 });
  Array.from($exerciseList.children).forEach(card => _exObserver.observe(card));
}

export function exTargetText(ex) {
  const mode = ex.mode || (ex.type === 'hiit' || ex.type === 'density' ? 'result' : 'sets');
  if (mode === 'sets') return `${ex.sets}×${ex.reps}`;
  if (mode === 'superset') return `${ex.sets || ex.rounds || ''}× superset`;
  if (mode === 'interval') return `${ex.intervals || ''}× intervalos`;
  if (mode === 'tabata') return 'Tabata';
  if (mode === 'rounds') return `${ex.rounds || ''}× rondas`;
  if (mode === 'ladder') return 'Escalera';
  if (mode === 'pyramid') return 'Pirámide';
  if (mode === 'amrap') return `AMRAP ${ex.duration || ''}`;
  if (mode === 'emom') return `EMOM ${ex.duration || ''}`;
  if (ex.type === 'hiit') return 'HIIT';
  if (ex.type === 'density') return 'Densidad';
  return ex.reps || '';
}

function setFormVisible(show) {
  const timerBar = document.getElementById('timerBar');
  const miniTimer = document.getElementById('miniTimer');
  const dots = document.getElementById('exerciseDots');
  const saveBar = document.getElementById('saveBar');
  const runnerBtn = document.getElementById('startRunnerBtn');
  [timerBar, miniTimer, $prefillBanner, dots, $exerciseList, saveBar, runnerBtn].forEach(el => {
    if (el) el.style.display = show ? '' : 'none';
  });
  if (!show && isRunnerOpen()) closeRunner();
  if ($sessionOverview) $sessionOverview.style.display = show ? 'none' : '';
}

function renderSessionOverview(db, sess, exercises) {
  const session = sess.name;
  const prev = getPrevSession(db, sess);
  const hasDraft = (() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return d.session === $trainSession.value && Date.now() - d.ts < 12 * 60 * 60 * 1000;
    } catch { return false; }
  })();

  const lastDate = prev ? formatDateShort(prev.date) : null;
  const btnText = hasDraft ? 'Continuar entreno' : 'Empezar entreno';

  let draftInfo = '';
  if (hasDraft) {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      const ago = Math.round((Date.now() - d.ts) / 60000);
      const agoText = ago < 60 ? `hace ${ago}min` : `hace ${Math.round(ago / 60)}h`;
      draftInfo = `<div class="so-draft">Borrador guardado ${agoText}</div>`;
    } catch { /* */ }
  }

  $sessionOverview.innerHTML = `
    <div class="session-overview-card">
      <div class="so-header">
        <span class="so-name">${esc(session)}</span>
        <span class="so-count">${sess.customId ? 'Tu sesión · ' : ''}${exercises.length} ejercicios</span>
      </div>
      <div class="so-list">${exercises.map(ex => {
        if (ex.type === 'hiit' && ex.exercises && ex.exercises.length > 0) {
          const subList = ex.exercises.map(e => {
            const repsLabel = e.duration ? e.duration : (e.perSide ? `${e.reps} c/lado` : `${e.reps}`);
            return `<div class="so-hiit-ex"><span>${esc(e.name)}</span><span>${repsLabel}</span></div>`;
          }).join('');
          const roundsLabel = ex.rounds ? `${ex.rounds} rondas` : 'HIIT';
          return `<div class="so-ex so-ex-hiit">
            <div class="so-ex-hiit-header"><span class="so-ex-name">${esc(ex.name)}</span><span class="so-ex-target">${roundsLabel}</span></div>
            <div class="so-hiit-list">${subList}</div>
          </div>`;
        }
        return `<div class="so-ex"><span class="so-ex-name">${esc(ex.name)}</span><span class="so-ex-target">${exTargetText(ex)}</span></div>`;
      }).join('')}</div>
      ${lastDate ? `<div class="so-last">Última vez: ${lastDate}</div>` : ''}
      ${draftInfo}
      <button class="btn btn--block so-start">${btnText}</button>
    </div>`;

  $sessionOverview.querySelector('.so-start').addEventListener('click', () => {
    _formExpanded = true;
    loadSessionTemplate(db, true);
    if (hasDraft && restoreDraft()) toast('Borrador restaurado', 'info');
  });
}

/** Render exercise cards for the selected session template */
export function loadSessionTemplate(db, autoPrefill) {
  if (isExTimerActive()) stopExTimer(false);
  clearEditState();
  const ref = $trainSession.value;
  const sess = resolveSession(db, ref);
  if (!sess) return;
  const { name: session, exercises } = sess;

  // Show overview if form not yet expanded and not editing
  const hasDraft = (() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return d.session === ref && Date.now() - d.ts < 12 * 60 * 60 * 1000;
    } catch { return false; }
  })();

  if (!_formExpanded && !editingId && !hasDraft && $sessionOverview) {
    renderSessionOverview(db, sess, exercises);
    setFormVisible(false);
    return;
  }

  setFormVisible(true);
  const prev = getPrevSession(db, sess);
  const shouldPrefill = autoPrefill && prev;

  if (shouldPrefill) {
    const prevDate = formatDateShort(prev.date);
    $prefillText.textContent = `📋 Cargada tu última ${session} (${prevDate})`;
    $prefillBanner.style.display = 'flex';
  } else {
    $prefillBanner.style.display = 'none';
  }

  $exerciseList.innerHTML = exercises.map((ex, i) => {
    const prevEx = prev ? prev.exercises[i] : null;
    const mode = ex.mode || (ex.type === 'hiit' || ex.type === 'density' ? 'result' : 'sets');
    switch (mode) {
      case 'sets': return renderSetsCard(ex, i, prevEx, shouldPrefill, db);
      case 'result': return renderResultCard(ex, i, prevEx, shouldPrefill, ex.type, db);
      case 'interval': return renderIntervalCard(ex, i, prevEx, shouldPrefill);
      case 'tabata': return renderTabataCard(ex, i, prevEx, shouldPrefill);
      case 'rounds': return renderRoundsCard(ex, i, prevEx, shouldPrefill);
      case 'workout': return renderWorkoutCard(ex, i, prevEx, shouldPrefill, db);
      case 'ladder': return renderLadderCard(ex, i, prevEx, shouldPrefill);
      case 'pyramid': return renderPyramidCard(ex, i, prevEx, shouldPrefill);
      case 'amrap': return renderAmrapCard(ex, i, prevEx, shouldPrefill);
      case 'emom': return renderEmomCard(ex, i, prevEx, shouldPrefill);
      case 'superset': return renderSupersetCard(ex, i, prevEx, shouldPrefill);
      default: return renderResultCard(ex, i, prevEx, shouldPrefill, ex.type);
    }
  }).join('');
  _setupExDots(exercises.length);

  // El runner es una capa encima de esta lista: se prepara tras cada render,
  // pero solo se abre por acción explícita — nunca al editar un entreno pasado.
  prepareRunner(exercises, scheduleDraft, {
    summary: () => buildSessionSummary(db),
    save: () => saveWorkout(db, { fromRunner: true }),
  });
  _renderRunnerCta();
}

/** Botón para entrar al runner. Oculto al editar y si la sesión no tiene series. */
function _renderRunnerCta() {
  let btn = document.getElementById('startRunnerBtn');
  if (editingId || !hasSets()) { btn?.remove(); return; }
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'startRunnerBtn';
    btn.className = 'start-runner-btn';
    btn.addEventListener('click', () => openRunner());
    $exerciseList.insertAdjacentElement('beforebegin', btn);
  }
  // "Modo guiado", no "Empezar sesión": la vista previa ya tiene un "Empezar
  // entreno" y encadenar dos botones con casi el mismo texto no dice que hagan
  // cosas distintas. Cargar la sesión y recorrerla serie a serie no son el
  // mismo verbo, y el runner es lo segundo.
  const done = $exerciseList.querySelectorAll('.set-label.set-done').length;
  btn.textContent = done ? 'Seguir en modo guiado' : 'Modo guiado';
}

function timerBtnHtml(i, mode) {
  return `<button class="ex-timer-btn" data-ex-timer="${i}" data-timer-mode="${mode}">▶ Iniciar timer</button><div class="ex-timer-zone" data-ex="${i}"></div>`;
}

function renderSetsCard(ex, i, prevEx, shouldPrefill, db) {
  let sh = `<div class="sets-grid"><div></div><div class="sets-header">Kg</div><div class="sets-header">Reps</div>`;
  for (let s = 0; s < ex.sets; s++) {
    const pK = prevEx?.sets[s]?.kg ?? '';
    const pR = prevEx?.sets[s]?.reps ?? '';
    const vK = shouldPrefill && pK ? pK : '';
    const vR = shouldPrefill && pR ? pR : '';
    const cK = vK ? ' prefilled' : '';
    const cR = vR ? ' prefilled' : '';
    const activeClass = s === 0 ? ' active-set' : '';
    sh += `<button type="button" class="set-label${activeClass}" data-ex="${i}" data-set="${s}">S${s + 1}</button><input type="number" class="${cK}" data-ex="${i}" data-set="${s}" data-field="kg" placeholder="${pK || '—'}" value="${vK}" step="0.5" aria-label="Peso serie ${s + 1} de ${esc(ex.name)}" autocomplete="off" inputmode="decimal"><input type="text" class="${cR}" data-ex="${i}" data-set="${s}" data-field="reps" placeholder="${pR || ex.reps}" value="${vR}" inputmode="numeric" aria-label="Reps serie ${s + 1} de ${esc(ex.name)}" autocomplete="off">`;
  }
  sh += '</div>';
  let pi = '';
  if (prevEx) {
    const prevStr = prevEx.sets.map(s => `<span>${s.kg || '—'}×${s.reps || '—'}</span>`).join(' · ');
    const isRepsOnly = db && prevEx.sets.every(s => !s.kg || s.kg === '');
    const badge = isRepsOnly && db ? _prevBadgeHtml(
      prevEx.sets.map(s => `×${s.reps || 0}`).join('·'),
      getExerciseBestReps(db, ex.name),
      false
    ) : '';
    pi = `<div class="prev-data">Anterior: ${prevStr}${badge}</div>`;
  }
  return `<div class="ex-card"><div class="ex-name">${pictHtml(ex.name, 'sm')}${esc(ex.name)}</div><div class="ex-target">${ex.sets}×${ex.reps}${ex.type === 'extra' ? ' (extra)' : ''}</div>${sh}${pi}</div>`;
}

function renderResultCard(ex, i, prevEx, shouldPrefill, exType, db) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevEx.sets[0]?.reps || '—'}</span></div>` : '';

  if (exType === 'hiit' && ex.exercises && ex.exercises.length > 0) {
    const roundsLabel = ex.rounds ? `${ex.rounds} rondas` : '';
    const restLabel = ex.rest && ex.rest !== '0s' ? ` · Desc: ${ex.rest}` : '';
    const exList = ex.exercises.map(e => {
      const repsLabel = e.duration ? e.duration : (e.perSide ? `${e.reps} c/lado` : `${e.reps}`);
      return `<div class="round-item"><span class="ri-name">${esc(e.name)}</span><span class="ri-reps">${repsLabel}</span></div>`;
    }).join('');
    const prevRaw = prevEx?.sets[0]?.reps || '';
    const hiitBadge = prevRaw && db ? _prevBadgeHtml(prevRaw, getExerciseBestTime(db, ex.name), true) : '';
    const hiitPi = prevEx ? `<div class="prev-data">Anterior: <span>${prevRaw || '—'}</span>${hiitBadge}</div>` : '';
    return `<div class="ex-card">
      <div class="ex-mode-badge hiit">HIIT</div>
      <div class="ex-name">${esc(ex.name)}</div>
      <div class="ex-mode-info">${roundsLabel}${restLabel}</div>
      <div class="round-list">${exList}</div>
      <button class="ex-timer-btn hiit-start" data-ex-timer="${i}" data-timer-mode="result">▶ Iniciar HIIT</button>
      <div class="ex-timer-zone" data-ex="${i}"></div>
      <div style="margin-top:8px"><label>Resultado</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="Tiempo total" value="${pv}" autocomplete="off"></div>
      ${hiitPi}</div>`;
  }

  const isTimed = exType === 'hiit' || exType === 'density';
  const timer = isTimed ? timerBtnHtml(i, 'result') : '';
  return `<div class="ex-card"><div class="ex-name">${esc(ex.name)}</div>${timer}<div style="margin-top:8px"><label>Resultado</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="Tiempo / reps totales" value="${pv}" autocomplete="off"></div>${pi}</div>`;
}

function renderIntervalCard(ex, i, prevEx, shouldPrefill) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevEx.sets[0]?.reps || '—'}</span></div>` : '';
  return `<div class="ex-card">
    <div class="ex-mode-badge interval">Intervalos</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="ex-mode-info">${ex.duration} · ${ex.on} on / ${ex.off} off</div>
    ${timerBtnHtml(i, 'interval')}
    <div><label>Reps totales</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="ej: 30" inputmode="numeric" value="${pv}" autocomplete="off"></div>
    ${pi}</div>`;
}

function renderTabataCard(ex, i, prevEx, shouldPrefill) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevEx.sets[0]?.reps || '—'}</span></div>` : '';
  const rounds = ex.rounds || [];
  const grid = `<div class="tabata-grid">${rounds.map((r, ri) => `<div class="tabata-round"><span class="tr-num">R${ri + 1}</span>${r}</div>`).join('')}</div>`;
  return `<div class="ex-card">
    <div class="ex-mode-badge tabata">Tabata</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="ex-mode-info">8 rondas · 20s on / 10s off</div>
    ${grid}
    ${timerBtnHtml(i, 'tabata')}
    <div><label>Reps totales</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="ej: 64" inputmode="numeric" value="${pv}" autocomplete="off"></div>
    ${pi}</div>`;
}

function renderRoundsCard(ex, i, prevEx, shouldPrefill) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevEx.sets[0]?.reps || '—'}</span></div>` : '';
  const exList = (ex.exercises || []).map(e =>
    `<div class="round-item"><span class="ri-name">${e.name}</span><span class="ri-reps">${e.reps}</span></div>`
  ).join('');
  const countLabel = ex.count > 0 ? `${ex.count} rondas` : 'Max rondas';
  const restLabel = ex.rest && ex.rest !== '0' ? ` · Desc: ${ex.rest}` : '';
  return `<div class="ex-card">
    <div class="ex-mode-badge rounds">Circuito</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="ex-mode-info">${countLabel}${restLabel}</div>
    <div class="round-list">${exList}</div>
    ${timerBtnHtml(i, 'rounds')}
    <div><label>Rondas completadas</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="ej: 4" inputmode="numeric" value="${pv}" autocomplete="off"></div>
    ${pi}</div>`;
}

function renderWorkoutCard(ex, i, prevEx, shouldPrefill, db) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const prevRaw = prevEx?.sets[0]?.reps || '';
  const bestBadge = prevRaw && db ? _prevBadgeHtml(prevRaw, getExerciseBestTime(db, ex.name), true) : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevRaw || '—'}</span>${bestBadge}</div>` : '';
  const totalReps = {};
  const roundsHtml = (ex.rounds || []).map(r => {
    const exItems = (r.exercises || []).map(e => {
      const label = e.duration ? e.duration : (e.perSide ? `${e.reps} c/lado` : `${e.reps}`);
      const key = e.name;
      totalReps[key] = (totalReps[key] || 0) + (parseInt(e.reps) || 0);
      return `<div class="round-item"><span class="ri-name">${esc(e.name)}</span><span class="ri-reps">${label}</span></div>`;
    }).join('');
    return `<details class="workout-round"><summary class="workout-round-title">${esc(r.name)}</summary><div class="round-list">${exItems}</div></details>`;
  }).join('');
  const totalHtml = Object.entries(totalReps).map(([name, total]) =>
    `<div class="round-item"><span class="ri-name">${esc(name)}</span><span class="ri-reps">${total}</span></div>`
  ).join('');
  const nRounds = (ex.rounds || []).length;
  const descHtml = ex.desc ? `<div class="ex-mode-desc">${esc(ex.desc)}</div>` : '';
  return `<div class="ex-card">
    <div class="ex-mode-badge workout">Workout</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="ex-mode-info">${nRounds} rondas · For time</div>
    ${descHtml}
    <div class="workout-totals"><div class="workout-totals-title">Total</div><div class="round-list">${totalHtml}</div></div>
    ${roundsHtml}
    ${timerBtnHtml(i, 'workout')}
    <div style="margin-top:8px"><label>Tiempo total</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="ej: 18:32" value="${pv}" autocomplete="off"></div>
    ${pi}</div>`;
}

function renderLadderCard(ex, i, prevEx, shouldPrefill) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevEx.sets[0]?.reps || '—'}</span></div>` : '';
  const exNames = (ex.exercises || []).join(' → ');
  return `<div class="ex-card">
    <div class="ex-mode-badge ladder">Escalera</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="ex-mode-info">${ex.duration} · ${exNames}</div>
    ${ex.desc ? `<div class="ex-mode-desc">${ex.desc}</div>` : ''}
    <div><label>Peldaño máximo</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="ej: 5" inputmode="numeric" value="${pv}" autocomplete="off"></div>
    ${pi}</div>`;
}

function renderPyramidCard(ex, i, prevEx, shouldPrefill) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevEx.sets[0]?.reps || '—'}</span></div>` : '';
  const exNames = (ex.exercises || []).join(' → ');
  const stepInfo = ex.step ? `De ${ex.step} en ${ex.step}` : '';
  return `<div class="ex-card">
    <div class="ex-mode-badge pyramid">Pirámide</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="ex-mode-info">${ex.duration} · ${exNames}${stepInfo ? ' · ' + stepInfo : ''}</div>
    ${ex.desc ? `<div class="ex-mode-desc">${ex.desc}</div>` : ''}
    <div><label>Nivel máximo</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="ej: 8" inputmode="numeric" value="${pv}" autocomplete="off"></div>
    ${pi}</div>`;
}

function renderAmrapCard(ex, i, prevEx, shouldPrefill) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevEx.sets[0]?.reps || '—'}</span></div>` : '';
  return `<div class="ex-card">
    <div class="ex-mode-badge amrap">AMRAP</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="ex-mode-info">${ex.duration}</div>
    ${timerBtnHtml(i, 'amrap')}
    <div><label>Reps totales</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="ej: 45" inputmode="numeric" value="${pv}" autocomplete="off"></div>
    ${pi}</div>`;
}

function renderEmomCard(ex, i, prevEx, shouldPrefill) {
  const pv = shouldPrefill && prevEx ? prevEx.sets[0]?.reps || '' : '';
  const cp = pv ? ' prefilled' : '';
  const pi = prevEx ? `<div class="prev-data">Anterior: <span>${prevEx.sets[0]?.reps || '—'}</span></div>` : '';
  const exList = (ex.exercises || []).map(e => `${esc(e.name || e)}: ${e.reps || ''}`).join(' + ');
  return `<div class="ex-card">
    <div class="ex-mode-badge emom">EMOM</div>
    <div class="ex-name">${esc(ex.name)}</div>
    <div class="ex-mode-info">${ex.duration || ''}${exList ? ' · ' + exList : ''}</div>
    ${ex.desc ? `<div class="ex-mode-desc">${ex.desc}</div>` : ''}
    ${timerBtnHtml(i, 'emom')}
    <div><label>Rondas completadas</label><input type="text" class="${cp}" data-ex="${i}" data-set="0" data-field="reps" placeholder="ej: 10" inputmode="numeric" value="${pv}" autocomplete="off"></div>
    ${pi}</div>`;
}

function renderSupersetCard(ex, i, prevEx, shouldPrefill) {
  const exercises = ex.exercises || [];
  const numSets = ex.sets || 3;
  const setsHtml = [];
  for (let s = 0; s < numSets; s++) {
    const setRows = exercises.map((subEx, subIdx) => {
      const prevSet = prevEx?.sets?.[s * exercises.length + subIdx];
      const pvKg = shouldPrefill && prevSet ? prevSet.kg || '' : '';
      const pvReps = shouldPrefill && prevSet ? prevSet.reps || '' : '';
      const cpKg = pvKg ? ' prefilled' : '';
      const cpReps = pvReps ? ' prefilled' : '';
      return `<div style="display:flex;align-items:center;gap:6px;font-size:.8rem">
        <span style="color:var(--color-text-secondary);font-weight:600;min-width:60px;font-size:.7rem">${esc(subEx.name)}</span>
        <input type="number" class="mini-input${cpKg}" data-ex="${i}" data-set="${s * exercises.length + subIdx}" data-field="kg" step="0.5" placeholder="kg" inputmode="decimal" value="${pvKg}" style="width:55px" autocomplete="off">
        <span style="color:var(--color-text-tertiary)">x</span>
        <input type="text" class="mini-input${cpReps}" data-ex="${i}" data-set="${s * exercises.length + subIdx}" data-field="reps" placeholder="${subEx.reps || '—'}" inputmode="numeric" value="${pvReps}" style="width:45px" autocomplete="off">
      </div>`;
    }).join('');
    setsHtml.push(`<div style="margin-bottom:8px"><div style="font-size:.65rem;color:var(--color-text-secondary);font-weight:600;margin-bottom:4px">Serie ${s + 1}</div>${setRows}</div>`);
  }
  return `<div class="ex-card">
    <div class="ex-mode-badge superset">Superserie</div>
    <div class="ex-name">${esc(ex.name)}</div>
    ${ex.desc ? `<div class="ex-mode-desc">${ex.desc}</div>` : ''}
    ${setsHtml.join('')}</div>`;
}

export function clearPrefill() {
  $prefillBanner.style.display = 'none';
  $exerciseList.querySelectorAll('input').forEach(inp => inp.value = '');
}

// Entreno anterior de esta misma sesión. Una suelta se identifica por su id: no
// pertenece a una fase ni a un plan, así que casar por (nombre, fase, programa)
// la dejaría sin prefill en cuanto el atleta cambia de plan.
function getPrevSession(db, sess) {
  if (!sess) return null;
  const f = sess.customId
    ? db.workouts.filter(w => w.sessionId === sess.customId)
    : db.workouts.filter(w => !w.sessionId && w.session === sess.name && w.phase === db.phase && (w.program || 'arete') === getActiveProgram());
  return f.length ? f[f.length - 1] : null;
}

// PR cache: avoids scanning all workouts on every save
let _prCache = null;
let _prCacheRev = -1;

function buildPRCache(db) {
  const rev = getSaveRevision();
  if (_prCache && _prCacheRev === rev) return _prCache;
  const cache = new Map();
  for (const w of db.workouts) {
    for (const e of w.exercises) {
      for (const s of e.sets) {
        const kg = parseFloat(s.kg) || 0;
        if (kg > 0) {
          const key = e.name;
          const entry = cache.get(key);
          if (!entry || kg > entry.kg) cache.set(key, { kg, workoutId: w.id });
        }
      }
    }
  }
  _prCache = cache;
  _prCacheRev = rev;
  return cache;
}

/** Get highest kg ever lifted for an exercise */
export function getExercisePR(db, name, excludeId) {
  const cache = buildPRCache(db);
  const entry = cache.get(name);
  if (!entry) return 0;
  if (excludeId && entry.workoutId === excludeId) {
    // Fallback: scan without cache for this edge case
    let max = 0;
    for (const w of db.workouts) {
      if (w.id === excludeId) continue;
      for (const e of w.exercises) {
        if (e.name === name) for (const s of e.sets) { const kg = parseFloat(s.kg) || 0; if (kg > max) max = kg; }
      }
    }
    return max;
  }
  return entry.kg;
}

function getExerciseBestReps(db, name) {
  let best = 0, bestDate = null, count = 0;
  for (const w of db.workouts) {
    for (const e of w.exercises) {
      if (e.name !== name) continue;
      for (const s of e.sets) {
        const r = parseInt(s.reps) || 0;
        if (r > 0) {
          count++;
          if (r > best) { best = r; bestDate = w.date; }
        }
      }
    }
  }
  return count >= 2 ? { best, date: bestDate } : null;
}

function getExerciseBestTime(db, name) {
  // For entries like "4R · 18:32" or plain "18:32"
  function parseEntry(str) {
    if (!str) return null;
    const rMatch = str.match(/(\d+)R\s*·\s*(\d+):(\d+)/);
    if (rMatch) return { rounds: parseInt(rMatch[1]), secs: parseInt(rMatch[2]) * 60 + parseInt(rMatch[3]) };
    const tMatch = str.match(/(\d+):(\d+)/);
    if (tMatch) return { rounds: 0, secs: parseInt(tMatch[1]) * 60 + parseInt(tMatch[2]) };
    return null;
  }
  function isBetter(a, b) {
    if (a.rounds !== b.rounds) return a.rounds > b.rounds;
    return a.secs < b.secs;
  }
  let best = null, bestStr = null, bestDate = null, count = 0;
  for (const w of db.workouts) {
    for (const e of w.exercises) {
      if (e.name !== name) continue;
      const val = e.sets[0]?.reps;
      const parsed = parseEntry(val);
      if (!parsed) continue;
      count++;
      if (!best || isBetter(parsed, best)) { best = parsed; bestStr = val; bestDate = w.date; }
    }
  }
  return count >= 2 ? { bestStr, best, date: bestDate } : null;
}

function _prevBadgeHtml(prevStr, bestResult, isTime) {
  if (!bestResult) return '';
  if (isTime) {
    function parseEntry(str) {
      if (!str) return null;
      const rMatch = str.match(/(\d+)R\s*·\s*(\d+):(\d+)/);
      if (rMatch) return { rounds: parseInt(rMatch[1]), secs: parseInt(rMatch[2]) * 60 + parseInt(rMatch[3]) };
      const tMatch = str.match(/(\d+):(\d+)/);
      if (tMatch) return { rounds: 0, secs: parseInt(tMatch[1]) * 60 + parseInt(tMatch[2]) };
      return null;
    }
    const prev = parseEntry(prevStr);
    const best = bestResult.best;
    if (!prev) return '';
    const isRecord = prev.rounds === best.rounds && prev.secs === best.secs;
    const dateStr = bestResult.date ? formatDateShort(bestResult.date) : '';
    if (isRecord) return `<span class="prev-badge prev-badge--record">★ tu récord</span>`;
    return `<span class="prev-badge">★ récord: ${bestResult.bestStr}${dateStr ? ` · ${dateStr}` : ''}</span>`;
  } else {
    const prevMax = (prevStr || '').split('·').reduce((m, p) => {
      const r = parseInt((p.match(/×(\d+)/) || [])[1]) || 0;
      return Math.max(m, r);
    }, 0);
    const { best, date } = bestResult;
    const dateStr = date ? formatDateShort(date) : '';
    if (prevMax >= best) return `<span class="prev-badge prev-badge--record">★ tu récord</span>`;
    return `<span class="prev-badge">★ récord: ${best} reps${dateStr ? ` · ${dateStr}` : ''}</span>`;
  }
}

/** Pre-fill the training form for editing an existing workout */
export function startEdit(workout, db) {
  _formExpanded = true;
  // Entreno de una sesión suelta: se edita contra la copia guardada con él, aunque
  // la suelta ya no exista. La opción se inyecta al vuelo si hace falta.
  if (workout.sessionId) {
    const ref = sessionRef(workout.sessionId);
    _editSpec = { ref, name: workout.session, exercises: workout.spec || workout.exercises, customId: workout.sessionId };
    if (![...$trainSession.options].some(o => o.value === ref)) {
      $trainSession.insertAdjacentHTML('beforeend', `<option value="${esc(ref)}">${esc(workout.session)}</option>`);
    }
    $trainDate.value = workout.date;
    $trainSession.value = ref;
    $trainNotes.value = workout.notes || '';
    _fillEditForm(workout, db);
    return;
  }
  _editSpec = null;
  if (workout.phase !== db.phase) {
    db.phase = workout.phase;
    saveDB(db);
    const phases = getAllPhases();
    const phase = phases.find(p => p.id === db.phase);
    const roman = ROMAN[db.phase - 1] || db.phase;
    // 'fuerza' fijo: aquí se está cargando un entreno de FUERZA para editarlo,
    // así que el modo activo no puede ser otro.
    document.getElementById('phaseName').textContent = phaseChipLabel(roman, phase?.name, 'fuerza');
    populateSessions(db);
  }

  $trainDate.value = workout.date;
  $trainSession.value = workout.session;
  $trainNotes.value = workout.notes || '';
  _fillEditForm(workout, db);
}

/** Pinta la plantilla y vuelca los datos del entreno que se edita. */
function _fillEditForm(workout, db) {
  loadSessionTemplate(db, false);

  editingId = workout.id;

  workout.exercises.forEach((ex, i) => {
    ex.sets.forEach((set, s) => {
      const kgInput = document.querySelector(`[data-ex="${i}"][data-set="${s}"][data-field="kg"]`);
      const repsInput = document.querySelector(`[data-ex="${i}"][data-set="${s}"][data-field="reps"]`);
      if (kgInput) kgInput.value = set.kg || '';
      if (repsInput) repsInput.value = set.reps || '';
    });
  });

  const dateStr = formatDateShort(workout.date);
  $prefillText.textContent = `✏️ Editando ${workout.session} (${dateStr})`;
  $prefillBanner.style.display = 'flex';

  $saveBtn.textContent = 'Guardar cambios';
}

export function cancelEdit(db) {
  clearEditState();
  _editSpec = null;
  if (!resolveSession(db, $trainSession.value)) populateSessions(db);
  else loadSessionTemplate(db, true);
}

/**
 * Selecciona una sesión y despliega el formulario.
 * @param {string} ref       nombre de sesión del plan, o `cs:<id>` de una suelta
 * @param {?number} phaseKey fase a la que pertenece; null/undefined en las sueltas
 *                           (una suelta NO cambia la fase activa del atleta)
 */
export function selectAndStartSession(ref, phaseKey, db) {
  cacheSelectors();
  if (isSessionRef(ref)) {
    populateSessions(db, { select: ref, expand: true });
    return;
  }
  const needPhaseSwitch = parseInt(phaseKey) !== db.phase;
  if (needPhaseSwitch) {
    db.phase = parseInt(phaseKey);
    saveDB(db);
    const phases = getAllPhases();
    const phase = phases.find(p => p.id === db.phase);
    const roman = ROMAN[db.phase - 1] || db.phase;
    // 'fuerza' fijo: aquí se está cargando un entreno de FUERZA para editarlo,
    // así que el modo activo no puede ser otro.
    document.getElementById('phaseName').textContent = phaseChipLabel(roman, phase?.name, 'fuerza');
    populateSessions(db);
  }
  $trainSession.value = ref;
  _formExpanded = true;
  loadSessionTemplate(db, true);
}

/** Save or update a workout from the training form data */
/** Volumen (kg × reps) de la lista de ejercicios de un entreno guardado. */
function workoutVolume(w) {
  let vol = 0;
  for (const e of w.exercises || [])
    for (const s of e.sets || [])
      vol += (parseFloat(s.kg) || 0) * (parseInt(s.reps) || 0);
  return vol;
}

/**
 * Lo que la sesión acaba de producir, leído de la grid — que sigue siendo la
 * fuente de verdad. Alimenta la pantalla de cierre del runner; no guarda nada.
 */
export function buildSessionSummary(db) {
  const sess = resolveSession(db, $trainSession.value);
  if (!sess) return null;

  let volume = 0, setsDone = 0, setsTotal = 0;
  const prs = [];
  sess.exercises.forEach((ex, i) => {
    const mode = ex.mode || (ex.type === 'hiit' || ex.type === 'density' ? 'result' : 'sets');
    if (mode !== 'sets') return;
    let maxKg = 0;
    for (let s = 0; s < (ex.sets || 0); s++) {
      setsTotal++;
      const kg = parseFloat($exerciseList.querySelector(`[data-ex="${i}"][data-set="${s}"][data-field="kg"]`)?.value) || 0;
      const reps = parseInt($exerciseList.querySelector(`[data-ex="${i}"][data-set="${s}"][data-field="reps"]`)?.value) || 0;
      if ($exerciseList.querySelector(`.set-label[data-ex="${i}"][data-set="${s}"]`)?.classList.contains('set-done')) setsDone++;
      volume += kg * reps;
      if (kg > maxKg) maxKg = kg;
    }
    if (maxKg > 0) {
      const prevPR = getExercisePR(db, ex.name, editingId);
      if (maxKg > prevPR) prs.push({ exercise: ex.name, kg: maxKg, prevKg: prevPR });
    }
  });

  // Comparación contra la última vez que se hizo ESTA sesión, no contra el
  // último entreno: comparar una de piernas con una de empuje no dice nada.
  const prev = (db.workouts || [])
    .filter(w => w.session === sess.name && w.id !== editingId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const prevVol = prev ? workoutVolume(prev) : 0;

  return {
    session: sess.name,
    setsDone, setsTotal, volume, prs,
    volumeDelta: prevVol > 0 && volume > 0 ? Math.round((volume / prevVol - 1) * 100) : null,
    volumePrevDate: prev ? formatDateShort(prev.date) : '',
  };
}

export function saveWorkout(db, { fromRunner = false } = {}) {
  const date = $trainDate.value;
  const notes = $trainNotes.value;
  const sess = resolveSession(db, $trainSession.value);
  if (!sess) return;
  const session = sess.name;
  const exercises = sess.exercises;

  const exData = exercises.map((ex, i) => {
    const mode = ex.mode || (ex.type === 'hiit' || ex.type === 'density' ? 'result' : 'sets');
    if (mode === 'sets') {
      const sets = [];
      for (let s = 0; s < ex.sets; s++) {
        const k = document.querySelector(`[data-ex="${i}"][data-set="${s}"][data-field="kg"]`);
        const r = document.querySelector(`[data-ex="${i}"][data-set="${s}"][data-field="reps"]`);
        sets.push({ kg: k ? k.value : '', reps: r ? r.value : '' });
      }
      return { name: ex.name, sets };
    } else {
      const r = document.querySelector(`[data-ex="${i}"][data-set="0"][data-field="reps"]`);
      const exObj = { name: ex.name || ex.mode, sets: [{ kg: '', reps: r ? r.value : '' }] };
      if (ex.type === 'hiit') {
        exObj.type = 'hiit';
        if (ex.rounds)    exObj.rounds    = ex.rounds;
        if (ex.rest)      exObj.rest      = ex.rest;
        if (ex.exercises) exObj.exercises = ex.exercises;
      }
      return exObj;
    }
  });

  const hasAnyData = exData.some(e => e.sets.some(s => s.kg || s.reps));
  if (!hasAnyData) {
    toast('Introduce al menos un dato antes de guardar', 'error');
    return;
  }

  const wasEditing = !!editingId;
  const prs = [];
  exData.forEach(e => {
    const maxKg = Math.max(...e.sets.map(s => parseFloat(s.kg) || 0));
    if (maxKg <= 0) return;
    const prevPR = getExercisePR(db, e.name, editingId);
    if (maxKg > prevPR) prs.push({ exercise: e.name, kg: maxKg, prevKg: prevPR });
  });

  const prog = getActiveProgram();

  // Si viene de una sesión suelta, el entreno se lleva su id y una COPIA de la
  // especificación: borrar la suelta no puede romper el historial ni su edición.
  const build = (id) => {
    const w = { id, date, session, phase: db.phase, program: prog, notes, exercises: exData };
    if (sess.customId) {
      w.sessionId = sess.customId;
      w.spec = JSON.parse(JSON.stringify(exercises));
    }
    if (prs.length > 0) w.prs = prs;
    return w;
  };

  if (editingId) {
    const idx = db.workouts.findIndex(w => w.id === editingId);
    if (idx !== -1) db.workouts[idx] = build(editingId);
    editingId = null;
  } else {
    db.workouts.push(build(Date.now()));
  }
  saveDB(db);
  if (sess.customId) touchCustomSession(db, sess.customId);

  // Viniendo del runner los récords ya se han enseñado en la pantalla de cierre:
  // repetirlos en un overlay suelto después de guardar sobra.
  if (prs.length > 0 && !fromRunner) {
    $prList.innerHTML = prs.map(p =>
      `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(0,85,255,.06);border-radius:var(--radius-lg);margin-bottom:6px">
        <div style="font-size:.75rem;font-weight:700;color:var(--color-accent-text);flex:1">${esc(p.exercise)}</div>
        <div style="font-size:.7rem;color:var(--color-text-tertiary);text-decoration:line-through">${p.prevKg > 0 ? p.prevKg + 'kg' : '—'}</div>
        <div style="font-size:.85rem;font-weight:800;color:var(--color-state-success)">${p.kg}kg</div>
      </div>`
    ).join('');
    $prCelebration.style.display = 'flex';
  }

  $trainNotes.value = '';
  const $notesBody = document.getElementById('notesBody');
  const $notesToggle = document.getElementById('notesToggle');
  if ($notesBody && !$notesBody.hidden) {
    $notesBody.hidden = true;
    if ($notesToggle) { $notesToggle.textContent = '+ Añadir'; $notesToggle.setAttribute('aria-expanded', 'false'); }
  }
  clearDraft();
  _formExpanded = false;
  if (_editSpec) { _editSpec = null; populateSessions(db); }
  else loadSessionTemplate(db, true);
  toast(wasEditing ? 'Cambios guardados' : 'Sesión guardada');
}

// ── Set completion helpers ────────────────────────────────

function _markSetDone(label) {
  if (!label.dataset.original) label.dataset.original = label.textContent;
  label.classList.add('set-done');
  label.classList.remove('active-set');
  label.textContent = '✓';
  _updateActiveSet();
}

function _unmarkSetDone(label) {
  label.classList.remove('set-done');
  label.textContent = label.dataset.original || `S${(parseInt(label.dataset.set) || 0) + 1}`;
  _updateActiveSet();
}

// La serie activa es una en toda la SESIÓN, no una por ejercicio: operando por
// `.sets-grid` una sesión de 3 ejercicios mostraba 3 series "activas" a la vez.
function _updateActiveSet() {
  if (!$exerciseList) return;
  const labels = $exerciseList.querySelectorAll('.set-label');
  let found = false;
  labels.forEach(l => {
    l.classList.remove('active-set');
    if (!found && !l.classList.contains('set-done')) {
      l.classList.add('active-set');
      found = true;
    }
  });
}

/** Initialize training section: cache selectors and bind events */
export function initTraining(db, { onCancelEdit }) {
  cacheSelectors();

  $exerciseList.addEventListener('input', (e) => {
    e.target.classList.remove('prefilled');
    scheduleDraft();
  }, true);
  // Marcar una serie es SIEMPRE un acto explícito: el CTA del runner o el tap en
  // la etiqueta. Antes también se auto-marcaba al salir del input, así que había
  // dos mecanismos con reglas distintas (uno ignoraba el prefill, el otro no) y
  // un roce con la mano sudada podía desmarcar sin dejar rastro.
  $exerciseList.addEventListener('click', (e) => {
    const label = e.target.closest('.set-label');
    if (!label) return;
    if (label.classList.contains('set-done')) {
      _unmarkSetDone(label);
      scheduleDraft();
      // Desmarcar borra trabajo hecho: tiene que poder deshacerse.
      const setNo = (parseInt(label.dataset.set) || 0) + 1;
      toast(`Serie ${setNo} desmarcada`, 'info', {
        action: 'Deshacer',
        onAction: () => { _markSetDone(label); scheduleDraft(); },
      });
      return;
    }
    _markSetDone(label);
    scheduleDraft();
  });
  $trainNotes.addEventListener('input', scheduleDraft);
  $trainSession.addEventListener('change', () => { clearDraft(); _formExpanded = false; loadSessionTemplate(db, true); });
  $saveBtn.addEventListener('click', () => saveWorkout(db));
  const $notesToggleBtn = document.getElementById('notesToggle');
  const $notesBodyEl = document.getElementById('notesBody');
  if ($notesToggleBtn && $notesBodyEl) {
    $notesToggleBtn.addEventListener('click', () => {
      const open = !$notesBodyEl.hidden;
      $notesBodyEl.hidden = open;
      $notesToggleBtn.textContent = open ? '+ Añadir' : '✕ Cerrar';
      $notesToggleBtn.setAttribute('aria-expanded', String(!open));
      if (!open) $trainNotes.focus();
    });
  }
  $prefillBanner.addEventListener('click', (e) => {
    if (e.target.closest('.prefill-clear')) {
      onCancelEdit();
      clearPrefill();
    }
  });
  $prCelebration.addEventListener('click', function () { this.style.display = 'none'; });

  // Exercise timer event delegation
  initExTimerEvents($exerciseList, (exIdx) => currentSession(db)?.exercises?.[exIdx] || null);
}
