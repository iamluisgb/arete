// La guía como corpus del agente: búsqueda sobre el índice que genera
// `scripts/build-ayuda.mjs` (`ayuda/indice.json`).
//
// No se manda la guía entera al modelo: se buscan tres páginas y se devuelve un
// extracto corto con su URL. El modelo cita; no copia. Es el mismo principio que
// el presupuesto de contexto del chat: lo que no se necesita, no viaja.

let cache = null;
let cargando = null;

/** Normaliza para comparar: minúsculas y sin acentos. */
export function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Índice en memoria; se pide una vez por sesión y nunca rompe el turno. */
export function cargarIndice(fetchImpl) {
  if (cache) return Promise.resolve(cache);
  if (cargando) return cargando;
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return Promise.resolve([]);
  cargando = Promise.resolve(f('/ayuda/indice.json'))
    .then(r => (r && r.ok ? r.json() : []))
    .then(d => (cache = Array.isArray(d) ? d : []))
    .catch(() => (cache = []));
  return cargando;
}

/** Solo para tests: olvida el índice cacheado. */
export function _resetIndice() { cache = null; cargando = null; }

/**
 * Busca en el índice. Puro: recibe el índice y devuelve los aciertos ordenados.
 * @returns {Array<{url,title,resumen,fragmento,score}>}
 */
export function buscarAyuda(indice, consulta, limite = 3) {
  const q = norm(consulta).trim();
  if (q.length < 2 || !Array.isArray(indice)) return [];
  const palabras = q.split(/\s+/).filter(w => w.length > 1);
  if (!palabras.length) return [];

  const aciertos = [];
  for (const it of indice) {
    const titulo = norm(it.title);
    const resumen = norm(it.resumen || '');
    const texto = norm(it.texto || '');
    let score = 0;
    for (const w of palabras) {
      if (titulo.includes(w)) score += 12;
      if (resumen.includes(w)) score += 4;
      const veces = texto.split(w).length - 1;
      if (veces) score += 1 + Math.min(veces, 3);
    }
    if (score > 0) aciertos.push({ ...it, score });
  }
  aciertos.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'));

  return aciertos.slice(0, limite).map(it => ({ ...it, fragmento: fragmento(it.texto, palabras) }));
}

/** El trozo del artículo que contiene la palabra: 260 caracteres alrededor. */
export function fragmento(texto, palabras) {
  const t = String(texto || '');
  if (!t) return '';
  const bajo = norm(t);
  let pos = -1;
  for (const w of palabras) {
    const p = bajo.indexOf(w);
    if (p >= 0 && (pos < 0 || p < pos)) pos = p;
  }
  if (pos < 0) return t.slice(0, 220).trim() + '…';
  const desde = Math.max(0, pos - 90);
  const trozo = t.slice(desde, desde + 260).trim();
  return (desde > 0 ? '…' : '') + trozo + (desde + 260 < t.length ? '…' : '');
}

/** Texto que se devuelve al modelo. Corto y con la URL: la cita es el contrato. */
export function formatearAyuda(aciertos) {
  if (!aciertos.length) {
    return 'La guía no tiene una página para eso. No inventes pasos de la interfaz: responde con lo que '
      + 'sepas de sus datos y dile que puede escribir a hola@arete.raiatech.com para que se añada.';
  }
  const cuerpo = aciertos.map(a => `- ${a.title} (${a.url})\n  ${a.fragmento}`).join('\n');
  return `GUÍA DE ARETÉ — ${aciertos.length} página(s). Cita la que uses con su enlace; no contradigas su regla:\n${cuerpo}`;
}
