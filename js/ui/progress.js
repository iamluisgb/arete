import { getActiveProgram } from '../programs.js';
import { getSaveRevision } from '../data.js';
import { epley } from '../domains.js';
import { esc, formatDateShort } from '../utils.js';

let _bound = false;
let _chartCache = { name: null, rev: -1, w: 0 };
const LAST_EX_KEY = 'areteProgressEx';

/** El ejercicio con más sesiones registradas en el plan activo. Con empate gana
 *  el que antes aparezca en la lista, que ya viene ordenada. */
function masEntrenado(db, prog, candidatos) {
  const cuenta = new Map();
  for (const w of db.workouts) {
    if ((w.program || 'arete') !== prog) continue;
    for (const e of w.exercises) cuenta.set(e.name, (cuenta.get(e.name) || 0) + 1);
  }
  let mejor = null, max = 0;
  for (const n of candidatos) {
    const c = cuenta.get(n) || 0;
    if (c > max) { max = c; mejor = n; }
  }
  return mejor;
}

/**
 * Ancho del viewBox del SVG. Las etiquetas y los trazos de la gráfica están en
 * unidades de usuario (font-size="9", stroke-width="2.5"), así que el viewBox
 * tiene que seguir al ancho real del contenedor o el navegador los escala con
 * él: con el viewBox fijo en 340, un contenedor de 800px renderizaba esas
 * etiquetas a 21px con trazos de 6px. Midiendo, la escala es siempre ~1.
 */
function chartWidth() {
  const w = Math.round(document.getElementById('progressChart')?.clientWidth || 0);
  return w > 0 ? Math.max(340, w) : 340;
}

/** Initialize progress section: populate exercise select and render chart */
export function initProgress(db) {
  _chartCache = { name: null, rev: -1, w: 0 };
  if (!_bound) {
    const $sel = document.getElementById('progressExercise');
    $sel.addEventListener('change', () => {
      // Se recuerda entre visitas: quien sigue un levantamiento vuelve a él.
      if ($sel.value) localStorage.setItem(LAST_EX_KEY, $sel.value);
      markExerciseActive($sel.value);
      renderProgressChart(db);
    });
    document.getElementById('progressExList')?.addEventListener('click', e => {
      const btn = e.target.closest('.progress-ex');
      if (!btn) return;
      $sel.value = btn.dataset.ex;
      $sel.dispatchEvent(new Event('change'));
    });
    // Al cambiar el ancho (rotar, redimensionar la ventana, entrar en el
    // breakpoint de dos columnas) hay que rehacer el viewBox, no reescalarlo.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        if (Math.abs(chartWidth() - _chartCache.w) > 8) renderProgressChart(db);
      }).observe(document.getElementById('progressChart'));
    }
    _bound = true;
  }
  const sel = document.getElementById('progressExercise');
  const prog = getActiveProgram();
  const exercises = new Set();
  db.workouts
    .filter(w => (w.program || 'arete') === prog)
    .forEach(w => w.exercises.forEach(e => exercises.add(e.name)));
  const sorted = [...exercises].sort();
  const prev = sel.value;
  sel.innerHTML = sorted.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  // El <select> arrancaba en el primer ejercicio por orden ALFABÉTICO, que en el
  // plan Areté es "Clean": el accesorio menos representativo abriendo la pantalla
  // de progreso, y dos clics para llegar a la sentadilla. Manda, por este orden,
  // el que estabas mirando, el último que elegiste en otra visita, y el más
  // entrenado — que es la respuesta razonable a "enséñame mi progreso".
  const recordado = localStorage.getItem(LAST_EX_KEY);
  sel.value = [prev, recordado, masEntrenado(db, prog, sorted)].find(n => n && sorted.includes(n)) || sorted[0] || '';
  renderExerciseList(sorted, sel.value);
  renderProgressChart(db);
}

/**
 * La misma lista de ejercicios que el <select>, pero visible entera. El select
 * sigue siendo la fuente de verdad: aquí solo se refleja y se le delega el
 * cambio, así que nada más del módulo tiene que enterarse.
 */
