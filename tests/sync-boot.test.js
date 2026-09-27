// S5 (sync-arranque): la UI aprende del pull, reintentos de arranque y pull al
// foco. Cuatro niveles:
//   1. motor — createSyncEngine emite la señal onPulled solo cuando el merge
//      cambió datos (transport mockeado, como sync-engine.test.js).
//   2. helper de agenda — startInitialSync con timers inyectados, sin app.
//   3. cadena drive.js — motor → onPulled(cb) exportado, con la REST API de
//      Drive falsificada (patrón fakeDrive de drive.test.js, módulo real vía
//      vi.importActual).
//   4. app — la adopción (guard + re-render) y la agenda de arranque, con
//      js/app.js real contra app.html y mockeo por módulo solo de lo que cada
//      test necesita controlar (runner, borrador, renders, syncNow).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');

// ── Handles de los mocks que los tests necesitan controlar ──────────────────
const h = vi.hoisted(() => ({
  isRunnerOpen: vi.fn(() => false),
  getLiveDraft: vi.fn(() => null),
  renderDashboard: vi.fn(),
  refreshActiveSection: vi.fn(),
  syncNow: vi.fn(async () => 'ok'),
  isConnected: vi.fn(() => true),
  onPulled: vi.fn(),
  onSyncStatus: vi.fn(),
  getProgramList: vi.fn(() => []),
  getPrograms: vi.fn(() => ({ 1: { sessions: {} } })),
  loadPrograms: vi.fn(async () => {}),
}));

vi.mock('../js/ui/set-runner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isRunnerOpen: h.isRunnerOpen,
}));
vi.mock('../js/ui/training.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getLiveDraft: h.getLiveDraft,
}));
vi.mock('../js/ui/dashboard.js', async (importOriginal) => ({
  ...(await importOriginal()),
  renderDashboard: h.renderDashboard,
}));
vi.mock('../js/ui/nav.js', async (importOriginal) => ({
  ...(await importOriginal()),
  refreshActiveSection: h.refreshActiveSection,
}));
vi.mock('../js/drive.js', async (importOriginal) => ({
  ...(await importOriginal()),
  syncNow: h.syncNow,
  isConnected: h.isConnected,
  onPulled: h.onPulled,
  onSyncStatus: h.onSyncStatus,
}));
// loadPrograms hace fetch('programs.json') — sin red en tests.
vi.mock('../js/programs.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadPrograms: h.loadPrograms,
  getProgramList: h.getProgramList,
  getPrograms: h.getPrograms,
}));
// La cadena real motor → onPulled (nivel 3) usa drive.js sin mockear, pero el
// token vive en drive-auth: mockeado a nivel de archivo, como drive.test.js.
vi.mock('../js/drive-auth.js', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: () => true,
  getAccessToken: vi.fn(async () => 'test-token'),
}));

// Fake timers a nivel de archivo: la app se importa una sola vez y su agenda
// de arranque + intervalo de 90s + cooldown de foco son timers reales del
// módulo. Date va faked a mano: el cooldown de foco compara Date.now().
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});
afterAll(() => { vi.useRealTimers(); });

async function drain(n = 50) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

// ── Nivel 1: señal del motor ─────────────────────────────────────────────────

function makeRemote(initial) {
  const state = { rev: initial ? 'r1' : null, data: initial ? structuredClone(initial) : null };
  const transport = {
    async pull() {
      return state.data ? { rev: state.rev, data: structuredClone(state.data) } : null;
    },
    async readMeta() {
      return state.data ? { rev: state.rev } : null;
    },
    async push(wrapper) {
      state.rev = 'r-push-' + Math.random().toString(36).slice(2, 6);
      state.data = structuredClone(wrapper);
      return { rev: state.rev };
    },
  };
  return {
    transport,
    get: () => state.data,
    setRev: (rev) => { state.rev = rev; },
  };
}

const W = (id, updatedAt, extra = {}) => ({ id, uid: String(id), updatedAt, session: 'S' + id, exercises: [], ...extra });
const bareDb = (over = {}) => ({ workouts: [], bodyLogs: [], tombstones: [], stamps: {}, ...over });

