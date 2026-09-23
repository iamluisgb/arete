import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActiveProgram } from '../js/programs.js';

// Mock programs module: inject program data directly
vi.mock('../js/programs.js', async () => {
  const actual = await vi.importActual('../js/programs.js');
  let activeProgram = 'arete';
  const mockPrograms = {
    1: {
      name: 'Fuerza',
      sessions: {
        'Sesión A': [{ name: 'Sentadilla', sets: 3, reps: '5', type: 'main' }],
        'Sesión B': [{ name: 'Press Militar', sets: 3, reps: '5', type: 'main' }],
      },
    },
  };
  return {
    ...actual,
    getPrograms: () => mockPrograms,
    getActiveProgram: () => activeProgram,
    setActiveProgram: (id) => { activeProgram = id; },
    getAllPhases: () => [{ id: 1, name: 'Fuerza', desc: '' }],
  };
});

// Minimal DOM required by training.js
function setupDOM() {
  document.body.innerHTML = `
    <select id="trainSession"></select>
    <select id="historyFilter"></select>
    <div id="exerciseList"></div>
    <input id="trainDate" type="date">
    <textarea id="trainNotes"></textarea>
    <div id="prefillBanner" style="display:none"><span id="prefillText"></span></div>
    <div id="secTrain"><button class="btn">Guardar sesión</button></div>
    <div id="prCelebration"><ul id="prList"></ul></div>
  `;
}

describe('populateSessions', () => {
  beforeEach(() => {
    setupDOM();
    // Reset cached selectors by re-importing fresh module
    vi.resetModules();
  });

  it('works without calling initTraining first (regression)', async () => {
    // Re-import after resetModules to get fresh cached selectors (all undefined)
    const { populateSessions } = await import('../js/ui/training.js');
    const db = { phase: 1, workouts: [], program: 'arete' };

    expect(() => populateSessions(db)).not.toThrow();

    const select = document.getElementById('trainSession');
    expect(select.options.length).toBe(2);
    expect(select.options[0].value).toBe('Sesión A');
  });

  it('populates historyFilter with all sessions plus "Todas"', async () => {
    const { populateSessions } = await import('../js/ui/training.js');
    const db = { phase: 1, workouts: [], program: 'arete' };
    populateSessions(db);

    const filter = document.getElementById('historyFilter');
    expect(filter.options.length).toBe(3); // "Todas" + 2 sessions
    expect(filter.options[0].value).toBe('');
  });

  it('auto-selects next session based on last workout', async () => {
    const { populateSessions } = await import('../js/ui/training.js');
    const db = {
      phase: 1,
      program: 'arete',
      workouts: [{ phase: 1, program: 'arete', session: 'Sesión A', date: '2025-01-01', exercises: [] }],
    };
    populateSessions(db);

    const select = document.getElementById('trainSession');
    expect(select.value).toBe('Sesión B');
  });
});

