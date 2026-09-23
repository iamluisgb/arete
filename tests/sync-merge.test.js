import { describe, it, expect } from 'vitest';
import { canonicalJson, mergeCollections, mergeDBv2, pickStamped, stableStringify } from '../js/sync/merge.js';
import { SYNC_KEYS } from '../js/sync/schema.js';

// Deterministic PRNG (mulberry32) so property tests are reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const J = JSON.stringify;
const UIDS = ['1', '2', '3', '4', '5'];

function genItems(r, n, withUidProb = 0.9) {
  const out = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const it = { v: Math.floor(r() * 1000) };
    if (r() < withUidProb) {
      // Invariant of the engine: uids are unique within a collection (they come
      // from unique ids, or UUIDs). Duplicates would be garbage in.
      let uid;
      do { uid = 'u' + Math.floor(r() * 40); } while (used.has(uid));
      used.add(uid);
      it.uid = uid;
    }
    if (r() < 0.8) it.updatedAt = Math.floor(r() * 10);
    if (r() < 0.2) { it.deleted = true; it.deletedAt = Math.floor(r() * 10); }
    out.push(it);
  }
  return out;
}

describe('mergeCollections — property tests', () => {
  it('is commutative and idempotent across randomized inputs', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      // Unique uids are an engine invariant (backfill before merge). The
      // no-uid fallback (kept from the local side) is asymmetric by design and
      // covered by the explicit test below.
      const A = genItems(r, Math.floor(r() * 12), 1);
      const B = genItems(r, Math.floor(r() * 12), 1);
      const AB = mergeCollections(A, B);
      const BA = mergeCollections(B, A);
      // Order within the result is not part of the contract; compare as sets.
      expect(sortByUid(AB)).toEqual(sortByUid(BA));
      expect(sortByUid(mergeCollections(A, A))).toEqual(sortByUid(A));
    }
  });

  it('union keeps one-sided items and merges both-sided by updatedAt', () => {
    const A = [{ uid: 'x', updatedAt: 5, v: 'a' }];
    const B = [{ uid: 'x', updatedAt: 9, v: 'b' }, { uid: 'y', updatedAt: 1 }];
    const m = mergeCollections(A, B);
    expect(m.find((i) => i.uid === 'x').v).toBe('b'); // LWW
    expect(m.find((i) => i.uid === 'y')).toBeTruthy(); // union
  });

  it('exact tie: tombstone wins over live item (deterministic)', () => {
    const live = { uid: 'x', updatedAt: 7, v: 'live' };
    const tomb = { uid: 'x', updatedAt: 7, deleted: true, deletedAt: 7 };
    expect(mergeCollections([live], [tomb])[0].deleted).toBe(true);
    expect(mergeCollections([tomb], [live])[0].deleted).toBe(true);
  });

  it('items without uid survive from local, are ignored from remote', () => {
    const A = [{ v: 'no-uid-local' }];
    const B = [{ v: 'no-uid-remote' }];
    const m = mergeCollections(A, B);
    expect(m).toEqual([{ v: 'no-uid-local' }]);
    expect(mergeCollections(B, A)).toEqual([{ v: 'no-uid-remote' }]);
  });

  it('tombstone newer than last edit drops the item; edit after delete revives', () => {
    const live = { uid: 'x', updatedAt: 1 };
    const tomb = { uid: 'x', updatedAt: 5, deleted: true, deletedAt: 5 };
    expect(mergeCollections([live], [tomb])[0].deleted).toBe(true);
    const revived = { uid: 'x', updatedAt: 9, v: 'back' };
    const m = mergeCollections([tomb], [revived]);
    expect(m[0].deleted).toBeFalsy();
    expect(m[0].v).toBe('back');
  });
});

function sortByUid(arr) {
  return [...arr].map((it) => stableStringify(it)).sort();
}

describe('stableStringify', () => {
  it('is key-order independent at every level', () => {
    expect(stableStringify({ a: 1, b: { y: 2, x: 3 } }))
      .toBe(stableStringify({ b: { x: 3, y: 2 }, a: 1 }));
  });
});

