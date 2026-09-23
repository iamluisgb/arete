// U3 — Quirón en sync (docs/SYNC-V2.md): la conversación viaja en su propio
// fichero de Drive (arete-quiron.json) con LWW POR MENSAJE, dentro del ciclo
// existente del motor. Regla de oro idéntica a la db: el merge es conmutativo
// e idempotente, probado con property tests sobre un PRNG con semilla fija.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { canonicalJson, stableStringify } from '../js/sync/merge.js';
import {
  backfillQuiron, mergeQuiron, isEmptyQuiron, setQuironSyncHooks, getQuironSyncHooks,
  QUIRON_FILE_FORMAT, QUIRON_FORMAT_VERSION, QUIRON_ARCHIVE_MAX,
} from '../js/sync/quiron.js';
import { createSyncEngine } from '../js/sync/engine.js';

// ── Generadores deterministas (mulberry32, como tests/sync-merge.test.js) ────

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Documento ya sellado (la forma que produce el motor tras el backfill).
function genQuironDoc(r) {
  const used = new Set();
  const convo = [];
  const n = Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    let uid;
    do { uid = 'm' + Math.floor(r() * 30); } while (used.has(uid));
    used.add(uid);
    const m = { uid, role: r() < 0.5 ? 'user' : 'assistant', content: 'c' + Math.floor(r() * 5) };
    if (r() < 0.85) m.ts = Math.floor(r() * 10);
    if (r() < 0.85) m.updatedAt = Math.floor(r() * 10);
    if (r() < 0.2) m.label = 'L' + Math.floor(r() * 3);
    convo.push(m);
  }
  const usedC = new Set();
  const archive = [];
  const nA = Math.floor(r() * 5);
  for (let i = 0; i < nA; i++) {
    let id;
    do { id = 'c' + Math.floor(r() * 20); } while (usedC.has(id));
    usedC.add(id);
    const e = { id, title: 'T' + Math.floor(r() * 5), messages: [] };
    if (r() < 0.85) e.updatedAt = Math.floor(r() * 10);
    if (r() < 0.5) e.ts = Math.floor(r() * 10);
    archive.push(e);
  }
  return { convo, archive };
}

// ── mergeQuiron: regla de oro ────────────────────────────────────────────────

describe('mergeQuiron — property tests', () => {
  it('es conmutativo e idempotente sobre documentos aleatorios', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const A = genQuironDoc(r);
      const B = genQuironDoc(r);
      const AB = mergeQuiron(A, B);
      const BA = mergeQuiron(B, A);
      expect(canonicalJson(AB)).toBe(canonicalJson(BA));
      expect(canonicalJson(mergeQuiron(A, A))).toBe(canonicalJson(backfillQuiron(A)));
    }
  });

  it('no muta sus entradas', () => {
    const A = { convo: [{ uid: 'm1', role: 'user', content: 'a', ts: 1, updatedAt: 1 }], archive: [] };
    const B = { convo: [{ uid: 'm1', role: 'user', content: 'a', ts: 1, updatedAt: 9 }, { uid: 'm2', role: 'assistant', content: 'b', ts: 2, updatedAt: 2 }], archive: [] };
    const snapA = stableStringify(A);
    const snapB = stableStringify(B);
    mergeQuiron(A, B);
    expect(stableStringify(A)).toBe(snapA);
    expect(stableStringify(B)).toBe(snapB);
  });

  it('tolera basura, null y documentos a medio hacer', () => {
    expect(mergeQuiron(null, undefined)).toEqual({ convo: [], archive: [] });
    expect(mergeQuiron([1, 2], { convo: 'no' })).toEqual({ convo: [], archive: [] });
    const partial = mergeQuiron({ convo: [{ role: 'user', content: 'x' }] }, {});
    expect(partial.convo).toHaveLength(1);
    expect(partial.convo[0].uid).toBeTruthy();
    expect(partial.archive).toEqual([]);
  });
});

