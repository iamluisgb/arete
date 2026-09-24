// U2: tarjeta de primeros pasos y CTA de actividad vacía en "Hoy".
// No comprueba el cálculo del perfil (eso es domains.test.js) sino las reglas
// de visibilidad de la tarjeta y que el CTA aparezca solo cuando toca.
//
// Ronda 2 (F1–F4): routing de "Empezar", línea de contexto y avisos de la
// tarjeta de programación. nav/training/running se mockean: dashboard llega a
// ellos por import dinámico y aquí solo interesa QUE los llame y con qué.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/ui/nav.js', () => ({
  switchTrainMode: vi.fn(),
  switchTab: vi.fn(),
}));
vi.mock('../js/ui/training.js', () => ({
  requestStartSession: vi.fn(),
}));
vi.mock('../js/ui/running.js', () => ({
  startPlanSessionFromName: vi.fn(),
}));

function setupDOM() {
  document.body.innerHTML = `
    <nav>
      <button data-sec="secDashboard"></button>
      <button data-sec="secTrain"></button>
      <button data-sec="secProfile"></button>
      <button data-sec="secBody"></button>
    </nav>
    <div class="section active" id="secDashboard">
      <button class="dash-level" id="dashLevel" type="button"></button>
      <div id="dashStarter"></div>
      <section class="dash-sched" id="dashSchedule" aria-label="Programación de hoy"></section>
      <div id="dashActivityList"></div>
    </div>
  `;
}

const freshDB = (over = {}) => ({
  workouts: [], bodyLogs: [], runningLogs: [], domainTests: [],
  ...over,
});

const workout = (date = '2026-01-01') => ({
  date, session: 'Sesión A',
  exercises: [{ name: 'Squat', sets: [{ kg: 100, reps: 5 }] }],
});

async function cargar() {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  return await import('../js/ui/dashboard.js');
}

beforeEach(() => { localStorage.clear(); });

describe('tarjeta de primeros pasos', () => {
  it('un atleta nuevo la ve, con título y los 3 pasos', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB());
    const card = document.querySelector('#dashStarter .dash-starter');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Empieza por aquí');
    const steps = card.querySelectorAll('[data-starter-tab]');
    expect(steps).toHaveLength(3);
    expect(card.textContent).toContain('Registra tu peso corporal');
    expect(card.textContent).toContain('Haz tu primer test');
    expect(card.textContent).toContain('Registra tu primera sesión');
    expect(card.querySelector('[data-starter-dismiss]')).toBeTruthy();
  });

  it('un veterano con sesiones de fuerza no la ve, aunque el perfil siga provisional', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB({ workouts: [workout()] }));
    expect(document.querySelector('#dashStarter .dash-starter')).toBeNull();
  });

  it('quien importa carreras tampoco la ve', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB({ runningLogs: [{ date: '2026-01-01', distance: 5 }] }));
    expect(document.querySelector('#dashStarter .dash-starter')).toBeNull();
  });

  it('un perfil completo (no provisional) no la ve', async () => {
    const dash = await cargar();
    // Los 7 dominios medidos por test: perfil completo sin sesiones ni peso.
    const metricas = ['squat', 'deadlift', 'bench', 'ohp', 'pullups', 'run400', 'run5k',
      'sns', 'mcgillFlexor', 'mcgillExtensor', 'mcgillSide', 'ake', 'dorsiflexion'];
    const db = freshDB({
      domainTests: metricas.map((m, i) => ({ id: i + 1, metric: m, value: 100000, date: '2026-01-01' })),
    });
    const { computeProfile } = await import('../js/domains.js');
    expect(computeProfile(db).provisional).toBe(false);
    dash.renderDashboard(db);
    expect(document.querySelector('#dashStarter .dash-starter')).toBeNull();
  });

  it('la omisión persiste: tras Ocultar no vuelve a aparecer', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB());
    expect(document.querySelector('#dashStarter .dash-starter')).toBeTruthy();
    dash.dismissStarter();
    expect(dash.isStarterDismissed()).toBe(true);
    // La clave se guarda como JSON plano.
    expect(JSON.parse(localStorage.getItem('areteStarterDismissed'))).toBe(true);
    dash.renderDashboard(freshDB());
    expect(document.querySelector('#dashStarter .dash-starter')).toBeNull();
  });

  it('los pasos marcan done con el dato correspondiente', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB({
      bodyLogs: [{ date: '2026-01-01', weight: 75 }],
      domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-01-01' }],
    }));
    const card = document.querySelector('#dashStarter .dash-starter');
    const done = [...card.querySelectorAll('[data-starter-tab]')]
      .filter(b => b.closest('li').classList.contains('done'));
    expect(done).toHaveLength(2);
    // La sesión (tercer paso) sigue pendiente: sin ella la tarjeta no se va.
    const pending = [...card.querySelectorAll('[data-starter-tab]')]
      .filter(b => !b.closest('li').classList.contains('done'));
    expect(pending).toHaveLength(1);
    expect(pending[0].dataset.starterTab).toBe('secTrain');
  });
});

describe('CTA de actividad vacía', () => {
  it('sin actividad muestra el texto y el botón Empezar una sesión', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB());
    const empty = document.querySelector('#dashActivityList .dash-empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('Sin actividad aún');
    expect(document.querySelector('#dashEmptyStart')?.textContent).toContain('Empezar una sesión');
  });

  it('con actividad no hay CTA', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB({ workouts: [workout()] }));
    expect(document.querySelector('#dashEmptyStart')).toBeNull();
  });
});

