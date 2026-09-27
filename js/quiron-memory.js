// Quirón durable memory (D1/D2/D4 — odd/tasks/quiron-memoria.md): the chat
// forgets everything older than the 8-message window, so durable knowledge the
// athlete shares (schedules, pain, preferences, decisions, goals) gets its own
// small store. Entries live INSIDE the Quirón sync payload (arete-quiron.json,
// slot `memorias`) — same change rhythm as the chat, same merge contract
// (js/sync/quiron.js).
//
// Entry shape: { uid, categoria, texto, ts, updatedAt, deleted, source }.
//   - `deleted` is a FLAG, never a physical removal while under the total cap:
//     deletes propagate between devices through LWW (unlike the chat, where a
//     delete is a local convenience). Readers filter `deleted` out.
//   - Caps: MAX_MEMORIAS active entries are visible to the model/UI; a create
//     past the limit demotes the oldest active entries (by updatedAt) with real
//     delete semantics so the removal syncs. MAX_MEMORIAS_TOTAL is the physical
//     cap (including deleted), applied only at upsert boundaries — reads never
//     rewrite the store.
//
// Short ids ([M1]..[Mn]) are POSITIONAL over the active list ordered by ts:
// stable while the list does not change, deterministic on every device, and
// never persisted — the stored identity is always `uid`.
//
// Storage follows the ARCHIVE_KEY pattern (own localStorage key, silent on a
// full quota — convenience data), NOT the full chat key: the sync payload is
// assembled by js/ui/quiron.js from the live pieces, so persistence never has
// to rewrite the conversation to touch a memory.

const MEMORIAS_KEY = 'areteQuironMemorias';

export const MAX_MEMORIAS = 50;        // activas visibles
export const MAX_MEMORIAS_TOTAL = 200; // totales (incluye deleted), FIFO por updatedAt
export const CATEGORIAS = ['horario', 'dolor', 'preferencia', 'decision', 'objetivo', 'otro'];

export { MEMORIAS_KEY };

function now() { return Date.now(); }

// Same pattern as newMsgStamp in js/ui/quiron.js: global identity with a
// Math.random fallback for environments without crypto.randomUUID.
function newUid() {
  const ts = now();
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'q-' + ts.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ── Normalization ────────────────────────────────────────────────────────────
// Callers pass either the memorias array itself or the whole chat payload
// ({convo, archive, memorias}). A missing slot is lazy-initialized IN PLACE on
// a payload object (init) or simply read as empty (list). Non-objects yield a
// detached empty array — safe, but nothing persists through them.
function memoriasOf(payload, { init = false } = {}) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (!Array.isArray(payload.memorias)) {
      if (!init) return [];
      payload.memorias = [];
    }
    return payload.memorias;
  }
  return [];
}

// Deterministic ordering helper: updatedAt desc, ties by uid asc.
function byUpdatedDesc(a, b) {
  const d = (b.updatedAt || 0) - (a.updatedAt || 0);
  if (d) return d;
  return String(a.uid || '') < String(b.uid || '') ? -1 : String(a.uid || '') > String(b.uid || '') ? 1 : 0;
}

// ── Storage (localStorage, own key) ──────────────────────────────────────────

export function loadMemorias() {
  try {
    const m = JSON.parse(localStorage.getItem(MEMORIAS_KEY));
    return Array.isArray(m) ? m.filter((e) => e && typeof e === 'object') : [];
  } catch { return []; }
}

export function saveMemorias(list) {
  try {
    localStorage.setItem(MEMORIAS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch { /* quota llena — misma tolerancia silenciosa que el archivo */ }
}

// ── Read model ───────────────────────────────────────────────────────────────

/**
 * Active (non-deleted) memories, oldest first (ts asc, ties by uid), each a
 * SHALLOW COPY carrying its positional `shortId` ('M1'..). Pure: never mutates
 * the payload, never persists.
 */
export function listMemorias(payload) {
  return memoriasOf(payload)
    .filter((m) => m && !m.deleted)
    .sort((a, b) => ((a.ts || 0) - (b.ts || 0)) ||
      (String(a.uid || '') < String(b.uid || '') ? -1 : String(a.uid || '') > String(b.uid || '') ? 1 : 0))
    .map((m, i) => ({ ...m, shortId: 'M' + (i + 1) }));
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Create (id=null) or replace (id) a memory. Validates `texto` (non-empty
 * after trim → else null) and `categoria` (closed set → fallback 'otro').
 * Replaces only resolve to an EXISTING uid — an unknown id is null, never a
 * silent duplicate. A create past MAX_MEMORIAS demotes the oldest active
 * entries to deleted (real delete semantics, so the demotion syncs), and every
 * write re-applies the MAX_MEMORIAS_TOTAL FIFO. Mutates the payload in place
 * (lazy-initializing the `memorias` slot) and returns the entry, or null.
 */
export function upsertMemoria(payload, { id = null, categoria = 'otro', texto = '', source = 'user' } = {}) {
  const list = memoriasOf(payload, { init: true });
  const text = typeof texto === 'string' ? texto.trim() : '';
  if (!text) return null;
  const cat = CATEGORIAS.includes(categoria) ? categoria : 'otro';

  let entry = null;
  if (id != null) {
    entry = list.find((m) => m && m.uid === id) || null;
    if (!entry) return null;
    entry.categoria = cat;
    entry.texto = text;
    entry.updatedAt = now();
  } else {
    const ts = now();
    entry = { uid: newUid(), categoria: cat, texto: text, ts, updatedAt: ts, deleted: false, source };
    list.push(entry);
  }

  enforceActiveCap(list);
  compactMemorias(list);
  return entry;
}

// Active cap: demote with delete semantics (deleted:true + updatedAt=now) so
// the removal propagates between devices instead of resurrecting on merge.
function enforceActiveCap(list) {
  const active = list.filter((m) => m && !m.deleted);
  if (active.length <= MAX_MEMORIAS) return;
  for (const m of active.sort(byUpdatedDesc).slice(MAX_MEMORIAS)) {
    m.deleted = true;
    m.updatedAt = now();
  }
}

/**
 * Soft-delete by uid: `deleted:true` + updatedAt=now, entry stays in the array
 * (physical removal is compact's job, FIFO at the total cap). Returns the
 * entry, or null when the uid is unknown. Never physically deletes.
 */
export function deleteMemoria(payload, id) {
  if (id == null) return null;
  const list = memoriasOf(payload, { init: true });
  const entry = list.find((m) => m && m.uid === id) || null;
  if (!entry) return null;
  entry.deleted = true;
  entry.updatedAt = now();
  return entry;
}

/**
 * FIFO trim to MAX_MEMORIAS_TOTAL over ALL entries (deleted included): the
 * most recently updated survive, ties by uid. Mutates the payload in place.
 * Called only from upsert boundaries — reads and merges never compact.
 */
export function compactMemorias(payload) {
  const list = memoriasOf(payload, { init: true });
  if (list.length <= MAX_MEMORIAS_TOTAL) return list;
  const survivors = [...list].sort(byUpdatedDesc).slice(0, MAX_MEMORIAS_TOTAL);
  const keep = new Set(survivors);
  list.splice(0, list.length, ...list.filter((m) => keep.has(m)));
  return list;
}
