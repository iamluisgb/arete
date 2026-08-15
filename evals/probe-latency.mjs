#!/usr/bin/env node
// Sonda de latencia (no es un eval: no juzga nada y no entra en la batería).
//
// Mide lo que de verdad percibe el atleta: cuánto tarda en aparecer el PRIMER TOKEN, y
// cuántas llamadas a la API cuesta el turno. Reproduce el bucle de `chatAgent`
// (streaming + tools), así que lo que sale aquí es lo que corre en la app.
//
// Sirvió para retirar el protocolo de dos fases: medía 3-4 llamadas por turno y 13-22 s
// de espera ciega. Se conserva para poder repetir la medida al cambiar de modelo o de
// proveedor — es la única forma de saber si un modelo "más rápido" lo es de verdad aquí.
//
// Uso: node evals/probe-latency.mjs [arquetipo] ["pregunta suelta"]

import { buildSnapshot } from '../js/ai/context.js';
import { buildSystemMessage } from '../js/ai/soul.js';
import { QUIRON_TOOLS, QUIRON_WRITE_TOOLS, makeToolExecutor } from '../js/ai/tools.js';
import { loadFixture, progContext, BASE_URL, MODEL, apiKey } from './lib.mjs';

const arch = process.argv[2] || 'hibrido';
const { db, ref } = loadFixture(arch);
const pc = progContext(db);
const snapshot = buildSnapshot(db, pc.ctx, ref);
const system = buildSystemMessage(snapshot);

const PROMPTS = process.argv[3] ? [process.argv[3]] : [
  '¿Qué nivel tengo?',                                          // el snapshot basta
  '¿Subo peso en sentadilla?',                                  // pide histórico
  '¿En qué ejercicios estoy estancado?',                        // pide varias tools
  'Prepárame una sesión de pierna para hoy, tengo 45 minutos.', // ruteo de escritura
];

const tok = (s) => Math.round((s || '').length / 4);
console.log(`Modelo ${MODEL} · arquetipo ${arch}`);
console.log(`SOUL ${tok(system.content) - tok(snapshot)} tok · snapshot ${tok(snapshot)} tok · sistema ${tok(system.content)} tok\n`);

/** Una vuelta del bucle, en streaming. Devuelve el texto, las tool_calls y el TTFT. */
async function stream(messages, withTools) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, messages, stream: true, max_tokens: 2048,
      ...(withTools ? { tools: [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS], tool_choice: 'auto' } : {}),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', ttft = null;
  const partial = new Map();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split('\n\n');
    buf = chunks.pop() || '';
    for (const ch of chunks) {
      for (const line of ch.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const p = t.slice(5).trim();
        if (p === '[DONE]') continue;
        let j;
        try { j = JSON.parse(p); } catch { continue; }
        const d = j.choices?.[0]?.delta || {};
        if (d.content) { ttft ??= Date.now() - t0; text += d.content; }
        for (const tc of (d.tool_calls || [])) {
          ttft ??= Date.now() - t0;
          const cur = partial.get(tc.index) || { id: '', name: '', args: '' };
          if (tc.id) cur.id += tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          partial.set(tc.index, cur);
        }
      }
    }
  }
  return { text, ttft, total: Date.now() - t0, tools: [...partial.values()].filter(t => t.name) };
}

for (const prompt of PROMPTS) {
  const t0 = Date.now();
  const proposals = [];
  const execute = makeToolExecutor(db, { getPrograms: pc.getPrograms, onProposal: p => proposals.push(p), ref, askedBy: prompt });
  const convo = [system, { role: 'user', content: prompt }];
  const fases = [];
  let apiCalls = 0, ttftRespuesta = null, argsRotos = 0;

  for (let round = 1; round <= 3; round++) {
    apiCalls++;
    const r = await stream(convo, round < 3);
    if (!r.tools.length) { ttftRespuesta = Date.now() - t0 - r.total + r.ttft; fases.push(`respuesta ${(r.total / 1000).toFixed(1)}s`); break; }
    fases.push(`tools ${(r.total / 1000).toFixed(1)}s`);
    convo.push({
      role: 'assistant', content: r.text || null,
      tool_calls: r.tools.map((t, i) => ({ id: t.id || `c${round}_${i}`, type: 'function', function: { name: t.name, arguments: t.args || '{}' } })),
    });
    for (const [i, t] of r.tools.entries()) {
      let a = {};
      try { a = JSON.parse(t.args || '{}'); } catch { argsRotos++; }
      convo.push({ role: 'tool', tool_call_id: t.id || `c${round}_${i}`, name: t.name, content: String(await execute(t.name, a) ?? '') });
    }
    if (proposals.length) { ttftRespuesta = Date.now() - t0; break; }   // acaba en tarjeta
  }

  console.log(`── "${prompt}"`);
  console.log(`   ${apiCalls} llamada(s) · ${fases.join(' + ')} · total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`   PRIMER TOKEN a los ${(ttftRespuesta / 1000).toFixed(1)}s${proposals.length ? ' (turno acabado en tarjeta de propuesta)' : ''}${argsRotos ? ` · ⚠ ${argsRotos} tool_calls con argumentos rotos` : ''}\n`);
}
