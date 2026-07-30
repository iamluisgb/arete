// Fase 5.5 — la sesión suelta dentro del formulario de entrenamiento: aparece en
// el desplegable como grupo aparte, se inicia sin mover la fase del atleta y el
// entreno que genera sobrevive a que la sesión se borre.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/programs.js', async () => {
  const actual = await vi.importActual('../js/programs.js');
  const mockPrograms = {
    1: {
      name: 'Fuerza',
      sessions: {
        'Sesión A': [{ name: 'Sentadilla', sets: 2, reps: '5', type: 'main' }],
        'Sesión B': [{ name: 'Press Militar', sets: 2, reps: '5', type: 'main' }],
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
    <div class="save-bar" id="saveBar"><textarea id="trainNotes"></textarea><button id="saveWorkoutBtn">Guardar sesión</button></div>
    <input id="trainDate" type="date">
    <div id="prCelebration"><div id="prList"></div></div>
    <div id="toastContainer"></div>
  `;
}

const freshDB = () => ({ workouts: [], bodyLogs: [], customPrograms: [], customSessions: [], deletedIds: [], program: 'arete', phase: 1 });
const sessionData = (name = 'Empuje corto') => ({
  name,
  exercises: [{ name: 'Press de Banca', sets: 2, reps: '6', type: 'main' }],
});

async function load() {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  (await import('../js/ui/toast.js')).initToast();
  const training = await import('../js/ui/training.js');
  const sessions = await import('../js/sessions.js');
  return { training, sessions };
}

function fillSet(ex, set, kg, reps) {
  document.querySelector(`[data-ex="${ex}"][data-set="${set}"][data-field="kg"]`).value = kg;
  document.querySelector(`[data-ex="${ex}"][data-set="${set}"][data-field="reps"]`).value = reps;
}

describe('desplegable de sesiones', () => {
  it('separa las sueltas del plan en su propio optgroup', async () => {
    const { training, sessions } = await load();
    const db = freshDB();
    const { id } = sessions.applySessionProposal(db, sessionData());
    training.populateSessions(db);

    const select = document.getElementById('trainSession');
    // Las del plan siguen sueltas en la raíz; la suelta va dentro del grupo.
    expect([...select.children].filter(c => c.tagName === 'OPTION').map(o => o.value)).toEqual(['Sesión A', 'Sesión B']);
    const group = select.querySelector('optgroup');
    expect(group.label).toBe('Tus sesiones');
    expect(group.children[0].value).toBe(sessions.sessionRef(id));
    expect(group.children[0].textContent).toBe('Empuje corto');
  });

  it('el filtro de historial usa el NOMBRE (los entrenos se guardan por nombre)', async () => {
    const { training, sessions } = await load();
    const db = freshDB();
    sessions.applySessionProposal(db, sessionData());
    training.populateSessions(db);
    const group = document.getElementById('historyFilter').querySelector('optgroup');
    expect(group.children[0].value).toBe('Empuje corto');
  });
});

describe('iniciar una sesión suelta', () => {
  it('no cambia la fase activa del atleta', async () => {
    const { training, sessions } = await load();
    const db = freshDB();
    const { id } = sessions.applySessionProposal(db, sessionData());
    training.selectAndStartSession(sessions.sessionRef(id), null, db);

    expect(db.phase).toBe(1);
    expect(document.getElementById('trainSession').value).toBe(sessions.sessionRef(id));
    expect(document.getElementById('exerciseList').innerHTML).toContain('Press de Banca');
  });
});

describe('entreno guardado desde una suelta', () => {
  it('se lleva el id y una copia de la especificación', async () => {
    const { training, sessions } = await load();
    const db = freshDB();
    const { id } = sessions.applySessionProposal(db, sessionData());
    training.selectAndStartSession(sessions.sessionRef(id), null, db);
    document.getElementById('trainDate').value = '2026-07-30';
    fillSet(0, 0, '70', '6');
    training.saveWorkout(db);

    expect(db.workouts).toHaveLength(1);
    const w = db.workouts[0];
    expect(w.session).toBe('Empuje corto');
    expect(w.sessionId).toBe(id);
    expect(w.spec[0].name).toBe('Press de Banca');
    expect(sessions.getCustomSession(db, id).lastUsedAt).toBeTruthy();   // ordena la lista
  });

  it('un entreno del plan no arrastra spec ni sessionId', async () => {
    const { training } = await load();
    const db = freshDB();
    training.populateSessions(db, { select: 'Sesión A', expand: true });
    document.getElementById('trainDate').value = '2026-07-30';
    fillSet(0, 0, '100', '5');
    training.saveWorkout(db);

    expect(db.workouts[0].sessionId).toBeUndefined();
    expect(db.workouts[0].spec).toBeUndefined();
  });

  it('el prefill de una suelta se casa por id, no por (nombre, fase, plan)', async () => {
    const { training, sessions } = await load();
    const db = freshDB();
    const { id } = sessions.applySessionProposal(db, sessionData());
    training.selectAndStartSession(sessions.sessionRef(id), null, db);
    document.getElementById('trainDate').value = '2026-07-30';
    fillSet(0, 0, '70', '6');
    training.saveWorkout(db);

    // Otro plan y otra fase: el histórico de la suelta lo sigue siendo.
    db.program = 'otro'; db.phase = 3;
    training.selectAndStartSession(sessions.sessionRef(id), null, db);
    expect(document.getElementById('prefillText').textContent).toContain('Empuje corto');
  });

  it('editarlo sigue funcionando después de borrar la sesión', async () => {
    const { training, sessions } = await load();
    const db = freshDB();
    const { id } = sessions.applySessionProposal(db, sessionData());
    training.selectAndStartSession(sessions.sessionRef(id), null, db);
    document.getElementById('trainDate').value = '2026-07-30';
    fillSet(0, 0, '70', '6');
    training.saveWorkout(db);

    sessions.deleteCustomSession(db, id);
    training.populateSessions(db);
    training.startEdit(db.workouts[0], db);

    // La plantilla se reconstruye desde w.spec, con los datos ya volcados.
    expect(document.getElementById('exerciseList').innerHTML).toContain('Press de Banca');
    expect(document.querySelector('[data-ex="0"][data-set="0"][data-field="kg"]').value).toBe('70');

    // Y guardar los cambios actualiza el entreno en vez de no hacer nada.
    fillSet(0, 0, '72.5', '6');
    training.saveWorkout(db);
    expect(db.workouts).toHaveLength(1);
    expect(db.workouts[0].exercises[0].sets[0].kg).toBe('72.5');
  });
});

describe('guardia del borrador', () => {
  it('avisa antes de saltar a otra sesión con un entreno a medias', async () => {
    const { training, sessions } = await load();
    const db = freshDB();
    const { id } = sessions.applySessionProposal(db, sessionData());

    // Entreno a medias en la Sesión A (borrador con datos).
    localStorage.setItem('arete_sessionDraft', JSON.stringify({
      session: 'Sesión A', date: '2026-07-30', notes: '', values: ['100', '5'], checks: [], ts: Date.now(),
    }));
    training.populateSessions(db);

    const started = vi.fn();
    training.requestStartSession(db, sessions.sessionRef(id), null, { onStarted: started });

    const modal = document.querySelector('.modal-overlay');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Sesión A');
    expect(started).not.toHaveBeenCalled();   // no salta sin decidir

    modal.querySelector('[data-act="switch"]').click();
    expect(document.querySelector('.modal-overlay')).toBeNull();
    expect(started).toHaveBeenCalled();
    expect(document.getElementById('trainSession').value).toBe(sessions.sessionRef(id));
  });

  it('no molesta si el borrador es de la misma sesión', async () => {
    const { training, sessions } = await load();
    const db = freshDB();
    const { id } = sessions.applySessionProposal(db, sessionData());
    const ref = sessions.sessionRef(id);
    localStorage.setItem('arete_sessionDraft', JSON.stringify({
      session: ref, date: '2026-07-30', notes: '', values: ['70', '6'], checks: [], ts: Date.now(),
    }));
    training.populateSessions(db);

    training.requestStartSession(db, ref, null, {});
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});
