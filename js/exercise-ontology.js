// Ontología de ejercicios de Areté — semilla para la derivación de dominios.
//
// F0–F2 del plan ([docs/PLAN-ONTOLOGIA.md](../docs/PLAN-ONTOLOGIA.md)) generarán
// el catálogo completo (los 89 de Areté contra free-exercise-db) con un script de
// build. Mientras tanto, esta semilla hand-authored cubre lo que la derivación de
// dominios necesita: los cinco lifts canónicos que alimentan métricas y las
// variantes que se declaran explícitamente como no contabilizables. El módulo
// generado debe subsumir esta semilla sin cambiar las claves de resolución ni los
// campos `lift` y `variantOf` que aquí se introducen.
//
// La relación de cada nodo con la métrica del básico está decidida y documentada
// en el plan (F3): el nodo canónico cuenta (`lift`), la variante no (`variantOf`),
// y lo que no está en la ontología no cuenta — sin substring ni fallback de regex.

// ── Normalización de nombres ─────────────────────────────
// Única copia de la firma canónica que antes vivía en ui/exercise-pict.js:
// tildes fuera, paréntesis fuera, singular, sin palabras vacías, orden libre.

const STOP = new Set(['con', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'a',
  'y', 'o', 'para', 'sobre', 'kb', 'the', 'with', 'and', 'dos', 'una', 'un']);

/** Singulariza: plural español (-s tras vocal, -es tras consonante) e inglés. */
function stem(w) {
  for (const [plural, singular] of [['ones', 'on'], ['ores', 'or'],
    ['ales', 'al'], ['iles', 'il']]) {
    if (w.length > plural.length && w.endsWith(plural)) {
      return w.slice(0, -plural.length) + singular;
    }
  }
  if (w.length > 4 && w.endsWith('es') && ['ch', 'sh', 'ss', 'zz'].includes(w.slice(-4, -2))) {
    return w.slice(0, -2);
  }
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

/** Firma canónica de un nombre: sin tildes, sin paréntesis, en singular. */
export function mediaKey(name) {
  const plain = (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim();
  return plain.split(/\s+/)
    .filter(w => w && !STOP.has(w))
    .map(stem)
    .sort()
    .join(' ');
}

// ── La semilla ───────────────────────────────────────────
//
// lift      — el nodo alimenta esa métrica de `domains.js`. Solo canónicos.
// variantOf — el nodo comparte patrón con el básico y NO lo alimenta.
// pattern   — vocabulario cerrado del plan F0: hinge·squat·lunge·push_h·push_v·
//             pull_h·pull_v·carry·core·loco.
//
// 'Sentadilla (KB)' normaliza a 'sentadilla' y cuenta como squat: el paréntesis
// nombra el material, no otra variante — mismo comportamiento que el media.

export const EXERCISE_ONTOLOGY = [
  // ── Canónicos: los cinco lifts que la derivación usa ──
  {
    id: 'squat', name: 'Sentadilla', pattern: 'squat', equipment: ['barra'],
    aliases: ['Sentadilla', 'Sentadillas', 'Sentadilla trasera', 'Back Squat', 'Squat', 'Squats'],
    lift: 'squat',
  },
  {
    id: 'deadlift', name: 'Peso muerto', pattern: 'hinge', equipment: ['barra'],
    aliases: ['Peso Muerto', 'Deadlift'],
    lift: 'deadlift',
  },
  {
    id: 'bench', name: 'Press de banca', pattern: 'push_h', equipment: ['barra', 'banco'],
    aliases: ['Press de Banca', 'Press Banca', 'Bench Press', 'Bench'],
    lift: 'bench',
  },
  {
    id: 'ohp', name: 'Press militar', pattern: 'push_v', equipment: ['barra'],
    aliases: ['Press Militar', 'Press de Hombro', 'Overhead Press', 'OHP'],
    lift: 'ohp',
  },
  {
    id: 'pullup', name: 'Dominada', pattern: 'pull_v', equipment: ['dominadas'],
    aliases: ['Dominada', 'Dominadas', 'Dominada Prono', 'Dominada Supino', 'Dominada Supina',
      'Pull-up', 'Pull-ups', 'Chin-up', 'Chin-ups'],
    lift: 'pullups',   // métrica de reps, no de e1RM — domains.js la trata aparte
  },

  // ── Variantes: comparten patrón con el básico y NO lo alimentan ──
  {
    id: 'front-squat', name: 'Sentadilla frontal', pattern: 'squat', equipment: ['barra'],
    aliases: ['Sentadilla Frontal', 'Front Squat'],
    variantOf: 'squat',
  },
  {
    id: 'bulgarian-split-squat', name: 'Sentadilla búlgara', pattern: 'lunge', equipment: ['ninguno'],
    aliases: ['Sentadilla Búlgara', 'Bulgarian Split Squat'],
    variantOf: 'squat',
  },
  {
    id: 'pistol-squat', name: 'Sentadilla pistol', pattern: 'squat', equipment: ['ninguno'],
    aliases: ['Pistol Squat', 'Sentadilla Pistol', 'Sentadilla 1 Pierna', '1 Pierna Sentadilla'],
    variantOf: 'squat',
  },
  {
    id: 'jump-squat', name: 'Sentadilla con salto', pattern: 'squat', equipment: ['ninguno'],
    aliases: ['Sentadilla con Salto', 'Sentadillas con Salto', 'Squat con Salto', 'Jump Squat'],
    variantOf: 'squat',
  },
  {
    id: 'rack-squat', name: 'Squat en rack', pattern: 'squat', equipment: ['kettlebell'],
    aliases: ['Squat en Rack', 'Sentadilla en Rack'],
    variantOf: 'squat',
  },
  {
    id: 'romanian-deadlift', name: 'Peso muerto rumano', pattern: 'hinge', equipment: ['barra'],
    aliases: ['Peso Muerto Rumano', 'PM Rumano', 'Romanian Deadlift', 'RDL'],
    variantOf: 'deadlift',
  },
  {
    id: 'deadlift-high-pull', name: 'Peso muerto alto codo', pattern: 'pull_h', equipment: ['barra'],
    aliases: ['Deadlift High Pull', 'High Pull'],
    variantOf: 'deadlift',
  },
  {
    id: 'push-press', name: 'Push press', pattern: 'push_v', equipment: ['barra'],
    aliases: ['Push Press'],
    variantOf: 'ohp',
  },
  {
    id: 'floor-press', name: 'Press en el suelo', pattern: 'push_h', equipment: ['ninguno'],
    aliases: ['Press en el Suelo', 'Floor Press'],
    variantOf: 'bench',
  },
];

// índice firma → nodo, construido una vez
const INDEX = new Map();
for (const entry of EXERCISE_ONTOLOGY) {
  for (const alias of [entry.name, ...entry.aliases]) {
    const key = mediaKey(alias);
    if (INDEX.has(key) && INDEX.get(key) !== entry) {
      throw new Error(`ontología: firma duplicada "${key}" (${INDEX.get(key).id} vs ${entry.id})`);
    }
    INDEX.set(key, entry);
  }
}

/**
 * De texto libre a nodo de la ontología, o null si no resuelve.
 * Matching exacto sobre la firma normalizada: sin substring, sin difuso.
 * Lo que no está en la ontología no cuenta — decidido, no ortográfico.
 */
export function resolveExercise(name) {
  return INDEX.get(mediaKey(name)) || null;
}
