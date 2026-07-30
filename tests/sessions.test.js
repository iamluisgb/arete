// Fase 5.5 — sesiones sueltas: una sesión que Quirón propone, el atleta guarda y
// puede iniciar sin que su plan ni su fase activa se muevan.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateSession, validateSessionExercises, normalizeSession, uniqueSessionName,
  applySessionProposal, undoSessionCommit, deleteCustomSession, touchCustomSession,
  listCustomSessions, getCustomSession, sessionRef, isSessionRef, refToId,
  catalogExerciseNames, unknownExercises,
} from '../js/sessions.js';
import { validateProgram } from '../js/programs.js';
import { makeToolExecutor } from '../js/ai/tools.js';

beforeEach(() => { localStorage.clear(); });

const freshDB = () => ({ workouts: [], bodyLogs: [], customPrograms: [], customSessions: [], program: 'arete', phase: 1 });
const session = (name = 'Empuje corto') => ({
  name,
  exercises: [
    { name: 'Press de Banca', sets: 4, reps: '6', type: 'main', kg: 70 },
    { name: 'Dominada Prono', sets: 3, reps: 'F', type: 'assist' },
  ],
});

describe('validateSession', () => {
  it('acepta una sesión bien formada', () => {
    expect(validateSession(session())).toBeNull();
  });

  it('rechaza sesión sin nombre, sin ejercicios o con ejercicio sin nombre', () => {
    expect(validateSession({ exercises: [{ name: 'X' }] })).toMatch(/nombre/);
    expect(validateSession({ name: 'A', exercises: [] })).toMatch(/ejercicios/);
    expect(validateSession({ name: 'A', exercises: [{ sets: 3 }] })).toMatch(/nombre/);
  });

  it('rechaza un modo inventado: nunca puede llegar al runner', () => {
    const s = { name: 'A', exercises: [{ name: 'Sentadilla', mode: 'turbo' }] };
    expect(validateSession(s)).toMatch(/turbo/);
  });

  it('acepta los modos reales y los de running', () => {
    for (const mode of ['sets', 'amrap', 'emom', 'superset', 'run-intervals']) {
      expect(validateSessionExercises([{ name: 'X', mode }])).toBeNull();
    }
  });

  it('es la misma validación que usa un plan', () => {
    const bad = { _meta: { name: 'P' }, 1: { sessions: { A: [{ name: 'X', mode: 'turbo' }] } } };
    expect(validateProgram(bad)).toMatch(/turbo/);
  });

  it('el tope de ejercicios solo aplica a las sueltas, no a un plan importado', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `Ej ${i}` }));
    expect(validateSession({ name: 'A', exercises: many })).toMatch(/máximo/);
    expect(validateProgram({ _meta: { name: 'P' }, 1: { sessions: { A: many } } })).toBeNull();
  });
});

describe('normalizeSession', () => {
  it('recorta el nombre y descarta claves vacías', () => {
    const s = normalizeSession({ name: '  Pierna  ', exercises: [{ name: ' Sentadilla ', sets: 3, reps: '', kg: null, foo: 'x' }] });
    expect(s.name).toBe('Pierna');
    expect(s.exercises[0]).toEqual({ name: 'Sentadilla', sets: 3 });   // sin reps/kg/foo
  });
});

describe('nombres únicos', () => {
  it('desambigua contra las sueltas existentes y contra el plan', () => {
    expect(uniqueSessionName('Pecho', ['Pecho'])).toBe('Pecho (2)');
    expect(uniqueSessionName('Pecho', ['Pecho', 'Pecho (2)'])).toBe('Pecho (3)');
    expect(uniqueSessionName('Pecho', [])).toBe('Pecho');
  });

  it('applySessionProposal no crea dos sueltas con el mismo nombre', () => {
    const db = freshDB();
    const a = applySessionProposal(db, session('Pecho'));
    const b = applySessionProposal(db, session('Pecho'));
    expect(a.name).toBe('Pecho');
    expect(b.name).toBe('Pecho (2)');
  });

  it('tampoco choca con una sesión del plan activo', () => {
    const db = freshDB();
    const { name } = applySessionProposal(db, session('Sesión A'), { taken: ['Sesión A', 'Sesión B'] });
    expect(name).toBe('Sesión A (2)');
  });
});

