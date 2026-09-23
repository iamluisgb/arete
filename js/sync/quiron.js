// Quirón sync (docs/SYNC-V2.md — U3): the chat conversation and its archive
// live in their OWN Drive file (arete-quiron.json), outside the synced db.
//
// Why a separate file: the conversation is prescindible (the durable training
// history lives in the db) and changes on a different rhythm — merging it into
// the db backup would make every chat turn dirty the whole sync fingerprint.
//
// Merge contract (golden rule): commutative and idempotent, like mergeDBv2.
//   - Messages: union by `uid`, LWW per message by `updatedAt`, exact ties
//     broken by content (stableStringify) — the same pattern as merge.js.
//     NO tombstones: a message is never deleted, only archived.
//   - Archive: union by conversation `id`, LWW per conversation. Deleting a
//     conversation is a local convenience and does not propagate: the entry
//     comes back after the next sync (it survives on the other device's file).
//     Accepted: the archive is a convenience, its loss is not data loss.
//   - Result: messages sorted by (ts, uid); archive capped at QUIRON_ARCHIVE_MAX
//     by `updatedAt` (FIFO) with deterministic tie-breaks.
//
// Legacy backfill NEVER calls Date.now(): uids derive from content (role +
// content + occurrence index of identical messages), ts=0 for legacy messages.
// Two devices backfilling the same legacy data derive the same uids — that is
// what keeps the union free of duplicates. Array order of the inputs is not
// part of the merge contract; the merged conversation order is (ts, uid).

import { canonicalJson, stableStringify } from './merge.js';

export const QUIRON_FILE_FORMAT = 'arete-quiron';
export const QUIRON_FORMAT_VERSION = 1;
export const QUIRON_ARCHIVE_MAX = 15;

// FNV-1a 32 bits: tiny, dependency-free, stable across devices. Not
// cryptographic — it only needs to separate distinct conversations/messages;
// a collision merges two messages with the same derived identity, which for
// identical content is the same message anyway.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

// Deterministic uid for a legacy message (one without uid): hash of role,
// content and how many IDENTICAL (role, content) messages precede it — so
// duplicate texts get distinct uids, and two devices backfilling the same
// legacy list derive the same ones.
function legacyUid(msg, occurrence) {
  return 'q-' + fnv1a(stableStringify([msg.role ?? null, msg.content ?? null, occurrence]));
}

function countPrecedingSame(msg, idx, messages) {
  let n = 0;
  for (let i = 0; i < idx; i++) {
    const p = messages[i];
    if (p && p.role === msg.role && p.content === msg.content) n++;
  }
  return n;
}

// Stamps one message if it is missing sync fields. Pure: stamped messages pass
// through untouched, legacy ones come back as a new stamped copy. Legacy:
// ts=0 (its real time is gone and must NOT be fabricated), updatedAt=0.
function stampMessage(msg, idx, messages) {
  if (!msg || typeof msg !== 'object') return null;
  if (msg.uid && typeof msg.updatedAt === 'number' && msg.updatedAt) return msg;
  const out = { ...msg };
  if (!out.uid) out.uid = legacyUid(msg, countPrecedingSame(msg, idx, messages));
  if (typeof out.ts !== 'number') out.ts = 0;
  if (typeof out.updatedAt !== 'number' || !out.updatedAt) out.updatedAt = out.ts || 0;
  return out;
}

// Conversation id: derived from the stamped message uids, so the same
// conversation archived independently on two devices converges to ONE entry.
function stampArchiveEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const raw = Array.isArray(entry.messages) ? entry.messages : [];
  const messages = raw.map((m, i) => stampMessage(m, i, raw)).filter(Boolean);
  const out = { ...entry, messages };
  if (!out.id) out.id = 'c-' + fnv1a(stableStringify(messages.map((m) => m.uid).sort()));
  if (typeof out.updatedAt !== 'number' || !out.updatedAt) {
    // The entry's own ts (set by the UI when archiving) is stored data, not a
    // fabricated timestamp — safe to use as its last-update time.
    out.updatedAt = typeof out.ts === 'number' ? out.ts : 0;
  }
  return out;
}

