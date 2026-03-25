// ── Share Editor: Canvas-based image generator for sharing ──
import { formatPace, formatRunDuration, RUN_TYPE_META } from './running-helpers.js';
import { formatDate } from '../utils.js';
import { toast } from './toast.js';

// ── State ───────────────────────────────────────────────────
let _data = null;       // normalized data
let _mode = 'running';  // 'running' | 'strength'
let _preset = 'minimal';
let _format = '9:16';
let _projected = null;  // cached projected coords
let _onClose = null;

const PREF_KEY = 'barraLibreSharePrefs';
const FONT = "'Inter', -apple-system, system-ui, sans-serif";

// ── Presets ─────────────────────────────────────────────────

const RUN_PRESETS = {
  minimal: { name: 'Minimal' },
  statsPro: { name: 'Stats Pro' },
  routeHero: { name: 'Ruta', needsRoute: true },
};

const STR_PRESETS = {
  minimal: { name: 'Minimal' },
  statsPro: { name: 'Stats Pro' },
};

// ── Douglas-Peucker simplification ─────────────────────────

function _sqDist(p, a, b) {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx !== 0 || dy !== 0) {
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    dx = a[0] + t * dx - p[0];
    dy = a[1] + t * dy - p[1];
  } else {
    dx = a[0] - p[0]; dy = a[1] - p[1];
  }
  return dx * dx + dy * dy;
}

