import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARTICLES, syncAll } from '../scripts/blog-sync.mjs';

const read = f => readFileSync(resolve(process.cwd(), f), 'utf-8');

describe('blog', () => {
  it('lo generado está al día (node scripts/blog-sync.mjs)', () => {
    for (const [file, html] of syncAll()) expect(readFileSync(file, 'utf-8'), file).toBe(html);
  });

  it('cada artículo tiene firma, BlogPosting, imagen social 1200×630 y blog.js', () => {
    for (const a of ARTICLES) {
      const html = read(`blog/${a.slug}.html`);
      expect(html).toContain('class="byline"');
      expect(html).toContain('"@type":"BlogPosting"');
      expect(html).toContain(`assets/blog/og/${a.slug}.png`);
      expect(html).toContain('<meta property="og:image:width" content="1200">');
      expect(html).toContain('<script src="blog.js" defer></script>');
      expect(html).not.toContain('Última revisión');
      const png = readFileSync(resolve(process.cwd(), `assets/blog/og/${a.slug}.png`));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    }
  });

  it('sin promesas que la app no cumple', () => {
    for (const f of ['blog/index.html', ...ARTICLES.map(a => `blog/${a.slug}.html`)]) {
      expect(read(f)).not.toMatch(/GPS tracker/i);
    }
    expect(read('blog/nutricion.html')).toContain('Marcos Vázquez');
  });

  it('el índice enlaza todos los artículos y etiqueta el perfil de ejemplo', () => {
    const idx = read('blog/index.html');
    for (const a of ARTICLES) expect(idx).toContain(`href="${a.slug}.html"`);
    expect(idx).toContain('<figcaption>Perfil de ejemplo</figcaption>');
  });

  it('texto legible y sin barras de acento laterales', () => {
    const css = read('style.css');
    expect(css).not.toMatch(/border-left:\s*\d/);
    expect(css).toMatch(/--text2:#6a5652/);
    expect(css).toMatch(/\.article-body p\{[^}]*color:var\(--ink-body\)/);
  });

  it('blog.js está precacheado', () => {
    expect(read('sw.js')).toContain("'./blog/blog.js'");
    expect(existsSync(resolve(process.cwd(), 'blog/blog.js'))).toBe(true);
  });
});
