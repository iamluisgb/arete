// W1a — capa de datos de la memoria duradera de Quirón (js/quiron-memory.js).
// Crear/reemplazar, validación, tope 50 activas con FIFO, borrado blando,
// orden + shortIds deterministas, compact a 200, payload lazy-init y storage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MAX_MEMORIAS, MAX_MEMORIAS_TOTAL, CATEGORIAS, MEMORIAS_KEY,
  listMemorias, upsertMemoria, deleteMemoria, compactMemorias,
  loadMemorias, saveMemorias,
} from '../js/quiron-memory.js';
import { makeToolExecutor, QUIRON_MEMORY_TOOLS, MEMORY_TOOL_NAMES } from '../js/ai/tools.js';

// Reloj controlado: los sellos (ts/updatedAt) salen de Date.now(), y el FIFO
// depende de su orden relativo.
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => { vi.useRealTimers(); });

// Entrada ya sellada, como las que produce upsertMemoria (para pruebas de
// orden, caps y compact sin pasar por el reloj).
const mk = (uid, texto, updatedAt, over = {}) =>
  ({ uid, categoria: 'otro', texto, ts: updatedAt, updatedAt, deleted: false, source: 'user', ...over });

describe('upsertMemoria — crear', () => {
  it('crea una entrada sellada (uid, ts, updatedAt, deleted:false, source)', () => {
    const arr = [];
    const e = upsertMemoria(arr, { categoria: 'dolor', texto: 'Molesta la rodilla al sentadilla' });
    expect(arr).toHaveLength(1);
    expect(e.uid).toBeTruthy();
    expect(e.categoria).toBe('dolor');
    expect(e.texto).toBe('Molesta la rodilla al sentadilla');
    expect(e.ts).toBe(1000);
    expect(e.updatedAt).toBe(1000);
    expect(e.deleted).toBe(false);
    expect(e.source).toBe('user');
  });

  it('categoria fuera del set cerrado cae a "otro"', () => {
    expect(CATEGORIAS).toContain('otro');
    const e1 = upsertMemoria([], { categoria: 'inventada', texto: 'x' });
    const e2 = upsertMemoria([], { categoria: 42, texto: 'x' });
    const e3 = upsertMemoria([], { texto: 'x' }); // ausente
    expect(e1.categoria).toBe('otro');
    expect(e2.categoria).toBe('otro');
    expect(e3.categoria).toBe('otro');
  });

  it('texto vacío o solo espacios devuelve null y no agrega nada', () => {
    const arr = [];
    expect(upsertMemoria(arr, { texto: '' })).toBe(null);
    expect(upsertMemoria(arr, { texto: '   ' })).toBe(null);
    expect(upsertMemoria(arr, { texto: 5 })).toBe(null);
    expect(upsertMemoria(arr, {})).toBe(null);
    expect(arr).toHaveLength(0);
  });

  it('recorta los espacios del texto', () => {
    const e = upsertMemoria([], { texto: '  prefiere entrenar a las 7  ' });
    expect(e.texto).toBe('prefiere entrenar a las 7');
  });

  it('lazy-init: agrega el slot memorias a un payload del chat que no lo tiene', () => {
    const doc = { convo: [{ role: 'user', content: 'hola' }], archive: [] };
    upsertMemoria(doc, { texto: 'decisión: bajar volumen' });
    expect(Array.isArray(doc.memorias)).toBe(true);
    expect(doc.memorias).toHaveLength(1);
    expect(doc.convo).toHaveLength(1); // el resto del payload no se toca
    expect(doc.archive).toEqual([]);
  });
});

