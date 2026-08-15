#!/usr/bin/env node
// FASE 1 del pipeline de evals: GENERAR. Reproduce el turno real de la app (recolección
// con tools + respuesta final) contra cada fixture, y guarda el resultado estructurado en
// `evals/runs/<run>/`. No juzga nada — de eso se ocupa check.mjs.
//
// La separación importa: antes el runner generaba y evaluaba a la vez con regex, así que
// cambiar un criterio obligaba a volver a pagar todas las llamadas. Ahora un run se
// genera una vez y se puede re-comprobar con criterios nuevos las veces que haga falta.
//
// Uso:  node evals/run.mjs [ids de escenario...] [--smoke] [--archetype=novato]
// Env:  EVAL_MODEL (modelo a evaluar) · EVAL_RUN (nombre del run)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSnapshot } from '../js/ai/context.js';
import { buildSystemMessage } from '../js/ai/soul.js';
import { QUIRON_TOOLS, QUIRON_WRITE_TOOLS, makeToolExecutor } from '../js/ai/tools.js';
import { loadFixture, progContext, chat, newRunDir, MODEL } from './lib.mjs';
import { expand } from './scenarios.mjs';

const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
const archArg = args.find(a => a.startsWith('--archetype='))?.split('=')[1] || null;
const ids = args.filter(a => !a.startsWith('-'));

// Mismo tope que la app (GATHER_MAX_ROUNDS en quiron.js).
const MAX_ROUNDS = 3;

// Turno completo, igual que js/ui/quiron.js: UNA llamada con las herramientas puestas;
// si el modelo las pide, se ejecutan y va una segunda con los resultados. Sin fase de
// recolección aparte y sin protocolo "LISTO".
//
// El runner no streamea (no hay a quién pintarle tokens), pero cuenta las mismas llamadas
// y recorre las mismas rondas que la app: lo que se mide aquí es lo que corre allí.
async function runTurn(sc, fixture) {
  const { db, ref } = fixture;
  const pc = progContext(db);
  const snapshot = buildSnapshot(db, pc.ctx, ref);
  const system = buildSystemMessage(snapshot);
  const proposals = [];
  const execute = makeToolExecutor(db, {
    getPrograms: pc.getPrograms,
    onProposal: (p) => proposals.push(p),
    askedBy: sc.prompt,        // mismo respaldo que la app ante una tool sin argumentos
    ref,                       // el perfil de dominios se calcula a la fecha del fixture
  });

  const convo = [system, { role: 'user', content: sc.prompt }];
  const calls = [];
  let apiCalls = 0;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    apiCalls++;
    const msg = await chat(convo, round < MAX_ROUNDS
      ? { tools: [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS], toolChoice: 'auto' }
      : {});
    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) return { answer: msg.content || '', snapshot, calls, proposals, apiCalls, rounds: round };

    convo.push({ role: 'assistant', content: msg.content || null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let a = {};
      try { a = JSON.parse(tc.function?.arguments || '{}'); } catch { /* args inválidos */ }
      const result = await execute(tc.function?.name, a);
      calls.push({ name: tc.function?.name, args: a, result: String(result ?? '') });
      convo.push({ role: 'tool', tool_call_id: tc.id, name: tc.function?.name, content: String(result ?? '') });
    }

    // Las herramientas de escritura terminan el turno en la tarjeta de confirmación: la
    // app no pide respuesta después, así que el eval tampoco.
    if (proposals.length) return { answer: '', snapshot, calls, proposals, apiCalls, rounds: round };
  }
  return { answer: '', snapshot, calls, proposals, apiCalls, rounds: MAX_ROUNDS, exhausted: true };
}

// Agrupados por arquetipo: así el fixture se carga una vez por grupo y el informe se lee
// como lo que es, un atleta detrás de otro.
const jobs = expand(ids, { smoke, archetype: archArg })
  .sort((a, b) => a.archetype.localeCompare(b.archetype));
if (!jobs.length) {
  console.error('✗ Ningún escenario casa con esos filtros.');
  process.exit(1);
}
const dir = newRunDir();

const archetypes = [...new Set(jobs.map(j => j.archetype))];
console.log(`▶ ${jobs.length} ejecuciones · ${archetypes.length} arquetipo(s): ${archetypes.join(', ')} · modelo ${MODEL}${smoke ? ' · smoke' : ''}\n`);

let errors = 0;
let current = null;
for (const { key, archetype, scenario } of jobs) {
  if (archetype !== current) {
    current = archetype;
    console.log(`  ── ${archetype} (ref ${loadFixture(archetype).refStr}) ──`);
  }
  process.stdout.write(`  ${scenario.id.padEnd(28)}`);
  const t0 = Date.now();
  let out;
  try {
    out = await runTurn(scenario, loadFixture(archetype));
  } catch (e) {
    errors++;
    out = { answer: '', snapshot: '', calls: [], proposals: [], error: e.message };
  }
  const ms = Date.now() - t0;
  writeFileSync(join(dir, `${archetype}-${scenario.id}.json`),
    JSON.stringify({ key, id: scenario.id, archetype, prompt: scenario.prompt, ms, ...out }, null, 1));
  console.log(out.error
    ? `✗ ${out.error}`
    : `${(ms / 1000).toFixed(1)}s · ${out.apiCalls} llamada(s) · ${out.calls.map(c => c.name).join(', ') || '—'}`);
}

writeFileSync(join(dir, 'meta.json'), JSON.stringify({
  model: MODEL,
  smoke,
  ts: new Date().toISOString(),
  archetypes,
  scenarios: jobs.map(j => j.key),
  errors,
}, null, 1));

const name = dir.split('/').pop();
console.log(`\n✓ run guardado en evals/runs/${name}`);
console.log(`  Comprueba con: node evals/check.mjs ${name}`);
process.exit(errors ? 1 : 0);
