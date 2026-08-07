// Tests de los CHECKS de evals (evals/checks.mjs).
//
// Por qué esto existe: un comprobador que no caza nada pasa siempre, y un run en verde
// es indistinguible de un check roto. Aquí se le dan respuestas fabricadas a mano —una
// buena y una mala por cada criterio— y se exige que distinga. Si mañana alguien afina un
// regex de más, estos tests se ponen rojos antes de que un run mienta.

import { describe, it, expect } from 'vitest';
import { buildTruth, checkScenario, numbersOf, supported, isPrescriptive, joinThousands } from '../evals/checks.mjs';

// Verdad mínima: un atleta con sentadilla 128.3 y press 84.6 de e1RM y dos PRs.
const TRUTH = buildTruth({
  rms: {
    'Sentadilla': { best: { rm: 128.3, kg: 110, reps: 5, date: '2026-07-27' }, recent: null, sessions: 40 },
    'Press de Banca': { best: { rm: 84.6, kg: 72.5, reps: 5, date: '2026-05-04' }, recent: null, sessions: 40 },
  },
  prs: [{ name: 'Sentadilla', rm: 128.3, kg: 110, reps: 5, date: '2026-07-27' }],
  known: new Set(['Sentadilla', 'Press de Banca', 'Peso Muerto', 'Dominada Prono']),
});

// Un snapshot de mentira, pero con la forma real: es de donde sale el "soporte" numérico.
const SNAPSHOT = [
  'SEMANAS (lunes · fuerza ses/tonelaje · running ses/km):',
  '  2026-08-03: fuerza 4×/13682 kg · running 0×/0 km',
  'CARGA 7d vs media 28d: ratio 1.45 (pico de carga — precaución)',
  'e1RM (Epley — mejor histórico | mejor últimos 30d):',
  '  Sentadilla: 128.3 kg (110×5, 2026-07-27) | 128.3 kg (110×5)',
].join('\n');

const run = (over = {}) => ({ answer: '', snapshot: SNAPSHOT, calls: [], proposals: [], ...over });
const fails = (res, name) => res.hard.filter(c => !c.ok).map(c => c.name).includes(name);
const names = (res) => res.hard.filter(c => !c.ok).map(c => c.name);

describe('extracción de cifras', () => {
  it('agrupa por unidad, no por número suelto', () => {
    const nums = numbersOf('13682 kg · 0 km · ratio 1.45 · 110×5');
    expect(nums.kg).toContain(13682);
    expect(nums.kg).toContain(110);      // del par carga×reps
    expect(nums.km).toEqual([0]);
    expect(nums.ratio).toEqual([1.45]);
  });

  it('descarta los pares series×reps como si fueran carga', () => {
    expect(numbersOf('3×5').kg).toHaveLength(0);
  });

  it('tolera el redondeo pero no la invención', () => {
    expect(supported(128, [128.3])).toBe(true);
    expect(supported(1.4, [1.45])).toBe(true);
    expect(supported(18, [12.4])).toBe(false);
  });

  // Los tres siguientes salen de falsos positivos reales del primer run contra el modelo:
  // el checker denunciaba cifras que el agente no se había inventado. Quedan fijados.
  it('no denuncia las cargas de una lista prescriptiva por estar lejos del verbo', () => {
    const t = 'Baja sentadilla a 85 kg, peso muerto a 105 kg, banca a 60 kg, press militar a 35 kg.';
    expect(isPrescriptive(t, t.indexOf('35 kg'))).toBe(true);
  });

  it('reconoce un tope como prescripción', () => {
    const t = 'Prioriza un rodaje suave, corto (≤ 5 km), y no el mismo día que Sesión A.';
    expect(isPrescriptive(t, t.indexOf('5 km'))).toBe(true);
  });

  it('no amnistía un dato de la frase siguiente a una prescripción', () => {
    const t = 'Sube a 75 kg la próxima. Esta semana has corrido 18 km.';
    expect(isPrescriptive(t, t.indexOf('18 km'))).toBe(false);
  });

  it('une los millares separados por espacio', () => {
    expect(joinThousands('40 958 kg').trim()).toBe('40958 kg');
    expect(numbersOf('40 958 kg').kg).toEqual([40958]);
  });

  it('no toma por ratio un entero que solo va cerca de la palabra', () => {
    expect(numbersOf('el ratio alto y la acumulación de 4 sesiones').ratio).toEqual([]);
    expect(numbersOf('tu ratio de carga está en 0.92').ratio).toEqual([0.92]);
  });

  it('reconoce las cifras prescriptivas y los rangos', () => {
    const t = 'sube a 75 kg la próxima';
    expect(isPrescriptive(t, t.indexOf('75'))).toBe(true);
    const r = 'empieza con un rodaje de 4-5 km';
    expect(isPrescriptive(r, r.indexOf('5 km'))).toBe(true);
    const d = 'esta semana has movido 13682 kg';
    expect(isPrescriptive(d, d.indexOf('13682'))).toBe(false);
  });
});

