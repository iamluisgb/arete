// Cierre de la sesión de fuerza: el resumen que alimenta la última fase del
// runner, y el mecanismo ÚNICO de marcar una serie como hecha.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/programs.js', async () => {
  const actual = await vi.importActual('../js/programs.js');
  const mockPrograms = {
    1: {
      name: 'Fuerza',
      sessions: {
        'Sesión A': [
          { name: 'Sentadilla', sets: 2, reps: '5', type: 'main' },
          { name: 'Press de Banca', sets: 1, reps: '5', type: 'main' },
        ],
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
    <div id="prefillBanner"><span id="prefillText"></span></div>
    <div id="sessionOverview"></div>
    <div class="ex-dots" id="exerciseDots"></div>
    <div id="exerciseList"></div>
    <div class="save-bar" id="saveBar"><textarea id="trainNotes"></textarea><button id="saveWorkoutBtn">Guardar</button></div>
    <input id="trainDate" type="date">
    <div id="prCelebration"><div id="prList"></div></div>
    <div id="toastContainer"></div>
  `;
}

const freshDB = () => ({
  workouts: [], bodyLogs: [], customPrograms: [], customSessions: [],
  deletedIds: [], program: 'arete', phase: 1,
});

/** Rellena una serie de la grid como lo haría el usuario. */
function fill(ex, set, kg, reps) {
  const k = document.querySelector(`#exerciseList [data-ex="${ex}"][data-set="${set}"][data-field="kg"]`);
  const r = document.querySelector(`#exerciseList [data-ex="${ex}"][data-set="${set}"][data-field="reps"]`);
  if (k) { k.value = String(kg); k.classList.remove('prefilled'); }
  if (r) { r.value = String(reps); r.classList.remove('prefilled'); }
}

const label = (ex, set) =>
  document.querySelector(`#exerciseList .set-label[data-ex="${ex}"][data-set="${set}"]`);

async function cargarSesion(db) {
  const t = await import('../js/ui/training.js');
  const { initToast } = await import('../js/ui/toast.js');
  initToast();
  t.initTraining(db, { onCancelEdit: () => {} });
  t.populateSessions(db);
  document.getElementById('trainSession').value = 'Sesión A';
  t.loadSessionTemplate(db, false);
  // Normalmente manda el overview y se entra al formulario como lo haría el
  // usuario; con un borrador vivo `loadSessionTemplate` ya salta directo a él.
  document.querySelector('#sessionOverview .so-start')?.click();
  return t;
}

beforeEach(() => {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
});

describe('buildSessionSummary', () => {
  it('cuenta series hechas sobre el total y suma el volumen de la grid', async () => {
    const db = freshDB();
    const t = await cargarSesion(db);

    fill(0, 0, 100, 5);
    fill(0, 1, 100, 5);
    fill(1, 0, 60, 5);
    label(0, 0).click();
    label(0, 1).click();

    const s = t.buildSessionSummary(db);
    expect(s.session).toBe('Sesión A');
    expect(s.setsTotal).toBe(3);
    expect(s.setsDone).toBe(2);
    expect(s.volume).toBe(100 * 5 + 100 * 5 + 60 * 5);  // 1300
  });

  it('detecta récord contra el mejor histórico del ejercicio', async () => {
    const db = freshDB();
    db.workouts.push({
      id: 1, date: '2026-07-01', session: 'Sesión A', phase: 1,
      exercises: [{ name: 'Sentadilla', sets: [{ kg: '95', reps: '5' }] }],
    });
    const t = await cargarSesion(db);

    fill(0, 0, 100, 5);
    const s = t.buildSessionSummary(db);

    expect(s.prs).toHaveLength(1);
    expect(s.prs[0]).toMatchObject({ exercise: 'Sentadilla', kg: 100, prevKg: 95 });
  });

  it('no inventa récord si no se supera la marca previa', async () => {
    const db = freshDB();
    db.workouts.push({
      id: 1, date: '2026-07-01', session: 'Sesión A', phase: 1,
      exercises: [{ name: 'Sentadilla', sets: [{ kg: '120', reps: '5' }] }],
    });
    const t = await cargarSesion(db);

    fill(0, 0, 100, 5);
    expect(t.buildSessionSummary(db).prs).toHaveLength(0);
  });

  it('compara el volumen contra la última vez que se hizo ESTA sesión', async () => {
    const db = freshDB();
    // La sesión B es más reciente pero no es comparable: no debe usarse.
    // Día 14 a propósito: con un día ≤12 la fecha se lee igual en DD/MM que en
    // MM/DD y el test no distingue una de otra. Este fixture llevaba un 07-01 y
    // afirmaba '07/01', que era el formato MM/DD equivocado.
    db.workouts.push({
      id: 1, date: '2026-07-14', session: 'Sesión A', phase: 1,
      exercises: [{ name: 'Sentadilla', sets: [{ kg: '100', reps: '5' }] }],  // 500
    });
    db.workouts.push({
      id: 2, date: '2026-07-20', session: 'Sesión B', phase: 1,
      exercises: [{ name: 'Press Militar', sets: [{ kg: '200', reps: '5' }] }],
    });
    const t = await cargarSesion(db);

    fill(0, 0, 106, 5);   // 530 → +6%
    const s = t.buildSessionSummary(db);

    expect(s.volumeDelta).toBe(6);
    expect(s.volumePrevDate).toBe('14/07');
  });

  it('sin sesión previa no compara nada en vez de comparar contra cero', async () => {
    const db = freshDB();
    const t = await cargarSesion(db);
    fill(0, 0, 100, 5);
    expect(t.buildSessionSummary(db).volumeDelta).toBeNull();
  });
});

describe('marcar una serie como hecha', () => {
  it('rellenar los campos NO marca la serie: marcar es siempre explícito', async () => {
    const db = freshDB();
    await cargarSesion(db);

    const kg = document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="kg"]');
    fill(0, 0, 100, 5);
    kg.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(label(0, 0).classList.contains('set-done')).toBe(false);
  });

  it('el tap en la etiqueta marca y desmarca', async () => {
    const db = freshDB();
    await cargarSesion(db);

    label(0, 0).click();
    expect(label(0, 0).classList.contains('set-done')).toBe(true);
    label(0, 0).click();
    expect(label(0, 0).classList.contains('set-done')).toBe(false);
  });

  it('desmarcar ofrece deshacer, y deshacer restaura la serie', async () => {
    const db = freshDB();
    await cargarSesion(db);

    label(0, 0).click();          // marcar
    label(0, 0).click();          // desmarcar
    const toastEl = document.querySelector('#toastContainer .toast');
    expect(toastEl.textContent).toContain('Serie 1 desmarcada');

    toastEl.querySelector('.toast-action').click();
    expect(label(0, 0).classList.contains('set-done')).toBe(true);
  });

  it('marcar no ofrece deshacer: no se pierde nada', async () => {
    const db = freshDB();
    await cargarSesion(db);

    label(0, 0).click();
    expect(document.querySelector('#toastContainer .toast')).toBeNull();
  });
});
