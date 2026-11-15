// La ayuda no es un adorno: es un artefacto generado que se sirve tal cual.
// Estos tests son lo que impide que se desincronice del código y del HTML de la
// app — la deriva se ve aquí, no en producción.
//
//  1. El HTML commiteado es el que produciría el Markdown de hoy.
//  2. No hay enlaces rotos (ni desde la ayuda ni desde la app).
//  3. Las tablas de referencia son las del código.
//  4. Cada artículo dice qué pantalla cubre, y ese control existe de verdad.
//  5. No queda sintaxis de Markdown sin renderizar.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOMAINS, RETEST_DAYS } from '../js/domains.js';
import { EXERCISE_ONTOLOGY } from '../js/exercise-ontology.js';
import { ATAJOS } from '../js/shortcuts-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AYUDA = join(ROOT, 'ayuda');
const DOCS = join(ROOT, 'docs/ayuda');

const paginasHtml = () => {
  const out = [];
  const andar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  andar(AYUDA);
  return out;
};

const frontmatters = () => {
  const out = [];
  const andar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'estilos') andar(p); }
      else if (e.name.endsWith('.md')) out.push(p);
    }
  };
  andar(DOCS);
  return out;
};

const campo = (texto, clave) => {
  const m = new RegExp(`^${clave}:\\s*(.+)$`, 'm').exec(texto);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
};

/** Resuelve una URL pública a un fichero del repo; null si no es comprobable. */
function ficheroDe(url) {
  if (!url || url.startsWith('#') || /^(https?:|mailto:|tel:)/.test(url)) return null;
  const path = url.split('#')[0].split('?')[0];
  if (path === '/build.json') return null; // lo genera el deploy, no el repo
  if (path.endsWith('/')) return join(ROOT, path, 'index.html');
  return join(ROOT, path);
}

describe('ayuda: generación', () => {
  it('el HTML servido es el que produce el Markdown de hoy', () => {
    // `--check` compara byte a byte y sale con 1 si hay deriva.
    expect(() => execFileSync(process.execPath, ['scripts/build-ayuda.mjs', '--check'], {
      cwd: ROOT, stdio: 'pipe',
    })).not.toThrow();
  });

  it('hay una página por artículo y una entrada de índice por página', () => {
    const articulos = frontmatters().filter(f => !f.endsWith('index.md'));
    const indice = JSON.parse(readFileSync(join(AYUDA, 'indice.json'), 'utf8'));
    expect(indice.length).toBe(articulos.length);
    for (const it of indice) {
      expect(existsSync(join(AYUDA, it.url.replace(/^\/ayuda\/?/, ''), 'index.html'))).toBe(true);
      expect(it.title.length).toBeGreaterThan(3);
      expect(it.resumen.length).toBeGreaterThan(20);
    }
  });
});

describe('ayuda: enlaces', () => {
  it('todo enlace interno de la ayuda resuelve a un fichero', () => {
    const rotos = [];
    for (const f of paginasHtml()) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const destino = ficheroDe(m[1]);
        if (destino && !existsSync(destino)) {
          rotos.push(`${relative(ROOT, f)} → ${m[1]}`);
        }
      }
    }
    expect(rotos).toEqual([]);
  });

  it('todo enlace de la app a la ayuda apunta a una página que existe', () => {
    const rotos = [];
    const fuentes = [
      join(ROOT, 'app.html'),
      ...readdirSync(join(ROOT, 'js/ui')).map(n => join(ROOT, 'js/ui', n)),
      ...readdirSync(join(ROOT, 'js')).filter(n => n.endsWith('.js')).map(n => join(ROOT, 'js', n)),
    ];
    for (const f of fuentes) {
      if (!existsSync(f) || !statSync(f).isFile()) continue;
      const texto = readFileSync(f, 'utf8');
      for (const m of texto.matchAll(/["'`](\/ayuda\/[^"'`\s]*)/g)) {
        const destino = ficheroDe(m[1]);
        if (destino && !existsSync(destino)) rotos.push(`${relative(ROOT, f)} → ${m[1]}`);
      }
    }
    expect(rotos).toEqual([]);
  });
});