describe('cifras respaldadas', () => {
  const sc = { id: 'x', grounded: true };

  it('acepta las que salen del snapshot', () => {
    const res = checkScenario(sc, run({ answer: 'Esta semana llevas 13682 kg y el ratio está en 1.45.' }), TRUTH);
    expect(names(res)).toEqual([]);
  });

  it('caza el kilometraje inventado — el fallo que motiva el check', () => {
    const res = checkScenario(sc, run({ answer: 'Esta semana has corrido 18 km, buen volumen.' }), TRUTH);
    expect(fails(res, 'cifras')).toBe(true);
  });

  it('caza un ratio que no es el calculado', () => {
    const res = checkScenario(sc, run({ answer: 'Tu ratio de carga está en 0.92, todo tranquilo.' }), TRUTH);
    expect(fails(res, 'cifras')).toBe(true);
  });

  it('acepta cifras que vienen de un resultado de herramienta, no del snapshot', () => {
    const r = run({
      answer: 'Tu mejor peso muerto fue 130 kg.',
      calls: [{ name: 'get_exercise_history', args: {}, result: '2026-07-27 [Peso Muerto] 130×5 — e1RM 151.7 kg' }],
    });
    expect(names(checkScenario(sc, r, TRUTH))).toEqual([]);
  });

  it('no exige respaldo a una recomendación', () => {
    const res = checkScenario(sc, run({ answer: 'La próxima sube a 112.5 kg en sentadilla.' }), TRUTH);
    expect(fails(res, 'cifras')).toBe(false);
  });
});

describe('cargas prescritas', () => {
  const sesion = (linea) => run({ answer: '```\nSESIÓN DE HOY — Fuerza\n─────────\n' + linea + '\n```' });

  it('pasa una carga por debajo del 1RM estimado', () => {
    const res = checkScenario({ id: 'x' }, sesion('Trabajo:  Sentadilla 3×5 a 110 kg'), TRUTH);
    expect(fails(res, 'carga')).toBe(false);
  });

  it('falla si prescribe por encima del 1RM estimado', () => {
    const res = checkScenario({ id: 'x' }, sesion('Trabajo:  Sentadilla 3×5 a 140 kg'), TRUTH);
    expect(fails(res, 'carga')).toBe(true);
  });

  it('marca en blando un ejercicio fuera del catálogo', () => {
    const res = checkScenario({ id: 'x' }, sesion('Trabajo:  Zancada Búlgara Aérea 3×8 a 20 kg'), TRUTH);
    expect(res.soft.filter(c => !c.ok).map(c => c.name)).toContain('vocabulario');
  });
});

describe('formato del bloque', () => {
  it('exige el bloque que pide el escenario', () => {
    const res = checkScenario({ id: 'x', expectBlock: 'RESUMEN' }, run({ answer: 'Vas bien, sigue así.' }), TRUTH);
    expect(fails(res, 'formato')).toBe(true);
  });

  it('rechaza markdown dentro del bloque (no se renderiza)', () => {
    const res = checkScenario({ id: 'x' }, run({ answer: '```\nRESUMEN — semana\n**Volumen:** 13682 kg\n```' }), TRUTH);
    expect(fails(res, 'bloque-limpio')).toBe(true);
  });

  it('rechaza líneas que se cortan en móvil', () => {
    const larga = 'Trabajo: ' + 'Sentadilla con pausa en el hoyo y tempo controlado 3×5 a 100 kg';
    const res = checkScenario({ id: 'x' }, run({ answer: '```\nSESIÓN DE HOY\n' + larga + '\n```' }), TRUTH);
    expect(fails(res, 'bloque-limpio')).toBe(true);
  });

  it('acepta la tabla con sus separadores', () => {
    const res = checkScenario({ id: 'x' }, run({ answer: '```\nRESUMEN — semana\n─────────────────\nVolumen: 13682 kg\n```' }), TRUTH);
    expect(names(res)).toEqual([]);
  });
});

describe('PR declarado', () => {
  it('acepta un PR que existe', () => {
    const res = checkScenario({ id: 'x' }, run({ answer: 'PR detectado: Sentadilla — 110×5 🎯' }), TRUTH);
    expect(fails(res, 'pr')).toBe(false);
  });

  it('falla si declara un PR de un ejercicio estancado', () => {
    const res = checkScenario({ id: 'x' }, run({ answer: 'PR detectado: Press de Banca — 72.5×5 🎯' }), TRUTH);
    expect(fails(res, 'pr')).toBe(true);
  });

  it('falla si dice "ninguno" habiendo PRs', () => {
    const res = checkScenario({ id: 'x' }, run({ answer: 'PR detectado: ninguno' }), TRUTH);
    expect(fails(res, 'pr')).toBe(true);
  });
});

describe('ruteo de escritura', () => {
  const sc = { id: 'x', expectTool: 'propose_session', banTool: ['propose_program'] };

  it('pasa cuando pide la herramienta correcta con una descripción con sustancia', () => {
    const r = run({
      calls: [{ name: 'propose_session', args: {}, result: 'ok' }],
      proposals: [{ type: 'session_request', goal: 'Sesión de pierna de 45 minutos con sentadilla a 100 kg' }],
    });
    expect(names(checkScenario(sc, r, TRUTH))).toEqual([]);
  });

  it('falla cuando confunde una sesión con un plan', () => {
    const r = run({
      calls: [{ name: 'propose_program', args: {}, result: 'ok' }],
      proposals: [{ type: 'program_request', goal: 'Plan de fuerza de 8 semanas' }],
    });
    expect(fails(checkScenario(sc, r, TRUTH), 'ruteo')).toBe(true);
  });

  it('falla cuando rutea bien pero manda una intención vacía', () => {
    const r = run({
      calls: [{ name: 'propose_session', args: {}, result: 'ok' }],
      proposals: [{ type: 'session_request', goal: 'pierna' }],
    });
    expect(fails(checkScenario(sc, r, TRUTH), 'propuesta')).toBe(true);
  });
});

describe('idioma', () => {
  it('falla si responde en inglés', () => {
    const res = checkScenario({ id: 'x' }, run({ answer: 'This is the summary of your week and the load is fine for you.' }), TRUTH);
    expect(fails(res, 'idioma')).toBe(true);
  });
});
