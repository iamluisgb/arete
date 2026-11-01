// La landing promete cosas: estas comprobaciones impiden que vuelva a prometer
// lo que la app no hace (GPS en el navegador, "sin servidor" con Quirón por
// medio) y que se rompa lo que hace que se descubra y se comparta bien.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<body'));
const text = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

describe('landing', () => {
  it('no promete lo que no es cierto', () => {
    expect(text).not.toMatch(/no tiene servidor propio/i);
    expect(text).not.toMatch(/GPS tracker/i);
    expect(text).not.toMatch(/Atleta Híbrido · Nivel II/);   // el nivel II se llama Novato
  });

  it('dice qué es y enseña a Quirón', () => {
    expect(text).toMatch(/App gratis de entrenamiento híbrido/);
    expect(body).toContain('href="app.html#quiron"');
    expect(text).toMatch(/Conversación de ejemplo/);
    expect(text).toMatch(/¿Sirve si soy mujer\?/);
  });

  it('compartir: imagen 1200×630 que existe', () => {
    expect(html).toContain('content="https://arete.raiatech.com/assets/landing/og.png"');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(existsSync('assets/landing/og.png')).toBe(true);
    expect(existsSync('assets/landing/perfil-ejemplo.webp')).toBe(true);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    expect(ld['@type']).toBe('SoftwareApplication');
    expect(ld.offers.price).toBe('0');
  });

  it('los fotogramas 3D que anima existen', () => {
    for (const id of [...body.matchAll(/data-frames="([^"]+)"/g)].map(m => m[1]))
      for (const i of [0, 1, 2, 3]) expect(existsSync(`assets/anim3d/frames/${id}-${i}.webp`)).toBe(true);
  });

  it('404, robots y sitemap se publican', () => {
    const build = readFileSync('scripts/build-pages.mjs', 'utf8');
    for (const f of ['404.html', 'robots.txt', 'sitemap.xml']) {
      expect(existsSync(f)).toBe(true);
      expect(build).toContain(`'${f}'`);
    }
    expect(readFileSync('robots.txt', 'utf8')).toMatch(/Sitemap: https:\/\/arete\.raiatech\.com\/sitemap\.xml/);
    const locs = [...readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>https:\/\/arete\.raiatech\.com\/([^<]*)<\/loc>/g)].map(m => m[1]);
    // Pages sirve /blog/x.html como /blog/x (308): el sitemap lleva la URL final.
    for (const l of locs) {
      expect(l).not.toMatch(/\.html$/);
      expect(existsSync(l === '' || l.endsWith('/') ? l + 'index.html' : l + '.html')).toBe(true);
    }
  });
});
