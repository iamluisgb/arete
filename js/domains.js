// ── Los 7 dominios del Atleta Híbrido ────────────────────
//
// La tesis del producto vivía solo en `blog/8-dominios.html`: la app abría con
// cuatro anillos genéricos y no mencionaba los dominios ni una vez. Este módulo
// es esa tesis hecha código, y es la fuente de verdad del perfil.
//
// Dos reglas gobiernan todo:
//   1. El nivel de un dominio es el MÍNIMO de sus métricas. Un OHP rezagado no
//      se disuelve en la media de los otros tres levantamientos.
//   2. El nivel global es el MÍNIMO de los dominios medidos. La cadena vale lo
//      que su eslabón débil; por eso el perfil dice de qué estás limitado.
//
// Las métricas llegan por dos vías y el perfil distingue una de otra:
//   · DERIVADAS — se calculan de lo que ya registras (1RM de las series,
//     dominadas del historial, mejor 5K de las carreras). Salen gratis.
//   · MEDIDAS   — requieren un test con protocolo (400m, McGill, AKE, S&S).
//     Caducan: un dato de hace ocho meses no describe el cuerpo de hoy.
//
// CALIBRACIÓN: los umbrales están calibrados sobre normativos de hombre de
// ~75 kg (StrengthLevel, McGill 2015, Tsatsouline 2013). Para mujeres, la
// referencia de fuerza es ~0.7× estos ratios y el S&S usa 24/32 kg en vez de
// 32/48. Está declarado en el perfil, no escondido: ver `CALIBRATION_NOTE`.

export const ROMAN = ['—', 'I', 'II', 'III', 'IV', 'V'];
export const LEVEL_NAMES = ['Sin medir', 'Aprendiz', 'Novato', 'Intermedio', 'Avanzado', 'Atleta Híbrido'];

export const CALIBRATION_NOTE =
  'Umbrales calibrados sobre normativos de hombre de ~75 kg. Si eres mujer, la '
  + 'referencia de fuerza ronda el 0,7× de estos ratios y el S&S usa 24/32 kg.';

/** Cada cuánto conviene repetir un test, en días (tabla del artículo). */
export const RETEST_DAYS = { cheap: 42, expensive: 70 };

// ── Definición de los dominios ───────────────────────────
//
// `levels` son los cinco umbrales I..V. `dir:'up'` = más es mejor;
// `dir:'down'` = menos es mejor (tiempos).

