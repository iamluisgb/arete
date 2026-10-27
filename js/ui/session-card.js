// ── Tarjetas de sesión: fuerza y HIIT, para compartir ──
//
// Las anteriores eran una lista de ejercicios en la mitad de arriba de un lienzo
// negro: nada que leer de un vistazo en un Story, el récord como una etiqueta
// "PR" de 18 px y ningún enlace. Estas tienen una cifra protagonista (el volumen,
// el récord, el tiempo), el récord en rojo y en grande —el rojo es récord y
// dominio, nada más—, y un pie con la marca y la dirección.
//
// Las barras son honestas: empiezan en cero. 100 → 102,5 kg se ve como lo que
// es, una subida pequeña; inventarle un eje que la agrande sería mentir.

import {
  SHARE_URL, THEMES, span, text, textWidth, fit, clip, pill, background, brand, shortDate,
} from './card-kit.js';

// ── Datos ────────────────────────────────────────────────

const num = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** 102.5 → "102,5"; 3312 → "3.312". */
export function fmtNum(n, decimals = 1) {
  const r = Math.round(n * 10 ** decimals) / 10 ** decimals;
  const [int, dec] = String(Math.abs(r)).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${r < 0 ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

/** "14:32" o "1:02:10" → segundos; null si no es un tiempo. */
export function parseClock(s) {
  const m = String(s || '').match(/(?:(\d+):)?(\d+):(\d{2})$/);
  if (!m) return null;
  return (parseInt(m[1] || '0') * 3600) + parseInt(m[2]) * 60 + parseInt(m[3]);
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "1min", "45s", "1min30s" → segundos. */
function parseDuration(s) {
  const m = String(s || '').match(/^(?:(\d+)\s*min)?\s*(?:(\d+)\s*s)?$/i);
  if (!m || (!m[1] && !m[2])) return 0;
  return (parseInt(m[1] || '0') * 60) + parseInt(m[2] || '0');
}

const isHiitEx = ex => ex.type === 'hiit' || /^\d+R/.test(String(ex.sets?.[0]?.reps ?? ''));

function strengthExercise(ex, prs) {
  const sets = (ex.sets || [])
    .map(s => ({ kg: num(s.kg), repsRaw: String(s.reps ?? '').trim(), reps: num(s.reps) }))
    .filter(s => s.kg > 0 || s.repsRaw);
  const hasKg = sets.some(s => s.kg > 0);
  // Un aguante cronometrado ("2min", "1min/lado") no es una serie de reps.
  const timed = !hasKg && sets.some(s => /[a-z]/i.test(s.repsRaw));
  const pr = prs.find(p => p.exercise === ex.name) || null;

  let best = null;
  if (hasKg) best = sets.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a), sets[0]);
  else if (sets.length && !timed) best = sets.reduce((a, b) => (b.reps > a.reps ? b : a), sets[0]);

  const bestStr = !sets.length ? ''
    : hasKg ? `${fmtNum(best.kg)} kg × ${best.reps || best.repsRaw}`
    : timed ? `${sets[0].repsRaw}${sets.length > 1 ? ` × ${sets.length}` : ''}`
    : `${best.reps} reps`;

  return {
    name: ex.name || 'Ejercicio',
    sets: sets.map(s => ({
      ...s,
      value: hasKg ? s.kg : timed ? 1 : s.reps,
      label: hasKg ? `${fmtNum(s.kg)}×${s.reps || s.repsRaw}` : s.repsRaw,
      // La serie del récord: la del peso que lo marcó.
      record: !!pr && hasKg && s.kg === pr.kg,
    })),
    hasKg,
    timed,
    best: bestStr,
    pr,
  };
}

function hiitBlock(ex) {
  const raw = String(ex.sets?.[0]?.reps ?? '');
  const rounds = num(ex.rounds) || num(raw.match(/^(\d+)R/)?.[1]) || 0;
  const timeSec = parseClock(raw);
  const items = (ex.exercises || []).map(it => {
    const reps = num(it.reps);
    const dur = parseDuration(it.duration);
    return {
      name: it.name || '',
      isRest: !!it.isRest,
      right: it.duration ? it.duration : reps ? (it.perSide ? `${reps} c/l` : `×${reps}`) : '',
      total: it.isRest || !rounds ? ''
        : reps ? `${reps * rounds}${it.perSide ? ' por lado' : ' en total'}`
        : dur ? `${fmtClock(dur * rounds)} en total` : '',
      reps: it.isRest ? 0 : reps * (it.perSide ? 2 : 1),
      work: it.isRest ? 0 : dur,
    };
  });
  const totalReps = rounds ? items.reduce((a, it) => a + it.reps, 0) * rounds : 0;
  const workSec = rounds ? items.reduce((a, it) => a + it.work, 0) * rounds : 0;
  return {
    rounds,
    timeSec,
    rest: ex.rest && ex.rest !== '0s' ? ex.rest : '',
    items,
    totalReps,
    workSec,
    perRound: timeSec && rounds ? timeSec / rounds : null,
  };
}

/** Lo que dibuja la tarjeta, a partir de un entreno tal como se guarda en db.workouts. */
export function sessionCardData(w) {
  const prs = [...(w.prs || [])].filter(p => p && p.exercise).sort((a, b) => b.kg - a.kg);
  const exercises = w.exercises || [];
  const hiitEx = exercises.find(isHiitEx);

  let totalSets = 0, volume = 0;
  for (const ex of exercises) {
    for (const s of (ex.sets || [])) {
      totalSets++;
      volume += num(s.kg) * (parseInt(s.reps) || 0);
    }
  }

  return {
    kind: hiitEx ? 'hiit' : 'strength',
    name: w.session || (hiitEx ? 'HIIT' : 'Entrenamiento'),
    date: shortDate(w.date),
    totalSets,
    volume,
    prs,
    exercises: hiitEx ? [] : exercises.map(ex => strengthExercise(ex, prs)).filter(e => e.sets.length),
    hiit: hiitEx ? hiitBlock(hiitEx) : null,
  };
}

/** El texto que acompaña a la imagen en la hoja de compartir. */
export function sessionShareText(d) {
  const link = `Entreno con Areté → https://${SHARE_URL}/?ref=sesion`;
  if (d.kind === 'hiit') {
    const t = d.hiit.timeSec ? ` en ${fmtClock(d.hiit.timeSec)}` : '';
    return `${d.name}${t}. ${link}`;
  }
  if (d.prs.length) {
    const p = d.prs[0];
    return `Récord en ${p.exercise.toLowerCase()}: ${fmtNum(p.kg)} kg. ${link}`;
  }
  return d.volume ? `${fmtNum(d.volume, 0)} kg levantados hoy. ${link}` : `${d.name}. ${link}`;
}

// ── Dibujo: piezas comunes ───────────────────────────────

/** Medidas que cambian entre 9:16 y 1:1. */
const layout = (W, H) => {
  const sq = H <= W;
  return { sq, pad: sq ? 56 : 64, foot: H - (sq ? 56 : 90) };
};

function header(ctx, W, L, th, kicker, hot = false) {
  const size = L.sq ? 20 : 24;
  const maxW = W - 2 * L.pad - (L.sq ? 160 : 190);   // lo que deja la marca de la derecha
  pill(ctx, kicker, L.pad, L.sq ? 48 : 60, hot ? { bg: th.accent, color: '#fff', size, maxW } : { bg: th.sub(.07), color: th.sub(.65), size, maxW });
  brand(ctx, W - L.pad, L.sq ? 84 : 102, th, 'right', L.sq ? 26 : 30);
}

function footer(ctx, W, L, th, t) {
  const a = span(t, 0.8, 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = th.sub(.1); ctx.fillRect(L.pad, L.foot - (L.sq ? 32 : 44), W - 2 * L.pad, 2);
  ctx.restore();
  brand(ctx, L.pad, L.foot, th, 'left', L.sq ? 24 : 28);
  text(ctx, SHARE_URL, W - L.pad, L.foot, { size: L.sq ? 22 : 26, weight: 600, color: th.sub(.55), align: 'right', alpha: a });
}

/** Una línea de segmentos centrada, cada uno con su color: "12 series · 2 récords". */
function segments(ctx, parts, cx, y, size, alpha) {
  const sep = '  ·  ';
  const widths = parts.map(p => textWidth(ctx, p.s, size, 600));
  const sepW = textWidth(ctx, sep, size, 600);
  let x = cx - (widths.reduce((a, b) => a + b, 0) + sepW * (parts.length - 1)) / 2;
  parts.forEach((p, i) => {
    text(ctx, p.s, x, y, { size, weight: 600, color: p.color, align: 'left', alpha });
    x += widths[i];
    if (i < parts.length - 1) { text(ctx, sep, x, y, { size, weight: 600, color: p.sepColor, align: 'left', alpha }); x += sepW; }
  });
}

/** La escalera de series: una barra por serie, desde cero, el récord en rojo. */
function ladder(ctx, sets, x, bottom, maxH, barW, gap, th, g, { labels = false, labelSize = 22, center = null } = {}) {
  const max = Math.max(...sets.map(s => s.value), 1);
  const total = sets.length * barW + (sets.length - 1) * gap;
  let bx = center != null ? center - total / 2 : x;
  for (const s of sets) {
    const h = Math.max(6, (s.value / max) * maxH * g);
    ctx.beginPath(); ctx.roundRect(bx, bottom - h, barW, h, Math.min(8, barW / 3));
    ctx.fillStyle = s.record ? th.accent : th.sub(.28); ctx.fill();
    if (labels) {
      text(ctx, s.label, bx + barW / 2, bottom + labelSize * 1.1, {
        size: labelSize, weight: s.record ? 800 : 600, color: s.record ? th.accent : th.sub(.55), alpha: g,
      });
    }
    bx += barW + gap;
  }
}

function hairline(ctx, x, y, w, th, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = th.sub(.08); ctx.fillRect(x, y, w, 2);
  ctx.restore();
}

const recordsTxt = n => `${n} récord${n > 1 ? 's' : ''}`;
const kickerOf = d => [d.name, d.date].filter(Boolean).join(' · ');

// ── Fuerza ───────────────────────────────────────────────

function strengthSummary(ctx, W, H, d, th, t) {
  const L = layout(W, H);
  background(ctx, W, H, th);
  header(ctx, W, L, th, kickerOf(d));

  // La cifra: el volumen. Una sesión solo de peso corporal cuenta series.
  const a = span(t, 0.05, 0.5);
  const byVolume = d.volume > 0;
  const heroVal = byVolume ? fmtNum(Math.round(d.volume * a), 0) : String(Math.round(d.totalSets * a));
  text(ctx, byVolume ? 'levantado hoy' : 'hoy', W / 2, L.sq ? 180 : 245, { size: L.sq ? 26 : 32, weight: 600, color: th.sub(.5), spacing: 0.04, alpha: a });
  text(ctx, heroVal, W / 2, L.sq ? 275 : 390, { size: L.sq ? 140 : 200, weight: 900, color: th.text, italic: true });
  text(ctx, byVolume ? 'kilos' : 'series', W / 2, L.sq ? 365 : 520, { size: L.sq ? 32 : 44, weight: 800, color: th.sub(.6), italic: true, alpha: a });

  const parts = [{ s: `${d.totalSets} series`, color: th.sub(.6), sepColor: th.sub(.3) }];
  parts.push({ s: `${d.exercises.length} ejercicio${d.exercises.length === 1 ? '' : 's'}`, color: th.sub(.6), sepColor: th.sub(.3) });
  if (d.prs.length) parts.push({ s: recordsTxt(d.prs.length), color: th.accent, sepColor: th.sub(.3) });
  segments(ctx, parts, W / 2, L.sq ? 420 : 590, L.sq ? 24 : 30, span(t, 0.2, 0.5));

  const top = L.sq ? 460 : 680, bottom = L.foot - (L.sq ? 60 : 90);
  const maxRows = L.sq ? 4 : 6;
  const rows = d.exercises.slice(0, maxRows);
  const rowH = Math.min(L.sq ? 112 : 160, (bottom - top) / Math.max(rows.length, 1));
  const nameSize = L.sq ? 28 : 34, bestSize = L.sq ? 32 : 40;

  rows.forEach((ex, i) => {
    const g = span(t, 0.3 + i * 0.07, 0.6 + i * 0.07);
    const y0 = top + i * rowH, dx = (1 - g) * 30;
    const bestW = textWidth(ctx, ex.best, bestSize, 900);
    const room = W - 2 * L.pad - bestW - 40 - (ex.pr ? 150 : 0);
    const name = clip(ctx, ex.name, room, nameSize, 700);
    text(ctx, name, L.pad + dx, y0 + 30, { size: nameSize, weight: 700, color: ex.pr ? th.accent : th.text, align: 'left', alpha: g });
    if (ex.pr) {
      ctx.save(); ctx.globalAlpha = g;
      pill(ctx, 'Récord', L.pad + dx + textWidth(ctx, name, nameSize, 700) + 16, y0 + 30 - (L.sq ? 15 : 17), { bg: th.accent, color: '#fff', size: L.sq ? 16 : 19 });
      ctx.restore();
    }
    text(ctx, ex.best, W - L.pad + dx, y0 + 30, { size: bestSize, weight: 900, color: ex.pr ? th.accent : th.text, align: 'right', italic: true, alpha: g });
    const barsH = rowH - (L.sq ? 70 : 84);
    // Un aguante no tiene escalera: todas las barras serían iguales y no dirían nada.
    if (barsH > 10 && !ex.timed) ladder(ctx, ex.sets.slice(0, 10), L.pad + dx, y0 + rowH - (L.sq ? 18 : 24), barsH, L.sq ? 26 : 34, 10, th, span(t, 0.35 + i * 0.07, 0.8 + i * 0.07));
    if (i < rows.length - 1) hairline(ctx, L.pad, y0 + rowH - 2, W - 2 * L.pad, th, g);
  });
  if (d.exercises.length > maxRows) {
    const n = d.exercises.length - maxRows;
    text(ctx, `y ${n} ejercicio${n > 1 ? 's' : ''} más`, W / 2, top + rows.length * rowH + 26, { size: L.sq ? 20 : 24, weight: 500, color: th.sub(.4), alpha: span(t, 0.7, 0.9) });
  }
  footer(ctx, W, L, th, t);
}

function strengthRecord(ctx, W, H, d, th, t) {
  const L = layout(W, H);
  const pr = d.prs[0];
  const ex = d.exercises.find(e => e.name === pr.exercise);
  background(ctx, W, H, th);
  header(ctx, W, L, th, d.prs.length > 1 ? `${d.prs.length} récords personales` : 'Récord personal', true);

  const a = span(t, 0.05, 0.55);
  const prSize = fit(ctx, pr.exercise, W - 2 * L.pad, L.sq ? 52 : 68, 800, L.sq ? 34 : 44);
  text(ctx, clip(ctx, pr.exercise, W - 2 * L.pad, prSize, 800), W / 2, L.sq ? 175 : 270, { size: prSize, weight: 800, color: th.accent, italic: true });

  // De la marca anterior a la nueva: el número sube delante de quien lo mira.
  const from = pr.prevKg > 0 ? pr.prevKg : 0;
  const kg = from + (pr.kg - from) * a;
  const heroSize = L.sq ? 160 : 240;
  const heroStr = fmtNum(t >= 0.55 ? pr.kg : Math.round(kg * 2) / 2);
  const heroY = L.sq ? 300 : 450;
  const finalW = textWidth(ctx, fmtNum(pr.kg), heroSize, 900);
  const unitSize = L.sq ? 56 : 80;
  const unitW = textWidth(ctx, 'kg', unitSize, 800);
  const x0 = W / 2 - (finalW + 16 + unitW) / 2;
  text(ctx, heroStr, x0, heroY, { size: heroSize, weight: 900, color: th.text, italic: true, align: 'left' });
  text(ctx, 'kg', x0 + finalW + 16, heroY + heroSize * 0.18, { size: unitSize, weight: 800, color: th.sub(.6), italic: true, align: 'left' });

  const delta = pr.prevKg > 0
    ? `+${fmtNum(pr.kg - pr.prevKg)} kg sobre tu marca anterior (${fmtNum(pr.prevKg)} kg)`
    : 'Primera marca registrada';
  text(ctx, delta, W / 2, L.sq ? 410 : 610, { size: fit(ctx, delta, W - 2 * L.pad, L.sq ? 26 : 32, 600), weight: 600, color: th.sub(.65), alpha: span(t, 0.5, 0.7) });

  // Antes y hoy, en barras desde cero. Si no hay marca anterior, las series del
  // día (con una sola no hay nada que comparar y no se dibuja nada).
  const zoneTop = L.sq ? 470 : 730, zoneBottom = L.sq ? 690 : 1120;
  const g = span(t, 0.2, 0.7);
  let drew = true;
  if (pr.prevKg > 0) {
    const bars = [
      { value: pr.prevKg, label: `antes · ${fmtNum(pr.prevKg)} kg`, record: false },
      { value: pr.kg, label: `hoy · ${fmtNum(pr.kg)} kg`, record: true },
    ];
    ladder(ctx, bars, 0, zoneBottom, zoneBottom - zoneTop, L.sq ? 150 : 200, L.sq ? 90 : 120, th, g, { labels: true, labelSize: L.sq ? 22 : 28, center: W / 2 });
  } else if (ex && ex.sets.length > 1) {
    const sets = ex.sets.slice(0, 8);
    const barW = Math.min(L.sq ? 80 : 100, (W - 2 * L.pad - (sets.length - 1) * 20) / sets.length);
    ladder(ctx, sets, 0, zoneBottom, zoneBottom - zoneTop, barW, 20, th, g, { labels: true, labelSize: L.sq ? 20 : 24, center: W / 2 });
  } else drew = false;

  // Los demás récords del día, y la sesión en una línea.
  let y = drew ? (L.sq ? 790 : 1250) : (L.sq ? 500 : 760);
  const rest = d.prs.slice(1, L.sq ? 2 : 4);
  const b = span(t, 0.65, 0.9);
  if (rest.length) {
    text(ctx, 'también hoy', L.pad, y, { size: L.sq ? 22 : 28, weight: 600, color: th.sub(.5), align: 'left', alpha: b });
    y += L.sq ? 46 : 62;
    for (const p of rest) {
      const val = p.prevKg > 0 ? `${fmtNum(p.prevKg)} → ${fmtNum(p.kg)} kg` : `${fmtNum(p.kg)} kg`;
      text(ctx, clip(ctx, p.exercise, W - 2 * L.pad - 320, L.sq ? 28 : 34, 700), L.pad, y, { size: L.sq ? 28 : 34, weight: 700, color: th.text, align: 'left', alpha: b });
      text(ctx, val, W - L.pad, y, { size: L.sq ? 28 : 36, weight: 900, color: th.accent, align: 'right', italic: true, alpha: b });
      y += L.sq ? 50 : 70;
    }
  }
  const summary = [d.name, `${d.totalSets} series`, d.volume ? `${fmtNum(d.volume, 0)} kg` : ''].filter(Boolean).join('  ·  ');
  text(ctx, summary, W / 2, L.foot - (L.sq ? 80 : 120), { size: L.sq ? 22 : 26, weight: 600, color: th.sub(.45), alpha: span(t, 0.75, 0.95) });
  footer(ctx, W, L, th, t);
}

/** El nombre de la sesión en las tarjetas de detalle: encoge hasta un mínimo y luego recorta. */
function title(ctx, W, L, name, th) {
  const max = W - 2 * L.pad;
  const size = fit(ctx, name, max, L.sq ? 64 : 84, 900, L.sq ? 40 : 52);
  text(ctx, clip(ctx, name, max, size, 900), L.pad, L.sq ? 170 : 220, { size, weight: 900, color: th.text, italic: true, align: 'left' });
}

function chips(ctx, sets, x, y, maxW, size, th, alpha) {
  const h = size * 1.9, gap = 10;
  let cx = x;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const w = textWidth(ctx, s.label, size, 700) + size * 1.2;
    const more = `+${sets.length - i}`;
    if (cx + w > x + maxW) {
      text(ctx, more, cx + 4, y + h / 2, { size, weight: 700, color: th.sub(.5), align: 'left', alpha });
      return;
    }
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.roundRect(cx, y, w, h, h / 2);
    ctx.fillStyle = s.record ? th.accent : th.sub(.07); ctx.fill();
    ctx.restore();
    text(ctx, s.label, cx + w / 2, y + h / 2 + 1, { size, weight: 700, color: s.record ? '#fff' : th.sub(.8), alpha });
    cx += w + gap;
  }
}

function bento(ctx, cells, x, y, w, h, cols, th, t, L) {
  const gap = 14;
  const cw = (w - gap * (cols - 1)) / cols;
  cells.forEach((c, i) => {
    const cx = x + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (h + gap);
    const g = span(t, 0.1 + i * 0.06, 0.45 + i * 0.06);
    ctx.save(); ctx.globalAlpha = g;
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, h, 22); ctx.fillStyle = th.sub(.05); ctx.fill();
    ctx.restore();
    text(ctx, c.label, cx + 28, cy + (L.sq ? 32 : 40), { size: L.sq ? 20 : 24, weight: 600, color: th.sub(.5), align: 'left', alpha: g });
    const v = typeof c.value === 'function' ? c.value(span(t, 0.1, 0.55)) : c.value;
    text(ctx, v, cx + 26, cy + h - (L.sq ? 42 : 52), {
      size: fit(ctx, v, cw - 52, L.sq ? 52 : 68, 900), weight: 900, color: c.hot ? th.accent : th.text, italic: true, align: 'left', alpha: g,
    });
  });
  return Math.ceil(cells.length / cols) * (h + gap) - gap;
}

