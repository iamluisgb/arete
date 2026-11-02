// Tests del scheduler puro (D6). Sin DOM: js/schedule.js no lo toca y aquí
// menos. Los programas activos se siembran vía reindexCustomPrograms, la misma
// vía por la que la app indexa planes custom — así no dependemos de fetch ni
// del estado de fábrica de programs.js.
import { describe, it, expect } from 'vitest';
import {
  SCHEDULE_DEFAULTS, getScheduleConfig, buildQueue, pendingCount,
  schedulePlan, scheduleAll, scheduleDay, scheduleOverdue,
  scheduleMissed, usesDefaultAnchors, advanceRunWeek,
} from '../js/schedule.js';
import { reindexCustomPrograms } from '../js/programs.js';

// 2026-01-05 es lunes. Fechas de referencia como 'YYYY-MM-DD' para no depender
// de la zona horaria del runner.
const LUN_5 = '2026-01-05';

const PLAN_FUERZA = {
  _meta: { name: 'Fuerza test' }, _customId: 't-fuerza',
  1: { name: 'Fase 1', sessions: { 'Sesión A': [], 'Sesión B': [], 'Sesión C': [] } },
};
const PLAN_RUN = {
  _meta: { name: 'Run test', sport: 'running' }, _customId: 't-run',
  1: { name: 'Semana 1', sessions: { 'Series': [], 'Rodaje': [] } },
  2: { name: 'Semana 2', sessions: { 'Rodaje': [], 'Tirada': [] } },
};

function seedDb(over = {}) {
  const db = {
    workouts: [], runningLogs: [], settings: {}, customPrograms: [PLAN_FUERZA, PLAN_RUN],
    program: 't-fuerza', phase: 1, runningProgram: 't-run', runningWeek: 1,
    ...over,
  };
  reindexCustomPrograms(db);
  return db;
}

const fechas = (entries) => entries.map(e => e.date);

describe('getScheduleConfig (D3)', () => {
  it('cae a los defaults cuando no hay config guardada', () => {
    const cfg = getScheduleConfig(seedDb({ settings: {} }));
    expect(cfg.arete.anchors).toEqual(SCHEDULE_DEFAULTS.arete.anchors);
    expect(cfg.running.anchors).toEqual(SCHEDULE_DEFAULTS.running.anchors);
  });

  it('normaliza anclas: filtra fuera de rango, deduplica y ordena', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [5, 1, 9, 1, 0, 3] } } } });
    expect(getScheduleConfig(db).arete.anchors).toEqual([1, 3, 5]);
  });

  it('respeta un array vacío explícito: plan apagado (feature off)', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [] } } } });
    expect(getScheduleConfig(db).arete.anchors).toEqual([]);
    expect(getScheduleConfig(db).running.anchors).toEqual(SCHEDULE_DEFAULTS.running.anchors);
  });

  it('no muta la db al normalizar', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [3, 1] } } } });
    getScheduleConfig(db);
    expect(db.settings.schedule.arete.anchors).toEqual([3, 1]);
  });
});

