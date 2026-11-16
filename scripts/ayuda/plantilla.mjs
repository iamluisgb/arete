// Plantilla única de la ayuda. Todo el sitio sale de aquí: si un artículo necesita
// un adorno propio, se resuelve con clases en `ayuda.css`, no con otra plantilla.
//
// Las páginas son estáticas: lo que escribe el generador es lo que sirve Pages.
// Por eso el shell no carga ningún framework ni módulo de la app — solo app.css,
// la hoja de la ayuda y `ayuda.js` (tema, navegación, índice y búsqueda).
//
// La rejilla es la de una documentación, no la de un blog: navegación a la
// izquierda, prosa en el centro y «En esta página» a la derecha. Sin la tercera
// columna, un artículo de doce pantallas solo se puede recorrer de arriba abajo.

import { esc } from './markdown.mjs';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

const GRUPOS = {
  guias: { label: 'Guías prácticas', base: '/ayuda/guias/' },
  tutoriales: { label: 'Tutoriales', base: '/ayuda/tutoriales/' },
  explicacion: { label: 'Explicación', base: '/ayuda/explicacion/' },
  referencia: { label: 'Referencia', base: '/ayuda/referencia/' },
  novedades: { label: 'Novedades', base: '/ayuda/novedades/' },
};

// Chevron de los grupos. En línea y con `currentColor` para que siga al tema.
const CHEV = '<svg class="doc-chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ICONO_BUSCAR = '<svg class="doc-search-i" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const ICONO_MENU = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// Los tres estados del tema. El icono lo elige la hoja según `html[data-tema]`,
// así no hay dos fuentes de verdad: el atributo del documento y el botón.
const ICONO_TEMA = `<span class="doc-theme-i doc-theme-i--auto" title="Tema automático"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/></svg></span>
    <span class="doc-theme-i doc-theme-i--light" title="Tema claro"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
    <span class="doc-theme-i doc-theme-i--dark" title="Tema oscuro"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>`;

/**
 * Índice de la página, leído de los encabezados ya renderizados. El `id` lo pone
 * `markdown.mjs` con el mismo slug que usan los enlaces profundos de la app, así
 * que un ancla escrita en un artículo y la de esta columna son la misma.
 */
function indiceDe(body) {
  const items = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const texto = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (texto) items.push({ nivel: Number(m[1]), id: m[2], texto });
  }
  return items;
}

function listaIndice(items) {
  return items.map(it =>
    `<li class="doc-toc-item doc-toc-item--h${it.nivel}"><a href="#${it.id}">${esc(it.texto)}</a></li>`
  ).join('\n');
}

function navHtml(grupos, activo, cuadrante) {
  const filas = grupos.map(g => {
    const esActual = cuadrante === g.key;
    // Un grupo sin artículos (Novedades) no es un desplegable: es un enlace.
    if (!g.items.length) {
      return `<a class="doc-side-link${esActual ? ' is-current' : ''}" href="${g.base}"${activo === g.base ? ' aria-current="page"' : ''}>${esc(g.label)}</a>`;
    }
    // El primer hijo repite el nombre del grupo y lleva a su portada, como en una
    // documentación: el chevron abre la lista, el nombre sigue siendo navegable.
    const hijos = [
      `<li><a href="${g.base}"${activo === g.base ? ' aria-current="page"' : ''}>${esc(g.label)}</a></li>`,
      ...g.items.map(it => `<li><a href="${it.url}"${it.url === activo ? ' aria-current="page"' : ''}>${esc(it.title)}</a></li>`),
    ].join('\n');
    return `<details class="doc-side-group${esActual ? ' is-current' : ''}"${esActual ? ' open' : ''}>
  <summary>${esc(g.label)}${CHEV}</summary>
  <ul class="doc-side-list">${hijos}</ul>
</details>`;
  }).join('\n');
  return `<a class="doc-side-home" href="/ayuda/">Inicio</a>
${filas}`;
}

function pagerHtml(prev, next) {
  if (!prev && !next) return '';
  const enlace = (p, dir) => p ? `<a class="doc-pager-link doc-pager-${dir}" href="${p.url}" rel="${dir === 'anterior' ? 'prev' : 'next'}">
    <span class="doc-pager-dir">${dir === 'anterior' ? '← Anterior' : 'Siguiente →'}</span>
    <span class="doc-pager-title">${esc(p.title)}</span>
  </a>` : '<span></span>';
  return `<div class="doc-pager" role="navigation" aria-label="Páginas de la ayuda">
  ${enlace(prev, 'anterior')}
  ${enlace(next, 'siguiente')}
</div>`;
}

// Ancla en cada encabezado: el enlace que se copia para citar media página.
// Va oculta al lector de pantalla y fuera del orden de tabulación: el nombre del
// encabezado tiene que seguir siendo «Pasos», no «Pasos #».
function conAnclas(html) {
  return html.replace(/<h([23])(\s+id="([^"]+)")>([\s\S]*?)<\/h\1>/g,
    (todo, nivel, attrs, id, texto) => `<h${nivel}${attrs}>${texto}<a class="doc-ancla" href="#${id}" tabindex="-1" aria-hidden="true">#</a></h${nivel}>`);
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
 * @param {object} [p.prev]        página anterior en el orden de la ayuda
 * @param {object} [p.next]        página siguiente
 */