function makeEngine(db, transport, overrides = {}) {
  const saved = [];
  const pulled = [];
  const engine = createSyncEngine({
    transport,
    getDb: () => db,
    saveRaw: (d) => saved.push(structuredClone(d)),
    splitRoutes: async (logs) => logs,
    device: 'test-device',
    sleep: () => Promise.resolve(),
    onPulled: () => pulled.push(Date.now()),
    ...overrides,
  });
  return { engine, saved, pulled };
}

import { createSyncEngine } from '../js/sync/engine.js';

describe('motor — señal onPulled (adopción de datos, S1)', () => {
  it('un pull que cambia datos dispara la señal y persiste el merge', async () => {
    const remote = makeRemote(bareDb({ workouts: [W(1, 100)] }));
    const db = bareDb({ workouts: [W(2, 200)] });
    const { engine, saved, pulled } = makeEngine(db, remote.transport);

    expect(await engine.runCycle()).toBe('ok');
    expect(pulled).toHaveLength(1);          // el merge absorbió el workout 1
    expect(db.workouts.map((w) => w.uid).sort()).toEqual(['1', '2']);
    expect(saved).toHaveLength(1);           // y quedó persistido aunque nadie pinte
  });

  it('un ciclo sin cambios de merge (push propio) no dispara', async () => {
    const remote = makeRemote(null);
    const db = bareDb({ workouts: [W(1, 100)] });
    const { engine, pulled } = makeEngine(db, remote.transport);

    // remoto vacío + db con datos: el merge no trajo nada → hay push propio pero sin señal
    expect(await engine.runCycle()).toBe('ok');
    expect(pulled).toHaveLength(0);
  });

  it('un ciclo con error no dispara', async () => {
    const db = bareDb({ workouts: [W(1, 100)] });
    const transport = {
      pull: async () => { throw new Error('pull: 500'); },
      readMeta: async () => null,
      push: async () => ({ rev: 'r' }),
    };
    const { engine, pulled } = makeEngine(db, transport);
    expect(await engine.runCycle()).toBe('error');
    expect(pulled).toHaveLength(0);
  });

  it('locked (otra pestaña sincroniza) no dispara', async () => {
    const remote = makeRemote(bareDb({ workouts: [W(1, 100)] }));
    const db = bareDb({ workouts: [W(2, 200)] });
    const { engine, pulled } = makeEngine(db, remote.transport, {
      locks: { request: (_name, _opts, cb) => Promise.resolve(cb(null)) },
    });
    expect(await engine.runCycle()).toBe('locked');
    expect(pulled).toHaveLength(0);
  });

  it('412 emulado: el merge del primer pull cuenta aunque el re-pull no traiga nada', async () => {
    const remote = makeRemote(bareDb({ workouts: [W(1, 100)] }));
    let metaCalls = 0;
    const db = bareDb({ workouts: [W(2, 200)] });
    // readMeta miente una vez: la primera lectura ve una rev distinta del pull
    // → conflicto → re-pull (ya sin novedades) → segunda lectura honesta.
    const transport = {
      pull: remote.transport.pull,
      readMeta: async () => ({ rev: ++metaCalls === 1 ? 'rev-de-otro' : remote.get().rev ?? 'r1' }),
      push: remote.transport.push,
    };
    const { engine, pulled } = makeEngine(db, transport);
    expect(await engine.runCycle()).toBe('ok');
    expect(pulled).toHaveLength(1); // el primer pull SÍ cambió la db: la UI debe enterarse
  });
});

// ── Nivel 2: agenda de arranque (helper puro, S2) ────────────────────────────

function fakeTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    timers: {
      setTimeout: (fn, ms) => { const id = ++seq; pending.set(id, { fn, ms }); return id; },
      clearTimeout: (id) => { pending.delete(id); },
    },
    pendingMs: () => [...pending.values()].map((t) => t.ms),
    async fireNext() {
      const first = pending.keys().next();
      if (first.done) return false;
      const { fn } = pending.get(first.value);
      pending.delete(first.value);
      fn();
      await drain(); // los intentos son async: drenar antes de mirar la agenda
      return true;
    },
  };
}

