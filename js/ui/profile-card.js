// ── Tarjeta de perfil: el heptágono de los 7 dominios para compartir ──
//
// Las tarjetas de sesión dicen lo mismo que Strava. Esta dice lo único que solo
// dice Areté: tu nivel es el de tu dominio más bajo, y cuál es. Es una tarjeta
// de identidad ("soy Intermedio, me frena la movilidad"), no de actividad, y
// termina en una pregunta al que la ve: "¿Cuál es el tuyo?".
//
// Todo es canvas y sin red. Las funciones de datos son puras (se testean sin
// DOM); el dibujo recibe `t` de 0 a 1 para que la misma función sirva para la
// imagen fija (t = 1), la animación y el vídeo.

import { DOMAINS, ROMAN, LEVEL_NAMES } from '../domains.js';

export const SHARE_URL = 'arete.raiatech.com';
const FONT = "'Inter', -apple-system, system-ui, sans-serif";

// ── Datos ────────────────────────────────────────────────

/** Niveles por dominio, eslabones débiles y estado, a partir de un mapa id → nivel. */
function snapshot(levels, total = DOMAINS.length) {
  const medidos = DOMAINS.filter(d => levels[d.id] > 0);
  const global = medidos.length ? Math.min(...medidos.map(d => levels[d.id])) : 0;
  return {
    levels,
    global,
    // Todos los empatados en el mínimo: elegir uno sería inventarse el orden.
    weak: medidos.filter(d => levels[d.id] === global),
    measured: medidos.length,
    total,
    provisional: medidos.length < total,
  };
}

/**
 * Lo que dibuja la tarjeta. `profile` es el de computeProfile; con `raised`
 * (un dominio) y `from` (su nivel anterior) es la tarjeta de subida de nivel.
 */
export function profileCardData(profile, { raised = null, from = 0 } = {}) {
  const levels = Object.fromEntries(profile.domains.map(d => [d.id, d.level]));
  const now = snapshot(levels, profile.total);
  if (!raised || !(from > 0)) return { now, before: null, raised: null };
  // Antes = ahora con el dominio que sube en su nivel anterior: la forma vieja
  // solo difiere en ese vértice, que es justo lo que hay que ver moverse.
  const before = snapshot({ ...levels, [raised.id]: from }, profile.total);
  return { now, before, raised: DOMAINS.find(d => d.id === raised.id) || raised };
}

/** El texto de la tarjeta según el momento. */
export function cardCopy({ now, before, raised }) {
  if (before) {
    const up = now.global > before.global;
    return {
      kicker: 'Subida de nivel',
      hero: ROMAN[up ? now.global : now.levels[raised.id]],
      heroName: up ? LEVEL_NAMES[now.global] : raised.name,
      note: '',
      lineLabel: up ? 'Ya no me frena' : 'Sube',
      line: up ? raised.name : `${ROMAN[before.levels[raised.id]]} → ${ROMAN[now.levels[raised.id]]}`,
      cta: '¿En qué nivel estás tú?',
      ref: 'subida',
    };
  }
  return {
    kicker: `Perfil · ${new Date().toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '')}`,
    hero: ROMAN[now.global],
    heroName: LEVEL_NAMES[now.global],
    note: now.provisional ? `Provisional · ${now.measured} de ${now.total} dominios medidos` : '',
    lineLabel: now.weak.length > 1 ? 'Mis eslabones débiles' : 'Mi eslabón débil',
    // Con tres o más empatados los nombres largos no caben en una línea legible.
    line: now.weak.map(d => (now.weak.length > 2 ? d.short : d.name)).join(' · '),
    cta: '¿Cuál es el tuyo?',
    ref: 'perfil',
  };
}

/** El texto que acompaña a la imagen en la hoja de compartir. */
export function shareText(card) {
  const c = cardCopy(card);
  return `${c.lineLabel}: ${c.line}. ${c.cta} https://${SHARE_URL}/?ref=${c.ref}`;
}

// ── Subidas de nivel ─────────────────────────────────────
//
// Se compara contra el MÁXIMO que el atleta ya ha visto en cada dominio, no
// contra el último valor: si un ratio de fuerza baja porque subió el peso
// corporal y luego vuelve, eso no es una subida que celebrar otra vez.

const SEEN_KEY = 'areteLevelsSeen';

export function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY)); } catch { return null; }
}

export function markSeen(profile, seen = readSeen()) {
  const next = { ...(seen || {}) };
  for (const d of profile.domains) next[d.id] = Math.max(next[d.id] || 0, d.level);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch {}
  return next;
}