describe('mergeQuiron — LWW por mensaje', () => {
  const M = (uid, content, updatedAt, ts = updatedAt, extra = {}) =>
    ({ uid, role: 'user', content, ts, updatedAt, ...extra });

  it('gana el updatedAt mayor, en las dos direcciones', () => {
    const A = { convo: [M('m1', 'vieja', 5)], archive: [] };
    const B = { convo: [M('m1', 'nueva', 9)], archive: [] };
    expect(mergeQuiron(A, B).convo[0].content).toBe('nueva');
    expect(mergeQuiron(B, A).convo[0].content).toBe('nueva');
  });

  it('empate exacto: el desempate por contenido es determinista', () => {
    const A = { convo: [M('m1', 'texto-a', 7)], archive: [] };
    const B = { convo: [M('m1', 'texto-b', 7)], archive: [] };
    const AB = mergeQuiron(A, B);
    const BA = mergeQuiron(B, A);
    expect(AB.convo[0].content).toBe(BA.convo[0].content);
  });

  it('unión: los mensajes que solo están en un lado sobreviven', () => {
    const A = { convo: [M('m1', 'de A', 1)], archive: [] };
    const B = { convo: [M('m2', 'de B', 2)], archive: [] };
    for (const m of mergeQuiron(A, B).convo) {
      expect(['de A', 'de B']).toContain(m.content);
    }
    expect(mergeQuiron(A, B).convo).toHaveLength(2);
  });

  it('un mensaje sin uid entra igualmente con su uid derivado del contenido', () => {
    // mergeQuiron rellena los sellos de sus entradas (el motor siempre los
    // rellena antes): el mensaje sin uid del remoto recibe un uid determinista
    // y se fusiona — dos dispositivos con el mismo mensaje legacy convergen.
    const A = { convo: [{ role: 'user', content: 'hola' }], archive: [] };
    const B = { convo: [{ role: 'user', content: 'hola' }], archive: [] };
    const merged = mergeQuiron(A, B);
    expect(merged.convo).toHaveLength(1);
    expect(merged.convo[0].uid).toMatch(/^q-/);
    expect(merged.convo[0].content).toBe('hola');
  });

  it('la conversación fusionada queda ordenada por (ts, uid) en los dos lados', () => {
    const A = { convo: [M('mb', 'b', 2, 2), M('ma', 'a', 1, 1)], archive: [] };
    const B = { convo: [M('mc', 'c', 3, 3)], archive: [] };
    const order = (d) => mergeQuiron(d, { convo: [], archive: [] }).convo.map((m) => m.uid);
    expect(order(A)).toEqual(['ma', 'mb']);
    expect(mergeQuiron(A, B).convo.map((m) => m.uid)).toEqual(['ma', 'mb', 'mc']);
    expect(mergeQuiron(B, A).convo.map((m) => m.uid)).toEqual(['ma', 'mb', 'mc']);
  });
});

// ── mergeQuiron: archivo ─────────────────────────────────────────────────────

