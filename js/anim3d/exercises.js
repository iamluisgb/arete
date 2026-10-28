// Catálogo de ejercicios animados. Cada uno es un patrón de poses.js con sus
// ajustes, su ritmo y desde dónde se ve mejor. Los `id` son los de la
// ontología de la app (js/exercise-ontology.js).
//
// Ritmo: fases con su duración y entre qué profundidades va (0 → 1 → 0).

import { squat, pistol, calfRaise, hinge, singleLegHinge } from './poses.js';
import { overheadPress, kbThruster } from './patterns/press.js';
import { row } from './patterns/row.js';
import { barbellCurl, shrug } from './patterns/arms.js';

const SQUAT_TEMPO = [
  { label: 'Bajada', dur: 3, from: 0, to: 1 },
  { label: 'Pausa', dur: 1, from: 1, to: 1 },
  { label: 'Subida', dur: 1, from: 1, to: 0 },
  { label: 'Arriba', dur: 1, from: 0, to: 0 },
];
// El peso muerto empieza en el suelo.
const DEADLIFT_TEMPO = [
  { label: 'Subida', dur: 1.2, from: 1, to: 0 },
  { label: 'Bloqueo', dur: 1, from: 0, to: 0 },
  { label: 'Bajada', dur: 2, from: 0, to: 1 },
  { label: 'Suelo', dur: 1, from: 1, to: 1 },
];
// Rumano y a una pierna empiezan arriba.
const RDL_TEMPO = [
  { label: 'Bajada', dur: 3, from: 0, to: 1 },
  { label: 'Abajo', dur: 0.5, from: 1, to: 1 },
  { label: 'Subida', dur: 1.5, from: 1, to: 0 },
  { label: 'Arriba', dur: 1, from: 0, to: 0 },
];
// El remo empieza con la barra colgando: tirón, arriba, bajada controlada, abajo.
const ROW_TEMPO = [
  { label: 'Tirón', dur: 1, from: 0, to: 1 },
  { label: 'Arriba', dur: 1, from: 1, to: 1 },
  { label: 'Bajada', dur: 2, from: 1, to: 0 },
  { label: 'Abajo', dur: 0.5, from: 0, to: 0 },
];
const CALF_TEMPO = [
  { label: 'Subida', dur: 1, from: 0, to: 1 },
  { label: 'Arriba', dur: 1, from: 1, to: 1 },
  { label: 'Bajada', dur: 2, from: 1, to: 0 },
  { label: 'Abajo', dur: 0.5, from: 0, to: 0 },
];
// El press empieza en el rack y sube al bloqueo.
const PRESS_TEMPO = [
  { label: 'Subida', dur: 1.5, from: 0, to: 1 },
  { label: 'Bloqueo', dur: 1, from: 1, to: 1 },
  { label: 'Bajada', dur: 2, from: 1, to: 0 },
  { label: 'Rack', dur: 1, from: 0, to: 0 },
];
// El thruster empieza en el fondo de la sentadilla.
const THRUSTER_TEMPO = [
  { label: 'Subida y press', dur: 1.4, from: 0, to: 1 },
  { label: 'Bloqueo', dur: 0.8, from: 1, to: 1 },
  { label: 'Bajada', dur: 2, from: 1, to: 0 },
  { label: 'Abajo', dur: 0.6, from: 0, to: 0 },
];

// Curl: sube en 2 s, aprieta, baja en 3 s. Empieza abajo, con los brazos casi estirados.
const CURL_TEMPO = [
  { label: 'Subida', dur: 2, from: 0, to: 1 },
  { label: 'Arriba', dur: 1, from: 1, to: 1 },
  { label: 'Bajada', dur: 3, from: 1, to: 0 },
  { label: 'Abajo', dur: 0.5, from: 0, to: 0 },
];
const SHRUG_TEMPO = [
  { label: 'Subida', dur: 1, from: 0, to: 1 },
  { label: 'Arriba', dur: 1.5, from: 1, to: 1 },
  { label: 'Bajada', dur: 2, from: 1, to: 0 },
  { label: 'Abajo', dur: 0.5, from: 0, to: 0 },
];