/**
 * El dominio que ha superado su máximo visto, o null. Medir un dominio por
 * primera vez (0 → N) no es una subida. Si suben varios a la vez, gana el que
 * venía más abajo: es el que más cerca estaba de ser el eslabón débil.
 */
export function levelUpSince(seen, profile) {
  if (!seen) return null;
  const subidas = profile.domains
    .filter(d => seen[d.id] > 0 && d.level > seen[d.id])
    .sort((a, b) => seen[a.id] - seen[b.id]);
  return subidas.length ? { raised: subidas[0], from: seen[subidas[0].id] } : null;
}

// ── Dibujo ───────────────────────────────────────────────

const THEMES = {
  dark: {
    bg: ['#0f0f0f', '#181818', '#0b0b0b'], text: '#ffffff', sub: o => `rgba(255,255,255,${o})`,
    accent: '#ff5545', accentSoft: 'rgba(255,85,69,.18)', glow: 'rgba(212,55,44,.10)',
    fill: 'rgba(255,255,255,.14)', stroke: 'rgba(255,255,255,.9)', ring: 'rgba(255,255,255,.09)',
  },
  light: {
    bg: ['#f5f5f7', '#ffffff', '#efeff2'], text: '#1d1d1f', sub: o => `rgba(0,0,0,${o})`,
    accent: '#d4372c', accentSoft: 'rgba(212,55,44,.14)', glow: 'rgba(212,55,44,.07)',
    fill: 'rgba(0,0,0,.08)', stroke: 'rgba(0,0,0,.85)', ring: 'rgba(0,0,0,.09)',
  },
};
// El adhesivo va encima de una foto cualquiera: todo en blanco con sombra.
const STICKER = { ...THEMES.dark, sub: () => '#ffffff', fill: 'rgba(255,255,255,.22)', ring: 'rgba(255,255,255,.28)' };

const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const span = (t, a, b) => ease((t - a) / (b - a));

