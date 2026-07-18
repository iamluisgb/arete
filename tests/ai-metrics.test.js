import { describe, it, expect } from 'vitest';
import {
  epley, daysAgo, workoutTonnage, e1rmByExercise, weekStartOf, weeklySeries,
  loadRatio, recentPRs, bodyTrend, lastStrengthSessions, lastRuns,
  periodStats, runIntensitySplit,
} from '../js/ai/metrics.js';
import { buildSnapshot, buildReport } from '../js/ai/context.js';
import { makeToolExecutor } from '../js/ai/tools.js';

// Fecha de referencia fija para todos los tests: jueves 2026-07-16
const REF = new Date('2026-07-16T12:00:00');

const workout = (date, exercises, extra = {}) => ({ id: Date.parse(date), date, session: 'Sesión A', exercises, ...extra });
const sets = (...pairs) => pairs.map(([kg, reps]) => ({ kg: String(kg), reps: String(reps) }));

const DB = {
  settings: { height: 175, age: 32, race5k: 1500, maxHR: 190 },
  workouts: [
    workout('2026-07-14', [
      { name: 'Sentadilla', sets: sets([100, 5], [100, 5], [100, 5]) },
      { name: 'Press de Banca', sets: sets([70, 5], [70, 4]) },
    ]),
    workout('2026-06-01', [
      { name: 'Sentadilla', sets: sets([90, 5]) },
      { name: 'Dominada Prono', sets: [{ kg: '', reps: '12' }] },
    ]),
  ],
  runningLogs: [
    { id: 1, date: '2026-07-12', type: 'rodaje', distance: 10, duration: 3600, pace: 360, hr: 145 },
    { id: 2, date: '2026-06-20', type: 'intervalos', distance: 6, duration: 1800, pace: 300 },
  ],
  bodyLogs: [
    { id: 1, date: '2026-06-10', weight: 78.0 },
    { id: 2, date: '2026-07-15', weight: 76.5 },
  ],
};

describe('epley', () => {
  it('calcula 1RM estimado', () => {
    expect(epley(100, 5)).toBeCloseTo(116.67, 1);
    expect(epley(100, 1)).toBe(100);
  });
  it('devuelve null con datos inválidos', () => {
    expect(epley('', 5)).toBeNull();
    expect(epley(100, 0)).toBeNull();
    expect(epley(0, 5)).toBeNull();
    expect(epley('abc', 'F')).toBeNull();
  });
});

describe('workoutTonnage', () => {
  it('suma kg × reps solo de sets numéricos', () => {
    const w = workout('2026-07-14', [
      { name: 'Sentadilla', sets: sets([100, 5], [100, 5]) },
      { name: 'Plancha', sets: [{ kg: '', reps: '2min' }] },
    ]);
    expect(workoutTonnage(w)).toBe(1000);
  });
});

describe('e1rmByExercise', () => {
  it('devuelve mejor histórico y mejor reciente', () => {
    const rms = e1rmByExercise(DB.workouts, REF);
    expect(rms['Sentadilla'].best.rm).toBeCloseTo(116.67, 1);
    expect(rms['Sentadilla'].recent.rm).toBeCloseTo(116.67, 1);
    expect(rms['Sentadilla'].sessions).toBe(2);
    // Dominadas sin kg no generan e1RM
    expect(rms['Dominada Prono']).toBeUndefined();
  });
});

describe('weekStartOf / weeklySeries', () => {
  it('devuelve el lunes de la semana', () => {
    expect(weekStartOf('2026-07-16')).toBe('2026-07-13');   // jueves → lunes
    expect(weekStartOf('2026-07-13')).toBe('2026-07-13');   // lunes → sí mismo
    expect(weekStartOf('2026-07-12')).toBe('2026-07-06');   // domingo → lunes anterior
  });
  it('agrega fuerza y running por semana, incluyendo vacías', () => {
    const weeks = weeklySeries(DB, 4, REF);
    expect(weeks).toHaveLength(4);
    const last = weeks[3];
    expect(last.weekStart).toBe('2026-07-13');
    expect(last.strengthSessions).toBe(1);
    expect(last.tonnage).toBe(1500 + 630);   // 3×5×100 + 70×5+70×4
    expect(last.runSessions).toBe(0);
    const prev = weeks[2];
    expect(prev.weekStart).toBe('2026-07-06');
    expect(prev.runSessions).toBe(1);
    expect(prev.km).toBe(10);
  });
});

describe('loadRatio', () => {
  it('calcula carga aguda vs media crónica', () => {
    const lr = loadRatio(DB, REF);
    // Agudo (7d): workout 14/7 (2130) + carrera 12/7 (60min×100=6000) = 8130
    // Crónico (28d): agudo + carrera 20/6 (30min×100=3000) = 11130 → media semanal 2782.5
    expect(lr.acute).toBe(8130);
    expect(lr.ratio).toBeCloseTo(8130 / (11130 / 4), 2);
  });
  it('ratio null sin datos', () => {
    expect(loadRatio({ workouts: [], runningLogs: [] }, REF).ratio).toBeNull();
  });
});

describe('recentPRs', () => {
  it('detecta PR del último mes', () => {
    const prs = recentPRs(DB.workouts, 30, REF);
    expect(prs.map(p => p.name)).toContain('Sentadilla');
  });
});