describe('buildQueue (D1/D7)', () => {
  // La cola de fuerza va por semanas del bloque (js/plan.js): primero lo que
  // queda de la semana en curso y detrás el resto del ciclo. La fase de prueba
  // no declara `weeks`: 4 de carga + 1 de descarga, 3 sesiones por semana.
  it('con la fase intacta: la semana en orden declarado y detrás el resto del bloque', () => {
    const q = buildQueue(seedDb(), 'arete', LUN_5);
    expect(q.slice(0, 3)).toEqual(['Sesión A', 'Sesión B', 'Sesión C']);
    expect(q).toHaveLength(15);
  });

  it('retoma después de la última completada: hecha A, la semana sigue en B', () => {
    const db = seedDb({ workouts: [{ date: '2026-01-05', session: 'Sesión A', program: 't-fuerza', phase: 1 }] });
    expect(buildQueue(db, 'arete', LUN_5).slice(0, 3)).toEqual(['Sesión B', 'Sesión C', 'Sesión A']);
  });

  it('lo hecho esta semana consume su sesión aunque se haga en otro orden', () => {
    const db = seedDb({ workouts: [{ date: '2026-01-05', session: 'Sesión C', program: 't-fuerza', phase: 1 }] });
    expect(buildQueue(db, 'arete', LUN_5).slice(0, 2)).toEqual(['Sesión A', 'Sesión B']);
  });

  it('cerrar la semana trae la siguiente: hacer A·B·C no deja el plan «completado»', () => {
    const db = seedDb({
      workouts: [['2026-01-05', 'Sesión A'], ['2026-01-07', 'Sesión B'], ['2026-01-09', 'Sesión C']]
        .map(([date, session]) => ({ date, session, program: 't-fuerza', phase: 1 })),
    });
    const q = buildQueue(db, 'arete', '2026-01-09');
    expect(q.slice(0, 3)).toEqual(['Sesión A', 'Sesión B', 'Sesión C']);
    expect(q).toHaveLength(12);
    expect(pendingCount(db, '2026-01-09').arete).toBe(3);
  });

  it('con dos sesiones y tres días la semana rota: A·B·A, luego B·A·B', () => {
    const ab = { _meta: { name: 'AB' }, _customId: 't-ab', 1: { name: 'F', sessions: { A: [], B: [] } } };
    const db = seedDb({ program: 't-ab', customPrograms: [ab, PLAN_RUN] });
    expect(buildQueue(db, 'arete', LUN_5).slice(0, 6)).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
  });

  it('un workout de otro programa no consume cola', () => {
    const db = seedDb({ workouts: [{ date: '2026-01-05', session: 'Sesión A', program: 'otro', phase: 1 }] });
    expect(buildQueue(db, 'arete', LUN_5).slice(0, 3)).toEqual(['Sesión A', 'Sesión B', 'Sesión C']);
  });

  it('un workout de otra fase no consume cola', () => {
    const db = seedDb({ workouts: [{ date: '2026-01-05', session: 'Sesión A', program: 't-fuerza', phase: 2 }] });
    expect(buildQueue(db, 'arete', LUN_5).slice(0, 3)).toEqual(['Sesión A', 'Sesión B', 'Sesión C']);
  });

  it('running: los logs del programa con nombre de sesión consumen la semana activa', () => {
    const db = seedDb({ runningLogs: [{ session: 'Series', program: 't-run' }] });
    expect(buildQueue(db, 'running')).toEqual(['Rodaje']);
  });

  it('running: un log de otro programa o sin nombre no consume', () => {
    const db = seedDb({ runningLogs: [{ session: 'Series', program: 'otro' }, { session: '', program: 't-run' }] });
    expect(buildQueue(db, 'running')).toEqual(['Series', 'Rodaje']);
  });

  it('sin programa activo la cola es vacía', () => {
    expect(buildQueue(seedDb({ program: 'no-existe' }), 'arete')).toEqual([]);
    expect(buildQueue(seedDb({ runningProgram: '' }), 'running')).toEqual([]);
  });

  it('pendingCount resume por plan (fuerza: lo que queda de la semana)', () => {
    const db = seedDb({ workouts: [{ date: '2026-01-05', session: 'Sesión A', program: 't-fuerza', phase: 1 }] });
    expect(pendingCount(db, LUN_5)).toEqual({ arete: 2, running: 2 });
  });
});

