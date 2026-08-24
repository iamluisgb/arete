// La progresión es función pura del historial: nada se escribe de vuelta en un
// entreno terminado. Lo que se comprueba aquí es sobre todo lo que NO debe pasar
// — que una sesión fallada no suba el peso, que una pesa rusa no suba de 2,5 en
// 2,5, y que un modo sin objetivo numérico no reciba una regla inventada.
import { describe, it, expect } from 'vitest';
import {
  parseReps, loadKind, incrementFor, readSession, sessionsFor, stallCount,
  nextPrescription, DELOAD_AFTER, BELLS,
} from '../js/progression.js';

/** Un entreno con un ejercicio y sus series. */
const wk = (date, name, sets, over = {}) => ({
  id: +new Date(date), date, session: 'A', phase: 1, program: 'arete',
  exercises: [{ name, sets }], ...over,
});
const db = (workouts = []) => ({ workouts });
/** n series iguales. */
const rep = (n, kg, reps) => Array.from({ length: n }, () => ({ kg: String(kg), reps: String(reps) }));

const SENTADILLA = { name: 'Sentadilla', sets: 3, reps: '5', type: 'main' };

describe('parseReps', () => {
  it('distingue las nueve formas en que los planes escriben las reps', () => {
    expect(parseReps('5')).toMatchObject({ kind: 'fixed', min: 5, max: 5 });
    expect(parseReps('8-12')).toMatchObject({ kind: 'range', min: 8, max: 12 });
    expect(parseReps('5/lado')).toMatchObject({ kind: 'fixed', min: 5 });
    expect(parseReps('10/pierna')).toMatchObject({ kind: 'fixed', min: 10 });
    expect(parseReps('F')).toMatchObject({ kind: 'amrap' });
    expect(parseReps('Tiempo')).toMatchObject({ kind: 'none' });
    expect(parseReps('Práctica')).toMatchObject({ kind: 'none' });
    expect(parseReps('Total reps')).toMatchObject({ kind: 'none' });
    expect(parseReps(null)).toMatchObject({ kind: 'none' });
  });

  // Lo encontró el historial real: una plancha de '2min' se leía como "2 reps",
  // se cumplía siempre, y el motor le subía el peso a un ejercicio sin peso.
  it('un aguante cronometrado no es un objetivo de repeticiones', () => {
    for (const spec of ['2min', '1min/lado', '30s', '45 seg', '1:30']) {
      expect(parseReps(spec), spec).toMatchObject({ kind: 'none' });
    }
  });

  it('una plancha del plan real se queda fuera de la progresión', () => {
    const d = db([wk('2026-07-01', 'Plancha Abdominal', rep(2, '', 120))]);
    expect(nextPrescription(d, { name: 'Plancha Abdominal', sets: 2, reps: '2min' }).kind).toBe('off');
  });
});

describe('la herramienta decide el salto', () => {
  it('una pesa rusa sube de pesa en pesa, no de 2,5 en 2,5', () => {
    expect(loadKind('Swing 1 Mano')).toBe('kb');
    expect(loadKind('Levantamiento Turco')).toBe('kb');
    // En kettlebell.json los nombres son genéricos: solo el programa lo delata.
    expect(loadKind('Squat', 'kettlebell')).toBe('kb');
    expect(incrementFor('Swing')).toBe(4);
  });

  it('el tren inferior con barra salta 5 kg y el resto 2,5', () => {
    expect(incrementFor('Sentadilla')).toBe(5);
    expect(incrementFor('Peso Muerto')).toBe(5);
    expect(incrementFor('Press de Banca')).toBe(2.5);
    expect(incrementFor('Curl con Barra')).toBe(2.5);
  });
});

describe('leer la sesión con honestidad', () => {
  it('una serie sin rellenar es una serie fallada, no una serie ausente', () => {
    const s = readSession({ sets: [{ kg: '100', reps: '5' }, { kg: '100', reps: '5' }, { kg: '', reps: '' }] }, SENTADILLA);
    expect(s.ok).toBe(false);
    expect(s.count).toBe(3);
    expect(s.low).toBe(0);
  });

  it('menos series de las que pedía el plan no es una sesión cumplida', () => {
    const s = readSession({ sets: rep(2, 100, 5) }, SENTADILLA);
    expect(s.ok).toBe(false);
  });

  it('todas las series con sus reps sí lo es', () => {
    expect(readSession({ sets: rep(3, 100, 5) }, SENTADILLA).ok).toBe(true);
  });

  it('pasarse de reps también cuenta como cumplida', () => {
    expect(readSession({ sets: rep(3, 100, 7) }, SENTADILLA).ok).toBe(true);
  });
});

