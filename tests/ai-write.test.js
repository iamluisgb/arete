// Fase 5.0 — primitiva de escritura: versionado de planes + tool propose_program.
import { describe, it, expect, beforeEach } from 'vitest';
import { applyProgramProposal, undoProgramCommit } from '../js/programs.js';
import { validateWorkout, normalizeWorkout, applyWorkout, undoWorkout, validateRun, normalizeRun, applyRun, undoRun } from '../js/data.js';
import { makeToolExecutor } from '../js/ai/tools.js';

beforeEach(() => { localStorage.clear(); });

const plan = (name, sessionName = 'A') => ({
  _meta: { name, desc: 'test' },
  '1': { name: 'Fase 1', sessions: { [sessionName]: [{ name: 'Sentadilla', sets: 3, reps: '5', type: 'main' }] } },
});
const freshDB = () => ({ workouts: [], bodyLogs: [], customPrograms: [], program: 'arete', phase: 1 });

describe('applyProgramProposal — crear', () => {
  it('crea un plan nuevo, lo activa y undo lo revierte', () => {
    const db = freshDB();
    const { token, id, action } = applyProgramProposal(db, { program: plan('Mi Plan'), basedOn: null });
    expect(action).toBe('create');
    expect(db.customPrograms).toHaveLength(1);
    expect(db.customPrograms[0]._customId).toBe(id);
    expect(db.program).toBe(id);           // se activa el plan nuevo
    undoProgramCommit(db, token);
    expect(db.customPrograms).toHaveLength(0);
    expect(db.program).toBe('arete');      // restaura el activo anterior
  });
});

describe('applyProgramProposal — versionar un custom', () => {
  it('empuja la versión anterior a _revisions y no duplica el plan', () => {
    const db = freshDB();
    const { id } = applyProgramProposal(db, { program: plan('Base v1'), basedOn: null });
    const { token, action } = applyProgramProposal(db, { program: plan('Base v2'), basedOn: id });
    expect(action).toBe('revise');
    expect(db.customPrograms).toHaveLength(1);                        // no crea otro
    const cp = db.customPrograms[0];
    expect(cp._customId).toBe(id);                                   // mismo id
    expect(cp._meta.name).toBe('Base v2');
    expect(cp._revisions).toHaveLength(1);
    expect(cp._revisions[0].snapshot._meta.name).toBe('Base v1');    // original recuperable
  });

  it('undo restaura la versión previa', () => {
    const db = freshDB();
    const { id } = applyProgramProposal(db, { program: plan('Base v1'), basedOn: null });
    const { token } = applyProgramProposal(db, { program: plan('Base v2'), basedOn: id });
    undoProgramCommit(db, token);
    expect(db.customPrograms).toHaveLength(1);
    expect(db.customPrograms[0]._meta.name).toBe('Base v1');
    expect(db.customPrograms[0]._revisions || []).toHaveLength(0);
  });

  it('acumula varias revisiones (la más reciente primero)', () => {
    const db = freshDB();
    const { id } = applyProgramProposal(db, { program: plan('v1'), basedOn: null });
    applyProgramProposal(db, { program: plan('v2'), basedOn: id });
    applyProgramProposal(db, { program: plan('v3'), basedOn: id });
    const cp = db.customPrograms[0];
    expect(cp._meta.name).toBe('v3');
    expect(cp._revisions.map(r => r.snapshot._meta.name)).toEqual(['v2', 'v1']);
  });
});

describe('propose_program (tool = señal de intención)', () => {
  it('registra la solicitud de plan con el objetivo', async () => {
    const proposals = [];
    const exec = makeToolExecutor(freshDB(), { onProposal: (p) => proposals.push(p) });
    const ok = await exec('propose_program', { goal: 'fuerza 3 días 4 semanas', basedOn: 'kettlebell' });
    expect(ok).toContain('Solicitud de plan registrada');
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ type: 'program_request', goal: 'fuerza 3 días 4 semanas', basedOn: 'kettlebell' });
  });

  it('error legible si falta el objetivo', async () => {
    const proposals = [];
    const exec = makeToolExecutor(freshDB(), { onProposal: (p) => proposals.push(p) });
    expect(await exec('propose_program', {})).toContain('ERROR');
    expect(proposals).toHaveLength(0);
  });
});

