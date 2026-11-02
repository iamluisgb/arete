// Interferencia fuerza ↔ carrera en la semana tipo (odd/tasks/planificacion.md ·
// plan híbrido, paso 3). Puro: los programas se siembran con reindexCustomPrograms.
// 2026-01-05 es lunes.
import { describe, it, expect } from 'vitest';
import { classifyStrength, classifyRun, typicalWeek, weekConflicts } from '../js/interference.js';
import { reindexCustomPrograms } from '../js/programs.js';

const FUERZA = {
  _meta: { name: 'F' }, _customId: 't-f',
  1: { name: 'Base', sessions: {
    Pierna: [{ name: 'Sentadilla', sets: 3, reps: '5' }, { name: 'Press de Banca', sets: 3, reps: '5' }],
    Torso: [{ name: 'Press de Banca', sets: 3, reps: '5' }, { name: 'Remo', sets: 3, reps: '8' }],
  } },
};
const CARRERA = {
  _meta: { name: 'C', sport: 'running' }, _customId: 't-c',
  1: { name: 'Semana 1', sessions: {
    Series: [{ name: 'Calentamiento', mode: 'run-steady', duration: '20min', zone: 'Z2' }, { name: 'Series', mode: 'run-intervals', reps: 6, distance: '1km', zone: 'Z4' }],
    Suave: [{ name: 'Rodaje', mode: 'run-steady', duration: '40min', zone: 'Z2' }],
    'Rodaje largo': [{ name: 'Rodaje', mode: 'run-steady', duration: '1h30', zone: 'Z2' }],
  } },
};

function seedDb(arete, running, over = {}) {
  const db = {
    workouts: [], runningLogs: [], customPrograms: [FUERZA, CARRERA],
    program: 't-f', phase: 1, runningProgram: 't-c', runningWeek: 1,
    settings: { schedule: { arete: { anchors: arete }, running: { anchors: running } } }, ...over,
  };
  reindexCustomPrograms(db);
  return db;
}
const LUN = '2026-01-05';

describe('clasificación por contenido', () => {
  it('pierna pesada: un básico de tren inferior a 8 reps o menos, o dos de volumen', () => {
    expect(classifyStrength(FUERZA[1].sessions.Pierna).heavyLegs).toBe(true);
    expect(classifyStrength(FUERZA[1].sessions.Torso).heavyLegs).toBe(false);
    expect(classifyStrength([{ name: 'Zancada', sets: 3, reps: '12' }]).heavyLegs).toBe(false);
    expect(classifyStrength([{ name: 'Zancada', sets: 3, reps: '12' }, { name: 'Prensa', sets: 3, reps: '15' }]).heavyLegs).toBe(true);
    // Un circuito HIIT con sentadillas no es una sesión de pierna pesada.
    expect(classifyStrength([{ name: 'Sentadilla', type: 'hiit', reps: '20' }]).heavyLegs).toBe(false);
  });

  it('carrera: series o Z3+ es calidad; 75 min o 15 km seguidos es tirada larga; el calentamiento no cuenta', () => {
    expect(classifyRun(CARRERA[1].sessions.Series)).toEqual({ quality: true, long: false });
    expect(classifyRun(CARRERA[1].sessions.Suave)).toEqual({ quality: false, long: false });
    expect(classifyRun(CARRERA[1].sessions['Rodaje largo'])).toEqual({ quality: false, long: true });
    expect(classifyRun([{ name: 'Calentamiento', mode: 'run-steady', duration: '20min', zone: 'Z4' }]).quality).toBe(false);
    expect(classifyRun([{ name: 'Tirada', mode: 'run-steady', distance: '18km', zone: 'Z2' }]).long).toBe(true);
  });
});

describe('weekConflicts', () => {
  it('pierna pesada el lunes y series el martes: aviso de «antes»', () => {
    // Fuerza solo los lunes (Pierna), carrera solo los martes (Series).
    const c = weekConflicts(seedDb([1], [2]), LUN);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'antes', date: '2026-01-05', strength: 'Pierna', run: 'Series', runDate: '2026-01-06' });
    expect(c[0].text).toContain('Mejor dejar un día');
  });

  it('el mismo día también avisa', () => {
    expect(weekConflicts(seedDb([1], [1]), LUN)[0]).toMatchObject({ kind: 'mismo', date: '2026-01-05' });
  });

  it('tirada larga el día antes de la pierna pesada: aviso de «después»', () => {
    // Series y Suave ya hechas: a la cola de carrera solo le queda la tirada, que cae
    // en su único ancla (domingo 11); la pierna cae el lunes 12, justo después.
    const db = seedDb([1], [7], { runningLogs: [
      { date: '2026-01-04', session: 'Series', program: 't-c', week: 1 },
      { date: '2026-01-04', session: 'Suave', program: 't-c', week: 1 },
    ] });
    const c = weekConflicts(db, '2026-01-10', 9);
    expect(c.map(x => x.kind)).toContain('despues');
  });

  it('un rodaje suave junto a la pierna no es un choque', () => {
    const db = seedDb([1], [2], { runningLogs: [{ date: '2026-01-01', session: 'Series', program: 't-c', week: 1 }] });
    // La cola de carrera empieza en Suave: el martes toca un rodaje suave.
    expect(typicalWeek(db, LUN).find(e => e.plan === 'running').session).toBe('Suave');
    expect(weekConflicts(db, LUN)).toEqual([]);
  });

  it('sin programa de carrera no hay choques', () => {
    expect(weekConflicts(seedDb([1, 3, 5], [2], { runningProgram: '' }), LUN)).toEqual([]);
  });
});