describe('progresión lineal', () => {
  it('la primera vez no inventa un peso', () => {
    const p = nextPrescription(db(), SENTADILLA);
    expect(p.kind).toBe('first');
    expect(p.kg).toBeUndefined();
  });

  it('sesión cumplida sube un salto, y dice por qué', () => {
    const p = nextPrescription(db([wk('2026-07-01', 'Sentadilla', rep(3, 100, 5))]), SENTADILLA);
    expect(p).toMatchObject({ kind: 'up', kg: 105 });
    expect(p.why).toContain('5 kg más');
  });

  it('una sesión fallada NUNCA sube el peso', () => {
    const p = nextPrescription(db([wk('2026-07-01', 'Sentadilla', [
      { kg: '100', reps: '5' }, { kg: '100', reps: '5' }, { kg: '100', reps: '3' },
    ])]), SENTADILLA);
    expect(p).toMatchObject({ kind: 'hold', kg: 100 });
    expect(p.why).toContain('2 intentos');
  });

  it(`a las ${DELOAD_AFTER} sesiones falladas seguidas descarga un 10 %`, () => {
    const fallada = (d) => wk(d, 'Sentadilla', [{ kg: '100', reps: '5' }, { kg: '100', reps: '4' }, { kg: '100', reps: '3' }]);
    const p = nextPrescription(db([fallada('2026-07-01'), fallada('2026-07-03'), fallada('2026-07-05')]), SENTADILLA);
    expect(p).toMatchObject({ kind: 'deload', kg: 90 });
  });

  it('una sesión cumplida en medio reinicia la cuenta de fallos', () => {
    const fallada = (d) => wk(d, 'Sentadilla', [{ kg: '100', reps: '3' }, { kg: '100', reps: '3' }, { kg: '100', reps: '3' }]);
    const d = db([fallada('2026-07-01'), wk('2026-07-03', 'Sentadilla', rep(3, 100, 5)), fallada('2026-07-05')]);
    expect(stallCount(sessionsFor(d, 'Sentadilla', SENTADILLA))).toBe(1);
    expect(nextPrescription(d, SENTADILLA).kind).toBe('hold');
  });

  // 42,5 + 5 daba 50 al cuadrar el resultado a un múltiplo del salto: un salto de
  // 7,5 kg disfrazado de progresión lineal.
  it('el salto es el salto, aunque el peso de partida no esté en la rejilla', () => {
    const p = nextPrescription(db([wk('2026-07-01', 'Sentadilla', rep(3, 42.5, 5))]), SENTADILLA);
    expect(p).toMatchObject({ kind: 'up', kg: 47.5 });
  });

  it('con un solo intento restante lo dice en singular', () => {
    const fallada = (d) => wk(d, 'Sentadilla', [{ kg: '100', reps: '5' }, { kg: '100', reps: '3' }, { kg: '100', reps: '3' }]);
    const p = nextPrescription(db([fallada('2026-07-01'), fallada('2026-07-03')]), SENTADILLA);
    expect(p.why).toContain('queda 1 intento antes');
  });

  it('la descarga cae en un peso cargable, no en 91,3', () => {
    const fallada = (d, kg) => wk(d, 'Press de Banca', [{ kg: String(kg), reps: '5' }, { kg: String(kg), reps: '2' }]);
    const p = nextPrescription(
      db([fallada('2026-07-01', 62.5), fallada('2026-07-03', 62.5), fallada('2026-07-05', 62.5)]),
      { name: 'Press de Banca', sets: 2, reps: '5' });
    expect(p.kind).toBe('deload');
    expect(p.kg % 2.5).toBe(0);
  });
});

describe('doble progresión en un rango', () => {
  const CURL = { name: 'Curl con Mancuernas', sets: 3, reps: '8-12' };

  it('llegar al tope del rango sube el peso y devuelve las reps al suelo', () => {
    const p = nextPrescription(db([wk('2026-07-01', 'Curl con Mancuernas', rep(3, 20, 12))]), CURL);
    expect(p).toMatchObject({ kind: 'up', kg: 22.5, reps: 8 });
  });

  it('sin llegar al tope, mismo peso y una rep más sobre la serie más floja', () => {
    const p = nextPrescription(db([wk('2026-07-01', 'Curl con Mancuernas', [
      { kg: '20', reps: '12' }, { kg: '20', reps: '10' }, { kg: '20', reps: '9' },
    ])]), CURL);
    expect(p).toMatchObject({ kind: 'hold', kg: 20, reps: 10 });
  });
});

describe('pesa rusa', () => {
  const SWING = { name: 'Swing 1 Mano', sets: 3, reps: '10' };

  it('sube a la siguiente pesa de la escala, no +2,5', () => {
    const p = nextPrescription(db([wk('2026-07-01', 'Swing 1 Mano', rep(3, 20, 10))]), SWING);
    expect(p).toMatchObject({ kind: 'up', kg: 24 });
    expect(BELLS).toContain(p.kg);
  });

  it('la descarga también cae en una pesa que existe', () => {
    const fallada = (d) => wk(d, 'Swing 1 Mano', [{ kg: '24', reps: '10' }, { kg: '24', reps: '6' }, { kg: '24', reps: '5' }]);
    const p = nextPrescription(db([fallada('2026-07-01'), fallada('2026-07-03'), fallada('2026-07-05')]), SWING);
    expect(p).toMatchObject({ kind: 'deload', kg: 20 });
  });
});