function simplifyRoute(coords, tolerance = 0.00005) {
  if (coords.length <= 200) return coords;
  const tol2 = tolerance * tolerance;
  const stack = [[0, coords.length - 1]];
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0, idx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = _sqDist(coords[i], coords[start], coords[end]);
      if (d > maxDist) { maxDist = d; idx = i; }
    }
    if (maxDist > tol2) {
      keep[idx] = 1;
      stack.push([start, idx], [idx, end]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

// ── GPS projection ──────────────────────────────────────────

function minMax(arr) {
  let min = Infinity, max = -Infinity;
  for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
  return [min, max];
}

function projectCoords(coords, region, padding) {
  const lats = coords.map(c => c[0]);
  const lngs = coords.map(c => c[1]);
  const [minLat, maxLat] = minMax(lats);
  const [minLng, maxLng] = minMax(lngs);
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos(midLat * Math.PI / 180);
  const rangeLat = (maxLat - minLat) || 0.001;
  const rangeLng = ((maxLng - minLng) || 0.001) * cosLat;
  const scaleX = (region.w - 2 * padding) / rangeLng;
  const scaleY = (region.h - 2 * padding) / rangeLat;
  const scale = Math.min(scaleX, scaleY);
  const projW = rangeLng * scale;
  const projH = rangeLat * scale;
  const offX = region.x + (region.w - projW) / 2;
  const offY = region.y + (region.h - projH) / 2;
  return coords.map(c => [
    offX + (c[1] - minLng) * cosLat * scale,
    offY + (maxLat - c[0]) * scale
  ]);
}

// ── Normalization ───────────────────────────────────────────

function normalizeRunData(log) {
  return {
    mode: 'running',
    distance: log.distance || 0,
    duration: log.duration || 0,
    pace: log.pace || 0,
    date: log.date || '',
    type: log.type || 'libre',
    session: log.session || '',
    coords: log.route?.coords || [],
    splits: log.splits || [],
    elevation: log.elevation || null,
    hr: log.hr || null,
    hrMax: log.hrMax || null,
    cadence: log.cadence || null,
    distanceStr: log.distance ? log.distance.toFixed(2) : '0',
    durationStr: formatRunDuration(log.duration),
    paceStr: formatPace(log.pace),
    dateStr: _formatDateLong(log.date),
    typeStr: RUN_TYPE_META[log.type]?.label || log.type || '',
  };
}

function normalizeWorkoutData(w) {
  let totalSets = 0, totalVolume = 0;
  for (const ex of (w.exercises || [])) {
    for (const s of (ex.sets || [])) {
      totalSets++;
      totalVolume += (parseFloat(s.kg) || 0) * (parseInt(s.reps) || 0);
    }
  }
  return {
    mode: 'strength',
    date: w.date || '',
    session: w.session || '',
    phase: w.phase || '',
    exercises: w.exercises || [],
    totalSets,
    totalVolume,
    prs: w.prs || [],
    notes: w.notes || '',
    dateStr: _formatDateLong(w.date),
    sessionStr: w.session || 'Entrenamiento',
    volumeStr: totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)} kg`,
  };
}

function _formatDateLong(d) {
  if (!d) return '';
  try {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return formatDate(d); }
}

// ── Canvas drawing helpers ──────────────────────────────────

function drawBackground(ctx, W, H, colors) {
  const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
  colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawAccentGlow(ctx, W, H) {
  const glow = ctx.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, W * 0.8);
  glow.addColorStop(0, 'rgba(212,55,44,.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawRoute(ctx, points, color, lineWidth, glowWidth, opacity) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // glow
  if (glowWidth > 0) {
    ctx.strokeStyle = color.replace(')', ',.3)').replace('rgb(', 'rgba(');
    ctx.lineWidth = glowWidth;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
    ctx.stroke();
  }
  // main line
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
  ctx.stroke();
  ctx.restore();
}

function drawRouteEndpoints(ctx, points) {
  if (!points || points.length < 2) return;
  const start = points[0], end = points[points.length - 1];
  // Start point (green)
  ctx.beginPath();
  ctx.arc(start[0], start[1], 10, 0, Math.PI * 2);
  ctx.fillStyle = '#30d158';
  ctx.fill();
  // End point (red)
  ctx.beginPath();
  ctx.arc(end[0], end[1], 10, 0, Math.PI * 2);
  ctx.fillStyle = '#ff453a';
  ctx.fill();
}

function drawText(ctx, text, x, y, { size = 16, weight = 400, color = '#fff', align = 'center', spacing = 0, upper = false } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const t = upper ? text.toUpperCase() : text;
  if (spacing > 0) ctx.letterSpacing = `${spacing}em`;
  ctx.fillText(t, x, y);
  if (spacing > 0) ctx.letterSpacing = '0em';
}

function drawBranding(ctx, W, y) {
  // Line decoration
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 20, y - 16);
  ctx.lineTo(W / 2 + 20, y - 16);
  ctx.stroke();
  // BARRA
  drawText(ctx, 'BARRA ', W / 2 - 30, y, { size: 13, weight: 700, color: 'rgba(255,255,255,.2)', spacing: 0.2, upper: true, align: 'right' });
  // LIBRE
  drawText(ctx, 'LIBRE', W / 2 - 28, y, { size: 13, weight: 700, color: 'rgba(255,85,69,.3)', spacing: 0.2, upper: true, align: 'left' });
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ── Running presets rendering ───────────────────────────────

function renderMinimal(ctx, W, H, data) {
  drawBackground(ctx, W, H, ['#0f0f0f', '#1a1a1a', '#0f0f0f']);
  drawAccentGlow(ctx, W, H);

  // Route as subtle background decoration
  if (data.coords.length > 1) {
    const simplified = simplifyRoute(data.coords);
    const region = { x: W * 0.1, y: H * 0.15, w: W * 0.8, h: H * 0.7 };
    const pts = projectCoords(simplified, region, 40);
    drawRoute(ctx, pts, '#ffffff', 2, 0, 0.06);
  }

  const centerY = H * 0.42;

  // Distance hero
  drawText(ctx, data.distanceStr, W / 2, centerY, { size: H > 1200 ? 160 : 120, weight: 800, color: '#ffffff' });
  drawText(ctx, 'KM', W / 2, centerY + (H > 1200 ? 85 : 65), { size: 28, weight: 600, color: 'rgba(255,255,255,.5)', spacing: 0.15, upper: true });

  // Time | Pace
  const subY = centerY + (H > 1200 ? 160 : 130);
  drawText(ctx, data.durationStr, W / 2 - 80, subY, { size: 42, weight: 700 });
  // separator
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(W / 2, subY - 16, 1, 32);
  drawText(ctx, data.paceStr + '/km', W / 2 + 80, subY, { size: 42, weight: 700 });

  // Labels
  drawText(ctx, 'tiempo', W / 2 - 80, subY + 32, { size: 14, weight: 500, color: 'rgba(255,255,255,.4)', upper: true, spacing: 0.1 });
  drawText(ctx, 'ritmo', W / 2 + 80, subY + 32, { size: 14, weight: 500, color: 'rgba(255,255,255,.4)', upper: true, spacing: 0.1 });

  // Date + type
  const meta = [data.dateStr, data.typeStr].filter(Boolean).join('  ·  ');
  drawText(ctx, meta, W / 2, H * 0.22, { size: 16, weight: 500, color: 'rgba(255,255,255,.35)' });

  drawBranding(ctx, W, H * 0.92);
}

function renderStatsPro(ctx, W, H, data) {
  drawBackground(ctx, W, H, ['#111111', '#111111']);

  const pad = 60;
  const is916 = H > 1200;
  let y = pad;

  // Date in accent
  drawText(ctx, data.dateStr?.toUpperCase?.() || '', pad, y + 10, { size: 18, weight: 700, color: '#ff5545', align: 'left' });
  y += 28;
  drawText(ctx, data.typeStr, pad, y + 10, { size: 14, weight: 600, color: 'rgba(255,255,255,.5)', align: 'left', upper: true, spacing: 0.1 });
  y += 50;

  // Distance hero card
  drawRoundedRect(ctx, pad, y, W - 2 * pad, 120, 16);
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  drawText(ctx, data.distanceStr + ' km', W / 2, y + 60, { size: 56, weight: 800 });
  y += 140;

  // Stat grid (2 columns)
  const stats = [
    { val: data.durationStr, label: 'TIEMPO' },
    { val: data.paceStr, label: '/KM' },
  ];
  if (data.hr) stats.push({ val: `${data.hr}`, label: 'BPM AVG' });
  if (data.cadence) stats.push({ val: `${data.cadence}`, label: 'PPM' });
  if (data.elevation) stats.push({ val: `${Math.round(data.elevation)}`, label: 'D+ M' });
  if (data.hrMax) stats.push({ val: `${data.hrMax}`, label: 'BPM MAX' });

  const cols = 2;
  const cardW = (W - 2 * pad - 16) / cols;
  const cardH = 90;
  for (let i = 0; i < stats.length && i < 6; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = pad + col * (cardW + 16);
    const cy = y + row * (cardH + 12);
    drawRoundedRect(ctx, cx, cy, cardW, cardH, 12);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fill();
    drawText(ctx, stats[i].val, cx + cardW / 2, cy + 38, { size: 36, weight: 700 });
    drawText(ctx, stats[i].label, cx + cardW / 2, cy + 70, { size: 12, weight: 600, color: 'rgba(255,255,255,.4)', spacing: 0.12 });
  }
  y += Math.ceil(stats.length / cols) * (cardH + 12) + 20;

  // Splits (only in 9:16 and if available)
  if (is916 && data.splits?.length > 0) {
    drawText(ctx, 'SPLITS', pad, y + 8, { size: 12, weight: 700, color: 'rgba(255,255,255,.4)', align: 'left', spacing: 0.15 });
    y += 32;
    const maxSplits = Math.min(data.splits.length, 10);
    const fastestPace = Math.min(...data.splits.slice(0, maxSplits).map(s => s.pace || Infinity));
    const slowestPace = Math.max(...data.splits.slice(0, maxSplits).map(s => s.pace || 0));
    const barMaxW = W - 2 * pad - 180;

    for (let i = 0; i < maxSplits; i++) {
      const sp = data.splits[i];
      const sy = y + i * 36;
      drawText(ctx, `KM ${sp.km || i + 1}`, pad + 10, sy + 12, { size: 14, weight: 600, color: 'rgba(255,255,255,.5)', align: 'left' });
      drawText(ctx, formatPace(sp.pace), pad + 100, sy + 12, { size: 18, weight: 700, align: 'left' });
      // Bar
      const pct = slowestPace > fastestPace ? 1 - (sp.pace - fastestPace) / (slowestPace - fastestPace) : 1;
      const barW = Math.max(20, pct * barMaxW);
      const barColor = pct > 0.66 ? '#30d158' : pct > 0.33 ? '#ff9f0a' : '#ff453a';
      drawRoundedRect(ctx, pad + 180, sy + 4, barW, 16, 4);
      ctx.fillStyle = barColor;
      ctx.fill();
    }
    y += maxSplits * 36 + 10;
  }

  drawBranding(ctx, W, H * (is916 ? 0.93 : 0.90));
}

function renderRouteHero(ctx, W, H, data) {
  drawBackground(ctx, W, H, ['#0a0a0a', '#111827']);

  // Subtle accent glow centered on route
  const glow = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, W * 0.6);
  glow.addColorStop(0, 'rgba(255,85,69,.04)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const is916 = H > 1200;

  // Date
  drawText(ctx, data.dateStr?.toUpperCase?.() || '', 50, 50, { size: 16, weight: 700, color: 'rgba(255,255,255,.4)', align: 'left' });

  // Route
  if (data.coords.length > 1) {
    const simplified = simplifyRoute(data.coords);
    const routeH = is916 ? H * 0.55 : H * 0.60;
    const region = { x: 0, y: H * 0.08, w: W, h: routeH };
    const pts = projectCoords(simplified, region, 60);
    drawRoute(ctx, pts, '#ff5545', 5, 18, 1);
    drawRouteEndpoints(ctx, pts);
    _projected = pts; // cache
  }

  // Stats bar at bottom (glass effect)
  const barY = is916 ? H * 0.78 : H * 0.74;
  const barH = 80;
  const barPad = 40;
  drawRoundedRect(ctx, barPad, barY, W - 2 * barPad, barH, 16);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fill();

  const fields = [
    { val: data.distanceStr, label: 'km' },
    { val: data.durationStr, label: 'tiempo' },
    { val: data.paceStr, label: '/km' },
  ];
  const fw = (W - 2 * barPad) / fields.length;
  fields.forEach((f, i) => {
    const fx = barPad + fw * i + fw / 2;
    drawText(ctx, f.val, fx, barY + 32, { size: 28, weight: 700 });
    drawText(ctx, f.label, fx, barY + 58, { size: 11, weight: 600, color: 'rgba(255,255,255,.4)', upper: true, spacing: 0.12 });
    // separator
    if (i < fields.length - 1) {
      ctx.fillStyle = 'rgba(255,255,255,.1)';
      ctx.fillRect(barPad + fw * (i + 1), barY + 20, 1, 40);
    }
  });

  drawBranding(ctx, W, is916 ? H * 0.96 : H * 0.93);
}

// ── Strength presets rendering ──────────────────────────────

function renderMinimalStrength(ctx, W, H, data) {
  drawBackground(ctx, W, H, ['#0f0f0f', '#1a1a1a', '#0f0f0f']);
  drawAccentGlow(ctx, W, H);

  const centerY = H * 0.38;

  // Session name hero
  const name = data.sessionStr || 'Entrenamiento';
  const fontSize = name.length > 20 ? (H > 1200 ? 64 : 48) : (H > 1200 ? 80 : 60);
  drawText(ctx, name, W / 2, centerY, { size: fontSize, weight: 800 });

  // Date
  drawText(ctx, data.dateStr, W / 2, H * 0.22, { size: 16, weight: 500, color: 'rgba(255,255,255,.35)' });

  // Stats row
  const subY = centerY + (H > 1200 ? 100 : 80);
  drawText(ctx, `${data.totalSets}`, W / 2 - 100, subY, { size: 48, weight: 700 });
  drawText(ctx, 'series', W / 2 - 100, subY + 34, { size: 14, weight: 500, color: 'rgba(255,255,255,.4)', upper: true, spacing: 0.1 });

  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(W / 2, subY - 20, 1, 40);

  drawText(ctx, data.volumeStr, W / 2 + 100, subY, { size: 48, weight: 700 });
  drawText(ctx, 'volumen', W / 2 + 100, subY + 34, { size: 14, weight: 500, color: 'rgba(255,255,255,.4)', upper: true, spacing: 0.1 });

  // Exercises list
  const exY = subY + 90;
  const maxExercises = Math.min(data.exercises.length, H > 1200 ? 8 : 5);
  for (let i = 0; i < maxExercises; i++) {
    const ex = data.exercises[i];
    const ey = exY + i * 36;
    drawText(ctx, ex.name, W / 2, ey, { size: 18, weight: 500, color: 'rgba(255,255,255,.5)' });
  }
  if (data.exercises.length > maxExercises) {
    drawText(ctx, `+${data.exercises.length - maxExercises} más`, W / 2, exY + maxExercises * 36, {
      size: 14, weight: 500, color: 'rgba(255,255,255,.3)'
    });
  }

  // PRs
  if (data.prs?.length > 0) {
    const prY = H * 0.78;
    drawText(ctx, `${data.prs.length} PR${data.prs.length > 1 ? 's' : ''} batido${data.prs.length > 1 ? 's' : ''}`, W / 2, prY, {
      size: 20, weight: 700, color: '#ff5545'
    });
  }

  drawBranding(ctx, W, H * 0.92);
}

function renderStatsStrength(ctx, W, H, data) {
  drawBackground(ctx, W, H, ['#111111', '#111111']);

  const pad = 60;
  const is916 = H > 1200;
  let y = pad;

  // Date + session
  drawText(ctx, data.dateStr?.toUpperCase?.() || '', pad, y + 10, { size: 18, weight: 700, color: '#ff5545', align: 'left' });
  y += 28;
  drawText(ctx, data.sessionStr, pad, y + 10, { size: 24, weight: 800, align: 'left' });
  y += 50;

  // Summary cards
  const cardW = (W - 2 * pad - 16) / 2;
  const cardH = 90;
  const summaryCards = [
    { val: `${data.totalSets}`, label: 'SERIES' },
    { val: data.volumeStr, label: 'VOLUMEN' },
  ];
  summaryCards.forEach((c, i) => {
    const cx = pad + i * (cardW + 16);
    drawRoundedRect(ctx, cx, y, cardW, cardH, 12);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fill();
    drawText(ctx, c.val, cx + cardW / 2, y + 38, { size: 36, weight: 700 });
    drawText(ctx, c.label, cx + cardW / 2, y + 70, { size: 12, weight: 600, color: 'rgba(255,255,255,.4)', spacing: 0.12 });
  });
  y += cardH + 30;

  // Exercises with sets
  drawText(ctx, 'EJERCICIOS', pad, y + 8, { size: 12, weight: 700, color: 'rgba(255,255,255,.4)', align: 'left', spacing: 0.15 });
  y += 32;

  const maxEx = is916 ? 8 : 5;
  for (let i = 0; i < Math.min(data.exercises.length, maxEx); i++) {
    const ex = data.exercises[i];
    const isPR = data.prs?.some(p => p.exercise === ex.name);
    drawText(ctx, ex.name + (isPR ? ' PR' : ''), pad + 10, y + 12, {
      size: 18, weight: 700, color: isPR ? '#ff5545' : '#ffffff', align: 'left'
    });
    y += 30;
    const setsStr = ex.sets.map(s => `${s.kg || 0}kg × ${s.reps || 0}`).join('  ·  ');
    drawText(ctx, setsStr, pad + 10, y + 8, { size: 14, weight: 500, color: 'rgba(255,255,255,.5)', align: 'left' });
    y += 36;
  }

  drawBranding(ctx, W, H * (is916 ? 0.93 : 0.90));
}

// ── Main render ─────────────────────────────────────────────

async function renderToCanvas() {
  const canvas = document.getElementById('seCanvas');
  if (!canvas || !_data) return;
  const ctx = canvas.getContext('2d');
  const W = 1080;
  const H = _format === '9:16' ? 1920 : 1080;
  canvas.width = W;
  canvas.height = H;

  // Ensure font is loaded
  if (document.fonts) {
    try { await document.fonts.load(`800 72px ${FONT}`); } catch {}
  }

  _projected = null;

  if (_mode === 'running') {
    if (_preset === 'minimal') renderMinimal(ctx, W, H, _data);
    else if (_preset === 'statsPro') renderStatsPro(ctx, W, H, _data);
    else if (_preset === 'routeHero') renderRouteHero(ctx, W, H, _data);
  } else {
    if (_preset === 'minimal') renderMinimalStrength(ctx, W, H, _data);
    else if (_preset === 'statsPro') renderStatsStrength(ctx, W, H, _data);
  }
}

// ── Export ───────────────────────────────────────────────────

async function exportImage() {
  const canvas = document.getElementById('seCanvas');
  const btn = document.getElementById('seShareBtn');
  if (!canvas || !btn) return;

  btn.disabled = true;
  btn.textContent = 'Exportando...';

  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { toast('Error al generar imagen', 'error'); return; }

    const date = _data?.date || new Date().toISOString().slice(0, 10);
    const prefix = _mode === 'running' ? 'run' : 'workout';
    const fileName = `barra-libre-${prefix}-${date}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: _mode === 'running' ? 'Mi carrera — Barra Libre' : 'Mi entreno — Barra Libre' });
      } catch (e) {
        if (e.name !== 'AbortError') toast('Error al compartir', 'error');
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast('Imagen descargada');
    }
  } catch (e) {
    toast('Error al generar imagen', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined">share</span> Compartir';
  }
}

