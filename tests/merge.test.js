import { describe, it, expect } from 'vitest';
import { mergeDB } from '../js/utils.js';

const makeDB = (overrides = {}) => ({
  program: 'arete',
  phase: 1,
  workouts: [],
  bodyLogs: [],
  deletedIds: [],
  ...overrides,
});

describe('mergeDB', () => {
  it('merges workouts from both local and remote', () => {
    const local = makeDB({ workouts: [{ id: 1, date: '2025-01-01', exercises: [] }] });
    const remote = makeDB({ workouts: [{ id: 2, date: '2025-01-02', exercises: [] }] });
    const result = mergeDB(local, remote);
    expect(result.workouts).toHaveLength(2);
  });

  it('deduplicates by id (remote wins)', () => {
    const local = makeDB({ workouts: [{ id: 1, session: 'A', exercises: [] }] });
    const remote = makeDB({ workouts: [{ id: 1, session: 'B', exercises: [] }] });
    const result = mergeDB(local, remote);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0].session).toBe('B');
  });

  it('respects deletedIds from both sides', () => {
    const local = makeDB({
      workouts: [{ id: 1, exercises: [] }],
      deletedIds: [2],
    });
    const remote = makeDB({
      workouts: [{ id: 2, exercises: [] }, { id: 3, exercises: [] }],
      deletedIds: [1],
    });
    const result = mergeDB(local, remote);
    expect(result.workouts.map(w => w.id)).toEqual([3]);
    expect(result.deletedIds).toContain(1);
    expect(result.deletedIds).toContain(2);
  });

  it('handles empty arrays gracefully', () => {
    const local = makeDB();
    const remote = makeDB();
    const result = mergeDB(local, remote);
    expect(result.workouts).toEqual([]);
    expect(result.bodyLogs).toEqual([]);
  });

  it('merges bodyLogs the same way as workouts', () => {
    const local = makeDB({ bodyLogs: [{ id: 10, peso: 70 }] });
    const remote = makeDB({ bodyLogs: [{ id: 11, peso: 72 }] });
    const result = mergeDB(local, remote);
    expect(result.bodyLogs).toHaveLength(2);
  });

  // Sin esto, medirte un test en el móvil y sincronizar desde el portátil lo
  // borraba: el perfil se quedaba sin la mitad de los dominios.
  it('merges domainTests from both sides', () => {
    const local = makeDB({ domainTests: [{ id: 20, metric: 'ake', value: 12, date: '2026-08-01' }] });
    const remote = makeDB({ domainTests: [{ id: 21, metric: 'run400', value: 62, date: '2026-08-02' }] });
    const result = mergeDB(local, remote);
    expect(result.domainTests.map(t => t.id).sort()).toEqual([20, 21]);
  });

  it('un test borrado en un dispositivo no vuelve al sincronizar', () => {
    const local = makeDB({ domainTests: [], deletedIds: [20] });
    const remote = makeDB({ domainTests: [{ id: 20, metric: 'ake', value: 12, date: '2026-08-01' }] });
    expect(mergeDB(local, remote).domainTests).toEqual([]);
  });

  it('handles missing deletedIds arrays', () => {
    const local = { workouts: [{ id: 1 }], bodyLogs: [] };
    const remote = { workouts: [{ id: 2 }], bodyLogs: [] };
    const result = mergeDB(local, remote);
    expect(result.workouts).toHaveLength(2);
  });
});
