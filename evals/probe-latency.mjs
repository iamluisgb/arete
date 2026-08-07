#!/usr/bin/env node
// Sonda de latencia (no es un eval): mide DÓNDE se va el tiempo de un turno y comprueba
// si el proveedor emite tool_calls fiables en streaming.
//
// La pregunta que responde: hoy un turno son 3 llamadas (ronda de tools → ronda que
// confirma que no hay más → respuesta). Si el streaming con tools funciona, son 1-2.
//
// Uso: node evals/probe-latency.mjs [arquetipo]
import { buildSnapshot } from '../js/ai/context.js';
import { buildSystemMessage } from '../js/ai/soul.js';
import { QUIRON_TOOLS, QUIRON_WRITE_TOOLS, GATHER_INSTRUCTION, makeToolExecutor } from '../js/ai/tools.js';
import { loadFixture, progContext, chat, BASE_URL, MODEL, apiKey } from './lib.mjs';

const arch = process.argv[2] || 'hibrido';
const { db, ref } = loadFixture(arch);
const pc = progContext(db);
const snapshot = buildSnapshot(db, pc.ctx, ref);
const system = buildSystemMessage(snapshot);

const PROMPTS = process.argv[3] ? [process.argv[3]] : [
  '¿Qué nivel tengo?',                       // el snapshot basta
  '¿Subo peso en sentadilla?',               // pide histórico
  '¿En qué ejercicios estoy estancado?',     // pide varias tools
];

const tok = (s) => Math.round((s || '').length / 4);
console.log(`Modelo ${MODEL} · arquetipo ${arch}`);
console.log(`SOUL ${tok(system.content) - tok(snapshot)} tok · snapshot ${tok(snapshot)} tok · sistema total ${tok(system.content)} tok\n`);

// ── A) El flujo actual, cronometrado por fase ───────────────────────────────
async function actual(prompt) {
  const t0 = Date.now();
  const proposals = [];
  const execute = makeToolExecutor(db, { getPrograms: pc.getPrograms, onProposal: p => proposals.push(p), ref, askedBy: prompt });
  const convo = [system, { role: 'user', content: prompt }];
  const gatherMsgs = [...convo, { role: 'user', content: GATHER_INSTRUCTION }];
  let rounds = 0, apiCalls = 0;
  const calls = [];
  for (let r = 1; r <= 3; r++) {
    rounds = r; apiCalls++;
    const msg = await chat(gatherMsgs, { tools: [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS], toolChoice: r < 3 ? 'auto' : 'none', maxTokens: 1024 });
    const tc = msg.tool_calls || [];
    if (!tc.length) break;
    gatherMsgs.push({ role: 'assistant', content: msg.content || null, tool_calls: tc });
    for (const c of tc) {
      let a = {}; try { a = JSON.parse(c.function?.arguments || '{}'); } catch { /* */ }
      const out = await execute(c.function?.name, a);
      calls.push(c.function?.name);
      gatherMsgs.push({ role: 'tool', tool_call_id: c.id, name: c.function?.name, content: String(out ?? '') });
    }
  }
  const gatherMs = Date.now() - t0;
  if (calls.length) convo.push({ role: 'user', content: '[DATOS]\n' + calls.join('\n') });
  const t1 = Date.now();
  apiCalls++;
  await chat(convo);
  return { gatherMs, answerMs: Date.now() - t1, total: Date.now() - t0, rounds, apiCalls, calls };
}

// ── B) Una sola llamada, STREAMING y con tools ──────────────────────────────
// Mide time-to-first-token y si los tool_calls llegan enteros y parseables.
async function streamingConTools(prompt) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, stream: true, max_tokens: 1024,
      messages: [system, { role: 'user', content: prompt }],
      tools: [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS], tool_choice: 'auto',
    }),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', ttft = null, text = '';
  const partes = new Map();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split('\n\n'); buf = chunks.pop() || '';
    for (const ch of chunks) {
      for (const line of ch.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const p = t.slice(5).trim();
        if (p === '[DONE]') continue;
        let j; try { j = JSON.parse(p); } catch { continue; }
        const d = j.choices?.[0]?.delta || {};
        if (d.content) { ttft ??= Date.now() - t0; text += d.content; }
        for (const tc of (d.tool_calls || [])) {
          ttft ??= Date.now() - t0;
          const cur = partes.get(tc.index) || { name: '', args: '' };
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          partes.set(tc.index, cur);
        }
      }
    }
  }
  const tools = [...partes.values()].map(p => {
    let ok = false; try { JSON.parse(p.args || '{}'); ok = true; } catch { /* */ }
    return { name: p.name, argsOk: ok, args: p.args.slice(0, 60) };
  });
  return { ttft, total: Date.now() - t0, tools, textChars: text.length };
}

for (const p of PROMPTS) {
  console.log(`── "${p}"`);
  const a = await actual(p);
  console.log(`   actual:     ${(a.total / 1000).toFixed(1)}s total = recolección ${(a.gatherMs / 1000).toFixed(1)}s (${a.rounds} rondas) + respuesta ${(a.answerMs / 1000).toFixed(1)}s · ${a.apiCalls} llamadas · tools: ${a.calls.join(', ') || '—'}`);
  const b = await streamingConTools(p);
  console.log(b.error
    ? `   streaming:  ✗ ${b.error}`
    : `   streaming:  TTFT ${(b.ttft / 1000).toFixed(1)}s · total ${(b.total / 1000).toFixed(1)}s · texto ${b.textChars} ch\n${b.tools.map(t => `                 tool ${t.name}(${t.args}) ${t.argsOk ? '✓ args parseables' : '✗ ARGS ROTOS'}`).join('\n') || '                 (sin tools)'}`);
  console.log();
}
