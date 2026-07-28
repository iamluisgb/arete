import { describe, it, expect, beforeEach, vi } from 'vitest';

// El runner es una capa de presentación sobre la .sets-grid. Estos tests
// verifican el invariante que hace que saveWorkout/saveDraft sigan funcionando
// sin tocarlos: la grid manda y el runner solo la refleja.

import {
  prepareRunner, openRunner, close, isRunnerOpen, hasSets, buildSetList,
} from '../js/ui/set-runner.js';

const EJERCICIOS = [
  { name: 'Sentadilla', sets: 2, reps: '5', type: 'main' },
  { name: 'Remo con barra', sets: 1, reps: '8', type: 'assist' },
];

/** Reproduce el DOM que emite renderSetsCard. */
function montarGrid(exercises) {
  const list = document.createElement('div');
  list.id = 'exerciseList';
  list.innerHTML = exercises.map((ex, i) => {
    let g = '';
    for (let s = 0; s < ex.sets; s++) {
      g += `<button class="set-label" data-ex="${i}" data-set="${s}">S${s + 1}</button>`
        + `<input class="prefilled" data-ex="${i}" data-set="${s}" data-field="kg" placeholder="100">`
        + `<input class="prefilled" data-ex="${i}" data-set="${s}" data-field="reps" placeholder="5">`;
    }
    return `<div class="ex-card"><div class="sets-grid">${g}</div></div>`;
  }).join('');
  document.body.appendChild(list);
  // el marcado real de training.js: click alterna .set-done
  list.addEventListener('click', e => {
    const l = e.target.closest('.set-label');
    if (l) l.classList.toggle('set-done');
  });
  return list;
}

const $ = sel => document.querySelector(sel);
const input = (ex, set, field) =>
  $(`#exerciseList input[data-ex="${ex}"][data-set="${set}"][data-field="${field}"]`);

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  vi.useRealTimers();
});

describe('ciclo de vida', () => {
  it('no abre si la sesión no tiene series', () => {
    montarGrid([]);
    prepareRunner([], () => {});
    expect(hasSets()).toBe(false);
    openRunner();
    expect(isRunnerOpen()).toBe(false);
  });

  it('abre, marca body.session-focus y cierra limpio', () => {
    montarGrid(EJERCICIOS);
    prepareRunner(EJERCICIOS, () => {});
    openRunner();
    expect(isRunnerOpen()).toBe(true);
    expect(document.body.classList.contains('session-focus')).toBe(true);
    close();
    expect(isRunnerOpen()).toBe(false);
    expect(document.body.classList.contains('session-focus')).toBe(false);
  });

  it('arranca en la primera serie PENDIENTE, no en la primera', () => {
    montarGrid(EJERCICIOS);
    // simula borrador restaurado con la serie 1 ya hecha
    $('.set-label[data-ex="0"][data-set="0"]').classList.add('set-done');
    prepareRunner(EJERCICIOS, () => {});
    openRunner();
    expect($('.sr-pos').textContent).toBe('Serie 2 de 2');
  });
});

describe('invariante: la grid es la fuente de verdad', () => {
  it('los campos del runner NO llevan data-ex/data-set/data-field', () => {
    // si los llevaran, saveWorkout() —que usa document.querySelector— leería
    // el input del runner en vez del de la tarjeta
    montarGrid(EJERCICIOS);
    prepareRunner(EJERCICIOS, () => {});
    openRunner();
    const runner = $('#setRunner');
    expect(runner.querySelectorAll('[data-ex],[data-set],[data-field]')).toHaveLength(0);
  });

  it('el runner vive FUERA de #exerciseList', () => {
    // si viviera dentro, saveDraft() lo contaría y desplazaría los índices
    montarGrid(EJERCICIOS);
    prepareRunner(EJERCICIOS, () => {});
    openRunner();
    expect($('#exerciseList').contains($('#setRunner'))).toBe(false);
    expect($('#exerciseList').querySelectorAll('input')).toHaveLength(6);
  });

  it('"Serie hecha" escribe en el input real y marca la etiqueta', () => {
    montarGrid(EJERCICIOS);
    const dirty = vi.fn();
    prepareRunner(EJERCICIOS, dirty);
    openRunner();

    $('.sr-kg').value = '102.5';
    $('.sr-reps').value = '5';
    $('.sr-cta').click();

    expect(input(0, 0, 'kg').value).toBe('102.5');
    expect(input(0, 0, 'reps').value).toBe('5');
    expect(input(0, 0, 'kg').classList.contains('prefilled')).toBe(false);
    expect($('.set-label[data-ex="0"][data-set="0"]').classList.contains('set-done')).toBe(true);
    expect(dirty).toHaveBeenCalled();
  });

  it('corregir durante el descanso reescribe el mismo input', () => {
    montarGrid(EJERCICIOS);
    prepareRunner(EJERCICIOS, () => {});
    openRunner();
    $('.sr-kg').value = '100';
    $('.sr-reps').value = '5';
    $('.sr-cta').click();                       // → fase de descanso

    $('.sr-did-kg').value = '97.5';
    $('.sr-did-kg').dispatchEvent(new Event('change'));
    expect(input(0, 0, 'kg').value).toBe('97.5');
  });
});

describe('avance por las series', () => {
  it('tras marcar pasa a descanso y "Saltar" lleva a la siguiente', () => {
    montarGrid(EJERCICIOS);
    prepareRunner(EJERCICIOS, () => {});
    openRunner();
    expect($('#setRunner').classList.contains('is-work')).toBe(true);

    $('.sr-cta').click();
    expect($('#setRunner').classList.contains('is-rest')).toBe(true);

    $('.sr-cta').click();
    expect($('#setRunner').classList.contains('is-work')).toBe(true);
    expect($('.sr-pos').textContent).toBe('Serie 2 de 2');
  });

  it('cruza al siguiente ejercicio conservando su índice real', () => {
    montarGrid(EJERCICIOS);
    prepareRunner(EJERCICIOS, () => {});
    openRunner();
    for (let i = 0; i < 2; i++) { $('.sr-cta').click(); $('.sr-cta').click(); }
    expect($('.sr-ex').textContent).toContain('Remo con barra');

    $('.sr-kg').value = '60';
    $('.sr-reps').value = '8';
    $('.sr-cta').click();
    expect(input(1, 0, 'kg').value).toBe('60');   // data-ex="1", no "2"
  });

  it('al terminar la última serie cierra la hoja', () => {
    const uno = [{ name: 'Sentadilla', sets: 1, reps: '5', type: 'main' }];
    montarGrid(uno);
    prepareRunner(uno, () => {});
    openRunner();
    $('.sr-cta').click();
    expect(isRunnerOpen()).toBe(false);
  });
});

describe('sesiones mixtas', () => {
  it('el runner ignora los ejercicios que no son modo sets', () => {
    const mixta = [
      { name: 'Sentadilla', sets: 1, reps: '5', type: 'main' },
      { name: 'Circuito', type: 'hiit', rounds: 4 },
      { name: 'Remo', sets: 1, reps: '8', type: 'assist' },
    ];
    expect(buildSetList(mixta).map(s => s.exIdx)).toEqual([0, 2]);
  });
});