describe('mergeQuiron — archivo de conversaciones', () => {
  const E = (id, updatedAt, title = id) => ({ id, title, ts: updatedAt, updatedAt, messages: [] });

  it('LWW por conversación: la entrada más nueva gana', () => {
    const A = { convo: [], archive: [E('c1', 5, 'viejo título')] };
    const B = { convo: [], archive: [E('c1', 9, 'título nuevo')] };
    expect(mergeQuiron(A, B).archive[0].title).toBe('título nuevo');
    expect(mergeQuiron(B, A).archive[0].title).toBe('título nuevo');
  });

  it('dos dispositivos que archivan la MISMA conversación convergen en una entrada', () => {
    // Ambos archivan los mismos mensajes (mismos uids) con ts distinto: el id
    // se deriva del contenido, así que LWW los funde en una sola entrada.
    const msgs = [
      { uid: 'm1', role: 'user', content: 'hola', ts: 1, updatedAt: 1 },
      { uid: 'm2', role: 'assistant', content: 'qué tal', ts: 2, updatedAt: 2 },
    ];
    const A = { convo: [], archive: [{ ts: 100, title: 'X', messages: msgs }] };
    const B = { convo: [], archive: [{ ts: 200, title: 'X', messages: msgs }] };
    const merged = mergeQuiron(A, B);
    expect(merged.archive).toHaveLength(1);
    expect(merged.archive[0].id).toBeTruthy();
    expect(merged.archive[0].updatedAt).toBe(200); // LWW por la entrada archivada
  });

  it('tras el merge se re-aplica el tope FIFO de 15 por updatedAt', () => {
    const many = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => E('c' + (from + i), from + i));
    const A = { convo: [], archive: many(1, 10) };
    const B = { convo: [], archive: many(11, 20) }; // 20 entradas en total
    const merged = mergeQuiron(A, B);
    expect(merged.archive).toHaveLength(QUIRON_ARCHIVE_MAX);
    // Sobreviven las 15 más recientemente actualizadas; las 5 más viejas caen.
    const ids = merged.archive.map((e) => e.id);
    expect(ids).not.toContain('c1');
    expect(ids).not.toContain('c5');
    expect(ids).toContain('c6');
    expect(ids).toContain('c20');
  });

  it('el orden del archivo fusionado es determinista (updatedAt desc, empate por id)', () => {
    const A = { convo: [], archive: [E('c1', 9), E('c9', 9)] }; // empate de updatedAt
    const B = { convo: [], archive: [] };
    const AB = mergeQuiron(A, B);
    const BA = mergeQuiron(B, A);
    expect(AB.archive.map((e) => e.id)).toEqual(['c1', 'c9']); // desempate: id asc
    expect(BA.archive.map((e) => e.id)).toEqual(['c1', 'c9']);
  });
});

// ── backfillQuiron: legado determinista ──────────────────────────────────────

