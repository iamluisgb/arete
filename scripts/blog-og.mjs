#!/usr/bin/env node
// Genera las imágenes sociales (1200×630) en assets/blog/og/<slug>.png (blog) y
// protocolo-<slug>.png (protocolos) a partir de ARTICLES y PROTOCOLOS de blog-sync.mjs. Necesita Playwright; si no está en este
// repo: PLAYWRIGHT=/ruta/a/node_modules/playwright/index.mjs node scripts/blog-og.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { ARTICLES, PROTOCOLOS } from './blog-sync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright');
const b64 = f => readFileSync(join(ROOT, f)).toString('base64');
const logo = `data:image/png;base64,${b64('assets/icons/icon-192.png')}`;
const luis = `data:image/webp;base64,${b64('assets/landing/luis.webp')}`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const page = (a, kind = 'Blog', path = 'blog') => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#f4f2f0;font-family:Inter,'Helvetica Neue',system-ui,sans-serif;color:#1c1b1b;padding:64px 72px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:800;letter-spacing:-.02em}
.top img{width:44px;height:44px;border-radius:10px}.top span{color:#d4372c}
.top em{font-style:normal;font-weight:600;font-size:22px;color:#7b6763}
.tag{margin-top:auto;font-size:22px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#d4372c}
h1{font-size:${a.title.length > 26 ? 76 : 88}px;line-height:1.02;letter-spacing:-.035em;font-weight:800;margin:14px 0 20px;max-width:960px}
p{font-size:28px;line-height:1.35;color:#6a5652;max-width:900px}
.by{display:flex;align-items:center;gap:12px;margin-top:40px;font-size:22px;color:#6a5652;font-weight:600}
.by img{width:40px;height:40px;border-radius:50%}
.ring{position:absolute;right:-120px;top:-120px;width:460px;height:460px;border-radius:50%;border:2px solid rgba(212,55,44,.14)}
.ring.b{right:-60px;top:-60px;width:340px;height:340px}
</style></head><body><div class="ring"></div><div class="ring b"></div>
<div class="top"><img src="${logo}"><b>Aret<span>é</span></b><em>· ${kind}</em></div>
<div class="tag">${esc(a.tag)}</div><h1>${esc(a.title)}</h1><p>${esc(a.desc)}</p>
<div class="by"><img src="${luis}">Luis González · arete.raiatech.com/${path}</div>
</body></html>`;

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const a of ARTICLES) {
  await p.setContent(page(a), { waitUntil: 'load' });
  await p.screenshot({ path: join(ROOT, 'assets/blog/og', `${a.slug}.png`) });
  console.log('og', a.slug);
}
for (const a of PROTOCOLOS) {
  await p.setContent(page(a, 'Protocolos', 'protocolos'), { waitUntil: 'load' });
  await p.screenshot({ path: join(ROOT, 'assets/blog/og', `protocolo-${a.slug}.png`) });
  console.log('og', 'protocolo-' + a.slug);
}
await browser.close();
