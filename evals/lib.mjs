// Piezas compartidas por el pipeline de evals: generar (run.mjs) → comprobar
// (check.mjs). Aquí vive todo lo que ambos necesitan saber — dónde está el fixture,
// dónde se escribe un run, cómo se habla con el proveedor — para que ninguno de los dos
// tenga su propia versión de la verdad.

import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RUNS_DIR = join(ROOT, 'evals/runs');

// ── Fixtures por arquetipo ──────────────────────────────────────────────────
// Un atleta sintético versionado por arquetipo (evals/fixtures/synth.mjs) más `real`,
// el export del atleta, gitignorado. Los sintéticos son los que sirven para COMPARAR
// runs: no cambian. Se cachean porque un run los pide una vez por escenario.
export const DEFAULT_ARCHETYPE = 'hibrido';
const cache = new Map();

export function loadFixture(which = DEFAULT_ARCHETYPE) {
  if (cache.has(which)) return cache.get(which);
  const file = which === 'real' ? 'arete-real.json' : `arete-${which}.json`;
  const path = join(ROOT, 'evals/fixtures', file);
  if (!existsSync(path)) {
    if (which === 'real') fail(`Falta ${path}. Exporta tus datos desde la app (Ajustes → Exportar JSON).`);
    fail(`Falta ${path}. Genéralo con: npm run eval:fixture`);
  }
  const db = JSON.parse(readFileSync(path, 'utf8'));
  // Fecha de referencia: la que declare el fixture o, para el real, hoy. Todo el
  // pipeline la usa; sin ella el snapshot se movería solo entre runs.
  const ref = db._eval?.ref ? new Date(db._eval.ref + 'T12:00:00Z') : new Date();
  const out = { db, ref, name: which, refStr: ref.toISOString().slice(0, 10) };
  cache.set(which, out);
  return out;
}

// ── Contexto de programas ───────────────────────────────────────────────────
// En la app lo resuelve programs.js contra el DOM y el estado cargado; aquí se lee de
// los JSON del repo. Devuelve lo que necesitan buildSnapshot y el ejecutor de tools.
export function progContext(db) {
  const { catalog = [] } = JSON.parse(readFileSync(join(ROOT, 'programs.json'), 'utf8'));
  const readProg = (id) => {
    const entry = catalog.find(p => p.id === id);
    if (!entry) return null;
    try { return JSON.parse(readFileSync(join(ROOT, entry.file), 'utf8')); } catch { return null; }
  };
  const prog = readProg(db.program) || {};
  const { _meta, ...phaseMap } = prog;
  const phase = phaseMap[db.phase];
  const runProg = readProg(db.runningProgram);
  return {
    ctx: {
      name: _meta?.name || db.program,
      phaseName: phase?.name,
      sessionNames: Object.keys(phase?.sessions || {}),
      runProgramName: runProg?._meta?.name,
      runWeek: runProg ? db.runningWeek : 0,
      plannedPerWeek: Object.keys(phase?.sessions || {}).filter(n => !/HIIT/i.test(n)).length,
    },
    getPrograms: () => phaseMap,
    phase,
  };
}

/** Nombres de ejercicio conocidos: los de todos los programas del repo + los que el
 *  atleta ya ha registrado. Es el vocabulario contra el que se valida lo prescrito. */
export function knownExercises(db) {
  const names = new Set();
  const { catalog = [] } = JSON.parse(readFileSync(join(ROOT, 'programs.json'), 'utf8'));
  for (const entry of catalog) {
    let prog;
    try { prog = JSON.parse(readFileSync(join(ROOT, entry.file), 'utf8')); } catch { continue; }
    for (const [k, phase] of Object.entries(prog)) {
      if (k === '_meta') continue;
      for (const exs of Object.values(phase.sessions || {})) {
        for (const ex of (exs || [])) if (ex.name) names.add(ex.name);
      }
    }
  }
  for (const w of (db.workouts || [])) for (const ex of (w.exercises || [])) if (ex.name) names.add(ex.name);
  return names;
}

// ── Proveedor ───────────────────────────────────────────────────────────────
export const BASE_URL = (process.env.NAN_BASE_URL || 'https://api.nan.builders/v1').replace(/\/+$/, '');
export const MODEL = process.env.EVAL_MODEL || process.env.NAN_MODEL || 'deepseek-v4-flash';

export function apiKey() {
  if (process.env.NAN_API_KEY) return process.env.NAN_API_KEY;
  const envPath = join(ROOT, '../bookreader/.env');
  if (existsSync(envPath)) {
    const m = /NAN_API_KEY=(\S+)/.exec(readFileSync(envPath, 'utf8'));
    if (m) return m[1];
  }
  fail('Falta NAN_API_KEY (variable de entorno o ../bookreader/.env)');
}

/** Chat no-streaming contra el proveedor. Reintenta los transitorios, como la app. */
export async function chat(messages, { tools, toolChoice, maxTokens = 4096, model = MODEL, temperature } = {}) {
  const key = apiKey();
  const body = JSON.stringify({
    model, messages, stream: false, max_tokens: maxTokens,
    ...(temperature != null ? { temperature } : {}),
    ...(tools ? { tools, tool_choice: toolChoice } : {}),
  });
  let last;
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) return (await res.json()).choices?.[0]?.message || {};
    last = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
    // 520-524 son los errores de borde de Cloudflare (el proveedor va detrás): 524 es un
    // timeout de origen y es transitorio. Sin reintentarlo, un escenario del run se pierde
    // entero por algo que no tiene nada que ver con el agente.
    if (![408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(res.status)) break;
    await new Promise(r => setTimeout(r, Math.min(700 * 2 ** i, 8000)));
  }
  throw new Error(last);
}

// ── Runs ────────────────────────────────────────────────────────────────────
/** Directorio del run a escribir: EVAL_RUN o una marca de tiempo con el modelo. */
export function newRunDir() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const name = process.env.EVAL_RUN || `${stamp}-${MODEL}`;
  const dir = join(RUNS_DIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Directorio del run a LEER: argumento posicional, EVAL_RUN, o el más reciente. */
export function resolveRunDir(arg) {
  const explicit = arg || process.argv[2] || process.env.EVAL_RUN;
  if (explicit) {
    const dir = existsSync(explicit) ? explicit : join(RUNS_DIR, explicit);
    if (!existsSync(dir)) fail(`No existe el run "${explicit}"`);
    return dir;
  }
  if (!existsSync(RUNS_DIR)) fail('No hay runs todavía. Ejecuta: npm run eval');
  const dirs = readdirSync(RUNS_DIR).map(n => join(RUNS_DIR, n))
    .filter(p => existsSync(join(p, 'meta.json')))
    .sort();
  if (!dirs.length) fail('No hay runs completos en evals/runs/');
  return dirs.at(-1);
}

/** Los resultados de un run, en el orden en que se declararon (`<arquetipo>/<id>`). */
export function loadRun(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const results = meta.scenarios.map(key => JSON.parse(readFileSync(join(dir, `${key.replace('/', '-')}.json`), 'utf8')));
  return { meta, results, name: basename(dir) };
}

export function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
