// La ayuda como corpus de Quirón: búsqueda, herramienta y check de citas.
//
// Lo que se protege aquí: que el modelo no componga URLs de la guía a mano. La
// herramienta devuelve páginas reales; el check de eval falla si una respuesta
// cita una que no existe. Las dos mitades se prueban por separado y juntas.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buscarAyuda, fragmento, formatearAyuda, norm } from '../js/ai/ayuda.js';
import { makeToolExecutor, QUIRON_TOOLS } from '../js/ai/tools.js';
import { toolLabel } from '../js/ui/quiron.js';
import { buildTruth, checkScenario, citasAyuda } from '../evals/checks.mjs';

const INDICE = JSON.parse(readFileSync(join(process.cwd(), 'ayuda/indice.json'), 'utf8'));
const run = (over = {}) => ({ answer: '', snapshot: '', calls: [], proposals: [], ...over });
const fails = (res, name) => res.hard.filter(c => !c.ok).map(c => c.name).includes(name);

describe('búsqueda en la ayuda', () => {
  it('encuentra por título y por texto, sin acentos ni mayúsculas', () => {
    expect(buscarAyuda(INDICE, 'caducan')[0].url).toBe('/ayuda/explicacion/por-que-caducan-los-tests/');
    expect(buscarAyuda(INDICE, 'CADUCAN')[0].url).toBe('/ayuda/explicacion/por-que-caducan-los-tests/');
    expect(buscarAyuda(INDICE, 'copia de seguridad')[0].url).toBe('/ayuda/guias/copia-drive/');
  });

  it('devuelve como mucho tres y con su URL', () => {
    const hits = buscarAyuda(INDICE, 'nivel');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(3);
    for (const h of hits) {
      expect(h.url.startsWith('/ayuda/')).toBe(true);
      expect(h.fragmento.length).toBeGreaterThan(20);
    }
  });

  it('una consulta vacía o de una letra no devuelve nada', () => {
    expect(buscarAyuda(INDICE, '')).toEqual([]);
    expect(buscarAyuda(INDICE, 'a')).toEqual([]);
    expect(buscarAyuda(null, 'nivel')).toEqual([]);
  });

  it('el fragmento enseña el contexto de la palabra buscada', () => {
    const f = fragmento('Texto previo. El test caduca a los 42 días y luego se repite. Texto posterior.', ['caduca']);
    expect(norm(f)).toContain('42');
    expect(f).toContain('caduca');
  });

  it('el texto que ve el modelo cita la página y avisa de no inventar', () => {
    const texto = formatearAyuda(buscarAyuda(INDICE, 'importar carrera'));
    expect(texto).toContain('/ayuda/');
    expect(texto).toContain('Cita');
    expect(formatearAyuda([])).toContain('No inventes');
  });
});

describe('herramienta buscar_ayuda', () => {
  it('está declarada como herramienta de lectura', () => {
    expect(QUIRON_TOOLS.map(t => t.function.name)).toContain('buscar_ayuda');
  });

  it('tiene etiqueta propia: no cae al genérico', () => {
    expect(toolLabel(['buscar_ayuda'])).toBe('consultando la guía…');
  });

  it('el ejecutor devuelve páginas reales del índice inyectado', async () => {
    const execute = makeToolExecutor({}, { ayudaIndice: INDICE });
    const salida = await execute('buscar_ayuda', { query: 'peso corporal' });
    expect(salida).toContain('/ayuda/');
    expect(salida).toContain('GUÍA DE ARETÉ');
  });

  it('sin consulta devuelve un error explícito, no una respuesta vacía', async () => {
    const execute = makeToolExecutor({}, { ayudaIndice: INDICE });
    expect(await execute('buscar_ayuda', {})).toMatch(/^ERROR/);
  });
});

describe('check de citas de la ayuda', () => {
  const GUÍAS = ['/ayuda/explicacion/por-que-caducan-los-tests/', '/ayuda/guias/copia-drive/'];
  const TRUTH = buildTruth({ known: new Set(), guias: GUÍAS });
  const SC = { id: 'citas', prompt: '¿por qué caduca un test?' };

  it('normaliza ruta y URL completa, con o sin barra final', () => {
    expect(citasAyuda('Mira /ayuda/guias/copia-drive y https://arete.raiatech.com/ayuda/guias/copia-drive/.'))
      .toEqual(['/ayuda/guias/copia-drive/']);
    expect(citasAyuda('sin enlaces')).toEqual([]);
  });

  it('una respuesta sin citas no falla (no toda pregunta es de procedimiento)', () => {
    const res = checkScenario(SC, run({ answer: 'Caduca a los 42 días.' }), TRUTH);
    expect(fails(res, 'cita-guía')).toBe(false);
  });

  it('una cita real pasa', () => {
    const res = checkScenario(SC, run({ answer: 'Caduca a los 42 días. Lo explica /ayuda/explicacion/por-que-caducan-los-tests/.' }), TRUTH);
    expect(fails(res, 'cita-guía')).toBe(false);
  });

  it('una cita inventada es fallo duro', () => {
    const res = checkScenario(SC, run({ answer: 'Lo explica /ayuda/explicacion/test-que-no-existe/.' }), TRUTH);
    expect(fails(res, 'cita-guía')).toBe(true);
  });

  it('sin índice de guías en la verdad, el check no corre', () => {
    const sinGuias = buildTruth({ known: new Set() });
    const res = checkScenario(SC, run({ answer: 'Lo explica /ayuda/inventada/.' }), sinGuias);
    expect(fails(res, 'cita-guía')).toBe(false);
  });
});