describe('upsertMemoria — reemplazar por id', () => {
  it('reemplaza el texto/categoría de la entrada existente, sin duplicar', () => {
    const arr = [];
    const a = upsertMemoria(arr, { categoria: 'horario', texto: 'entrena a las 7' });
    vi.advanceTimersByTime(10);
    const b = upsertMemoria(arr, { id: a.uid, categoria: 'objetivo', texto: 'entrena a las 6' });
    expect(arr).toHaveLength(1);
    expect(b.uid).toBe(a.uid);
    expect(b.texto).toBe('entrena a las 6');
    expect(b.categoria).toBe('objetivo');
    expect(b.updatedAt).toBe(1010); // re-sellado: LWW lo propaga
    expect(b.ts).toBe(1000);        // ts original se conserva
  });

  it('un id desconocido devuelve null (nunca crea un duplicado)', () => {
    const arr = [mk('u1', 'existente', 5)];
    expect(upsertMemoria(arr, { id: 'no-existe', texto: 'x' })).toBe(null);
    expect(arr).toHaveLength(1);
    expect(arr[0].texto).toBe('existente');
  });

  it('reemplazo con texto vacío devuelve null y deja la entrada intacta', () => {
    const arr = [];
    const a = upsertMemoria(arr, { texto: 'original' });
    expect(upsertMemoria(arr, { id: a.uid, texto: '  ' })).toBe(null);
    expect(arr).toHaveLength(1);
    expect(arr[0].texto).toBe('original');
  });
});

describe('tope de MAX_MEMORIAS activas (50, FIFO por updatedAt)', () => {
  it('la creación 51 demarca como deleted las activas más viejas', () => {
    const arr = [];
    const creadas = [];
    for (let i = 0; i < MAX_MEMORIAS + 1; i++) {
      vi.advanceTimersByTime(1);
      creadas.push(upsertMemoria(arr, { texto: 'm' + i }));
    }
    expect(arr).toHaveLength(MAX_MEMORIAS + 1);   // el borrado es blando
    const activas = listMemorias(arr);
    expect(activas).toHaveLength(MAX_MEMORIAS);
    // La más vieja por updatedAt cae primero; la nueva queda.
    expect(creadas[0].deleted).toBe(true);
    expect(activas.map((m) => m.texto)).not.toContain('m0');
    expect(activas.map((m) => m.texto)).toContain('m50');
  });

  it('sigue en 50 activas tras más creaciones, y nunca borra físicamente', () => {
    const arr = [];
    for (let i = 0; i < MAX_MEMORIAS + 10; i++) {
      vi.advanceTimersByTime(1);
      upsertMemoria(arr, { texto: 'm' + i });
    }
    expect(listMemorias(arr)).toHaveLength(MAX_MEMORIAS);
    expect(arr).toHaveLength(MAX_MEMORIAS + 10);
  });

  it('un reemplazo NO demarca: no crece la lista activa', () => {
    const arr = [];
    const a = upsertMemoria(arr, { texto: 'a' });
    for (let i = 0; i < MAX_MEMORIAS - 1; i++) {
      vi.advanceTimersByTime(1);
      upsertMemoria(arr, { texto: 'm' + i });
    }
    expect(listMemorias(arr)).toHaveLength(MAX_MEMORIAS);
    vi.advanceTimersByTime(1);
    upsertMemoria(arr, { id: a.uid, texto: 'a editada' });
    expect(listMemorias(arr)).toHaveLength(MAX_MEMORIAS);
    expect(arr.every((m) => !m.deleted || m.uid !== a.uid)).toBe(true);
  });
});