describe('schedulePlan (D1)', () => {
  it('la k-ésima pendiente cae en el k-ésimo ancla >= ref', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1, 3, 5] } } } });
    const out = schedulePlan(db, 'arete', LUN_5);
    expect(out.slice(0, 4)).toEqual([
      { date: '2026-01-05', session: 'Sesión A', plan: 'arete' },
      { date: '2026-01-07', session: 'Sesión B', plan: 'arete' },
      { date: '2026-01-09', session: 'Sesión C', plan: 'arete' },
      { date: '2026-01-12', session: 'Sesión A', plan: 'arete' },
    ]);
  });

  it('si ref cae entre anclas, cuenta desde el primer ancla >= ref', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1, 3] } } } });
    // ref martes 6: el primer ancla >= ref es el miércoles 7.
    expect(fechas(schedulePlan(db, 'arete', '2026-01-06')).slice(0, 3)).toEqual(['2026-01-07', '2026-01-12', '2026-01-14']);
  });

  it('marcar una sesión como hecha avanza la cola y desplaza el resto hacia atrás', () => {
    const base = { settings: { schedule: { arete: { anchors: [1, 3, 5] } } } };
    const sinHacer = schedulePlan(seedDb(base), 'arete', LUN_5);
    const db = seedDb({ ...base, workouts: [{ date: '2026-01-05', session: 'Sesión A', program: 't-fuerza', phase: 1 }] });
    const hecho = schedulePlan(db, 'arete', LUN_5);
    expect(fechas(sinHacer).slice(0, 3)).toEqual(['2026-01-05', '2026-01-07', '2026-01-09']);
    expect(hecho.slice(0, 2).map(e => e.session)).toEqual(['Sesión B', 'Sesión C']);
    expect(fechas(hecho).slice(0, 2)).toEqual(['2026-01-05', '2026-01-07']);
  });

  it('saltar un día no pierde la sesión: reaparece en el siguiente ancla', () => {
    // Con un único ancla (lunes) la semana es una sesión: A el lunes 5; si no
    // se hace, el lunes 12 sigue tocando A.
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1] } } } });
    expect(schedulePlan(db, 'arete', LUN_5)[0]).toEqual({ date: '2026-01-05', session: 'Sesión A', plan: 'arete' });
    expect(schedulePlan(db, 'arete', '2026-01-12')[0]).toEqual({ date: '2026-01-12', session: 'Sesión A', plan: 'arete' });
  });

  it('cruza el límite de mes sin romperse', () => {
    const largo = {
      _meta: { name: 'Largo' }, _customId: 't-largo',
      1: { name: 'Fase', sessions: Object.fromEntries(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(s => [s, []])) },
    };
    const db = seedDb({ program: 't-largo', customPrograms: [largo], settings: { schedule: { arete: { anchors: [3] } } } });
    // Miércoles desde enero: 07, 14, 21, 28, 04-feb — y el horizonte de 35
    // días corta justo después de cruzar el mes.
    expect(fechas(schedulePlan(db, 'arete', LUN_5)))
      .toEqual(['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28', '2026-02-04']);
  });

  it('anclas desordenadas, duplicadas o inválidas producen el mismo resultado que las normalizadas', () => {
    const limpio = seedDb({ settings: { schedule: { arete: { anchors: [1, 3] } } } });
    const sucio = seedDb({ settings: { schedule: { arete: { anchors: [3, 1, 1, 9, 0] } } } });
    expect(schedulePlan(sucio, 'arete', LUN_5)).toEqual(schedulePlan(limpio, 'arete', LUN_5));
  });

  it('anclas vacíos → feature apagada, nada programado', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [] } } } });
    expect(schedulePlan(db, 'arete', LUN_5)).toEqual([]);
  });

  it('sin programa activo → nada programado', () => {
    const db = seedDb({ program: 'no-existe', settings: { schedule: { arete: { anchors: [1, 3, 5] } } } });
    expect(schedulePlan(db, 'arete', LUN_5)).toEqual([]);
  });

  it('running se programa con sus propios anclas, independiente de fuerza', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [] }, running: { anchors: [6, 7] } } } });
    expect(schedulePlan(db, 'running', LUN_5)).toEqual([
      { date: '2026-01-10', session: 'Series', plan: 'running' },
      { date: '2026-01-11', session: 'Rodaje', plan: 'running' },
    ]);
    expect(schedulePlan(db, 'arete', LUN_5)).toEqual([]);
  });

  it('acepta Date o string como referencia y devuelve el mismo resultado', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1] } } } });
    expect(schedulePlan(db, 'arete', new Date(2026, 0, 5))).toEqual(schedulePlan(db, 'arete', LUN_5));
  });
});

