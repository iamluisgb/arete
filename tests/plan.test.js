// @vitest-environment jsdom
// Tests del plan en el tiempo (odd/tasks/planificacion.md · fase 1). Sin DOM:
// js/plan.js es puro. Los programas se siembran con reindexCustomPrograms, como
// en schedule.test.js. 2026-01-05 es lunes.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEEKS, BREAK_DAYS, phaseWeeks, phaseHasDeload, programBlocks, sessionsPerWeek,
  blockWorkouts, planStatus, isDeloadWeek, deloadSets, planTimeline,
} from '../js/plan.js';
import { reindexCustomPrograms } from '../js/programs.js';

const PLAN = {
  _meta: { name: 'Plan test' }, _customId: 't-plan',
  1: { name: 'Fuerza', weeks: 2, deload: true, sessions: { A: [], B: [], C: [] } },
  2: { name: 'Hipertrofia', weeks: 3, sessions: { A: [], B: [] } },
  3: { name: 'Pico', weeks: 4, sessions: { A: [] } },
};

function seedDb(over = {}) {
  const db = { workouts: [], runningLogs: [], settings: {}, customPrograms: [PLAN], program: 't-plan', phase: 1, ...over };
  reindexCustomPrograms(db);
  return db;
}

/** n entrenos de la fase dada en días consecutivos de anclas (lun/mié/vie) hasta antes de `hasta`. */
function entrenos(n, { phase = 1, program = 't-plan', desde = '2025-12-01' } = {}) {
  const out = [];
  const d = new Date(desde + 'T12:00:00');
  while (out.length < n) {
    if ([1, 3, 5].includes(d.getDay())) {
      out.push({ id: out.length + 1, date: d.toISOString().slice(0, 10), session: 'A', phase, program, exercises: [] });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const ultimaFecha = ws => ws[ws.length - 1].date;
const diaSiguiente = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

describe('fases', () => {
  it('phaseWeeks: `weeks` válido o el valor por defecto', () => {
    expect(phaseWeeks({ weeks: 6 })).toBe(6);
    expect(phaseWeeks({})).toBe(DEFAULT_WEEKS);
    expect(phaseWeeks({ weeks: 0 })).toBe(DEFAULT_WEEKS);
    expect(phaseWeeks({ weeks: '6' })).toBe(DEFAULT_WEEKS);
  });

  it('descarga: explícita manda; si no, solo fases de 4 semanas o más; Ajustes la apaga', () => {
    const db = seedDb();
    expect(phaseHasDeload(db, { weeks: 2, deload: true })).toBe(true);
    expect(phaseHasDeload(db, { weeks: 3 })).toBe(false);
    expect(phaseHasDeload(db, { weeks: 4 })).toBe(true);
    expect(phaseHasDeload(db, { weeks: 6, deload: false })).toBe(false);
    const off = seedDb({ settings: { plan: { deload: false } } });
    expect(phaseHasDeload(off, { weeks: 6, deload: true })).toBe(false);
  });

  it('programBlocks lista las fases en orden con semanas y descarga', () => {
    expect(programBlocks(seedDb())).toEqual([
      { id: 1, name: 'Fuerza', weeks: 2, deload: true },
      { id: 2, name: 'Hipertrofia', weeks: 3, deload: false },
      { id: 3, name: 'Pico', weeks: 4, deload: true },
    ]);
  });

  it('una semana son tantas sesiones como días ancla; sin anclas, las de la fase', () => {
    expect(sessionsPerWeek(seedDb())).toBe(3);
    expect(sessionsPerWeek(seedDb({ settings: { schedule: { arete: { anchors: [2, 6] } } } }))).toBe(2);
    expect(sessionsPerWeek(seedDb({ phase: 2, settings: { schedule: { arete: { anchors: [] } } } }))).toBe(2);
  });
});

describe('blockWorkouts: la racha final del bloque', () => {
  it('cambiar de fase empieza bloque', () => {
    const viejos = entrenos(4, { phase: 2 });
    const nuevos = entrenos(2, { desde: diaSiguiente(ultimaFecha(viejos)) });
    const db = seedDb({ workouts: [...viejos, ...nuevos] });
    expect(blockWorkouts(db, ultimaFecha(nuevos))).toHaveLength(2);
  });

  it('otro programa corta la racha; un legacy sin fase no', () => {
    const otro = entrenos(2, { program: 'arete' });
    const legacy = entrenos(1, { desde: diaSiguiente(ultimaFecha(otro)) }).map(w => ({ ...w, phase: undefined }));
    const nuevos = entrenos(2, { desde: diaSiguiente(ultimaFecha(legacy)) });
    const db = seedDb({ workouts: [...otro, ...legacy, ...nuevos] });
    expect(blockWorkouts(db, ultimaFecha(nuevos))).toHaveLength(3);
  });

  it(`un parón de más de ${BREAK_DAYS} días reinicia el bloque, también hasta hoy`, () => {
    const antes = entrenos(5, { desde: '2025-10-01' });
    const despues = entrenos(2, { desde: '2025-12-01' });
    const db = seedDb({ workouts: [...antes, ...despues] });
    expect(blockWorkouts(db, ultimaFecha(despues))).toHaveLength(2);
    expect(blockWorkouts(db, '2026-02-01')).toHaveLength(0);
  });

  it('las sesiones sueltas ni cuentan ni cortan; el orden es por fecha', () => {
    const ws = entrenos(3);
    const suelta = { ...ws[1], id: 99, sessionId: 's1', phase: 3 };
    const db = seedDb({ workouts: [ws[2], suelta, ws[0], ws[1]] });
    expect(blockWorkouts(db, ultimaFecha(ws)).map(w => w.id)).toEqual([1, 2, 3]);
  });
});

describe('planStatus', () => {
  it('sin entrenos: semana 1 de carga, descarga tras las semanas de la fase', () => {
    const st = planStatus(seedDb(), '2026-01-05');
    expect(st).toMatchObject({ phase: 1, name: 'Fuerza', week: 1, kind: 'carga', done: 0, cycle: 1, deloadIn: 2, startedAt: null, next: { id: 2, name: 'Hipertrofia' } });
    // 9 sesiones (2 semanas de carga + 1 de descarga, 3 por semana) en lun/mié/vie desde el lunes 5
    expect(st.endsAt).toBe('2026-01-23');
  });

  it('las semanas se cierran por sesiones hechas, no por calendario', () => {
    const ws = entrenos(4);
    const st = planStatus(seedDb({ workouts: ws }), '2026-03-01');
    // El último entreno fue en diciembre: el parón reinicia. Con ref cercana, cuenta.
    expect(st.done).toBe(0);
    const st2 = planStatus(seedDb({ workouts: ws }), ultimaFecha(ws));
    expect(st2).toMatchObject({ done: 4, week: 2, weekDone: 1, kind: 'carga', deloadIn: 1, startedAt: ws[0].date });
  });

  it('tras las semanas de carga viene la descarga, y después un ciclo nuevo', () => {
    const seis = entrenos(6);
    expect(planStatus(seedDb({ workouts: seis }), ultimaFecha(seis))).toMatchObject({ week: 3, kind: 'descarga', deloadIn: 0 });
    expect(isDeloadWeek(seedDb({ workouts: seis }), ultimaFecha(seis))).toBe(true);
    const nueve = entrenos(9);
    expect(planStatus(seedDb({ workouts: nueve }), ultimaFecha(nueve))).toMatchObject({ cycle: 2, week: 1, done: 0, kind: 'carga', startedAt: null });
  });

  it('una fase sin descarga no tiene semana de descarga', () => {
    const ws = entrenos(6, { phase: 2 });
    const st = planStatus(seedDb({ phase: 2, workouts: ws, settings: { schedule: { arete: { anchors: [1, 3, 5] } } } }), ultimaFecha(ws));
    expect(st).toMatchObject({ week: 3, kind: 'carga', deloadIn: null });
  });

  it('una fase que no existe en el programa no tiene estado', () => {
    expect(planStatus(seedDb({ phase: 9 }))).toBeNull();
  });
});

describe('deloadSets', () => {
  it('se hace el 60 % de las series, al menos una', () => {
    expect(deloadSets(5)).toBe(3);
    expect(deloadSets(3)).toBe(2);
    expect(deloadSets(2)).toBe(1);
    expect(deloadSets(1)).toBe(1);
  });
});

describe('planTimeline', () => {
  it('proyecta el resto del bloque y las fases siguientes con su descarga', () => {
    const tl = planTimeline(seedDb(), '2026-01-05');
    expect(tl.map(t => [t.kind, t.phase, t.weeks, t.current])).toEqual([
      ['carga', 1, 2, true], ['descarga', 1, 1, false],
      ['carga', 2, 3, false],
      ['carga', 3, 4, false], ['descarga', 3, 1, false],
    ]);
    expect(tl[0]).toMatchObject({ start: '2026-01-05', end: '2026-01-16' });
    expect(tl[1]).toMatchObject({ start: '2026-01-19', end: '2026-01-23' });
    expect(tl[2].start).toBe('2026-01-26');
  });

  it('en descarga, el tramo de carga ya pasado no se pinta y la descarga empieza donde empezó', () => {
    const siete = entrenos(7);
    const tl = planTimeline(seedDb({ workouts: siete }), ultimaFecha(siete));
    expect(tl[0]).toMatchObject({ kind: 'descarga', current: true, start: siete[6].date });
  });

  it('si hoy ya se entrenó, la siguiente sesión no cae hoy', () => {
    const tres = entrenos(3, { desde: '2026-01-05' });  // lun 5, mié 7, vie 9
    const st = planStatus(seedDb({ workouts: tres }), '2026-01-09');
    expect(st.week).toBe(2);
    expect(planTimeline(seedDb({ workouts: tres }), '2026-01-09')[0].end).toBe('2026-01-16');
  });
});

// ── Integración: progresión y snapshot de Quirón ────────────────────────────
import { nextPrescription } from '../js/progression.js';
import { planBlock } from '../js/ai/context.js';

describe('descarga en la progresión', () => {
  const SENTADILLA = { name: 'Sentadilla', sets: 5, reps: '5' };
  const sesion = (date, kg, over = {}) => ({
    id: +new Date(date), date, session: 'A', phase: 1, program: 't-plan',
    exercises: [{ name: 'Sentadilla', sets: Array.from({ length: 5 }, () => ({ kg: String(kg), reps: '5' })) }], ...over,
  });

  it('en descarga baja la carga, pide menos series y lo explica', () => {
    const p = nextPrescription({ workouts: [sesion('2026-01-05', 100)] }, SENTADILLA, 't-plan', { deload: true, sets: deloadSets(5) });
    expect(p.kind).toBe('deload');
    expect(p.kg).toBe(90);
    expect(p.why).toContain('Semana de descarga');
    expect(p.why).toContain('3 series');
  });

  it('las sesiones de descarga no cuentan: la semana siguiente retoma desde el peso de carga', () => {
    const ws = [sesion('2026-01-05', 100), sesion('2026-01-12', 90, { deload: true })];
    const p = nextPrescription({ workouts: ws }, SENTADILLA, 't-plan');
    expect(p).toMatchObject({ kind: 'up', kg: 105 });
    // Y todas las sesiones de la semana de descarga piden lo mismo.
    expect(nextPrescription({ workouts: ws }, SENTADILLA, 't-plan', { deload: true }).kg).toBe(90);
  });

  it('sin carga externa, la descarga no inventa kilos', () => {
    const ws = [{ date: '2026-01-05', exercises: [{ name: 'Dominadas', sets: [{ kg: '', reps: '8' }] }] }];
    const p = nextPrescription({ workouts: ws }, { name: 'Dominadas', sets: 3, reps: '8' }, 't-plan', { deload: true, sets: 2 });
    expect(p.kind).toBe('deload');
    expect(p.kg).toBeUndefined();
  });
});

describe('planBlock (snapshot de Quirón)', () => {
  it('dice la semana del bloque, cuándo descarga y qué viene después', () => {
    const ws = entrenos(4);
    const txt = planBlock(seedDb({ workouts: ws }), new Date(ultimaFecha(ws) + 'T12:00:00')).join('\n');
    expect(txt).toContain('Fase "Fuerza": semana 2 de 2 de carga');
    expect(txt).toContain('Descarga en 1 semana');
    expect(txt).toContain('"Hipertrofia" 3 sem');
  });

  it('en descarga lo dice en mayúsculas', () => {
    const ws = entrenos(6);
    expect(planBlock(seedDb({ workouts: ws }), new Date(ultimaFecha(ws) + 'T12:00:00')).join('\n')).toContain('SEMANA DE DESCARGA');
  });

  it('sin fase válida no añade nada', () => {
    expect(planBlock(seedDb({ phase: 9 }))).toEqual([]);
  });
});

// ── Mapa del plan (Entrenar → Plan) ─────────────────────────────────────────
import { planMapHtml } from '../js/ui/plan-map.js';

describe('planMapHtml', () => {
  const html = (db, ref) => {
    const el = document.createElement('div');
    el.innerHTML = planMapHtml(db, ref);
    return el;
  };

  it('pinta todas las fases desde la activa, con su descarga y la fase en curso marcada', () => {
    const el = html(seedDb(), '2026-01-05');
    const filas = [...el.querySelectorAll('.plan-map-row')];
    expect(filas.map(f => f.querySelector('.plan-map-name').textContent)).toEqual(['Fuerza', 'Descarga', 'Hipertrofia', 'Pico', 'Descarga']);
    const actual = el.querySelector('[aria-current="step"]');
    expect(actual.textContent).toContain('Semana 1 de 2');
    expect(actual.querySelectorAll('.plan-map-dot')).toHaveLength(2);
    expect(actual.querySelector('.plan-map-dot.is-now')).toBeTruthy();
    expect(el.querySelector('.plan-map-end').textContent).toContain('Termina hacia');
  });

  it('las semanas cerradas salen rellenas', () => {
    const ws = entrenos(4);
    const el = html(seedDb({ workouts: ws }), ultimaFecha(ws));
    const actual = el.querySelector('[aria-current="step"]');
    expect(actual.querySelectorAll('.plan-map-dot.is-done')).toHaveLength(1);
    expect(actual.textContent).toContain('Semana 2 de 2');
  });

  it('en descarga, la fila marcada es la de descarga', () => {
    const ws = entrenos(6);
    const el = html(seedDb({ workouts: ws }), ultimaFecha(ws));
    expect(el.querySelector('[aria-current="step"]').classList.contains('plan-map-row--deload')).toBe(true);
    expect(el.querySelector('.plan-map-row.is-current .plan-map-meta').textContent).toContain('Carga hecha');
  });

  it('las fases anteriores salen atenuadas y sin fechas', () => {
    const ws = entrenos(2, { phase: 2 });
    const el = html(seedDb({ phase: 2, workouts: ws }), ultimaFecha(ws));
    const pasada = el.querySelector('.plan-map-row.is-past');
    expect(pasada.textContent).toContain('Fuerza');
    expect(pasada.textContent).not.toMatch(/→/);
  });

  it('sin fase válida no pinta nada', () => {
    expect(planMapHtml(seedDb({ phase: 9 }))).toBe('');
  });
});
