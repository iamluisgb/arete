// Plantilla única de la ayuda. Todo el sitio sale de aquí: si un artículo necesita
// un adorno propio, se resuelve con clases en `ayuda.css`, no con otra plantilla.
//
// Las páginas son estáticas: lo que escribe el generador es lo que sirve Pages.
// Por eso el shell no carga ningún framework ni módulo de la app — solo app.css,
// la hoja de la ayuda y `ayuda.js` (tema y búsqueda).

import { esc } from './markdown.mjs';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${Number(m[3])}-${MESES[Number(m[2]) - 1]}-${m[1]}`;
}

const GRUPOS = {
  guias: { label: 'Guías prácticas', base: '/ayuda/guias/' },
  tutoriales: { label: 'Tutoriales', base: '/ayuda/tutoriales/' },
  explicacion: { label: 'Explicación', base: '/ayuda/explicacion/' },
  referencia: { label: 'Referencia', base: '/ayuda/referencia/' },
  novedades: { label: 'Novedades', base: '/ayuda/novedades/' },
};

function navHtml(grupos, activo) {
  const filas = grupos.map(g => {
    return `<div class="doc-side-group">
  <a class="doc-side-group-title" href="${g.base}"${activo === g.base ? ' aria-current="page"' : ''}>${esc(g.label)}</a>
  <ul class="doc-side-list">
${g.items.map(it => `    <li><a href="${it.url}"${it.url === activo ? ' aria-current="page"' : ''}>${esc(it.title)}</a></li>`).join('\n')}
  </ul>
</div>`;
  }).join('\n');
  return `<div class="doc-side">
  <div class="doc-side-home"><a href="/ayuda/">Inicio de la ayuda</a></div>
  ${filas}
</div>`;
}

/**
 * @param {object} p
 * @param {string} p.url           ruta pública, con barra final
 * @param {string} p.title
 * @param {string} [p.resumen]
 * @param {string} p.cuadrante     guias | tutoriales | explicacion | referencia | novedades | portada
 * @param {object} p.meta          frontmatter completo
 * @param {string} p.body          HTML del artículo
 * @param {Array}  p.grupos        navegación
 */
export function layout({ url, title, resumen = '', lead, cuadrante, meta = {}, body, grupos, indice = false }) {
  const entradilla = lead === undefined ? resumen : lead;
  const esPortada = cuadrante === 'portada';
  const esIndice = indice;
  const grupo = GRUPOS[cuadrante];
  const migas = esPortada ? '' : `<div class="doc-crumbs">
    <a href="/ayuda/">Ayuda</a>${grupo ? ` · <a href="${grupo.base}">${esc(grupo.label)}</a>` : ''}${esIndice ? '' : ` · <span>${esc(title)}</span>`}
  </div>`;

  const revisado = meta.reviewed_on ? `<span>Revisado <b>${fecha(meta.reviewed_on)}</b></span>` : '';
  const cubre = meta.cubre ? `<span>Cubre <b>${esc(meta.cubre)}</b></span>` : '';
  const fuente = Array.isArray(meta.generado_de) && meta.generado_de.length
    ? `<span>Cifras de <b>${meta.generado_de.map(esc).join(', ')}</b></span>` : '';
  const barra = (revisado || cubre || fuente) && !esIndice
    ? `<div class="doc-meta">${revisado}${cubre}${fuente}<a class="doc-meta-link" href="/build.json" title="Qué versión está desplegada ahora mismo">versión desplegada</a></div>`
    : '';

  const piePagina = !esPortada ? `<div class="doc-feedback">
    <span>¿Te ha servido esta página?</span>
    <a href="mailto:hola@arete.raiatech.com?subject=${encodeURIComponent(`Ayuda: ${title}`)}&body=${encodeURIComponent('Página: ' + url + '\n\nQué buscaba:\n')}">Sí, pero falta algo</a>
    <a href="mailto:hola@arete.raiatech.com?subject=${encodeURIComponent(`Ayuda: ${title}`)}&body=${encodeURIComponent('Página: ' + url + '\n\nLo que no encuentro:\n')}">No lo encuentro</a>
  </div>` : '';

  const seoTitulo = esPortada
    ? 'Ayuda de Areté — guías y el porqué de tus números'
    : `${title} — Ayuda de Areté`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(seoTitulo)}</title>
<meta name="description" content="${esc(resumen)}">
<link rel="canonical" href="https://arete.raiatech.com${url}">
<meta property="og:title" content="${esc(seoTitulo)}">
<meta property="og:description" content="${esc(resumen)}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://arete.raiatech.com${url}">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/icon-32.png">
<link rel="apple-touch-icon" href="/assets/icons/icon-192.png">
<meta name="theme-color" content="#f4f2f0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131313" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="/app.css">
<link rel="stylesheet" href="/ayuda/ayuda.css">
<!-- Umami, el mismo de la landing y la app: solo en producción y sin cookies.
     Mide aperturas de página, no lo que haces dentro de la app. -->
<script>
if (location.hostname === 'arete.raiatech.com') {
  var u = document.createElement('script');
  u.defer = true; u.src = '/u/s.js';
  u.setAttribute('data-website-id', '08c1619b-4bb8-471b-9dc9-9b6cda88e8ae');
  u.setAttribute('data-host-url', 'https://cloud.umami.is');
  document.head.appendChild(u);
}
</script>
</head>
<body class="doc-body">
<a class="doc-skip" href="#contenido">Saltar al contenido</a>

<div class="doc-top">
  <a class="doc-brand" href="/ayuda/">Aret<span>é</span><small>Ayuda</small></a>
  <div class="doc-search" role="search">
    <input id="docQ" type="search" placeholder="Busca: nivel, test, plan, Quirón, copia…"
           aria-label="Buscar en la ayuda" autocomplete="off">
    <div id="docRes" class="doc-res" hidden></div>
  </div>
  <a class="btn btn--sm doc-open-app" href="/app.html" data-umami-event="Ayuda: abrir la app">Abrir la app</a>
</div>

<div class="doc-wrap">
  <div class="doc-side-slot">
    <button class="doc-side-toggle" type="button" aria-expanded="false" aria-controls="docSide">Secciones</button>
    ${navHtml(grupos, url).replace('class="doc-side"', 'class="doc-side" id="docSide"')}
  </div>
  <div class="doc-main">
    ${migas}
    <article class="doc${esPortada ? ' doc--portada' : ''}" id="contenido">
      ${barra}
      ${esPortada ? '' : `<h1 class="doc-h1">${esc(title)}</h1>${entradilla ? `<p class="doc-lead">${esc(entradilla)}</p>` : ''}`}
      ${body}
      ${piePagina}
    </article>
  </div>
</div>

<div class="doc-foot">
  <span>Areté es gratis y sin cuenta. Los datos viven en tu dispositivo.</span>
  <span>¿No lo encuentras? <a href="mailto:hola@arete.raiatech.com">hola@arete.raiatech.com</a></span>
  <span><a href="/blog/">Blog</a> · <a href="/protocolos/">Protocolos</a> · <a href="/app.html">La app</a></span>
</div>

<script src="/ayuda/ayuda.js"></script>
</body>
</html>
`;
}