// ── Ronda 2: tarjeta "Toca hoy" (F1–F4) ─────────────────────────────────
// Semillas de programas como schedule.test.js: los builtin vienen de fetch y
// en tests no hay red; reindexCustomPrograms contra la MISMA instancia de
// programs.js que acaba de cargar el dashboard (vi.resetModules en cargar()).
const PLAN_FUERZA_TEST = {
  _meta: { name: 'Fuerza test' }, _customId: 't-fuerza',
  1: { name: 'Fase 1', sessions: { 'Sesión A': [], 'Sesión B': [], 'Sesión C': [] } },
};
const PLAN_RUN_TEST = {
  _meta: { name: 'Run test', sport: 'running' }, _customId: 't-run',
  1: { name: 'Semana 1', sessions: { 'Series': [], 'Rodaje': [] } },
};

const TODOS_LOS_DIAS = [1, 2, 3, 4, 5, 6, 7];

function seedSchedDb(over = {}) {
  const db = {
    workouts: [], runningLogs: [],
    settings: { schedule: { arete: { anchors: TODOS_LOS_DIAS }, running: { anchors: TODOS_LOS_DIAS } } },
    customPrograms: [PLAN_FUERZA_TEST, PLAN_RUN_TEST],
    program: 't-fuerza', phase: 1, runningProgram: 't-run', runningWeek: 1,
    ...over,
  };
  return db;
}

const hoyStr = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

const tick = () => new Promise(r => setTimeout(r, 0));

async function dashboardConSched(db) {
  const dash = await cargar();
  const programs = await import('../js/programs.js');
  programs.reindexCustomPrograms(db);
  dash.renderDashboard(db);
  return dash;
}

describe('tarjeta "Toca hoy" — ronda 2 (F1–F4)', () => {
  it('F1: "Empezar" de fuerza arranca la sesión anunciada vía requestStartSession', async () => {
    const training = await import('../js/ui/training.js');
    const db = seedSchedDb();
    await dashboardConSched(db);
    const btn = document.querySelector('[data-sched-start="arete"]');
    expect(btn).toBeTruthy();
    expect(btn.dataset.schedSession).toBe('Sesión A');
    btn.click();
    await tick();
    expect(training.requestStartSession).toHaveBeenCalledTimes(1);
    expect(training.requestStartSession).toHaveBeenCalledWith(db, 'Sesión A', 1, expect.any(Object));
  });

  it('F1: "Empezar" de running arranca la sesión anunciada del plan, en modo run', async () => {
    const running = await import('../js/ui/running.js');
    const nav = await import('../js/ui/nav.js');
    const db = seedSchedDb();
    await dashboardConSched(db);
    const btn = document.querySelector('[data-sched-start="running"]');
    expect(btn).toBeTruthy();
    expect(btn.dataset.schedSession).toBe('Series');
    btn.click();
    await tick();
    expect(running.startPlanSessionFromName).toHaveBeenCalledWith(db, 'Series');
    expect(nav.switchTrainMode).toHaveBeenCalledWith('run', db);
  });

  it('F2: la tarjeta muestra el plan y la semana activa como contexto', async () => {
    await dashboardConSched(seedSchedDb());
    const contexto = document.querySelector('.dash-sched-context');
    expect(contexto).toBeTruthy();
    expect(contexto.textContent).toContain('Fuerza test');
    expect(contexto.textContent).toContain('Fase I');
    expect(contexto.textContent).toContain('Run test');
    expect(contexto.textContent).toContain('Semana 1');
  });

  it('F3: sin config de anclas aparece el hint de defaults y se descarta', async () => {
    await dashboardConSched(seedSchedDb({ settings: {} }));
    const hint = document.querySelector('.dash-sched-hint');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('Ajustes');
    document.querySelector('[data-sched-hint-dismiss]').click();
    await tick();
    expect(document.querySelector('.dash-sched-hint')).toBeNull();
    expect(localStorage.getItem('areteSchedHintDismissed')).toBe('1');
  });

  it('F3 (R3-001): localStorage roto no rompe el render de la tarjeta', async () => {
    // Regresión del hallazgo crítico de review: en WebView restringidos o con
    // almacenamiento denegado, leer/escribir localStorage puede lanzar. La
    // tarjeta debe renderizar degradada, sin hint, nunca en blanco.
    const dash = await cargar();
    const programs = await import('../js/programs.js');
    const deny = () => { throw new Error('localStorage denegado'); };
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get: deny });
    const db = seedSchedDb({ settings: {} });
    try {
      expect(() => { programs.reindexCustomPrograms(db); dash.renderDashboard(db); }).not.toThrow();
      expect(document.querySelector('#dashSchedule .dash-card')).toBeTruthy();
      // Con almacenamiento denegado no se puede leer el flag de descartado:
      // el hint se muestra (degradación visible) en vez de blankear la tarjeta.
    } finally {
      if (desc) Object.defineProperty(window, 'localStorage', desc);
    }
  });

  it('F3: con anclas configuradas no hay hint', async () => {
    await dashboardConSched(seedSchedDb());
    expect(document.querySelector('.dash-sched-hint')).toBeNull();
  });

  it('F4: un run de la semana sin sesión asignada, con cola pendiente, muestra el hint', async () => {
    await dashboardConSched(seedSchedDb({ runningLogs: [{ date: hoyStr(), session: '', distance: 5 }] }));
    const ghost = document.querySelector('.dash-sched-ghost');
    expect(ghost).toBeTruthy();
    expect(ghost.textContent).toContain('¿Corriste y no se registró la sesión?');
  });

  it('F4: si el run de la semana ya tiene sesión, no hay hint de fantasma', async () => {
    await dashboardConSched(seedSchedDb({ runningLogs: [{ date: hoyStr(), session: 'Series', distance: 5 }] }));
    expect(document.querySelector('.dash-sched-ghost')).toBeNull();
  });
});
