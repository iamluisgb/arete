import { describe, it, expect, vi } from 'vitest';
import { createSyncEngine, syncProjection } from '../js/sync/engine.js';

// ── Mock Drive transport ─────────────────────────────────────────────────────
// In-memory remote document; never touches the network.

function makeRemote(initial) {
  const state = { rev: initial ? 'r1' : null, data: initial ? structuredClone(initial) : null };
  const calls = { pull: 0, readMeta: 0, push: 0 };
  const transport = {
    async pull() {
      calls.pull++;
      return state.data ? { rev: state.rev, data: structuredClone(state.data) } : null;
    },
    async readMeta() {
      calls.readMeta++;
      return state.data ? { rev: state.rev } : null;
    },
    async push(wrapper) {
      calls.push++;
      state.rev = 'r' + (calls.push + 1) + '-' + Math.random().toString(36).slice(2, 6);
      state.data = structuredClone(wrapper);
      return { rev: state.rev };
    },
  };
  return {
    transport,
    calls,
    get: () => state.data,
    set: (data) => {
      state.data = structuredClone(data);
      state.rev = 'r-' + Math.random().toString(36).slice(2, 8);
    },
  };
}

function makeEngine(db, remote, overrides = {}) {
  const saved = [];
  const sleeps = [];
  const engine = createSyncEngine({
    transport: remote.transport,
    getDb: () => db,
    saveRaw: (d) => saved.push(structuredClone(d)),
    splitRoutes: async (logs) => logs,
    device: 'test-device',
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
    ...overrides,
  });
  return { engine, saved, sleeps };
}

// Workout with sync fields already set (uid + updatedAt).
const W = (id, updatedAt, extra = {}) => ({ id, uid: String(id), updatedAt, session: 'S' + id, exercises: [], ...extra });
const bareDb = (over = {}) => ({ workouts: [], bodyLogs: [], tombstones: [], stamps: {}, ...over });

// ── Core cycle ───────────────────────────────────────────────────────────────