// Full-db docs for mergeDBv2 property tests: backfilled shape (tombstones +
// stamps always present, uids always set), like the engine feeds it.
function genDoc(r) {
  const doc = { tombstones: [], stamps: {} };
  const usedByColl = {};
  for (const [key, kind] of Object.entries(SYNC_KEYS)) {
    if (kind === 'array' && key !== 'tombstones') {
      usedByColl[key] = new Set();
      const n = Math.floor(r() * 6);
      const arr = [];
      for (let i = 0; i < n; i++) {
        let uid;
        do { uid = 'u' + Math.floor(r() * 40); } while (usedByColl[key].has(uid));
        usedByColl[key].add(uid);
        const it = { uid, v: Math.floor(r() * 1000) };
        if (r() < 0.8) it.updatedAt = Math.floor(r() * 10);
        if (r() < 0.2) { it.deleted = true; it.deletedAt = Math.floor(r() * 10); }
        arr.push(it);
      }
      doc[key] = arr;
    } else if (kind === 'object') {
      doc[key] = {};
      for (const k of ['height', 'age']) {
        if (r() < 0.7) doc[key][k] = Math.floor(r() * 50);
      }
    } else if (kind === 'scalar') {
      if (r() < 0.7) doc[key] = Math.floor(r() * 5);
    }
  }
  // random stamps on some keys
  for (const k of ['program', 'phase', 'settings.height', 'settings.age']) {
    if (r() < 0.5) doc.stamps[k] = Math.floor(r() * 10);
  }
  if (r() < 0.5) {
    const tomb = { uid: 'u' + Math.floor(r() * 40), coll: 'workouts', deleted: true, deletedAt: Math.floor(r() * 10), updatedAt: Math.floor(r() * 10) };
    doc.tombstones.push(tomb);
    // A doc never holds a live item together with its own newer tombstone:
    // deleting removes the item. Reachable states only.
    doc.workouts = doc.workouts.filter((it) => it.uid !== tomb.uid);
  }
  return doc;
}

describe('mergeDBv2 — property tests', () => {
  it('is commutative and idempotent across randomized docs', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const A = genDoc(r);
      const B = genDoc(r);
      const AB = mergeDBv2(A, B);
      const BA = mergeDBv2(B, A);
      expect(canonicalJson(AB)).toBe(canonicalJson(BA));
      expect(canonicalJson(mergeDBv2(A, A))).toBe(canonicalJson(A));
    }
  });

  it('scalar LWW by stamp, deterministic value tiebreak on equal stamps', () => {
    const A = { program: 'p1', stamps: { program: 10 } };
    const B = { program: 'p2', stamps: { program: 5 } };
    expect(mergeDBv2(A, B).program).toBe('p1');
    const C = { program: 'p1', stamps: {} };
    const D = { program: 'p2', stamps: {} };
    // No stamps at all: both sides converge to the same value.
    expect(mergeDBv2(C, D).program).toBe(mergeDBv2(D, C).program);
  });

  it('object sub-key LWW via stamps (settings.height)', () => {
    const A = { settings: { height: 180 }, stamps: { 'settings.height': 20 } };
    const B = { settings: { height: 175 }, stamps: {} };
    expect(mergeDBv2(A, B).settings.height).toBe(180);
    expect(mergeDBv2(B, A).settings.height).toBe(180);
  });

  it('newer tombstone removes the live item across the whole db', () => {
    const A = { workouts: [{ uid: 'w1', updatedAt: 1 }], tombstones: [], stamps: {} };
    const B = { workouts: [], tombstones: [{ uid: 'w1', coll: 'workouts', deleted: true, deletedAt: 5, updatedAt: 5 }], stamps: {} };
    expect(mergeDBv2(A, B).workouts).toEqual([]);
    expect(mergeDBv2(B, A).workouts).toEqual([]);
  });

  it('edit after tombstone revives the item (conmutatively)', () => {
    const A = { workouts: [{ uid: 'w1', updatedAt: 10, v: 'edited' }], tombstones: [], stamps: {} };
    const B = { workouts: [{ uid: 'w1', updatedAt: 1 }], tombstones: [{ uid: 'w1', coll: 'workouts', deleted: true, deletedAt: 5, updatedAt: 5 }], stamps: {} };
    expect(mergeDBv2(A, B).workouts[0].v).toBe('edited');
    expect(mergeDBv2(B, A).workouts[0].v).toBe('edited');
  });

  it('does not mutate its inputs', () => {
    const A = { workouts: [{ uid: 'w1', updatedAt: 1 }], tombstones: [], stamps: {} };
    const B = { workouts: [{ uid: 'w1', updatedAt: 9 }], tombstones: [{ uid: 'w2', coll: 'workouts', deleted: true, deletedAt: 1, updatedAt: 1 }], stamps: {} };
    const aSnap = stableStringify(A);
    mergeDBv2(A, B);
    expect(stableStringify(A)).toBe(aSnap);
  });
});