describe('backfillQuiron — legado sin Date.now()', () => {
  const legacy = {
    convo: [
      { role: 'user', content: '¿Qué toca hoy?' },
      { role: 'assistant', content: 'Sentadilla 3×5.' },
      { role: 'user', content: '¿Qué toca hoy?' },           // texto duplicado
      { role: 'data', content: '[get_workouts()]\n...' },
    ],
    archive: [{ ts: 1750000000000, title: 'vieja', messages: [{ role: 'user', content: 'hola' }] }],
  };

  it('dos backfills independientes producen uids y orden idénticos', () => {
    const a = backfillQuiron(structuredClone(legacy));
    const b = backfillQuiron(structuredClone(legacy));
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('los textos duplicados reciben uids DISTINTOS y deterministas', () => {
    const { convo } = backfillQuiron(legacy);
    const uids = convo.map((m) => m.uid);
    expect(new Set(uids).size).toBe(uids.length);
    // Y el mismo mensaje con role distinto no colisiona.
    const withRole = backfillQuiron({ convo: [
      { role: 'user', content: 'x' }, { role: 'assistant', content: 'x' },
    ] });
    expect(withRole.convo[0].uid).not.toBe(withRole.convo[1].uid);
  });

  it('el legado no fabrica tiempo: ts=0 y updatedAt=0', () => {
    const { convo } = backfillQuiron(legacy);
    for (const m of convo) {
      expect(m.ts).toBe(0);
      expect(m.updatedAt).toBe(0);
    }
  });

  it('es idempotente y no muta la entrada', () => {
    const snap = stableStringify(legacy);
    const once = backfillQuiron(legacy);
    const twice = backfillQuiron(once);
    expect(stableStringify(twice)).toBe(stableStringify(once));
    expect(stableStringify(legacy)).toBe(snap);
  });

  it('los mensajes ya sellados pasan intactos', () => {
    const stamped = { uid: 'u1', role: 'user', content: 'a', ts: 5, updatedAt: 5 };
    const out = backfillQuiron({ convo: [stamped], archive: [] });
    expect(out.convo[0]).toBe(stamped); // misma referencia, nada reescrito
  });

  it('las entradas del archivo reciben id y updatedAt (del ts guardado)', () => {
    const { archive } = backfillQuiron(legacy);
    expect(archive[0].id).toBeTruthy();
    expect(archive[0].updatedAt).toBe(1750000000000);
    // ...y el mensaje interno del archivo también queda sellado.
    expect(archive[0].messages[0].uid).toBeTruthy();
  });

  it('isEmptyQuiron: solo un documento vacío de verdad lo es', () => {
    expect(isEmptyQuiron({ convo: [], archive: [] })).toBe(true);
    expect(isEmptyQuiron(null)).toBe(true);
    expect(isEmptyQuiron({ convo: [{ role: 'user', content: 'x' }], archive: [] })).toBe(false);
  });
});

// ── Motor: la fase Quirón dentro del ciclo ───────────────────────────────────

// Mock del transporte de la db (como tests/sync-engine.test.js).
function makeDbRemote(initial) {
  const state = { rev: initial ? 'r1' : null, data: initial ? structuredClone(initial) : null };
  const calls = { pull: 0, readMeta: 0, push: 0 };
  const transport = {
    async pull() { calls.pull++; return state.data ? { rev: state.rev, data: structuredClone(state.data) } : null; },
    async readMeta() { calls.readMeta++; return state.data ? { rev: state.rev } : null; },
    async push(w) {
      calls.push++;
      state.rev = 'r' + (calls.push + 1) + Math.random().toString(36).slice(2, 5);
      state.data = structuredClone(w);
      return { rev: state.rev };
    },
  };
  return { transport, calls, get: () => state.data };
}

// Mock del fichero remoto arete-quiron.json (el "Drive" de la fase Quirón).
// El transporte devuelve el WRAPPER completo (format/formatVersion/data), igual
// que createQuironTransport en js/drive.js; set() envuelve, setRaw() no.
function makeQFile(initial) {
  const wrap = (d) => ({ format: QUIRON_FILE_FORMAT, formatVersion: QUIRON_FORMAT_VERSION, savedAt: 0, device: 'remote', data: d });
  const state = { rev: initial ? 'q1' : null, data: initial ? wrap(initial) : null };
  const calls = { pull: 0, readMeta: 0, push: 0 };
  const transport = {
    async pull() { calls.pull++; return state.data ? { rev: state.rev, data: structuredClone(state.data) } : null; },
    async readMeta() { calls.readMeta++; return state.data ? { rev: state.rev } : null; },
    async push(w) {
      calls.push++;
      state.rev = 'q' + (calls.push + 1) + Math.random().toString(36).slice(2, 5);
      state.data = structuredClone(w);
      return { rev: state.rev };
    },
  };
  return {
    transport, calls,
    get: () => state.data,
    set: (d) => { state.data = wrap(d); state.rev = 'q-set'; },
    setRaw: (d) => { state.data = d; state.rev = 'q-set'; },
  };
}

// Estado local de un dispositivo (los hooks que registraría js/ui/quiron.js).
function makeQLocal(initial) {
  const local = { data: structuredClone(initial || { convo: [], archive: [] }) };
  const saved = [];
  return {
    hooks: {
      get: () => structuredClone(local.data),
      save: (d) => { saved.push(structuredClone(d)); local.data = structuredClone(d); },
    },
    saved,
    local,
  };
}

const M = (uid, content, ts) => ({ uid, role: 'user', content, ts, updatedAt: ts });
const bareDb = (over = {}) => ({ workouts: [], bodyLogs: [], tombstones: [], stamps: {}, ...over });

function makeEngine(db, dbRemote, qLocal, qFile, overrides = {}) {
  return createSyncEngine({
    transport: dbRemote.transport,
    getDb: () => db,
    saveRaw: () => {},
    splitRoutes: async (logs) => logs,
    device: 'test-device',
    sleep: () => Promise.resolve(),
    random: () => 0,
    quiron: { transport: qFile.transport, get: qLocal.hooks.get, save: qLocal.hooks.save },
    ...overrides,
  });
}

describe('motor — fase Quirón', () => {
  it('escenario A/B: cada dispositivo ve la conversación fusionada completa y en el mismo orden', async () => {
    const qFile = makeQFile(null);
    const dbRemote = makeDbRemote(null);

    // Dispositivo A chatea (2 mensajes) y sincroniza.
    const aLocal = makeQLocal({ convo: [M('a1', '¿qué toca?', 1000), M('a2', 'sentadilla', 1001)], archive: [] });
    const dbA = bareDb({ workouts: [{ id: 1, uid: '1', updatedAt: 1 }] });
    const eA = makeEngine(dbA, dbRemote, aLocal, qFile);
    expect(await eA.runCycle()).toBe('ok');
    expect(qFile.calls.push).toBe(1);
    const wrapper = qFile.get();
    expect(wrapper.format).toBe(QUIRON_FILE_FORMAT);
    expect(wrapper.formatVersion).toBe(QUIRON_FORMAT_VERSION);
    expect(wrapper.device).toBe('test-device');
    expect(wrapper.data.convo.map((m) => m.uid)).toEqual(['a1', 'a2']);

    // Dispositivo B, con su propio mensaje, sincroniza contra lo mismo.
    const bLocal = makeQLocal({ convo: [M('b1', 'peso muerto', 1002)], archive: [] });
    const dbB = bareDb({ workouts: [{ id: 2, uid: '2', updatedAt: 2 }] });
    const eB = makeEngine(dbB, dbRemote, bLocal, qFile);
    expect(await eB.runCycle()).toBe('ok');

    // La conversación de B contiene AMBOS lados, ordenada por (ts, uid)…
    expect(bLocal.local.data.convo.map((m) => m.uid)).toEqual(['a1', 'a2', 'b1']);
    // …y el fichero remoto también (mismo orden en los dos dispositivos).
    expect(qFile.get().data.convo.map((m) => m.uid)).toEqual(['a1', 'a2', 'b1']);
    // La db de B absorbió el entreno de A igualmente: el ciclo db no se toca.
    expect(dbB.workouts.map((w) => w.uid).sort()).toEqual(['1', '2']);

    // El ciclo siguiente de B es un no-op: nada vuelve a subirse.
    qFile.calls.push = 0;
    dbRemote.calls.push = 0;
    expect(await eB.runCycle()).toBe('ok');
    expect(qFile.calls.push).toBe(0);
    expect(dbRemote.calls.push).toBe(0);
  });

  it('la fase Quirón corre aunque la db sea un no-op (el chat cambia sin tocar la db)', async () => {
    const doc = bareDb({ workouts: [{ id: 1, uid: '1', updatedAt: 1 }] });
    const dbRemote = makeDbRemote(doc);
    const qFile = makeQFile(null);
    const qLocal = makeQLocal({ convo: [M('m1', 'nuevo mensaje', 500)], archive: [] });
    const db = structuredClone(doc);
    const engine = makeEngine(db, dbRemote, qLocal, qFile);

    expect(await engine.runCycle()).toBe('ok');
    expect(dbRemote.calls.push).toBe(0);       // db sin cambios → sin subida
    expect(qFile.calls.push).toBe(1);          // …pero el chat sí se subió
  });

  it('backfill legacy a través del motor: los mensajes viejos salen con uid derivado y ts=0', async () => {
    const dbRemote = makeDbRemote(null);
    const qFile = makeQFile(null);
    const qLocal = makeQLocal({ convo: [{ role: 'user', content: 'hola' }], archive: [] });
    const engine = makeEngine(bareDb(), dbRemote, qLocal, qFile);

    expect(await engine.runCycle()).toBe('ok');

    const pushed = qFile.get().data;
    expect(pushed.convo[0].uid).toMatch(/^q-/);
    expect(pushed.convo[0].ts).toBe(0);
  });

  it('conflicto 412 en el fichero de Quirón: reintenta con backoff y converge', async () => {
    const dbRemote = makeDbRemote(null);
    const qFile = makeQFile({ convo: [M('r1', 'remoto', 100)], archive: [] });
    const qLocal = makeQLocal({ convo: [M('l1', 'local', 200)], archive: [] });
    // El remoto "cambia" justo después del primer pull de la fase Quirón.
    let firstPull = true;
    const origPull = qFile.transport.pull;
    qFile.transport.pull = async (...args) => {
      const r = await origPull(...args);
      if (firstPull) { firstPull = false; qFile.set({ convo: [M('r2', 'otro remoto', 150)], archive: [] }); }
      return r;
    };
    const sleeps = [];
    const engine = makeEngine(bareDb(), dbRemote, qLocal, qFile, { sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });

    expect(await engine.runCycle()).toBe('ok');
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(300); // mismo backoff que la db
    const uids = qLocal.local.data.convo.map((m) => m.uid).sort();
    expect(uids).toEqual(['l1', 'r1', 'r2']);
  });

  it('un fallo de Quirón NO tira el ciclo de la db: diag separado', async () => {
    const dbRemote = makeDbRemote(null);
    const qFile = makeQFile(null);
    qFile.transport.pull = async () => { throw new Error('drive down'); };
    const qLocal = makeQLocal(null);
    const db = bareDb({ workouts: [{ id: 1, uid: '1', updatedAt: 1 }] });
    const engine = makeEngine(db, dbRemote, qLocal, qFile);

    expect(await engine.runCycle()).toBe('ok'); // el ciclo db sale bien
    expect(dbRemote.calls.push).toBe(1);        // y sube la db igualmente

    const diag = engine.getDiag();
    expect(diag.lastResult).toBe('ok');
    expect(diag.consecutiveFailures).toBe(0);                    // la db no se degrada
    expect(diag.quiron.lastResult).toBe('error');                // Quirón sí
    expect(diag.quiron.lastError).toBe('drive down');
    expect(diag.quiron.consecutiveFailures).toBe(1);
    // …y el historial del ciclo menciona quiron en el detail.
    expect(diag.history[0].detail).toContain('quiron:drive down');
  });

  it('un fichero remoto de Quirón corrupto se rechaza sin sobrescribir nada', async () => {
    const dbRemote = makeDbRemote(null);
    const qFile = makeQFile(null);
    qFile.setRaw([1, 2, 3]); // basura en Drive
    qFile.calls.push = 0;
    const qLocal = makeQLocal(null);
    const db = bareDb({ workouts: [{ id: 1, uid: '1', updatedAt: 1 }] });
    const engine = makeEngine(db, dbRemote, qLocal, qFile);

    expect(await engine.runCycle()).toBe('ok'); // la db sigue bien
    expect(dbRemote.calls.push).toBe(1);
    expect(qFile.calls.push).toBe(0);           // nunca pisa el fichero corrupto
    expect(engine.getDiag().quiron.lastError).toContain('corrupt');
  });

  it('sin datos locales ni fichero remoto, no siembra un fichero vacío', async () => {
    const dbRemote = makeDbRemote(null);
    const qFile = makeQFile(null);
    const qLocal = makeQLocal(null);
    const engine = makeEngine(bareDb(), dbRemote, qLocal, qFile);
    expect(await engine.runCycle()).toBe('ok');
    expect(qFile.calls.push).toBe(0);
  });

  it('sin hooks registrados la fase Quirón no toca la red', async () => {
    const dbRemote = makeDbRemote(null);
    const qFile = makeQFile(null);
    const noHooks = { hooks: { get: () => undefined, save: () => {} } }; // drive.js sin registro
    const engine = makeEngine(bareDb(), dbRemote, noHooks, qFile);
    expect(await engine.runCycle()).toBe('ok');
    expect(qFile.calls.pull).toBe(0);
    expect(engine.getDiag().quiron).toEqual({ lastResult: null, lastError: null, consecutiveFailures: 0 });
  });
});

// ── UI: los hooks de js/ui/quiron.js ─────────────────────────────────────────

const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');

function setupDOM() {
  window.scrollTo = () => {};
  const doc = new JSDOM(HTML).window.document;
  document.body.innerHTML = '';
  for (const id of ['setQuiron', 'quironPanel', 'quironHistoryModal']) {
    document.body.appendChild(doc.getElementById(id).cloneNode(true));
  }
  document.body.insertAdjacentHTML('beforeend',
    '<button id="navQuiron"></button><span id="setQuironStatus"></span>');
}

const uiDB = () => ({
  workouts: [], bodyLogs: [], runningLogs: [], domainTests: [],
  customSessions: [], customPrograms: [], deletedIds: [], settings: {}, program: 'arete', phase: 1,
});

describe('ui/quiron.js — hooks de sync', () => {
  beforeEach(() => { localStorage.clear(); });

  async function cargar(legadoConvo = null) {
    vi.resetModules();
    setupDOM();
    if (legadoConvo) localStorage.setItem('areteQuiron', JSON.stringify(legadoConvo));
    const [{ initQuiron }, syncQuiron] = await Promise.all([
      import('../js/ui/quiron.js'),
      import('../js/sync/quiron.js'),
    ]);
    initQuiron(uiDB());
    // El módulo hay que leerlo TRAS resetModules: el import estático de arriba
    // apunta a otra instancia del registro y sus hooks serían null.
    return syncQuiron;
  }

  it('initQuiron registra los hooks y get() expone la conversación viva', async () => {
    const { getQuironSyncHooks } = await cargar([{ role: 'user', content: 'hola' }]);
    const hooks = getQuironSyncHooks();
    expect(hooks).toBeTruthy();
    const state = hooks.get();
    expect(state.convo).toEqual([{ role: 'user', content: 'hola' }]);
    expect(state.archive).toEqual([]);
  });

  it('save() aplica la conversación fusionada: persiste, repinta y avisa con un evento', async () => {
    const { getQuironSyncHooks } = await cargar([{ role: 'user', content: 'viejo' }]);
    const events = [];
    window.addEventListener('arete-quiron-updated', () => events.push(1));

    const remoteMsg = { uid: 'r1', role: 'assistant', content: 'remoto', ts: 9, updatedAt: 9 };
    getQuironSyncHooks().save({ convo: [remoteMsg], archive: [] });

    const stored = JSON.parse(localStorage.getItem('areteQuiron'));
    expect(stored).toEqual([remoteMsg]);
    expect(events).toHaveLength(1);
    // La burbuja remota está pintada (renderConvo corrió).
    expect(document.getElementById('quironMsgs').innerHTML).toContain('remoto');
  });

  it('save() también aplica el archivo fusionado', async () => {
    const { getQuironSyncHooks } = await cargar();
    const entry = { id: 'c1', ts: 5, title: 't', updatedAt: 5, messages: [] };
    getQuironSyncHooks().save({ convo: [], archive: [entry] });
    expect(JSON.parse(localStorage.getItem('areteQuironArchive'))).toEqual([entry]);
  });

  it('save() sustituye la conversación viva: el siguiente ciclo del motor la ve', async () => {
    const { getQuironSyncHooks } = await cargar([{ role: 'user', content: 'viejo' }]);
    const fresh = { uid: 'x1', role: 'user', content: 'con sello', ts: 1, updatedAt: 1 };
    getQuironSyncHooks().save({ convo: [fresh], archive: [] });
    // hooks.get() ya devuelve la conversación sustituida (es el estado que el
    // motor lee al fusionar en el ciclo siguiente).
    expect(getQuironSyncHooks().get().convo).toEqual([fresh]);
  });
});