describe('deleteMemoria — borrado blando', () => {
  it('marca deleted:true + updatedAt=now y la entrada queda en el array', () => {
    const arr = [mk('u1', 'vieja', 5)];
    vi.setSystemTime(9000);
    const e = deleteMemoria(arr, 'u1');
    expect(e.deleted).toBe(true);
    expect(e.updatedAt).toBe(9000);
    expect(arr).toHaveLength(1);              // nunca se borra físicamente
    expect(listMemorias(arr)).toHaveLength(0); // …pero no se lista
  });

  it('id desconocido o nulo devuelve null sin tocar nada', () => {
    const arr = [mk('u1', 'x', 5)];
    expect(deleteMemoria(arr, 'nope')).toBe(null);
    expect(deleteMemoria(arr, null)).toBe(null);
    expect(arr[0].deleted).toBe(false);
  });

  it('el borrado blando no filtra en un merge futuro: la entrada (deleted) sigue en el payload que viaja por sync', () => {
    // El contrato de merge (js/sync/quiron.js) compara entradas por uid; si
    // deleteMemoria las quitara físicamente, el otro dispositivo reviviría el
    // contenido. Aquí se fija que la entrada marcada sigue presente.
    const doc = {};
    vi.setSystemTime(5000);
    const a = upsertMemoria(doc, { texto: 'importante' });
    deleteMemoria(doc, a.uid);
    expect(doc.memorias).toHaveLength(1);
    expect(doc.memorias[0].deleted).toBe(true);
    expect(doc.memorias[0].texto).toBe('importante');
  });
});

describe('listMemorias — orden y shortIds', () => {
  it('filtra deleted, ordena por ts asc y asigna shortIds M1..Mn', () => {
    const arr = [
      mk('uc', 'c', 30),
      mk('ua', 'a', 10),
      mk('ub', 'b', 20, { deleted: true }),
    ];
    const list = listMemorias(arr);
    expect(list.map((m) => m.texto)).toEqual(['a', 'c']);
    expect(list.map((m) => m.shortId)).toEqual(['M1', 'M2']);
    expect(list.every((m) => !m.deleted)).toBe(true);
  });

  it('el orden de entrada no altera el resultado y el payload no se muta', () => {
    const arr = [mk('u2', 'b', 20), mk('u1', 'a', 10)];
    const snap = JSON.stringify(arr);
    expect(listMemorias(arr).map((m) => m.uid)).toEqual(['u1', 'u2']);
    expect(JSON.stringify(arr)).toBe(snap);
  });

  it('empate de ts: desempate determinista por uid', () => {
    const arr = [mk('ub', 'b', 10), mk('ua', 'a', 10)];
    expect(listMemorias(arr).map((m) => m.uid)).toEqual(['ua', 'ub']);
  });

  it('payload del chat sin slot (o basura) lista vacío', () => {
    expect(listMemorias({ convo: [], archive: [] })).toEqual([]);
    expect(listMemorias(null)).toEqual([]);
    expect(listMemorias('no')).toEqual([]);
  });
});

describe('compactMemorias — FIFO a MAX_MEMORIAS_TOTAL (200)', () => {
  it('conserva las 200 entradas más recientemente actualizadas (deleted incluidas) y descarta el resto', () => {
    const arr = Array.from({ length: MAX_MEMORIAS_TOTAL + 5 }, (_, i) => mk('u' + i, 't' + i, i + 1));
    // Las 3 más viejas están "borradas": igual compiten por updatedAt en el FIFO total.
    arr[0].deleted = true;
    arr[1].deleted = true;
    arr[2].deleted = true;
    compactMemorias(arr);
    expect(arr).toHaveLength(MAX_MEMORIAS_TOTAL);
    const uids = arr.map((m) => m.uid);
    expect(uids).not.toContain('u0');
    expect(uids).not.toContain('u4'); // las 5 más viejas caigan o no, u4 es vieja
    expect(uids).toContain('u5');
    expect(uids).toContain('u' + (MAX_MEMORIAS_TOTAL + 4));
  });

  it('bajo el tope no toca nada (idempotente en la práctica)', () => {
    const arr = [mk('u1', 'a', 1), mk('u2', 'b', 2)];
    compactMemorias(arr);
    expect(arr).toHaveLength(2);
    expect(arr[0].uid).toBe('u1'); // el orden del array no cambia
  });

  it('lazy-init sobre un payload sin slot', () => {
    const doc = { convo: [], archive: [] };
    compactMemorias(doc);
    expect(doc.memorias).toEqual([]);
  });
});

