// Los 7 dominios. Las dos reglas que gobiernan el sistema —el nivel de un
// dominio es el mínimo de sus métricas, el nivel global es el mínimo de los
// dominios— son la tesis del producto: si se rompen, el producto miente.
import { describe, it, expect } from 'vitest';
import {
  DOMAINS, METRICS, levelFor, bodyweight, derivedMetrics, latestTests,
  computeProfile, nextTest, formatMetric, daysSince,
} from '../js/domains.js';

const HOY = new Date('2026-08-04T12:00:00');

const db = (over = {}) => ({
  workouts: [], bodyLogs: [], runningLogs: [], domainTests: [],
  settings: {}, ...over,
});

const conPeso = (kg = 75) => [{ id: 1, date: '2026-08-01', peso: kg }];

/** Un workout con una serie de un ejercicio. */
const wk = (date, name, sets) => ({ id: +new Date(date), date, session: 'A', exercises: [{ name, sets }] });

describe('estructura', () => {
  it('son exactamente 7 dominios y ninguno se queda sin métricas', () => {
    expect(DOMAINS).toHaveLength(7);
    for (const d of DOMAINS) expect(d.metrics.length).toBeGreaterThan(0);
  });

  it('cada métrica tiene sus cinco umbrales, monótonos en su dirección', () => {
    for (const { key, metric: m } of Object.values(METRICS)) {
      expect(m.levels, key).toHaveLength(5);
      for (let i = 1; i < 5; i++) {
        if (m.dir === 'down') expect(m.levels[i], key).toBeLessThan(m.levels[i - 1]);
        else expect(m.levels[i], key).toBeGreaterThan(m.levels[i - 1]);
      }
    }
  });

  it('todo dominio que no se deriva entero trae protocolo de test', () => {
    for (const d of DOMAINS) {
      if (d.metrics.some(m => !m.derived)) expect(d.protocol, d.id).toBeTruthy();
    }
  });
});

describe('levelFor', () => {
  const squat = METRICS.squat.metric;   // up: 0.75 / 1.0 / 1.25 / 1.5 / 1.75
  const k5 = METRICS.run5k.metric;      // down: 30 / 28 / 25 / 22 / 19

  it('sin dato es 0, que no es lo mismo que nivel I', () => {
    expect(levelFor(squat, null)).toBe(0);
    expect(levelFor(squat, undefined)).toBe(0);
    expect(levelFor(squat, NaN)).toBe(0);
  });

  it('medir y quedar por debajo del umbral I sigue siendo nivel I', () => {
    expect(levelFor(squat, 0.3)).toBe(1);
  });

  it('escala hacia arriba en los umbrales exactos', () => {
    expect(levelFor(squat, 0.75)).toBe(1);
    expect(levelFor(squat, 1.0)).toBe(2);
    expect(levelFor(squat, 1.24)).toBe(2);
    expect(levelFor(squat, 1.25)).toBe(3);
    expect(levelFor(squat, 1.5)).toBe(4);
    expect(levelFor(squat, 5)).toBe(5);
  });

  it('en las métricas de tiempo, menos es más', () => {
    expect(levelFor(k5, 32)).toBe(1);
    expect(levelFor(k5, 30)).toBe(1);
    expect(levelFor(k5, 25)).toBe(3);
    expect(levelFor(k5, 18)).toBe(5);
  });
});

