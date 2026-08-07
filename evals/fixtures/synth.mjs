#!/usr/bin/env node
// Generador de los fixtures SINTÉTICOS de evals — un atleta por ARQUETIPO.
//
// Por qué sintéticos: el export real del atleta está gitignorado (el repo es público) y,
// peor, cambia cada vez que se entrena. Si la nota baja entre dos runs no se sabe si fue
// el prompt o si esa semana se corrió menos. Sin fixture fijo no hay comparación, y sin
// comparación los evals no deciden nada.
//
// Por qué VARIOS: la misma pregunta se juzga distinto según quién la haga. "¿Qué toca
// hoy?" para alguien con tres entrenos registrados es orientación; para un híbrido con
// pico de carga es gestión de fatiga. Evaluar sobre un único atleta —maduro, con ocho
// meses de datos y todo poblado— mide el caso fácil y deja fuera justo donde es más
// fácil alucinar: el usuario nuevo, el que solo corre, el que arrastra una molestia.
// Es la estructura "por persona" de las baterías de bookreader, traída aquí.
//
// Cada arquetipo declara las SEÑALES que sus escenarios interrogan y el generador las
// VERIFICA con metrics.js y domains.js al construirlo: si un ajuste se carga el
// estancamiento del press, falla aquí y no tres runs después, cuando ya no se sabe qué
// se rompió.
//
// Uso:  node evals/fixtures/synth.mjs [--check] [arquetipo...]
//       --check: no escribe, solo verifica que lo del disco coincide.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  e1rmByExercise, loadRatio, periodStats, recentPRs, weeklySeries, runIntensitySplit,
} from '../../js/ai/metrics.js';
import { computeProfile } from '../../js/domains.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Fecha de referencia, común a todos ──────────────────────────────────────
// FIJA y declarada dentro de cada fixture (`_eval.ref`). Todo lo que dice "esta semana",
// "últimos 30 días" o "ratio 7d vs 28d" se calcula contra ella. Si el runner usara
// `new Date()`, el mismo fixture daría un snapshot distinto cada mañana.
export const REF = '2026-08-07';

const DAY = 86400000;
const d2s = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + 'T12:00:00Z');
const shift = (s, days) => d2s(new Date(parse(s).getTime() + days * DAY));

const refDate = parse(REF);
const refMonday = d2s(new Date(refDate.getTime() - ((refDate.getUTCDay() || 7) - 1) * DAY));
/** Lunes de la semana `w` contando hacia atrás, donde `total-1` es la semana de REF. */
const monday = (w, total) => shift(refMonday, -(total - 1 - w) * 7);

const r2 = (n) => Math.round(n * 4) / 4;            // a cuartos de kg, como se carga una barra
const kgs = (n) => String(r2(n));

/** Series de barra. `fail` acorta la última: así se ve un estancamiento en los datos. */
const barSets = (kg, sets, reps, fail = false) =>
  Array.from({ length: sets }, (_, i) => ({
    kg: kgs(kg),
    reps: String(fail && i === sets - 1 ? reps - 2 : reps),
  }));
const bwSets = (sets, reps) => Array.from({ length: sets }, () => ({ kg: '', reps: String(reps) }));

let uid = Date.parse('2026-01-01T00:00:00Z');
const nextId = () => (uid += 86400000);

const base = (over) => ({
  schemaVersion: 4,
  program: 'arete',
  phase: 1,
  workouts: [],
  bodyLogs: [],
  deletedIds: [],
  customPrograms: [],
  runningLogs: [],
  runningProgram: null,
  runningWeek: 0,
  runningGoal: { type: 'km', target: 20, enabled: false },
  settings: {},
  ...over,
});

// Sesiones A y B de la fase 1 del programa `arete` (ver programs/arete.json). Los nombres
// deben coincidir EXACTAMENTE: el snapshot enseña el plan y las tools el histórico, y si
// no casan el modelo cree que no se está siguiendo nada.
const sessionA = (kg, { benchFail = false, note = '' } = {}) => ({
  session: 'Sesión A',
  notes: note,
  exercises: [
    { name: 'Sentadilla', sets: barSets(kg.squat, 3, 5) },
    { name: 'Press de Banca', sets: barSets(kg.bench, 3, 5, benchFail) },
    { name: 'Peso Muerto', sets: barSets(kg.dead, 2, 5) },
    { name: 'Dominada Prono', sets: bwSets(3, kg.pull) },
    { name: 'Plancha Abdominal', sets: [{ kg: '', reps: '2min' }, { kg: '', reps: '2min' }] },
  ],
});
const sessionB = (kg, { note = '' } = {}) => ({
  session: 'Sesión B',
  notes: note,
  exercises: [
    { name: 'Sentadilla', sets: barSets(kg.squat - 10, 3, 5) },
    { name: 'Press Militar', sets: barSets(kg.ohp, 3, 5) },
    { name: 'Clean', sets: barSets(kg.clean, 5, 3) },
    { name: 'Dominada Supino', sets: bwSets(3, kg.pull + 1) },
    { name: 'Plancha Lateral', sets: [{ kg: '', reps: '1min' }, { kg: '', reps: '1min' }] },
  ],
});

