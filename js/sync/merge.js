// Merge of syncable collections (docs/SYNC-V2.md — adapted from bookreader's
// js/sync/merge.js, battle-tested in production).
//
// Rules, in order:
//   1. Union by `uid`: an item that only exists on one side survives.
//   2. Same `uid` on both sides → larger `updatedAt` wins (LWW per item).
//   3. Tombstones (`deleted`) participate like live items: a deletion newer
//      than the last edit propagates; an edit after the deletion revives it.
//   4. Exact `updatedAt` tie → the tombstone wins (deterministic: both devices
//      compare the same items and reach the same result).
//
// The merge is commutative and idempotent: A⊕B == B⊕A and A⊕A == A, compared
// as canonical forms (array order is not part of the contract). Items without
// `uid` are kept from the local side, never dropped — the engine always
// backfills before merging, so in practice every item has one.

import { SYNC_KEYS } from './schema.js';

/** JSON.stringify with object keys sorted at every level (deterministic). */
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

/**
 * Canonical form of a document: stableStringify plus arrays sorted by their
 * serialized items. Array ORDER is not part of the merge contract (the UI
 * sorts however it wants), so fingerprints and equality checks use this form —
 * it is what keeps two devices from re-pushing the same data to each other in
 * a loop just because their merges ordered items differently.
 */
export function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    return '[' + v.map(canonicalJson).sort().join(',') + ']';
  }
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
}

function pickNewer(a, b) {
  const au = a.updatedAt || 0;
  const bu = b.updatedAt || 0;
  if (au !== bu) return au > bu ? a : b;
  // `deleted` is normalized: undefined and false are the same state. Without
  // the !!, an item with `deleted: undefined` and one with `deleted: false`
  // counted as different and the tie broke non-commutatively (A⊕B ≠ B⊕A).
  const ad = !!a.deleted;
  const bd = !!b.deleted;
  if (ad !== bd) return ad ? a : b;
  // Content tie (same updatedAt): pick deterministically by serialized value so
  // both devices converge on the same bytes — returning the local item (as
  // bookreader did) would leave each side with its own version forever.
  const va = stableStringify(a);
  const vb = stableStringify(b);
  if (va !== vb) return va < vb ? a : b;
  return a;
}

export function mergeCollections(local = [], remote = []) {
  const localByUid = new Map();
  for (const it of local) if (it && it.uid) localByUid.set(it.uid, it);

  const out = [];
  const matched = new Set();
  for (const r of remote || []) {
    if (!r || !r.uid) continue; // remote without uid: pre-F0, ignored by the merge
    const l = localByUid.get(r.uid);
    if (l) {
      matched.add(r.uid);
      out.push(pickNewer(l, r));
    } else {
      out.push(r);
    }
  }
  for (const l of local || []) {
    if (!l) continue;
    if (!l.uid || !matched.has(l.uid)) out.push(l);
  }
  // Deterministic output order: A⊕B and B⊕A produce the same sequence.
  out.sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : 1));
  return out;
}

/**
 * Merge two db-shaped documents (arete sync v2).
 * - Array collections (workouts, bodyLogs, ...): LWW per `uid` + tombstones.
 * - Object keys (settings, runningGoal): LWW per sub-key via `stamps`.
 * - Scalar keys (program, phase, ...): LWW via `stamps`.
 * For every stamped key the larger stamp wins; on an exact stamp tie the
 * winner is picked by comparing the stable-serialized values (smaller wins),
 * so both devices converge even on legacy data that never got a stamp.
 *
 * `local` and `remote` are full db snapshots (already backfilled). Returns a
 * NEW object; neither input is mutated.
 */
export function mergeDBv2(local, remote, { syncKeys = SYNC_KEYS } = {}) {
  const out = {};
  const ls = (local && local.stamps) || {};
  const rs = (remote && remote.stamps) || {};
  const stamps = {};

  // Stamp maps merge entry by entry (max): never rebuilt from the values, or
  // stamp entries whose key is absent here (legacy docs) would be dropped and
  // A⊕A would lose them.

  // Deterministic value comparison: stable serialization (keys sorted).
  const vs = stableStringify;

  for (const key of new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])) {
    const kind = syncKeys[key];
    const l = (local || {})[key];
    const r = (remote || {})[key];
    if (kind === 'array') {
      out[key] = mergeCollections(Array.isArray(l) ? l : [], Array.isArray(r) ? r : []);
    } else if (kind === 'object') {
      const lo = isPlainObject(l) ? l : {};
      const ro = isPlainObject(r) ? r : {};
      const merged = {};
      for (const k of new Set([...Object.keys(lo), ...Object.keys(ro)])) {
        merged[k] = pickStamped(lo[k], ro[k], ls[key + '.' + k], rs[key + '.' + k], vs);
      }
      out[key] = merged;
    } else if (key === 'stamps') {
      continue; // merged below from the stamp maps themselves
    } else {
      // scalar and unknown/legacy keys: stamped LWW, value-tiebreak on ties.
      out[key] = pickStamped(l, r, ls[key], rs[key], vs);
    }
  }
  for (const k of new Set([...Object.keys(ls), ...Object.keys(rs)])) {
    stamps[k] = Math.max(ls[k] || 0, rs[k] || 0);
  }
  out.stamps = stamps;

  // Tombstones: merge, then drop live items whose uid was tombstoned later.
  // (Only touched when at least one side carries them: A⊕A == A even on
  // documents that never had a tombstones array.)
  if (local?.tombstones || remote?.tombstones) {
    out.tombstones = mergeCollections(local?.tombstones || [], remote?.tombstones || []);
    const tomb = new Map();
    for (const t of out.tombstones) if (t && t.uid) tomb.set(String(t.uid), t);
    for (const [key, kind] of Object.entries(syncKeys)) {
      if (kind !== 'array' || key === 'tombstones') continue;
      if (out[key] === undefined) continue; // not in the merge: do not create it
      const arr = Array.isArray(out[key]) ? out[key] : [];
      out[key] = arr.filter((it) => {
        if (!it || it.uid === undefined) return true; // pre-F0 item: keep
        const t = tomb.get(String(it.uid));
        // A tombstone only deletes within its own collection — ids are unique
        // per collection, so uids collide across collections. 'legacy'
        // tombstones (drained from deletedIds, which had no collection) match
        // any collection: deletion wins, as it did before sync v2.
        if (!t || (t.coll !== 'legacy' && t.coll !== key)) return true;
        if (!!it.deleted) return true;
        return (it.updatedAt || 0) >= (t.updatedAt || 0); // edit after delete revives
      });
    }
  }
  return out;
}

function pickStamped(a, b, sa = 0, sb = 0, vs) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (sa !== sb) return sa > sb ? a : b;
  const va = vs(a);
  const vb = vs(b);
  if (va === vb) return a;
  return va < vb ? a : b; // deterministic pick both sides can reproduce
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