export const EXERCISES = [
  // ── Sentadillas ──
  { id: 'squat', name: 'Sentadilla', family: 'Sentadilla', gear: 'Barra', cam: 'side',
    pose: squat({ load: 'back', stance: { foot: 0.17, toeOut: 15 } }), tempo: SQUAT_TEMPO },
  { id: 'front-squat', name: 'Sentadilla frontal (brazos cruzados)', family: 'Sentadilla', gear: 'Barra', cam: 'three',
    pose: squat({ load: 'front', shank: 36, thigh: 115, stance: { foot: 0.17, toeOut: 15 }, barFwd: 0.13, barUp: 0.06,
      cross: { fl: 0.18, fr: 0.16, ul: 0.12, ur: -0.02, z: 0.12, pl: 0.1, pr: -0.3 } }), tempo: SQUAT_TEMPO },
  { id: 'kb-sentadilla', name: 'Sentadilla goblet', family: 'Sentadilla', gear: 'Pesa rusa', cam: 'three',
    pose: squat({ load: 'goblet', shank: 36, thigh: 104, stance: { foot: 0.19, toeOut: 15 } }), tempo: SQUAT_TEMPO },
  { id: 'rack-squat', name: 'Sentadilla en rack', family: 'Sentadilla', gear: 'Dos pesas rusas', cam: 'three',
    pose: squat({ load: 'rack', shank: 35, thigh: 100, stance: { foot: 0.24, toeOut: 20 },
      rack: { fwd: 0.15, up: 0.04, z: 0.08, twist: 0.5, down: [0, -0.3, 1], elbow: -0.2 } }), tempo: SQUAT_TEMPO },
  { id: 'sentadilla-basica', name: 'Sentadilla básica', family: 'Sentadilla', gear: 'Sin material', cam: 'three',
    pose: squat({ load: 'none', shank: 32, thigh: 108, stance: { foot: 0.16, toeOut: 10 } }), tempo: SQUAT_TEMPO },
  { id: 'pistol-squat', name: 'Pistol squat', family: 'Sentadilla', gear: 'Sin material', cam: 'side',
    pose: pistol(), tempo: SQUAT_TEMPO },
  { id: 'elevacion-talones', name: 'Elevación de talones', family: 'Sentadilla', gear: 'Sin material', cam: 'side',
    pose: calfRaise(), tempo: CALF_TEMPO },
  // ── Bisagras de cadera ──
  { id: 'deadlift', name: 'Peso muerto', family: 'Bisagra de cadera', gear: 'Barra', cam: 'side',
    pose: hinge({ implement: 'barbell' }), tempo: DEADLIFT_TEMPO },
  { id: 'romanian-deadlift', name: 'Peso muerto rumano', family: 'Bisagra de cadera', gear: 'Barra', cam: 'side',
    pose: hinge({ implement: 'barbell', romanian: true, kneeMax: 5, floorY: 0.47, shoulderAhead: 0.07 }), tempo: RDL_TEMPO, start: 0 },
  { id: 'kb-deadlift', name: 'Peso muerto con pesa rusa', family: 'Bisagra de cadera', gear: 'Pesa rusa', cam: 'three',
    pose: hinge({ implement: 'kettlebell', stance: { foot: 0.3, toeOut: 18, kneeOut: 0.04 }, kneeMax: 14, lockBack: -0.16 }), tempo: DEADLIFT_TEMPO },
  { id: 'kb-deadlift-sumo', name: 'Peso muerto sumo', family: 'Bisagra de cadera', gear: 'Pesa rusa', cam: 'front',
    pose: hinge({ implement: 'kettlebell', stance: { foot: 0.32, toeOut: 30 }, kneeMax: 24, shoulderAhead: 0.02 }), tempo: DEADLIFT_TEMPO },
  { id: 'kb-deadlift-maleta', name: 'Peso muerto maleta', family: 'Bisagra de cadera', gear: 'Pesa rusa', cam: 'three',
    pose: hinge({ implement: 'suitcase', stance: { foot: 0.12 }, kneeMax: 22, lockBack: -0.07 }), tempo: DEADLIFT_TEMPO },
  { id: 'pm-unilateral', name: 'Peso muerto a una pierna', family: 'Bisagra de cadera', gear: 'Barra', cam: 'three',
    pose: singleLegHinge({ implement: 'barbell' }), tempo: RDL_TEMPO },
  { id: 'kb-single-leg-deadlift', name: 'Peso muerto a una pierna con pesa rusa', family: 'Bisagra de cadera', gear: 'Pesa rusa', cam: 'three',
    pose: singleLegHinge({ implement: 'kettlebell' }), tempo: RDL_TEMPO },
  // ── Empuje vertical ──
  { id: 'ohp', name: 'Press militar', family: 'Empuje vertical', gear: 'Barra', cam: 'side',
    pose: overheadPress(), tempo: PRESS_TEMPO, view: { y: 1.1, dist: 1.1 } },
  { id: 'kb-thruster', name: 'Thruster con una pesa rusa', family: 'Empuje vertical', gear: 'Pesa rusa', cam: 'three',
    pose: kbThruster(), tempo: THRUSTER_TEMPO, start: 0, view: { y: 1.05, dist: 1.08 } },
  // ── Tirón horizontal ──
  { id: 'remo-barra', name: 'Remo con barra', family: 'Tirón horizontal', gear: 'Barra', cam: 'side',
    pose: row(), tempo: ROW_TEMPO },
  // ── Brazos y hombros ──
  { id: 'curl-barra', name: 'Curl con barra', family: 'Brazos y hombros', gear: 'Barra', cam: 'side',
    pose: barbellCurl({ grip: 'supine' }), tempo: CURL_TEMPO },
  { id: 'curl-invertido', name: 'Curl invertido', family: 'Brazos y hombros', gear: 'Barra', cam: 'side',
    pose: barbellCurl({ grip: 'prone' }), tempo: CURL_TEMPO },
  { id: 'encogimiento', name: 'Encogimientos', family: 'Brazos y hombros', gear: 'Barra', cam: 'front',
    pose: shrug(), tempo: SHRUG_TEMPO },
];

export const byId = id => EXERCISES.find(e => e.id === id);