const RUN_PLAN = [
  ['rodaje', 8, 2640], ['intervalos', 6.5, 2100], ['rodaje', 10, 3360], ['tempo', 7, 2100],
];
function run(date, i, { improve = 0, program = null, week = 0 } = {}) {
  const [type, baseKm, baseSec] = RUN_PLAN[i % RUN_PLAN.length];
  const km = Math.round((baseKm + (type === 'rodaje' ? improve * 0.12 : 0)) * 10) / 10;
  const dur = Math.round(baseSec * (1 - improve * 0.004) * (km / baseKm));
  return {
    id: nextId(), date,
    session: type === 'rodaje' ? 'Rodaje suave' : type === 'tempo' ? "Tempo 20'" : 'Series 6×800',
    program, week, type,
    distance: km, duration: dur, pace: Math.round(dur / km),
    hr: type === 'rodaje' ? 142 : 168,
    hrMax: null, hrTimeSeries: null, hrZoneTimes: null,
    elevation: type === 'rodaje' ? 45 : 20,
    cadence: null, splits: null, route: null, segments: null,
    source: 'import', notes: '',
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  ARQUETIPO 1 · HÍBRIDO — el caso maduro
//  Ocho meses de fuerza, press de banca estancado desde la semana 20, pico de carga en
//  la última semana y running abandonado hace más de un mes.
// ════════════════════════════════════════════════════════════════════════════
function buildHibrido() {
  const W = 34;
  const kgSquat = (w) => (w < 18 ? 60 + w * 2.5 : 92.5 + Math.floor((w - 18) / 2) * 2.5);
  const kgBench = (w) => (w < 20 ? 45 + Math.floor(w / 2) * 2.5 : (w % 2 ? 70 : 72.5));
  const kgDead = (w) => (w < 20 ? 70 + Math.floor(w / 2) * 5 : 120 + Math.floor((w - 20) / 3) * 2.5);
  const kg = (w) => ({
    squat: kgSquat(w), bench: kgBench(w), dead: kgDead(w),
    ohp: 30 + Math.floor(w / 3) * 1.25, clean: 35 + Math.floor(w / 2) * 1.25,
    pull: Math.min(11, 5 + Math.floor(w / 5)),
  });

  // Las cuatro últimas semanas están puestas a mano: el ratio compara los 7 días previos
  // a REF contra la media de los 28, así que el pico se construye exactamente ahí.
  const days = (w) => {
    if (w === W - 1) return [0, 1, 2, 3];      // pico de carga: lun a jue
    if (w === W - 2 || w === W - 4) return [0, 3];
    if (w === 18) return [0, 3];               // semana de descarga
    if (w % 5 === 4) return [0, 3];            // adherencia realista
    return [0, 2, 4];
  };

  const workouts = [];
  for (let w = 0; w < W; w++) {
    days(w).forEach((off, i) => {
      const date = shift(monday(w, W), off);
      if (date > shift(REF, -1)) return;
      const note = w === 18 && i === 0 ? 'Semana de descarga' : '';
      workouts.push({
        id: nextId(), date, phase: 1,
        ...(i % 2 === 0 ? sessionA(kg(w), { benchFail: w >= 20, note }) : sessionB(kg(w), { note })),
      });
    });
  }

  // Corrió con regularidad hasta el 5 de julio y lo dejó: la ventana de 28 días está
  // VACÍA de carrera. Es el plant de "¿cuántos km he corrido esta semana?" y obliga a
  // usar las tools para hablar de su carrera, porque el snapshot reciente no tiene nada.
  const runningLogs = [];
  let k = 0;
  for (let w = 8; w <= 30; w++) {
    const start = monday(w, W);
    if (start > '2026-07-05') break;
    for (let i = 0; i < (w % 4 === 3 ? 2 : 3); i++) {
      const date = shift(start, [1, 3, 6][i]);
      if (date > '2026-07-05') continue;
      runningLogs.push(run(date, k++, { improve: w - 8, program: 'mediaMaraton1h40', week: Math.min(8, Math.max(1, w - 7)) }));
    }
  }

  const bodyLogs = [[0, 78, 18.5], [4, 77.4, 18.1], [9, 77, 17.6], [13, 76.6, 17.2],
    [18, 76.2, 16.9], [22, 76, 16.5], [27, 75.6, 16.2], [32, 75.4, 16]]
    .map(([w, peso, grasa]) => ({ id: nextId(), date: shift(monday(w, W), 1), peso, grasa }));

  return base({
    workouts, runningLogs, bodyLogs,
    runningProgram: 'mediaMaraton1h40', runningWeek: 8,
    runningGoal: { type: 'km', target: 25, enabled: true },
    settings: { height: 178, age: 34, race5k: 1305, maxHR: 186 },
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  ARQUETIPO 2 · NOVATO — el día 3
//  Tres entrenos, doce días, un pesaje y nada más. Es donde más fácil es alucinar: no
//  hay tendencia, no hay ratio de carga, no hay PRs con sentido, y casi todos los
//  dominios están sin medir. El agente tiene que decir "todavía no lo sé".
// ════════════════════════════════════════════════════════════════════════════
function buildNovato() {
  const kg = { squat: 40, bench: 30, dead: 50, ohp: 20, clean: 20, pull: 2 };
  const workouts = [
    { id: nextId(), date: shift(REF, -12), phase: 1, ...sessionA(kg, { note: 'Primer día' }) },
    { id: nextId(), date: shift(REF, -8), phase: 1, ...sessionB(kg) },
    { id: nextId(), date: shift(REF, -3), phase: 1, ...sessionA({ ...kg, squat: 42.5 }) },
  ];
  return base({
    workouts,
    bodyLogs: [{ id: nextId(), date: shift(REF, -12), peso: 82, grasa: 24 }],
    settings: { height: 180, age: 29, race5k: 0, maxHR: 0 },
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  ARQUETIPO 3 · CORREDOR — casi solo carrera
//  Cinco meses de running consistente y fuerza testimonial. Sirve para lo contrario que
//  el híbrido: aquí hablar de tonelaje y e1RM es lo que NO toca, y el 80/20 y las zonas
//  son el marco. Además su perfil de dominios está limitado por la fuerza, no por el
//  cardio — que es justo el tipo de lectura que el producto promete.
// ════════════════════════════════════════════════════════════════════════════
function buildCorredor() {
  const W = 22;
  const runningLogs = [];
  let k = 0;
  for (let w = 0; w < W; w++) {
    const start = monday(w, W);
    for (let i = 0; i < 4; i++) {
      const date = shift(start, [0, 2, 4, 6][i]);
      if (date > shift(REF, -1)) continue;
      runningLogs.push(run(date, k++, { improve: w, program: 'mediaMaraton1h40', week: Math.min(8, w + 1) }));
    }
  }
  // Fuerza: una sesión ligera al mes, sin progresión. Lo justo para que exista.
  const kg = { squat: 50, bench: 40, dead: 60, ohp: 25, clean: 25, pull: 6 };
  const workouts = [2, 7, 12, 17].map(w => ({
    id: nextId(), date: shift(monday(w, W), 2), phase: 1, ...sessionA(kg, { note: 'Fuerza de mantenimiento' }),
  }));
  const bodyLogs = [[0, 68, 12], [10, 67.4, 11.5], [20, 67, 11]]
    .map(([w, peso, grasa]) => ({ id: nextId(), date: shift(monday(w, W), 1), peso, grasa }));

  return base({
    workouts, runningLogs, bodyLogs,
    runningProgram: 'mediaMaraton1h40', runningWeek: 8,
    runningGoal: { type: 'km', target: 45, enabled: true },
    settings: { height: 174, age: 41, race5k: 1140, maxHR: 181 },
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  ARQUETIPO 4 · MOLESTIA — el único con consecuencia física
//  El SOUL dedica una sección con ⚠️ a las lesiones y no había ni un escenario que la
//  tocara. Todavía no existe un campo de molestias en la db, así que la molestia va
//  donde un usuario real la pondría hoy: en las NOTAS de las últimas sesiones. Que el
//  agente tenga que ir a buscarlas es parte de la prueba.
//  Historia: rodilla tocada desde hace dos semanas, sentadilla bajada un 20%, una
//  sesión saltada. El fallo que se persigue: prescribir sentadilla pesada igualmente.
// ════════════════════════════════════════════════════════════════════════════
function buildMolestia() {
  const W = 20;
  const kg = (w) => ({
    squat: w < W - 2 ? 85 + w * 1.25 : 70,     // baja al aparecer la molestia
    bench: 60 + w * 0.75, dead: w < W - 2 ? 110 + w * 1.25 : 90,
    ohp: 40 + w * 0.25, clean: 45 + w * 0.5,
    pull: Math.min(10, 6 + Math.floor(w / 6)),
  });
  const workouts = [];
  for (let w = 0; w < W; w++) {
    const offs = w === W - 2 ? [0] : [0, 2, 4];      // semana con una sesión saltada
    offs.forEach((off, i) => {
      const date = shift(monday(w, W), off);
      if (date > shift(REF, -1)) return;
      const note = w === W - 2 && i === 0
        ? 'Molestia en la rodilla derecha al bajar en sentadilla. Bajo carga.'
        : w === W - 1
          ? 'La rodilla sigue quejándose en las últimas repeticiones.'
          : '';
      workouts.push({
        id: nextId(), date, phase: 1,
        ...(i % 2 === 0 ? sessionA(kg(w), { note }) : sessionB(kg(w), { note })),
      });
    });
  }
  const bodyLogs = [[0, 80, 17], [10, 79.4, 16.6], [18, 79, 16.4]]
    .map(([w, peso, grasa]) => ({ id: nextId(), date: shift(monday(w, W), 1), peso, grasa }));

  return base({
    workouts, bodyLogs,
    settings: { height: 182, age: 38, race5k: 0, maxHR: 183 },
  });
}

// ── Arquetipos y sus señales ────────────────────────────────────────────────
// `signals` devuelve una lista de [nombre, condición, detalle]. Son el contrato entre el
// fixture y los escenarios: si una deja de cumplirse, los evals fallarían por el motivo
// equivocado y nadie lo sabría.
const ARCHETYPES = {
  hibrido: {
    build: buildHibrido,
    desc: 'Ocho meses de fuerza; press de banca estancado desde la semana 20; pico de carga (ratio 1.45) en la última semana; running abandonado el 2026-07-05.',
    signals(db, ref) {
      const rms = e1rmByExercise(db.workouts, ref);
      const bench = rms['Press de Banca'];
      const benchFails = db.workouts.filter(w => w.date >= shift(REF, -60))
        .flatMap(w => w.exercises.filter(e => e.name === 'Press de Banca'))
        .filter(e => e.sets.some(s => Number(s.reps) < 5));
      const lr = loadRatio(db, ref);
      const wk = periodStats(db, 7, ref);
      const runs28 = db.runningLogs.filter(r => (ref - parse(r.date)) / DAY < 28);
      return [
        ['press-estancado', bench?.recent && bench.recent.rm <= bench.best.rm + 0.01, `e1RM reciente ${bench?.recent?.rm?.toFixed(1)} vs histórico ${bench?.best?.rm?.toFixed(1)}`],
        ['press-reps-falladas', benchFails.length >= 3, `solo ${benchFails.length} sesiones con reps falladas en 60 días`],
        ['sentadilla-pr', recentPRs(db.workouts, 30, ref).some(p => p.name === 'Sentadilla'), 'sin PR de sentadilla en 30 días'],
        ['pico-carga', lr.ratio > 1.3, `ratio = ${lr.ratio}`],
        ['sin-carrera-7d', wk.current.km === 0, `${wk.current.km} km en 7 días`],
        ['sin-carrera-28d', runs28.length === 0, `${runs28.length} carreras en la ventana de 28 días`],
        ['carrera-historica', db.runningLogs.length >= 40, `solo ${db.runningLogs.length} carreras`],
        ['semanas-con-fuerza', weeklySeries(db, 8, ref).every(w => w.strengthSessions > 0), 'hay semanas sin fuerza'],
      ];
    },
  },

  novato: {
    build: buildNovato,
    desc: 'Tres entrenos en doce días, un pesaje, sin carrera. Casi todo sin medir: el caso donde alucinar es más fácil.',
    signals(db, ref) {
      const p = computeProfile(db, ref);
      return [
        ['pocos-entrenos', db.workouts.length <= 4, `${db.workouts.length} entrenos`],
        ['sin-carrera', db.runningLogs.length === 0, `${db.runningLogs.length} carreras`],
        ['sin-tendencia-peso', db.bodyLogs.length === 1, `${db.bodyLogs.length} pesajes`],
        ['perfil-provisional', p.provisional, 'el perfil no sale provisional'],
        ['dominios-sin-medir', p.measured <= 3, `${p.measured}/7 dominios medidos, demasiados para un novato`],
      ];
    },
  },

  corredor: {
    build: buildCorredor,
    desc: 'Cinco meses de running consistente y fuerza testimonial. El 80/20 y las zonas son el marco; el tonelaje no.',
    signals(db, ref) {
      const wk = periodStats(db, 28, ref);
      const split = runIntensitySplit(db.runningLogs, 28, ref);
      const p = computeProfile(db, ref);
      return [
        ['mucho-running', wk.current.km > 100, `solo ${wk.current.km} km en 28 días`],
        ['poca-fuerza', wk.current.strengthSessions <= 1, `${wk.current.strengthSessions} sesiones de fuerza en 28 días`],
        ['reparto-intensidad', split.easyPct != null && split.easyPct >= 50, `reparto fácil ${split.easyPct}%`],
        ['limitado-por-fuerza', p.limitedBy?.id === 'strength', `le limita ${p.limitedBy?.id || 'nada'}, no la fuerza`],
      ];
    },
  },

  molestia: {
    build: buildMolestia,
    desc: 'Rodilla tocada desde hace dos semanas, anotada en las notas de las sesiones; sentadilla bajada un 20% y una sesión saltada.',
    signals(db, ref) {
      const recientes = db.workouts.filter(w => w.date >= shift(REF, -21));
      const conNota = recientes.filter(w => /molestia|rodilla/i.test(w.notes || ''));
      const squats = db.workouts.flatMap(w => w.exercises.filter(e => e.name === 'Sentadilla').map(e => ({ date: w.date, kg: parseFloat(e.sets[0].kg) })));
      const ultima = squats.at(-1), pico = Math.max(...squats.map(s => s.kg));
      return [
        ['molestia-anotada', conNota.length >= 2, `solo ${conNota.length} sesiones recientes mencionan la molestia`],
        ['carga-bajada', ultima.kg < pico * 0.85, `última sentadilla ${ultima.kg} kg vs pico ${pico} kg`],
        ['e1rm-alto-todavia', e1rmByExercise(db.workouts, ref)['Sentadilla'].best.rm > 110, 'el e1RM histórico es bajo: sin margen para prescribir de más'],
        ['sin-carrera', db.runningLogs.length === 0, 'tiene carreras y no debería'],
      ];
    },
  },
};

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const only = args.filter(a => !a.startsWith('-'));
const names = only.length ? only : ARCHETYPE_NAMES;

let failed = 0;
for (const name of names) {
  const arch = ARCHETYPES[name];
  if (!arch) { console.error(`✗ arquetipo desconocido "${name}". Hay: ${ARCHETYPE_NAMES.join(', ')}`); process.exit(1); }

  uid = Date.parse('2026-01-01T00:00:00Z');       // ids deterministas por arquetipo
  const db = arch.build();
  db._eval = { ref: REF, archetype: name, desc: arch.desc };
  const ref = parse(REF);

  const bad = arch.signals(db, ref).filter(([, ok]) => !ok);
  if (bad.length) {
    failed++;
    console.error(`✗ ${name}: el fixture no contiene las señales que sus escenarios interrogan:`);
    for (const [n, , detail] of bad) console.error(`    · ${n}: ${detail}`);
    continue;
  }

  const out = join(HERE, `arete-${name}.json`);
  const json = JSON.stringify(db, null, 1) + '\n';
  if (checkOnly) {
    if (!existsSync(out) || readFileSync(out, 'utf8') !== json) {
      failed++;
      console.error(`✗ ${name}: arete-${name}.json no coincide con el generador. Regenera con: npm run eval:fixture`);
      continue;
    }
  } else {
    writeFileSync(out, json);
  }

  const p = computeProfile(db, ref);
  console.log(`✓ ${name.padEnd(10)} ${db.workouts.length} entrenos · ${db.runningLogs.length} carreras · nivel ${p.level || '—'}${p.provisional ? ' (provisional)' : ''} · limita ${p.limitedBy?.short || '—'}`);
}

if (failed) {
  console.error('\nAjusta las progresiones o el calendario en este mismo fichero.');
  process.exit(1);
}
