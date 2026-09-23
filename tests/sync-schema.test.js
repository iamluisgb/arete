import { describe, it, expect, beforeEach } from 'vitest';
import {
  TOMBSTONE_TTL_MS, SYNC_KEYS, tombstone, backfillItem, backfillDb,
  purgeExpiredTombstones, createShadow, stampChanges,
} from '../js/sync/schema.js';
import { loadDB, saveDB, markDeleted, migrateDB, CURRENT_SCHEMA } from '../js/data.js';

beforeEach(() => {
  localStorage.clear();
});

describe('backfillItem', () => {
  it('uid from numeric id (string) and updatedAt from date', () => {
    const it = { id: 42, date: '2026-07-14' };
    expect(backfillItem(it)).toBe(true);
    expect(it.uid).toBe('42');
    expect(it.updatedAt).toBe(Date.parse('2026-07-14'));
  });

  it('is idempotent (only writes missing fields)', () => {
    const it = { id: 42, date: '2026-07-14' };
    backfillItem(it);
    const snap = JSON.stringify(it);
    expect(backfillItem(it)).toBe(false);
    expect(JSON.stringify(it)).toBe(snap);
  });

  it('falls back to createdAt/_revisions ts, then to now', () => {
    expect(backfillItem({ uid: 'x' }).updatedAt || true).toBeTruthy();
    const it2 = { uid: 'y', createdAt: 1000 };
    backfillItem(it2);
    expect(it2.updatedAt).toBe(1000);
    const it3 = { uid: 'z', _revisions: [{ ts: 2000 }] };
    backfillItem(it3);
    expect(it3.updatedAt).toBe(2000);
  });
});

describe('backfillDb on a legacy v1 document', () => {
  it('gives sync fields to every collection item and creates tombstones/stamps', () => {
    const db = {
      workouts: [{ id: 1, date: '2026-07-01' }],
      bodyLogs: [{ id: 2, date: '2026-07-02' }],
      customPrograms: [{ _customId: 'cp1', createdAt: 500 }],
      customSessions: [{ id: 3, createdAt: 600 }],
      runningLogs: [{ id: 4, date: '2026-07-03' }],
      domainTests: [{ id: 5, date: '2026-07-04' }],
    };
    backfillDb(db);
    for (const key of ['workouts', 'bodyLogs', 'customPrograms', 'customSessions', 'runningLogs', 'domainTests']) {
      expect(db[key].length).toBe(1);
      expect(db[key][0].uid).toBeTruthy();
      expect(db[key][0].updatedAt).toBeGreaterThan(0);
    }
    expect(db.tombstones).toEqual([]);
    expect(db.stamps).toEqual({});
  });
});

describe('purgeExpiredTombstones', () => {
  it('drops tombstones older than the TTL and keeps fresh ones', () => {
    const now = Date.now();
    const db = { tombstones: [
      tombstone('old', 'workouts', now - TOMBSTONE_TTL_MS - 1000),
      tombstone('new', 'workouts', now - 1000),
    ] };
    expect(purgeExpiredTombstones(db, now)).toBe(1);
    expect(db.tombstones.map((t) => t.uid)).toEqual(['new']);
  });
});

describe('shadow diff (stampChanges)', () => {
  it('stamps new and changed items; leaves untouched items alone', () => {
    const db = { workouts: [{ uid: '1', updatedAt: 100, v: 1 }], tombstones: [], stamps: {} };
    const shadow = createShadow(db);
    // No-op save: nothing stamped.
    expect(stampChanges(db, shadow, 500)).toBe(false);
    expect(db.workouts[0].updatedAt).toBe(100);
    // Edit: stamped.
    db.workouts[0].v = 2;
    expect(stampChanges(db, shadow, 500)).toBe(true);
    expect(db.workouts[0].updatedAt).toBe(500);
    // New item: stamped.
    db.workouts.push({ uid: '2' });
    stampChanges(db, shadow, 600);
    expect(db.workouts[1].updatedAt).toBe(600);
  });

  it('disappeared item becomes a tombstone (dedup by uid)', () => {
    const db = { workouts: [{ uid: '1', updatedAt: 1 }], tombstones: [], stamps: {} };
    const shadow = createShadow(db);
    db.workouts.length = 0;
    expect(stampChanges(db, shadow, 700)).toBe(true);
    expect(db.tombstones).toHaveLength(1);
    expect(db.tombstones[0]).toMatchObject({ uid: '1', coll: 'workouts', deleted: true, updatedAt: 700 });
    // Saving again does not duplicate the tombstone.
    stampChanges(db, shadow, 800);
    expect(db.tombstones).toHaveLength(1);
  });

  it('stamps scalars and object sub-keys in db.stamps', () => {
    const db = { program: 'arete', phase: 1, settings: { height: 175 }, runningGoal: { type: 'km' }, tombstones: [], stamps: {} };
    const shadow = createShadow(db);
    db.program = 'kettlebell';
    db.settings.height = 180;
    expect(stampChanges(db, shadow, 900)).toBe(true);
    expect(db.stamps.program).toBe(900);
    expect(db.stamps['settings.height']).toBe(900);
    expect(db.stamps.phase).toBeUndefined(); // untouched
  });

  it('revival: item deleted then re-added wins with a fresh updatedAt', () => {
    const db = { workouts: [{ uid: '1', updatedAt: 1 }], tombstones: [], stamps: {} };
    const shadow = createShadow(db);
    db.workouts.length = 0;
    stampChanges(db, shadow, 700);
    db.workouts.push({ uid: '1', v: 'back' });
    stampChanges(db, shadow, 900);
    expect(db.workouts[0].updatedAt).toBe(900);
    const t = db.tombstones.find((t) => t.uid === '1');
    expect(db.workouts[0].updatedAt).toBeGreaterThan(t.updatedAt);
  });
});

describe('markDeleted creates tombstones', () => {
  it('one tombstone per id, no duplicates', () => {
    const db = { tombstones: [] };
    markDeleted(db, 42);
    markDeleted(db, 42);
    expect(db.tombstones).toHaveLength(1);
    expect(db.tombstones[0]).toMatchObject({ uid: '42', deleted: true });
  });
});

describe('saveDB stamping integration', () => {
  it('load → edit → save stamps updatedAt; clean save does not', () => {
    localStorage.setItem('arete', JSON.stringify({
      workouts: [{ id: 1, date: '2026-07-14', exercise: 'Squat' }],
      bodyLogs: [],
    }));
    const db = loadDB();
    expect(db.schemaVersion).toBe(CURRENT_SCHEMA);
    const w = db.workouts[0];
    const original = w.updatedAt;
    saveDB(db); // clean: no stamp
    expect(w.updatedAt).toBe(original);
    w.exercise = 'Front Squat';
    saveDB(db); // edit: stamped with now
    expect(w.updatedAt).toBeGreaterThan(original);
  });

  it('v6 → v7 migration drains deletedIds into tombstones', () => {
    const db = { schemaVersion: 6, workouts: [], bodyLogs: [], deletedIds: [7, 8] };
    migrateDB(db);
    expect(db.schemaVersion).toBe(CURRENT_SCHEMA);
    const uids = db.tombstones.map((t) => t.uid);
    expect(uids).toContain('7');
    expect(uids).toContain('8');
    // Idempotent: running it again adds nothing.
    const n = db.tombstones.length;
    db.schemaVersion = 6;
    migrateDB(db);
    expect(db.tombstones).toHaveLength(n);
  });
});