describe('derivación desde lo ya registrado', () => {
  it('el ratio de fuerza usa el peso corporal más reciente', () => {
    const d = db({
      bodyLogs: [{ id: 1, date: '2026-01-01', peso: 100 }, { id: 2, date: '2026-07-01', peso: 80 }],
      workouts: [wk('2026-07-02', 'Sentadilla', [{ kg: '100', reps: '1' }])],
    });
    expect(bodyweight(d)).toBe(80);
    expect(derivedMetrics(d).squat.value).toBe(1.25);
  });

  it('sin peso corporal no inventa ratios de fuerza', () => {
    const d = db({ workouts: [wk('2026-07-02', 'Sentadilla', [{ kg: '100', reps: '5' }])] });
    expect(derivedMetrics(d).squat).toBeUndefined();
  });

  it('reconoce los cuatro básicos aunque cambie el nombre en el plan', () => {
    const d = db({
      bodyLogs: conPeso(100),
      workouts: [
        wk('2026-07-01', 'Sentadilla trasera', [{ kg: '100', reps: '1' }]),
        wk('2026-07-02', 'Peso Muerto', [{ kg: '150', reps: '1' }]),
        wk('2026-07-03', 'Press de Banca', [{ kg: '100', reps: '1' }]),
        wk('2026-07-04', 'Press Militar', [{ kg: '70', reps: '1' }]),
      ],
    });
    const m = derivedMetrics(d);
    expect(m.squat.value).toBe(1);
    expect(m.deadlift.value).toBe(1.5);
    expect(m.bench.value).toBe(1);
    expect(m.ohp.value).toBe(0.7);
  });

  it('las dominadas con lastre no cuentan como dominadas de peso corporal', () => {
    const d = db({
      workouts: [
        wk('2026-07-01', 'Dominada Prono', [{ kg: '20', reps: '30' }, { kg: '', reps: '12' }]),
      ],
    });
    expect(derivedMetrics(d).pullups.value).toBe(12);
  });

  it('normaliza a 5.000 m exactos y se queda con la mejor', () => {
    const d = db({
      runningLogs: [
        { date: '2026-06-01', distance: 5, duration: 1500 },      // 25:00
        { date: '2026-07-01', distance: 5.2, duration: 1500 },    // 24:02 normalizado
        { date: '2026-07-15', distance: 10, duration: 2400 },     // no es un 5K
      ],
    });
    expect(derivedMetrics(d).run5k.value).toBeCloseTo(24.04, 1);
    expect(derivedMetrics(d).run5k.date).toBe('2026-07-01');
  });

  it('el 5K declarado en Ajustes vale si no hay una carrera mejor', () => {
    const d = db({ settings: { race5k: 1380 } });   // 23:00
    expect(derivedMetrics(d).run5k.value).toBe(23);

    const conCarrera = db({
      settings: { race5k: 1380 },
      runningLogs: [{ date: '2026-07-01', distance: 5, duration: 1260 }],  // 21:00
    });
    expect(derivedMetrics(conCarrera).run5k.value).toBe(21);
  });
});

describe('tests manuales', () => {
  it('se queda con el más reciente de cada métrica', () => {
    const d = db({
      domainTests: [
        { id: 1, metric: 'ake', value: 5, date: '2026-01-01' },
        { id: 2, metric: 'ake', value: 12, date: '2026-06-01' },
      ],
    });
    expect(latestTests(d).ake.value).toBe(12);
  });

  it('ignora métricas que no existen en el modelo', () => {
    const d = db({ domainTests: [{ id: 1, metric: 'inventada', value: 9, date: '2026-06-01' }] });
    expect(latestTests(d).inventada).toBeUndefined();
  });

  it('un test manual gana a la derivación aunque la derivación sea mejor', () => {
    // Dominadas: el historial dice 20, pero hoy te has medido 12.
    const d = db({
      workouts: [wk('2025-01-01', 'Dominada Prono', [{ kg: '', reps: '20' }])],
      domainTests: [{ id: 1, metric: 'pullups', value: 12, date: '2026-08-01' }],
    });
    const pull = computeProfile(d, HOY).domains.find(x => x.id === 'pull');
    expect(pull.metrics[0].value).toBe(12);
    expect(pull.metrics[0].source).toBe('test');
  });
});