describe('sync engine — core cycle', () => {
  it('(a) lost update: device B pulls, merges and pushes — both sides survive', async () => {
    // A pushed workout 1; B has its own local edit (workout 2, not yet pushed).
    const dbA = bareDb({ workouts: [W(1, 100)] });
    const dbB = bareDb({ workouts: [W(2, 200)] });
    const remote = makeRemote(dbA);
    const db = structuredClone(dbB);
    const { engine, saved } = makeEngine(db, remote);

    const r = await engine.runCycle();

    expect(r).toBe('ok');
    // Remote ends with BOTH devices' data.
    const remoteUids = remote.get().db.workouts.map((w) => w.uid).sort();
    expect(remoteUids).toEqual(['1', '2']);
    // B's local db kept its own edit AND absorbed A's push.
    const localUids = db.workouts.map((w) => w.uid).sort();
    expect(localUids).toEqual(['1', '2']);
    // The merge was persisted without re-stamping.
    expect(saved.length).toBe(1);
    expect(saved[0].workouts.find((w) => w.uid === '1').updatedAt).toBe(100);
  });

  it('(b) tombstone crosses devices: delete on A, B removes it and it never resurrects', async () => {
    const now = Date.now();
    const deleted = W(2, 100);
    const dbA = bareDb({
      workouts: [W(1, 100)],
      tombstones: [{ uid: '2', coll: 'workouts', deleted: true, deletedAt: now - 1000, updatedAt: now - 1000 }],
    });
    const dbB = bareDb({ workouts: [W(1, 100), deleted] });
    const remote = makeRemote(dbA);
    const db = structuredClone(dbB);
    const { engine } = makeEngine(db, remote);

    await engine.runCycle();
    expect(db.workouts.find((w) => w.uid === '2')).toBeUndefined();
    expect(db.tombstones.some((t) => t.uid === '2')).toBe(true);

    // Next cycle is a no-op (fingerprint equals remote): no upload, and the
    // deleted item does not come back.
    remote.calls.push = 0;
    const r2 = await engine.runCycle();
    expect(r2).toBe('ok');
    expect(remote.calls.push).toBe(0);
    expect(db.workouts.find((w) => w.uid === '2')).toBeUndefined();
  });

  it('(c) emulated 412: remote changes between pull and push → re-pull, converge, no data loss', async () => {
    const dbAOld = bareDb({ workouts: [W(1, 100)] });
    const dbANew = bareDb({ workouts: [W(1, 100), W(3, 300)] }); // A pushes mid-cycle
    const dbB = bareDb({ workouts: [W(2, 200)] });
    const remote = makeRemote(dbAOld);
    // A's write lands right after B's first pull.
    let firstPull = true;
    const origPull = remote.transport.pull;
    remote.transport.pull = async (...args) => {
      const r = await origPull(...args);
      if (firstPull) { firstPull = false; remote.set(dbANew); }
      return r;
    };
    const db = structuredClone(dbB);
    const { engine, sleeps } = makeEngine(db, remote);

    const r = await engine.runCycle();

    expect(r).toBe('ok');
    // B backed off before the retry (300ms * 1 + jitter, jitter injectable = 0).
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(300);
    expect(sleeps[0]).toBeLessThanOrEqual(450);
    // Everything converged: A's old push, A's mid-cycle push and B's edit.
    const remoteUids = remote.get().db.workouts.map((w) => w.uid).sort();
    expect(remoteUids).toEqual(['1', '2', '3']);
    const localUids = db.workouts.map((w) => w.uid).sort();
    expect(localUids).toEqual(['1', '2', '3']);
    expect(remote.calls.push).toBe(1);
  });

  it('(c2) conflict that never settles exhausts retries and records the failure', async () => {
    const remote = makeRemote(bareDb({ workouts: [W(1, 100)] }));
    // Every metadata read reports a different revision: the remote "keeps changing".
    let n = 0;
    remote.transport.readMeta = async () => ({ rev: 'moving-' + (++n) });
    const db = bareDb({ workouts: [W(2, 200)] });
    const { engine } = makeEngine(db, remote);

    const r = await engine.runCycle();

    expect(r).toBe('error');
    expect(remote.calls.push).toBe(0); // never overwrote the moving remote
    const diag = engine.getDiag();
    expect(diag.lastResult).toBe('error');
    expect(diag.consecutiveFailures).toBe(1);
    expect(diag.history).toHaveLength(1);
    expect(diag.history[0]).toMatchObject({ result: 'error' });
  });

  it('(d) no-op sync: merged state equal to remote → no upload', async () => {
    const doc = bareDb({ workouts: [W(1, 100)] });
    const remote = makeRemote(doc);
    const db = structuredClone(doc);
    const { engine } = makeEngine(db, remote);

    const r = await engine.runCycle();

    expect(r).toBe('ok');
    expect(remote.calls.pull).toBe(1);
    expect(remote.calls.push).toBe(0);
    expect(db.workouts).toHaveLength(1);
  });

  it('(e) Web Locks: when the lock is held elsewhere the cycle is skipped silently', async () => {
    const remote = makeRemote(bareDb({ workouts: [W(1, 100)] }));
    const db = bareDb({ workouts: [W(2, 200)] });
    let held = false;
    const lockCalls = [];
    const locks = {
      request(name, opts, cb) {
        lockCalls.push({ name, opts });
        return Promise.resolve(cb(held ? null : { name }));
      },
    };
    const { engine } = makeEngine(db, remote, { locks });

    held = true;
    expect(await engine.runCycle()).toBe('locked');
    expect(remote.calls.pull).toBe(0); // skipped, no traffic at all

    held = false;
    expect(await engine.runCycle()).toBe('ok');
    expect(lockCalls[0]).toEqual({ name: 'arete-sync', opts: { ifAvailable: true } });
    expect(remote.calls.pull).toBeGreaterThan(0);
  });

  it('runs unlocked when navigator.locks is missing (older browsers)', async () => {
    const remote = makeRemote(bareDb({ workouts: [W(1, 100)] }));
    const db = bareDb({ workouts: [W(2, 200)] });
    const { engine } = makeEngine(db, remote, { locks: undefined });
    expect(await engine.runCycle()).toBe('ok');
    expect(remote.calls.push).toBe(1);
  });

  it('a cycle already in flight makes the next one "busy" and runs it afterwards', async () => {
    const remote = makeRemote(bareDb({ workouts: [W(1, 100)] }));
    const db = bareDb({ workouts: [W(2, 200)] });
    let release;
    remote.transport.pull = () => new Promise((res) => { release = () => res({ rev: 'r1', data: structuredClone(remote.get()) }); });
    const { engine } = makeEngine(db, remote);

    const first = engine.runCycle();
    expect(await engine.runCycle()).toBe('busy');
    release();
    expect(await first).toBe('ok');
    // The pending cycle runs after the busy call, absorbing workout 1 too.
    await new Promise((r) => setTimeout(r, 0));
    expect(remote.calls.push).toBeGreaterThanOrEqual(1);
    expect(db.workouts.map((w) => w.uid).sort()).toEqual(['1', '2']);
  });
});

// ── File format & diagnosis ──────────────────────────────────────────────────