function renderExerciseList(names, active) {
  const $list = document.getElementById('progressExList');
  if (!$list) return;
  $list.innerHTML = names.map(n => `
    <button type="button" class="progress-ex${n === active ? ' active' : ''}"
            role="option" aria-selected="${n === active}" data-ex="${esc(n)}">${esc(n)}</button>`).join('');
}

function markExerciseActive(name) {
  document.querySelectorAll('#progressExList .progress-ex').forEach(b => {
    const on = b.dataset.ex === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
}

// ── De la sesión al punto del gráfico ─────────────────────
//
// Antes cada sesión se resumía en tres números sueltos (peso máx, reps máx,
// volumen) y la gráfica dibujaba solo el primero. El resultado era una tabla
// que mentía: "100 kg · 6 reps · 1,9 t" mezcla el peso de una serie con las reps
// de otra, y las series —cuántas hiciste— no las contaba nadie.
//
// Aquí cada serie se conserva tal cual. Todo lo demás (carga, reps, series,
// volumen) se deriva de la lista, no de un resumen previo.

/** Reps contables. "2min", "1min/lado" o "8+8" no lo son: `parseInt` los leería
 *  como 2, 1 y 8, y una plancha entraría en la gráfica como una serie de fuerza.
 *  Un null las deja fuera de los cálculos sin perder la fila. */
function repsNum(v) {
  const s = String(v ?? '').trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
}

/** Carga en kg. Un 0 o un campo vacío no es una carga: es una serie a peso corporal. */
function kgNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function kgLabel(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "100×5 · 100×5 · 95×6" — la sesión tal como la hiciste. */
function ladderOf(sets) {
  return sets.map(s => {
    if (s.kg != null && s.reps != null) return `${kgLabel(s.kg)}×${s.reps}`;
    if (s.kg != null) return `${kgLabel(s.kg)} kg`;
    if (s.reps != null) return String(s.reps);
    return esc(String(s.raw ?? '·'));
  }).join(' · ');
}

function buildPoints(db, prog, name) {
  const points = [];
  const workouts = (db.workouts || [])
    .filter(w => (w.program || 'arete') === prog)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (const w of workouts) {
    const ex = (w.exercises || []).find(e => e.name === name);
    if (!ex) continue;

    const sets = [];
    for (const s of (ex.sets || [])) {
      const rawKg = String(s.kg ?? '').trim();
      const rawReps = String(s.reps ?? '').trim();
      // Un hueco sin rellenar no es una serie hecha: el formulario guarda una
      // fila por serie prescrita, así que "3 huecos" no son 3 series.
      if (!rawKg && !rawReps) continue;
      const kg = kgNum(s.kg);
      const reps = repsNum(s.reps);
      sets.push({ kg, reps, raw: reps == null ? (rawReps || rawKg) : null });
    }
    if (!sets.length) continue;

    let topKg = 0, topReps = 0, bestReps = 0, e1rm = null, totalReps = 0, volume = 0;
    for (const s of sets) {
      if (s.reps != null) {
        totalReps += s.reps;
        if (s.reps > bestReps) bestReps = s.reps;
      }
      if (s.kg != null && s.reps != null) volume += s.kg * s.reps;
      if (s.kg != null && s.kg > topKg) { topKg = s.kg; topReps = s.reps || 0; }
      if (s.kg != null && s.reps != null) {
        const rm = epley(s.kg, s.reps);
        if (rm != null && (e1rm == null || rm > e1rm)) e1rm = rm;
      }
    }

    points.push({
      date: w.date, session: w.session, sets, nSets: sets.length,
      topKg, topReps, bestReps, e1rm, totalReps, volume,
      ladder: ladderOf(sets),
    });
  }
  return points;
}

/** Render gráfica + tiles + historial del ejercicio elegido. */
export function renderProgressChart(db) {
  const name = document.getElementById('progressExercise').value;
  // La revisión de guardado, no el número de entrenos: editar una sesión no
  // añade filas, y con el contador de entrenos la gráfica se quedaba con los
  // números viejos hasta recargar.
  const rev = getSaveRevision();
  const availW = chartWidth();
  if (_chartCache.name === name && _chartCache.rev === rev && _chartCache.w === availW) return;
  _chartCache = { name, rev, w: availW };

  const $chart = document.getElementById('progressChart');
  const $stats = document.getElementById('progressStats');
  const $hist = document.getElementById('progressHistory');

  if (!name) {
    $chart.innerHTML = '<p class="progress-note">Selecciona un ejercicio para ver tu progreso.</p>';
    $stats.innerHTML = '';
    $hist.innerHTML = '';
    return;
  }

  const points = buildPoints(db, getActiveProgram(), name);
  if (!points.length) {
    $chart.innerHTML = '<p class="progress-note">Sin datos para este ejercicio.<br><span>Necesitas al menos 2 sesiones registradas.</span></p>';
    $stats.innerHTML = '';
    $hist.innerHTML = '';
    return;
  }

  const hasKg = points.some(p => p.topKg > 0);
  const hasE1rm = points.some(p => p.e1rm != null);
  const hasReps = points.some(p => p.sets.some(s => s.reps != null));
  const loadKey = hasE1rm ? 'e1rm' : 'topKg';

  if (!hasReps) {
    // Series cronometradas (planchas, carries): ni peso ni reps que graficar.
    // La tabla sigue valiendo, y decir por qué no hay gráfica evita leerlo como
    // un fallo de la app.
    $chart.innerHTML = '<p class="progress-note">Este ejercicio se registra por tiempo, no por repeticiones.<br><span>El historial de abajo tiene los registros.</span></p>';
    $stats.innerHTML = '';
  } else {
    $chart.innerHTML = renderChart(points, { W: availW, hasKg, loadKey });
    $stats.innerHTML = renderTiles(points, { hasKg, hasE1rm, loadKey });
  }
  $hist.innerHTML = renderHistory(points, name, { hasKg, hasE1rm, loadKey });
}

/**
 * Dos pistas con el mismo eje X, no dos unidades en un eje.
 *
 * Arriba, la carga (e1RM estimado, o el peso de la serie top si no hay ninguna
 * serie estimable). Abajo, la escalera de series: una barra por serie, altura =
 * reps. De un vistazo se leen las tres cosas que importan — cuántas barras
 * (series), qué altura (reps) y qué número arriba (peso)— sin leyenda y sin
 * mezclar kg con repeticiones, que es la forma más rápida de que un gráfico
 * diga una mentira.
 */
function renderChart(allPoints, { W, hasKg, loadKey }) {
  const narrow = W < 560;
  const fsAxis = narrow ? 9 : 12;
  const fsTitle = narrow ? 10 : 12;
  // El margen derecho tiene que caber media etiqueta de fecha ("29/07"), o la
  // última se sale del viewBox y se recorta.
  const pad = { t: narrow ? 16 : 20, r: narrow ? 22 : 28, b: 26, l: narrow ? 32 : 44 };
  const topH = hasKg ? (narrow ? 108 : 138) : 0;
  const gap = hasKg ? 26 : 0;
  const repH = hasKg ? (narrow ? 52 : 64) : (narrow ? 112 : 140);
  const cW = W - pad.l - pad.r;
  const baseY = pad.t + topH + gap + repH;
  const H = baseY + pad.b;

  // Con más sesiones que píxeles las columnas se pisan y la gráfica se vuelve
  // una mancha. Se dibujan las últimas que caben (una columna pide ~26px) y el
  // título lo dice: la tabla de abajo sigue teniendo el historial entero.
  const maxSessions = Math.max(10, Math.floor(cW / 26));
  const points = allPoints.length > maxSessions ? allPoints.slice(-maxSessions) : allPoints;
  const truncated = points.length < allPoints.length;

  // X proporcional a la fecha, con una separación mínima. Con dos sesiones
  // seguidas dentro de un historial de un año, la escala pura las pega en el
  // mismo píxel; el mínimo las separa y comprime el resto, que es preferible a
  // un gráfico ilegible. Un parón se sigue leyendo en la fecha, no en el hueco.
  const ts = points.map(p => Date.parse(`${p.date}T00:00:00`));
  const dated = ts.every(Number.isFinite);
  const xs = new Array(points.length);

  if (!dated || points.length === 1) {
    const step = points.length > 1 ? cW / (points.length - 1) : 0;
    points.forEach((_, i) => { xs[i] = pad.l + (points.length > 1 ? i * step : cW / 2); });
  } else {
    const t0 = Math.min(...ts), span = (Math.max(...ts) - t0) || 1;
    const pos = ts.map(t => (t - t0) / span);
    const minPos = (narrow ? 12 : 16) / cW;
    for (let i = 1; i < pos.length; i++) {
      if (pos[i] - pos[i - 1] < minPos) pos[i] = pos[i - 1] + minPos;
    }
    const over = pos[pos.length - 1] - 1;
    if (over > 0) {
      const n = pos.length - 1;
      for (let i = 0; i < pos.length; i++) pos[i] -= over * (n ? i / n : 0);
    }
    pos.forEach((p, i) => { xs[i] = pad.l + p * cW; });
  }

  let minGap = cW;
  for (let i = 1; i < xs.length; i++) minGap = Math.min(minGap, xs[i] - xs[i - 1]);
  // Ancho de la columna de una sesión: el 74% del hueco más pequeño, para que
  // dos sesiones seguidas no se toquen. Un mínimo de 9px deja tres barras
  // legibles incluso en un historial largo.
  const colW = Math.max(9, Math.min(44, points.length > 1 ? minGap * 0.74 : cW * 0.3));

  const repTitleY = pad.t + topH + gap - 7;
  let legend = '';

  // ── Pista de carga ──
  let topSvg = '';
  if (hasKg) {
    const vals = points.map(p => p[loadKey]).filter(v => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const spread = (hi - lo) || Math.max(1, hi * 0.06);
    const yMin = Math.max(0, lo - spread * 0.25), yMax = hi + spread * 0.25;
    const yOf = v => pad.t + topH - ((v - yMin) / (yMax - yMin)) * topH;

    let grid = '';
    for (let i = 0; i <= 2; i++) {
      const v = yMin + ((yMax - yMin) / 2) * i;
      const y = yOf(v);
      const lbl = (yMax - yMin) < 8 ? v.toFixed(1) : String(Math.round(v));
      grid += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" stroke="var(--color-border-subtle)" stroke-width="0.5"/>`
        + `<text x="${pad.l - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" fill="var(--color-text-secondary)" font-size="${fsAxis}" font-weight="500">${lbl}</text>`;
    }

    // Una línea POR VARIANTE DEL PLAN. Un plan con sesión A y B entrena el
    // mismo ejercicio con objetivos distintos: una sola línea dibuja un serrucho
    // de ±10 kg donde no hay tendencia que ver. El hilo es (ejercicio, sesión),
    // el mismo que usa el motor de progresión.
    const variants = [...new Set(points.map(p => p.session).filter(Boolean))];
    const multi = variants.length > 1;
    const PALETTE = [
      'var(--color-accent-text)', 'var(--color-domain-running)',
      'var(--color-state-warning)', 'var(--color-state-success)',
    ];
    const colorOf = v => PALETTE[Math.max(0, variants.indexOf(v)) % PALETTE.length];

    const groups = multi
      ? variants.map(v => ({ v, items: points.map((p, i) => ({ p, i })).filter(x => x.p.session === v) }))
      : [{ v: null, items: points.map((p, i) => ({ p, i })) }];

    // Sin suavizado: una curva entre dos sesiones inventa valores que no
    // existen. Una recta dice lo que hay — dos medidas y una espera entre ellas.
    // Las sesiones sin e1RM estimable (todo por encima de REP_CAP) dejan hueco.
    let lines = '', dots = '';
    for (const g of groups) {
      const color = g.v == null ? 'var(--color-accent-text)' : colorOf(g.v);
      let d = '', open = false;
      for (const { p, i } of g.items) {
        const v = p[loadKey];
        if (v == null) { open = false; continue; }
        d += `${open ? 'L' : 'M'}${xs[i].toFixed(1)},${yOf(v).toFixed(1)}`;
        open = true;
      }
      if (d) lines += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      for (const { p, i } of g.items) {
        const v = p[loadKey];
        if (v == null) continue;
        const last = i === points.length - 1;
        dots += `<circle cx="${xs[i].toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="${last ? 4 : 2.6}" fill="${color}" opacity="${last ? 1 : 0.65}">`
          + `<title>${formatDateShort(p.date)}${multi ? ` · ${esc(String(p.session))}` : ''} · ${v.toFixed(1)} kg</title></circle>`;
      }
    }

    // Con varias líneas, un único "105 kg" al final señalaría la última sesión
    // como si fuera el techo de todas. La leyenda hace ese trabajo.
    let lastCap = '';
    const lastPoint = [...points].reverse().find(p => p[loadKey] != null);
    if (!multi && lastPoint && points.length < 16) {
      lastCap = `<text x="${W - pad.r}" y="${(yOf(lastPoint[loadKey]) - 8).toFixed(1)}" text-anchor="end" fill="var(--color-accent-text)" font-size="${fsAxis}" font-weight="700">${Math.round(lastPoint[loadKey])} kg</text>`;
    }

    // La leyenda vive en la línea del título de abajo: arriba no cabe junto al
    // título de la carga sin que se pisen en móvil.
    if (multi) {
      // De izquierda a derecha, terminando en el margen derecho: una leyenda
      // que solo se puede leer de derecha a izquierda es una leyenda que se lee
      // mal. El ancho se calcula antes para saber dónde empieza.
      const items = variants.map(v => ({ v, label: String(v).slice(0, 12) }));
      const widths = items.map(it => it.label.length * fsAxis * 0.62 + 14);
      let lx = W - pad.r - widths.reduce((a, b) => a + b, 0);
      items.forEach((it, k) => {
        legend += `<circle cx="${(lx + 3).toFixed(1)}" cy="${(pad.t + topH + gap - 10).toFixed(1)}" r="3" fill="${colorOf(it.v)}"/>`
          + `<text x="${(lx + 9).toFixed(1)}" y="${repTitleY}" fill="var(--color-text-secondary)" font-size="${fsAxis}" font-weight="600">${esc(it.label)}</text>`;
        lx += widths[k];
      });
    }

    const title = (loadKey === 'e1rm' ? 'Carga · e1RM estimado (kg)' : 'Carga · serie top (kg)')
      + (truncated ? ` · últimas ${points.length}` : '');
    topSvg = `${grid}${lines}${dots}${lastCap}`
      + `<text x="${pad.l}" y="${pad.t - 6}" fill="var(--color-text-secondary)" font-size="${fsTitle}" font-weight="600">${title}</text>`;
  }

  // ── Escalera de series ──
  const allReps = [];
  for (const p of points) for (const s of p.sets) if (s.reps != null) allReps.push(s.reps);
  const maxSetReps = allReps.length ? Math.max(...allReps) : 0;
  const unitH = maxSetReps ? (repH * 0.88) / maxSetReps : 0;

  let bars = '';
  points.forEach((p, i) => {
    const done = p.sets.filter(s => s.reps != null);
    if (!done.length) return;
    const n = done.length;
    const w = Math.max(3, (colW - (n - 1)) / n);
    const totalW = w * n + (n - 1);
    done.forEach((s, j) => {
      const x = xs[i] - totalW / 2 + j * (w + 1);
      const h = Math.max(2, s.reps * unitH);
      // La serie más pesada va sólida y las de aproximación translúcidas: el
      // peso de cada serie, sin añadir una leyenda ni un segundo eje.
      const op = p.topKg > 0 && s.kg != null ? 0.35 + 0.65 * (s.kg / p.topKg) : 0.7;
      const tip = `${formatDateShort(p.date)} · serie ${j + 1}: ${s.kg != null ? kgLabel(s.kg) + ' kg × ' : ''}${s.reps} reps`;
      bars += `<rect x="${x.toFixed(1)}" y="${(baseY - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="var(--color-accent-text)" opacity="${op.toFixed(2)}"><title>${tip}</title></rect>`;
    });
  });

  const repScale = maxSetReps
    ? `<text x="${pad.l - 6}" y="${(baseY - repH * 0.88 + 3).toFixed(1)}" text-anchor="end" fill="var(--color-text-secondary)" font-size="${fsAxis}" font-weight="500">${maxSetReps}</text>`
    : '';

  // Etiquetas de fecha: se piden por número y luego se descartan las que no
  // caben de verdad, porque la X ya no es uniforme.
  const wanted = new Set([0, points.length - 1]);
  const maxX = Math.max(3, Math.floor(cW / 64));
  for (let k = 0; k < maxX; k++) wanted.add(Math.round(k * (points.length - 1) / Math.max(1, maxX - 1)));
  const minLabelGap = narrow ? 46 : 66;
  const kept = [];
  [...wanted].sort((a, b) => a - b).forEach(i => {
    if (!kept.length || xs[i] - xs[kept[kept.length - 1]] >= minLabelGap) kept.push(i);
  });
  const lastIdx = points.length - 1;
  if (kept[kept.length - 1] !== lastIdx) {
    if (kept.length > 1 && xs[lastIdx] - xs[kept[kept.length - 2]] < minLabelGap) kept.pop();
    kept.push(lastIdx);
  }
  const xLabels = kept.map(i =>
    `<text x="${xs[i].toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="var(--color-text-secondary)" font-size="${fsAxis}" font-weight="500">${formatDateShort(points[i].date)}</text>`).join('');

  const baseline = `<line x1="${pad.l}" y1="${baseY}" x2="${W - pad.r}" y2="${baseY}" stroke="var(--color-border-subtle)" stroke-width="0.5"/>`;

  const aria = `Evolución de las últimas ${points.length} sesiones`
    + (hasKg ? ': carga en kilos arriba y repeticiones por serie abajo.' : ': repeticiones por serie.');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="${aria}">
    ${topSvg}
    <text x="${pad.l}" y="${repTitleY}" fill="var(--color-text-secondary)" font-size="${fsTitle}" font-weight="600">Reps por serie${!hasKg && truncated ? ` · últimas ${points.length}` : ''}</text>
    ${legend}
    ${baseline}${bars}${repScale}${xLabels}
  </svg>`;
}

// ── Tiles ─────────────────────────────────────────────────
//
// "Progreso" comparaba la última sesión con la primera de la historia: a las
// treinta sesiones ese número solo puede crecer y ya no dice si estás
// progresando ahora. Las ventanas son de cuatro sesiones contra las cuatro
// anteriores, que es la pregunta que se hace quien mira esto.

/** El récord y CUÁNDO se consiguió. Se queda con la primera vez que se alcanzó
 *  el valor máximo: empatar el récord no es batirlo, y marcar dos filas como PR
 *  convierte el badge en ruido. */
function prOf(points, hasKg, loadKey) {
  let value = null, point = null;
  for (const p of points) {
    const v = hasKg ? p[loadKey] : p.bestReps;
    // Cero no es un récord: en un aguante cronometrado no hay reps que contar.
    if (v != null && v > 0 && (value == null || v > value)) { value = v; point = p; }
  }
  return { value, point };
}

function media(arr, key) {
  const v = arr.map(p => p[key]).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function tile(label, value, unit, delta, cls = 'flat') {
  return `<div class="tile">
    <div class="tile-label">${label}</div>
    <div class="tile-value">${value}${unit ? `<span class="tile-unit">${unit}</span>` : ''}</div>
    <div class="tile-delta tile-delta--${cls}">${delta}</div>
  </div>`;
}

function renderTiles(points, { hasKg, hasE1rm, loadKey }) {
  const last4 = points.slice(-4);
  const prev4 = points.slice(-8, -4);
  const trendKey = hasKg ? loadKey : 'totalReps';
  const cur = media(last4, trendKey);
  const before = media(prev4, trendKey);
  const pct = cur != null && before ? (cur / before - 1) * 100 : null;

  const { value: pr, point: prPoint } = prOf(points, hasKg, loadKey);

  const setsCur = media(last4, 'nSets');
  const setsBefore = media(prev4, 'nSets');

  const tiles = [];

  tiles.push(tile(
    hasKg ? (hasE1rm ? '1RM estimado' : 'Serie top') : 'Mejor serie',
    pr == null ? '—' : Math.round(pr),
    hasKg ? 'kg' : 'reps',
    prPoint ? `récord · ${formatDateShort(prPoint.date)}` : 'sin registro',
    'flat'
  ));

  tiles.push(tile(
    'Tendencia',
    pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    '',
    pct == null ? 'faltan sesiones' : '4 últimas vs 4 previas',
    pct == null ? 'flat' : (pct >= 0 ? 'up' : 'down')
  ));

  tiles.push(tile(
    'Series',
    setsCur == null ? '—' : setsCur.toFixed(1),
    '/sesión',
    setsBefore == null ? 'sin comparación' : `antes ${setsBefore.toFixed(1)}`,
    setsBefore == null || setsCur == null ? 'flat' : (setsCur >= setsBefore ? 'up' : 'down')
  ));

  tiles.push(tile(
    'Sesiones',
    points.length,
    '',
    `última ${formatDateShort(points[points.length - 1].date)}`,
    'flat'
  ));

  return tiles.join('');
}

// ── Historial ─────────────────────────────────────────────
//
// Una fila por sesión con la escalera real de series, no tres resúmenes que no
// se corresponden entre sí. La tabla es donde se compara: el peso y las reps de
// cada serie se leen tal como se hicieron.

function renderHistory(points, name, { hasKg, hasE1rm, loadKey }) {
  const { point: prPoint } = prOf(points, hasKg, loadKey);

  const filas = points.slice().reverse().map(p => {
    const isPR = prPoint === p;
    const vol = p.volume > 1000 ? `${(p.volume / 1000).toFixed(1)} t` : `${Math.round(p.volume)} kg`;
    return `<tr${isPR ? ' class="is-pr"' : ''}>
      <td class="ph-date">${formatDateShort(p.date)}</td>
      <td class="ph-ladder">${p.ladder}${isPR ? ' <span class="ph-pr">PR</span>' : ''}</td>
      <td class="ph-num">${p.nSets}</td>
      <td class="ph-num">${p.totalReps || '—'}</td>
      ${hasKg ? `<td class="ph-num ph-vol">${p.volume ? vol : '—'}</td>` : ''}
      ${hasKg && hasE1rm ? `<td class="ph-num">${p.e1rm != null ? `${Math.round(p.e1rm)} kg` : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  return `<table class="progress-history">
    <caption>Historial de ${esc(name)}</caption>
    <thead><tr>
      <th scope="col">Fecha</th>
      <th scope="col">${hasKg ? 'Series (kg × reps)' : 'Series (reps)'}</th>
      <th scope="col" class="ph-num">Nº</th>
      <th scope="col" class="ph-num">Reps</th>
      ${hasKg ? '<th scope="col" class="ph-num ph-vol">Volumen</th>' : ''}
      ${hasKg && hasE1rm ? '<th scope="col" class="ph-num">e1RM</th>' : ''}
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>`;
}