export function layout({ url, title, resumen = '', lead, cuadrante, meta = {}, body, grupos, indice = false, prev = null, next = null }) {
  const entradilla = lead === undefined ? resumen : lead;
  const esPortada = cuadrante === 'portada';
  const esIndice = indice;
  const grupo = GRUPOS[cuadrante];
  const migas = esPortada ? '' : `<div class="doc-crumbs" role="navigation" aria-label="Ruta">
    <a href="/ayuda/">Ayuda</a>${grupo ? ` · <a href="${grupo.base}">${esc(grupo.label)}</a>` : ''}${esIndice ? '' : ` · <span>${esc(title)}</span>`}
  </div>`;

  // Revisión, alcance y de dónde salen las cifras: es lo que permite decidir si
  // el artículo sigue siendo cierto. Una línea, no un panel.
  const revisado = meta.reviewed_on ? `<span>Revisado el <b>${fecha(meta.reviewed_on)}</b></span>` : '';
  const cubre = meta.cubre ? `<span>Cubre <b>${esc(meta.cubre)}</b></span>` : '';
  const fuente = Array.isArray(meta.generado_de) && meta.generado_de.length
    ? `<span>Cifras de <b>${meta.generado_de.map(esc).join(', ')}</b></span>` : '';
  const palabras = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
  const lectura = palabras > 200 ? `<span>${Math.max(1, Math.round(palabras / 210))} min de lectura</span>` : '';
  const barra = (revisado || cubre || fuente) && !esIndice
    ? `<div class="doc-meta">${revisado}${cubre}${fuente}${lectura}<a class="doc-meta-link" href="/build.json" title="Qué versión está desplegada ahora mismo">versión desplegada</a></div>`
    : '';

  // Índice lateral. Con menos de dos encabezados no hay nada que oriente y la
  // columna vacía solo come ancho: en índices y portada no se pinta.
  const secciones = !esIndice && !esPortada ? indiceDe(body) : [];
  const conIndice = secciones.length >= 2;
  const toc = conIndice
    ? `<div class="doc-toc" role="navigation" aria-label="En esta página">
  <p class="doc-toc-title">En esta página</p>
  <ul class="doc-toc-list">
${listaIndice(secciones)}
  </ul>
</div>`
    : '';
  // En pantallas sin tercera columna el mismo índice va plegado antes del texto.
  const tocInline = conIndice
    ? `<details class="doc-toc-inline">
  <summary>En esta página${CHEV}</summary>
  <ul class="doc-toc-list">
${listaIndice(secciones)}
  </ul>
</details>`
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
<!-- Inter y JetBrains Mono son las de la app: sin ellas la ayuda se lee con la
     fuente del sistema y deja de ser el mismo producto. Mismo criterio que
     app.html (la hoja de Material Symbols ya viaja por aquí). -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/app.css">
<link rel="stylesheet" href="/ayuda/ayuda.css">
<!-- El tema se aplica antes de pintar: sin esto, quien elige oscuro en la app ve
     un destello claro en cada página de la ayuda. Es la misma clave («areteTheme»). -->
<script>
(function () {
  var modo = 'auto';
  try { modo = localStorage.getItem('areteTheme') || 'auto'; } catch (e) {}
  if (modo !== 'light' && modo !== 'dark') modo = 'auto';
  var oscuro = modo === 'dark' || (modo === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (oscuro) document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-tema', modo);
})();
</script>
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

<header class="doc-top">
  <div class="doc-top-inner">
  <button class="doc-nav-toggle" type="button" aria-expanded="false" aria-controls="docSide" aria-label="Abrir las secciones">${ICONO_MENU}</button>
  <a class="doc-brand" href="/ayuda/">Aret<span>é</span><small>Ayuda</small></a>
  <div class="doc-search" role="search">
    ${ICONO_BUSCAR}
    <input id="docQ" type="search" placeholder="Buscar en la ayuda"
           aria-label="Buscar en la ayuda" autocomplete="off">
    <kbd class="doc-kbd" aria-hidden="true">/</kbd>
    <div id="docRes" class="doc-res" hidden></div>
  </div>
  <button class="doc-theme" type="button" aria-label="Tema automático. Cambiar a claro" title="Tema automático">
    ${ICONO_TEMA}
  </button>
  <a class="btn btn--sm doc-open-app" href="/app" data-umami-event="Ayuda: abrir la app"><span class="doc-open-app-full">Abrir la app</span><span class="doc-open-app-mini">App</span></a>
  </div>
</header>

<div class="doc-wrap${conIndice ? ' doc-wrap--con-indice' : ''}">
  <div class="doc-side-slot">
    <button class="doc-side-toggle" type="button" aria-expanded="false" aria-controls="docSide">
      <span>Secciones</span><span class="doc-side-toggle-mark" aria-hidden="true">${CHEV}</span>
    </button>
    <div class="doc-side" id="docSide" role="navigation" aria-label="Secciones de la ayuda">
      ${navHtml(grupos, url, cuadrante)}
    </div>
  </div>
  <div class="doc-main">
    ${migas}
    <article class="doc${esPortada ? ' doc--portada' : ''}${esIndice ? ' doc--indice' : ''}" id="contenido">
      ${barra}
      ${esPortada ? '' : `<h1 class="doc-h1">${esc(title)}</h1>${entradilla ? `<p class="doc-lead">${esc(entradilla)}</p>` : ''}`}
      ${tocInline}
      ${conAnclas(body)}
      ${esPortada ? '' : pagerHtml(prev, next)}
      ${piePagina}
    </article>
  </div>
  ${toc ? `<aside class="doc-toc-slot">${toc}</aside>` : ''}
</div>

<div class="doc-foot">
  <span>Areté es gratis y sin cuenta. Los datos viven en tu dispositivo.</span>
  <span>¿No lo encuentras? <a href="mailto:hola@arete.raiatech.com">hola@arete.raiatech.com</a></span>
  <span><a href="/blog/">Blog</a> · <a href="/protocolos/">Protocolos</a> · <a href="/app">La app</a></span>
</div>

<script src="/ayuda/ayuda.js"></script>
</body>
</html>
`;
}
