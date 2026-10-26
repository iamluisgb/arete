// DSML: la llamada de herramienta que llega escrita como TEXTO.
//
// deepseek-v4-flash (el modelo de la demo) tiene su propia sintaxis de tool-call. Cuando
// no la puede emitir por el canal `tool_calls` —o decide no hacerlo— la escribe en
// `content`, y antes de esto el atleta veía el markup en la burbuja y el turno acababa
// sin respuesta. Medido el 2026-10-26 contra producción, en la ronda final de una
// pregunta de principiante.
//
// El fixture es el stream REAL de aquel turno, troceado tal como llegó (las marcas caen
// partidas entre chunks), así que el filtro se prueba contra el troceado de verdad y no
// contra uno cómodo.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURE = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/dsml-stream.json'), 'utf-8'));
const STREAM = FIXTURE.deltas.join('');
const OPEN = '<｜｜DSML｜｜';

async function freshLLM(ajustes = {}) {
  vi.resetModules();
  localStorage.clear();
  const base = { areteAiKey: 'k-test', areteAiBaseUrl: 'https://api.nan.builders/v1', areteAiModel: 'deepseek-v4-flash', ...ajustes };
  for (const [k, v] of Object.entries(base)) localStorage.setItem(k, v);
  return import('../js/ai/llm.js');
}

// Respuesta SSE mínima con la forma que consume `chatAgent` (body.getReader + headers).
function sse(deltas, finish = 'stop') {
  const enc = new TextEncoder();
  let raw = '';
  for (const d of deltas) raw += `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`;
  raw += `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\n`;
  raw += 'data: [DONE]\n\n';
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: new ReadableStream({ start(c) { c.enqueue(enc.encode(raw)); c.close(); } }),
  };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('parseDsmlCalls', () => {
  it('saca la llamada y sus parámetros del markup real', async () => {
    const { parseDsmlCalls } = await freshLLM();
    const calls = parseDsmlCalls(STREAM);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('remember');
    // Los nombres son los del esquema de la herramienta (`texto`, `categoria`), no los
    // del JSON de OpenAI: el modelo escribe los suyos y hay que respetarlos.
    expect(Object.keys(calls[0].args).sort()).toEqual(['categoria', 'texto']);
    expect(calls[0].args.categoria).toBe('otro');
    expect(calls[0].args.texto).toContain('Principiante absoluto');
  });

  it('varias llamadas en el mismo bloque', async () => {
    const { parseDsmlCalls } = await freshLLM();
    const bloque = (n, q) => `${OPEN} invoke name="${n}">\n${OPEN} parameter name="query" string="true">${q}</${OPEN.slice(1)} parameter>\n</${OPEN.slice(1)} invoke>\n`;
    const calls = parseDsmlCalls(`${OPEN} calls>\n${bloque('find_exercises', 'sentadilla')}${bloque('find_exercises', 'remo')}</${OPEN.slice(1)} calls>`);
    expect(calls.map(c => c.name)).toEqual(['find_exercises', 'find_exercises']);
    expect(calls.map(c => c.args.query)).toEqual(['sentadilla', 'remo']);
  });

  it('texto normal sin markup no devuelve nada', async () => {
    const { parseDsmlCalls } = await freshLLM();
    expect(parseDsmlCalls('Toca sentadilla 3×5.')).toEqual([]);
    expect(parseDsmlCalls('')).toEqual([]);
  });
});

describe('createDsmlFilter', () => {
  it('no deja pasar ni un carácter del bloque, con el troceado real', async () => {
    const { createDsmlFilter } = await freshLLM();
    const f = createDsmlFilter();
    let visible = '';
    for (const d of FIXTURE.deltas) visible += f.push(d);
    visible += f.flush();
    expect(visible).toBe('');
    expect(f.sawDsml).toBe(true);
  });

  it('conserva el preámbulo y tira el bloque', async () => {
    const { createDsmlFilter } = await freshLLM();
    const f = createDsmlFilter();
    let visible = f.push('Voy a mirar tu historial. ');
    for (const d of FIXTURE.deltas) visible += f.push(d);
    visible += f.flush();
    expect(visible).toBe('Voy a mirar tu historial. ');
  });

  it('la marca partida en CUALQUIER punto no se cuela', async () => {
    const { createDsmlFilter } = await freshLLM();
    for (let k = 0; k <= STREAM.length; k++) {
      const f = createDsmlFilter();
      const out = f.push(STREAM.slice(0, k)) + f.push(STREAM.slice(k)) + f.flush();
      // La cola retenida puede ser un prefijo de la marca, nunca markup completo.
      expect(out.includes('DSML')).toBe(false);
      expect(out.length).toBeLessThan(OPEN.length);
    }
  });

  it('un texto corriente con < y > pasa intacto', async () => {
    const { createDsmlFilter } = await freshLLM();
    const f = createDsmlFilter();
    expect(f.push('3 < 5 y 7 > 2') + f.flush()).toBe('3 < 5 y 7 > 2');
    expect(f.sawDsml).toBe(false);
  });

  it('un bloque sin cerrar se descarta entero al cerrar el stream', async () => {
    const { createDsmlFilter } = await freshLLM();
    const f = createDsmlFilter();
    const out = f.push(`${OPEN} invoke name="remember">` + 'x'.repeat(500)) + f.flush();
    expect(out).toBe('');
    expect(f.sawDsml).toBe(true);
  });
});

