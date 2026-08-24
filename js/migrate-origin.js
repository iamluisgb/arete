// ── Traer los datos del origen viejo ─────────────────────
//
// Areté vivía en `luisgonzalezbernal.com/arete`. Los datos de cada atleta están
// en el **localStorage de ese origen**, y el navegador no deja que este los lea:
// el almacenamiento va por origen, y ni un iframe sirve — Chrome, Safari y
// Firefox particionan el almacenamiento de terceros, así que un iframe al origen
// viejo desde aquí vería un cajón vacío, no el de verdad.
//
// El único momento en que esos datos son legibles es cuando el propio atleta
// abre el sitio viejo **como página principal**, que es exactamente lo que pasa
// cuando pincha su marcador. La página de retirada (rama `gh-pages`) los lee ahí,
// los comprime y los manda en el **fragmento** de la URL — que no viaja al
// servidor, así que el traspaso no pasa por Cloudflare ni queda en ningún log.
// Este módulo es el otro extremo.
//
// Dos reglas que sostienen esto:
//  1. El origen viejo **nunca borra** lo suyo. Si el traspaso falla, sus datos
//     siguen donde estaban y se puede reintentar.
//  2. Aquí **nunca se sobrescribe en silencio**: si ya hay datos, se pregunta.

/** Prefijo del fragmento. Si cambia, hay que cambiarlo en las dos ramas. */
export const HASH_PREFIX = '#migrar=';

/** base64url: el `+`, el `/` y el `=` no sobreviven a una URL sin pelearse. */
function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Descomprime el paquete. El origen viejo usa gzip vía `CompressionStream` y cae
 * a JSON en claro donde no exista; el marcador de un byte al principio dice cuál
 * de las dos es, para no adivinar por el contenido.
 */
async function decodePayload(raw) {
  const bytes = b64urlToBytes(raw);
  if (!bytes.length) throw new Error('paquete vacío');
  const [marca, cuerpo] = [bytes[0], bytes.subarray(1)];
  let texto;
  if (marca === 1) {
    if (typeof DecompressionStream !== 'function') throw new Error('sin gzip');
    // Un ReadableStream a pelo en vez de `new Blob([...]).stream()`: Blob.stream()
    // no existe en todas partes (jsdom, entre otras) y aquí no aporta nada.
    const origen = new ReadableStream({
      start(c) { c.enqueue(cuerpo); c.close(); },
    });
    texto = await new Response(origen.pipeThrough(new DecompressionStream('gzip'))).text();
  } else {
    texto = new TextDecoder().decode(cuerpo);
  }
  return JSON.parse(texto);
}

/** Lee el paquete del fragmento, si lo hay. Devuelve null cuando no toca. */
export function readMigrationHash(hash) {
  const h = String(hash || '');
  return h.startsWith(HASH_PREFIX) ? h.slice(HASH_PREFIX.length) : null;
}

/** ¿Hay algo que perder aquí? Decide si se puede importar sin preguntar. */
export function hasLocalData(db) {
  return !!(db?.workouts?.length || db?.runningLogs?.length || db?.bodyLogs?.length
    || db?.domainTests?.length || db?.customSessions?.length || db?.customPrograms?.length);
}

/** Cuántas cosas trae el paquete, para poder decirlo antes de tocar nada. */
export function describePayload(d) {
  const partes = [];
  const n = (arr, uno, varios) => {
    const c = Array.isArray(arr) ? arr.length : 0;
    if (c) partes.push(`${c} ${c === 1 ? uno : varios}`);
  };
  n(d?.workouts, 'entreno', 'entrenos');
  n(d?.runningLogs, 'carrera', 'carreras');
  n(d?.bodyLogs, 'registro corporal', 'registros corporales');
  n(d?.domainTests, 'test', 'tests');
  return partes.length ? partes.join(', ') : 'sin registros';
}

/**
 * Si la URL trae datos del origen viejo, los importa.
 *
 * @param {Object} db
 * @param {Object} deps  { applyImport, confirm, toast, location, history, reload }
 * @returns {Promise<{status:string, detail?:string}>} status: none | imported |
 *   cancelled | invalid | error
 */
export async function migrateFromHash(db, deps = {}) {
  const loc = deps.location || (typeof location !== 'undefined' ? location : null);
  const raw = readMigrationHash(loc?.hash);
  if (!raw) return { status: 'none' };

  // Se limpia SIEMPRE y lo primero: un paquete que falla no puede quedarse en la
  // barra para reintentarse en cada recarga, ni acabar en el historial del
  // navegador más tiempo del imprescindible.
  const hist = deps.history || (typeof history !== 'undefined' ? history : null);
  try { hist?.replaceState(null, '', loc.pathname + loc.search); } catch (e) { /* da igual */ }

  let d;
  try {
    d = await decodePayload(raw);
  } catch (e) {
    console.warn('migración: paquete ilegible', e);
    return { status: 'invalid' };
  }

  const resumen = describePayload(d);
  const preguntar = deps.confirm || (typeof confirm !== 'undefined' ? confirm : () => false);
  if (hasLocalData(db) && !preguntar(
    `Traes datos de la dirección anterior (${resumen}).\n\n`
    + 'Aquí ya hay datos. Se fusionan: nada se borra, y lo que esté repetido no se duplica.\n\n'
    + '¿Los traemos?')) {
    return { status: 'cancelled' };
  }

  const err = await deps.applyImport(d, db);
  if (err) {
    console.warn('migración:', err);
    return { status: 'invalid', detail: err };
  }
  return { status: 'imported', detail: resumen };
}
