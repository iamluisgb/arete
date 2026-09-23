// Catálogo de ejercicios para Quirón: búsqueda y explicación sobre la ontología.
//
// El módulo generado (js/exercise-ontology.js) es fuente de DATOS puros: el build
// script (tools/build-exercise-ontology.py) no sabe nada de Quirón y así debe seguir.
// Las reglas de búsqueda y explicación viven aquí, en código hand-authored y
// testeable, de modo que añadir una regla no exija regenerar el catálogo.
//
// Regla del producto: Quirón solo prescribe ejercicios del catálogo. Un ejercicio que
// find_exercises no devuelve y explain_exercise no explica NO existe para el agente —
// mejor "no lo tengo" que un número o un movimiento inventado.

import { EXERCISE_ONTOLOGY, resolveExercise } from '../exercise-ontology.js';

/** Límite por defecto de resultados: más que esto inunda el turno sin mejorar la propuesta. */
const DEFAULT_LIMIT = 15;

/** Normaliza un término libre para matching: minúsculas y sin acentos. No reutiliza
 * mediaKey porque aquí hace falta SUBSTRING (un término como "hombro" vive dentro
 * de una contraindication más larga), no firma canónica. */
const normTerm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

const hasAll = (list, wanted) => {
  const hay = new Set(list);
  return asArray(wanted).every((w) => hay.has(w));
};

const hasAny = (list, wanted) => {
  const hay = new Set(list);
  return asArray(wanted).some((w) => hay.has(w));
};

/** Un nodo se excluye si CUALQUIER término de `evita` aparece en su nombre, alias,
 * patrón o texto de contraindicaciones. Las contraindications del catálogo arrancan
 * con la zona ("Hombro: …", "Lumbar: …"), así que un término como "hombro" saca
 * todo lo que la menciona — que es lo que el atleta pide con "me molesta el hombro". */
const isExcluded = (node, evita) => {
  const terms = asArray(evita).map(normTerm).filter(Boolean);
  if (!terms.length) return false;
  const haystacks = [
    node.name,
    ...(node.aliases ?? []),
    node.pattern,
    ...(node.contraindications ?? []),
  ].map(normTerm);
  return terms.some((t) => haystacks.some((h) => h.includes(t)));
};

/**
 * Busca en el catálogo. Todos los filtros son opcionales; sin filtros devuelve un
 * recorte (limit) del catálogo entero. Devuelve NODOS del catálogo (no copias): el
 * llamante formatea; nadie muta.
 *
 * - `pattern`: valor exacto del vocabulario cerrado (hinge, squat, lunge, push_h,
 *   push_v, pull_h, pull_v, core, loco).
 * - `equipment`: TODOS los valores listados deben estar en el nodo ("barra" → necesita
 *   barra; "ninguno" → sin material).
 * - `muscle`: TODOS los listados deben estar en primary o secondary.
 * - `domain`: TODOS los listados deben estar en domains (strength, pull, kb, …).
 * - `evita`: términos libres (molestias, material, ejercicios concretos).
 */
export function findExercises(query = {}) {
  const { pattern, equipment, muscle, domain, evita } = query;
  const limit = Number.isInteger(query.limit) && query.limit > 0 ? query.limit : DEFAULT_LIMIT;

  // El orden del catálogo es determinista (sale del build), así que el recorte también.
  const hits = EXERCISE_ONTOLOGY.filter((n) => {
    if (pattern && n.pattern !== pattern) return false;
    if (equipment && !hasAll(n.equipment ?? [], equipment)) return false;
    if (muscle && !(hasAny(n.primary ?? [], muscle) || hasAny(n.secondary ?? [], muscle))) return false;
    if (domain && !hasAll(n.domains ?? [], domain)) return false;
    if (isExcluded(n, evita)) return false;
    return true;
  });

  return { total: hits.length, exercises: hits.slice(0, limit) };
}

/**
 * Explica un ejercicio del catálogo por nombre o alias (resolución exacta vía
 * resolveExercise, la misma del resto de la app). Devuelve el nodo + SUSTITUTOS
 * derivados: los datos no traen campo `substitutes` rellenado, así que se deriva —
 * el lift canónico si el nodo es variante, y hermanos del mismo patrón priorizando
 * el mismo material. Devuelve null si el nombre no resuelve: NO se inventa nada.
 */
export function explainExercise(name) {
  const node = resolveExercise(name);
  if (!node) return null;

  const parent = node.variantOf ? EXERCISE_ONTOLOGY.find((n) => n.id === node.variantOf) : null;

  const siblings = EXERCISE_ONTOLOGY
    .filter((n) => n.id !== node.id && n.pattern === node.pattern)
    .sort((a, b) => {
      // Primero el mismo material disponible, después el orden del catálogo (estable).
      const sharedA = a.equipment?.filter((e) => node.equipment?.includes(e)).length ?? 0;
      const sharedB = b.equipment?.filter((e) => node.equipment?.includes(e)).length ?? 0;
      return sharedB - sharedA;
    })
    .slice(0, 6);

  const substitutes = [
    ...(parent ? [parent] : []),
    ...siblings.filter((s) => s.id !== parent?.id),
  ].slice(0, 6);

  return { exercise: node, substitutes };
}