describe('scheduleAll / scheduleDay', () => {
  it('mezcla ambos planes ordenado por fecha', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [3] }, running: { anchors: [2] } } } });
    const out = scheduleAll(db, LUN_5).filter(e => e.date <= '2026-01-21');
    expect(fechas(out)).toEqual(['2026-01-06', '2026-01-07', '2026-01-13', '2026-01-14', '2026-01-21']);
    expect(out.map(e => e.plan)).toEqual(['running', 'arete', 'running', 'arete', 'arete']);
  });

  it('scheduleDay filtra un día concreto', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1, 3] }, running: { anchors: [1] } } } });
    const dia = scheduleDay(db, '2026-01-05', LUN_5);
    expect(dia.map(e => e.session).sort()).toEqual(['Series', 'Sesión A']);
  });

  // Invariante fijado por review (R3-001, ronda 3): schedulePlan proyecta solo
  // hacia adelante desde ref, incluso con sesiones atrasadas en cola. El
  // dashboard usa esto para la etiqueta "próxima" del descanso.
  it('scheduleAll nunca devuelve fechas anteriores a ref, ni con atrasadas', () => {
    const db = seedDb({
      settings: { schedule: { arete: { anchors: [1, 3] }, running: { anchors: [2] } } },
      workouts: [{ date: '2025-12-29', session: 'Sesión vieja', program: 'arete' }],
    });
    const hoy = new Date('2026-01-12T12:00:00'); // lunes, con anclas perdidas atrás
    const out = scheduleAll(db, hoy);
    expect(out.length).toBeGreaterThan(0);
    for (const e of out) expect(e.date >= '2026-01-12').toBe(true);
  });
});

describe('scheduleOverdue (D1: saltar no pierde ni esconde)', () => {
  it('sesiones con ancla ya pasado que siguen pendientes quedan atrasadas', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1] }, running: { anchors: [] } } } });
    // ref lunes 19: la ventana hacia atrás cubre los lunes 05 y 12, que cayeron
    // con A y B pendientes.
    expect(scheduleOverdue(db, '2026-01-19')).toEqual([
      { date: '2026-01-05', session: 'Sesión A', plan: 'arete' },
      { date: '2026-01-12', session: 'Sesión B', plan: 'arete' },
    ]);
  });

  it('entrenar cierra lo atrasado: solo cuentan los anclas posteriores al último entreno', () => {
    const anclas = { settings: { schedule: { arete: { anchors: [1] }, running: { anchors: [] } } } };
    const alDia = seedDb({ ...anclas, workouts: [{ date: '2026-01-12', session: 'Sesión A', program: 't-fuerza', phase: 1 }] });
    expect(scheduleOverdue(alDia, '2026-01-19')).toEqual([]);
    // Entrenó el lunes 5 y se saltó el 12: lo que tocaba el 12 (la B) está atrasado.
    const salto = seedDb({ ...anclas, workouts: [{ date: '2026-01-05', session: 'Sesión A', program: 't-fuerza', phase: 1 }] });
    expect(scheduleOverdue(salto, '2026-01-19')).toEqual([{ date: '2026-01-12', session: 'Sesión B', plan: 'arete' }]);
  });

  it('el ancla de HOY no cuenta como atrasada (solo días estrictamente anteriores)', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1] }, running: { anchors: [] } } } });
    // ref lunes 5: el ancla de hoy programa la C — todavía no es atrasada; sí
    // lo son las dos semanas previas.
    const over = scheduleOverdue(db, LUN_5);
    expect(over.map(e => e.date)).toEqual(['2025-12-22', '2025-12-29']);
    expect(over.map(e => e.session)).toEqual(['Sesión A', 'Sesión B']);
  });
});

