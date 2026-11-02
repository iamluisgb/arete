#!/usr/bin/env node
// Mantiene el blog coherente desde una sola lista (ARTICLES): firma con fecha y
// tiempo de lectura, JSON-LD BlogPosting, imagen social por artículo, «sigue
// leyendo», pie común y el índice. Escribe solo entre marcas <!-- blog:x -->,
// así que se puede volver a ejecutar: `node scripts/blog-sync.mjs` (o --check
// para que falle si algo no está al día, que es lo que mira el test).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://arete.raiatech.com';
const AUTHOR = { name: 'Luis González', url: 'https://luisgonzalezbernal.com' };

// Orden de lectura. `published` = primer commit del fichero; `updated` = última
// revisión de contenido (la que antes iba en una línea gris al final).
export const ARTICLES = [
  { slug: 'filosofia-arete', tag: 'Manifiesto', title: 'Areté: el manifiesto',
    desc: 'Excelencia sin días libres. Por qué existe Areté y qué defiende.',
    published: '2026-03-27', updated: '2026-07-10' },
  { slug: '8-dominios', tag: 'Niveles', title: 'Los dominios del Atleta Híbrido', featured: true,
    desc: '7 dominios de rendimiento, medidos con tests concretos. Tu nivel es el más bajo, y cada uno sube con datos.',
    published: '2026-07-05', updated: '2026-07-10' },
  { slug: 'programa-arete', tag: 'Programa', title: 'Areté: el programa completo',
    desc: 'Un plan de ejemplo importable en 4 fases: fuerza, hipertrofia, definición y ajustes.',
    published: '2026-07-05', updated: '2026-07-10' },
  { slug: 'crear-plan', tag: 'Personaliza', title: 'Crea tu propio plan',
    desc: 'El formato importable de Areté. Diséñalo con IA o a mano, impórtalo y entrena.',
    published: '2026-02-28', updated: '2026-07-10' },
  { slug: 'nutricion', tag: 'Nutrición', title: 'Come como un animal',
    desc: 'Calorías, macros, timing y suplementos para cada fase, sin dietas absurdas.',
    published: '2026-02-10', updated: '2026-07-10' },
  { slug: 'efecto-kettlebell', tag: 'Aplicación', title: 'Efecto Kettlebell: 10 semanas',
    desc: 'Cómo entrenar la resistencia de fuerza con una sola pesa rusa, sin gimnasio.',
    published: '2026-02-17', updated: '2026-07-10' },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function readingMinutes(html) {
  const body = html.split('class="article-body"')[1] || '';
  const text = body.replace(/<!-- blog:next -->[\s\S]*$/, '').replace(/<footer[\s\S]*$/, '')
    .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 230));
}

const ogImage = slug => `${SITE}/assets/blog/og/${slug}.png`;

/** Sustituye la región marcada; si no existe, la crea reemplazando `legacy`. */
function region(html, name, content, legacy) {
  const block = `<!-- blog:${name} -->${content}<!-- /blog:${name} -->`;
  const re = new RegExp(`<!-- blog:${name} -->[\\s\\S]*?<!-- /blog:${name} -->`);
  if (re.test(html)) return html.replace(re, () => block);
  if (!legacy || !legacy.test(html)) throw new Error(`no encuentro dónde poner blog:${name}`);
  return html.replace(legacy, m => (typeof legacy.keep === 'function' ? legacy.keep(m) : '') + block);
}

function footer() {
  return `<footer class="site-footer">
  <nav class="footer-links" aria-label="Areté">
    <a href="/">Areté</a><a href="/app" data-umami-event="Blog: abrir app" data-umami-event-sitio="pie">Abrir la app</a><a href="/blog/">Blog</a><a href="/blueprints/">Blueprints</a>
  </nav>
  <p class="footer-maker"><img src="/assets/landing/luis.webp" alt="" width="24" height="24" loading="lazy" decoding="async"><span>Escrito por <a href="${AUTHOR.url}">${AUTHOR.name}</a>, que hace Areté.</span></p>
</footer>`;
}

function headBlock(a, minutes) {
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: a.title, description: a.desc, inLanguage: 'es',
    url: `${SITE}/blog/${a.slug}`, mainEntityOfPage: `${SITE}/blog/${a.slug}`,
    image: ogImage(a.slug), datePublished: a.published, dateModified: a.updated,
    timeRequired: `PT${minutes}M`,
    author: { '@type': 'Person', ...AUTHOR },
    publisher: { '@type': 'Organization', name: 'Areté', url: SITE, logo: `${SITE}/assets/icons/icon-192.png` },
  };
  return `
<meta property="article:published_time" content="${a.published}">
<meta property="article:modified_time" content="${a.updated}">
<meta property="article:author" content="${AUTHOR.name}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script src="blog.js" defer></script>
`;
}

function byline(a, minutes) {
  return `<div class="byline"><img src="../assets/landing/luis.webp" alt="" width="36" height="36" decoding="async"><div><a href="${AUTHOR.url}" rel="author">${AUTHOR.name}</a><span>Actualizado el <time datetime="${a.updated}">${fecha(a.updated)}</time> · ${minutes} min de lectura</span></div></div>`;
}

