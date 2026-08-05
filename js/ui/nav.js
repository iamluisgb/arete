import { saveDB } from '../data.js';
import { ROMAN } from '../constants.js';
import { getPrograms, getAllPhases } from '../programs.js';
import { renderCalendar } from './calendar.js';
import { renderHistory } from './history.js';
import { renderBodyForm, renderBody } from './body.js';
import { render1RMs } from './settings.js';
import { initProgress } from './progress.js';
import { populateSessions, exTargetText, requestStartSession } from './training.js';
import { listCustomSessions, deleteCustomSession, sessionRef } from '../sessions.js';
import { refreshRunning, renderRunHistory, renderRunProgress } from './running.js';
import { renderDashboard } from './dashboard.js';
import { renderProfile } from './profile.js';
import { esc } from '../utils.js';

/** Update the phase name in the context bar */
export function updatePhaseDisplay(db) {
  const phases = getAllPhases();
  const phase = phases.find(p => p.id === db.phase);
  const roman = ROMAN[db.phase - 1] || db.phase;
  const name = phase ? phase.name : '';
  document.getElementById('phaseName').textContent = name
    ? `Fase ${roman} · ${name}`
    : `Fase ${roman}`;
}

/** Switch active section and render its content */
export function switchTab(btn, db) {
  document.querySelectorAll('nav button').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  try { navigator.vibrate?.(10); } catch {}
  btn.setAttribute('aria-current', 'page');
  document.getElementById(btn.dataset.sec).classList.add('active');
  localStorage.setItem('areteLastTab', btn.dataset.sec);

  if (btn.dataset.sec === 'secDashboard') renderDashboard(db);
  if (btn.dataset.sec === 'secTrain') renderTrainMode(db);
  if (btn.dataset.sec === 'secProfile') renderProfile(db);
  if (btn.dataset.sec === 'secBody') { renderBodyForm(db); renderBody(db); }
  if (btn.dataset.sec === 'secSettings') render1RMs(db);
}

// ── Entrenar: fuerza y carrera bajo la misma pestaña ─────
//
// Eran dos de las cinco ranuras de la nav para la misma intención —"entrenar
// hoy"— con dos sub-navs idénticas en paralelo. Ahora son un modo dentro de una
// sola sección, y la ranura liberada la ocupa el Perfil.

const MODE_KEY = 'areteTrainMode';

export function getTrainMode() {
  return localStorage.getItem(MODE_KEY) === 'run' ? 'run' : 'str';
}

