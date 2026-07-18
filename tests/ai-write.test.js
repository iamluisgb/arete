// Fase 5.0 — primitiva de escritura: versionado de planes + tool propose_program.
import { describe, it, expect, beforeEach } from 'vitest';
import { applyProgramProposal, undoProgramCommit } from '../js/programs.js';
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