function text(ctx, s, x, y, { size = 32, weight = 600, color, align = 'center', spacing = 0, italic = false, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${spacing}em`;
  if (italic) { ctx.transform(1, 0, -0.14, 1, 0, 0); x += y * 0.14; }
  ctx.fillText(s, x, y);
  ctx.restore();
}

function textWidth(ctx, s, size, weight, spacing = 0) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.letterSpacing = `${spacing}em`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** Encoge el texto hasta que cabe en el ancho dado. */
function fit(ctx, s, max, size, weight) {
  while (size > 24 && textWidth(ctx, s, size, weight) > max) size -= 2;
  return size;
}

function wrap(ctx, s, x, y, max, size, weight, color, alpha) {
  let line = '', yy = y;
  for (const w of s.split(' ')) {
    const test = line ? `${line} ${w}` : w;
    if (textWidth(ctx, test, size, weight) > max && line) {
      text(ctx, line, x, yy, { size, weight, color, align: 'left', alpha });
      line = w; yy += size * 1.2;
    } else line = test;
  }
  text(ctx, line, x, yy, { size, weight, color, align: 'left', alpha });
}

function pill(ctx, s, x, y, { bg, color, size = 24 }) {
  const w = textWidth(ctx, s.toUpperCase(), size, 700, 0.08) + size * 1.8, h = size * 1.8;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  text(ctx, s.toUpperCase(), x + w / 2, y + h / 2 + 1, { size, weight: 700, color, spacing: 0.08 });
}

const angle = i => -Math.PI / 2 + i * 2 * Math.PI / DOMAINS.length;
const pt = (cx, cy, r, i) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

function polygon(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

function radar(ctx, cx, cy, R, { now, before, raised }, th, t, labelSize) {
  const weakIds = new Set(now.weak.map(d => d.id));
  const rFor = lvl => R * lvl / 5;
  const hotFor = d => (before ? d.id === raised.id : weakIds.has(d.id));

  // Anillos I..V y radios; el radio de un dominio sin medir va punteado.
  ctx.save(); ctx.globalAlpha = span(t, 0, 0.25);
  for (let k = 1; k <= 5; k++) {
    polygon(ctx, DOMAINS.map((_, i) => pt(cx, cy, R * k / 5, i)));
    ctx.strokeStyle = th.ring; ctx.lineWidth = k === 5 ? 2.5 : 1.5; ctx.stroke();
  }
  DOMAINS.forEach((d, i) => {
    const [x, y] = pt(cx, cy, R, i);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y);
    ctx.setLineDash(now.levels[d.id] ? [] : [6, 8]);
    ctx.strokeStyle = th.ring; ctx.lineWidth = 1.5; ctx.stroke();
  });
  ctx.restore();

  // Un dominio sin medir no es nivel 0 (ver computeProfile): la forma pasa solo
  // por los medidos, o hundiría el eje en el centro y se leería como debilidad.
  const medidos = DOMAINS.map((d, i) => i).filter(i => now.levels[DOMAINS[i].id] > 0);

  if (before) {
    ctx.save(); ctx.globalAlpha = span(t, 0.15, 0.35) * 0.8;
    polygon(ctx, medidos.map(i => pt(cx, cy, rFor(before.levels[DOMAINS[i].id]), i)));
    ctx.setLineDash([10, 10]); ctx.strokeStyle = th.sub(.45); ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  // Cada eje crece con un pequeño desfase; en la subida solo se mueve el que sube.
  const shape = DOMAINS.map((d, i) => {
    if (before) {
      const g = d.id === raised.id ? span(t, 0.45, 0.75) : 1;
      return pt(cx, cy, rFor(before.levels[d.id] + (now.levels[d.id] - before.levels[d.id]) * g), i);
    }
    return pt(cx, cy, rFor(now.levels[d.id]) * span(t, 0.15 + i * 0.03, 0.55 + i * 0.03), i);
  });
  if (medidos.length >= 2) {
    polygon(ctx, medidos.map(i => shape[i]));
    ctx.fillStyle = th.fill; ctx.fill();
    ctx.lineJoin = 'round'; ctx.strokeStyle = th.stroke; ctx.lineWidth = 4; ctx.stroke();
  }

  // Vértices: el eslabón débil (o el que sube) late en rojo.
  const pulse = t >= 0.7 ? 0.5 + 0.5 * Math.sin((t - 0.7) * 18) : 0;
  for (const i of medidos) {
    const [x, y] = shape[i];
    const hot = hotFor(DOMAINS[i]);
    if (hot && t >= 0.6) {
      ctx.beginPath(); ctx.arc(x, y, 22 + 14 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = th.accentSoft; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, hot ? 13 : 9, 0, Math.PI * 2);
    ctx.fillStyle = hot ? th.accent : th.stroke; ctx.fill();
  }

  const la = span(t, 0.3, 0.6);
  DOMAINS.forEach((d, i) => {
    const c = Math.cos(angle(i)), s = Math.sin(angle(i));
    const [x, y] = pt(cx, cy, R + labelSize * 2.1, i);
    const align = Math.abs(c) < 0.2 ? 'center' : c > 0 ? 'left' : 'right';
    const dy = s < -0.9 ? -labelSize * 0.9 : s > 0.6 ? labelSize * 0.5 : 0;
    const lvl = now.levels[d.id];
    const hot = hotFor(d);
    const val = before && d.id === raised.id ? `${ROMAN[before.levels[d.id]]} → ${ROMAN[lvl]}` : lvl ? ROMAN[lvl] : '—';
    text(ctx, d.short, x, y + dy - labelSize * 0.62, { size: labelSize, weight: 600, color: hot ? th.accent : th.sub(.6), align, alpha: la });
    text(ctx, val, x, y + dy + labelSize * 0.68, { size: labelSize * 1.3, weight: 800, color: hot ? th.accent : th.text, align, alpha: la });
  });
}

function background(ctx, W, H, th) {
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  th.bg.forEach((c, i) => g.addColorStop(i / (th.bg.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, W * 0.8);
  r.addColorStop(0, th.glow); r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
}

const brand = (ctx, x, y, th, align = 'right', size = 30) =>
  text(ctx, 'ARETÉ', x, y, { size, weight: 800, color: th.accent, align, spacing: 0.1, italic: true });

function renderStory(ctx, W, H, card, th, t) {
  background(ctx, W, H, th);
  const c = cardCopy(card);
  pill(ctx, c.kicker, 64, 60, card.before ? { bg: th.accent, color: '#fff' } : { bg: th.sub(.07), color: th.sub(.65) });
  brand(ctx, W - 64, 102, th);

  const a = span(t, 0.55, 0.8);
  text(ctx, 'mi nivel', W / 2, 220, { size: 32, weight: 600, color: th.sub(.5), spacing: 0.04, alpha: a });
  text(ctx, c.hero, W / 2, 360, { size: 220, weight: 900, color: th.text, italic: true, alpha: a });
  text(ctx, c.heroName, W / 2, 505, { size: fit(ctx, c.heroName, W - 160, 64, 800), weight: 800, color: th.accent, italic: true, alpha: a });
  if (c.note) text(ctx, c.note, W / 2, 565, { size: 26, weight: 600, color: th.sub(.5), alpha: a });

  radar(ctx, W / 2, 1050, 270, card, th, t, 30);

  const b = span(t, 0.7, 0.95);
  text(ctx, c.lineLabel.toLowerCase(), W / 2, 1490, { size: 30, weight: 600, color: th.sub(.5), spacing: 0.04, alpha: b });
  text(ctx, c.line, W / 2, 1550, { size: fit(ctx, c.line, W - 140, 60, 800), weight: 800, color: th.text, alpha: b });
  text(ctx, 'Tu nivel es el de tu dominio más bajo.', W / 2, 1615, { size: 28, weight: 400, color: th.sub(.5), alpha: b });

  const d = span(t, 0.85, 1);
  ctx.save(); ctx.globalAlpha = d;
  ctx.beginPath(); ctx.roundRect(64, 1695, W - 128, 150, 28); ctx.fillStyle = th.sub(.06); ctx.fill();
  ctx.restore();
  text(ctx, c.cta, W / 2, 1750, { size: 40, weight: 800, color: th.text, alpha: d });
  text(ctx, `Mide tus 7 dominios en ${SHARE_URL}`, W / 2, 1803, { size: 26, weight: 600, color: th.accent, alpha: d });
}

function renderSquare(ctx, W, H, card, th, t) {
  background(ctx, W, H, th);
  const c = cardCopy(card);
  pill(ctx, c.kicker, 56, 52, card.before ? { bg: th.accent, color: '#fff', size: 20 } : { bg: th.sub(.07), color: th.sub(.65), size: 20 });
  brand(ctx, W - 56, 88, th, 'right', 26);

  const a = span(t, 0.55, 0.8);
  text(ctx, 'mi nivel', 70, 230, { size: 26, weight: 600, color: th.sub(.5), spacing: 0.04, align: 'left', alpha: a });
  text(ctx, c.hero, 64, 345, { size: 170, weight: 900, color: th.text, italic: true, align: 'left', alpha: a });
  text(ctx, c.heroName, 70, 470, { size: fit(ctx, c.heroName, 360, 44, 800), weight: 800, color: th.accent, italic: true, align: 'left', alpha: a });
  if (c.note) wrap(ctx, c.note, 70, 520, 330, 20, 600, th.sub(.5), a);

  const b = span(t, 0.7, 0.95);
  text(ctx, c.lineLabel.toLowerCase(), 70, 610, { size: 26, weight: 600, color: th.sub(.5), spacing: 0.04, align: 'left', alpha: b });
  wrap(ctx, c.line, 70, 660, 370, 40, 800, th.text, b);

  const d = span(t, 0.85, 1);
  text(ctx, c.cta, 70, 930, { size: 32, weight: 800, color: th.text, align: 'left', alpha: d });
  text(ctx, SHARE_URL, 70, 978, { size: 24, weight: 600, color: th.accent, align: 'left', alpha: d });

  radar(ctx, 690, 560, 190, card, th, t, 22);
}

function renderSticker(ctx, W, H, card, th, t) {
  const c = cardCopy(card);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;
  radar(ctx, W / 2, 470, 270, card, th, t, 26);
  const a = span(t, 0.55, 0.85);
  const head = `${c.hero} · ${c.heroName}`;
  const sub = `${c.lineLabel}: ${c.line}`;
  text(ctx, head, W / 2, 900, { size: fit(ctx, head, W - 120, 64, 900), weight: 900, color: '#fff', italic: true, alpha: a });
  text(ctx, sub, W / 2, 975, { size: fit(ctx, sub, W - 120, 30, 700), weight: 700, color: '#fff', alpha: a });
  ctx.restore();
  brand(ctx, W / 2, 1035, th, 'center', 30);
}

/** Tamaño del lienzo: el adhesivo siempre es cuadrado. */
export function cardSize(preset, format) {
  return preset === 'sticker' || format === '1:1' ? { W: 1080, H: 1080 } : { W: 1080, H: 1920 };
}

/** Dibuja la tarjeta en el instante `t` de su animación (1 = la imagen final). */
export function renderProfileCard(ctx, W, H, card, { preset = 'minimal', theme = 'dark' } = {}, t = 1) {
  ctx.clearRect(0, 0, W, H);
  if (preset === 'sticker') return renderSticker(ctx, W, H, card, STICKER, t);
  const th = THEMES[theme] || THEMES.dark;
  return H > W ? renderStory(ctx, W, H, card, th, t) : renderSquare(ctx, W, H, card, th, t);
}
