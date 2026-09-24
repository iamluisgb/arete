import { esc, today } from '../utils.js';
import { ROMAN as ROMAN_FASE } from '../constants.js';
import { formatPace, formatRunDuration, RUN_TYPE_META } from './running-helpers.js';
import { computeProfile, ROMAN, LEVEL_NAMES } from '../domains.js';
import { getProgramById, getRunningProgram } from '../programs.js';
import { scheduleDay, scheduleOverdue, pendingCount, getScheduleConfig, usesDefaultAnchors, PLAN_STRENGTH, PLAN_RUNNING } from '../schedule.js';

const CIRCUMFERENCE = 2 * Math.PI * 34; // ~213.6 for r=34

const QUOTES = [
  { text: 'La disciplina es el puente entre las metas y los logros.', author: 'Jim Rohn' },
  { text: 'No se trata de ser el mejor. Se trata de ser mejor que ayer.', author: null },
  { text: 'La constancia no es glamurosa, pero es lo que funciona.', author: null },
  { text: 'Enamórate del proceso y los resultados llegarán.', author: 'Eric Thomas' },
  { text: 'Cada repetición cuenta, aunque no la sientas.', author: null },
  { text: 'La fuerza no viene de lo que puedes hacer. Viene de superar lo que creías que no podías.', author: 'Rikki Rogers' },
  { text: 'El cuerpo logra lo que la mente cree.', author: null },
  { text: 'No cuentes los días, haz que los días cuenten.', author: 'Muhammad Ali' },
  { text: 'El dolor que sientes hoy será la fuerza que sentirás mañana.', author: null },
  { text: 'La diferencia entre querer y lograr es la disciplina.', author: null },
  { text: 'Entrena porque tu cuerpo lo merece, no como castigo por lo que comiste.', author: null },
  { text: 'El éxito no se regala. Se entrena.', author: null },
  { text: 'Hoy es un buen día para ser mejor que ayer.', author: null },
  { text: 'Los límites solo existen si los aceptas.', author: null },
  { text: 'No busques inspiración. Sé la inspiración.', author: null },
  { text: 'El talento te pone en el juego. El esfuerzo te hace ganar.', author: null },
  { text: 'Sufre la disciplina o sufre el arrepentimiento.', author: 'Jim Rohn' },
  { text: 'Tu yo del futuro te lo va a agradecer.', author: null },
  { text: 'Cada día es una nueva oportunidad para mejorar.', author: null },
  { text: 'La motivación te pone en marcha. El hábito te mantiene.', author: null },
  { text: 'El progreso, no la perfección, es lo que importa.', author: null },
  { text: 'Lo que hoy parece imposible, mañana será tu calentamiento.', author: null },
  { text: 'La mente se rinde antes que el cuerpo. No la dejes.', author: null },
  { text: 'Pequeños pasos cada día llevan a grandes resultados.', author: null },
  { text: 'Si fuera fácil, todo el mundo lo haría.', author: null },
  { text: 'Estar incómodo es el precio del crecimiento.', author: null },
  { text: 'No esperes a estar motivado. Actúa y la motivación vendrá.', author: null },
  { text: 'La mejor versión de ti se construye día a día.', author: null },
  { text: 'El hierro no miente. Siempre te da lo que mereces.', author: 'Henry Rollins' },
  { text: 'Más fuerte que ayer, más listo que mañana.', author: null },
  { text: 'Corre cuando puedas, camina cuando debas, pero nunca te rindas.', author: 'Dean Karnazes' },
  { text: 'No entreno para ser rápido. Entreno para no rendirme.', author: 'Eliud Kipchoge' },
  { text: 'Cada kilómetro que corres es un kilómetro que te separa de quien eras.', author: null },
  { text: 'La carrera más difícil es la que empieza en la puerta de casa.', author: null },
  { text: 'Correr es la forma más honesta de competir contigo mismo.', author: null },
  { text: 'Los primeros kilómetros son del cuerpo. Los últimos, de la mente.', author: null },
  { text: 'No necesitas ir rápido. Solo necesitas no parar.', author: null },
  { text: 'Soy lento, pero estoy delante de todos los que se quedaron en el sofá.', author: null },
  { text: 'Cada paso cuenta, aunque sea pequeño.', author: null },
  { text: 'La línea de meta siempre merece el esfuerzo.', author: null },
];

