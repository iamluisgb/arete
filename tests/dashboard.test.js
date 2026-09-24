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
  switchStrTab: vi.fn(),
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

// ── Ronda 3: tarjeta "Hoy" unificada (N1–N6) ────────────────────────────────
// Estados en orden de prioridad: sesiones de hoy agrupadas por plan →
// atrasadas → descanso con próxima → plan completado; feature apagada.
describe('tarjeta "Hoy" unificada — ronda 3 (N1–N6)', () => {
  it('N1: agrupa las sesiones de hoy por plan, con cabecera por grupo', async () => {
    await dashboardConSched(seedSchedDb());
    const grupos = [...document.querySelectorAll('#dashSchedule .dash-sched-grupo')];
    // Fuerza y carrera de hoy, más el grupo de atrasadas (anclas todos los días).
    expect(grupos).toHaveLength(3);
    expect(grupos[0].querySelector('.dash-sched-grupo-head').textContent).toContain('Fuerza');
    expect(grupos[1].querySelector('.dash-sched-grupo-head').textContent).toContain('Carrera');
    expect(grupos[0].querySelector('[data-sched-start="arete"]')?.dataset.schedSession).toBe('Sesión A');
    expect(grupos[1].querySelector('[data-sched-start="running"]')?.dataset.schedSession).toBe('Series');
  });

  it('N1: las atrasadas van después de las de hoy, con botón honesto y marca', async () => {
    await dashboardConSched(seedSchedDb());
    const atrasadas = [...document.querySelectorAll('.dash-sched-row--atrasada')];
    expect(atrasadas.length).toBeGreaterThan(0);
    expect(atrasadas[0].querySelector('[data-sched-start]')).toBeTruthy();
    expect(atrasadas[0].textContent).toContain('atrasada');
  });

  it('N1: día de descanso anuncia la próxima sesión con día y fecha', async () => {
    const isoHoy = new Date().getDay() || 7;
    const anchors = TODOS_LOS_DIAS.filter(d => d !== isoHoy);
    await dashboardConSched(seedSchedDb({
      settings: { schedule: { arete: { anchors }, running: { anchors } } },
    }));
    const card = document.querySelector('#dashSchedule .dash-sched-card');
    expect(card.textContent).toContain('Descanso');
    expect(card.textContent).toContain('próxima:');
    expect(card.textContent).toContain('Sesión A');
    // Sin filas de hoy: la única fila con botón que podría aparecer es una
    // atrasada (grupo aparte), nunca una sesión programada para hoy.
    const filasHoy = [...document.querySelectorAll('#dashSchedule .dash-sched-row:not(.dash-sched-row--atrasada)')];
    expect(filasHoy).toHaveLength(0);
  });

  it('N1: cola vacía para los dos planes muestra el estado "Plan completado"', async () => {
    const hechos = ['Sesión A', 'Sesión B', 'Sesión C'].map(session => ({
      date: hoyStr(), session, program: 't-fuerza', phase: 1, exercises: [],
    }));
    const runs = ['Series', 'Rodaje'].map(session => ({ date: hoyStr(), session, program: 't-run' }));
    await dashboardConSched(seedSchedDb({ workouts: hechos, runningLogs: runs }));
    expect(document.querySelector('#dashSchedule .dash-sched-card').textContent).toContain('Plan completado');
  });

  it('N1: sin plan activo ni sesiones hechas, la tarjeta calla (no felicita)', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB());
    expect(document.querySelector('#dashSchedule .dash-sched-card')).toBeNull();
  });

  it('N1: con los dos planes apagados (anchors []) sigue el estado de config', async () => {
    await dashboardConSched(seedSchedDb({
      settings: { schedule: { arete: { anchors: [] }, running: { anchors: [] } } },
    }));
    expect(document.querySelector('#dashSchedule').textContent).toContain('Configurar en Ajustes');
  });

  it('N2: el pie lleva CTAs etiquetados y navegan a Entrenar en su modo', async () => {
    const nav = await import('../js/ui/nav.js');
    const db = seedSchedDb();
    await dashboardConSched(db);
    const pieFuerza = document.querySelector('[data-sched-train="arete"]');
    const pieRun = document.querySelector('[data-sched-train="running"]');
    expect(pieFuerza.textContent).toContain('Fuerza · Fuerza test');
    expect(pieFuerza.textContent).toContain('Fase I');
    expect(pieRun.textContent).toContain('Carrera · Run test');
    expect(pieRun.textContent).toContain('Semana 1');
    pieRun.click();
    await tick();
    expect(nav.switchTrainMode).toHaveBeenCalledWith('run', db);
  });

  it('N3: sin sección de calendario, la línea de atrasadas queda como texto', async () => {
    await dashboardConSched(seedSchedDb());
    expect(document.querySelector('[data-sched-calendar]')).toBeNull();
    expect(document.querySelector('.dash-sched-overdue').textContent).toContain('atrasadas');
  });

  it('N3: con calendario, la línea de atrasadas enlaza y navega al Historial plegado', async () => {
    const nav = await import('../js/ui/nav.js');
    const db = seedSchedDb();
    const dash = await dashboardConSched(db);
    document.body.insertAdjacentHTML('beforeend', `
      <details id="calFold"><summary>Calendario</summary><div id="calendarPanel"></div></details>`);
    dash.renderDashboard(db);
    const link = document.querySelector('[data-sched-calendar]');
    expect(link).toBeTruthy();
    link.click();
    await tick();
    expect(nav.switchStrTab).toHaveBeenCalledWith('strHistory', db);
    expect(document.getElementById('calFold').hasAttribute('open')).toBe(true);
  });

  it('N6: descanso y completado explican el modelo con enlace a Ajustes', async () => {
    const isoHoy = new Date().getDay() || 7;
    const anchors = TODOS_LOS_DIAS.filter(d => d !== isoHoy);
    await dashboardConSched(seedSchedDb({
      settings: { schedule: { arete: { anchors }, running: { anchors } } },
    }));
    let modelo = document.querySelector('.dash-sched-modelo');
    expect(modelo.textContent).toContain('Si se te cae un día, la sesión pasa al siguiente día que entrenas');
    expect(modelo.querySelector('[data-sched-settings]')).toBeTruthy();

    const hechos = ['Sesión A', 'Sesión B', 'Sesión C'].map(session => ({
      date: hoyStr(), session, program: 't-fuerza', phase: 1, exercises: [],
    }));
    const runs = ['Series', 'Rodaje'].map(session => ({ date: hoyStr(), session, program: 't-run' }));
    await dashboardConSched(seedSchedDb({ workouts: hechos, runningLogs: runs }));
    modelo = document.querySelector('.dash-sched-modelo');
    expect(modelo.textContent).toContain('Si se te cae un día');
    expect(modelo.querySelector('[data-sched-settings]')).toBeTruthy();
  });
});