describe('regla 1: el dominio vale su métrica más baja', () => {
  it('un OHP rezagado define Fuerza máxima, no la media', () => {
    const d = db({
      bodyLogs: conPeso(100),
      workouts: [
        wk('2026-07-01', 'Sentadilla', [{ kg: '175', reps: '1' }]),      // V
        wk('2026-07-01', 'Peso Muerto', [{ kg: '200', reps: '1' }]),     // V
        wk('2026-07-01', 'Press de Banca', [{ kg: '140', reps: '1' }]),  // V
        wk('2026-07-01', 'Press Militar', [{ kg: '55', reps: '1' }]),    // II
      ],
    });
    const s = computeProfile(d, HOY).domains.find(x => x.id === 'strength');
    expect(s.level).toBe(2);
    expect(s.weakest.key).toBe('ohp');
  });

  it('el core lo define el peor de los tres tests de McGill', () => {
    const d = db({
      domainTests: [
        { id: 1, metric: 'mcgillFlexor', value: 180, date: '2026-08-01' },   // V
        { id: 2, metric: 'mcgillExtensor', value: 180, date: '2026-08-01' }, // V
        { id: 3, metric: 'mcgillSide', value: 45, date: '2026-08-01' },      // II
      ],
    });
    const c = computeProfile(d, HOY).domains.find(x => x.id === 'core');
    expect(c.level).toBe(2);
  });

  it('una métrica sin medir no arrastra el dominio a cero', () => {
    // Solo AKE medido: movilidad vale lo que el AKE, y la dorsiflexión queda pendiente.
    const d = db({ domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-08-01' }] });
    const m = computeProfile(d, HOY).domains.find(x => x.id === 'mobility');
    expect(m.level).toBe(4);
    expect(m.complete).toBe(false);
    expect(m.missing.map(x => x.key)).toEqual(['dorsiflexion']);
  });
});

describe('regla 2: el nivel global es el mínimo de los dominios', () => {
  it('el limitante es el dominio más bajo y se nombra', () => {
    const d = db({
      bodyLogs: conPeso(100),
      workouts: [wk('2026-07-01', 'Sentadilla', [{ kg: '150', reps: '1' }])],   // fuerza IV
      runningLogs: [{ date: '2026-07-01', distance: 5, duration: 1200 }],       // cardio V
      domainTests: [{ id: 1, metric: 'ake', value: -10, date: '2026-08-01' }],  // movilidad I
    });
    const p = computeProfile(d, HOY);
    expect(p.level).toBe(1);
    expect(p.limitedBy.id).toBe('mobility');
  });

  it('sin ningún dominio medido no se afirma un nivel', () => {
    const p = computeProfile(db(), HOY);
    expect(p.level).toBe(0);
    expect(p.limitedBy).toBeNull();
    expect(p.measured).toBe(0);
  });

  it('con dominios sin medir el nivel es provisional', () => {
    const d = db({ domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-08-01' }] });
    const p = computeProfile(d, HOY);
    expect(p.provisional).toBe(true);
    expect(p.measured).toBe(1);
    expect(p.total).toBe(7);
  });

  it('los dominios sin medir NO cuentan como nivel 0 en el global', () => {
    // Si contaran, cualquier perfil incompleto daría nivel 0 y el radar no diría nada.
    const d = db({ domainTests: [{ id: 1, metric: 'ake', value: 25, date: '2026-08-01' }] });
    expect(computeProfile(d, HOY).level).toBe(5);
  });
});

describe('caducidad y siguiente test', () => {
  it('un test viejo caduca según el periodo de su dominio', () => {
    // Movilidad se re-testea cada 6 semanas (42 días).
    const reciente = db({ domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-07-20' }] });
    const viejo = db({ domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-01-01' }] });
    const mob = p => computeProfile(p, HOY).domains.find(x => x.id === 'mobility');
    expect(mob(reciente).stale).toBe(false);
    expect(mob(viejo).stale).toBe(true);
  });

  it('propone primero lo que nunca se ha medido', () => {
    const n = nextTest(computeProfile(db(), HOY));
    expect(n.reason).toBe('nunca');
    expect(n.domain.protocol).toBeTruthy();
  });

  it('con todo medido propone lo más caducado', () => {
    const d = db({
      bodyLogs: conPeso(100),
      workouts: [
        wk('2026-07-01', 'Sentadilla', [{ kg: '150', reps: '1' }]),
        wk('2026-07-01', 'Peso Muerto', [{ kg: '180', reps: '1' }]),
        wk('2026-07-01', 'Press de Banca', [{ kg: '120', reps: '1' }]),
        wk('2026-07-01', 'Press Militar', [{ kg: '85', reps: '1' }]),
      ],
      runningLogs: [{ date: '2026-07-20', distance: 5, duration: 1300 }],
      domainTests: [
        { id: 1, metric: 'pullups', value: 18, date: '2026-07-25' },
        { id: 2, metric: 'run400', value: 62, date: '2026-07-25' },
        { id: 3, metric: 'sns', value: 32, date: '2026-07-25' },
        { id: 4, metric: 'mcgillFlexor', value: 150, date: '2026-07-25' },
        { id: 5, metric: 'mcgillExtensor', value: 150, date: '2026-07-25' },
        { id: 6, metric: 'mcgillSide', value: 75, date: '2026-07-25' },
        { id: 7, metric: 'ake', value: 16, date: '2024-01-01' },        // muy caducado
        { id: 8, metric: 'dorsiflexion', value: 11, date: '2024-01-01' },
      ],
    });
    const p = computeProfile(d, HOY);
    expect(p.provisional).toBe(false);
    const n = nextTest(p);
    expect(n.reason).toBe('caducado');
    expect(n.domain.id).toBe('mobility');
  });
});

describe('presentación', () => {
  it('los minutos se leen como tiempo, no como decimal', () => {
    expect(formatMetric({ unit: 'min', value: 24.5 })).toBe('24:30');
    expect(formatMetric({ unit: 'min', value: 19 })).toBe('19:00');
  });

  it('los ratios llevan el signo × y los ángulos su signo', () => {
    expect(formatMetric({ unit: '×BW', value: 1.5 })).toBe('1.50×');
    expect(formatMetric({ unit: '°', value: 12 })).toBe('+12°');
    expect(formatMetric({ unit: '°', value: -3 })).toBe('-3°');
  });

  it('sin valor no dibuja un cero que parezca un dato', () => {
    expect(formatMetric({ unit: 'reps', value: null })).toBe('—');
  });

  it('daysSince tolera fechas ausentes o corruptas', () => {
    expect(daysSince(null, HOY)).toBeNull();
    expect(daysSince('no-es-fecha', HOY)).toBeNull();
    expect(daysSince('2026-08-01', HOY)).toBe(3);
  });
});