function getDailyQuote() {
  const today = new Date().toISOString().slice(0, 10);
  const saved = localStorage.getItem('blQuoteDate');
  let idx;
  if (saved === today) {
    idx = parseInt(localStorage.getItem('blQuoteIdx')) || 0;
  } else {
    idx = Math.floor(Math.random() * QUOTES.length);
    localStorage.setItem('blQuoteDate', today);
    localStorage.setItem('blQuoteIdx', idx);
  }
  return QUOTES[idx];
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7) return `Hace ${diff} días`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function setRing(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const clamped = Math.min(Math.max(pct, 0), 1);
  el.setAttribute('stroke-dashoffset', CIRCUMFERENCE * (1 - clamped));
}

function calcStreak(workouts, runningLogs) {
  const allDates = [
    ...workouts.map(w => w.date),
    ...(runningLogs || []).map(r => r.date),
  ];
  if (!allDates.length) return 0;
  const dates = [...new Set(allDates)].sort().reverse();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let check = new Date(today);

  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((check - d) / 86400000);
    if (diff <= 1) {
      streak++;
      check = d;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * El nivel, en la primera pantalla. Sin esto "Hoy" abría con cuatro anillos
 * genéricos y una cita motivacional: nada que distinga a Areté de un tracker.
 * Es un resumen, no un segundo radar — el radar vive en Perfil, y este bloque
 * lleva hasta él.
 */
function renderLevel(db) {
  const $el = document.getElementById('dashLevel');
  if (!$el) return;
  const p = computeProfile(db);

  if (!p.measured) {
    $el.innerHTML = `<span class="dash-level-num">—</span>
      <span class="dash-level-txt"><b>Aún no tienes perfil</b>
      <span>Mide un dominio y empieza a dibujarse</span></span>
      <span class="material-symbols-outlined dash-level-go">chevron_right</span>`;
    return;
  }

  const detalle = p.provisional
    ? `Limitado por ${p.limitedBy.name.toLowerCase()} · ${p.measured}/${p.total} medidos`
    : `Limitado por ${p.limitedBy.name.toLowerCase()}`;
  $el.innerHTML = `<span class="dash-level-num">${ROMAN[p.level]}</span>
    <span class="dash-level-txt"><b>${esc(LEVEL_NAMES[p.level])}</b>
    <span>${esc(detalle)}</span></span>
    <span class="material-symbols-outlined dash-level-go">chevron_right</span>`;
}

/**
 * La tarjeta de primeros pasos (UX-2). Solo una db esencialmente nueva la
 * merece: sin sesiones de fuerza NI running. Un veterano con 2/7 dominios
 * medidos no vuelve a verla, aunque su perfil siga provisional — la condición
 * es el historial vacío, no el perfil incompleto.
 */
const STARTER_KEY = 'areteStarterDismissed';

export function isStarterDismissed() {
  try {
    return JSON.parse(localStorage.getItem(STARTER_KEY)) === true;
  } catch {
    return false;
  }
}

export function dismissStarter() {
  try { localStorage.setItem(STARTER_KEY, JSON.stringify(true)); } catch {}
}

const starterSteps = (db) => [
  { label: 'Registra tu peso corporal', tab: 'secBody', done: (db.bodyLogs || []).length > 0 },
  { label: 'Haz tu primer test', tab: 'secProfile', done: (db.domainTests || []).length > 0 },
  { label: 'Registra tu primera sesión', tab: 'secTrain', done: db.workouts.length > 0 },
];

export function shouldShowStarter(db) {
  if (db.workouts.length || (db.runningLogs || []).length) return false;
  if (isStarterDismissed()) return false;
  if (!computeProfile(db).provisional) return false;
  return starterSteps(db).some(s => !s.done);
}

function renderStarter(db) {
  const $el = document.getElementById('dashStarter');
  if (!$el) return;
  if (!shouldShowStarter(db)) {
    $el.innerHTML = '';
    return;
  }
  const paso = (s, i) => `
    <li class="${s.done ? 'done' : ''}">
      <button type="button" data-starter-tab="${s.tab}">
        <span class="material-symbols-outlined" aria-hidden="true">${s.done ? 'check_circle' : 'radio_button_unchecked'}</span>
        ${esc(s.label)}
      </button>
    </li>`;
  $el.innerHTML = `<div class="dash-card dash-starter" role="region" aria-label="Primeros pasos">
    <div class="dash-starter-head">
      <span class="dash-starter-title">Empieza por aquí</span>
      <button type="button" class="dash-starter-dismiss" data-starter-dismiss>Ocultar</button>
    </div>
    <ol class="dash-starter-steps">${starterSteps(db).map(paso).join('')}</ol>
  </div>`;
}

// ── Programación de hoy (D4a) ───────────────────────────────────────────────
// Qué toca hoy por plan, con atajo directo a Entrenar, más lo atrasado y las
// pendientes acumuladas de la cola. La lógica vive en schedule.js; aquí solo
// se pinta y se navega.

// La db del último render: los listeners van montados una vez sobre el
// contenedor estático (renderDashboard reescribe el innerHTML en cada visita)
// y leen la db corriente al hacer clic.
let _schedDb = null;
let _schedBound = false;

const ICONO_PLAN = { [PLAN_STRENGTH]: 'fitness_center', [PLAN_RUNNING]: 'directions_run' };

// F3: el hint de defaults se descarta una vez y no vuelve (hasta que se
// borre el flag). Misma convención de clave que el resto del dashboard.
const SCHED_HINT_KEY = 'areteSchedHintDismissed';
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const NOMBRE_PLAN = { [PLAN_STRENGTH]: 'fuerza', [PLAN_RUNNING]: 'running' };

/** Fila de una sesión de hoy con su botón de arranque directo (F1). */
function filaSched(e) {
  return `<div class="dash-sched-row">
    <span class="material-symbols-outlined dash-act-icon" aria-hidden="true">${ICONO_PLAN[e.plan]}</span>
    <span class="dash-sched-name">${esc(e.session)}</span>
    <button type="button" class="btn btn--secondary btn--sm" data-sched-start="${e.plan}" data-sched-session="${esc(e.session)}">Empezar</button>
  </div>`;
}

/**
 * Línea de contexto del plan activo (F2): qué se está siguiendo ahora mismo,
 * leído de la db — "Areté · Fase II — 5K · Semana 3". Sin ella, la tarjeta
 * anuncia sesiones sin decir de qué plan vienen.
 */
function lineaContexto(db) {
  const partes = [];
  const prog = getProgramById(db.program || 'arete');
  if (prog) {
    const roman = ROMAN_FASE[db.phase - 1] || db.phase || '?';
    partes.push(`${prog._meta?.name || db.program} · Fase ${roman}`);
  }
  const run = getRunningProgram(db.runningProgram || '');
  if (run) partes.push(`${run._meta?.name || db.runningProgram} · Semana ${db.runningWeek || 1}`);
  return partes.join(' — ');
}

/**
 * Hint de anclas de fábrica (F3): visible solo mientras algún plan use los
 * defaults por falta de config (un `anchors: []` explícito es una decisión,
 * no un olvido). Descartable; el estado vive en localStorage.
 */
function hintDefaults(db) {
  // Guarda de entorno: en WebView restringidos o SSR localStorage puede no
  // existir o lanzar; sin el hint el dashboard sigue sirviendo su contenido.
  let dismissed = null;
  try { dismissed = localStorage.getItem(SCHED_HINT_KEY); } catch {}
  if (dismissed === '1') return '';
  const defaults = usesDefaultAnchors(db);
  const cfg = getScheduleConfig(db);
  const partes = [PLAN_STRENGTH, PLAN_RUNNING]
    .filter(plan => defaults[plan] && cfg[plan].anchors.length)
    .map(plan => `${NOMBRE_PLAN[plan]} ${cfg[plan].anchors.map(a => DIAS_CORTOS[a - 1]).join('·')}`);
  if (!partes.length) return '';
  return `<div class="dash-sched-hint">Estamos usando los días de siempre (${esc(partes.join(' · '))}).
    <button type="button" class="dash-sched-hint-link" data-sched-settings>Cámbialos en Ajustes</button>
    <button type="button" class="dash-sched-hint-dismiss" data-sched-hint-dismiss aria-label="Descartar aviso">×</button>
  </div>`;
}

/**
 * Runs GPS fantasma (F4): carreras de esta semana guardadas sin nombre de
 * sesión no consumen cola, así que la sesión sigue apareciendo pendiente.
 * El hint lo explica y lleva a donde se puede asignar.
 */
function hintRunsFantasma(db) {
  const hayPendientes = pendingCount(db)[PLAN_RUNNING] > 0;
  const desde = getWeekStart();
  const corrioSinSesion = (db.runningLogs || []).some(l =>
    !l.session && new Date((l.date || '') + 'T12:00:00') >= desde);
  if (!hayPendientes || !corrioSinSesion) return '';
  return `<div class="dash-sched-ghost">¿Corriste y no se registró la sesión? Asignala desde tus carreras
    <button type="button" class="dash-sched-hint-link" data-sched-ghost>Ir a carreras</button>
  </div>`;
}

function renderSchedule(db) {
  const $el = document.getElementById('dashSchedule');
  if (!$el) return;
  _schedDb = db;

  // Sin anclas configuradas (feature apagada) el estado es otro: en vez de
  // callar, se ofrece la puerta de entrada a Ajustes.
  const cfg = getScheduleConfig(db);
  if (!cfg.arete.anchors.length && !cfg.running.anchors.length) {
    $el.innerHTML = `<div class="dash-card dash-sched-card dash-sched-empty">
      <div class="dash-card-label">Programación semanal</div>
      <p class="dash-sched-note">Organiza tu semana: elige en qué días entrenas y las sesiones se reparten solas.</p>
      <button type="button" class="btn btn--secondary btn--sm" data-sched-settings>Configurar en Ajustes</button>
    </div>`;
    return;
  }

  const hoy = today();
  const deHoy = scheduleDay(db, hoy, new Date());
  const atrasadas = scheduleOverdue(db);
  const pendientes = pendingCount(db);
  const totalPend = pendientes[PLAN_STRENGTH] + pendientes[PLAN_RUNNING];

  // Configurado pero sin nada que decir (todo hecho, sin programa): no
  // ensuciamos el dashboard con una tarjeta vacía.
  if (!deHoy.length && !atrasadas.length && !totalPend) {
    $el.innerHTML = '';
    return;
  }

  const filas = deHoy.map(filaSched).join('');
  const descanso = deHoy.length ? '' : '<div class="dash-sched-note">Hoy toca descanso</div>';
  const atraso = atrasadas.length
    ? `<div class="dash-sched-overdue">${atrasadas.length === 1
      ? '1 sesión atrasada'
      : `${atrasadas.length} sesiones atrasadas`} — se re-acomodan solas</div>`
    : '';
  const pend = totalPend ? `<div class="dash-sched-pending">${totalPend} pendiente${totalPend > 1 ? 's' : ''} en cola</div>` : '';
  const contexto = lineaContexto(db);

  $el.innerHTML = `<div class="dash-card dash-sched-card">
    <div class="dash-card-label">Toca hoy</div>
    ${filas}${descanso}${atraso}${pend}${hintRunsFantasma(db)}${hintDefaults(db)}
    ${contexto ? `<div class="dash-sched-context">${esc(contexto)}</div>` : ''}
  </div>`;
}

async function onScheduleClick(e) {
  if (!_schedDb) return;
  const start = e.target.closest('[data-sched-start]');
  if (start) {
    const db = _schedDb;
    const session = start.dataset.schedSession;
    const nav = await import('./nav.js');
    const irAEntrenar = (modo) => {
      nav.switchTrainMode(modo, db);
      const trainBtn = document.querySelector('nav button[data-sec="secTrain"]');
      if (trainBtn) nav.switchTab(trainBtn, db);
    };
    if (start.dataset.schedStart === PLAN_RUNNING) {
      // F1: la sesión exacta de hoy, por la misma ruta que "Iniciar esta
      // sesión" del plan de running (segmentos guiados + atribución).
      irAEntrenar('run');
      const running = await import('./running.js');
      running.startPlanSessionFromName(db, session);
    } else {
      // F1: requestStartSession preselecciona la sesión anunciada y avisa si
      // hay un entreno a medias, en vez de caer en la rotación implícita.
      const training = await import('./training.js');
      training.requestStartSession(db, session, db.phase, { onStarted: () => irAEntrenar('str') });
    }
    return;
  }
  if (e.target.closest('[data-sched-hint-dismiss]')) {
    // F3: descartar el hint de defaults no toca la config, solo el aviso.
    try { localStorage.setItem(SCHED_HINT_KEY, '1'); } catch {}
    renderSchedule(_schedDb);
    return;
  }
  if (e.target.closest('[data-sched-ghost]')) {
    const nav = await import('./nav.js');
    nav.switchTrainMode('run', _schedDb);
    const trainBtn = document.querySelector('nav button[data-sec="secTrain"]');
    if (trainBtn) nav.switchTab(trainBtn, _schedDb);
    return;
  }
  if (e.target.closest('[data-sched-settings]')) {
    const nav = await import('./nav.js');
    const settings = await import('./settings.js');
    const setBtn = document.querySelector('nav button[data-sec="secSettings"]');
    if (setBtn) nav.switchTab(setBtn, _schedDb);
    settings.openSettingsPage('setSchedule');
  }
}

function bindScheduleActions() {
  if (_schedBound) return;
  const $el = document.getElementById('dashSchedule');
  if (!$el) return;
  _schedBound = true;
  $el.addEventListener('click', onScheduleClick);
}

export function renderDashboard(db) {
  renderLevel(db);
  renderStarter(db);
  bindScheduleActions();
  renderSchedule(db);
  const weekStart = getWeekStart();
  const weekWorkouts = db.workouts.filter(w => new Date(w.date + 'T12:00:00') >= weekStart);

  // Volume: total kg lifted this week
  let totalKg = 0;
  for (const w of weekWorkouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        const kg = parseFloat(s.kg) || 0;
        const reps = parseInt(s.reps) || 0;
        totalKg += kg * reps;
      }
    }
  }

  const volumeGoal = 50000; // 50 tons weekly goal
  const volumeEl = document.getElementById('dashVolumeValue');
  if (volumeEl) volumeEl.textContent = totalKg >= 1000 ? `${(totalKg / 1000).toFixed(1)}t` : `${Math.round(totalKg)} kg`;
  setRing('dashVolumeRing', totalKg / volumeGoal);

  // Sessions this week
  const sessionCount = weekWorkouts.length;
  const sessionGoal = 4;
  const sessionsEl = document.getElementById('dashSessionsValue');
  if (sessionsEl) sessionsEl.textContent = `${sessionCount}/${sessionGoal}`;
  setRing('dashSessionsRing', sessionCount / sessionGoal);

  // Running metrics
  const weekRuns = (db.runningLogs || []).filter(r => new Date(r.date + 'T12:00:00') >= weekStart);
  const runWeekKm = weekRuns.reduce((sum, r) => sum + (parseFloat(r.distance) || 0), 0);
  const runGoalKm = db.runningGoal?.target || 20;
  const runKmEl = document.getElementById('dashRunKmValue');
  if (runKmEl) runKmEl.textContent = `${runWeekKm.toFixed(1)} km`;
  setRing('dashRunKmRing', runWeekKm / runGoalKm);

  const runSessionCount = weekRuns.length;
  const runSessionGoal = 3;
  const runSessionsEl = document.getElementById('dashRunSessionsValue');
  if (runSessionsEl) runSessionsEl.textContent = `${runSessionCount}/${runSessionGoal}`;
  setRing('dashRunSessionsRing', runSessionCount / runSessionGoal);

  // Streak
  const streak = calcStreak(db.workouts, db.runningLogs);
  const streakEl = document.getElementById('dashStreakValue');
  const streakSub = document.getElementById('dashStreakSub');
  if (streakEl) streakEl.textContent = `${streak} ${streak === 1 ? 'día' : 'días'}`;
  if (streakSub) streakSub.textContent = streak === 0 ? 'Empieza hoy' : streak >= 7 ? 'Imparable' : 'Sigue así';

  // Greeting based on time
  const hour = new Date().getHours();
  const greetEl = document.getElementById('dashGreeting');
  if (greetEl) {
    const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    greetEl.textContent = greeting;
  }

  // Daily quote
  const quoteEl = document.getElementById('dashQuote');
  if (quoteEl) {
    const q = getDailyQuote();
    quoteEl.textContent = q.author ? `"${q.text}" — ${q.author}` : `"${q.text}"`;
  }

  // Recent activity (last 5 — workouts + runs unified)
  const allActivity = [
    ...db.workouts.map(w => ({ ...w, _type: 'strength' })),
    ...(db.runningLogs || []).map(r => ({ ...r, _type: 'running' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const listEl = document.getElementById('dashActivityList');
  if (!listEl) return;

  if (!allActivity.length) {
    listEl.innerHTML = `<div class="dash-empty">Sin actividad aún
      <button type="button" class="btn btn--secondary btn--sm dash-empty-cta" id="dashEmptyStart">Empezar una sesión</button></div>`;
    return;
  }

  listEl.innerHTML = allActivity.map(item => {
    if (item._type === 'running') {
      const typeLabel = RUN_TYPE_META[item.type]?.label || 'Carrera';
      const dist = item.distance ? `${item.distance.toFixed(1)} km` : '';
      const pace = item.pace ? `${formatPace(item.pace)} /km` : '';
      const dur = item.duration ? formatRunDuration(item.duration) : '';
      return `<div class="dash-act-card dash-act-run">
        <div class="dash-act-name"><span class="material-symbols-outlined dash-act-icon">directions_run</span>${esc(typeLabel)}</div>
        <div class="dash-act-detail">${[dist, pace].filter(Boolean).join(' · ')}</div>
        <div class="dash-act-detail">${dur}</div>
        <div class="dash-act-time">${formatDate(item.date)}</div>
      </div>`;
    }
    const hasPR = item.prs && item.prs.length > 0;
    const topExercises = item.exercises.slice(0, 2).map(e => esc(e.name)).join(', ');
    const totalSets = item.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    return `<div class="dash-act-card${hasPR ? ' has-pr' : ''}">
      ${hasPR ? '<div class="badge badge--accent dash-act-chip">Récord</div>' : ''}
      <div class="dash-act-name"><span class="material-symbols-outlined dash-act-icon">fitness_center</span>${esc(item.session)}</div>
      <div class="dash-act-detail">${topExercises}</div>
      <div class="dash-act-detail">${totalSets} series</div>
      <div class="dash-act-time">${formatDate(item.date)}</div>
    </div>`;
  }).join('');
}