function nextBlock(i) {
  const card = (a, label) => a ? `<a href="${a.slug}.html" class="read-next-card"><span class="nav-label">${label}</span><span class="card-phase">${esc(a.tag)}</span><span class="nav-title">${esc(a.title)}</span><span class="nav-desc">${esc(a.desc)}</span></a>` : '';
  const prev = ARTICLES[i - 1], next = ARTICLES[i + 1];
  // El último enlaza al primero que no sea el anterior: nunca una tarjeta vacía.
  const alt = next || ARTICLES.find((x, j) => j !== i && j !== i - 1);
  return `<nav class="read-next" aria-label="Sigue leyendo"><h2 class="read-next-title">Sigue leyendo</h2><div class="read-next-grid">${card(prev, '← Anterior')}${card(alt, next ? 'Siguiente →' : 'Empieza por aquí →')}</div></nav>`;
}

function syncArticle(a, i) {
  const file = join(ROOT, 'blog', `${a.slug}.html`);
  let html = readFileSync(file, 'utf8');
  const minutes = readingMinutes(html);

  // Cabeza: imagen social por artículo, tipo article, JSON-LD BlogPosting.
  html = html.replace(/<meta property="og:type" content="[^"]*">/, '<meta property="og:type" content="article">');
  html = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*(">)/g, `$1${ogImage(a.slug)}$2`);
  html = html.replace(/<meta property="og:image:width" content="\d+">/, '<meta property="og:image:width" content="1200">');
  html = html.replace(/<meta property="og:image:height" content="\d+">/, '<meta property="og:image:height" content="630">');
  if (!html.includes('og:image:alt')) {
    html = html.replace(/(<meta property="og:image:height" content="630">)/, `$1\n<meta property="og:image:alt" content="${esc(a.title)} — blog de Areté">`);
  }
  const ldLegacy = /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/;
  html = region(html, 'head', headBlock(a, minutes), ldLegacy);

  // Firma bajo el subtítulo.
  const sub = /<div class="subtitle">[\s\S]*?<\/div>/;
  sub.keep = m => m;
  html = region(html, 'byline', byline(a, minutes), sub);

  // La línea gris de «Última revisión» pasa a la firma.
  html = html.replace(/\n?<p style="font-size:0\.8em; opacity:0\.6; margin-top:2rem;">Última revisión:[\s\S]*?<\/p>\n?/, '\n');

  // «Sigue leyendo» en lugar de la vieja navegación anterior/siguiente.
  html = region(html, 'next', nextBlock(i), /<div class="article-nav">[\s\S]*?\n<\/div>/);

  // Pie común.
  html = region(html, 'footer', footer(), /<footer class="site-footer">[\s\S]*?<\/footer>/);
  return [file, html];
}

function syncIndex() {
  const file = join(ROOT, 'blog', 'index.html');
  let html = readFileSync(file, 'utf8');
  const mins = Object.fromEntries(ARTICLES.map(a =>
    [a.slug, readingMinutes(readFileSync(join(ROOT, 'blog', `${a.slug}.html`), 'utf8'))]));
  const featured = ARTICLES.find(a => a.featured);
  const rest = ARTICLES.filter(a => !a.featured);
  const meta = a => `<span class="card-meta">${mins[a.slug]} min · ${fecha(a.updated)}</span>`;
  const list = `
<section class="blog-featured" aria-label="Empieza aquí">
  <a href="${featured.slug}.html" class="feature-card" data-umami-event="Blog: abrir artículo" data-umami-event-articulo="${featured.slug}">
    <div class="feature-text">
      <span class="card-phase">Empieza aquí · ${esc(featured.tag)}</span>
      <h2>${esc(featured.title)}</h2>
      <p>${esc(featured.desc)}</p>
      ${meta(featured)}
    </div>
    <figure><img src="../assets/landing/perfil-ejemplo.webp" alt="Perfil de ejemplo con los 7 dominios de Areté" width="560" height="700" loading="lazy" decoding="async"><figcaption>Perfil de ejemplo</figcaption></figure>
  </a>
</section>
<section class="blog-list" aria-labelledby="orden">
  <h2 id="orden" class="list-title">Todo, en orden de lectura</h2>
  <ol class="post-grid">
${rest.map(a => `    <li><a href="${a.slug}.html" class="article-card" data-umami-event="Blog: abrir artículo" data-umami-event-articulo="${a.slug}"><span class="card-phase">${esc(a.tag)}</span><h3>${esc(a.title)}</h3><p>${esc(a.desc)}</p>${meta(a)}</a></li>`).join('\n')}
  </ol>
</section>
`;
  html = region(html, 'list', list, /<div class="guide-layers">[\s\S]*?\n<\/div>\n(?=\n?<footer)/);
  html = region(html, 'footer', footer(), /<footer class="site-footer">[\s\S]*?<\/footer>/);

  const ld = {
    '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog de Areté', url: `${SITE}/blog/`, inLanguage: 'es',
    author: { '@type': 'Person', ...AUTHOR },
    blogPost: ARTICLES.map(a => ({ '@type': 'BlogPosting', headline: a.title, url: `${SITE}/blog/${a.slug}`,
      datePublished: a.published, dateModified: a.updated })),
  };
  html = region(html, 'head', `\n<script type="application/ld+json">${JSON.stringify(ld)}</script>\n`,
    /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/);
  return [file, html];
}

export function syncAll() { return [...ARTICLES.map(syncArticle), syncIndex()]; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [file, html] of syncAll()) {
    if (readFileSync(file, 'utf8') === html) continue;
    stale++;
    if (check) console.error(`desactualizado: ${file}`); else writeFileSync(file, html);
  }
  if (check && stale) process.exit(1);
  console.log(check ? 'blog al día' : `blog: ${stale} ficheros actualizados`);
}
