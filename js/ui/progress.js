import { getActiveProgram } from '../programs.js';
import { esc, formatDateShort } from '../utils.js';

let _bound = false;
let _chartCache = { name: null, count: 0, w: 0 };
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
  _chartCache = { name: null, count: 0, w: 0 };
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

/** Render SVG chart + stats + history for the selected exercise */
export function renderProgressChart(db) {
  const name = document.getElementById('progressExercise').value;
  const wCount = db.workouts.length;
  const availW = chartWidth();
  if (_chartCache.name === name && _chartCache.count === wCount && _chartCache.w === availW) return;
  _chartCache = { name, count: wCount, w: availW };
  if (!name) {
    document.getElementById('progressChart').innerHTML = '<p style="color:var(--color-text-secondary);text-align:center;padding:60px 0;font-size:.85rem">Selecciona un ejercicio para ver tu progreso.</p>';
    document.getElementById('progressStats').innerHTML = '';
    document.getElementById('progressHistory').innerHTML = '';
    return;
  }

  const prog = getActiveProgram();
  const points = [];
  db.workouts
    .filter(w => (w.program || 'arete') === prog)
    .slice().sort((a, b) => a.date.localeCompare(b.date))
    .forEach(w => {
      const ex = w.exercises.find(e => e.name === name); if (!ex) return;
      let maxKg = 0, totalVol = 0, maxReps = 0;
      ex.sets.forEach(s => {
        const kg = parseFloat(s.kg) || 0, r = parseInt(s.reps) || 0;
        if (kg > maxKg) maxKg = kg;
        totalVol += kg * r;
        if (r > maxReps) maxReps = r;
      });
      points.push({ date: w.date, maxKg, totalVol, maxReps, session: w.session });
    });

  if (points.length === 0) {
    document.getElementById('progressChart').innerHTML = '<p style="color:var(--color-text-secondary);text-align:center;padding:60px 0;font-size:.85rem">Sin datos para este ejercicio.<br><span style="font-size:.75rem">Necesitas al menos 2 sesiones registradas.</span></p>';
    document.getElementById('progressStats').innerHTML = '';
    document.getElementById('progressHistory').innerHTML = '';
    return;
  }

  // Determine if this exercise uses kg or reps-only
  const hasKg = points.some(p => p.maxKg > 0);
  const metric = hasKg ? 'maxKg' : 'maxReps';
  const metricLabel = hasKg ? 'Peso máx (kg)' : 'Max reps';
  const metricUnit = hasKg ? 'kg' : 'reps';

  // ── AU-12 · UNA SERIE POR VARIANTE DEL PLAN ───────────────────────────────
  // Antes: un punto por entreno con ese ejercicio, todo en una sola línea. Con
  // un plan de dos variantes (A a 100 kg, B a 110 kg) la gráfica dibujaba un
  // serrucho de ±10 kg con más de 100 vértices y la tendencia real —que sube—
  // quedaba invisible. La serie no es «el ejercicio»: es «el ejercicio EN esa
  // sesión del plan», el mismo hilo que ya usa el motor de progresión
  // (AGENTS.md: «el hilo de progresión es (ejercicio, objetivo de reps)»). El
  // dato ya viajaba en el punto (`w.session`); solo no se usaba.
  const series = [];
  for (const p of points) {
    let s = series.find(x => x.session === p.session);
    if (!s) { s = { session: p.session, points: [] }; series.push(s); }
    s.points.push(p);
  }
  const colorDe = (i) => ['var(--color-accent-text)', 'var(--color-domain-running)',
    'var(--color-state-warning)', 'var(--color-state-info)'][i % 4];

  const W = availW, H = W >= 560 ? 220 : 180, pad = { t: 20, r: 16, b: 30, l: 40 };
  // Con el viewBox siguiendo al ancho real ya no hay escalado, así que los
  // cuerpos de 9-10px son literales: en una gráfica ancha se quedan cortos.
  const fsAxis = W >= 560 ? 12 : 9, fsTitle = W >= 560 ? 13 : 10;
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const vals = points.map(p => p[metric]);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const yOf = (v) => pad.t + cH - (((v - minV) / range) * cH);

  // El eje X es de FECHAS y lo comparten todas las series. Escalando cada serie
  // por su propio índice —que es lo que hacía el código cuando solo había una—
  // dos variantes que caen en semanas distintas se dibujarían una encima de la
  // otra: la gráfica afirmaría que van en paralelo cuando van alternadas.
  const fechas = [...new Set(points.map(p => p.date))].sort();
  const xOf = (date) => fechas.length > 1
    ? pad.l + (fechas.indexOf(date) / (fechas.length - 1)) * cW
    : pad.l + cW / 2;

  const coordsDe = (s) => s.points.map(p => ({ x: xOf(p.date), y: yOf(p[metric]), date: p.date }));
  // Bézier por tramos, como antes. Con menos de dos puntos no hay trazo: una
  // serie de una sola sesión se dibuja como punto, no como una línea inventada.
  const trazo = (cs) => {
    if (cs.length < 2) return '';
    let d = `M${cs[0].x},${cs[0].y}`;
    for (let i = 1; i < cs.length; i++) {
      const cp = (cs[i].x - cs[i - 1].x) * 0.3;
      d += ` C${cs[i - 1].x + cp},${cs[i - 1].y} ${cs[i].x - cp},${cs[i].y} ${cs[i].x},${cs[i].y}`;
    }
    return d;
  };

  const ySteps = 4;
  let yLabels = '';
  for (let i = 0; i <= ySteps; i++) {
    const v = minV + (range / ySteps) * i;
    const y = pad.t + cH - ((i / ySteps) * cH);
    yLabels += `<text x="${pad.l - 8}" y="${y + 3}" text-anchor="end" fill="var(--color-text-secondary)" font-size="${fsAxis}" font-weight="500">${Math.round(v)}</text>`;
    yLabels += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--color-border-subtle)" stroke-width="0.5"/>`;
  }

  let xLabels = '';
  // Cuántas fechas caben sin solaparse depende del ancho real, no de un número
  // fijo: una etiqueta dd/mm pide ~64px. Ahora se muestrean las FECHAS, no los
  // puntos: con dos series, un punto por sesión ya no representa una fecha.
  const maxX = Math.max(3, Math.floor(cW / 64));
  const fechasVisibles = fechas.length <= maxX
    ? fechas
    : [...new Set(Array.from({ length: maxX }, (_, k) =>
        fechas[Math.round(k * (fechas.length - 1) / (maxX - 1))]))];
  fechasVisibles.forEach(d => {
    xLabels += `<text x="${xOf(d)}" y="${H - 4}" text-anchor="middle" fill="var(--color-text-secondary)" font-size="${fsAxis}" font-weight="500">${formatDateShort(d)}</text>`;
  });

  // El relleno de área solo con una serie. Con dos, apilar dos áreas deja la de
  // abajo tapada y la gráfica pasa a tener una serie de primera y otra de
  // segunda sin que nada lo diga.
  const areaDe = (cs, c) => (cs.length < 2 ? '' : `<path d="${trazo(cs)} L${cs[cs.length - 1].x},${pad.t + cH} L${cs[0].x},${pad.t + cH} Z" fill="url(#areaGrad${c === colorDe(0) ? '' : '2'})" opacity="0.9"/>`);

  const cuerpoSeries = series.map((s, i) => {
    const cs = coordsDe(s), c = colorDe(i), nombre = esc(s.session);
    const puntos = cs.map((p, k) => {
      const isLast = k === cs.length - 1;
      return `<circle data-fecha="${esc(p.date)}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isLast ? 4.5 : 3}" fill="${c}" opacity="${isLast ? 1 : 0.6}"/>`;
    }).join('');
    return areaDe(cs, c)
      + `<path data-serie="${nombre}" d="${trazo(cs)}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<g data-serie="${nombre}">${puntos}</g>`;
  }).join('');

  const accentColor = hasKg ? 'var(--color-accent-text)' : 'var(--color-state-info)';
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(metricLabel)} de ${esc(name)}${series.length > 1 ? `, una línea por sesión del plan: ${series.map(s => esc(s.session)).join(', ')}` : ''}" style="width:100%;height:auto">
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${accentColor}" stop-opacity="0.2"/><stop offset="100%" stop-color="${accentColor}" stop-opacity="0.02"/></linearGradient>
      <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--color-domain-running)" stop-opacity="0.2"/><stop offset="100%" stop-color="var(--color-domain-running)" stop-opacity="0.02"/></linearGradient>
    </defs>
    ${yLabels}${xLabels}
    ${cuerpoSeries}
    <text x="${pad.l}" y="12" fill="var(--color-text-secondary)" font-size="${fsTitle}" font-weight="600">${metricLabel}</text>
  </svg>`;

  // Dos líneas sin nombre no dicen nada: el color no es información hasta que
  // alguien lo ancla a una etiqueta. Va en HTML y no dentro del <svg> para que
  // pueda envolver en móvil y para no chocar con el título de la métrica.
  const leyenda = series.length > 1
    ? `<div class="ph-legend">${series.map((s, i) =>
        `<span><i style="background:${colorDe(i)}"></i>${esc(s.session)}</span>`).join('')}</div>`
    : '';

  document.getElementById('progressChart').innerHTML = svg + leyenda;

  // Stats. El PR es el máximo de TODO el periodo —un récord es un récord, sin
  // importar de qué variante salió—, pero el delta de progreso se mide sobre la
  // serie con más sesiones: comparando el primer y el último entreno del periodo
  // a secas, con un plan de dos variantes el «desde» podía ser un día A y el
  // «hasta» un día B, y el atleta leía una regresión que no existía.
  const principal = series.reduce((a, b) => (b.points.length > a.points.length ? b : a), series[0]);
  const first = principal.points[0], last = principal.points[principal.points.length - 1];
  const pr = Math.max(...vals);
  const diff = last[metric] - first[metric];
  const diffPct = first[metric] > 0 ? ((diff / first[metric]) * 100).toFixed(0) : 0;
  const totalSessions = points.length;

  document.getElementById('progressStats').innerHTML = [
    { label: 'PR', value: pr + metricUnit, color: accentColor },
    { label: 'Progreso', value: (diff >= 0 ? '+' : '') + diff + metricUnit, color: diff >= 0 ? 'var(--color-state-success)' : 'var(--color-state-danger)' },
    { label: 'Cambio', value: (diff >= 0 ? '+' : '') + diffPct + '%', color: diff >= 0 ? 'var(--color-state-success)' : 'var(--color-state-danger)' },
    { label: 'Sesiones', value: totalSessions, color: 'var(--color-text-secondary)' }
  ].map(s => `<div style="flex:1;background:var(--color-surface-1);border:.5px solid var(--color-border-subtle);border-radius:var(--radius-lg);padding:10px 8px;text-align:center"><div style="font-size:1.1rem;font-weight:800;color:${s.color}">${s.value}</div><div style="font-size:.6rem;color:var(--color-text-secondary);font-weight:600;text-transform:uppercase;margin-top:2px">${s.label}</div></div>`).join('');

  // ── AU-14 · LA TABLA DICE DE QUÉ VARIANTE ES CADA FILA ────────────────────
  // Con el récord partido por variante, una fila con PR y otra al mismo peso sin
  // él son inexplicables si la tabla no dice de qué sesión viene cada una. La
  // columna solo aparece cuando hay más de una: con una sola variante es ruido.
  const hayVariantes = series.length > 1;

  // ── AU-13 · EL RÉCORD SE SUPERA, NO SE IGUALA ─────────────────────────────
  // `p[metric] === pr` marcaba récord cada vez que se repetía el máximo
  // histórico —con un plan de dos variantes casi una fila de cada dos salía con
  // insignia, tres PR en nueve días por el mismo 110 kg— y el récord era único
  // para todo el ejercicio, así que el 110 kg del día B borraba el récord del
  // día A. Ahora el récord es por variante, se marca solo al superarlo, y la
  // igualdad tiene su propio distintivo: repetir tu mejor marca no es superarla.
  const record = new Map();
  for (const p of points) {
    const v = p[metric], prev = record.get(p.session) || 0;
    p._pr = v > prev;
    p._eq = !p._pr && v === prev && prev > 0;
    if (v > prev) record.set(p.session, v);
  }

  // Historial: es una tabla —fecha, sesión, peso, reps, volumen— y en escritorio
  // se lee como tal, con cabecera y los números alineados a la derecha. Como
  // lista de pares etiqueta-valor obligaba a releer qué era cada número en cada
  // fila.
  const filas = points.slice().reverse().map(p => {
    const sello = p._pr ? ' <span class="ph-pr">PR</span>'
      : p._eq ? ' <span class="ph-eq">= récord</span>' : '';
    const vol = p.totalVol > 1000 ? (p.totalVol / 1000).toFixed(1) + 't' : Math.round(p.totalVol) + 'kg';
    return `<tr${p._pr ? ' class="is-pr"' : ''}>
      <td class="ph-date">${formatDateShort(p.date)}</td>
      ${hayVariantes ? `<td class="ph-session">${esc(p.session)}</td>` : ''}
      <td class="ph-num"><b>${hasKg ? p.maxKg + ' kg' : p.maxReps + ' reps'}</b>${sello}</td>
      ${hasKg ? `<td class="ph-num">${p.maxReps}</td><td class="ph-num">${vol}</td>` : ''}
    </tr>`;
  }).join('');

  document.getElementById('progressHistory').innerHTML = `
    <table class="progress-history">
      <caption>Historial de ${esc(name)}</caption>
      <thead><tr>
        <th scope="col">Fecha</th>
        ${hayVariantes ? '<th scope="col">Sesión</th>' : ''}
        <th scope="col" class="ph-num">${hasKg ? 'Peso máx' : 'Reps máx'}</th>
        ${hasKg ? '<th scope="col" class="ph-num">Reps</th><th scope="col" class="ph-num">Volumen</th>' : ''}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
}
