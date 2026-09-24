// UX-4: el overlay de PR roba el foco — al abrirse manda el foco a su botón
// principal y al cerrarse (clic o Escape) lo devuelve a quien lo tenía.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/programs.js', async () => {
  const actual = await vi.importActual('../js/programs.js');
  const mockPrograms = {
    1: {
      name: 'Fuerza',
      sessions: {
        'Sesión A': [{ name: 'Sentadilla', sets: 2, reps: '5', type: 'main' }],
      },
    },
  };
  return {
    ...actual,
    getPrograms: () => mockPrograms,
    getActiveProgram: () => 'arete',
    getAllPhases: () => [{ id: 1, name: 'Fuerza', desc: '' }],
  };
});

function setupDOM() {
  document.body.innerHTML = `
    <span id="phaseName"></span>
    <select id="trainSession"></select>
    <select id="historyFilter"></select>
    <div id="prefillBanner" style="display:none"><span id="prefillText"></span></div>
    <div id="sessionOverview"></div>
    <div class="ex-dots" id="exerciseDots"></div>
    <div id="exerciseList"></div>
    <div class="save-bar" id="saveBar"><textarea id="trainNotes"></textarea><button id="saveWorkoutBtn">Guardar</button></div>
    <input id="trainDate" type="date">
    <div id="prCelebration"><div id="prList"></div><button class="pr-confirm-btn">¡Vamos! 💪</button></div>
    <div id="toastContainer"></div>
  `;
}

const freshDB = () => ({
  workouts: [], bodyLogs: [], customPrograms: [], customSessions: [],
  deletedIds: [], program: 'arete', phase: 1,
});

function fill(ex, set, kg, reps) {
  const k = document.querySelector(`#exerciseList [data-ex="${ex}"][data-set="${set}"][data-field="kg"]`);
  const r = document.querySelector(`#exerciseList [data-ex="${ex}"][data-set="${set}"][data-field="reps"]`);
  if (k) { k.value = String(kg); k.classList.remove('prefilled'); }
  if (r) { r.value = String(reps); r.classList.remove('prefilled'); }
}

async function cargarSesion(db) {
  const t = await import('../js/ui/training.js');
  const { initToast } = await import('../js/ui/toast.js');
  initToast();
  t.initTraining(db, { onCancelEdit: () => {} });
  t.populateSessions(db);
  document.getElementById('trainSession').value = 'Sesión A';
  t.loadSessionTemplate(db, false);
  document.querySelector('#sessionOverview .so-start')?.click();
  return t;
}

/** Guarda una sesión con PR (100kg vs 95kg previos) y devuelve el overlay. */
async function guardarConPR(db) {
  db.workouts.push({
    id: 1, date: '2026-07-01', session: 'Sesión A', phase: 1,
    exercises: [{ name: 'Sentadilla', sets: [{ kg: '95', reps: '5' }] }],
  });
  const t = await cargarSesion(db);
  fill(0, 0, 100, 5);
  const $saveBtn = document.getElementById('saveWorkoutBtn');
  $saveBtn.focus();
  t.saveWorkout(db);
  return { overlay: document.getElementById('prCelebration'), $saveBtn };
}

beforeEach(() => {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
});

describe('celebración de PR: foco y cierre', () => {
  it('al abrirse manda el foco a su primer botón', async () => {
    const db = freshDB();
    const { overlay } = await guardarConPR(db);

    expect(overlay.style.display).toBe('flex');
    expect(document.activeElement).toBe(overlay.querySelector('button'));
  });

  it('Escape cierra el overlay y restaura el foco previo', async () => {
    const db = freshDB();
    const { overlay, $saveBtn } = await guardarConPR(db);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(overlay.style.display).toBe('none');
    expect(document.activeElement).toBe($saveBtn);
  });

  it('el clic en el overlay también restaura el foco previo', async () => {
    const db = freshDB();
    const { overlay, $saveBtn } = await guardarConPR(db);

    overlay.click();

    expect(overlay.style.display).toBe('none');
    expect(document.activeElement).toBe($saveBtn);
  });
});

// UX-6: feedback inmediato en las series — solo pinta, no bloquea el guardado.
describe('feedback inline de series (UX-6)', () => {
  const repsInput = () =>
    document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="reps"]');

  it("'abc' marca .set-invalid, luego '42.5' lo limpia, y vacío también", async () => {
    const db = freshDB();
    await cargarSesion(db);
    const inp = repsInput();

    inp.value = 'abc';
    inp.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(true);
    expect(inp.getAttribute('title')).toBe('Valor no válido');

    inp.value = '42.5';
    inp.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(false);
    expect(inp.hasAttribute('title')).toBe(false);

    // Re-marcado y corregido tecleando (input), sin blur.
    inp.value = 'zz';
    inp.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(true);
    inp.value = '9';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(false);

    inp.value = '';
    inp.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(false);
  });

  it("change (teclado sin blur) también valida", async () => {
    const db = freshDB();
    await cargarSesion(db);
    const inp = repsInput();

    inp.value = 'x';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(true);

    inp.value = '5';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(false);
  });

  it('marca negativo y deja el valor intacto (no bloquea ni reescribe)', async () => {
    const db = freshDB();
    await cargarSesion(db);
    const kg = document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="kg"]');

    kg.value = '-5';
    kg.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(kg.classList.contains('set-invalid')).toBe(true);
    expect(kg.value).toBe('-5');
  });
});

// UX-7: el borrador es posicional; si no encaja con el plan se descarta avisando.
describe('borrador descartado por mismatch (UX-7)', () => {
  const DRAFT_KEY = 'arete_sessionDraft';

  it('cuenta de series distinta: toast y no restaura', async () => {
    const db = freshDB();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      session: 'Sesión A', date: '2026-07-01', notes: '',
      values: ['5'], checks: [], ts: Date.now(),
    }));
    const t = await cargarSesion(db); // hay draft: se muestra el formulario directamente

    // populateSessions con expand dispara restoreDraft tras renderizar.
    t.populateSessions(db, { expand: true });

    const toasts = [...document.querySelectorAll('#toastContainer .toast')];
    expect(toasts.some(x => x.textContent.includes('no encaja con el plan actual'))).toBe(true);
    // No restauró el valor posicional en una serie equivocada.
    const kg = document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="kg"]');
    expect(kg.value).toBe('');
  });

  it('borrador de otra sesión: toast al intentar restaurarlo', async () => {
    const db = freshDB();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      session: 'Sesión B', date: '', notes: '',
      values: ['5', '3', '50', '5'], checks: [], ts: Date.now(),
    }));
    const t = await cargarSesion(db); // sesión distinta: sin draft visible

    t.populateSessions(db, { expand: true });

    const toasts = [...document.querySelectorAll('#toastContainer .toast')];
    expect(toasts.some(x => x.textContent.includes('no encaja con el plan actual'))).toBe(true);
  });

  it('borrador que encaja: restaura y NO avisa de mismatch', async () => {
    // isolation: la suite puede dejar toasts de casos anteriores
    document.getElementById('toastContainer')?.replaceChildren();
    const db = freshDB();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      session: 'Sesión A', date: '2026-07-01', notes: 'nota',
      values: ['50', '5', '60', '5'], checks: [], ts: Date.now(),
    }));
    const t = await cargarSesion(db);
    t.populateSessions(db, { expand: true });

    const toasts = [...document.querySelectorAll('#toastContainer .toast')];
    expect(toasts.some(x => x.textContent.includes('no encaja con el plan actual'))).toBe(false);
    const kg = document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="kg"]');
    expect(kg.value).toBe('50');
  });
});