export const DOMAINS = [
  {
    id: 'strength',
    name: 'Fuerza máxima',
    short: 'Fuerza máx',
    icon: 'fitness_center',
    color: 'var(--color-accent-text)',
    why: 'Producción de fuerza máxima con barra, en ratio a tu peso corporal.',
    metrics: [
      { key: 'squat', label: 'Sentadilla', unit: '×BW', dir: 'up', levels: [0.75, 1.0, 1.25, 1.5, 1.75], derived: true },
      { key: 'deadlift', label: 'Peso muerto', unit: '×BW', dir: 'up', levels: [1.0, 1.25, 1.5, 1.8, 2.0], derived: true },
      { key: 'bench', label: 'Press de banca', unit: '×BW', dir: 'up', levels: [0.6, 0.8, 1.0, 1.2, 1.4], derived: true },
      { key: 'ohp', label: 'Press militar', unit: '×BW', dir: 'up', levels: [0.4, 0.55, 0.7, 0.85, 1.0], derived: true },
    ],
  },
  {
    id: 'pull',
    name: 'Fuerza de tracción',
    short: 'Tracción',
    icon: 'front_hand',
    color: 'var(--color-state-info)',
    why: 'Tracción vertical con peso corporal — lo que la barra no cubre.',
    protocol: 'Máximas dominadas estrictas: desde colgada muerta, sin kip ni balanceo, barbilla por encima de la barra.',
    retest: RETEST_DAYS.cheap,
    metrics: [
      { key: 'pullups', label: 'Dominadas estrictas', unit: 'reps', dir: 'up', levels: [1, 5, 10, 18, 25], derived: true },
    ],
  },
  {
    id: 'glyco',
    name: 'Capacidad glicolítica',
    short: 'Glicolítico',
    icon: 'bolt',
    color: 'var(--color-state-danger)',
    why: 'La vía intermedia: 40-90 s de potencia sostenida. El hueco entre el 1RM y el 5K.',
    protocol: '400 m en pista, a tope, con calentamiento previo. Un solo intento.',
    retest: RETEST_DAYS.expensive,
    metrics: [
      { key: 'run400', label: '400 m', unit: 's', dir: 'down', levels: [75, 70, 65, 60, 55] },
    ],
  },
  {
    id: 'cardio',
    name: 'Resistencia aeróbica',
    short: 'Cardio',
    icon: 'favorite',
    color: 'var(--color-domain-running)',
    why: 'Capacidad oxidativa. El predictor de mortalidad mejor documentado que existe.',
    protocol: '5K a tope, en llano. Vale una carrera popular o cualquier 5K que ya tengas registrado.',
    retest: RETEST_DAYS.expensive,
    metrics: [
      { key: 'run5k', label: '5K', unit: 'min', dir: 'down', levels: [30, 28, 25, 22, 19], derived: true },
    ],
  },
  {
    id: 'kb',
    name: 'Resistencia de fuerza',
    short: 'Res. fuerza',
    icon: 'local_fire_department',
    color: 'var(--red-200)',
    why: 'Aplicar fuerza bajo fatiga acumulada. El puente entre la barra y el cardio.',
    protocol: 'Simple & Sinister: 100 swings en 5 min + 10 Turkish Get-ups en 10 min. Registra el peso de la pesa con el que lo completas.',
    retest: RETEST_DAYS.expensive,
    metrics: [
      { key: 'sns', label: 'S&S completado con', unit: 'kg', dir: 'up', levels: [16, 24, 32, 40, 48] },
    ],
  },
  {
    id: 'core',
    name: 'Resistencia de core',
    short: 'Core',
    icon: 'grid_view',
    color: 'var(--color-accent-text)',
    why: 'Estabilidad de la columna bajo fatiga sostenida, no fuerza explosiva.',
    protocol: 'Protocolo McGill, los tres cronometrados hasta que la forma se rompe: flexor (supino, hombros levantados), extensor (prono, cuerpo en línea) y plancha lateral por cada lado.',
    retest: RETEST_DAYS.cheap,
    metrics: [
      { key: 'mcgillFlexor', label: 'Flexor', unit: 's', dir: 'up', levels: [60, 90, 120, 150, 180] },
      { key: 'mcgillExtensor', label: 'Extensor', unit: 's', dir: 'up', levels: [60, 90, 120, 150, 180] },
      { key: 'mcgillSide', label: 'Plancha lateral', unit: 's', dir: 'up', levels: [30, 45, 60, 75, 90] },
    ],
  },
  {
    id: 'mobility',
    name: 'Movilidad funcional',
    short: 'Movilidad',
    icon: 'accessibility_new',
    color: 'var(--color-state-success)',
    why: 'Rango de movimiento real, sin el sesgo antropométrico del Sit & Reach.',
    protocol: 'AKE: supino, cadera a 90°, extiende activamente la rodilla y mide el ángulo respecto a la perpendicular. Dorsiflexión: de rodillas frente a una pared, distancia máxima dedo-pared con la rodilla tocando y el talón pegado al suelo.',
    retest: RETEST_DAYS.cheap,
    metrics: [
      { key: 'ake', label: 'AKE', unit: '°', dir: 'up', levels: [-5, 0, 5, 15, 20] },
      { key: 'dorsiflexion', label: 'Dorsiflexión', unit: 'cm', dir: 'up', levels: [5, 7, 9, 11, 13] },
    ],
  },
];

/** Índice plano métrica → { domain, metric }, para no recorrer en cada lectura. */
export const METRICS = (() => {
  const out = {};
  for (const d of DOMAINS) for (const m of d.metrics) out[m.key] = { domain: d, metric: m };
  return out;
})();

// ── Nivel de una métrica ─────────────────────────────────

/**
 * Nivel 1..5 de un valor dentro de su métrica; 0 si no hay dato.
 * Un valor por debajo del umbral de nivel I sigue siendo nivel I: haber medido
 * y quedar bajo no es lo mismo que no haber medido.
 */
