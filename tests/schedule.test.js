// Tests del scheduler puro (D6). Sin DOM: js/schedule.js no lo toca y aquí
// menos. Los programas activos se siembran vía reindexCustomPrograms, la misma
// vía por la que la app indexa planes custom — así no dependemos de fetch ni
// del estado de fábrica de programs.js.
import { describe, it, expect } from 'vitest';
import {
  SCHEDULE_DEFAULTS, getScheduleConfig, buildQueue, pendingCount,
  schedulePlan, scheduleAll, scheduleDay, scheduleOverdue,
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
  it('con la fase intacta, la cola son todas las sesiones en orden declarado', () => {
    expect(buildQueue(seedDb(), 'arete')).toEqual(['Sesión A', 'Sesión B', 'Sesión C']);
  });

  it('retoma después de la última completada: hecha A, la cola empieza en B', () => {
    const db = seedDb({ workouts: [{ session: 'Sesión A', program: 't-fuerza', phase: 1 }] });
    expect(buildQueue(db, 'arete')).toEqual(['Sesión B', 'Sesión C']);
  });

  it('cada repetición hecha consume una aparición, pero no re-encola', () => {
    const db = seedDb({
      workouts: [
        { session: 'Sesión A', program: 't-fuerza', phase: 1 },
        { session: 'Sesión B', program: 't-fuerza', phase: 1 },
        { session: 'Sesión A', program: 't-fuerza', phase: 1 },
        { session: 'Sesión B', program: 't-fuerza', phase: 1 },
      ],
    });
    expect(buildQueue(db, 'arete')).toEqual(['Sesión C']);
  });

  it('un workout de otro programa no consume cola', () => {
    const db = seedDb({ workouts: [{ session: 'Sesión A', program: 'otro', phase: 1 }] });
    expect(buildQueue(db, 'arete')).toEqual(['Sesión A', 'Sesión B', 'Sesión C']);
  });

  it('un workout de otra fase no consume cola', () => {
    const db = seedDb({ workouts: [{ session: 'Sesión A', program: 't-fuerza', phase: 2 }] });
    expect(buildQueue(db, 'arete')).toEqual(['Sesión A', 'Sesión B', 'Sesión C']);
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

  it('pendingCount resume por plan', () => {
    const db = seedDb({ workouts: [{ session: 'Sesión A', program: 't-fuerza', phase: 1 }] });
    expect(pendingCount(db)).toEqual({ arete: 2, running: 2 });
  });
});

describe('schedulePlan (D1)', () => {
  it('la k-ésima pendiente cae en el k-ésimo ancla >= ref', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1, 3, 5] } } } });
    const out = schedulePlan(db, 'arete', LUN_5);
    expect(out).toEqual([
      { date: '2026-01-05', session: 'Sesión A', plan: 'arete' },
      { date: '2026-01-07', session: 'Sesión B', plan: 'arete' },
      { date: '2026-01-09', session: 'Sesión C', plan: 'arete' },
    ]);
  });

  it('si ref cae entre anclas, cuenta desde el primer ancla >= ref', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1, 3] } } } });
    // ref martes 6: el primer ancla >= ref es el miércoles 7.
    expect(fechas(schedulePlan(db, 'arete', '2026-01-06'))).toEqual(['2026-01-07', '2026-01-12', '2026-01-14']);
  });

  it('marcar una sesión como hecha avanza la cola y desplaza el resto hacia atrás', () => {
    const base = { settings: { schedule: { arete: { anchors: [1, 3, 5] } } } };
    const sinHacer = schedulePlan(seedDb(base), 'arete', LUN_5);
    const db = seedDb({ ...base, workouts: [{ session: 'Sesión A', program: 't-fuerza', phase: 1 }] });
    const hecho = schedulePlan(db, 'arete', LUN_5);
    expect(fechas(sinHacer)).toEqual(['2026-01-05', '2026-01-07', '2026-01-09']);
    expect(hecho.map(e => e.session)).toEqual(['Sesión B', 'Sesión C']);
    expect(fechas(hecho)).toEqual(['2026-01-05', '2026-01-07']);
  });

  it('saltar un día no pierde la sesión: reaparece en el siguiente ancla', () => {
    // Con un único ancla (lunes) y dos pendientes, la segunda cae el lunes
    // siguiente: el día que se cayó empujó todo al ancla posterior.
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1] } } } });
    expect(fechas(schedulePlan(db, 'arete', LUN_5))).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
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

  it('colas vacías (todo hecho o sin programa) → nada programado', () => {
    const db = seedDb({
      settings: { schedule: { arete: { anchors: [1, 3, 5] } } },
      workouts: ['Sesión A', 'Sesión B', 'Sesión C'].map(session => ({ session, program: 't-fuerza', phase: 1 })),
    });
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
    const out = scheduleAll(db, LUN_5);
    expect(fechas(out)).toEqual(['2026-01-06', '2026-01-07', '2026-01-13', '2026-01-14', '2026-01-21']);
    expect(out.map(e => e.plan)).toEqual(['running', 'arete', 'running', 'arete', 'arete']);
  });

  it('scheduleDay filtra un día concreto', () => {
    const db = seedDb({ settings: { schedule: { arete: { anchors: [1, 3] }, running: { anchors: [1] } } } });
    const dia = scheduleDay(db, '2026-01-05', LUN_5);
    expect(dia.map(e => e.session).sort()).toEqual(['Series', 'Sesión A']);
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

  it('una sesión ya hecha deja de estar atrasada', () => {
    const db = seedDb({
      settings: { schedule: { arete: { anchors: [1] }, running: { anchors: [] } } },
      workouts: [{ session: 'Sesión A', program: 't-fuerza', phase: 1 }],
    });
    // La A ya no está en la cola: aunque su ancla pasó, no se reporta.
    expect(scheduleOverdue(db, '2026-01-19').map(e => e.session)).toEqual(['Sesión B', 'Sesión C']);
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
