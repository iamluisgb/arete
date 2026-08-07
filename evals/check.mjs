#!/usr/bin/env node
// FASE 2 del pipeline: COMPROBACIONES DETERMINISTAS sobre un run. Sin API, sin juez.
//
// Principio (traído de bookreader, su docs/EVALS.md): todo lo que se puede comprobar con
// código se comprueba con código, y los fallos DUROS capan el resultado. Un juez LLM es
// caro, ruidoso y tiende a perdonar errores exactos; que la sentadilla prescrita esté por
// encima del 1RM estimado no es cuestión de criterio, es una resta.
//
// Qué se comprueba y por qué:
//   ruteo        (duro)  la herramienta pedida es la que toca. Equivocarse aquí no es un
//                        error de formato: escribe un plan donde iba una sesión suelta.
//   cifras       (duro)  toda cifra con unidad de una respuesta descriptiva existe en el
//                        snapshot o en un resultado de herramienta. Es el equivalente de
//                        la cita [[aN]] de bookreader: el número inventado es LA
//                        alucinación de este dominio, y no la miraba nadie.
//   carga        (duro)  ninguna carga prescrita supera el 1RM estimado del atleta.
//   formato      (duro)  el bloque ``` lleva solo la tabla (dentro no se renderiza el
//                        markdown y las líneas largas se cortan en móvil).
//   pr           (duro)  el "PR detectado" del RESUMEN coincide con los PRs reales.
//   idioma       (duro)  responde en español.
//   vocabulario  (blando) los ejercicios prescritos están en el catálogo.
//   esperado / prohibido (blando) las expectativas por escenario: señalan, no capan.
//
// La lógica vive en evals/checks.mjs (pura, con tests en tests/evals-checks.test.js).
// Aquí solo está el CLI: cargar el fixture, iterar y escribir el informe.
//
// Uso: node evals/check.mjs [run]     (sin argumento: el run más reciente)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { e1rmByExercise, recentPRs } from '../js/ai/metrics.js';
import { loadFixture, knownExercises, resolveRunDir, loadRun } from './lib.mjs';
import { buildTruth, checkScenario } from './checks.mjs';
import { SCENARIOS } from './scenarios.mjs';

const { db, ref } = loadFixture();
const truth = buildTruth({
  rms: e1rmByExercise(db.workouts, ref),
  prs: recentPRs(db.workouts, 30, ref),
  known: knownExercises(db),
});

const dir = resolveRunDir();
const { meta, results, name } = loadRun(dir);
const byIdMap = new Map(SCENARIOS.map(s => [s.id, s]));

console.log(`Run ${name} · modelo ${meta.model} · fixture ${meta.fixture} (ref ${meta.ref})\n`);

const report = [];
let hardFails = 0, softFails = 0, softTotal = 0;

for (const r of results) {
  const sc = byIdMap.get(r.id);
  if (!sc) continue;                     // escenario retirado desde que se generó el run
  const { hard, soft } = checkScenario(sc, r, truth);
  const hf = hard.filter(c => !c.ok), sf = soft.filter(c => !c.ok);
  hardFails += hf.length;
  softFails += sf.length;
  softTotal += soft.length;
  report.push({ id: r.id, pass: hf.length === 0, hard, soft });

  const mark = hf.length ? '✗' : sf.length ? '~' : '✓';
  const tail = hf.length ? hf.map(c => c.name).join(', ') : `${soft.length - sf.length}/${soft.length} blandos`;
  console.log(`${mark} ${r.id.padEnd(26)} ${tail}`);
  for (const c of hf) console.log(`    ✗ ${c.name}: ${c.detail}`);
  for (const c of sf) console.log(`    ~ ${c.name}: ${c.detail}`);
}

const passed = report.filter(r => r.pass).length;
writeFileSync(join(dir, 'checks.json'), JSON.stringify({
  run: name, model: meta.model, fixture: meta.fixture, ref: meta.ref,
  hardFails, softFails, softTotal, passed, total: report.length, scenarios: report,
}, null, 1));

console.log(`\n${passed}/${report.length} escenarios sin fallo duro · ${softTotal - softFails}/${softTotal} expectativas blandas`);
console.log(`  ${join('evals/runs', name, 'checks.json')}`);
if (hardFails) console.log(`\n  ${hardFails} fallo(s) duro(s): capan el run.`);
process.exit(hardFails ? 1 : 0);
