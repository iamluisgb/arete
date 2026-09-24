// Layout probe: sirve el repo en local y vuelca geometría + captura de Hoy.
// Uso: python3 -m http.server 8017 & node tools/ui-probe.mjs [width]
// Sirve para cazar bugs de layout que ni jsdom ni el ojo sobre código ven.
import puppeteer from 'puppeteer-core';
const WIDTH = Number(process.argv[2] || 1600);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-first-run','--user-data-dir=/tmp/pptr-prof-${Date.now()}'],
});
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: 1400 });
await page.goto('http://localhost:8017/app.html#secDashboard', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 2500));
const data = await page.evaluate(() => {
  const sec = document.getElementById('secDashboard');
  const out = { children: [], starterStyles: {}, levelStyles: {} };
  for (const el of sec.children) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.children.push({
      id: el.id || el.className || el.tagName,
      col: cs.gridColumnStart, row: cs.gridRowStart, rowEnd: cs.gridRowEnd,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  const st = document.querySelector('.dash-starter');
  if (st) {
    const cs = getComputedStyle(st);
    out.starterStyles = { display: cs.display, gap: cs.gap, padding: cs.padding };
    const head = st.querySelector('.dash-starter-head');
    if (head) { const h = getComputedStyle(head); out.starterStyles.headJustify = h.justifyContent; out.starterStyles.headDisplay = h.display; }
    const hr = st.querySelector('.dash-starter-head')?.getBoundingClientRect();
    out.starterStyles.headRect = hr ? { x: Math.round(hr.x), y: Math.round(hr.y) } : null;
  }
  const lv = document.querySelector('.dash-level');
  const lr = lv?.getBoundingClientRect();
  out.levelStyles.rect = lr ? { x: Math.round(lr.x), y: Math.round(lr.y), h: Math.round(lr.height) } : null;
  out.secDisplay = getComputedStyle(sec).display;
  return out;
});
console.log(JSON.stringify(data, null, 1));
await page.screenshot({ path: `/tmp/arete-probe-${WIDTH}.png` });
await browser.close();