// Los dos fallos que solo aparecieron al pasar el motor por el historial real.
describe('lo que destapó el historial real', () => {
  it('una carga de barra no baja a "la pesa anterior" aunque el nombre suene a pesa', () => {
    // 'Squat' en el programa de kettlebell se clasifica como pesa, pero 100 kg es
    // una barra: sin guardia, la descarga mandaba de 100 kg a 48.
    const fallada = (d) => wk(d, 'Squat', [{ kg: '100', reps: '5' }, { kg: '100', reps: '3' }], { program: 'kettlebell' });
    const p = nextPrescription(
      db([fallada('2026-07-01'), fallada('2026-07-03'), fallada('2026-07-05')]),
      { name: 'Squat', sets: 2, reps: '5' }, 'kettlebell');
    expect(p).toMatchObject({ kind: 'deload', kg: 90 });
  });

  it('cambiar el objetivo del plan no dispara una descarga retroactiva', () => {
    // Areté no guarda la prescripción con el entreno: al pasar el plan de 3x5 a
    // 3x10, todo el histórico se relee como fallado. Pero el peso venía SUBIENDO,
    // así que no hay estancamiento que descargar.
    const d = db([
      wk('2026-07-01', 'Sentadilla', rep(3, 90, 5)),
      wk('2026-07-03', 'Sentadilla', rep(3, 95, 5)),
      wk('2026-07-05', 'Sentadilla', rep(3, 100, 5)),
    ]);
    const p = nextPrescription(d, { name: 'Sentadilla', sets: 3, reps: '10' });
    expect(p.kind).toBe('hold');
    expect(p.kg).toBe(100);
  });

  it('pero un estancamiento de verdad —mismo peso, reps falladas— sí descarga', () => {
    const fallada = (d) => wk(d, 'Sentadilla', [{ kg: '100', reps: '5' }, { kg: '100', reps: '4' }, { kg: '100', reps: '3' }]);
    const d = db([wk('2026-06-29', 'Sentadilla', rep(3, 95, 5)), fallada('2026-07-01'), fallada('2026-07-03'), fallada('2026-07-05')]);
    expect(stallCount(sessionsFor(d, 'Sentadilla', SENTADILLA))).toBe(3);
    expect(nextPrescription(d, SENTADILLA)).toMatchObject({ kind: 'deload', kg: 90 });
  });
});

describe('peso corporal', () => {
  it('progresa en reps, no en kg', () => {
    const FONDOS = { name: 'Fondos', sets: 3, reps: '8' };
    const p = nextPrescription(db([wk('2026-07-01', 'Fondos', rep(3, '', 8))]), FONDOS);
    expect(p).toMatchObject({ kind: 'up', reps: 9 });
    expect(p.kg).toBeUndefined();
  });

  it('el disparador es el peso registrado, no el nombre: con lastre vuelve a la barra', () => {
    const DOM = { name: 'Dominada Prono', sets: 3, reps: '8' };
    const p = nextPrescription(db([wk('2026-07-01', 'Dominada Prono', rep(3, 10, 8))]), DOM);
    expect(p).toMatchObject({ kind: 'up', kg: 12.5 });
  });

  it('al fallo no prescribe un objetivo: recuerda la marca a batir', () => {
    const DOM = { name: 'Dominada Prono', sets: 3, reps: 'F' };
    const p = nextPrescription(db([
      wk('2026-07-01', 'Dominada Prono', [{ kg: '', reps: '9' }, { kg: '', reps: '7' }, { kg: '', reps: '6' }]),
    ]), DOM);
    expect(p.kind).toBe('hold');
    expect(p.why).toContain('9');
  });
});

describe('lo que la progresión no toca', () => {
  it('un modo que no es de series se queda fuera', () => {
    for (const mode of ['rounds', 'amrap', 'emom', 'tabata', 'interval', 'ladder', 'pyramid']) {
      expect(nextPrescription(db(), { name: 'X', mode, sets: 3, reps: '10' }).kind).toBe('off');
    }
  });

  it('un objetivo no numérico no recibe una regla inventada', () => {
    for (const reps of ['Tiempo', 'Práctica', 'Total reps', null]) {
      expect(nextPrescription(db(), { name: 'Plancha', sets: 3, reps }).kind).toBe('off');
    }
  });
});

describe('el hilo de progresión es (ejercicio, objetivo)', () => {
  it('3x5 y 3x10 del mismo ejercicio no se mezclan', () => {
    const d = db([
      wk('2026-07-01', 'Sentadilla', rep(3, 60, 10), { spec: [{ name: 'Sentadilla', sets: 3, reps: '10' }], sessionId: 'x' }),
      wk('2026-07-02', 'Sentadilla', rep(3, 100, 5)),
    ]);
    // El pesado sube desde 100, no desde el ligero de 60 que también se cumplió.
    expect(nextPrescription(d, SENTADILLA)).toMatchObject({ kind: 'up', kg: 105 });
  });

  it('el mismo ejercicio en otra sesión sí cuenta: una sentadilla es una sentadilla', () => {
    const d = db([
      wk('2026-07-01', 'Sentadilla', rep(3, 100, 5), { session: 'B' }),
    ]);
    expect(nextPrescription(d, SENTADILLA)).toMatchObject({ kind: 'up', kg: 105 });
  });
});