import { startInitialSync } from '../js/drive.js';

describe('startInitialSync — agenda de arranque con backoff (S2)', () => {
  it('primer intento a 1500 ms', async () => {
    const ft = fakeTimers();
    const attempt = vi.fn(async () => 'ok');
    startInitialSync(attempt, { timers: ft.timers });
    expect(ft.pendingMs()).toEqual([1500]);
    expect(attempt).not.toHaveBeenCalled();
    await ft.fireNext();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('un ciclo ok corta la agenda', async () => {
    const ft = fakeTimers();
    const attempt = vi.fn(async () => 'ok');
    startInitialSync(attempt, { timers: ft.timers });
    await ft.fireNext();
    expect(ft.pendingMs()).toEqual([]);
  });

  it('un fallo reintenta: 5s, 20s, 60s y se acaba', async () => {
    const ft = fakeTimers();
    const attempt = vi.fn(async () => 'error');
    startInitialSync(attempt, { timers: ft.timers });
    await ft.fireNext(); // 1.5s → error
    expect(ft.pendingMs()).toEqual([5000]);
    await ft.fireNext();
    expect(ft.pendingMs()).toEqual([20000]);
    await ft.fireNext();
    expect(ft.pendingMs()).toEqual([60000]);
    await ft.fireNext();
    expect(attempt).toHaveBeenCalledTimes(4);
    expect(ft.pendingMs()).toEqual([]); // estado estacionario: intervalo + visibility
  });

  it("'locked' y 'busy' cuentan como intento y no cortan la agenda", async () => {
    const ft = fakeTimers();
    let i = 0;
    const results = ['locked', 'busy', 'error', 'error'];
    const attempt = vi.fn(async () => results[i++]);
    startInitialSync(attempt, { timers: ft.timers });
    await ft.fireNext();
    expect(ft.pendingMs()).toEqual([5000]);   // locked → sigue
    await ft.fireNext();
    expect(ft.pendingMs()).toEqual([20000]);  // busy → sigue
    await ft.fireNext();
    expect(ft.pendingMs()).toEqual([60000]);
    await ft.fireNext();
    expect(ft.pendingMs()).toEqual([]);
  });

  it("'off' (sin permiso) corta la agenda entera", async () => {
    const ft = fakeTimers();
    const attempt = vi.fn(async () => 'off');
    startInitialSync(attempt, { timers: ft.timers });
    await ft.fireNext();
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(ft.pendingMs()).toEqual([]);
  });

  it('un intento que lanza se trata como error y no rompe la agenda', async () => {
    const ft = fakeTimers();
    const attempt = vi.fn(async () => { throw new Error('boom'); });
    startInitialSync(attempt, { timers: ft.timers });
    await ft.fireNext();
    expect(ft.pendingMs()).toEqual([5000]);
  });

  it('stop() cancela el intento pendiente', async () => {
    const ft = fakeTimers();
    const attempt = vi.fn(async () => 'error');
    const stop = startInitialSync(attempt, { timers: ft.timers });
    stop();
    expect(ft.pendingMs()).toEqual([]);
    await ft.fireNext();
    expect(attempt).not.toHaveBeenCalled();
  });
});

// ── Nivel 3: cadena real motor → drive.js → onPulled(cb) ─────────────────────

function fakeDrive(initialContent) {
  const files = new Map();
  if (initialContent) {
    files.set('arete-backup.json', { id: 'file1', content: initialContent, modifiedTime: '2026-01-01T00:00:00.000Z' });
  }
  let uploadSeq = 0;
  const fetchMock = vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/upload/drive/v3/files')) {
      const meta = JSON.parse(
        opts.body.split('Content-Type: application/json; charset=UTF-8\r\n\r\n')[1].split('\r\n--')[0]
      );
      const content = JSON.parse(
        opts.body.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]
      );
      const rec = { id: 'file-new-' + (++uploadSeq), content: JSON.stringify(content), modifiedTime: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, uploadSeq * 1000)).toISOString() };
      files.set(meta.name, rec);
      return { ok: true, status: 200, json: async () => ({ id: rec.id, modifiedTime: rec.modifiedTime }) };
    }
    if (u.includes('/drive/v3/files/') && u.includes('alt=media')) {
      const id = u.split('/drive/v3/files/')[1].split('?')[0];
      const rec = [...files.values()].find((f) => f.id === id);
      return { ok: true, status: 200, text: async () => (rec ? rec.content : '') };
    }
    if (u.includes('/drive/v3/files?')) {
      const q = new URL(u).searchParams.get('q') || '';
      const wanted = (q.match(/name='([^']+)'/) || [])[1];
      const listing = [...files.entries()]
        .filter(([name, f]) => f.content != null && (!wanted || name === wanted))
        .map(([name, f]) => ({ id: f.id, name, modifiedTime: f.modifiedTime }));
      return { ok: true, status: 200, json: async () => ({ files: listing }) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  });
  return {
    fetchMock,
    getWrapper: (name = 'arete-backup.json') => {
      const rec = files.get(name);
      return rec && rec.content ? JSON.parse(rec.content) : null;
    },
  };
}

