// ── Piezas comunes de las tarjetas para compartir (canvas) ──
//
// La tarjeta de perfil y las de sesión hablan el mismo idioma: cifra protagonista
// en cursiva, rojo solo para récord y eslabón débil, pie con la marca y el enlace.
// Todo el dibujo recibe `t` de 0 a 1 para servir a la vez a la imagen fija
// (t = 1), la animación y el vídeo.

export const SHARE_URL = 'arete.raiatech.com';
export const FONT = "'Inter', -apple-system, system-ui, sans-serif";

export const THEMES = {
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

export const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
/** Progreso suavizado de un tramo [a, b] de la animación. */
export const span = (t, a, b) => ease((t - a) / (b - a));

export function text(ctx, s, x, y, { size = 32, weight = 600, color, align = 'center', spacing = 0, italic = false, alpha = 1 } = {}) {
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

export function textWidth(ctx, s, size, weight, spacing = 0) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.letterSpacing = `${spacing}em`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** Encoge el texto hasta que cabe en el ancho dado. */
export function fit(ctx, s, max, size, weight, min = 24) {
  while (size > min && textWidth(ctx, s, size, weight) > max) size -= 2;
  return size;
}

/** Recorta con «…» lo que no cabe ni al tamaño mínimo. */
export function clip(ctx, s, max, size, weight) {
  if (textWidth(ctx, s, size, weight) <= max) return s;
  let out = s;
  while (out.length > 1 && textWidth(ctx, `${out}…`, size, weight) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

export function wrap(ctx, s, x, y, max, size, weight, color, alpha) {
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

export function pill(ctx, s, x, y, { bg, color, size = 24, maxW = Infinity }) {
  // Sin tope, un nombre de sesión largo se mete debajo de la marca.
  let label = s.toUpperCase();
  while (label.length > 1 && textWidth(ctx, label, size, 700, 0.08) + size * 1.8 > maxW) label = label.slice(0, -1);
  if (label !== s.toUpperCase()) label = `${label.slice(0, -1).trimEnd()}…`;
  s = label;
  const w = textWidth(ctx, s, size, 700, 0.08) + size * 1.8, h = size * 1.8;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  text(ctx, s.toUpperCase(), x + w / 2, y + h / 2 + 1, { size, weight: 700, color, spacing: 0.08 });
}

export function background(ctx, W, H, th) {
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  th.bg.forEach((c, i) => g.addColorStop(i / (th.bg.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, W * 0.8);
  r.addColorStop(0, th.glow); r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
}

export const brand = (ctx, x, y, th, align = 'right', size = 30) =>
  text(ctx, 'ARETÉ', x, y, { size, weight: 800, color: th.accent, align, spacing: 0.1, italic: true });

/** Fecha corta para el encabezado: «27 oct». */
export function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
}