describe('chatAgent con DSML', () => {
  it('ejecuta la llamada que llegó como texto y contesta con su resultado', async () => {
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      bodies.push(JSON.parse(init.body));
      // 1ª ronda: el markup real. 2ª: la respuesta ya con el resultado dentro.
      return bodies.length === 1 ? sse(FIXTURE.deltas) : sse(['Listo, lo guardo.']);
    }));

    const { chatAgent, DSML_FALLBACK } = await freshLLM();
    const ejecutadas = [];
    const tokens = [];
    const res = await chatAgent({
      messages: [{ role: 'user', content: 'nunca he entrenado' }],
      tools: [{ type: 'function', function: { name: 'remember', parameters: { type: 'object', properties: {} } } }],
      execute: async (name, args) => { ejecutadas.push({ name, args }); return 'guardado [M1]'; },
      maxRounds: 3,
      onToken: t => tokens.push(t),
    });

    expect(ejecutadas).toHaveLength(1);
    expect(ejecutadas[0].name).toBe('remember');
    expect(ejecutadas[0].args.texto).toContain('Principiante');
    expect(res.content).toBe('Listo, lo guardo.');
    expect(res.content).not.toBe(DSML_FALLBACK);
    // Lo que se pinta en la burbuja no lleva markup, ni en el preámbulo ni después.
    expect(tokens.join('')).toBe('Listo, lo guardo.');
    expect(tokens.join('').includes('DSML')).toBe(false);
  });

  it('la petición lleva las herramientas en TODAS las rondas', async () => {
    // La causa del fallo era quitarlas en la última ronda "para forzar el cierre".
    const bodies = [];
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      bodies.push(JSON.parse(init.body));
      n++;
      const enc = new TextEncoder();
      const chunk = { choices: [{ delta: { tool_calls: [{ index: 0, id: `c${n}`, function: { name: 'remember', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] };
      const fin = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
      return { ok: true, status: 200, headers: { get: () => null }, body: new ReadableStream({ start(c) { c.enqueue(enc.encode(fin)); c.close(); } }) };
    }));

    const { chatAgent } = await freshLLM();
    await chatAgent({
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ type: 'function', function: { name: 'remember', parameters: { type: 'object', properties: {} } } }],
      execute: async () => 'ok',
      maxRounds: 3,
    });

    expect(bodies.length).toBeGreaterThan(1);
    for (const b of bodies) expect(Array.isArray(b.tools)).toBe(true);
  });

  it('si el markup viene ilegible, el atleta recibe una frase y nunca el volcado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([`${OPEN} calls>\nbasura sin invoke\n</${OPEN} calls>`])));
    const { chatAgent, DSML_FALLBACK } = await freshLLM();
    const tokens = [];
    const res = await chatAgent({
      messages: [{ role: 'user', content: 'x' }],
      execute: async () => 'ok',
      maxRounds: 2,
      onToken: t => tokens.push(t),
    });
    expect(res.content).toBe(DSML_FALLBACK);
    expect(tokens.join('')).toBe(DSML_FALLBACK);
    expect(tokens.join('').includes('DSML')).toBe(false);
  });

  it('si se agota el presupuesto pidiendo herramientas, no deja la burbuja vacía', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++;
      const enc = new TextEncoder();
      const chunk = { choices: [{ delta: { tool_calls: [{ index: 0, id: `c${n}`, function: { name: 'remember', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] };
      const raw = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
      return { ok: true, status: 200, headers: { get: () => null }, body: new ReadableStream({ start(c) { c.enqueue(enc.encode(raw)); c.close(); } }) };
    }));
    const { chatAgent, DSML_FALLBACK } = await freshLLM();
    const tokens = [];
    const res = await chatAgent({
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ type: 'function', function: { name: 'remember', parameters: { type: 'object', properties: {} } } }],
      execute: async () => 'ok',
      maxRounds: 2,
      onToken: t => tokens.push(t),
    });
    expect(res.exhausted).toBe(true);
    expect(res.content).toBe(DSML_FALLBACK);
    expect(tokens.join('')).toBe(DSML_FALLBACK);
  });
});