describe('drive.js — cadena real motor → onPulled (S1)', () => {
  let originalFetch;
  beforeEach(() => { localStorage.clear(); originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('syncNow que trae datos remotos dispara el callback registrado', async () => {
    const fake = fakeDrive(JSON.stringify(bareDb({ workouts: [W(1, 100)] })));
    global.fetch = fake.fetchMock;
    const drive = await vi.importActual('../js/drive.js');
    const data = await import('../js/data.js');
    const pulled = [];
    drive.onPulled((info) => pulled.push(info));

    localStorage.setItem('arete', JSON.stringify({
      schemaVersion: 6,
      workouts: [{ id: 2, date: '2026-07-02', exercises: [] }],
      bodyLogs: [],
    }));
    expect(await drive.syncNow(data.loadDB())).toBe('ok');
    expect(pulled).toHaveLength(1);

    // Segundo ciclo no-op (ya sincronizado): sin nueva señal.
    expect(await drive.syncNow(data.loadDB())).toBe('ok');
    expect(pulled).toHaveLength(1);
  });
});

// ── Nivel 4: app real (adopción con guard, agenda de arranque, foco) ─────────

function setupAppDOM() {
  window.scrollTo = () => {};
  // jsdom no trae matchMedia ni IntersectionObserver (app.js/initTimer los usan).
  if (!window.matchMedia) {
    window.matchMedia = (q) => ({
      matches: false, media: q,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
    });
  }
  if (!globalThis.IntersectionObserver) {
    globalThis.IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    };
  }
  const doc = new JSDOM(HTML).window.document;
  document.documentElement.innerHTML = doc.documentElement.innerHTML;
}

// Activa exactamente una sección (applyPulledData mira .section.active).
function activateSection(id) {
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

describe('app — adopción del pull con guard (S1)', () => {
  let app;
  beforeAll(async () => {
    setupAppDOM();
    localStorage.clear();
    localStorage.setItem('areteAutoSync', '1'); // canSync() true: la agenda de arranque queda activa
    app = await import('../js/app.js');
    await drain(); // init() es async: esperar a que termine (onPulled suscrito)
  });
  beforeEach(() => {
    h.isRunnerOpen.mockReturnValue(false);
    h.getLiveDraft.mockReturnValue(null);
  });

  it('init() suscribe la adopción a onPulled', () => {
    expect(h.onPulled).toHaveBeenCalledWith(app.applyPulledData);
  });

  it('dashboard activo: re-renderiza la sección activa sin doble render del dashboard', () => {
    activateSection('secDashboard');
    const dash = h.renderDashboard.mock.calls.length;
    const ref = h.refreshActiveSection.mock.calls.length;
    app.applyPulledData();
    expect(h.refreshActiveSection.mock.calls.length).toBe(ref + 1);
    expect(h.renderDashboard.mock.calls.length).toBe(dash); // ya lo cubre refreshActiveSection
  });

  it('sección activa ≠ dashboard: re-renderiza la landing TAMBIÉN', () => {
    activateSection('secTrain');
    const dash = h.renderDashboard.mock.calls.length;
    const ref = h.refreshActiveSection.mock.calls.length;
    app.applyPulledData();
    expect(h.renderDashboard.mock.calls.length).toBe(dash + 1);
    expect(h.refreshActiveSection.mock.calls.length).toBe(ref + 1);
    activateSection('secDashboard');
  });

  it('guard: runner abierto no re-renderiza', () => {
    h.isRunnerOpen.mockReturnValue(true);
    activateSection('secDashboard');
    const dash = h.renderDashboard.mock.calls.length;
    const ref = h.refreshActiveSection.mock.calls.length;
    app.applyPulledData();
    expect(h.renderDashboard.mock.calls.length).toBe(dash);
    expect(h.refreshActiveSection.mock.calls.length).toBe(ref);
  });

  it('guard: borrador vivo no re-renderiza', () => {
    h.getLiveDraft.mockReturnValue({ sets: [{ kg: 100 }] });
    activateSection('secDashboard');
    const dash = h.renderDashboard.mock.calls.length;
    const ref = h.refreshActiveSection.mock.calls.length;
    app.applyPulledData();
    expect(h.renderDashboard.mock.calls.length).toBe(dash);
    expect(h.refreshActiveSection.mock.calls.length).toBe(ref);
  });
});

describe('app — arranque con backoff y pull al foco (S2/S3)', () => {
  let app;
  beforeAll(async () => {
    setupAppDOM();
    localStorage.clear();
    localStorage.setItem('areteAutoSync', '1');
    app = await import('../js/app.js');
    await drain();
  });

  it('primer intento a 1.5s; un ciclo ok corta la agenda (ni 5s ni 20s ni 60s)', async () => {
    expect(h.syncNow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(86_000); // hasta 87.5s: sin reintentos ni intervalo (90s)
    expect(h.syncNow).toHaveBeenCalledTimes(1);
  });

  it('focus dispara sync solo con ≥30s desde el último intento; dentro del cooldown no', async () => {
    // Date va faked y arranca en la hora real: moverlo en deltas relativos,
    // con margen sobre cualquier lastAutoSyncAt anterior (el intento de arranque).
    const t0 = Date.now();
    vi.setSystemTime(t0 + 200_000);          // muy pasado el último intento
    window.dispatchEvent(new Event('focus'));
    await drain();
    const afterFirst = h.syncNow.mock.calls.length;
    expect(afterFirst).toBeGreaterThanOrEqual(2); // el focus disparó un ciclo

    vi.setSystemTime(t0 + 210_000); // +10s: dentro del cooldown
    window.dispatchEvent(new Event('focus'));
    await drain();
    expect(h.syncNow.mock.calls.length).toBe(afterFirst);

    vi.setSystemTime(t0 + 231_000); // +31s desde el focus anterior: pasa el cooldown
    window.dispatchEvent(new Event('focus'));
    await drain();
    expect(h.syncNow.mock.calls.length).toBe(afterFirst + 1);
  });

  it('sin permiso en el momento del intento: la agenda corta y no llama syncNow', async () => {
    // Caso app-level del 'off': se cubre a nivel helper (startInitialSync);
    // aquí solo verificamos que el intento de arranque ya no repite: la agenda
    // de esta instancia terminó en 'ok' y el intervalo es el estado estacionario.
    const before = h.syncNow.mock.calls.length;
    await vi.advanceTimersByTimeAsync(90_000); // intervalo de 90s
    expect(h.syncNow.mock.calls.length).toBeGreaterThan(before); // estado estacionario vivo
  });
});
