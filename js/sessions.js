// Sesiones sueltas (Fase 5.5): una sesión que Quirón propone y el atleta guarda
// para iniciarla como cualquier otra, SIN tocar su plan.
//
// Decisiones que sostienen el módulo:
//  - No son una fase ni un programa. Viven en `db.customSessions` y la UI las
//    expone como grupo aparte ("Tus sesiones"). Meterlas como fase habría dejado
//    `db.phase` apuntando a algo que no es el plan del atleta.
//  - Se direccionan por REFERENCIA (`cs:<id>`), no por nombre: dos sueltas pueden
//    llamarse igual y el nombre no es estable.
//  - Un workout guardado desde una suelta se lleva su especificación copiada
//    (`w.spec`), así borrar la suelta nunca rompe el historial ni la edición.

import { saveDB, markDeleted } from './data.js';
import { EXERCISE_MEDIA } from './exercise-media.js';
import { lookupMedia } from './ui/exercise-pict.js';

// Mismos modos que acepta un plan (programs.js los valida con estos sets).
export const VALID_MODES = new Set(['sets', 'result', 'interval', 'tabata', 'rounds', 'ladder', 'pyramid', 'amrap', 'emom', 'superset']);
export const VALID_RUN_MODES = new Set(['run-steady', 'run-intervals']);

const REF_PREFIX = 'cs:';
const MAX_EXERCISES = 20;

/** Referencia estable de una suelta, tal como viaja en el <select> de Entrenar */
export function sessionRef(id) { return REF_PREFIX + id; }
export function isSessionRef(ref) { return typeof ref === 'string' && ref.startsWith(REF_PREFIX); }
export function refToId(ref) { return isSessionRef(ref) ? ref.slice(REF_PREFIX.length) : null; }

export function getCustomSessions(db) {
  return Array.isArray(db.customSessions) ? db.customSessions : [];
}

export function getCustomSession(db, id) {
  return getCustomSessions(db).find(s => s.id === id) || null;
}

/** Sueltas ordenadas para la UI: las usadas hace poco primero, luego las nuevas. */
export function listCustomSessions(db) {
  return [...getCustomSessions(db)].sort((a, b) =>
    (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0));
}

/**
 * Valida la lista de ejercicios de UNA sesión (de una suelta o de una fase de un
 * plan). Devuelve string de error o null. Fuente única: programs.js la usa para
 * validar cada sesión de un plan.
 * @param {Array} exercises
 * @param {string} label  contexto para el mensaje de error
 */
export function validateSessionExercises(exercises, label = 'la sesión') {
  if (!Array.isArray(exercises)) return `${label} no es un array de ejercicios`;
  if (!exercises.length) return `${label} no tiene ejercicios`;
  for (const ex of exercises) {
    if (!ex || !ex.name) return `un ejercicio de ${label} no tiene nombre`;
    if (ex.mode && !VALID_MODES.has(ex.mode) && !VALID_RUN_MODES.has(ex.mode)) {
      return `modo "${ex.mode}" no válido en "${ex.name}"`;
    }
  }
  return null;
}

/** Valida una sesión suelta completa ({ name, exercises }). String de error o null. */
export function validateSession(s) {
  if (!s || typeof s !== 'object') return 'no es un objeto';
  if (!s.name || !String(s.name).trim()) return 'falta el nombre de la sesión';
  const label = `"${String(s.name).trim()}"`;
  // El tope solo aplica a las sueltas: un plan importado puede tener sesiones largas.
  if (Array.isArray(s.exercises) && s.exercises.length > MAX_EXERCISES) {
    return `${label} tiene ${s.exercises.length} ejercicios (máximo ${MAX_EXERCISES})`;
  }
  return validateSessionExercises(s.exercises, label);
}

/** Nombres del catálogo que el generador debe usar (uno por ejercicio conocido). */
export function catalogExerciseNames() {
  return Object.values(EXERCISE_MEDIA).map(e => e.alias[0]).filter(Boolean);
}

/** Ejercicios sin ilustración ni consejo: sin match la sesión se siente más pobre. */
export function unknownExercises(exercises) {
  return (exercises || [])
    .filter(ex => ex && ex.name && ex.type !== 'hiit' && !lookupMedia(ex.name))
    .map(ex => ex.name);
}

/** Normaliza una sesión generada: recorta nombre y descarta claves vacías. */
export function normalizeSession(s) {
  return {
    name: String(s.name || 'Sesión').trim().slice(0, 60),
    desc: s.desc ? String(s.desc).slice(0, 200) : '',
    exercises: (s.exercises || []).map(ex => {
      const out = { name: String(ex.name || '').trim() };
      for (const k of ['sets', 'reps', 'type', 'mode', 'kg', 'rest', 'rounds', 'duration', 'intervals', 'desc', 'exercises', 'perSide']) {
        if (ex[k] != null && ex[k] !== '') out[k] = ex[k];
      }
      return out;
    }),
  };
}

/**
 * Nombre único frente a los ya ocupados (otras sueltas + sesiones del plan): el
 * historial y el prefill se leen por nombre, y dos "Pecho" son indistinguibles.
 */
export function uniqueSessionName(name, taken) {
  const base = String(name || 'Sesión').trim().slice(0, 60);
  const set = taken instanceof Set ? taken : new Set(taken || []);
  if (!set.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} (${n})`;
    if (!set.has(candidate)) return candidate;
  }
  return `${base} (${Date.now() % 1000})`;
}

/**
 * Guarda una sesión propuesta. Devuelve { id, name, token }; `token` deshace SOLO
 * esta sesión (nunca un snapshot global: revertiría también las creadas después).
 * @param {Object} db
 * @param {Object} session   { name, exercises }
 * @param {Object} meta      { taken?: string[], sourceTs?: number, origin?: string }
 */
export function applySessionProposal(db, session, meta = {}) {
  const norm = normalizeSession(session);
  const err = validateSession(norm);
  if (err) throw new Error(err);

  const taken = new Set([
    ...getCustomSessions(db).map(s => s.name),
    ...(meta.taken || []),
  ]);
  const entry = {
    id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: uniqueSessionName(norm.name, taken),
    desc: norm.desc,
    exercises: norm.exercises,
    origin: meta.origin || 'quiron',
    sourceTs: meta.sourceTs || null,   // mensaje del chat que la originó
    createdAt: Date.now(),
    lastUsedAt: null,
  };
  if (!Array.isArray(db.customSessions)) db.customSessions = [];
  db.customSessions.push(entry);
  saveDB(db);
  return { id: entry.id, name: entry.name, token: { id: entry.id } };
}

/** Deshace un applySessionProposal (borra solo esa entrada). */
export function undoSessionCommit(db, token) {
  deleteCustomSession(db, token?.id);
}

export function deleteCustomSession(db, id) {
  if (!id) return;
  db.customSessions = getCustomSessions(db).filter(s => s.id !== id);
  markDeleted(db, id);
  saveDB(db);
}

/** Marca la suelta como usada (ordena la lista y bloquea el undo de la propuesta). */
export function touchCustomSession(db, id) {
  const s = getCustomSession(db, id);
  if (!s) return;
  s.lastUsedAt = Date.now();
  saveDB(db);
}