describe('sync engine — file format', () => {
  it('pushes the v2 wrapper ({format, formatVersion, savedAt, device, db})', async () => {
    const db = bareDb({ workouts: [W(1, 100)] });
    const remote = makeRemote(null);
    const { engine } = makeEngine(db, remote);

    await engine.runCycle();

    const wrapper = remote.get();
    expect(wrapper.format).toBe('arete-sync');
    expect(wrapper.formatVersion).toBe(2);
    expect(typeof wrapper.savedAt).toBe('number');
    expect(wrapper.device).toBe('test-device');
    expect(wrapper.db.workouts.map((w) => w.uid)).toEqual(['1']);
  });

  it('reads a legacy v1 payload (no format field) as the db and backfills it', async () => {
    // Old whole-db backup: numeric ids, no uid/updatedAt, no wrapper.
    const legacy = {
      workouts: [{ id: 9, date: '2026-07-01', session: 'Old' }],
      bodyLogs: [],
    };
    const remote = makeRemote(legacy);
    const db = bareDb({ workouts: [W(2, 200)] });
    const { engine } = makeEngine(db, remote);

    const r = await engine.runCycle();

    expect(r).toBe('ok');
    const w = db.workouts.find((x) => x.uid === '9');
    expect(w).toBeTruthy(); // backfilled from id, merged into the local db
    expect(db.workouts.map((x) => x.uid).sort()).toEqual(['2', '9']);
    expect(remote.calls.push).toBe(1); // local edit + backfill → worth pushing
  });

  it('a corrupt remote payload fails the cycle instead of overwriting it', async () => {
    const remote = makeRemote([1, 2, 3]); // not a db-shaped document
    const db = bareDb({ workouts: [W(2, 200)] });
    const { engine } = makeEngine(db, remote);
    expect(await engine.runCycle()).toBe('error');
    expect(remote.calls.push).toBe(0);
  });

  it('empty local db + no remote file → no empty backup is uploaded', async () => {
    const remote = makeRemote(null);
    const db = bareDb();
    const { engine } = makeEngine(db, remote);
    expect(await engine.runCycle()).toBe('ok');
    expect(remote.calls.push).toBe(0);
  });

  it('projection strips heavy route fields from runningLogs (routes live in IndexedDB)', () => {
    const db = bareDb({
      runningLogs: [{ id: 5, uid: '5', updatedAt: 1, distance: 10, route: { coords: [1, 2] } }],
    });
    const p = syncProjection(db);
    expect(p.runningLogs[0].route).toBeNull();
    expect(p.runningLogs[0].distance).toBe(10);
    // …and the fingerprint ignores route content: stripped vs heavy compare equal.
    const heavy = structuredClone(db);
    heavy.runningLogs[0].route = { coords: [9, 9] };
    expect(syncProjection(heavy).runningLogs[0].route).toBeNull();
  });
});

describe('sync engine — diagnosis', () => {
  it('getDiag exposes lastResult, lastError, lastCycleAt, consecutiveFailures and 12-entry history', async () => {
    const remote = makeRemote(null);
    let fail = true;
    const origPull = remote.transport.pull;
    remote.transport.pull = async () => { if (fail) throw new Error('boom'); return origPull(); };
    const db = bareDb();
    const { engine } = makeEngine(db, remote);

    expect(engine.getDiag()).toMatchObject({ lastResult: null, consecutiveFailures: 0, history: [] });

    await engine.runCycle();
    await engine.runCycle();
    fail = false;
    await engine.runCycle();
    await engine.runCycle();

    const diag = engine.getDiag();
    expect(diag.lastResult).toBe('ok');
    expect(diag.lastError).toBeNull();
    expect(diag.consecutiveFailures).toBe(0);
    expect(diag.lastCycleAt).toBeGreaterThan(0);
    expect(diag.history).toHaveLength(4);
    expect(diag.history[0].result).toBe('ok');
    expect(diag.history[3]).toMatchObject({ result: 'error', detail: 'boom' });
  });

  it('dispatches arete-sync-degraded after 3 consecutive failures (once per streak)', async () => {
    const events = [];
    window.addEventListener('arete-sync-degraded', (e) => events.push(e.detail));
    const remote = makeRemote(null);
    remote.transport.pull = async () => { throw new Error('down'); };
    const db = bareDb();
    const { engine } = makeEngine(db, remote);

    await engine.runCycle();
    await engine.runCycle();
    expect(events).toHaveLength(0);
    await engine.runCycle();
    expect(events).toHaveLength(1);
    expect(events[0].lastError).toBe('down');
    await engine.runCycle();
    expect(events).toHaveLength(1); // streak continues, no duplicate event
  });
});