// ── Preferences ─────────────────────────────────────────────

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}

function savePrefs() {
  localStorage.setItem(PREF_KEY, JSON.stringify({ preset: _preset, format: _format }));
}

// ── UI ──────────────────────────────────────────────────────

let _bound = false;

function _bindUI() {
  if (_bound) return;
  _bound = true;

  document.getElementById('seCloseBtn').addEventListener('click', closeShareEditor);
  document.getElementById('seShareBtn').addEventListener('click', exportImage);

  // Format toggle
  document.querySelectorAll('.se-format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.se-format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _format = btn.dataset.format;
      savePrefs();
      renderToCanvas();
    });
  });

  // Preset chips
  document.querySelectorAll('.se-preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.se-preset-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _preset = btn.dataset.preset;
      savePrefs();
      renderToCanvas();
    });
  });

  // Close on backdrop click
  document.getElementById('shareEditor').addEventListener('click', (e) => {
    if (e.target.id === 'shareEditor') closeShareEditor();
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('shareEditor')?.classList.contains('open')) {
      closeShareEditor();
    }
  });
}

function _updatePresetChips() {
  const presets = _mode === 'running' ? RUN_PRESETS : STR_PRESETS;
  const hasRoute = _data?.coords?.length > 1;

  document.querySelectorAll('.se-preset-chip').forEach(btn => {
    const key = btn.dataset.preset;
    const presetDef = presets[key];
    if (!presetDef) {
      btn.classList.add('hidden');
      return;
    }
    if (presetDef.needsRoute && !hasRoute) {
      btn.classList.add('hidden');
      // If this was selected, fallback to minimal
      if (_preset === key) {
        _preset = 'minimal';
        document.querySelector('.se-preset-chip[data-preset="minimal"]')?.classList.add('active');
      }
      return;
    }
    btn.classList.remove('hidden');
    btn.textContent = presetDef.name;
  });

  // Ensure active state is correct
  document.querySelectorAll('.se-preset-chip').forEach(b => b.classList.toggle('active', b.dataset.preset === _preset));
}

