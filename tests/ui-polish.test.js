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