function strengthDetail(ctx, W, H, d, th, t) {
  const L = layout(W, H);
  background(ctx, W, H, th);
  header(ctx, W, L, th, d.date || 'Sesión');
  title(ctx, W, L, d.name, th);

  let y = L.sq ? 225 : 290;
  y += bento(ctx, [
    { label: 'series', value: g => String(Math.round(d.totalSets * g)) },
    { label: 'volumen', value: g => (d.volume ? `${fmtNum(Math.round(d.volume * g), 0)} kg` : '—') },
    { label: 'récords', value: String(d.prs.length), hot: d.prs.length > 0 },
  ], L.pad, y, W - 2 * L.pad, L.sq ? 120 : 160, 3, th, t, L);
  y += L.sq ? 40 : 60;

  const bottom = L.foot - (L.sq ? 60 : 90);
  const minRow = L.sq ? 96 : 128;
  const rows = d.exercises.slice(0, Math.max(1, Math.floor((bottom - y) / minRow)));
  // Las filas se reparten el alto libre: con pocos ejercicios, más grandes.
  const rowH = Math.min(L.sq ? 120 : 190, (bottom - y) / rows.length);
  const size = rowH > 150 ? 30 : L.sq ? 20 : 24;
  rows.forEach((ex, i) => {
    const g = span(t, 0.35 + i * 0.06, 0.65 + i * 0.06);
    const y0 = y + i * rowH;
    text(ctx, clip(ctx, ex.name, W - 2 * L.pad - 160, L.sq ? 28 : 34, 700), L.pad, y0 + 22, { size: L.sq ? 28 : 34, weight: 700, color: ex.pr ? th.accent : th.text, align: 'left', alpha: g });
    if (ex.pr) text(ctx, 'récord', W - L.pad, y0 + 22, { size: L.sq ? 22 : 26, weight: 800, color: th.accent, align: 'right', alpha: g });
    chips(ctx, ex.sets, L.pad, y0 + (rowH > 150 ? 62 : L.sq ? 44 : 54), W - 2 * L.pad - 60, size, th, g);
  });
  if (d.exercises.length > rows.length) {
    const n = d.exercises.length - rows.length;
    text(ctx, `y ${n} ejercicio${n > 1 ? 's' : ''} más`, L.pad, y + rows.length * rowH + 14, { size: L.sq ? 20 : 24, weight: 500, color: th.sub(.4), align: 'left', alpha: span(t, 0.7, 0.9) });
  }
  footer(ctx, W, L, th, t);
}