// ── Public API ──────────────────────────────────────────────

export function openShareEditor(logData, options = {}) {
  _mode = options.mode || 'running';
  _onClose = options.onClose || null;

  if (_mode === 'running') {
    _data = normalizeRunData(logData);
  } else {
    _data = normalizeWorkoutData(logData);
  }

  // Restore prefs
  const prefs = loadPrefs();
  const presets = _mode === 'running' ? RUN_PRESETS : STR_PRESETS;
  _preset = (prefs.preset && presets[prefs.preset]) ? prefs.preset : 'minimal';
  _format = prefs.format || '9:16';

  // Validate Route Hero availability
  if (_preset === 'routeHero' && (!_data.coords || _data.coords.length < 2)) {
    _preset = 'minimal';
  }

  _bindUI();

  // Set active states
  document.querySelectorAll('.se-format-btn').forEach(b => b.classList.toggle('active', b.dataset.format === _format));
  _updatePresetChips();

  // Show overlay
  const overlay = document.getElementById('shareEditor');
  overlay.classList.add('open');

  // Show loading, render, hide loading
  const loading = document.getElementById('seLoading');
  loading.classList.remove('hidden');
  renderToCanvas().then(() => loading.classList.add('hidden'));
}

export function closeShareEditor() {
  const overlay = document.getElementById('shareEditor');
  if (overlay) overlay.classList.remove('open');
  _data = null;
  _projected = null;
  _onClose?.();
}
