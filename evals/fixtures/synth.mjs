#!/usr/bin/env node
// Generador del fixture SINTÉTICO de evals — `arete-synth.json`.
//
// Por qué existe: el fixture real (`arete-real.json`) son los datos del atleta y está
// gitignorado (el repo es público). Eso lo hace inservible como suelo de evaluación por
// dos razones, y la segunda es la grave:
//   1. Nadie más puede reproducir un run.
//   2. CAMBIA CADA VEZ QUE SE ENTRENA. Si la nota baja entre dos runs no se sabe si fue
//      el prompt o si esa semana se corrió menos. Sin fixture fijo no hay comparación,
//      y sin comparación los evals no sirven para decidir nada.
//
// Este atleta es inventado pero coherente, y lleva PLANTADAS las señales que los
// escenarios interrogan (ver SIGNALS abajo). El generador es determinista —mismo JSON
// byte a byte en cada ejecución— y al final VERIFICA con metrics.js que las señales
// existen de verdad: si un ajuste al generador se carga el estancamiento del press, el
// generador falla aquí y no tres runs después, cuando ya no se sabe qué se rompió.
//
// El fixture se versiona; el real se conserva como run opcional (EVAL_FIXTURE=real).
//
// Uso: node evals/fixtures/synth.mjs [--check]   (--check: no escribe, solo verifica)

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  e1rmByExercise, loadRatio, periodStats, recentPRs, weeklySeries, epley,
} from '../../js/ai/metrics.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const OUT = join(HERE, 'arete-synth.json');

// ── Fecha de referencia ──────────────────────────────────────────────────────
// FIJA y declarada dentro del fixture (`_eval.ref`). Todo lo que dice "esta semana",
// "últimos 30 días" o "ratio 7d vs 28d" se calcula contra ella, no contra hoy: si el
// runner usara `new Date()`, el mismo fixture daría un snapshot distinto cada mañana y
// los escenarios temporales ("¿necesito descarga?") dejarían de ser comparables.
export const REF = '2026-08-07';

const DAY = 86400000;
const d2s = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + 'T12:00:00Z');
const shift = (s, days) => d2s(new Date(parse(s).getTime() + days * DAY));

// Lunes de la semana de REF; las semanas se numeran hacia atrás desde ahí.
const refDate = parse(REF);
const refMonday = d2s(new Date(refDate.getTime() - ((refDate.getUTCDay() || 7) - 1) * DAY));

const WEEKS = 34;                       // semanas de histórico (~8 meses)
const monday = (w) => shift(refMonday, -(WEEKS - 1 - w) * 7);   // w: 0 = más antigua

// ── Progresiones de fuerza ───────────────────────────────────────────────────
// Cada entrada devuelve la carga objetivo de la semana w. Las historias que cuentan:
//   · Sentadilla — progresión larga con una descarga en la semana 18. Es el ejercicio
//     "sano": sirve de control frente al press.
//   · Press de Banca — sube hasta la semana 20 y ahí SE ESTANCA: catorce semanas
//     oscilando entre 70 y 72.5 con la última serie fallada. Es el plant de `estancado`.
//   · Peso Muerto / Militar / Clean — progresión lenta, sin drama.
const kgSquat = (w) => (w < 18 ? 60 + w * 2.5 : 92.5 + Math.floor((w - 18) / 2) * 2.5);
const kgBench = (w) => (w < 20 ? 45 + Math.floor(w / 2) * 2.5 : (w % 2 ? 70 : 72.5));
const kgDead = (w) => (w < 20 ? 70 + Math.floor(w / 2) * 5 : 120 + Math.floor((w - 20) / 3) * 2.5);
const kgOhp = (w) => 30 + Math.floor(w / 3) * 1.25;
const kgClean = (w) => 35 + Math.floor(w / 2) * 1.25;

const r2 = (n) => Math.round(n * 4) / 4;   // a cuartos de kg, como se carga una barra
const kgs = (n) => String(r2(n));