// ── HIIT ─────────────────────────────────────────────────

function hiitSubline(h) {
  return [
    h.rounds ? `${h.rounds} ronda${h.rounds > 1 ? 's' : ''}` : '',
    h.totalReps ? `${fmtNum(h.totalReps, 0)} repeticiones` : h.workSec ? `${fmtClock(h.workSec)} de trabajo` : '',
  ].filter(Boolean);
}

function hiitRows(ctx, W, h, top, bottom, L, th, t, compact) {
  const maxRows = L.sq ? 5 : 7;
  const rows = h.items.slice(0, maxRows);
  const rowH = Math.min(compact ? (L.sq ? 70 : 120) : (L.sq ? 84 : 150), (bottom - top) / Math.max(rows.length, 1));
  const nameSize = L.sq ? 28 : 38;
  rows.forEach((it, i) => {
    const g = span(t, 0.35 + i * 0.06, 0.65 + i * 0.06);
    const y0 = top + i * rowH, mid = y0 + rowH / 2, dx = (1 - g) * 30;
    const col = it.isRest ? th.sub(.4) : th.text;
    text(ctx, clip(ctx, it.name, W - 2 * L.pad - 260, nameSize, 700), L.pad + dx, mid, { size: nameSize, weight: 700, color: col, align: 'left', alpha: g });
    const hasTotal = it.total && rowH > 90;
    text(ctx, it.right, W - L.pad + dx, hasTotal ? mid - 14 : mid, { size: L.sq ? 30 : 42, weight: 900, color: it.isRest ? th.sub(.4) : th.text, align: 'right', italic: true, alpha: g });
    if (hasTotal) text(ctx, it.total, W - L.pad + dx, mid + 30, { size: L.sq ? 18 : 22, weight: 600, color: th.sub(.45), align: 'right', alpha: g });
    if (i < rows.length - 1) hairline(ctx, L.pad, y0 + rowH - 1, W - 2 * L.pad, th, g);
  });
  if (h.items.length > rows.length) {
    const n = h.items.length - rows.length;
    text(ctx, `y ${n} más`, W / 2, top + rows.length * rowH + 24, { size: L.sq ? 20 : 24, weight: 500, color: th.sub(.4), alpha: span(t, 0.7, 0.9) });
  }
}

