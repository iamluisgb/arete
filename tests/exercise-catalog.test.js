// F4 — motor de catálogo para Quirón (js/ai/exercise-catalog.js), las tools que lo
// exponen y el volumen por patrón del snapshot.
//
// La regla del producto que estos tests protegen: Quirón solo prescribe ejercicios
// del catálogo. find_exercises es el gate; explain_exercise es la ficha que SEGURIDAD
// exige ante molestias; el snapshot trae el volumen por patrón calculado en JS para
// que el modelo no clasifique (ni invente) a ojo.

import { describe, it, expect } from 'vitest';

import { findExercises, explainExercise } from '../js/ai/exercise-catalog.js';
import { makeToolExecutor, QUIRON_TOOLS } from '../js/ai/tools.js';
import { buildSnapshot } from '../js/ai/context.js';

const REF = new Date('2026-07-16T12:00:00');

const workout = (date, exercises, extra = {}) => ({ id: Date.parse(date), date, session: 'Sesión A', exercises, ...extra });
const sets = (...pairs) => pairs.map(([kg, reps]) => ({ kg: String(kg), reps: String(reps) }));

const DB = {
  settings: {},
  workouts: [
    workout('2026-07-14', [
      { name: 'Sentadilla', sets: sets([100, 5], [100, 5], [100, 5]) },
      { name: 'Press de Banca', sets: sets([70, 5], [70, 4]) },
    ]),
    workout('2026-06-01', [
      { name: 'Sentadilla', sets: sets([90, 5]) },
      // Fuera de la ventana de 28 días de REF (01/06 está a 45 días).
    ]),
    workout('2026-07-13', [
      // Ejercicio que la ontología NO resuelve: debe caer en "sin clasificar", no desaparecer.
      { name: 'Curl Trucado de la Casa', sets: sets([10, 12], [10, 12]) },
    ]),
  ],
  runningLogs: [],
  bodyLogs: [],
};

describe('findExercises', () => {
  it('filtra por patrón exacto del vocabulario cerrado', () => {
    const { exercises, total } = findExercises({ pattern: 'squat' });
    expect(total).toBeGreaterThan(0);
    expect(exercises.every((n) => n.pattern === 'squat')).toBe(true);
    expect(exercises.some((n) => n.id === 'squat')).toBe(true);
  });

  it('exige TODOS los valores de equipment listados ("ninguno" para sin material)', () => {
    const { exercises } = findExercises({ equipment: ['ninguno'] });
    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises.every((n) => n.equipment?.includes('ninguno'))).toBe(true);

    const both = findExercises({ equipment: ['barra', 'banco'] });
    expect(both.exercises.every((n) => n.equipment?.includes('barra') && n.equipment?.includes('banco'))).toBe(true);
  });

  it('filtra por músculo en primary o secondary', () => {
    const { exercises } = findExercises({ muscle: ['pectoral'] });
    expect(exercises.length).toBeGreaterThan(0);
    for (const n of exercises) {
      expect([...(n.primary ?? []), ...(n.secondary ?? [])]).toContain('pectoral');
    }
  });

  it('filtra por dominio', () => {
    const { exercises } = findExercises({ domain: ['kb'] });
    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises.every((n) => n.domains?.includes('kb'))).toBe(true);
  });

  it('`evita` excluye por TEXTO de contraindicaciones, no solo por nombre', () => {
    // Press de Banca menciona "Hombro: escápulas retraídas…" en contraindications.
    const sinEvitar = findExercises({ pattern: 'push_h' });
    expect(sinEvitar.exercises.some((n) => n.id === 'bench')).toBe(true);

    const conEvitar = findExercises({ pattern: 'push_h', evita: ['hombro'] });
    expect(conEvitar.exercises.some((n) => n.id === 'bench')).toBe(false);
    expect(conEvitar.total).toBeLessThan(sinEvitar.total);
  });

  it('`evita` también excluye por nombre de ejercicio concreto', () => {
    // La búlgara es patrón lunge, no squat.
    const sinEvitar = findExercises({ pattern: 'lunge' });
    const conEvitar = findExercises({ pattern: 'lunge', evita: ['búlgara'] });
    expect(conEvitar.exercises.some((n) => n.id === 'bulgarian-split-squat')).toBe(false);
    expect(conEvitar.total).toBeLessThan(sinEvitar.total);
  });

  it('sin filtros recorta el catálogo al límite y reporta el total', () => {
    const r = findExercises({});
    expect(r.total).toBe(74);
    expect(r.exercises).toHaveLength(15); // límite por defecto
    const corto = findExercises({ limit: 5 });
    expect(corto.total).toBe(74);
    expect(corto.exercises).toHaveLength(5);
  });

  it('combina filtros: pierna sin material y sin cargas de rodilla', () => {
    const r = findExercises({ pattern: 'squat', equipment: ['ninguno'], evita: ['rodilla'] });
    for (const n of r.exercises) {
      expect(n.pattern).toBe('squat');
      expect(n.equipment).toContain('ninguno');
      const texto = [...(n.contraindications ?? []), n.name, ...(n.aliases ?? [])].join(' ').toLowerCase();
      expect(texto).not.toContain('rodilla');
    }
  });
});

