// Sync F0 (docs/SYNC-V2.md): stable identity + deterministic merge.
//
// Every mergeable item (workouts, body logs, plans, sessions, run logs,
// domain tests, Quirón messages) carries:
//   uid       — stable global identity across devices. Existing numeric ids
//               become strings; brand-new items get a UUID.
//   updatedAt — last local modification (per-item LWW in the merge).
//   deleted / deletedAt / coll — tombstone entries live in `db.tombstones`
//               (NOT inside the collections, so no code iterating them sees
//               deleted rows). Purged after TOMBSTONE_TTL_MS.
//
// Backfill only writes MISSING fields, so it is idempotent. The v7 data
// migration runs it once and drains legacy `deletedIds` into tombstones.

export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Which first-level db keys the engine syncs, and how.
export const SYNC_KEYS = {
  workouts: 'array',
  bodyLogs: 'array',
  customPrograms: 'array',
  customSessions: 'array',
  runningLogs: 'array',
  domainTests: 'array',
  tombstones: 'array',
  settings: 'object',
  runningGoal: 'object',
  program: 'scalar',
  phase: 'scalar',
  runningProgram: 'scalar',
  runningWeek: 'scalar',
};

export function newUid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function tombstone(uid, coll, now = Date.now()) {
  return { uid: String(uid), coll, deleted: true, deletedAt: now, updatedAt: now };
}

/**
 * Backfill one collection item with sync fields. Only writes missing fields
 * (idempotent). updatedAt derives from the most stable timestamp the item
 * already had: date (day precision) beats a migration-time `now`, so two
 * devices migrating the same history converge to the same stamps.
 */
export function backfillItem(item, now = Date.now()) {
  let changed = false;
  if (!item.uid) {
    item.uid = item.id != null ? String(item.id) : newUid();
    changed = true;
  }
  if (!item.updatedAt) {
    const d = item.date ? Date.parse(item.date) : NaN;
    const c = item.createdAt || item._revisions?.[item._revisions.length - 1]?.ts;
    item.updatedAt = Number.isFinite(d) ? d : (c || now);
    changed = true;
  }
  return changed;
}

/**
 * Backfill an entire db snapshot (pure-ish: mutates the passed object).
 * Used by the v7 migration, by restore of old backups, and by the engine on
 * every remote pull (a v1-format remote document arrives without sync fields).
 */
export function backfillDb(db, now = Date.now()) {
  for (const [key, kind] of Object.entries(SYNC_KEYS)) {
    if (kind !== 'array') continue;
    if (key === 'tombstones') {
      if (!Array.isArray(db.tombstones)) db.tombstones = [];
      continue;
    }
    if (!Array.isArray(db[key])) continue;
    for (const item of db[key]) {
      if (item && typeof item === 'object') backfillItem(item, now);
    }
  }
  if (!db.tombstones) db.tombstones = [];
  if (!db.stamps || typeof db.stamps !== 'object') db.stamps = {};
  return db;
}

/** Physically drop tombstones older than the TTL. Mutates db.tombstones. */
export function purgeExpiredTombstones(db, now = Date.now()) {
  if (!Array.isArray(db.tombstones)) return 0;
  const kept = db.tombstones.filter((t) => !t.deleted || now - (t.deletedAt || 0) < TOMBSTONE_TTL_MS);
  const dropped = db.tombstones.length - kept.length;
  db.tombstones = kept;
  return dropped;
}

// ── Shadow diff (stamp on save) ──────────────────────────────────────────────
// Call sites edit items in place and never stamp anything; instead of touching
// every one of them, saveDB diffs the db against the snapshot of its previous
// save and stamps: new/changed item → updatedAt = now; disappeared item →
// tombstone (unless one already exists). Scalars and object sub-keys get their
// stamp in db.stamps. No changes → no stamps (timestamps stay stable).

/** Shadow of one save: item content by uid, object sub-keys, scalar values. */
export function createShadow(db) {
  const shadow = { items: {} };
  for (const [key, kind] of Object.entries(SYNC_KEYS)) {
    if (kind === 'array' && key !== 'tombstones') shadow.items[key] = snapshotItems(db, key);
    else if (kind === 'object') shadow[key] = JSON.parse(JSON.stringify(db[key] || {}));
    else if (kind === 'scalar') shadow[key] = db[key];
  }
  return shadow;
}

/**
 * Stamp mutations detected between `shadow` (previous save) and the live db.
 * Mutates db (updatedAt, tombstones, stamps) AND refreshes the shadow, so the
 * next save diffs against what was just stamped. Returns true if anything was
 * stamped. `now` injectable for tests.
 */
export function stampChanges(db, shadow, now = Date.now()) {
  let changed = false;
  if (!db.stamps) db.stamps = {};
  if (!db.tombstones) db.tombstones = [];
  const tombIndex = new Map();
  for (const t of db.tombstones || []) if (t && t.uid) tombIndex.set(t.uid, t);

  for (const [key, kind] of Object.entries(SYNC_KEYS)) {
    if (kind === 'array' && key !== 'tombstones') {
      const arr = Array.isArray(db[key]) ? db[key] : [];
      const seen = new Set();
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        if (item.uid == null) { backfillItem(item, now); changed = true; }
        const uid = String(item.uid);
        seen.add(uid);
        const prev = shadow.items[key][uid];
        const cur = JSON.stringify(item);
        if (prev === undefined) {
          // New since the previous save.
          if (item.updatedAt !== now) { item.updatedAt = now; changed = true; }
        } else if (JSON.stringify(prev) !== cur) {
          item.updatedAt = now;
          changed = true;
        }
        shadow.items[key][uid] = JSON.parse(cur);
      }
      // Disappeared since the previous save → tombstone (dedup by uid).
      for (const uid of Object.keys(shadow.items[key])) {
        if (!seen.has(uid) && !tombIndex.has(uid)) {
          const t = tombstone(uid, key, now);
          db.tombstones.push(t);
          tombIndex.set(uid, t);
          changed = true;
        }
      }
      for (const uid of Object.keys(shadow.items[key])) {
        if (!seen.has(uid)) delete shadow.items[key][uid];
      }
    } else if (kind === 'object') {
      const obj = isPlainObject(db[key]) ? db[key] : {};
      // Sub-keys are stamped on change; they are never removed from settings,
      // so there is no deletion stamp (a key absent locally simply survives).
      for (const k of Object.keys(obj)) {
        if (JSON.stringify(obj[k]) !== JSON.stringify(shadow[key][k])) {
          db.stamps[key + '.' + k] = now;
          changed = true;
        }
        shadow[key][k] = JSON.parse(JSON.stringify(obj[k]));
      }
    } else if (kind === 'scalar') {
      if (db[key] !== shadow[key]) {
        db.stamps[key] = now;
        shadow[key] = db[key];
        changed = true;
      }
    }
  }
  return changed;
}

/** Snapshot the full serializable content of one item (for the shadow). */
export function snapshotItems(db, key) {
  const out = {};
  for (const it of db[key] || []) {
    if (it && typeof it === 'object' && it.uid != null) out[String(it.uid)] = JSON.parse(JSON.stringify(it));
  }
  return out;
}