function hiitSummary(ctx, W, H, d, th, t) {
  const L = layout(W, H);
  const h = d.hiit;
  background(ctx, W, H, th);
  header(ctx, W, L, th, kickerOf(d));

  // El tiempo corre de cero a la marca: el reloj es la cifra del HIIT.
  const a = span(t, 0.05, 0.55);
  const hero = h.timeSec ? fmtClock(h.timeSec * a) : String(Math.round((h.rounds || 0) * a));
  text(ctx, h.timeSec ? 'tiempo total' : 'rondas', W / 2, L.sq ? 180 : 245, { size: L.sq ? 26 : 32, weight: 600, color: th.sub(.5), spacing: 0.04, alpha: a });
  text(ctx, hero, W / 2, L.sq ? 280 : 400, { size: L.sq ? 150 : 220, weight: 900, color: th.text, italic: true });

  const sub = hiitSubline(h);
  if (sub.length) segments(ctx, sub.map(s => ({ s, color: th.sub(.65), sepColor: th.sub(.3) })), W / 2, L.sq ? 380 : 555, L.sq ? 26 : 34, span(t, 0.3, 0.6));
  if (h.perRound) text(ctx, `${fmtClock(h.perRound)} por ronda`, W / 2, L.sq ? 420 : 610, { size: L.sq ? 22 : 28, weight: 600, color: th.sub(.45), alpha: span(t, 0.4, 0.65) });

  const top = L.sq ? 460 : 690;
  const bottom = L.foot - (L.sq ? 70 : 140);
  hiitRows(ctx, W, h, top, bottom, L, th, t, false);
  if (h.rest) text(ctx, `Descanso entre rondas: ${h.rest}`, W / 2, L.foot - (L.sq ? 70 : 100), { size: L.sq ? 20 : 24, weight: 500, color: th.sub(.4), alpha: span(t, 0.75, 0.95) });
  footer(ctx, W, L, th, t);
}

