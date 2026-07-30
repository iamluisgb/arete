#!/usr/bin/env node
// Batería de evals de Quirón contra datos REALES del atleta.
// Reproduce el turno de la app (fase de recolección con tools + respuesta final)
// llamando al proveedor directamente desde node, y guarda un informe legible en
// evals/out/ para revisión humana + checks automáticos básicos.
//
// Uso:  node evals/run.mjs [ids de escenario...]     (sin args = todos)
// Requiere: evals/fixtures/arete-real.json (export de la app, gitignorado — el
// repo es público) y una key de nan en NAN_API_KEY o en ../bookreader/.env.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from '../js/ai/context.js';
import { QUIRON_TOOLS, QUIRON_WRITE_TOOLS, GATHER_INSTRUCTION, makeToolExecutor } from '../js/ai/tools.js';
import { buildSystemMessage } from '../js/ai/soul.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ROOT, 'evals/fixtures/arete-real.json');
const BASE_URL = process.env.NAN_BASE_URL || 'https://api.nan.builders/v1';
const MODEL = process.env.NAN_MODEL || 'deepseek-v4-flash';

function loadKey() {
  if (process.env.NAN_API_KEY) return process.env.NAN_API_KEY;
  const envPath = join(ROOT, '../bookreader/.env');
  if (existsSync(envPath)) {
    const m = /NAN_API_KEY=(\S+)/.exec(readFileSync(envPath, 'utf8'));
    if (m) return m[1];
  }
  console.error('Falta NAN_API_KEY (env o ../bookreader/.env)');
  process.exit(1);
}
const KEY = loadKey();

if (!existsSync(FIXTURE)) {
  console.error(`Falta ${FIXTURE} — exporta tus datos desde la app (Ajustes → Exportar JSON) y cópialo ahí.`);
  process.exit(1);
}
const db = JSON.parse(readFileSync(FIXTURE, 'utf8'));

// Contexto de programas, resuelto desde los JSON del repo (en la app lo hace programs.js)
function progContext() {
  const { catalog = [] } = JSON.parse(readFileSync(join(ROOT, 'programs.json'), 'utf8'));
  const readProg = (id) => {
    const entry = catalog.find(p => p.id === id);
    if (!entry) return null;
    try { return JSON.parse(readFileSync(join(ROOT, entry.file), 'utf8')); } catch { return null; }
  };
  const prog = readProg(db.program || 'arete') || {};
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
    },
    getPrograms: () => phaseMap,
  };
}

async function chat(messages, { tools, toolChoice, maxTokens = 4096 } = {}) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream: false, max_tokens: maxTokens, ...(tools ? { tools, tool_choice: toolChoice } : {}) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).choices?.[0]?.message || {};
}

// Turno completo como en la app (js/ui/quiron.js): recolección + respuesta.
async function runTurn(question, { ctx, getPrograms }) {
  const system = buildSystemMessage(buildSnapshot(db, ctx));
  const proposals = [];
  const execute = makeToolExecutor(db, { getPrograms, onProposal: (p) => proposals.push(p) });
  const convo = [system, { role: 'user', content: question }];

  // Mismo prompt de recolección que la app (GATHER_INSTRUCTION) y mismas tools,
  // incluidas las de escritura: así el eval mide el ruteo real, no una imitación.
  const gatherMsgs = [...convo, { role: 'user', content: GATHER_INSTRUCTION }];
  const calls = [];
  for (let round = 1; round <= 3; round++) {
    const msg = await chat(gatherMsgs, { tools: [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS], toolChoice: round < 3 ? 'auto' : 'none', maxTokens: 1024 });
    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) break;
    gatherMsgs.push({ role: 'assistant', content: msg.content || null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* inválidos */ }
      const result = await execute(tc.function?.name, args);
      calls.push({ name: tc.function?.name, args, result });
      gatherMsgs.push({ role: 'tool', tool_call_id: tc.id, name: tc.function?.name, content: String(result ?? '') });
    }
  }
  if (calls.length) {
    convo.push({ role: 'user', content: '[DATOS DEL HISTÓRICO — generados por la app, no por el atleta]\n' + calls.map(c => `[${c.name}(${JSON.stringify(c.args)})]\n${c.result}`).join('\n\n') });
  }
  // Si el modelo pidió una escritura, la app no streamea la respuesta normal: el
  // turno termina en la tarjeta de propuesta. Para el eval basta con qué pidió.
  if (proposals.length) return { answer: '(propuesta de escritura)', calls, proposals };
  const answer = await chat(convo);
  return { answer: answer.content || '', calls, proposals };
}