describe('applySessionProposal / undo', () => {
  it('guarda la sesión sin tocar plan ni fase activa', () => {
    const db = freshDB();
    const { id } = applySessionProposal(db, session());
    expect(db.customSessions).toHaveLength(1);
    expect(getCustomSession(db, id).origin).toBe('quiron');
    expect(db.program).toBe('arete');   // el plan del atleta no se mueve
    expect(db.phase).toBe(1);           // su fase tampoco
    expect(db.customPrograms).toHaveLength(0);
  });

  it('el undo borra SOLO esa sesión, no las creadas después', () => {
    const db = freshDB();
    const first = applySessionProposal(db, session('Primera'));
    applySessionProposal(db, session('Segunda'));
    undoSessionCommit(db, first.token);
    expect(db.customSessions.map(s => s.name)).toEqual(['Segunda']);
  });

  it('rechaza una sesión inválida en vez de guardarla a medias', () => {
    const db = freshDB();
    expect(() => applySessionProposal(db, { name: 'Rota', exercises: [] })).toThrow();
    expect(db.customSessions).toHaveLength(0);
  });

  it('borrar deja rastro en deletedIds para que la sync no la resucite', () => {
    const db = freshDB();
    const { id } = applySessionProposal(db, session());
    deleteCustomSession(db, id);
    expect(db.customSessions).toHaveLength(0);
    expect(db.deletedIds).toContain(id);
  });
});

describe('orden y uso', () => {
  it('lista las usadas recientemente primero', () => {
    const db = freshDB();
    const vieja = applySessionProposal(db, session('Vieja'));
    const nueva = applySessionProposal(db, session('Nueva'));
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now');
    spy.mockReturnValue(now + 1000);
    touchCustomSession(db, vieja.id);
    expect(listCustomSessions(db)[0].id).toBe(vieja.id);
    spy.mockReturnValue(now + 2000);
    touchCustomSession(db, nueva.id);
    expect(listCustomSessions(db)[0].id).toBe(nueva.id);
    spy.mockRestore();
  });
});

describe('referencias', () => {
  it('van y vuelven, y no colisionan con nombres de sesión del plan', () => {
    expect(refToId(sessionRef('cs_1'))).toBe('cs_1');
    expect(isSessionRef('Sesión A')).toBe(false);
    expect(isSessionRef(sessionRef('cs_1'))).toBe(true);
  });
});

describe('catálogo de ejercicios', () => {
  it('expone nombres reales para el prompt del generador', () => {
    const names = catalogExerciseNames();
    expect(names.length).toBeGreaterThan(50);
    expect(names).toContain('Press Banca');
  });

  it('detecta los ejercicios sin ilustración (los que se verían pobres)', () => {
    const unknown = unknownExercises([{ name: 'Press de Banca' }, { name: 'Flexión hipopótamo' }]);
    expect(unknown).toEqual(['Flexión hipopótamo']);
  });
});

describe('tool propose_session', () => {
  it('registra una propuesta de sesión (señal ligera, no escribe en la db)', async () => {
    const db = freshDB();
    const proposals = [];
    const exec = makeToolExecutor(db, { onProposal: (p) => proposals.push(p) });
    const out = await exec('propose_session', { goal: 'sesión de empuje de 45 min' });
    expect(proposals).toEqual([{ type: 'session_request', goal: 'sesión de empuje de 45 min' }]);
    expect(out).toMatch(/sesión/i);
    expect(db.customSessions).toHaveLength(0);
  });

  it('sin goal devuelve error y no propone nada', async () => {
    const proposals = [];
    const exec = makeToolExecutor(freshDB(), { onProposal: (p) => proposals.push(p) });
    expect(await exec('propose_session', {})).toMatch(/^ERROR/);
    expect(proposals).toHaveLength(0);
  });
});
