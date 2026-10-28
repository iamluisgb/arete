// Índice de animaciones 3D: nombres exactos de los planes → animación.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { anim3dId, ANIM3D_NAMES } from '../js/anim3d/catalog.js';

describe('animaciones 3D: qué ejercicio abre cada nombre', () => {
  it('«Squat» del plan de pesa rusa es la goblet, no la sentadilla con barra', () => {
    expect(anim3dId('Squat')).toBe('kb-sentadilla');
    expect(anim3dId('Sentadilla')).toBe('squat');
    expect(anim3dId('Deadlift')).toBe('kb-deadlift');
    expect(anim3dId('Peso Muerto')).toBe('deadlift');
  });
  it('sin animación, nada', () => {
    expect(anim3dId('Press Banca')).toBeNull();
    expect(anim3dId('')).toBeNull();
  });
  it('cada animación del índice existe en el catálogo del motor', () => {
    const src = readFileSync('js/anim3d/exercises.js', 'utf8');
    const ids = [...src.matchAll(/\{ id: '([^']+)'/g)].map(m => m[1]);
    expect(Object.keys(ANIM3D_NAMES).sort()).toEqual(ids.sort());
  });
  it('los nombres del índice salen en algún plan', () => {
    const names = new Set();
    const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (typeof x.name === 'string') names.add(x.name); Object.values(x).forEach(walk); } };
    for (const p of ['arete', 'freeletics', 'kettlebell']) walk(JSON.parse(readFileSync(`programs/${p}.json`, 'utf8')));
    const missing = Object.values(ANIM3D_NAMES).filter(ns => !ns.some(n => names.has(n)));
    expect(missing).toEqual([]);
  });
});