describe('scheduleMissed (ventana configurable para el calendario)', () => {
  it('con la ventana por defecto coincide con scheduleOverdue', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1] }, running: { anchors: [] } } } });
    expect(scheduleMissed(db, '2026-01-19')).toEqual(scheduleOverdue(db, '2026-01-19'));
  });

  it('una ventana larga alcanza anclas perdidos fuera de las 2 semanas del dashboard', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1] }, running: { anchors: [] } } } });
    // ref lunes 16 de feb, sin entrenos: con la ventana de serie (14 días) solo
    // los lunes 02 y 09; con 62 días el calendario alcanza hasta el 22 de dic.
    const corta = scheduleMissed(db, '2026-02-16').map(e => e.date);
    const larga = scheduleMissed(db, '2026-02-16', 62).map(e => e.date);
    expect(corta).toEqual(['2026-02-02', '2026-02-09']);
    expect(larga).toEqual(['2025-12-22', '2025-12-29', '2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09']);
  });

  it('un ancla anterior al último entreno no se marca como perdida', () => {
    const db = seedDb({
      settings: { schedule: { arete: { anchors: [1] }, running: { anchors: [] } } },
      workouts: [{ date: '2026-01-12', session: 'Sesión A', program: 't-fuerza', phase: 1 }],
    });
    const perdidas = scheduleMissed(db, '2026-02-16', 62).map(e => e.date);
    expect(perdidas.every(d => d > '2026-01-12')).toBe(true);
    expect(perdidas).toEqual(['2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09']);
  });
});

describe('usesDefaultAnchors (F3: hint de defaults sin config)', () => {
  it('sin config guardada, ambos planes usan defaults', () => {
    expect(usesDefaultAnchors(seedDb({ settings: {} }))).toEqual({ arete: true, running: true });
  });

  it('config guardada (aunque sean los mismos días) no es default', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1, 3, 5] } } } });
    expect(usesDefaultAnchors(db)).toEqual({ arete: false, running: true });
  });

  it('un array vacío explícito NO cuenta como default: el plan está apagado a propósito', () => {
    const db = seedDb({ settings: { schedule: { running: { anchors: [] } } } });
    expect(usesDefaultAnchors(db)).toEqual({ arete: true, running: false });
  });

  it('no muta la db', () => {
    const db = seedDb({ settings: {} });
    usesDefaultAnchors(db);
    expect(db.settings.schedule).toBeUndefined();
  });
});

describe('running: semanas que se cierran al hacer sus sesiones', () => {
  const run = (session, week, over = {}) => ({ date: '2026-01-05', session, program: 't-run', week, ...over });

  it('una carrera de otra semana no tacha la sesión del mismo nombre', () => {
    const db = seedDb({ runningWeek: 2, runningLogs: [run('Rodaje', 1)] });
    expect(buildQueue(db, 'running')).toEqual(['Rodaje', 'Tirada']);
  });

  it('las carreras antiguas sin semana cuentan, como siempre', () => {
    const db = seedDb({ runningWeek: 2, runningLogs: [run('Rodaje', undefined)] });
    expect(buildQueue(db, 'running')).toEqual(['Tirada']);
  });

  it('hechas todas las de la semana, pasa a la siguiente', () => {
    const db = seedDb({ runningLogs: [run('Series', 1), run('Rodaje', 1)] });
    expect(advanceRunWeek(db)).toEqual({ from: 1, to: 2 });
    expect(db.runningWeek).toBe(2);
    expect(buildQueue(db, 'running')).toEqual(['Rodaje', 'Tirada']);
  });

  it('con sesiones pendientes no avanza', () => {
    const db = seedDb({ runningLogs: [run('Series', 1)] });
    expect(advanceRunWeek(db)).toBeNull();
    expect(db.runningWeek).toBe(1);
  });

  it('en la última semana no avanza', () => {
    const db = seedDb({ runningWeek: 2, runningLogs: [run('Rodaje', 2), run('Tirada', 2)] });
    expect(advanceRunWeek(db)).toBeNull();
  });

  it('una cola vaciada solo por carreras antiguas sin semana no avanza sola', () => {
    const db = seedDb({ runningLogs: [run('Series', undefined), run('Rodaje', 0)] });
    expect(buildQueue(db, 'running')).toEqual([]);
    expect(advanceRunWeek(db)).toBeNull();
  });
});