// Series de un ejercicio de barra. `fail` acorta la última serie: es como se ve un
// estancamiento en los datos (no "no subió el peso", sino "no completó las reps").
const barSets = (kg, sets, reps, fail = false) =>
  Array.from({ length: sets }, (_, i) => ({
    kg: kgs(kg),
    reps: String(fail && i === sets - 1 ? reps - 2 : reps),
  }));

const bwSets = (sets, reps) => Array.from({ length: sets }, () => ({ kg: '', reps: String(reps) }));

// Sesiones A y B de la fase 1 del programa `arete` (ver programs/arete.json). Los
// nombres deben coincidir EXACTAMENTE con los del programa: el snapshot enseña el plan
// y las tools el histórico, y si no casan el modelo cree que no se está siguiendo nada.
function sessionA(w) {
  const stalled = w >= 20;
  return {
    session: 'Sesión A',
    exercises: [
      { name: 'Sentadilla', sets: barSets(kgSquat(w), 3, 5) },
      { name: 'Press de Banca', sets: barSets(kgBench(w), 3, 5, stalled) },
      { name: 'Peso Muerto', sets: barSets(kgDead(w), 2, 5) },
      { name: 'Dominada Prono', sets: bwSets(3, Math.min(11, 5 + Math.floor(w / 5))) },
      { name: 'Plancha Abdominal', sets: [{ kg: '', reps: '2min' }, { kg: '', reps: '2min' }] },
    ],
  };
}

function sessionB(w) {
  return {
    session: 'Sesión B',
    exercises: [
      { name: 'Sentadilla', sets: barSets(kgSquat(w) - 10, 3, 5) },
      { name: 'Press Militar', sets: barSets(kgOhp(w), 3, 5) },
      { name: 'Clean', sets: barSets(kgClean(w), 5, 3) },
      { name: 'Dominada Supino', sets: bwSets(3, Math.min(12, 6 + Math.floor(w / 5))) },
      { name: 'Plancha Lateral', sets: [{ kg: '', reps: '1min' }, { kg: '', reps: '1min' }] },
    ],
  };
}

// Cuántas sesiones tiene cada semana, como offsets desde el lunes.
//
// Las cuatro últimas están puestas a mano y no por comodidad: el ratio de carga compara
// los 7 días previos a REF contra la media semanal de los 28, así que el pico que
// interroga el escenario `descarga` se construye exactamente ahí. Semanas -4 y -2 flojas
// (2 sesiones), última semana con 4 sesiones seguidas → ratio ≈ 1.4. Si se toca esto, la
// verificación del final avisa.
function sessionsInWeek(w) {
  if (w === WEEKS - 1) return [0, 1, 2, 3];        // pico de carga: lun a jue
  if (w === WEEKS - 2) return [0, 3];
  if (w === WEEKS - 4) return [0, 3];
  if (w === 18) return [0, 3];                     // semana de descarga
  if (w % 5 === 4) return [0, 3];                  // alguna semana floja: adherencia realista
  return [0, 2, 4];
}

const workouts = [];
let wid = Date.parse('2026-01-01T00:00:00Z');
for (let w = 0; w < WEEKS; w++) {
  const days = sessionsInWeek(w);
  days.forEach((off, i) => {
    const date = shift(monday(w), off);
    if (date > shift(REF, -1)) return;             // nada por delante de la fecha de referencia
    const base = i % 2 === 0 ? sessionA(w) : sessionB(w);
    workouts.push({
      id: (wid += 86400000),
      date,
      phase: 1,
      notes: w === 18 && i === 0 ? 'Semana de descarga' : '',
      ...base,
    });
  });
}

