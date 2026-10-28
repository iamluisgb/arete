// Qué ejercicios tienen animación 3D y con qué nombres aparecen en los planes.
// Ligero a propósito: la pantalla de la serie lo consulta siempre, y Three.js
// y el modelo solo se cargan al abrir la animación (sheet.js).
//
// Los nombres son exactos y explícitos, los mismos que usan las ilustraciones
// (js/exercise-media.js). No se resuelve por la ontología: allí «Squat» es la
// sentadilla con barra, pero en el plan de Efecto Kettlebell es la de pesa
// rusa, y enseñar el ejercicio equivocado es peor que no enseñar ninguno.

import { mediaKey } from '../exercise-ontology.js';

export const ANIM3D_NAMES = {
  'squat': ['Sentadilla', 'Sentadillas'],
  'front-squat': ['Sentadilla Frontal'],
  'kb-sentadilla': ['Squat'],
  'rack-squat': ['Squat Rack (KB)', 'Squat en Rack'],
  'sentadilla-basica': ['Sentadilla básica'],
  'pistol-squat': ['Pistol squat', 'Sentadilla pistol'],
  'elevacion-talones': ['Elevación Talones'],
  'deadlift': ['Peso Muerto'],
  'romanian-deadlift': ['PM Rumano', 'Peso Muerto Rumano'],
  'kb-deadlift': ['Deadlift'],
  'kb-deadlift-sumo': ['Deadlift Sumo'],
  'kb-deadlift-maleta': ['Deadlift Maleta'],
  'pm-unilateral': ['PM Unilateral'],
  'kb-single-leg-deadlift': ['Deadlift con 1 Pierna'],
  'ohp': ['Press Militar'],
  // «Push Press» sale con barra (arete.json) y con pesa rusa (kettlebell.json): sin mapear.
  'kb-thruster': ['Thruster (KB)', 'Thrusters (KB)'],
  'remo-barra': ['Remo con Barra'],
  'curl-barra': ['Curl con Barra'],
  'curl-invertido': ['Curl Invertido'],
  'encogimiento': ['Encogimientos'],
};

const INDEX = new Map();
for (const [id, names] of Object.entries(ANIM3D_NAMES)) for (const n of names) INDEX.set(mediaKey(n), id);

/** Id de la animación 3D de un ejercicio, o null si no tiene. */
export function anim3dId(name) {
  return INDEX.get(mediaKey(name || '')) || null;
}
