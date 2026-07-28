// ── Ilustraciones de ejercicio ───────────────────────────
//
// Resuelve un nombre libre de plan ("Swings (KB)") a su secuencia de fotogramas.
// Regla dura: sin match fiable no se dibuja nada. Enseñar el ejercicio
// equivocado a mitad de serie es peor que no enseñar ninguno.

import { EXERCISE_MEDIA } from '../exercise-media.js';

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