// ── Carrera ──────────────────────────────────────────────────────────────────
// Corrió con regularidad de febrero a principios de julio y LO DEJÓ. El último registro
// es del 2026-07-05, treinta y tres días antes de REF: la ventana de 28 días está VACÍA
// de carrera. Es el plant de `no-inventa` ("¿cuántos km he corrido esta semana?" → cero)
// y, de paso, obliga al modelo a usar las tools si quiere hablar de su carrera: el
// snapshot reciente no tiene nada.
const RUN_PLAN = [
  ['rodaje', 8, 2640], ['intervalos', 6.5, 2100], ['rodaje', 10, 3360], ['tempo', 7, 2100],
];
const runningLogs = [];
let rid = Date.parse('2026-02-01T00:00:00Z');
for (let w = 8; w <= 30; w++) {
  const start = monday(w);
  if (start > '2026-07-05') break;
  const perWeek = w % 4 === 3 ? 2 : 3;
  for (let i = 0; i < perWeek; i++) {
    const date = shift(start, [1, 3, 6][i]);
    if (date > '2026-07-05') continue;
    const [type, baseKm, baseSec] = RUN_PLAN[(w + i) % RUN_PLAN.length];
    // Ligera mejora de ritmo con las semanas (y algo más de distancia en los rodajes).
    const km = Math.round((baseKm + (type === 'rodaje' ? (w - 8) * 0.12 : 0)) * 10) / 10;
    const dur = Math.round(baseSec * (1 - (w - 8) * 0.004) * (km / baseKm));
    runningLogs.push({
      id: (rid += 86400000),
      date,
      session: type === 'rodaje' ? 'Rodaje suave' : type === 'tempo' ? 'Tempo 20\'' : 'Series 6×800',
      program: 'mediaMaraton1h40',
      week: Math.min(8, Math.max(1, w - 7)),
      type,
      distance: km,
      duration: dur,
      pace: Math.round(dur / km),
      hr: type === 'rodaje' ? 142 : 168,
      hrMax: null, hrTimeSeries: null, hrZoneTimes: null,
      elevation: type === 'rodaje' ? 45 : 20,
      cadence: null, splits: null, route: null, segments: null,
      source: 'import',
      notes: '',
    });
  }
}

// ── Cuerpo ───────────────────────────────────────────────────────────────────
// Bajada lenta y realista: 78 → 75.4 en ocho meses. Da al modelo con qué hablar de
// composición sin que el peso sea una señal dramática que eclipse a las demás.
const bodyLogs = [];
let bid = Date.parse('2026-01-05T00:00:00Z');
[[0, 78, 18.5], [4, 77.4, 18.1], [9, 77, 17.6], [13, 76.6, 17.2],
 [18, 76.2, 16.9], [22, 76, 16.5], [27, 75.6, 16.2], [32, 75.4, 16]].forEach(([w, peso, grasa]) => {
  bodyLogs.push({ id: (bid += 86400000), date: shift(monday(w), 1), peso, grasa });
});

const db = {
  schemaVersion: 4,
  // Metadatos SOLO de evals. La app los ignora (no están en su schema); el runner los
  // lee para fijar la fecha de referencia del snapshot.
  _eval: {
    ref: REF,
    desc: 'Atleta sintético: 8 meses de fuerza (fase 1 de Areté), press de banca estancado desde la semana 20, pico de carga en la última semana, running abandonado el 2026-07-05.',
  },
  program: 'arete',
  phase: 1,
  workouts,
  bodyLogs,
  deletedIds: [],
  customPrograms: [],
  runningLogs,
  runningProgram: 'mediaMaraton1h40',
  runningWeek: 8,
  runningGoal: { type: 'km', target: 25, enabled: true },
  settings: { height: 178, age: 34, race5k: 1305, maxHR: 186 },
};

// ── Verificación de las señales plantadas ────────────────────────────────────
// Un fixture que no contiene lo que los escenarios preguntan produce evals que fallan
// por el motivo equivocado. Se comprueba con las MISMAS funciones que alimentan el
// snapshot (metrics.js), así que esto valida el fixture y el cálculo a la vez.
const ref = parse(REF);
const failures = [];
const expect = (name, cond, detail) => { if (!cond) failures.push(`${name}: ${detail}`); };

const rms = e1rmByExercise(db.workouts, ref);
const lr = loadRatio(db, ref);
const wk = periodStats(db, 7, ref);
const prs = recentPRs(db.workouts, 30, ref);
const weeks = weeklySeries(db, 8, ref);