describe('log_workout (tool = señal de intención)', () => {
  it('registra la solicitud de entreno con la descripción', async () => {
    const proposals = [];
    const exec = makeToolExecutor(freshDB(), { onProposal: (p) => proposals.push(p) });
    const ok = await exec('log_workout', { description: 'sentadilla 5x5 a 100' });
    expect(ok).toContain('Entreno recibido');
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ type: 'workout_request', description: 'sentadilla 5x5 a 100' });
  });
  it('error si falta la descripción', async () => {
    const exec = makeToolExecutor(freshDB(), {});
    expect(await exec('log_workout', {})).toContain('ERROR');
  });
});

describe('ingesta de workouts', () => {
  const raw = {
    date: '2026-07-18', session: 'Torso',
    exercises: [
      { name: 'Press de Banca', sets: [{ kg: 70, reps: 5 }, { kg: 70, reps: 5 }] },
      { name: 'Dominadas', sets: [{ kg: '', reps: 10 }] },
    ],
  };

  it('valida entrenos correctos y rechaza los vacíos', () => {
    expect(validateWorkout(raw)).toBeNull();
    expect(validateWorkout({ exercises: [] })).toBeTruthy();
    expect(validateWorkout({ exercises: [{ name: 'X', sets: [] }] })).toContain('sin series');
    expect(validateWorkout({ exercises: [{ sets: [{ reps: 5 }] }] })).toContain('sin nombre');
  });

  it('normaliza kg/reps a strings y respeta el peso corporal', () => {
    const n = normalizeWorkout(raw);
    expect(n.exercises[0].sets[0]).toEqual({ kg: '70', reps: '5' });
    expect(n.exercises[1].sets[0]).toEqual({ kg: '', reps: '10' });
    expect(n.date).toBe('2026-07-18');
  });

  it('aplica el entreno con id/fase/programa; undo lo revierte', () => {
    const db = { ...freshDB(), phase: 2, program: 'kettlebell' };
    const { id } = applyWorkout(db, raw);
    expect(db.workouts).toHaveLength(1);
    const w = db.workouts[0];
    expect(w.id).toBe(id);
    expect(w.phase).toBe(2);
    expect(w.program).toBe('kettlebell');
    expect(w.exercises[0].name).toBe('Press de Banca');
    undoWorkout(db, { id });
    expect(db.workouts).toHaveLength(0);
    expect(db.deletedIds).toContain(id);   // no se resucita en un merge
  });
});

describe('ingesta de carreras', () => {
  const raw = { sport: 'running', date: '2026-07-18', session: 'Rodaje mañana', type: 'rodaje', distance: 8.2, duration: '45:30', pace: '5:33' };

  it('valida: exige distancia o duración', () => {
    expect(validateRun(raw)).toBeNull();
    expect(validateRun({ distance: 0, duration: 0 })).toBeTruthy();
    expect(validateRun({ duration: '30:00' })).toBeNull();   // solo duración basta
    expect(validateRun(null)).toBeTruthy();
  });

  it('normaliza tiempos "mm:ss" a segundos y respeta el tipo', () => {
    const n = normalizeRun(raw);
    expect(n.duration).toBe(45 * 60 + 30);   // 2730 s
    expect(n.pace).toBe(5 * 60 + 33);        // 333 s/km
    expect(n.distance).toBe(8.2);
    expect(n.type).toBe('rodaje');
    expect(n.source).toBe('ingest');
  });

  it('calcula el ritmo si falta (duración/distancia) y descarta tipos inválidos', () => {
    const n = normalizeRun({ distance: 10, duration: '50:00', type: 'inventado' });
    expect(n.pace).toBe(300);                 // 3000 s / 10 km
    expect(n.type).toBe('libre');             // tipo desconocido → libre
  });

  it('aplica la carrera a runningLogs (no a workouts); undo la revierte', () => {
    const db = { ...freshDB(), runningLogs: [], runningProgram: 'c25k' };
    const { id, kind } = applyRun(db, raw);
    expect(kind).toBe('run');
    expect(db.runningLogs).toHaveLength(1);
    expect(db.workouts).toHaveLength(0);      // NO cae en fuerza
    const r = db.runningLogs[0];
    expect(r.id).toBe(id);
    expect(r.program).toBe('c25k');
    expect(r.distance).toBe(8.2);
    undoRun(db, { id });
    expect(db.runningLogs).toHaveLength(0);
    expect(db.deletedIds).toContain(id);
  });
});