/**
 * Backfill a Quirón document ({convo, archive}) with sync fields. Pure and
 * idempotent: only writes MISSING fields, drops non-object garbage, returns a
 * new {convo, archive}. Never calls Date.now() — the merge contract needs two
 * independent backfills of the same legacy data to produce identical output.
 */
export function backfillQuiron(data) {
  const src = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const rawConvo = Array.isArray(src.convo) ? src.convo : [];
  const rawArchive = Array.isArray(src.archive) ? src.archive : [];
  return {
    convo: rawConvo.map((m, i) => stampMessage(m, i, rawConvo)).filter(Boolean),
    archive: rawArchive.map(stampArchiveEntry).filter(Boolean),
  };
}

// LWW winner: larger updatedAt wins; exact tie broken by serialized content so
// both devices converge on the same bytes (same pattern as merge.js pickNewer,
// minus tombstones — Quirón messages are never deleted).
function pickNewer(a, b) {
  const au = a.updatedAt || 0;
  const bu = b.updatedAt || 0;
  if (au !== bu) return au > bu ? a : b;
  const va = stableStringify(a);
  const vb = stableStringify(b);
  if (va !== vb) return va < vb ? a : b;
  return a;
}

// Union by uid + LWW. Messages without uid are kept from the local side and
// ignored from the remote (the engine always backfills first, so in practice
// every message carries one).
function mergeMessages(local, remote) {
  const localByUid = new Map();
  for (const m of local) if (m && m.uid) localByUid.set(m.uid, m);
  const out = [];
  const matched = new Set();
  for (const m of remote) {
    if (!m) continue;
    if (!m.uid) continue;
    const l = localByUid.get(m.uid);
    if (l) { matched.add(m.uid); out.push(pickNewer(l, m)); }
    else out.push(m);
  }
  for (const m of local) {
    if (!m) continue;
    if (!m.uid || !matched.has(m.uid)) out.push(m);
  }
  // Deterministic conversation order on every device: by ts, ties by uid.
  // Legacy messages (ts=0) sort first, deterministically by their derived uid.
  out.sort((a, b) =>
    ((a.ts || 0) - (b.ts || 0)) ||
    (String(a.uid || '') < String(b.uid || '') ? -1 : String(a.uid || '') > String(b.uid || '') ? 1 : 0));
  return out;
}

// Union by conversation id + LWW, then the FIFO cap: keep the most recently
// updated conversations, drop the oldest. Ties (equal updatedAt) order by id.
function mergeArchive(local, remote) {
  const byId = new Map();
  for (const e of local) if (e && e.id) byId.set(e.id, e);
  for (const e of remote) {
    if (!e || !e.id) continue;
    const l = byId.get(e.id);
    byId.set(e.id, l ? pickNewer(l, e) : e);
  }
  const merged = [...byId.values()].sort((a, b) =>
    ((b.updatedAt || 0) - (a.updatedAt || 0)) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return merged.slice(0, QUIRON_ARCHIVE_MAX);
}

/**
 * Merge two Quirón documents. Pure: neither input is mutated, both are
 * backfilled first, so raw legacy data can be fed straight in. Returns
 * {convo, archive} with the merged, capped, deterministically ordered data.
 */
export function mergeQuiron(local, remote) {
  const l = backfillQuiron(local);
  const r = backfillQuiron(remote);
  return {
    convo: mergeMessages(l.convo, r.convo),
    archive: mergeArchive(l.archive, r.archive),
  };
}

/** True when the document carries nothing worth uploading (fresh install). */
export function isEmptyQuiron(data) {
  const d = backfillQuiron(data);
  return d.convo.length === 0 && d.archive.length === 0;
}

// ── UI hooks (engine → chat UI) ──────────────────────────────────────────────
// The engine never imports the chat UI: js/ui/quiron.js registers here how to
// read and replace the live conversation, and js/drive.js hands the hooks to
// the engine. Without registered hooks (tests, chat not initialized) the
// engine skips the Quirón phase entirely.

let hooks = null;

export function setQuironSyncHooks(h) { hooks = h || null; }
export function getQuironSyncHooks() { return hooks; }