describe('bodyTrend', () => {
  it('da el último peso y el delta ~30d', () => {
    const bt = bodyTrend(DB.bodyLogs, REF);
    expect(bt.weight).toBe(76.5);
    expect(bt.delta30).toBe(-1.5);
  });
  it('null sin registros con peso', () => {
    expect(bodyTrend([], REF)).toBeNull();
  });
});

describe('lastStrengthSessions / lastRuns', () => {
  it('compacta las sesiones más recientes primero', () => {
    const s = lastStrengthSessions(DB.workouts, 5);
    expect(s[0]).toContain('2026-07-14');
    expect(s[0]).toContain('Sentadilla: 100×5 100×5 100×5');
    const r = lastRuns(DB.runningLogs, 5);
    expect(r[0]).toContain('2026-07-12');
    expect(r[0]).toContain('10 km');
    expect(r[0]).toContain('6:00/km');
  });
});

describe('buildSnapshot', () => {
  it('incluye perfil, programa, semanas, e1RM y últimas sesiones', () => {
    const snap = buildSnapshot(DB, { name: 'Areté', phaseName: 'Fuerza', sessionNames: ['Sesión A', 'Sesión B'] }, REF);
    expect(snap).toContain('FECHA: 2026-07-16');
    expect(snap).toContain('altura 175 cm');
    expect(snap).toContain('peso 76.5 kg');
    expect(snap).toContain('fuerza: Areté — fase "Fuerza"');
    expect(snap).toContain('e1RM');
    expect(snap).toContain('Sentadilla');
    expect(snap).toContain('ÚLTIMAS CARRERAS');
  });
  it('avisa cuando no hay entrenamientos', () => {
    const snap = buildSnapshot({ settings: {}, workouts: [], runningLogs: [], bodyLogs: [] }, {}, REF);
    expect(snap).toContain('SIN ENTRENAMIENTOS');
  });
});

describe('periodStats', () => {
  it('agrega el periodo actual vs el anterior', () => {
    const ps = periodStats(DB, 7, REF);
    expect(ps.current.strengthSessions).toBe(1);
    expect(ps.current.tonnage).toBe(2130);        // 100×5×3 + 70×5 + 70×4
    expect(ps.current.runSessions).toBe(1);
    expect(ps.current.km).toBe(10);
    expect(ps.current.runMin).toBe(60);
    // Periodo anterior (días 7-14) vacío → deltas null
    expect(ps.previous.tonnage).toBe(0);
    expect(ps.tonnageDeltaPct).toBeNull();
    expect(ps.kmDeltaPct).toBeNull();
  });
});

describe('runIntensitySplit', () => {
  it('reparte fácil vs calidad por km en la ventana', () => {
    const s = runIntensitySplit(DB.runningLogs, 28, REF);
    expect(s.easyKm).toBe(10);      // rodaje
    expect(s.qualityKm).toBe(6);    // intervalos
    expect(s.easyN).toBe(1);
    expect(s.qualityN).toBe(1);
    expect(s.easyPct).toBe(63);     // 10/16
  });
  it('easyPct null sin carreras', () => {
    expect(runIntensitySplit([], 28, REF).easyPct).toBeNull();
  });
});

describe('buildReport', () => {
  it('compone el informe semanal con periodo, intensidad y adherencia', () => {
    const rep = buildReport(DB, { plannedPerWeek: 3 }, { period: 'week', ref: REF });
    expect(rep).toContain('INFORME · ÚLTIMA SEMANA');
    expect(rep).toContain('2130 kg tonelaje');
    expect(rep).toContain('Adherencia fuerza: 1/3');
    // Ventana semanal (7d): solo entra el rodaje → 100% fácil (los intervalos son de 26d atrás)
    expect(rep).toContain('Intensidad carrera: 100% fácil');
    expect(rep).toContain('e1RM');
  });
  it('el informe mensual usa ventana de 4 semanas', () => {
    const rep = buildReport(DB, {}, { period: 'month', ref: REF });
    expect(rep).toContain('INFORME · ÚLTIMAS 4 SEMANAS');
  });
});

describe('makeToolExecutor', () => {
  const exec = makeToolExecutor(DB, { getPrograms: () => ({ 1: { name: 'Fuerza', sessions: { 'Sesión A': [{ name: 'Sentadilla', sets: 3, reps: '5' }] } } }) });

  it('get_exercise_history con coincidencia parcial', async () => {
    const out = await exec('get_exercise_history', { name: 'sentadilla' });
    expect(out).toContain('2026-07-14');
    expect(out).toContain('e1RM 116.7 kg');
  });
  it('get_runs filtra por tipo y rango', async () => {
    const out = await exec('get_runs', { type: 'rodaje' });
    expect(out).toContain('2026-07-12');
    expect(out).not.toContain('intervalos');
    expect(await exec('get_runs', { from: '2026-08-01' })).toContain('Sin carreras');
  });
  it('get_body_logs lista medidas', async () => {
    const out = await exec('get_body_logs', {});
    expect(out).toContain('2026-07-15: weight 76.5');
  });
  it('get_program_detail vuelca el plan', async () => {
    const out = await exec('get_program_detail', {});
    expect(out).toContain('FASE 1 — Fuerza');
    expect(out).toContain('Sentadilla 3×5');
  });
  it('herramienta desconocida devuelve error legible', async () => {
    expect(await exec('nope', {})).toContain('ERROR');
  });
});