describe('loadMemorias / saveMemorias — storage', () => {
  it('roundtrip en la clave propia (patrón ARCHIVE_KEY, sin tocar la conversación)', () => {
    const list = [mk('u1', 'a', 1)];
    saveMemorias(list);
    expect(localStorage.getItem(MEMORIAS_KEY)).toBeTruthy();
    expect(loadMemorias()).toEqual(list);
  });

  it('tolera basura, JSON roto y ausencia de clave', () => {
    localStorage.setItem(MEMORIAS_KEY, '{roto');
    expect(loadMemorias()).toEqual([]);
    localStorage.setItem(MEMORIAS_KEY, JSON.stringify([mk('u1', 'a', 1), 42, null, 'x']));
    expect(loadMemorias()).toEqual([mk('u1', 'a', 1)]);
    localStorage.removeItem(MEMORIAS_KEY);
    expect(loadMemorias()).toEqual([]);
  });

  it('saveMemorias con basura no rompe: guarda un array vacío', () => {
    saveMemorias(null);
    expect(loadMemorias()).toEqual([]);
    saveMemorias('no');
    expect(loadMemorias()).toEqual([]);
  });
});

// ── W2 — tools remember/forget (js/ai/tools.js) ───────────────────────────────────
// Se prueba el ejecutor directamente (makeToolExecutor), que es donde vive la
// lógica: resolución de [Mn], persistencia y confirmaciones que cita el modelo.
describe('tools remember/forget — esquema', () => {
  it('declaradas en su propia lista con esquema OpenAI y nombres en MEMORY_TOOL_NAMES', () => {
    expect(QUIRON_MEMORY_TOOLS.map((t) => t.function.name).sort()).toEqual(['forget', 'remember']);
    expect(MEMORY_TOOL_NAMES).toEqual(new Set(['remember', 'forget']));
    // No viven en QUIRON_TOOLS: el contrato de quiron-tool-label.test.js exigiría
    // una etiqueta en js/ui/quiron.js (cableado de W4) antes de exponerlas.
    for (const t of QUIRON_MEMORY_TOOLS) {
      expect(t.type).toBe('function');
      expect(t.function.description).toBeTruthy();
      expect(t.function.parameters.type).toBe('object');
    }
  });
});