/** Pinta el modo activo y refresca el panel que toca. */
function renderTrainMode(db) {
  const mode = getTrainMode();
  document.querySelectorAll('.train-mode-btn').forEach(b => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  document.getElementById('secStrength')?.classList.toggle('active', mode === 'str');
  document.getElementById('secRunning')?.classList.toggle('active', mode === 'run');

  if (mode === 'run') { refreshRunning(db); return; }
  const panel = document.querySelector('.str-panel.active')?.id;
  if (panel === 'strHistory') { renderCalendar(db); renderHistory(db); }
  if (panel === 'strProgress') initProgress(db);
}

export function switchTrainMode(mode, db) {
  localStorage.setItem(MODE_KEY, mode === 'run' ? 'run' : 'str');
  renderTrainMode(db);
}

/** Switch strength sub-tab. Fuerza y carrera comparten pestaña: entrar por aquí
 *  implica que el modo es fuerza (lo usan "Iniciar sesión" y Quirón). */
export function switchStrTab(tabName, db) {
  if (getTrainMode() !== 'str') switchTrainMode('str', db);
  document.querySelectorAll('.str-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.str-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.str-tab[data-str="${tabName}"]`)?.classList.add('active');
  document.getElementById(tabName)?.classList.add('active');
  localStorage.setItem('areteLastStrTab', tabName);
  // Render content
  if (tabName === 'strHistory') { renderCalendar(db); renderHistory(db); }
  if (tabName === 'strProgress') initProgress(db);
  if (tabName === 'strPlan') renderStrPlan(db);
}

const CUSTOM_VISIBLE = 5;   // el resto se colapsa: la lista crece sola con el uso

/**
 * "Tus sesiones": las sueltas que ha guardado el atleta (hoy solo las propone
 * Quirón). No son una fase ni parte del plan, por eso viven en su propio bloque,
 * encima del selector de fase.
 */
function renderCustomSessions(db) {
  const $el = document.getElementById('strPlanCustom');
  if (!$el) return;
  const sessions = listCustomSessions(db);

  if (!sessions.length) {
    $el.innerHTML = `<div class="str-plan-custom">
      <div class="str-plan-custom-head"><span class="str-plan-custom-title">Tus sesiones</span></div>
      <div class="str-plan-custom-empty">Aún no tienes ninguna. Pídele a Quirón una sesión para hoy y aparecerá aquí.
        <button class="btn btn--lg btn--block btn-outline btn-sm" data-ask-quiron="Prepárame una sesión para hoy">Pedir una sesión</button>
      </div>
    </div>`;
  } else {
    const expanded = $el.dataset.expanded === '1';
    const shown = expanded ? sessions : sessions.slice(0, CUSTOM_VISIBLE);
    $el.innerHTML = `<div class="str-plan-custom">
      <div class="str-plan-custom-head">
        <span class="str-plan-custom-title">Tus sesiones</span>
        <span class="str-plan-session-count">${sessions.length}</span>
      </div>
      ${shown.map(s => `<div class="str-plan-session str-plan-session-custom">
        <div class="str-plan-session-header">
          <span class="str-plan-session-name">${esc(s.name)}</span>
          <span class="str-plan-session-count">${s.exercises.length} ej.${s.lastUsedAt ? '' : ' · sin estrenar'}</span>
        </div>
        <div class="str-plan-ex-list">${s.exercises.map(ex =>
          `<div class="so-ex"><span class="so-ex-name">${esc(ex.name)}</span><span class="so-ex-target">${exTargetText(ex)}</span></div>`
        ).join('')}</div>
        <div class="str-plan-custom-actions">
          <button class="btn btn--lg btn--block btn-outline btn-sm" data-del-session="${esc(s.id)}">Borrar</button>
          <button class="btn btn--lg btn--block str-plan-start-btn" data-start-session="${esc(sessionRef(s.id))}">Iniciar sesión</button>
        </div>
      </div>`).join('')}
      ${sessions.length > CUSTOM_VISIBLE ? `<button class="str-plan-custom-more" data-toggle-more>${expanded ? 'Ver menos' : `Ver todas (${sessions.length})`}</button>` : ''}
    </div>`;
  }

  $el.onclick = (e) => {
    const start = e.target.closest('[data-start-session]');
    if (start) {
      requestStartSession(db, start.dataset.startSession, null, { onStarted: () => switchStrTab('strTrain', db) });
      return;
    }
    const del = e.target.closest('[data-del-session]');
    if (del) {
      const s = listCustomSessions(db).find(x => x.id === del.dataset.delSession);
      if (s && confirm(`¿Borrar "${s.name}"? Los entrenos que ya hiciste con ella se conservan.`)) {
        deleteCustomSession(db, s.id);
        renderCustomSessions(db);
        populateSessions(db);
      }
      return;
    }
    const more = e.target.closest('[data-toggle-more]');
    if (more) {
      $el.dataset.expanded = $el.dataset.expanded === '1' ? '0' : '1';
      renderCustomSessions(db);
      return;
    }
    const ask = e.target.closest('[data-ask-quiron]');
    if (ask) document.dispatchEvent(new CustomEvent('arete:ask-quiron', { detail: { prompt: ask.dataset.askQuiron } }));
  };
}

/** Render strength Plan tab — browse all phases and sessions */
function renderStrPlan(db) {
  renderCustomSessions(db);
  const $phase = document.getElementById('strPlanPhase');
  const $content = document.getElementById('strPlanContent');
  if (!$phase || !$content) return;

  const progs = getPrograms();
  const phaseKeys = Object.keys(progs).sort((a, b) => parseInt(a) - parseInt(b));
  if (!phaseKeys.length) { $content.innerHTML = '<div class="empty-state">No hay fases disponibles</div>'; return; }

  $phase.innerHTML = phaseKeys.map(k => {
    const p = progs[k];
    return `<option value="${k}">${esc(p.name || 'Fase ' + k)}</option>`;
  }).join('');
  $phase.value = String(db.phase);
  $phase.onchange = () => renderPlanPhaseContent(progs, $phase.value, $content, db);

  renderPlanPhaseContent(progs, $phase.value, $content, db);
}

function renderPlanPhaseContent(progs, phaseKey, $content, db) {
  const phase = progs[phaseKey];
  if (!phase?.sessions) { $content.innerHTML = ''; return; }

  const sessionNames = Object.keys(phase.sessions);
  $content.innerHTML = `
    ${phase.desc ? `<div class="str-plan-desc">${esc(phase.desc)}</div>` : ''}
    ${sessionNames.map(name => {
      const exercises = phase.sessions[name];
      return `<div class="str-plan-session">
        <div class="str-plan-session-header">
          <span class="str-plan-session-name">${esc(name)}</span>
          <span class="str-plan-session-count">${exercises.length} ej.</span>
        </div>
        <div class="str-plan-ex-list">${exercises.map(ex =>
          `<div class="so-ex"><span class="so-ex-name">${esc(ex.name)}</span><span class="so-ex-target">${exTargetText(ex)}</span></div>`
        ).join('')}</div>
        <button class="btn btn--lg btn--block str-plan-start-btn" data-plan-session="${esc(name)}" data-plan-phase="${phaseKey}">Iniciar sesión</button>
      </div>`;
    }).join('')}`;

  $content.querySelectorAll('.str-plan-start-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      requestStartSession(db, btn.dataset.planSession, btn.dataset.planPhase, {
        onStarted: () => switchStrTab('strTrain', db),
      });
    });
  });
}