describe('explainExercise', () => {
  it('resuelve por alias y devuelve la ficha completa', () => {
    const r = explainExercise('press militar');
    expect(r.exercise.id).toBe('ohp');
    expect(r.exercise.regression).toBeTruthy();
    expect(r.exercise.progression).toBeTruthy();
    expect(Array.isArray(r.exercise.contraindications)).toBe(true);
  });

  it('deriva sustitutos: la variante apunta a su lift canónico y a hermanos de patrón', () => {
    const r = explainExercise('Sentadilla Frontal');
    expect(r.exercise.id).toBe('front-squat');
    // El primer sustituto es el lift canónico (variantOf).
    expect(r.substitutes[0].id).toBe('squat');
    // Todos los sustitutos comparten patrón, y no hay duplicados.
    const ids = r.substitutes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of r.substitutes) expect(s.pattern).toBe('squat');
  });

  it('prioriza hermanos con el mismo material disponible', () => {
    // front-squat (barra): su hermano canónico squat también lleva barra y va
    // delante de las variantes sin material.
    const r = explainExercise('Sentadilla Frontal');
    const ids = r.substitutes.map((s) => s.id);
    expect(ids[0]).toBe('squat');
    expect(r.substitutes[0].equipment).toContain('barra');
  });

  it('devuelve null para lo que no está en el catálogo — no inventa', () => {
    expect(explainExercise('Curl Trucado de la Casa')).toBeNull();
    expect(explainExercise('')).toBeNull();
  });
});

describe('tools find_exercises / explain_exercise', () => {
  it('están registradas como tools de lectura', () => {
    const names = QUIRON_TOOLS.map((t) => t.function.name);
    expect(names).toContain('find_exercises');
    expect(names).toContain('explain_exercise');
  });

  it('find_exercises devuelve texto con la lista y el total', async () => {
    const exec = makeToolExecutor(DB, { ref: REF });
    const out = await exec('find_exercises', { pattern: 'squat' });
    expect(out).toContain('CATÁLOGO');
    expect(out).toContain('SOLO estos existen para prescribir');
    expect(out).toMatch(/\d+ ejercicio/);
  });

  it('find_exercises con `evita` por molestia saca los que la mencionan', async () => {
    const exec = makeToolExecutor(DB, { ref: REF });
    const out = await exec('find_exercises', { pattern: 'push_h', evita: ['hombro'] });
    expect(out).not.toContain('Press de Banca');
  });

  it('find_exercises sin resultados dice qué hacer y NO inventa', async () => {
    const exec = makeToolExecutor(DB, { ref: REF });
    const out = await exec('find_exercises', { pattern: 'patron_inexistente' });
    expect(out).toContain('Nada en el catálogo');
    expect(out).toContain('NO inventes');
  });

  it('explain_exercise devuelve la ficha con contraindicaciones, regresión y sustitutos', async () => {
    const exec = makeToolExecutor(DB, { ref: REF });
    const out = await exec('explain_exercise', { name: 'Sentadilla Frontal' });
    expect(out).toContain('front-squat');
    expect(out).toContain('CONTRAINDICACIONES');
    expect(out).toContain('regresión');
    expect(out).toContain('sustitutos');
  });

  it('explain_exercise con un nombre de catálogo desconocido se niega a inventar', async () => {
    const exec = makeToolExecutor(DB, { ref: REF });
    const out = await exec('explain_exercise', { name: 'Máquina de Extender la Voluntad' });
    expect(out).toContain('no está en el catálogo');
    expect(out).toContain('NO lo prescribas');
  });

  it('explain_exercise sin nombre pide el argumento', async () => {
    const exec = makeToolExecutor(DB, { ref: REF });
    expect(await exec('explain_exercise', {})).toContain('ERROR');
  });
});