// 1. Press de Banca estancado: su mejor e1RM reciente no supera al histórico, y en las
//    últimas semanas hay series falladas.
const bench = rms['Press de Banca'];
expect('press-estancado', bench && bench.recent && bench.recent.rm <= bench.best.rm + 0.01,
  `e1RM reciente ${bench?.recent?.rm?.toFixed(1)} debería no superar el histórico ${bench?.best?.rm?.toFixed(1)}`);
const benchFails = db.workouts.filter(w => w.date >= shift(REF, -60))
  .flatMap(w => w.exercises.filter(e => e.name === 'Press de Banca'))
  .filter(e => e.sets.some(s => Number(s.reps) < 5));
expect('press-reps-falladas', benchFails.length >= 3, `solo ${benchFails.length} sesiones con reps falladas en 60 días`);

// 2. Sentadilla sí progresa (control): PR dentro de los últimos 30 días.
expect('sentadilla-pr', prs.some(p => p.name === 'Sentadilla'),
  `PRs de los últimos 30 días: ${prs.map(p => p.name).join(', ') || 'ninguno'}`);

// 3. Pico de carga: ratio agudo/crónico por encima de 1.3.
expect('pico-carga', lr.ratio != null && lr.ratio > 1.3, `ratio = ${lr.ratio}`);

// 4. Cero carrera en la semana en curso Y en toda la ventana de 28 días.
expect('sin-carrera-7d', wk.current.km === 0 && wk.current.runSessions === 0,
  `${wk.current.runSessions} carreras / ${wk.current.km} km en 7 días`);
const runs28 = db.runningLogs.filter(r => (ref - parse(r.date)) / DAY < 28);
expect('sin-carrera-28d', runs28.length === 0, `${runs28.length} carreras en la ventana de 28 días`);

// 5. Histórico de carrera suficiente para que las tools tengan algo que excavar.
expect('carrera-historica', db.runningLogs.length >= 40, `solo ${db.runningLogs.length} carreras`);

// 6. Volumen coherente: ocho semanas con datos y ninguna vacía salvo las de running.
expect('semanas-con-fuerza', weeks.every(w => w.strengthSessions > 0),
  `semanas sin fuerza: ${weeks.filter(w => !w.strengthSessions).map(w => w.weekStart).join(', ')}`);

if (failures.length) {
  console.error('✗ El fixture no contiene las señales que los escenarios interrogan:\n');
  for (const f of failures) console.error('  · ' + f);
  console.error('\nAjusta las progresiones o el calendario de sesiones en este mismo fichero.');
  process.exit(1);
}

const summary = [
  `workouts: ${db.workouts.length} · carreras: ${db.runningLogs.length} · pesajes: ${db.bodyLogs.length}`,
  `ref: ${REF} · rango: ${db.workouts[0].date} → ${db.workouts.at(-1).date}`,
  `ratio de carga: ${lr.ratio} · semana en curso: ${wk.current.strengthSessions} sesiones / ${wk.current.tonnage} kg / ${wk.current.km} km`,
  `e1RM Sentadilla: ${rms['Sentadilla'].best.rm.toFixed(1)} kg · Press de Banca: ${rms['Press de Banca'].best.rm.toFixed(1)} kg (estancado)`,
  `PRs 30d: ${prs.map(p => p.name).join(', ') || 'ninguno'}`,
];

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) { console.error(`✗ Falta ${OUT}. Ejecuta: node evals/fixtures/synth.mjs`); process.exit(1); }
  const onDisk = readFileSync(OUT, 'utf8');
  const fresh = JSON.stringify(db, null, 1) + '\n';
  if (onDisk !== fresh) {
    console.error('✗ arete-synth.json no coincide con lo que produce el generador.\n  Regenera con: node evals/fixtures/synth.mjs');
    process.exit(1);
  }
  console.log('✓ fixture al día\n  ' + summary.join('\n  '));
} else {
  writeFileSync(OUT, JSON.stringify(db, null, 1) + '\n');
  console.log(`✓ ${OUT}\n  ` + summary.join('\n  '));
}

export { db as SYNTH_DB };
