#!/usr/bin/env node
// Genera la ayuda de Areté: `docs/ayuda/*.md` → `ayuda/**/index.html`.
//
// Por qué un generador y no artículos a mano: media ayuda son tablas que salen
// del código (7 dominios, 82 ejercicios, atajos). Escritas a mano se quedan
// viejas el día que cambia un umbral, y nadie lo nota. Aquí el generador las
// escribe y `tests/ayuda.test.js` falla si el HTML servido no coincide con el
// que produciría el Markdown de hoy — la deriva se ve en `npm test`, no en
// producción.
//
// La salida se commitea: el deploy de Areté es una copia directa a Pages, así
// que lo que se sirve es exactamente lo que está en `ayuda/`. Nada de build en
// producción.
//
// Uso:
//   node scripts/build-ayuda.mjs           # escribe ayuda/
//   node scripts/build-ayuda.mjs --check   # no escribe: falla si hay deriva

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, plain, esc, slug } from './ayuda/markdown.mjs';
import { layout, fecha } from './ayuda/plantilla.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'docs/ayuda');
const OUT = join(ROOT, 'ayuda');
const CHECK = process.argv.includes('--check');

// ── Frontmatter ──────────────────────────────────────────
function frontmatter(text, file) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) throw new Error(`${file}: falta el frontmatter`);
  const meta = {};
  let clave = null;
  for (const raw of m[1].split('\n')) {
    if (!raw.trim()) continue;
    const item = /^\s*-\s+(.*)$/.exec(raw);
    if (item && clave) { (meta[clave] ||= []).push(item[1].trim()); continue; }
    const kv = /^([a-z_]+):\s*(.*)$/.exec(raw);
    if (!kv) throw new Error(`${file}: frontmatter ilegible en "${raw}"`);
    clave = kv[1];
    meta[clave] = kv[2].trim() === '' ? [] : kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: text.slice(m[0].length) };
}

// ── Bloques que salen del código ─────────────────────────
const { DOMAINS, ROMAN, LEVEL_NAMES, RETEST_DAYS, REP_CAP } = await import('../js/domains.js');
const { EXERCISE_ONTOLOGY } = await import('../js/exercise-ontology.js');
const { ATAJOS } = await import('../js/shortcuts-data.js');

const NUM = (v) => String(v).replace('.', ',');

function bloqueDominios() {
  const filas = DOMAINS.map(d => {
    const th = `<tr><th>Métrica</th>${ROMAN.slice(1).map((r, i) => `<th>${r}<br><small>${LEVEL_NAMES[i + 1]}</small></th>`).join('')}<th>Se deriva del historial</th></tr>`;
    const cuerpo = d.metrics.map(m => `<tr><td><b>${esc(m.label)}</b> <small>${esc(m.unit)}</small></td>`
      + m.levels.map(v => `<td>${NUM(v)}</td>`).join('')
      + `<td>${m.derived ? 'Sí' : 'No: hay que medirla'}</td></tr>`).join('');
    return `<section class="doc-domain">
<h2 id="${slug(d.name)}">${esc(d.name)}</h2>
<p>${esc(d.why)}</p>
<p class="doc-note"><b>Protocolo:</b> ${esc(d.protocol || 'Lo marca el plan de cada test.')}
 · <b>Repetir:</b> ${d.retest ? `${d.retest} días` : `lo que tardes en medir sus ${d.metrics.length} métricas`}</p>
<div class="doc-table"><table><thead>${th}</thead><tbody>${cuerpo}</tbody></table></div>
</section>`;
  }).join('\n');
  return `<div class="doc-domains">
<p class="doc-note">13 métricas en 7 dominios. El umbral de cada nivel es absoluto: en fuerza va en ratio a tu
peso corporal, en tiempos en segundos y en movilidad en grados. Un valor por debajo del nivel I
sigue siendo nivel I — haber medido bajo no es lo mismo que no haber medido.</p>
${filas}
</div>`;
}

function bloqueEjercicios() {
  const filas = [...EXERCISE_ONTOLOGY]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map(e => `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.pattern)}</td><td>${esc((e.equipment || []).join(', ') || '—')}</td><td>${esc((e.domains || []).map(x => DOMAINS.find(d => d.id === x)?.short || x).join(' · '))}</td><td>${esc(e.regression || '—')}</td></tr>`)
    .join('');
  return `<div class="doc-table"><table>
<thead><tr><th>Ejercicio</th><th>Patrón</th><th>Material</th><th>Dominios</th><th>Regresión</th></tr></thead>
<tbody>${filas}</tbody></table></div>
<p class="doc-note">${EXERCISE_ONTOLOGY.length} ejercicios. Los que llevan <code>lift</code> son los cinco
nodos canónicos (sentadilla, peso muerto, banca, press militar y dominadas) y son los únicos que
alimentan el cálculo del perfil; el resto no cuenta para el nivel aunque se entrene.</p>`;
}

