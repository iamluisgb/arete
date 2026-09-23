// Sync engine v2 (docs/SYNC-V2.md): pull → merge locally → push.
//
// A device NEVER uploads blindly: every cycle first pulls what is on Drive,
// merges it into the local db (mergeDBv2, LWW by uid + tombstones) and only
// then pushes the merged state. Push is skipped entirely when the merged
// result equals the remote fingerprint — a no-op sync uploads nothing.
//
// Drive has no If-Match, so lost updates are emulated: before pushing, the
// remote metadata is re-read; if it changed since this cycle's pull, the
// engine re-pulls, re-merges and retries (bounded, with backoff + jitter).
//
// Multi-tab: the whole cycle runs under a Web Locks 'arete-sync' lock with
// ifAvailable — a tab that can't take the lock skips silently (another tab is
// already syncing). Browsers without navigator.locks just run unlocked.
//
// The transport is injectable ({ pull, readMeta, push }) so tests can mock
// Drive without touching the network. js/drive.js builds the real one.

import { mergeDBv2, canonicalJson } from './merge.js';
import { SYNC_KEYS, backfillDb } from './schema.js';
import { stripHeavyFields } from '../run-store.js';

export const SYNC_FILE_FORMAT = 'arete-sync';
export const SYNC_FORMAT_VERSION = 2;
export const SYNC_LOCK_NAME = 'arete-sync';

const MAX_RETRIES = 3;        // re-pull/re-merge retries after a detected conflict
const RETRY_BASE_MS = 300;    // backoff: 300ms * attempt…
const RETRY_JITTER_MS = 150;  // …plus random 0–150ms so two devices desynchronize
const DIAG_HISTORY_MAX = 12;  // cycle history kept for diagnosis
const DEGRADED_AFTER = 3;     // consecutive failures before 'arete-sync-degraded'

// Fingerprint of a db: canonicalJson over the SYNC_KEYS projection (bounded to
// what the engine syncs — Quirón data, deletedIds and other legacy keys are out
// of the contract). Heavy route fields are stripped before comparing: they live
// in IndexedDB (areteRuns), not in the synced JSON (docs/SYNC-V2.md · GPS).
export function syncProjection(db) {
  const out = {};
  if (!db || typeof db !== 'object') return out;
  for (const key of Object.keys(SYNC_KEYS)) {
    if (db[key] !== undefined) out[key] = db[key];
  }
  out.stamps = db.stamps && typeof db.stamps === 'object' ? db.stamps : {};
  if (db.schemaVersion !== undefined) out.schemaVersion = db.schemaVersion;
  if (Array.isArray(out.runningLogs)) {
    out.runningLogs = out.runningLogs.map((l) => (l && typeof l === 'object' ? stripHeavyFields(l) : l));
  }
  return out;
}

export function dbFingerprint(db) {
  return canonicalJson(syncProjection(db));
}

// The remote document is either the v2 wrapper or a legacy v1 backup (no
// format field): the whole payload is then the db itself. Anything else is
// garbage and must not be merged, let alone overwritten.
function payloadDb(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.format === SYNC_FILE_FORMAT) return data.db && typeof data.db === 'object' ? data.db : null;
  return data;
}

// True when the SYNC_KEYS projection carries no user content at all: every
// array empty, every object key empty, no scalar set, no stamps. Used to never
// seed Drive with an empty backup (a fresh install with no remote file must
// not upload).
function isEmptyState(db) {
  const p = syncProjection(db);
  for (const [key, kind] of Object.entries(SYNC_KEYS)) {
    if (kind === 'array' && (p[key] || []).length) return false;
    if (kind === 'object' && p[key] && Object.keys(p[key]).length) return false;
    if (kind === 'scalar' && p[key] !== undefined && p[key] !== null && p[key] !== '') return false;
  }
  return Object.keys(p.stamps || {}).length === 0;
}

function emptyDbFingerprint() {
  return dbFingerprint(backfillDb({}));
}

/**
 * Build a sync engine bound to one live db object.
 *
 * @param {Object} opts
 * @param {Object} opts.transport  Drive seam: pull() → {rev, data}|null,
 *   readMeta() → {rev}|null, push(wrapper) → {rev}.
 * @param {Function} opts.getDb    () → live db object (mutated in place).
 * @param {Function} opts.saveRaw  persist without re-stamping (saveDBRaw).
 * @param {Function} [opts.splitRoutes] async (runningLogs) => logs with heavy
 *   fields moved to IndexedDB (splitAndStoreRoutes).
 * @param {string} [opts.device]   device id written into the wrapper.
 * @param {Object} [opts.locks]    Web Locks handle (defaults to navigator.locks).
 * @param {Function} [opts.sleep]  injectable backoff (ms) => Promise.
 * @param {Function} [opts.random] injectable jitter source.
 * @param {Function} [opts.onStatus] 'syncing' | 'ok' | 'error'.
 * @param {Function} [opts.onError] called with the failure after onStatus('error').
 */