// La progresión, vista desde la tarjeta. El motor tiene sus propios tests
// (progression.test.js); lo que se comprueba aquí es que el peso que aparece en
// el campo es el que decidió la progresión y no una copia de la última vez, y
// que nunca aparece sin su explicación.
describe('progresión en el prefill', () => {
  beforeEach(() => { setupDOM(); vi.resetModules(); });

  const conHistorial = (sets) => ({
    phase: 1, program: 'arete', workouts: [{
      id: 1, date: '2026-07-01', session: 'Sesión A', phase: 1, program: 'arete',
      exercises: [{ name: 'Sentadilla', sets }],
    }],
  });
  const campoKg = () => document.querySelector('[data-ex="0"][data-set="0"][data-field="kg"]');

  it('una sesión cumplida propone el peso subido, no el repetido', async () => {
    const { loadSessionTemplate, populateSessions } = await import('../js/ui/training.js');
    const db = conHistorial([{ kg: '100', reps: '5' }, { kg: '100', reps: '5' }, { kg: '100', reps: '5' }]);
    populateSessions(db);
    document.getElementById('trainSession').value = 'Sesión A';
    loadSessionTemplate(db, true);
    expect(campoKg().value).toBe('105');
    expect(document.getElementById('exerciseList').textContent).toContain('5 kg más');
  });

  it('una sesión fallada repite el peso, y lo dice', async () => {
    const { loadSessionTemplate, populateSessions } = await import('../js/ui/training.js');
    const db = conHistorial([{ kg: '100', reps: '5' }, { kg: '100', reps: '5' }, { kg: '100', reps: '2' }]);
    populateSessions(db);
    document.getElementById('trainSession').value = 'Sesión A';
    loadSessionTemplate(db, true);
    expect(campoKg().value).toBe('100');
    expect(document.getElementById('exerciseList').textContent).toContain('Faltaron reps');
  });

  it('en hold respeta la rampa de la última vez en vez de aplastarla', async () => {
    const { loadSessionTemplate, populateSessions } = await import('../js/ui/training.js');
    const db = conHistorial([{ kg: '60', reps: '5' }, { kg: '80', reps: '5' }, { kg: '100', reps: '2' }]);
    populateSessions(db);
    document.getElementById('trainSession').value = 'Sesión A';
    loadSessionTemplate(db, true);
    const kg = [0, 1, 2].map(n => document.querySelector(`[data-ex="0"][data-set="${n}"][data-field="kg"]`).value);
    expect(kg).toEqual(['60', '80', '100']);
  });

  it('una subida sí pone el mismo peso en todas las series', async () => {
    const { loadSessionTemplate, populateSessions } = await import('../js/ui/training.js');
    const db = conHistorial([{ kg: '60', reps: '5' }, { kg: '80', reps: '5' }, { kg: '100', reps: '5' }]);
    populateSessions(db);
    document.getElementById('trainSession').value = 'Sesión A';
    loadSessionTemplate(db, true);
    const kg = [0, 1, 2].map(n => document.querySelector(`[data-ex="0"][data-set="${n}"][data-field="kg"]`).value);
    expect(kg).toEqual(['105', '105', '105']);
  });

  it('sin historial no inventa un peso', async () => {
    const { loadSessionTemplate, populateSessions } = await import('../js/ui/training.js');
    const db = { phase: 1, program: 'arete', workouts: [] };
    populateSessions(db);
    document.getElementById('trainSession').value = 'Sesión A';
    loadSessionTemplate(db, true);
    expect(campoKg().value).toBe('');
  });
});

// UX-6: validación de serie al teclear. Vacío vale (serie opcional), número >= 0
// vale; el resto pinta .set-invalid. Un aguante cronometrado ('2min') convive con
// los kilos en el campo de reps y parseFloat lo da por válido.
describe('validateSetInput (UX-6)', () => {
  beforeEach(() => {
    setupDOM();
    vi.resetModules();
  });

  const mkInput = (v) => {
    const inp = document.createElement('input');
    inp.value = v;
    return inp;
  };

  it('acepta vacío, número, coma decimal y aguante cronometrado', async () => {
    const { validateSetInput } = await import('../js/ui/training.js');
    for (const v of ['', '42.5', '42,5', '0', '2min']) {
      const inp = mkInput(v);
      expect(validateSetInput(inp), `valor ${JSON.stringify(v)}`).toBe(true);
      expect(inp.classList.contains('set-invalid')).toBe(false);
    }
  });

  it('marca inválido lo no numérico y lo negativo, y limpia al corregir', async () => {
    const { validateSetInput } = await import('../js/ui/training.js');
    const inp = mkInput('abc');
    expect(validateSetInput(inp)).toBe(false);
    expect(inp.classList.contains('set-invalid')).toBe(true);
    expect(inp.getAttribute('title')).toBe('Valor no válido');

    inp.value = '-5';
    expect(validateSetInput(inp)).toBe(false);
    expect(inp.classList.contains('set-invalid')).toBe(true);

    inp.value = '8';
    expect(validateSetInput(inp)).toBe(true);
    expect(inp.classList.contains('set-invalid')).toBe(false);
    expect(inp.hasAttribute('title')).toBe(false);
  });
});
