// Integridad de la batería de evals. No llama a ningún modelo: comprueba que lo que la
// batería declara existe de verdad.
//
// Es barato y evita el fallo más tonto posible: un escenario que apunta a un arquetipo
// sin fixture, o un fixture regenerado a mano que ya no coincide con su generador. Las
// dos cosas producirían un run rojo por el motivo equivocado.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, expand } from '../evals/scenarios.mjs';
import { ARCHETYPE_NAMES } from '../evals/fixtures/synth.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('batería de evals', () => {
  it('cada escenario apunta a arquetipos que existen', () => {
    for (const sc of SCENARIOS) {
      for (const a of (sc.on || ['hibrido'])) {
        expect(ARCHETYPE_NAMES, `${sc.id} apunta a "${a}"`).toContain(a);
      }
    }
  });

  it('los ids de escenario son únicos', () => {
    const ids = SCENARIOS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todos los arquetipos tienen su fixture versionado', () => {
    for (const a of ARCHETYPE_NAMES) {
      expect(existsSync(join(ROOT, `evals/fixtures/arete-${a}.json`)), `falta arete-${a}.json`).toBe(true);
    }
  });

  it('cada arquetipo se ejerce con al menos un escenario', () => {
    const cubiertos = new Set(expand().map(j => j.archetype));
    for (const a of ARCHETYPE_NAMES) expect(cubiertos, `nadie prueba "${a}"`).toContain(a);
  });

  it('el subconjunto smoke cubre todos los arquetipos y es más barato que la batería', () => {
    const todos = expand(), smoke = expand([], { smoke: true });
    expect(smoke.length).toBeGreaterThan(0);
    expect(smoke.length).toBeLessThan(todos.length);
    expect(new Set(smoke.map(j => j.archetype)).size).toBe(ARCHETYPE_NAMES.length);
  });

  it('los fixtures del disco coinciden con lo que produce el generador', () => {
    // Si alguien edita un JSON a mano, el generador y el fixture divergen y las señales
    // que los escenarios interrogan dejan de estar garantizadas.
    execFileSync('node', ['evals/fixtures/synth.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' });
  });

  it('los fixtures declaran su fecha de referencia', () => {
    for (const a of ARCHETYPE_NAMES) {
      const db = JSON.parse(readFileSync(join(ROOT, `evals/fixtures/arete-${a}.json`), 'utf8'));
      expect(db._eval?.ref, `arete-${a}.json sin _eval.ref`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(db._eval.archetype).toBe(a);
    }
  });
});
