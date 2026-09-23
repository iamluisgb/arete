import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The Drive auth layer is mocked at the module boundary: no network, no tokens.
vi.mock('../js/drive-auth.js', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: () => true,
  getAccessToken: vi.fn(async () => 'test-token'),
}));

// ── Fake Drive REST API ──────────────────────────────────────────────────────
// One appDataFolder file (arete-backup.json) served through a mocked fetch.

function fakeDrive(initialContent) {
  const state = {
    id: initialContent ? 'file1' : null,
    content: initialContent || null,
    modifiedTime: '2026-01-01T00:00:00.000Z',
  };
  const calls = { list: 0, download: 0, upload: 0 };
  const fetchMock = vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/upload/drive/v3/files')) {
      calls.upload++;
      // multipart body: metadata part, then the JSON content part
      const content = JSON.parse(
        opts.body.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]
      );
      state.content = JSON.stringify(content);
      state.id = state.id || 'file-new-1';
      state.modifiedTime = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, calls.upload * 1000)).toISOString();
      return { ok: true, status: 200, json: async () => ({ id: state.id, modifiedTime: state.modifiedTime }) };
    }
    if (u.includes('/drive/v3/files/') && u.includes('alt=media')) {
      calls.download++;
      return { ok: true, status: 200, text: async () => state.content };
    }
    if (u.includes('/drive/v3/files?')) {
      calls.list++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: state.content ? [{ id: state.id, name: 'arete-backup.json', modifiedTime: state.modifiedTime }] : [],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  });
  return {
    fetchMock,
    calls,
    state,
    getWrapper: () => (state.content ? JSON.parse(state.content) : null),
  };
}

const W = (id, updatedAt, extra = {}) => ({ id, uid: String(id), updatedAt, session: 'S' + id, exercises: [], ...extra });
const bareDb = (over = {}) => ({ schemaVersion: 7, workouts: [], bodyLogs: [], tombstones: [], stamps: {}, ...over });

// Fresh module instances per test: drive.js keeps the engine singleton in
// module state, and data.js keeps its shadow there.
async function loadModules() {
  vi.resetModules();
  const drive = await import('../js/drive.js');
  const data = await import('../js/data.js');
  return { drive, data };
}

let originalFetch;
beforeEach(() => {
  localStorage.clear();
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe('drive.js — manual backup/restore format', () => {
  it('backupToDrive uploads the v2 wrapper ({format, formatVersion, device, db})', async () => {
    const fake = fakeDrive(null);
    global.fetch = fake.fetchMock;
    const { drive } = await loadModules();

    const db = bareDb({ workouts: [W(1, 100)] });
    const r = await drive.backupToDrive(db);

    expect(r).toEqual({ success: true, updated: false });
    expect(fake.calls.upload).toBe(1);
    const wrapper = fake.getWrapper();
    expect(wrapper.format).toBe('arete-sync');
    expect(wrapper.formatVersion).toBe(2);
    expect(wrapper.device).toBeTruthy();
    expect(wrapper.db.workouts.map((w) => w.uid)).toEqual(['1']);
  });

  it('restoreFromDrive unwraps a v2 payload and passes a v1 payload through', async () => {
    const v2 = fakeDrive(JSON.stringify({
      format: 'arete-sync', formatVersion: 2, savedAt: 1, device: 'd1',
      db: bareDb({ workouts: [W(1, 100)] }),
    }));
    global.fetch = v2.fetchMock;
    let { drive } = await loadModules();
    const fromV2 = await drive.restoreFromDrive();
    expect(fromV2.success).toBe(true);
    expect(fromV2.data.workouts.map((w) => w.uid)).toEqual(['1']);

    const v1 = fakeDrive(JSON.stringify({ workouts: [{ id: 5, date: '2026-07-01' }], bodyLogs: [] }));
    global.fetch = v1.fetchMock;
    ({ drive } = await loadModules());
    const fromV1 = await drive.restoreFromDrive();
    expect(fromV1.success).toBe(true);
    expect(fromV1.data.workouts[0].id).toBe(5);
  });
});

describe('drive.js — syncNow (engine wiring end to end)', () => {
  it('pulls a legacy remote, merges into the local db and pushes the v2 wrapper', async () => {
    const legacyRemote = JSON.stringify({ workouts: [W(1, 100)], bodyLogs: [] });
    const fake = fakeDrive(legacyRemote);
    global.fetch = fake.fetchMock;
    const { drive, data } = await loadModules();

    localStorage.setItem('arete', JSON.stringify({
      schemaVersion: 6,
      workouts: [{ id: 2, date: '2026-07-02', exercises: [] }],
      bodyLogs: [],
    }));
    const db = data.loadDB();

    const r = await drive.syncNow(db);

    expect(r).toBe('ok');
    // Local db absorbed the remote workout (backfilled from id)…
    expect(db.workouts.map((w) => w.uid).sort()).toEqual(['1', '2']);
    const stored = JSON.parse(localStorage.getItem('arete'));
    expect(stored.workouts.map((w) => w.uid).sort()).toEqual(['1', '2']);
    // …and the push carried both, wrapped in the v2 format.
    const wrapper = fake.getWrapper();
    expect(wrapper.format).toBe('arete-sync');
    expect(wrapper.db.workouts.map((w) => w.uid).sort()).toEqual(['1', '2']);
  });

  it('a second no-op cycle does not upload again', async () => {
    const fake = fakeDrive(null);
    global.fetch = fake.fetchMock;
    const { drive, data } = await loadModules();
    const db = data.loadDB();
    db.workouts.push(W(1, 100));

    expect(await drive.syncNow(db)).toBe('ok');
    const uploadsAfterFirst = fake.calls.upload;
    expect(uploadsAfterFirst).toBe(1);

    expect(await drive.syncNow(db)).toBe('ok');
    expect(fake.calls.upload).toBe(uploadsAfterFirst); // fingerprint equal → skip
  });

  it('a defaults-only db seeds the remote once; further cycles are no-ops', async () => {
    const fake = fakeDrive(null);
    global.fetch = fake.fetchMock;
    const { drive, data } = await loadModules();
    const db = data.loadDB(); // fresh install: defaults, no user data
    expect(await drive.syncNow(db)).toBe('ok');
    expect(fake.calls.upload).toBe(1); // seed upload (same as the old activation seeding)
    expect(await drive.syncNow(db)).toBe('ok');
    expect(fake.calls.upload).toBe(1); // fingerprint equal → never uploads again
  });

  it('getSyncDiag and isSyncing reflect the engine state', async () => {
    const fake = fakeDrive(null);
    global.fetch = fake.fetchMock;
    const { drive, data } = await loadModules();
    const db = data.loadDB();
    expect(drive.isSyncing()).toBe(false);
    expect(drive.getSyncDiag()).toBeNull(); // engine not created yet
    await drive.syncNow(db);
    const diag = drive.getSyncDiag();
    expect(diag.lastResult).toBe('ok');
    expect(diag.history).toHaveLength(1);
    expect(diag.history[0]).toMatchObject({ result: 'ok' });
    expect(drive.isSyncing()).toBe(false);
  });
});