export function openPhaseModal() {
  document.getElementById('phaseModal').classList.add('open');
}

export function closePhaseModal() {
  document.getElementById('phaseModal').classList.remove('open');
}

export function renderPhaseModal(db) {
  const phases = getAllPhases();
  const container = document.getElementById('phaseOptions');
  container.innerHTML = phases.map(p => `
    <div class="phase-option${p.id === db.phase ? ' selected' : ''}" data-phase="${p.id}">
      <div class="po-num">${ROMAN[p.id - 1] || p.id}</div>
      <div class="po-text"><div class="po-title">${p.name}</div><div class="po-desc">${p.desc}</div></div>
    </div>
  `).join('');
}

export function selectPhase(n, db) {
  db.phase = n;
  saveDB(db);
  updatePhaseDisplay(db);
  renderPhaseModal(db);
  populateSessions(db);
  closePhaseModal();
}

export function updatePhaseUI(db) {
  updatePhaseDisplay(db);
  renderPhaseModal(db);
}

/** Initialize navigation: tab switching, strength sub-tabs, and phase modal */
export function initNav(db) {
  document.querySelectorAll('nav button[data-sec]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn, db));
  });
  // Strength sub-tabs
  document.querySelectorAll('.str-tab[data-str]').forEach(btn => {
    btn.addEventListener('click', () => switchStrTab(btn.dataset.str, db));
  });
  document.querySelectorAll('.train-mode-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => switchTrainMode(btn.dataset.mode, db));
  });
  document.getElementById('phaseContext').addEventListener('click', () => {
    renderPhaseModal(db);
    openPhaseModal();
  });
  document.getElementById('phaseModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('phaseModal')) closePhaseModal();
    const option = e.target.closest('.phase-option[data-phase]');
    if (option) selectPhase(parseInt(option.dataset.phase), db);
  });
  document.querySelector('#phaseModal .btn-outline').addEventListener('click', () => closePhaseModal());
}

/**
 * Las pestañas guardadas de la nav vieja ya no existen. Sin esto, quien tuviera
 * la app abierta en Fuerza o Running la reabría en una sección fantasma y se
 * quedaba en blanco. `secStrength`/`secRunning` pasan a ser el modo de Entrenar.
 */
export function migrateLastTab() {
  const viejo = localStorage.getItem('areteLastTab');
  if (viejo !== 'secStrength' && viejo !== 'secRunning') return;
  localStorage.setItem('areteLastTab', 'secTrain');
  localStorage.setItem(MODE_KEY, viejo === 'secRunning' ? 'run' : 'str');
}

/** Restore last active tab after all UI modules are initialized */
export function restoreLastTab(db) {
  migrateLastTab();
  const lastTab = localStorage.getItem('areteLastTab');
  if (lastTab && lastTab !== 'secDashboard') {
    const savedBtn = document.querySelector(`nav button[data-sec="${lastTab}"]`);
    if (savedBtn) switchTab(savedBtn, db);
  }
  const lastStrTab = localStorage.getItem('areteLastStrTab');
  if (lastStrTab && lastStrTab !== 'strTrain') {
    switchStrTab(lastStrTab, db);
  }
}

/** Re-render the currently active section */
export function refreshActiveSection(db) {
  const sec = document.querySelector('.section.active')?.id;
  if (sec === 'secDashboard') renderDashboard(db);
  if (sec === 'secTrain') renderTrainMode(db);
  if (sec === 'secProfile') renderProfile(db);
  if (sec === 'secBody') { renderBodyForm(db); renderBody(db); }
  if (sec === 'secSettings') render1RMs(db);
}