export function createSyncEngine(opts) {
  const io = opts.transport;
  const getDb = opts.getDb;
  const saveRaw = opts.saveRaw;
  const splitRoutes = opts.splitRoutes || (async (logs) => logs);
  const device = opts.device || 'unknown';
  const locks = opts.locks !== undefined ? opts.locks : (typeof navigator !== 'undefined' ? navigator.locks : undefined);
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const random = opts.random || Math.random;
  const onStatus = opts.onStatus || (() => {});
  const onError = opts.onError || (() => {});

  let running = false;
  let pendingChange = false; // a save happened while a cycle was in flight
  let lastResult = null;
  let lastError = null;
  let lastCycleAt = 0;
  let consecutiveFailures = 0;
  const history = [];

  function record(result, detail) {
    history.unshift({ at: Date.now(), result, detail: String(detail || '').slice(0, 300) });
    if (history.length > DIAG_HISTORY_MAX) history.length = DIAG_HISTORY_MAX;
  }

  function buildPayload(db) {
    return {
      format: SYNC_FILE_FORMAT,
      formatVersion: SYNC_FORMAT_VERSION,
      savedAt: Date.now(),
      device,
      db: syncProjection(db),
    };
  }

  // PULL + merge. Applies the merged state to the live db and persists it with
  // saveDBRaw (never re-stamping remote items — that would fabricate lost
  // updates against genuinely newer edits elsewhere). Returns everything the
  // push phase needs to decide and to detect a concurrent remote write.
  async function pullAndMerge() {
    const db = getDb();
    backfillDb(db); // engine invariant: every mergeable item carries uid/updatedAt
    const before = dbFingerprint(db);
    const remote = await io.pull();
    let merged = db;
    let remoteDb = null;
    if (remote) {
      remoteDb = payloadDb(remote.data);
      if (!remoteDb) throw new Error('Remote backup is corrupt (no db content)');
      backfillDb(remoteDb); // a v1 remote arrives without sync fields
      // NOTE: tombstones are never purged inside the cycle. Dropping expired
      // ones here could push a state weaker than the remote's (a device that
      // stayed offline past the TTL would resurrect its deletes); the TTL
      // purge belongs to a maintenance path, not to pull/merge/push.
      merged = mergeDBv2(db, remoteDb);
    }
    const mergedFp = dbFingerprint(merged);
    let pulled = false;
    if (mergedFp !== before) {
      Object.assign(db, merged);
      // GPS routes stay out of the synced JSON: heavy fields that came in the
      // pull (legacy backups carried them) go to IndexedDB, logs are stripped.
      if (Array.isArray(db.runningLogs) && db.runningLogs.length) {
        db.runningLogs = await splitRoutes(db.runningLogs);
      }
      saveRaw(db);
      pulled = true;
    }
    return {
      remote,
      merged,
      mergedFp,
      remoteFp: remoteDb ? dbFingerprint(remoteDb) : null,
      pulled,
    };
  }

  // One full cycle, with the emulated-412 retry loop around the push phase.
  async function cycle() {
    let st = await pullAndMerge();
    for (let attempt = 0; ; attempt++) {
      // Before pushing, check the remote did not move since our pull. If it
      // did, someone else wrote: re-pull, re-merge, retry (the merge is
      // idempotent, so retrying converges instead of losing their write).
      const meta = await io.readMeta();
      const pulledRev = st.remote ? st.remote.rev : null;
      const remoteRev = meta ? meta.rev : null;
      if (remoteRev !== pulledRev) {
        if (attempt >= MAX_RETRIES) {
          const e = new Error('Remote kept changing during sync (conflict after max retries)');
          e.code = 412;
          throw e;
        }
        await sleep(RETRY_BASE_MS * (attempt + 1) + random() * RETRY_JITTER_MS);
        st = await pullAndMerge();
        continue;
      }
      // No-op sync: what we would push is what is already there. Never upload.
      if (st.mergedFp === st.remoteFp) return { pulled: st.pulled, pushed: false };
      // No remote file and nothing to say: don't seed Drive with an empty backup.
      if (!st.remote && isEmptyState(st.merged)) return { pulled: st.pulled, pushed: false };
      const res = await io.push(buildPayload(st.merged));
      return { pulled: st.pulled, pushed: true, rev: res && res.rev };
    }
  }

  async function runWithLock(fn) {
    if (!locks || typeof locks.request !== 'function') return fn();
    return locks.request(SYNC_LOCK_NAME, { ifAvailable: true }, (lock) => (lock ? fn() : 'locked'));
  }

  /**
   * Run one sync cycle. Resolves 'ok' | 'error' | 'locked' | 'busy'.
   * 'locked' means another tab holds the sync lock (skipped, not a failure);
   * 'busy' means a cycle was already running and the change stays pending.
   */
  async function runCycle() {
    if (running) {
      pendingChange = true;
      return 'busy';
    }
    running = true;
    try {
      const r = await runWithLock(cycle);
      if (r === 'locked') return 'locked';
      lastResult = 'ok';
      lastError = null;
      lastCycleAt = Date.now();
      consecutiveFailures = 0;
      record('ok', `pulled:${r.pulled} pushed:${r.pushed}`);
      onStatus('ok');
    } catch (e) {
      lastResult = 'error';
      lastError = String((e && e.message) || e).slice(0, 300);
      lastCycleAt = Date.now();
      consecutiveFailures++;
      record('error', lastError);
      onStatus('error');
      onError(e);
      if (consecutiveFailures === DEGRADED_AFTER && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arete-sync-degraded', { detail: { lastError } }));
      }
    } finally {
      running = false;
    }
    // A save landed while this cycle ran: run another one right away, the
    // finished cycle may not carry it.
    if (pendingChange) {
      pendingChange = false;
      setTimeout(() => { runCycle(); }, 0);
    }
    return lastResult;
  }

  /** Diagnosis for the settings UI / degraded badge (follow-up). */
  function getDiag() {
    return {
      lastResult,
      lastError,
      lastCycleAt,
      consecutiveFailures,
      history: history.slice(),
    };
  }

  return { runCycle, getDiag, isRunning: () => running };
}
