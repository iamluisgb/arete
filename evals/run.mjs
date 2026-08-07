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
import { QUIRON_TOOLS, QUIRON_WRITE_TOOLS, GATHER_INSTRUCTION, makeToolExecutor } from '../js/ai/tools.js';
import { loadFixture, progContext, chat, newRunDir, MODEL } from './lib.mjs';
import { expand } from './scenarios.mjs';

const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
const archArg = args.find(a => a.startsWith('--archetype='))?.split('=')[1] || null;
const ids = args.filter(a => !a.startsWith('-'));

// Turno completo, igual que js/ui/quiron.js: fase de recolección (no-streaming, con las
// tools de lectura Y las de escritura, para que el ruteo que se mide sea el real) y
// después la respuesta. El snapshot se construye con la fecha de referencia del fixture,
// no con `new Date()`: es lo que hace que dos runs sean comparables.
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

  const gatherMsgs = [...convo, { role: 'user', content: GATHER_INSTRUCTION }];
  const calls = [];
  for (let round = 1; round <= 3; round++) {
    const msg = await chat(gatherMsgs, {
      tools: [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS],
      toolChoice: round < 3 ? 'auto' : 'none',
      maxTokens: 1024,
    });
    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) break;
    gatherMsgs.push({ role: 'assistant', content: msg.content || null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let a = {};
      try { a = JSON.parse(tc.function?.arguments || '{}'); } catch { /* args inválidos */ }
      const result = await execute(tc.function?.name, a);
      calls.push({ name: tc.function?.name, args: a, result: String(result ?? '') });
      gatherMsgs.push({ role: 'tool', tool_call_id: tc.id, name: tc.function?.name, content: String(result ?? '') });
    }
  }

  if (calls.length) {
    convo.push({
      role: 'user',
      content: '[DATOS DEL HISTÓRICO — generados por la app, no por el atleta]\n'
        + calls.map(c => `[${c.name}(${JSON.stringify(c.args)})]\n${c.result}`).join('\n\n'),
    });
  }

  // Si pidió una escritura, la app no streamea respuesta normal: el turno acaba en la
  // tarjeta de propuesta. Lo que se evalúa entonces es QUÉ pidió, no qué dijo.
  if (proposals.length) return { answer: '', snapshot, calls, proposals };

  const msg = await chat(convo);
  return { answer: msg.content || '', snapshot, calls, proposals };
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
    : `${(ms / 1000).toFixed(1)}s · ${out.calls.map(c => c.name).join(', ') || '—'}`);
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