export function levelFor(metric, value) {
  if (value == null || !Number.isFinite(value)) return 0;
  const { levels, dir } = metric;
  let lvl = 1;
  for (let i = 0; i < levels.length; i++) {
    const alcanzado = dir === 'down' ? value <= levels[i] : value >= levels[i];
    if (alcanzado) lvl = i + 1;
  }
  return lvl;
}

// ── Derivación desde lo que ya hay en la db ──────────────

/** Peso corporal más reciente; null si nunca se registró. */
export function bodyweight(db) {
  const conPeso = (db?.bodyLogs || [])
    .filter(b => Number.isFinite(parseFloat(b.peso)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return conPeso.length ? parseFloat(conPeso[0].peso) : null;
}

/** Los cuatro básicos por nombre, tolerando cómo los escriben los planes. */
const LIFT_PATTERNS = {
  squat: /sentadilla|squat/i,
  deadlift: /peso\s*muerto|deadlift/i,
  bench: /press\s*(de\s*)?banca|bench/i,
  ohp: /press\s*(militar|de\s*hombro)|overhead|\bohp\b/i,
};

/** 1RM estimado de Epley — misma fórmula que usa Quirón, sin importarla. */
function epley(kg, reps) {
  const k = parseFloat(kg), r = parseInt(reps);
  if (!Number.isFinite(k) || k <= 0 || !Number.isFinite(r) || r < 1) return null;
  return r === 1 ? k : k * (1 + r / 30);
}

/**
 * Métricas que se calculan solas de lo ya registrado. No tocan la db.
 * @returns {Object} { [key]: { value, date } }
 */
export function derivedMetrics(db) {
  const out = {};
  const bw = bodyweight(db);

  // Fuerza máxima: mejor e1RM histórico de cada básico, en ratio al peso.
  const mejor = {};
  let mejorPullups = null;
  for (const w of (db?.workouts || [])) {
    for (const ex of (w.exercises || [])) {
      const nombre = ex.name || '';
      for (const [key, re] of Object.entries(LIFT_PATTERNS)) {
        if (!re.test(nombre)) continue;
        for (const s of (ex.sets || [])) {
          const rm = epley(s.kg, s.reps);
          if (rm != null && (!mejor[key] || rm > mejor[key].rm)) mejor[key] = { rm, date: w.date };
        }
      }
      // Dominadas: la mejor serie de reps, sin lastre (kg vacío o 0).
      if (/dominada|pull[-\s]?up/i.test(nombre)) {
        for (const s of (ex.sets || [])) {
          const kg = parseFloat(s.kg) || 0;
          const reps = parseInt(s.reps);
          if (kg > 0 || !Number.isFinite(reps) || reps <= 0) continue;
          if (!mejorPullups || reps > mejorPullups.value) mejorPullups = { value: reps, date: w.date };
        }
      }
    }
  }
  if (bw > 0) {
    for (const [key, v] of Object.entries(mejor)) {
      out[key] = { value: +(v.rm / bw).toFixed(2), date: v.date };
    }
  }
  if (mejorPullups) out.pullups = mejorPullups;

  // Cardio: mejor 5K registrado. Se aceptan carreras de 4.8-5.4 km y se
  // normaliza el tiempo a 5.000 m exactos, que es como se compara un 5K.
  let mejor5k = null;
  for (const r of (db?.runningLogs || [])) {
    const dist = parseFloat(r.distance), dur = parseFloat(r.duration);
    if (!Number.isFinite(dist) || !Number.isFinite(dur) || dur <= 0) continue;
    if (dist < 4.8 || dist > 5.4) continue;
    const min = (dur / 60) * (5 / dist);
    if (!mejor5k || min < mejor5k.value) mejor5k = { value: +min.toFixed(2), date: r.date };
  }
  // `settings.race5k` (segundos) es lo que el usuario declaró en Ajustes para
  // sus zonas de ritmo: vale como dato si no hay ninguna carrera mejor.
  const declarado = parseFloat(db?.settings?.race5k);
  if (Number.isFinite(declarado) && declarado > 0) {
    const min = +(declarado / 60).toFixed(2);
    if (!mejor5k || min < mejor5k.value) mejor5k = { value: min, date: null };
  }
  if (mejor5k) out.run5k = mejor5k;

  return out;
}

/** El test manual más reciente de cada métrica. */
export function latestTests(db) {
  const out = {};
  for (const t of (db?.domainTests || [])) {
    if (!METRICS[t.metric]) continue;
    const prev = out[t.metric];
    if (!prev || String(t.date).localeCompare(String(prev.date)) > 0) {
      out[t.metric] = { value: parseFloat(t.value), date: t.date, id: t.id };
    }
  }
  return out;
}

/** Días transcurridos desde 'YYYY-MM-DD'; null si no hay fecha. */
export function daysSince(dateStr, ref = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((ref - d) / 86400000);
}

// ── El perfil ────────────────────────────────────────────

/**
 * El perfil completo: nivel por dominio, nivel global y de qué estás limitado.
 *
 * Un test manual siempre gana a la derivación: si te has medido las dominadas
 * hoy, ese número describe mejor tu cuerpo que la mejor serie de hace un año.
 */
export function computeProfile(db, ref = new Date()) {
  const derived = derivedMetrics(db);
  const tested = latestTests(db);

  const domains = DOMAINS.map(d => {
    const metrics = d.metrics.map(m => {
      const t = tested[m.key];
      const dv = derived[m.key];
      const usaTest = t && Number.isFinite(t.value);
      const value = usaTest ? t.value : (dv ? dv.value : null);
      const date = usaTest ? t.date : (dv ? dv.date : null);
      return {
        ...m,
        value,
        date,
        source: value == null ? 'none' : (usaTest ? 'test' : 'derived'),
        level: levelFor(m, value),
        days: daysSince(date, ref),
      };
    });

    const medidas = metrics.filter(m => m.level > 0);
    // Regla 1: el dominio vale lo que su métrica más baja.
    const level = medidas.length ? Math.min(...medidas.map(m => m.level)) : 0;
    const weakest = medidas.length
      ? medidas.reduce((a, b) => (b.level < a.level ? b : a))
      : null;

    // Caduca si TODAS sus métricas medibles llevan más de su periodo sin tocar.
    const conFecha = metrics.filter(m => m.days != null);
    const oldest = conFecha.length ? Math.max(...conFecha.map(m => m.days)) : null;
    const stale = d.retest != null && oldest != null && oldest > d.retest;

    return {
      ...d,
      metrics,
      level,
      weakest,
      complete: medidas.length === metrics.length,
      missing: metrics.filter(m => m.level === 0),
      oldest,
      stale,
    };
  });

  const medidos = domains.filter(d => d.level > 0);
  // Regla 2: el nivel global es el mínimo de los dominios medidos. Con dominios
  // sin medir no se afirma un nivel global: sería inventarse el eslabón que falta.
  const level = medidos.length ? Math.min(...medidos.map(d => d.level)) : 0;
  const limitedBy = medidos.length
    ? medidos.reduce((a, b) => (b.level < a.level ? b : a))
    : null;

  return {
    domains,
    level,
    limitedBy,
    measured: medidos.length,
    total: domains.length,
    // Sin todos los dominios medidos el nivel es provisional: el eslabón que
    // falta podría ser más bajo que cualquiera de los ya medidos.
    provisional: medidos.length < domains.length,
  };
}

/**
 * El siguiente test que conviene hacer: primero lo que nunca se ha medido,
 * luego lo más caducado. Es lo que convierte el radar en algo accionable.
 */
export function nextTest(profile) {
  const candidatos = profile.domains.filter(d => d.protocol);
  const sinMedir = candidatos.filter(d => d.level === 0);
  if (sinMedir.length) return { domain: sinMedir[0], reason: 'nunca' };

  const caducados = candidatos.filter(d => d.stale)
    .sort((a, b) => (b.oldest ?? 0) - (a.oldest ?? 0));
  if (caducados.length) return { domain: caducados[0], reason: 'caducado' };

  // Nada urgente: el limitante es lo que más rinde volver a medir.
  const lim = profile.limitedBy;
  return lim?.protocol ? { domain: lim, reason: 'limitante' } : null;
}

/** Formatea el valor de una métrica para pantalla. */
export function formatMetric(m) {
  if (m.value == null) return '—';
  if (m.unit === 'min') {
    const total = Math.round(m.value * 60);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }
  if (m.unit === '×BW') return `${m.value.toFixed(2)}×`;
  if (m.unit === '°') return `${m.value > 0 ? '+' : ''}${m.value}°`;
  return `${m.value} ${m.unit}`;
}