function bloqueAtajos() {
  const filas = ATAJOS.map(a => `<tr><td><kbd>${esc(a.tecla)}</kbd></td><td>${esc(a.que)}</td></tr>`).join('');
  return `<div class="doc-table"><table><thead><tr><th>Tecla</th><th>Qué hace</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

function bloquePlanes() {
  const catalogo = JSON.parse(readFileSync(join(ROOT, 'programs.json'), 'utf8'));
  const filas = catalogo.catalog.map(p => `<tr><td><b>${esc(p.id)}</b></td><td><code>${esc(p.file)}</code></td><td>${esc(p.sport || 'fuerza')}</td></tr>`).join('');

  // El esquema se lee de un plan real: si mañana un plan cambia de forma, la
  // tabla de la referencia lo dice sin que nadie edite el Markdown.
  const plan = JSON.parse(readFileSync(join(ROOT, 'programs/arete.json'), 'utf8'));
  const fases = Object.keys(plan).filter(k => /^\d+$/.test(k));
  const fase = plan[fases[0]];
  const [sesion, ejercicios] = Object.entries(fase.sessions)[0];
  const ejemplo = ejercicios[0];
  const camposEj = Object.keys(ejemplo);

  const esquema = [
    ['<code>1</code> … <code>4</code>', 'Una fase. `name` y `desc` para nombrarla, `sessions` con sus sesiones.'],
    ['<code>sessions</code>', `Objeto: la clave es el nombre de la sesión («${esc(sesion)}») y el valor, la lista de ejercicios.`],
    ['<code>' + camposEj.slice(0, 3).map(esc).join('</code>, <code>') + '</code>', 'Obligatorios en cada ejercicio: nombre, series y reps.'],
    ['<code>type</code>', 'Opcional: <code>main</code> para los principales, <code>assist</code> para accesorios. Solo cambia el orden visual.'],
    ['<code>reps</code>', 'Un número (<code>5</code>), un rango (<code>8-10</code>), al fallo (<code>F</code>) o un aguante (<code>2min</code>).'],
    ['<code>_meta</code>', 'Opcional: nombre y descripción que se enseñan al elegir el plan. No entra en el entrenamiento.'],
  ].map(([k, v]) => `<tr><td><code>${k}</code></td><td>${v.replace(/`([^`]+)`/g, '<code>$1</code>')}</td></tr>`).join('');

  const cita = JSON.stringify({ [fases[0]]: { name: fase.name, desc: fase.desc, sessions: { [sesion]: ejercicios.slice(0, 3) } } }, null, 1);

  return `<p class="doc-note">Plan de ejemplo: <b>${esc(plan._meta?.name || 'Areté')}</b> · ${esc(plan._meta?.desc || '')} ·
${fases.length} fases · la fase 1 trae ${Object.keys(fase.sessions).length} sesiones.</p>
<p>El esqueleto de un plan, campo a campo:</p>
<div class="doc-table"><table><thead><tr><th>Clave</th><th>Qué es</th></tr></thead><tbody>${esquema}</tbody></table></div>
<p>Así se ve una fase de verdad, recortada a tres ejercicios:</p>
<pre><code class="language-json">${esc(cita)}</code></pre>
<p>Planes que vienen con la app — el catálogo de <code>programs.json</code>:</p>
<div class="doc-table"><table><thead><tr><th>Id</th><th>Fichero</th><th>Deporte</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

function tipoDe(v) {
  if (Array.isArray(v)) return v.length && typeof v[0] === 'object'
    ? `lista de ${v.length} elementos (${Object.keys(v[0]).slice(0, 4).join(', ')}…)`
    : 'lista';
  if (v && typeof v === 'object') return 'objeto';
  if (typeof v === 'number') return 'número';
  if (typeof v === 'boolean') return 'sí/no';
  return 'texto';
}

const BLOQUES = { dominios: bloqueDominios, ejercicios: bloqueEjercicios, atajos: bloqueAtajos, planes: bloquePlanes };

// ── Lectura de las fuentes ───────────────────────────────
const GRUPOS = {
  guias: 'Guías prácticas',
  tutoriales: 'Tutoriales',
  explicacion: 'Explicación',
  referencia: 'Referencia',
  novedades: 'Novedades',
};

function hojas(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'estilos' ? [] : hojas(p);
    return /\.md$/.test(e.name) && !e.name.startsWith('_') ? [p] : [];
  });
}

const paginas = hojas(SRC).map(file => {
  const rel = relative(SRC, file).split('\\').join('/');
  const text = readFileSync(file, 'utf8');
  const { meta, body: md } = frontmatter(text, rel);
  const partes = rel.replace(/\.md$/, '').split('/');
  const grupo = partes.length > 1 ? partes[0] : 'portada';
  const esIndice = partes[partes.length - 1] === 'index';
  const slugPagina = esIndice ? '' : partes[partes.length - 1];
  const url = esIndice
    ? (partes.length > 1 ? `/ayuda/${grupo}/` : '/ayuda/')
    : `/ayuda/${grupo}/${slugPagina}/`;
  const contenido = plain(md);
  return {
    rel, url, grupo, esIndice, meta, md, contenido,
    title: meta.title || partes[partes.length - 1],
    resumen: meta.resumen || contenido.slice(0, 160).replace(/\s+\S*$/, '') + '…',
    orden: Number(meta.orden || 99),
  };
});

const porGrupo = (g) => paginas.filter(p => p.grupo === g && !p.esIndice)
  .sort((a, b) => a.orden - b.orden || a.title.localeCompare(b.title, 'es'));

const navGrupos = Object.keys(GRUPOS).map(g => ({
  key: g,
  label: GRUPOS[g],
  base: `/ayuda/${g}/`,
  items: porGrupo(g).map(p => ({ url: p.url, title: p.title })),
}));

// ── Render una página ────────────────────────────────────
const salida = new Map();

for (const p of paginas) {
  let html = render(p.md);
  // Directivas de bloque: tablas y listas que salen del código.
  html = html.replace(/<p>\{\{(\w+)\}\}<\/p>/g, (todo, clave) => {
    const fn = BLOQUES[clave];
    if (!fn) throw new Error(`${p.rel}: bloque desconocido {{${clave}}}`);
    return fn();
  }).replace(/\{\{(\w+)\}\}/g, (todo, clave) => {
    const fn = BLOQUES[clave];
    if (!fn) throw new Error(`${p.rel}: bloque desconocido {{${clave}}}`);
    return fn();
  });
  // Índices de cuadrante generados de la lista de páginas.
  html = html.replace(/<p>\{\{indice:(\w+)\}\}<\/p>/g, (todo, g) => tarjetas(g));
  html = html.replace(/\{\{indice:(\w+)\}\}/g, (todo, g) => tarjetas(g));

  const body = layout({
    url: p.url,
    title: p.title,
    resumen: p.resumen,
    lead: p.esIndice || p.grupo === 'portada' ? '' : p.resumen,
    cuadrante: p.grupo,
    meta: p.meta,
    body: html,
    grupos: navGrupos,
    indice: p.esIndice,
  });
  salida.set(join(OUT, p.url.replace(/^\/ayuda\/?/, ''), 'index.html'), body);
}

function tarjetas(grupo) {
  const items = porGrupo(grupo);
  return `<div class="doc-cards">${items.map(p => `<a class="doc-card" href="${p.url}">
  <span class="doc-card-title">${esc(p.title)}</span>
  <span class="doc-card-text">${esc(p.meta.resumen || '')}</span>
</a>`).join('\n')}</div>`;
}

// ── Índice de búsqueda (lo usa la web y Quirón) ──────────
const indice = paginas.filter(p => !p.esIndice).map(p => ({
  url: p.url,
  title: p.title,
  cuadrante: p.grupo,
  resumen: p.meta.resumen || '',
  cubre: p.meta.cubre || '',
  texto: p.contenido.slice(0, 900),
}));
indice.sort((a, b) => a.url.localeCompare(b.url));
salida.set(join(OUT, 'indice.json'), JSON.stringify(indice, null, 1) + '\n');

// ── Hojas y script propios ───────────────────────────────
for (const f of ['ayuda.css', 'ayuda.js']) {
  const src = join(SRC, 'estilos', f);
  if (!existsSync(src)) throw new Error(`falta docs/ayuda/estilos/${f}`);
  salida.set(join(OUT, f), readFileSync(src, 'utf8'));
}

// ── Escritura o comprobación ─────────────────────────────
function existentes(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    return e.isDirectory() ? existentes(p) : [p];
  });
}

const enDisco = new Map(existentes(OUT).map(f => [f, readFileSync(f, 'utf8')]));
const faltan = [...salida.keys()].filter(f => !enDisco.has(f));
const cambian = [...salida.keys()].filter(f => enDisco.has(f) && enDisco.get(f) !== salida.get(f));
const sobran = [...enDisco.keys()].filter(f => !salida.has(f));

if (CHECK) {
  const rel = (f) => relative(ROOT, f);
  for (const f of faltan) console.error(`falta    ${rel(f)}`);
  for (const f of cambian) console.error(`cambia   ${rel(f)}`);
  for (const f of sobran) console.error(`sobra    ${rel(f)}`);
  if (faltan.length || cambian.length || sobran.length) {
    console.error(`\n✖ ayudas desincronizadas (${faltan.length + cambian.length + sobran.length}).`);
    console.error('  Regenera con: node scripts/build-ayuda.mjs');
    process.exit(1);
  }
  console.log(`✓ ayuda al día (${salida.size} ficheros)`);
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [f, contenido] of salida) {
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, contenido);
  }
  console.log(`✓ ayuda generada: ${salida.size} ficheros en ${relative(ROOT, OUT)}/`);
}
