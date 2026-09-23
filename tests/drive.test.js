import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The Drive auth layer is mocked at the module boundary: no network, no tokens.
vi.mock('../js/drive-auth.js', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: () => true,
  getAccessToken: vi.fn(async () => 'test-token'),
}));

// ── Fake Drive REST API ──────────────────────────────────────────────────────
// One appDataFolder file per dataset: the db in arete-backup.json, the
// Quirón conversation in its own file (U3). The list endpoint HONORS the
// q=name filter: findDriveFile trusts the server to filter and takes
// files[0], so a fake that ignores q would serve the wrong file to the
// Quirón transport.

function fakeDrive(initialContent) {
  const files = new Map(); // name -> { id, content, modifiedTime }
  if (initialContent) {
    files.set('arete-backup.json', { id: 'file1', content: initialContent, modifiedTime: '2026-01-01T00:00:00.000Z' });
  }
  const calls = { list: 0, download: 0, upload: 0, uploads: [] };
  let uploadSeq = 0;
  const fetchMock = vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/upload/drive/v3/files')) {
      calls.upload++;
      // multipart body: metadata part (file name), then the JSON content part
      const meta = JSON.parse(
        opts.body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n')[1].split('\r\n--')[0]
      );
      const content = JSON.parse(
        opts.body.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]
      );
      const idInUrl = u.match(/upload\/drive\/v3\/files\/([^?]+)/);
      const existing = idInUrl && [...files.values()].find((f) => f.id === idInUrl[1]);
      const rec = existing || { id: 'file-new-' + (++uploadSeq) };
      rec.content = JSON.stringify(content);
      rec.modifiedTime = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, calls.upload * 1000)).toISOString();
      files.set(meta.name, rec);
      calls.uploads.push(meta.name);
      return { ok: true, status: 200, json: async () => ({ id: rec.id, modifiedTime: rec.modifiedTime }) };
    }
    if (u.includes('/drive/v3/files/') && u.includes('alt=media')) {
      calls.download++;
      const id = u.split('/drive/v3/files/')[1].split('?')[0];
      const rec = [...files.values()].find((f) => f.id === id);
      return { ok: true, status: 200, text: async () => (rec ? rec.content : '') };
    }
    if (u.includes('/drive/v3/files?')) {
      calls.list++;
      const q = new URL(u).searchParams.get('q') || '';
      const wanted = (q.match(/name='([^']+)'/) || [])[1];
      const listing = [...files.entries()]
        .filter(([name, f]) => f.content != null && (!wanted || name === wanted))
        .map(([name, f]) => ({ id: f.id, name, modifiedTime: f.modifiedTime }));
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: listing }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  });
  return {
    fetchMock,
    calls,
    getWrapper: (name = 'arete-backup.json') => {
      const rec = files.get(name);
      return rec && rec.content ? JSON.parse(rec.content) : null;
    },
    setFile: (name, content) => files.set(name, { id: 'file-' + name, content, modifiedTime: '2026-01-02T00:00:00.000Z' }),
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

// ── Quirón transport (U3): own Drive file, hooks read at cycle time ──────────

describe('drive.js — Quirón transport (own file, end to end)', () => {
  const QM = (uid, content, ts) => ({ uid, role: 'user', content, ts, updatedAt: ts });

  async function loadDriveWithHooks(localState) {
    const { drive, data } = await loadModules();
    const { setQuironSyncHooks } = await import('../js/sync/quiron.js');
    const local = { data: localState || { convo: [], archive: [] } };
    setQuironSyncHooks({
      get: () => structuredClone(local.data),
      save: (d) => { local.data = structuredClone(d); },
    });
    return { drive, data, local };
  }

  it('the conversation is pushed to its own arete-quiron.json file, wrapped', async () => {
    const fake = fakeDrive(null);
    global.fetch = fake.fetchMock;
    const { drive, data, local } = await loadDriveWithHooks({
      convo: [QM('m1', 'hola', 100)], archive: [],
    });

    expect(await drive.syncNow(data.loadDB())).toBe('ok');

    // The db backup file was seeded AND the conversation got its own file.
    expect(fake.getWrapper().format).toBe('arete-sync');
    const qFile = fake.getWrapper('arete-quiron.json');
    expect(qFile.format).toBe('arete-quiron');
    expect(qFile.formatVersion).toBe(1);
    expect(qFile.data.convo.map((m) => m.uid)).toEqual(['m1']);
    // The db backup must not contain the conversation.
    expect(fake.getWrapper().db.convo).toBeUndefined();
    expect(drive.getSyncDiag().quiron.lastResult).toBe('ok');

    // Second cycle with unchanged state: no further upload of either file.
    const uploadsAfterFirst = fake.calls.uploads.length;
    expect(await drive.syncNow(data.loadDB())).toBe('ok');
    expect(fake.calls.uploads.length).toBe(uploadsAfterFirst);
    expect(local.data.convo[0].uid).toBe('m1');
  });

  it('a remote conversation is merged into the local one through the hooks', async () => {
    const fake = fakeDrive(null);
    fake.setFile('arete-quiron.json', JSON.stringify({
      format: 'arete-quiron', formatVersion: 1, savedAt: 1, device: 'other',
      data: { convo: [QM('r1', 'desde el móvil', 200)], archive: [] },
    }));
    global.fetch = fake.fetchMock;
    const { drive, data, local } = await loadDriveWithHooks({
      convo: [QM('l1', 'desde la tablet', 100)], archive: [],
    });

    expect(await drive.syncNow(data.loadDB())).toBe('ok');

    // The local hooks saw the union, sorted by (ts, uid).
    expect(local.data.convo.map((m) => m.uid)).toEqual(['l1', 'r1']);
    // And the pushed wrapper carries both.
    expect(fake.getWrapper('arete-quiron.json').data.convo.map((m) => m.uid).sort())
      .toEqual(['l1', 'r1']);
  });

  it('without hooks registered the Quirón phase is skipped, db still syncs', async () => {
    const fake = fakeDrive(null);
    global.fetch = fake.fetchMock;
    vi.resetModules();
    const drive = await import('../js/drive.js');
    const data = await import('../js/data.js');

    expect(await drive.syncNow(data.loadDB())).toBe('ok');
    expect(fake.getWrapper('arete-quiron.json')).toBeNull(); // never seeded
    expect(fake.getWrapper().format).toBe('arete-sync');     // db seeded normally
    expect(drive.getSyncDiag().quiron.lastResult).toBeNull();
  });
});
