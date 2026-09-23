// ── Ilustraciones de ejercicio ───────────────────────────
//
// Resuelve un nombre libre de plan ("Swings (KB)") a su secuencia de fotogramas.
// Regla dura: sin match fiable no se dibuja nada. Enseñar el ejercicio
// equivocado a mitad de serie es peor que no enseñar ninguno.

import { EXERCISE_MEDIA } from '../exercise-media.js';
import { mediaKey } from '../exercise-ontology.js';

// La normalización de nombres (mediaKey) vive en js/exercise-ontology.js:
// una sola firma canónica para el media y para la ontología.
export { mediaKey };

// índice alias → entrada, construido una vez
const INDEX = new Map();
for (const entry of Object.values(EXERCISE_MEDIA)) {
  for (const alias of entry.alias) INDEX.set(mediaKey(alias), entry);
}

/** Entrada de medios de un ejercicio, o null si no hay match fiable. */
export function lookupMedia(name) {
  return INDEX.get(mediaKey(name)) || null;
}

/**
 * HTML del pictograma. Cadena vacía si no hay match: los llamantes lo
 * concatenan sin condicionales.
 * @param {string} name  nombre del ejercicio tal como viene del plan
 * @param {string} cls   clase extra de tamaño ('sm' en la lista)
 */
export function pictHtml(name, cls = '') {
  const m = lookupMedia(name);
  if (!m) return '';
  const imgs = m.frames
    .map(f => `<img src="${f}" alt="" loading="lazy">`)
    .join('');
  return `<span class="ex-pict f${m.frames.length} ${cls}" aria-hidden="true">${imgs}</span>`;
}

/** Consejo técnico en español, para los minutos muertos del descanso. */
export function tipFor(name) {
  return lookupMedia(name)?.tip || '';
}
