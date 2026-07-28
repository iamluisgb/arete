import { describe, it, expect } from 'vitest';
import { mediaKey, lookupMedia, pictHtml, tipFor } from '../js/ui/exercise-pict.js';
import { buildSetList, restForExercise } from '../js/ui/set-runner.js';

describe('mediaKey', () => {
  it('ignora tildes, paréntesis y mayúsculas', () => {
    expect(mediaKey('Swing (KB)')).toBe(mediaKey('swing'));
    expect(mediaKey('Flexión')).toBe(mediaKey('flexion'));
  });

  it('unifica el plural español tras vocal y tras consonante', () => {
    expect(mediaKey('Sentadillas')).toBe(mediaKey('Sentadilla'));
    expect(mediaKey('Flexiones')).toBe(mediaKey('Flexión'));
    expect(mediaKey('Escaladores')).toBe(mediaKey('Escalador'));
    // el que rompía: "burpees" se recortaba a "burpe"
    expect(mediaKey('Burpees')).toBe(mediaKey('Burpee'));
  });

  it('unifica el plural inglés tras sibilante', () => {
    expect(mediaKey('Snatches (KB)')).toBe(mediaKey('Snatch'));
  });

  it('es insensible al orden de las palabras', () => {
    expect(mediaKey('Press de Banca')).toBe(mediaKey('Banca Press'));
  });
});

describe('lookupMedia', () => {
  it('resuelve las variantes reales de los planes', () => {
    for (const n of ['Swing (KB)', 'Swings (KB)', 'Sentadillas', 'Deadlift',
      'Press de Banca', 'Levantamiento Turco', 'Burpees']) {
      expect(lookupMedia(n), n).toBeTruthy();
    }
  });

  it('devuelve null si no hay match fiable', () => {
    expect(lookupMedia('Press Jabalina')).toBeNull();
    expect(lookupMedia('Ejercicio inventado que no existe')).toBeNull();
    expect(lookupMedia('')).toBeNull();
  });

  it('todos los fotogramas apuntan a assets/exercises', () => {
    const m = lookupMedia('Sentadilla');
    expect(m.frames.length).toBeGreaterThan(0);
    m.frames.forEach(f => expect(f).toMatch(/^assets\/exercises\/.+\.webp$/));
  });
});

describe('pictHtml', () => {
  it('devuelve cadena vacía sin match, para concatenar sin condicionales', () => {
    expect(pictHtml('Press Jabalina')).toBe('');
  });

  it('marca el número de fotogramas y se oculta a lectores de pantalla', () => {
    const html = pictHtml('Sentadilla');
    expect(html).toMatch(/class="ex-pict f\d/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('loading="lazy"');
  });

  it('el burpee sin salto no incluye el fotograma de salto', () => {
    const conSalto = lookupMedia('Burpees').frames;
    const sinSalto = lookupMedia('Burpee sin salto').frames;
    expect(conSalto.some(f => f.includes('jump'))).toBe(true);
    expect(sinSalto.some(f => f.includes('jump'))).toBe(false);
  });
});

describe('tipFor', () => {
  it('da consejo en español cuando lo hay, y cadena vacía si no', () => {
    expect(typeof tipFor('Sentadilla')).toBe('string');
    expect(tipFor('Press Jabalina')).toBe('');
  });
});

describe('buildSetList', () => {
  const plan = [
    { name: 'Sentadilla', sets: 3, reps: 5, type: 'main' },
    { name: 'HIIT', type: 'hiit', rounds: 4 },
    { name: 'Remo', sets: 2, reps: 8, type: 'assist' },
  ];

  it('aplana solo los ejercicios en modo sets', () => {
    const list = buildSetList(plan);
    expect(list).toHaveLength(5);             // 3 + 2, el HIIT no entra
    expect(list.map(s => s.name)).toEqual(
      ['Sentadilla', 'Sentadilla', 'Sentadilla', 'Remo', 'Remo']);
  });

  it('conserva el índice original del ejercicio en la sesión', () => {
    // crítico: saveWorkout busca por [data-ex="i"], y el HIIT ocupa el índice 1
    expect(buildSetList(plan).at(-1).exIdx).toBe(2);
  });

  it('aguanta entradas vacías', () => {
    expect(buildSetList([])).toEqual([]);
    expect(buildSetList(undefined)).toEqual([]);
  });
});

describe('restForExercise', () => {
  it('respeta el descanso explícito del plan por encima de todo', () => {
    expect(restForExercise({ name: 'Sentadilla', type: 'main', rest: 42 })).toBe(42);
  });

  it('da descanso corto a kettlebell y más largo a los básicos', () => {
    expect(restForExercise({ name: 'Swing (KB)', type: 'main' })).toBe(60);
    expect(restForExercise({ name: 'Sentadilla', type: 'main' })).toBe(120);
    expect(restForExercise({ name: 'Curl', type: 'assist' })).toBe(90);
  });

  it('cae en el valor de básico si no sabe qué es', () => {
    expect(restForExercise({})).toBe(120);
    expect(restForExercise(null)).toBe(120);
  });
});
