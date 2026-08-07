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

// La verdad es POR ARQUETIPO: el e1RM contra el que se juzga una carga prescrita y los
// PRs contra los que se juzga un "PR detectado" son los de ESE atleta. Juzgar al novato
// con los récords del híbrido daría por buena una sentadilla de 110 kg a quien lleva
// tres entrenos.
const truths = new Map();
function truthFor(archetype) {
  if (!truths.has(archetype)) {
    const { db, ref } = loadFixture(archetype);
    truths.set(archetype, buildTruth({
      rms: e1rmByExercise(db.workouts, ref),
      prs: recentPRs(db.workouts, 30, ref),
      known: knownExercises(db),
    }));
  }
  return truths.get(archetype);
}

const dir = resolveRunDir();
const { meta, results, name } = loadRun(dir);
const byIdMap = new Map(SCENARIOS.map(s => [s.id, s]));

console.log(`Run ${name} · modelo ${meta.model}${meta.smoke ? ' · smoke' : ''} · arquetipos: ${(meta.archetypes || []).join(', ')}\n`);

const report = [];
let hardFails = 0, softFails = 0, softTotal = 0;
let currentArch = null;

for (const r of results) {
  const sc = byIdMap.get(r.id);
  if (!sc) continue;                     // escenario retirado desde que se generó el run
  if (r.archetype !== currentArch) {
    currentArch = r.archetype;
    console.log(`── ${currentArch} ──`);
  }
  const { hard, soft } = checkScenario(sc, r, truthFor(r.archetype));
  const hf = hard.filter(c => !c.ok), sf = soft.filter(c => !c.ok);
  hardFails += hf.length;
  softFails += sf.length;
  softTotal += soft.length;
  report.push({ key: r.key, id: r.id, archetype: r.archetype, pass: hf.length === 0, hard, soft });

  const mark = hf.length ? '✗' : sf.length ? '~' : '✓';
  const tail = hf.length ? hf.map(c => c.name).join(', ') : `${soft.length - sf.length}/${soft.length} blandos`;
  console.log(`${mark} ${r.id.padEnd(26)} ${tail}`);
  for (const c of hf) console.log(`    ✗ ${c.name}: ${c.detail}`);
  for (const c of sf) console.log(`    ~ ${c.name}: ${c.detail}`);
}

const passed = report.filter(r => r.pass).length;
writeFileSync(join(dir, 'checks.json'), JSON.stringify({
  run: name, model: meta.model, smoke: meta.smoke, archetypes: meta.archetypes,
  hardFails, softFails, softTotal, passed, total: report.length,
  // Desglose por arquetipo: una nota global esconde que el agente va bien con el atleta
  // maduro y mal con el novato, que es justo lo que la batería existe para ver.
  byArchetype: Object.fromEntries((meta.archetypes || []).map(a => {
    const rows = report.filter(r => r.archetype === a);
    return [a, { passed: rows.filter(r => r.pass).length, total: rows.length }];
  })),
  scenarios: report,
}, null, 1));

console.log(`\n${passed}/${report.length} sin fallo duro · ${softTotal - softFails}/${softTotal} expectativas blandas`);
for (const a of (meta.archetypes || [])) {
  const rows = report.filter(r => r.archetype === a);
  console.log(`  ${a.padEnd(10)} ${rows.filter(r => r.pass).length}/${rows.length}`);
}
console.log(`  ${join('evals/runs', name, 'checks.json')}`);
if (hardFails) console.log(`\n  ${hardFails} fallo(s) duro(s): capan el run.`);
process.exit(hardFails ? 1 : 0);