describe('ayuda: referencia generada', () => {
  const leer = (ruta) => readFileSync(join(AYUDA, ruta, 'index.html'), 'utf8');

  it('la tabla de dominios trae los 7 dominios y sus 13 métricas', () => {
    const html = leer('referencia/dominios');
    for (const d of DOMAINS) {
      expect(html).toContain(d.name);
      const escapado = (t) => t.replace(/&/g, '&amp;');
      for (const m of d.metrics) expect(html).toContain(escapado(m.label));
    }
    // Cada umbral, en formato español (coma decimal). Un dominio umbral no
    // tiene escalera y un indicador no da nivel: la tabla tiene que decir la
    // regla que aplica la app, no cinco columnas que no usa.
    for (const d of DOMAINS) {
      for (const m of d.metrics) {
        if (m.gate) {
          expect(html.toLowerCase()).toContain('umbral');
          expect(html).toContain(String(m.gate.sufficient).replace('.', ','));
          continue;
        }
        if (m.indicator) {
          expect(html.toLowerCase()).toContain('indicador');
          expect(html).toContain('no da nivel');
          continue;
        }
        for (const v of m.levels) expect(html).toContain(String(v).replace('.', ','));
      }
    }
    // La plancha lateral se mide por lado: el nombre lo dice.
    expect(html).toContain('peor lado');
    expect(html).toContain(`${RETEST_DAYS.cheap} días`);
    expect(html).toContain(`${RETEST_DAYS.expensive} días`);
  });

  it('el catálogo de ejercicios tiene una fila por ejercicio de la ontología', () => {
    const html = leer('referencia/ejercicios');
    const filas = (html.match(/<tr>/g) || []).length;
    // +1 de la cabecera
    expect(filas).toBe(EXERCISE_ONTOLOGY.length + 1);
    expect(html).toContain(`${EXERCISE_ONTOLOGY.length} ejercicios`);
  });

  it('el sitemap de la ayuda lista todas sus páginas y robots lo declara', () => {
    const sitemap = readFileSync(join(AYUDA, 'sitemap.xml'), 'utf8');
    for (const f of paginasHtml()) {
      const rel = relative(AYUDA, f).replace(/index\.html$/, '');
      expect(sitemap).toContain(`https://arete.raiatech.com/ayuda/${rel}`);
    }
    const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
    expect(robots).toContain('https://arete.raiatech.com/ayuda/sitemap.xml');
  });

  it('los atajos publicados son los del código', () => {
    const html = leer('referencia/atajos');
    for (const a of ATAJOS) {
      expect(html).toContain(a.tecla);
      expect(html).toContain(a.que);
    }
  });
});

describe('ayuda: procedencia', () => {
  it('cada artículo declara cuadrante, fecha y la pantalla que cubre', () => {
    const faltan = [];
    for (const f of frontmatters()) {
      if (f.endsWith('index.md')) continue;
      const texto = readFileSync(f, 'utf8');
      const rel = relative(DOCS, f);
      for (const clave of ['title', 'author', 'reviewed_on', 'cuadrante', 'resumen']) {
        if (!campo(texto, clave)) faltan.push(`${rel}: falta ${clave}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(campo(texto, 'reviewed_on') || '')) faltan.push(`${rel}: reviewed_on no es fecha`);
    }
    expect(faltan).toEqual([]);
  });

  it('el selector que declara cada artículo existe en la app', () => {
    // El control puede vivir en el HTML o nacer en JS (el runner de sesión, la
    // gráfica de peso): lo que se exige es que exista de verdad, no dónde.
    const app = readFileSync(join(ROOT, 'app.html'), 'utf8') + '\n' + readdirSync(join(ROOT, 'js/ui'))
      .map(n => readFileSync(join(ROOT, 'js/ui', n), 'utf8')).join('\n');
    const faltan = [];
    for (const f of frontmatters()) {
      const texto = readFileSync(f, 'utf8');
      const selector = campo(texto, 'selector');
      if (!selector) continue;
      if (!selector.startsWith('#')) { faltan.push(`${relative(DOCS, f)}: selector sin #`); continue; }
      const id = selector.slice(1);
      // Vale tanto el HTML (`id="x"`) como el control que nace en JS (`btn.id = 'x'`).
      const existe = new RegExp(`id="${id}"|id\\s*=\\s*['"]${id}['"]`).test(app);
      if (!existe) faltan.push(`${relative(DOCS, f)}: ${selector} no existe`);
    }
    expect(faltan).toEqual([]);
  });

  it('cada artículo muestra su barra de procedencia y su selector humano', () => {
    const html = readFileSync(join(AYUDA, 'guias/primera-sesion/index.html'), 'utf8');
    expect(html).toContain('Revisado');
    expect(html).toContain('Cubre');
    expect(html).toContain('Entrenar · Fuerza');
    expect(html).not.toContain('#secStrength');
  });
});

describe('ayuda: render', () => {
  it('no queda sintaxis de Markdown ni directivas sin sustituir', () => {
    const sucios = [];
    for (const f of paginasHtml()) {
      const html = readFileSync(f, 'utf8');
      const rel = relative(AYUDA, f);
      if (html.includes('{{')) sucios.push(`${rel}: directiva sin sustituir`);
      // Negritas sin renderizar dentro de un párrafo (los bloques de código se excluyen).
      const sinCodigo = html.replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');
      if (/\*\*[^*]+\*\*/.test(sinCodigo)) sucios.push(`${rel}: negrita sin renderizar`);
      if (/\]\([^)]+\)/.test(sinCodigo)) sucios.push(`${rel}: enlace sin renderizar`);
    }
    expect(sucios).toEqual([]);
  });

  it('cada página tiene título, descripción y canonical', () => {
    const faltan = [];
    for (const f of paginasHtml()) {
      const html = readFileSync(f, 'utf8');
      const rel = relative(AYUDA, f);
      if (!/<title>[^<]{10,}<\/title>/.test(html)) faltan.push(`${rel}: title`);
      if (!/<meta name="description" content="[^"]{20,}"/.test(html)) faltan.push(`${rel}: description`);
      if (!/<link rel="canonical" href="https:\/\/arete\.raiatech\.com\/ayuda/.test(html)) faltan.push(`${rel}: canonical`);
    }
    expect(faltan).toEqual([]);
  });
});