describe('tool remember', () => {
  it('crea, persiste con source modelo y confirma con el shortId posicional', async () => {
    const out = await makeToolExecutor({}, {})('remember', { categoria: 'horario', texto: 'entreno por la mañana' });
    expect(out).toBe('guardado [M1] horario: entreno por la mañana');
    const activas = listMemorias(loadMemorias());
    expect(activas).toHaveLength(1);
    expect(activas[0]).toMatchObject({ categoria: 'horario', texto: 'entreno por la mañana', source: 'modelo' });
  });

  it('categoría fuera del set cerrado cae a otro (validación de la capa de datos)', async () => {
    const out = await makeToolExecutor({}, {})('remember', { categoria: 'inventada', texto: 'x' });
    expect(out).toBe('guardado [M1] otro: x');
  });

  it('con id reemplaza la memoria existente y conserva su posición', async () => {
    const ex = makeToolExecutor({}, {});
    await ex('remember', { categoria: 'dolor', texto: 'rodilla al sentadilla' });
    vi.advanceTimersByTime(10);
    await ex('remember', { categoria: 'horario', texto: 'entreno por la mañana' });
    vi.advanceTimersByTime(10);
    const out = await ex('remember', { id: 'M1', categoria: 'dolor', texto: 'tendinitis en el talón de Aquiles' });
    expect(out).toBe('actualizado [M1] dolor: tendinitis en el talón de Aquiles');
    const activas = listMemorias(loadMemorias());
    expect(activas).toHaveLength(2); // reemplazo, no duplicado
    expect(activas.map((m) => m.texto)).toEqual(['tendinitis en el talón de Aquiles', 'entreno por la mañana']);
  });

  it('tolera variantes del id ("m1", "3") porque el [Mn] es posicional sobre el orden del snapshot', async () => {
    const ex = makeToolExecutor({}, {});
    await ex('remember', { texto: 'a' });
    vi.advanceTimersByTime(10);
    await ex('remember', { texto: 'b' });
    vi.advanceTimersByTime(10);
    expect(await ex('remember', { id: 'm2', texto: 'b editada' })).toContain('actualizado [M2]');
    expect(await ex('remember', { id: '1', texto: 'a editada' })).toContain('actualizado [M1]');
  });

  it('id desconocido devuelve error claro y no crea nada', async () => {
    await makeToolExecutor({}, {})('remember', { texto: 'única' });
    const out = await makeToolExecutor({}, {})('remember', { id: 'M9', texto: 'x' });
    expect(out).toMatch(/^ERROR: no existe ninguna memoria con id "M9"/);
    expect(listMemorias(loadMemorias())).toHaveLength(1);
  });

  it('sin texto devuelve error y no persiste nada', async () => {
    const out = await makeToolExecutor({}, {})('remember', { texto: '   ' });
    expect(out).toMatch(/^ERROR: falta `texto`/);
    expect(loadMemorias()).toEqual([]);
  });

  it('al llegar al tope de 50, la creación 51 avisa de que reemplazó la más antigua y mantiene 50 activas', async () => {
    const ex = makeToolExecutor({}, {});
    for (let i = 0; i < MAX_MEMORIAS; i++) {
      vi.advanceTimersByTime(1);
      await ex('remember', { texto: 'm' + i });
    }
    vi.advanceTimersByTime(1);
    const out = await ex('remember', { texto: 'la que desplaza' });
    expect(out).toContain('(memoria llena: se reemplazó la entrada más antigua)');
    expect(listMemorias(loadMemorias())).toHaveLength(MAX_MEMORIAS);
    expect(listMemorias(loadMemorias()).map((m) => m.texto)).not.toContain('m0');
  });
});

describe('tool forget', () => {
  it('resuelve el shortId al uid, borra y confirma con los datos de la memoria borrada', async () => {
    const ex = makeToolExecutor({}, {});
    await ex('remember', { categoria: 'dolor', texto: 'rodilla al sentadilla' });
    vi.advanceTimersByTime(10);
    await ex('remember', { categoria: 'horario', texto: 'entreno por la mañana' });
    const out = await ex('forget', { id: 'M1' });
    expect(out).toBe('borrado [M1] dolor: rodilla al sentadilla');
    const activas = listMemorias(loadMemorias());
    expect(activas).toHaveLength(1);
    expect(activas[0].texto).toBe('entreno por la mañana');
    expect(activas[0].shortId).toBe('M1'); // las posiciones se recalculan
  });

  it('id desconocido devuelve error claro y no borra nada (nunca un no-op silencioso)', async () => {
    const ex = makeToolExecutor({}, {});
    await ex('remember', { texto: 'única' });
    const out = await ex('forget', { id: 'M7' });
    expect(out).toMatch(/^ERROR: no existe ninguna memoria con id "M7"/);
    expect(listMemorias(loadMemorias())).toHaveLength(1);
  });

  it('sin id devuelve error', async () => {
    const out = await makeToolExecutor({}, {})('forget', {});
    expect(out).toMatch(/^ERROR: falta `id`/);
  });

  it('el borrado es blando en el payload (la entrada queda para el merge de sync)', async () => {
    const ex = makeToolExecutor({}, {});
    await ex('remember', { texto: 'importante' });
    await ex('forget', { id: 'M1' });
    const brutas = loadMemorias();
    expect(brutas).toHaveLength(1);
    expect(brutas[0].deleted).toBe(true);
  });
});