function hiitDetail(ctx, W, H, d, th, t) {
  const L = layout(W, H);
  const h = d.hiit;
  background(ctx, W, H, th);
  header(ctx, W, L, th, d.date || 'HIIT');
  title(ctx, W, L, d.name, th);

  const cells = [
    { label: 'tiempo', value: g => (h.timeSec ? fmtClock(h.timeSec * g) : '—') },
    { label: 'rondas', value: h.rounds ? String(h.rounds) : '—' },
  ];
  if (!L.sq) {
    cells.push({ label: h.totalReps ? 'repeticiones' : 'trabajo', value: g => (h.totalReps ? fmtNum(Math.round(h.totalReps * g), 0) : h.workSec ? fmtClock(h.workSec * g) : '—') });
    cells.push({ label: 'por ronda', value: h.perRound ? fmtClock(h.perRound) : '—' });
  }
  let y = (L.sq ? 225 : 290);
  y += bento(ctx, cells, L.pad, y, W - 2 * L.pad, L.sq ? 120 : 160, 2, th, t, L);
  y += L.sq ? 30 : 50;
  text(ctx, 'circuito', L.pad, y, { size: L.sq ? 22 : 28, weight: 600, color: th.sub(.5), align: 'left', alpha: span(t, 0.3, 0.5) });
  y += L.sq ? 20 : 30;
  hiitRows(ctx, W, h, y, L.foot - (L.sq ? 70 : 140), L, th, t, true);
  if (h.rest) text(ctx, `Descanso entre rondas: ${h.rest}`, L.pad, L.foot - (L.sq ? 70 : 100), { size: L.sq ? 20 : 24, weight: 500, color: th.sub(.4), align: 'left', alpha: span(t, 0.75, 0.95) });
  footer(ctx, W, L, th, t);
}

// ── API ──────────────────────────────────────────────────

/** Los estilos que tiene cada tipo de sesión. El de récord, solo si los hay. */
export function sessionPresets(d) {
  if (d.kind === 'hiit') return { minimal: { name: 'Resumen' }, statsPro: { name: 'Detalle' } };
  const p = { minimal: { name: 'Resumen' } };
  if (d.prs.length) p.record = { name: 'Récord' };
  p.statsPro = { name: 'Detalle' };
  return p;
}

/** Dibuja la tarjeta de sesión en el instante `t` de su animación (1 = la imagen final). */
export function renderSessionCard(ctx, W, H, d, { preset = 'minimal', theme = 'dark' } = {}, t = 1) {
  const th = THEMES[theme] || THEMES.dark;
  ctx.clearRect(0, 0, W, H);
  if (d.kind === 'hiit') return (preset === 'statsPro' ? hiitDetail : hiitSummary)(ctx, W, H, d, th, t);
  if (preset === 'record' && d.prs.length) return strengthRecord(ctx, W, H, d, th, t);
  return (preset === 'statsPro' ? strengthDetail : strengthSummary)(ctx, W, H, d, th, t);
}
