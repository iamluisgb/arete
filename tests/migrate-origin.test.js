// Traer los datos del origen viejo (luisgonzalezbernal.com/arete).
//
// Lo que se comprueba aquí es sobre todo lo que NO puede pasar: que un paquete
// roto deje la app inservible, que se sobrescriba lo que ya hay sin preguntar, o
// que un fragmento fallido se quede en la barra reintentándose en cada recarga.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  HASH_PREFIX, readMigrationHash, hasLocalData, describePayload, migrateFromHash,
} from '../js/migrate-origin.js';

const vacia = () => ({ workouts: [], runningLogs: [], bodyLogs: [], domainTests: [] });
const conDatos = () => ({ ...vacia(), workouts: [{ id: 1, date: '2026-01-01', exercises: [] }] });

/** El mismo formato que produce la página de retirada: [marca][cuerpo] en base64url. */
async function empaquetar(obj, { gzip = true } = {}) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  let cuerpo = json;
  if (gzip) {
    const origen = new ReadableStream({ start(c) { c.enqueue(json); c.close(); } });
    const stream = origen.pipeThrough(new CompressionStream('gzip'));
    cuerpo = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const bytes = new Uint8Array(cuerpo.length + 1);
  bytes[0] = gzip ? 1 : 0;
  bytes.set(cuerpo, 1);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Entorno mínimo: una URL con su fragmento y un history que la puede limpiar. */
function entorno(hash, { db = vacia(), confirmar = true } = {}) {
  const location = { hash, pathname: '/app.html', search: '' };
  const history = { replaceState: vi.fn((_a, _b, url) => { location.hash = ''; location.href = url; }) };
  const applyImport = vi.fn(async (d, target) => { Object.assign(target, d); return null; });
  return { db, deps: { location, history, applyImport, confirm: () => confirmar }, location, history, applyImport };
}

describe('readMigrationHash', () => {
  it('reconoce el fragmento y solo ese', () => {
    expect(readMigrationHash(HASH_PREFIX + 'abc')).toBe('abc');
    expect(readMigrationHash('#otracosa')).toBeNull();
    expect(readMigrationHash('')).toBeNull();
    expect(readMigrationHash(undefined)).toBeNull();
  });
});

describe('hasLocalData', () => {
  it('una db recién creada no tiene nada que perder', () => {
    expect(hasLocalData(vacia())).toBe(false);
    expect(hasLocalData({})).toBe(false);
    expect(hasLocalData(null)).toBe(false);
  });
  it('cualquier colección con contenido cuenta', () => {
    expect(hasLocalData(conDatos())).toBe(true);
    expect(hasLocalData({ ...vacia(), bodyLogs: [{ id: 1 }] })).toBe(true);
    expect(hasLocalData({ ...vacia(), customSessions: [{ id: 'x' }] })).toBe(true);
  });
});

describe('describePayload', () => {
  it('cuenta en singular y en plural', () => {
    expect(describePayload({ workouts: [1], runningLogs: [1, 2] }))
      .toBe('1 entreno, 2 carreras');
    expect(describePayload({ workouts: [] })).toBe('sin registros');
  });
});

describe('migrateFromHash', () => {
  it('sin fragmento no hace nada', async () => {
    const e = entorno('');
    expect(await migrateFromHash(e.db, e.deps)).toEqual({ status: 'none' });
    expect(e.applyImport).not.toHaveBeenCalled();
  });

  it('viaje completo: comprimido en el origen viejo, importado aquí', async () => {
    const datos = { workouts: [{ id: 7, date: '2026-08-01', exercises: [] }], runningLogs: [], bodyLogs: [] };
    const e = entorno(HASH_PREFIX + await empaquetar(datos));
    const r = await migrateFromHash(e.db, e.deps);
    expect(r.status).toBe('imported');
    expect(r.detail).toBe('1 entreno');
    expect(e.db.workouts[0].id).toBe(7);
  });

  it('también sin gzip, para navegadores sin CompressionStream', async () => {
    const datos = { workouts: [{ id: 8, date: '2026-08-01', exercises: [] }] };
    const e = entorno(HASH_PREFIX + await empaquetar(datos, { gzip: false }));
    expect((await migrateFromHash(e.db, e.deps)).status).toBe('imported');
    expect(e.db.workouts[0].id).toBe(8);
  });

  it('con datos aquí pregunta antes, y respeta el no', async () => {
    const datos = { workouts: [{ id: 9, date: '2026-08-01', exercises: [] }] };
    const e = entorno(HASH_PREFIX + await empaquetar(datos), { db: conDatos(), confirmar: false });
    expect((await migrateFromHash(e.db, e.deps)).status).toBe('cancelled');
    expect(e.applyImport).not.toHaveBeenCalled();
    expect(e.db.workouts[0].id).toBe(1);   // lo de aquí, intacto
  });

  it('con la db vacía no molesta con una pregunta', async () => {
    const preguntar = vi.fn(() => true);
    const datos = { workouts: [{ id: 10, date: '2026-08-01', exercises: [] }] };
    const e = entorno(HASH_PREFIX + await empaquetar(datos));
    await migrateFromHash(e.db, { ...e.deps, confirm: preguntar });
    expect(preguntar).not.toHaveBeenCalled();
  });

  // Un paquete roto no puede quedarse en la barra reintentándose en cada recarga
  // — ni dejar los datos del atleta más tiempo del necesario en el historial.
  it('el fragmento se limpia SIEMPRE, incluso si el paquete es basura', async () => {
    const e = entorno(HASH_PREFIX + 'esto-no-es-un-paquete');
    expect((await migrateFromHash(e.db, e.deps)).status).toBe('invalid');
    expect(e.history.replaceState).toHaveBeenCalled();
    expect(e.location.hash).toBe('');
  });

  it('un paquete válido pero con formato rechazado no rompe nada', async () => {
    const e = entorno(HASH_PREFIX + await empaquetar({ workouts: 'no soy un array' }));
    e.deps.applyImport = vi.fn(async () => 'Formato no válido: Falta el array de workouts');
    const r = await migrateFromHash(e.db, e.deps);
    expect(r.status).toBe('invalid');
    expect(r.detail).toContain('Formato');
  });

  it('el fragmento se limpia antes de importar, no después', async () => {
    const orden = [];
    const datos = { workouts: [] };
    const e = entorno(HASH_PREFIX + await empaquetar(datos));
    e.deps.history = { replaceState: () => orden.push('limpia') };
    e.deps.applyImport = async () => { orden.push('importa'); return null; };
    await migrateFromHash(e.db, e.deps);
    expect(orden).toEqual(['limpia', 'importa']);
  });
});

// La prueba que de verdad importa: un historial real, empaquetado como lo hace la
// página del origen viejo y desempaquetado por el módulo que corre en el nuevo.
// Si esto falla, el atleta pierde sus datos en la mudanza.
describe('ida y vuelta con un historial real', () => {
  const real = JSON.parse(readFileSync('evals/fixtures/arete-real.json', 'utf8'));

  it('todo llega entero', async () => {
    const e = entorno(HASH_PREFIX + await empaquetar(real));
    const r = await migrateFromHash(e.db, e.deps);
    expect(r.status).toBe('imported');
    expect(e.db.workouts).toHaveLength(real.workouts.length);
    expect(e.db.runningLogs).toHaveLength(real.runningLogs.length);
    expect(e.db.bodyLogs).toHaveLength(real.bodyLogs.length);
    // No basta con contar: una serie concreta tiene que sobrevivir con sus kilos.
    const ultimo = e.db.workouts[e.db.workouts.length - 1];
    expect(ultimo).toEqual(real.workouts[real.workouts.length - 1]);
  });

  it('cabe holgadamente en el fragmento de una URL', async () => {
    const paquete = await empaquetar(real);
    // El tope de la página de retirada son 48.000 caracteres. Un historial de
    // ~100 KB no debería acercarse: si esto se dispara, hay que revisar el tope.
    expect(paquete.length).toBeLessThan(20000);
  });
});