// ── Escenarios ──────────────────────────────────────────────────────────────
// checks: regexes que DEBEN aparecer (ok) o NO aparecer (ban) en la respuesta.
const SCENARIOS = [
  {
    id: 'hoy',
    prompt: '¿Qué toca hoy?',
    ok: [/S5-6|kettlebell|Potencia/i],
    desc: 'Debe apoyarse en el programa activo (Kettlebell fase Potencia, sesiones S5-6).',
  },
  {
    id: 'semana',
    prompt: 'Analiza mis últimas 4 semanas y dame el resumen.',
    ok: [/RESUMEN|[Vv]olumen/, /kg/],
    desc: 'Formato RESUMEN con tonelaje real de las semanas del snapshot.',
  },
  {
    id: 'estancado',
    prompt: '¿En qué ejercicios estoy estancado? Mira el histórico antes de responder.',
    ok: [/Sentadilla|Press|Peso Muerto|Clean|Snatch|Thruster/],
    desc: 'Debería tirar de get_exercise_history/get_workouts y citar ejercicios reales.',
  },
  {
    id: 'descarga',
    prompt: '¿Necesito una descarga esta semana?',
    ok: [/ratio|carga/i],
    desc: 'Debe razonar con el ratio de carga aguda/crónica del snapshot.',
  },
  {
    id: 'no-inventa',
    prompt: '¿Cuántos kilómetros he corrido esta semana?',
    ok: [/no|ning|cero|0/i],
    ban: [/esta semana has corrido \d+/i],
    desc: 'No hay carreras desde abril: debe decir que no hay registros recientes, no inventar km.',
  },
  // ── Ruteo de escritura: tres frases casi iguales, tres destinos distintos.
  // Es el riesgo de calidad de la Fase 5.5: equivocarse aquí no es un error de
  // formato, es escribir en el sitio que no toca.
  {
    id: 'ruteo-sesion',
    prompt: 'Prepárame una sesión de pierna para hoy, tengo 45 minutos.',
    expectTool: 'propose_session',
    banTool: ['propose_program', 'log_workout'],
    desc: 'Una sesión para hacer hoy → propose_session (no un plan, no un registro).',
  },
  {
    id: 'ruteo-sesion-sin-material',
    prompt: 'Hoy no puedo ir al gimnasio. Dame algo que pueda hacer en casa con una kettlebell.',
    expectTool: 'propose_session',
    banTool: ['propose_program'],
    desc: 'Petición implícita de UNA sesión, sin la palabra "sesión".',
  },
  {
    id: 'ruteo-plan',
    prompt: 'Hazme un plan de 8 semanas para subir la sentadilla, 3 días por semana.',
    expectTool: 'propose_program',
    banTool: ['propose_session'],
    desc: 'Varias semanas y progresión → propose_program.',
  },
  {
    id: 'ruteo-registro',
    prompt: 'Hoy he hecho sentadilla 5x5 a 100 y press banca 3x5 a 70.',
    expectTool: 'log_workout',
    banTool: ['propose_session', 'propose_program'],
    desc: 'Entreno en pasado → log_workout, nunca una propuesta.',
  },
  {
    id: 'plan-objetivo',
    prompt: 'Quiero preparar un ultra de 100K de montaña para dentro de 9 meses. ¿Cómo enfocarías mi plan viniendo de donde vengo?',
    ok: [/[Zz]2|rodaje|volumen|progres/],
    desc: 'Anticipo de Fase 5: estructura de plan razonada desde sus datos reales (sin JSON aún).',
  },
];

// ── Runner ──────────────────────────────────────────────────────────────────
const only = process.argv.slice(2);
const toRun = only.length ? SCENARIOS.filter(s => only.includes(s.id)) : SCENARIOS;
const pc = progContext();

const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
const report = [`# Evals Quirón — ${stamp}`, '', `Modelo: ${MODEL} · Fixture: ${db.workouts.length} workouts, ${db.runningLogs.length} carreras, programa ${db.program} fase ${db.phase}`, ''];
let failures = 0;

for (const sc of toRun) {
  process.stdout.write(`▶ ${sc.id}… `);
  const t0 = Date.now();
  try {
    const { answer, calls } = await runTurn(sc.prompt, pc);
    const names = calls.map(c => c.name);
    const okFails = (sc.ok || []).filter(r => !r.test(answer));
    const banFails = (sc.ban || []).filter(r => r.test(answer));
    const toolFails = [];
    if (sc.expectTool && !names.includes(sc.expectTool)) toolFails.push(`esperaba ${sc.expectTool}`);
    for (const t of (sc.banTool || [])) if (names.includes(t)) toolFails.push(`no debía llamar a ${t}`);
    const pass = okFails.length === 0 && banFails.length === 0 && toolFails.length === 0;
    if (!pass) failures++;
    console.log(`${pass ? '✓' : '✗'} (${((Date.now() - t0) / 1000).toFixed(1)}s, tools: ${calls.map(c => c.name).join(', ') || '—'})`);
    report.push(`## ${sc.id} — ${pass ? '✓ PASS' : '✗ FAIL'}`, '', `**Prompt:** ${sc.prompt}`, '', `**Criterio:** ${sc.desc}`, '');
    if (calls.length) report.push(`**Tools:** ${calls.map(c => `${c.name}(${JSON.stringify(c.args)})`).join(' · ')}`, '');
    if (okFails.length) report.push(`**Checks fallidos (esperados):** ${okFails.map(String).join(' , ')}`, '');
    if (banFails.length) report.push(`**Checks fallidos (prohibidos):** ${banFails.map(String).join(' , ')}`, '');
    if (toolFails.length) report.push(`**Ruteo fallido:** ${toolFails.join(' , ')}`, '');
    report.push('**Respuesta:**', '', answer.trim(), '', '---', '');
  } catch (e) {
    failures++;
    console.log(`✗ ERROR: ${e.message}`);
    report.push(`## ${sc.id} — ✗ ERROR`, '', String(e.message), '', '---', '');
  }
}

const outPath = join(ROOT, `evals/out/eval-${stamp}.md`);
writeFileSync(outPath, report.join('\n'));
console.log(`\n${toRun.length - failures}/${toRun.length} escenarios OK → informe en ${outPath}`);
process.exit(failures ? 1 : 0);
