import { saveDB, markDeleted } from '../data.js';
import { getBodyMeasures } from '../programs.js';
import { formatDate, safeNum, confirmDanger, esc } from '../utils.js';
import { DEFAULT_HEIGHT, DEFAULT_AGE } from '../constants.js';
import { toast } from './toast.js';

// Cuerpo es la primera pantalla del design system, y lo que la reorganiza es una
// sola distinción: **capturar** y **consultar** son dos modos distintos y no
// pueden compartir plano visual.
//
// Antes la sección apilaba once campos vacíos, un botón de guardar y cuatro
// paneles de resultado en la misma columna: al abrirla no sabías si te estaba
// preguntando algo o contándote algo. Ahora la pantalla por defecto es de
// lectura —estado, proporciones, calorías, historial— y la captura vive en una
// hoja que se invoca (#bodySheet). Se registra el cuerpo una vez cada muchos
// días; se consulta muchas más veces que eso, y la pantalla por defecto tiene
// que servir al caso frecuente.
//
// La hoja es la misma para crear y para editar: "Editar" en el historial la
// abre con el registro cargado y un banner que dice cuál. Dos formularios para
// el mismo dato es como se desincronizan las cosas.

let editingBodyId = null;
let $bodyDate, $bodyMeasures, $bodyHistory, $bodyEditBanner, $bodyEditText, $bodyDeleteBtn, $bodySaveBtn;
let $calcHeight, $calcAge, $proportionsPanel, $caloriesPanel;
let $bodySheet, $bodyNowPanel, $bodyLastLog, $bodyWeightChart, $bodyWeightRange, $bodyHistCount;

// ── La hoja de captura ────────────────────────────────────
// Quien la abrió recupera el foco al cerrarla: si no, el foco se queda en el
// <body> y el teclado tiene que recorrer la página entera para volver.
let sheetOpener = null;
let _db = null;

export function openBodySheet(opener) {
  sheetOpener = opener || document.activeElement;
  $bodySheet.classList.add('open');
  $bodyDate.focus();
}

export function closeBodySheet() {
  $bodySheet.classList.remove('open');
  sheetOpener?.focus?.();
  sheetOpener = null;
  // Cerrar sin guardar cancela la edición. Si no, la próxima vez que pulses
  // "Registrar medidas" estarías reescribiendo, sin saberlo, el registro que
  // abriste hace media hora: la hoja se vería igual salvo por un banner.
  if (_db && editingBodyId) { clearBodyEditState(); renderBodyForm(_db); }
}

export function isBodySheetOpen() {
  return !!$bodySheet?.classList.contains('open');
}

function clearBodyEditState() {
  editingBodyId = null;
  $bodySaveBtn.textContent = 'Guardar medidas';
  $bodyEditBanner.hidden = true;
  $bodyDeleteBtn.hidden = true;
}

/** Render body measurement input fields with last-value placeholders */
export function renderBodyForm(db) {
  const last = db.bodyLogs.length ? db.bodyLogs[db.bodyLogs.length - 1] : {};
  $bodyMeasures.innerHTML = getBodyMeasures().map(m =>
    `<label class="field"><span class="field-label">${esc(m.label)}</span><input type="number" id="bm_${m.id}" step="0.1" placeholder="${last[m.id] || '—'}" autocomplete="off" inputmode="decimal"></label>`
  ).join('');
}

/** Save or update a body measurement log entry */
export function saveBodyLog(db) {
  const date = $bodyDate.value;
  const entry = { date, id: editingBodyId || Date.now() };
  let has = false;
  getBodyMeasures().forEach(m => {
    const v = document.getElementById('bm_' + m.id).value;
    if (v) { const n = safeNum(v, 0.1, 500); if (n !== null) { entry[m.id] = n; has = true; } }
  });
  if (!has) { toast('Introduce al menos una medida', 'error'); return; }

  const wasEditing = !!editingBodyId;
  if (editingBodyId) {
    const idx = db.bodyLogs.findIndex(l => l.id === editingBodyId);
    if (idx !== -1) db.bodyLogs[idx] = entry;
    editingBodyId = null;
  } else {
    db.bodyLogs.push(entry);
  }
  saveDB(db);

  clearBodyEditState();
  renderBodyForm(db);
  renderBody(db);
  closeBodySheet();

  toast(wasEditing ? 'Medidas actualizadas' : 'Medidas guardadas');
}

export function startBodyEdit(logId, db, opener) {
  const log = db.bodyLogs.find(l => l.id === logId);
  if (!log) return;

  editingBodyId = logId;

  // Fill form
  $bodyDate.value = log.date;
  getBodyMeasures().forEach(m => {
    const input = document.getElementById('bm_' + m.id);
    input.value = log[m.id] || '';
  });

  // Show edit banner
  $bodyEditText.textContent = `Editando el registro del ${formatDate(log.date)}`;
  $bodyEditBanner.hidden = false;

  // Show delete, change save text
  $bodyDeleteBtn.hidden = false;
  $bodySaveBtn.textContent = 'Guardar cambios';

  openBodySheet(opener);
}

/** Initialize body section: cache selectors and bind events */
export function initBody(db) {
  _db = db;
  $bodyDate = document.getElementById('bodyDate');
  $bodyMeasures = document.getElementById('bodyMeasures');
  $bodyHistory = document.getElementById('bodyHistory');
  $bodyEditBanner = document.getElementById('bodyEditBanner');
  $bodyEditText = document.getElementById('bodyEditText');
  $bodyDeleteBtn = document.getElementById('bodyDeleteBtn');
  $bodySaveBtn = document.getElementById('bodySaveBtn');
  $calcHeight = document.getElementById('calcHeight');
  $calcAge = document.getElementById('calcAge');
  $proportionsPanel = document.getElementById('proportionsPanel');
  $caloriesPanel = document.getElementById('caloriesPanel');
  $bodySheet = document.getElementById('bodySheet');
  $bodyNowPanel = document.getElementById('bodyNowPanel');
  $bodyLastLog = document.getElementById('bodyLastLog');
  $bodyWeightChart = document.getElementById('bodyWeightChart');
  $bodyWeightRange = document.getElementById('bodyWeightRange');
  $bodyHistCount = document.getElementById('bodyHistCount');

  $bodySaveBtn.addEventListener('click', () => saveBodyLog(db));
  document.getElementById('bodyLogBtn').addEventListener('click', (e) => openBodySheet(e.currentTarget));
  document.getElementById('bodySheetClose').addEventListener('click', () => closeBodySheet());
  // Clic en el velo, no en el panel: el gesto universal de "cerrar esto".
  $bodySheet.addEventListener('click', (e) => { if (e.target === $bodySheet) closeBodySheet(); });

  // "Registrar la primera" del estado vacío y "Medir la muñeca" de las
  // proporciones abren la misma hoja.
  document.getElementById('secBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-body-log]');
    if (btn) openBodySheet(btn);
  });

  $bodyHistory.addEventListener('click', (e) => {
    const btn = e.target.closest('.hi-edit-btn');
    if (!btn) return;
    const item = btn.closest('[data-body-id]');
    if (item) startBodyEdit(parseInt(item.dataset.bodyId), db, btn);
  });
  $bodyEditBanner.addEventListener('click', (e) => {
    if (e.target.closest('.body-edit-cancel')) cancelBodyEdit(db);
  });
  $bodyDeleteBtn.addEventListener('click', () => deleteBodyLog(db));
  $calcHeight.addEventListener('change', () => {
    if (!db.settings) db.settings = {};
    db.settings.height = parseInt($calcHeight.value) || DEFAULT_HEIGHT;
    saveDB(db);
    calcCalories(db);
  });
  $calcAge.addEventListener('change', () => {
    if (!db.settings) db.settings = {};
    db.settings.age = parseInt($calcAge.value) || DEFAULT_AGE;
    saveDB(db);
    calcCalories(db);
  });
}

export function cancelBodyEdit(db) {
  clearBodyEditState();
  renderBodyForm(db);
}

export function deleteBodyLog(db) {
  confirmDanger($bodyDeleteBtn, () => {
    markDeleted(db, editingBodyId, 'bodyLogs');
    db.bodyLogs = db.bodyLogs.filter(l => l.id !== editingBodyId);
    saveDB(db);
    toast('Registro eliminado', 'info');
    clearBodyEditState();
    renderBodyForm(db);
    renderBody(db);
    closeBodySheet();
  });
}

/** Todo lo de lectura de Cuerpo, en una llamada. */
export function renderBody(db) {
  renderBodyNow(db);
  renderWeightChart(db);
  renderBodyHistory(db);
  calcProportions(db);
  calcCalories(db);
}

/** Estado actual: la última cifra de cada medida y cuánto se movió. */
export function renderBodyNow(db) {
  const logs = db.bodyLogs;
  if (!logs.length) {
    $bodyLastLog.textContent = 'Todavía no has registrado ninguna medida.';
    $bodyNowPanel.innerHTML = `<div class="empty-state">
        <p><b>Sin registros todavía.</b></p>
        <p class="empty-state-sub">La primera medida es la referencia contra la que se compara todo lo demás.</p>
        <button type="button" class="btn btn--secondary" data-body-log>Registrar la primera</button>
      </div>`;
    return;
  }

  const last = getLatestBodyData(db);
  const dates = Object.values(last._dates || {}).sort();
  $bodyLastLog.textContent = `${logs.length} ${logs.length === 1 ? 'registro' : 'registros'} · último el ${formatDate(dates[dates.length - 1])}`;

  // La variación NO se colorea de bueno/malo: la app no sabe si subir de peso
  // es tu objetivo o tu problema. El signo lo dice y el usuario juzga.
  const cell = (label, value, unit, sub) => `<div class="band-cell">
      <span class="band-label">${label}</span>
      <span class="band-value">${value}${unit ? `<span class="band-unit">${unit}</span>` : ''}</span>
      ${sub ? `<span class="band-sub">${sub}</span>` : ''}
    </div>`;
  const cells = getBodyMeasures()
    .filter(m => last[m.id] != null)
    .map(m => {
      const val = last[m.id];
      const prev = previousValue(db, m.id, last._dates[m.id]);
      const sub = prev == null ? '' : `<span class="mono">${signed(val - prev.v)}</span> desde el ${formatDate(prev.date)}`;
      const { name, unit } = splitUnit(m.label);
      return cell(esc(name), round1(val), unit, sub);
    });
  // La masa magra no se registra: sale del peso y la grasa del mismo día. Es la
  // cifra que distingue perder grasa de perder músculo cuando baja la báscula.
  if (last.peso != null && last.grasa != null && last._dates.peso === last._dates.grasa) {
    cells.push(cell('Masa magra', round1(last.peso * (1 - last.grasa / 100)), 'kg', 'peso × (1 − grasa)'));
  }
  const missing = getBodyMeasures().filter(m => last[m.id] == null).length;
  if (missing) {
    cells.push(cell('Sin medir', missing, missing === 1 ? 'medida' : 'medidas',
      '<button type="button" class="btn btn--ghost btn--sm body-now-log" data-body-log>Medir ahora</button>'));
  }
  $bodyNowPanel.innerHTML = cells.join('');
}

/** "Peso (kg)" → { name: 'Peso', unit: 'kg' }; "% Grasa" → { name: 'Grasa', unit: '%' }. */
function splitUnit(label) {
  const paren = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) return { name: paren[1], unit: paren[2] };
  const pct = label.match(/^%\s*(.*)$/);
  if (pct) return { name: pct[1], unit: '%' };
  return { name: label, unit: '' };
}

/** La evolución del peso: es la pregunta que trae a la gente a esta pantalla. */
export function renderWeightChart(db) {
  const pts = db.bodyLogs
    .filter(l => l.date && Number.isFinite(parseFloat(l.peso)))
    .map(l => ({ date: l.date, v: parseFloat(l.peso) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) {
    $bodyWeightRange.textContent = '';
    $bodyWeightChart.innerHTML = `<p class="panel-note">Con dos registros de peso verás aquí cómo evoluciona.</p>`;
    return;
  }
  const W = 720, H = 210, L = 40, R = 16, T = 16, B = 30;
  const t = d => new Date(d + 'T00:00:00').getTime();
  const t0 = t(pts[0].date), t1 = t(pts[pts.length - 1].date);
  const lo = Math.floor(Math.min(...pts.map(p => p.v))), hi = Math.ceil(Math.max(...pts.map(p => p.v)));
  const span = Math.max(hi - lo, 1), step = span > 8 ? Math.ceil(span / 4) : 1;
  const x = d => L + (W - L - R) * (t1 === t0 ? 0.5 : (t(d) - t0) / (t1 - t0));
  const y = v => T + (H - T - B) * (1 - (v - lo) / span);
  const grid = [];
  for (let v = lo; v <= hi; v += step) {
    grid.push(`<line class="wc-grid${v === lo ? ' wc-base' : ''}" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="wc-axis" x="0" y="${(y(v) + 4).toFixed(1)}">${v}</text>`);
  }
  // Una etiqueta por mes, en el día 1 de cada uno: es un eje de tiempo, no de
  // registros. Con la etiqueta en el primer registro del mes, un mes sin
  // medidas no aparecía y feb–abr se leía como dos meses. El mes del primer
  // registro se rotula en su sitio si no pisa al siguiente.
  const mes = d => new Date(d + 'T00:00:00').toLocaleDateString('es', { month: 'short' }).replace('.', '');
  const ticks = [];
  const c = new Date(pts[0].date.slice(0, 7) + '-01T00:00:00');
  for (c.setMonth(c.getMonth() + 1); c.getTime() <= t1; c.setMonth(c.getMonth() + 1)) {
    const d = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-01`;
    ticks.push({ d, x: x(d) });
  }
  if (!ticks.length || ticks[0].x - x(pts[0].date) > 40) ticks.unshift({ d: pts[0].date, x: x(pts[0].date) });
  // Con muchos meses, uno de cada n para que no se monten.
  const cada = Math.ceil(ticks.length / 12);
  const months = ticks.filter((_, i) => i % cada === 0)
    .map(k => `<text class="wc-axis" x="${k.x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${mes(k.d)}</text>`);
  const line = pts.map(p => `${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const first = pts[0], lastP = pts[pts.length - 1];
  const area = `M${x(first.date).toFixed(1)},${y(lo).toFixed(1)} L${line.replace(/ /g, ' L')} L${x(lastP.date).toFixed(1)},${y(lo).toFixed(1)}Z`;
  const anio = d => d.slice(0, 4);
  $bodyWeightRange.textContent = `${mes(first.date)} ${anio(first.date)} – ${mes(lastP.date)} ${anio(lastP.date)}`;
  $bodyWeightChart.innerHTML = `<svg class="weight-chart" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Peso del ${formatDate(first.date)} al ${formatDate(lastP.date)}: de ${round1(first.v)} a ${round1(lastP.v)} kg">
      ${grid.join('')}${months.join('')}
      <path class="wc-area" d="${area}"/>
      <polyline class="wc-line" points="${line}"/>
      ${pts.slice(0, -1).map(p => `<circle class="wc-dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3"/>`).join('')}
      <circle class="wc-last" cx="${x(lastP.date).toFixed(1)}" cy="${y(lastP.v).toFixed(1)}" r="4.5"/>
    </svg>`;
}

function round1(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function signed(d) {
  const r = round1(Math.abs(d));
  if (Math.abs(d) < 0.05) return '=';
  return (d > 0 ? '+' : '−') + r;
}

/** El valor anterior de una medida, saltándose el registro que ya se muestra. */
function previousValue(db, id, currentDate) {
  for (let i = db.bodyLogs.length - 1; i >= 0; i--) {
    const l = db.bodyLogs[i];
    if (l[id] == null) continue;
    if (!l.date || l.date >= currentDate) continue;
    return { v: Number(l[id]), date: l.date };
  }
  return null;
}

/** Render the last 10 body measurement logs */
export function renderBodyHistory(db) {
  const logs = [...db.bodyLogs].reverse().slice(0, 10);
  if (logs.length === 0) {
    $bodyHistory.innerHTML = `<div class="empty-state">
        <p><b>Sin registros todavía.</b></p>
        <p class="empty-state-sub">Guarda tus primeras medidas y aquí verás cómo evolucionan.</p>
      </div>`;
    return;
  }

  // Tabla, no lista de pares etiqueta-valor: esta pantalla existe para ver la
  // evolución, y una evolución se lee comparando columnas. Solo se muestran las
  // medidas que alguien ha registrado alguna vez — con las once fijas, la mitad
  // de la tabla serían guiones.
  const cols = getBodyMeasures().filter(m => logs.some(l => l[m.id] != null));
  // El cambio de peso respecto al registro anterior: es lo que se busca al leer
  // la tabla, y restarlo de cabeza fila a fila es el trabajo que la tabla ahorra.
  const prevPeso = l => {
    const i = db.bodyLogs.indexOf(l);
    for (let k = i - 1; k >= 0; k--) if (db.bodyLogs[k].peso != null) return Number(db.bodyLogs[k].peso);
    return null;
  };
  const head = cols.map(m => `<th scope="col" class="bh-num">${esc(m.label)}</th>`
    + (m.id === 'peso' ? '<th scope="col" class="bh-num">Cambio</th>' : '')).join('');
  const filas = logs.map(l => `
    <tr data-body-id="${l.id}">
      <th scope="row" class="bh-date">${formatDate(l.date)}</th>
      ${cols.map(m => {
        const td = `<td class="bh-num">${l[m.id] != null ? l[m.id] : '—'}</td>`;
        if (m.id !== 'peso') return td;
        const p = l.peso != null ? prevPeso(l) : null;
        return td + `<td class="bh-num bh-soft">${p == null ? '—' : signed(Number(l.peso) - p)}</td>`;
      }).join('')}
      <td class="bh-action"><button type="button" class="btn btn--ghost btn--sm hi-edit-btn" aria-label="Editar el registro del ${formatDate(l.date)}">Editar</button></td>
    </tr>`).join('');
  $bodyHistCount.textContent = db.bodyLogs.length > logs.length ? `${logs.length} de ${db.bodyLogs.length}` : String(logs.length);

  $bodyHistory.innerHTML = `<div class="table-scroll">
      <table class="body-history">
        <caption class="sr-only">Historial de medidas corporales</caption>
        <thead><tr><th scope="col">Fecha</th>${head}<th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

function getLatestBodyData(db) {
  const r = {}, dates = {};
  [...db.bodyLogs].reverse().forEach(l => {
    getBodyMeasures().forEach(m => {
      if (!r[m.id] && l[m.id]) { r[m.id] = l[m.id]; dates[m.id] = l.date; }
    });
  });
  r._dates = dates;
  return r;
}

/** Calculate and display ideal body proportions based on wrist ratio */
export function calcProportions(db) {
  const last = getLatestBodyData(db);
  if (!last.muneca) {
    $proportionsPanel.innerHTML = `<div class="body-prop-empty">
        <p>Mide la muñeca y verás tus proporciones de brazo, pecho, hombros y muslo: es la referencia de estructura ósea de la que salen todas.</p>
        <button type="button" class="btn btn--secondary" data-body-log>Medir la muñeca</button>
      </div>`;
    return;
  }
  const ps = [
    { label: 'Brazo / Muñeca', current: last.biceps, target: last.muneca * 2.5, tl: `${(last.muneca * 2.5).toFixed(1)}cm (2.5×)`, has: !!last.biceps },
    { label: 'Pecho / Muñeca', current: last.pecho, target: last.muneca * 6.5, tl: `${(last.muneca * 6.5).toFixed(1)}cm (6.5×)`, has: !!last.pecho },
    { label: 'Hombros / Cintura', current: last.hombros, target: last.cintura * 1.618, tl: `${(last.cintura * 1.618).toFixed(1)}cm (φ)`, has: !!(last.hombros && last.cintura) },
    { label: 'Pantorrilla ≈ Bíceps', current: last.pantorrilla, target: last.biceps, tl: `${last.biceps || '—'}cm`, has: !!(last.pantorrilla && last.biceps) },
    { label: 'Muslo / Rodilla', current: last.muslo, target: last.rodilla * 1.618, tl: `${((last.rodilla || 0) * 1.618).toFixed(1)}cm (φ)`, has: !!(last.muslo && last.rodilla) }
  ];
  const usedIds = ['muneca', 'biceps', 'pecho', 'hombros', 'cintura', 'pantorrilla', 'muslo', 'rodilla'];
  const usedDates = new Set(usedIds.filter(id => last[id]).map(id => last._dates[id]));
  const dateWarning = usedDates.size > 1
    ? `<p class="panel-note prop-warn">Datos de ${usedDates.size} fechas distintas — registra todas las medidas el mismo día para mayor precisión</p>`
    : '';
  $proportionsPanel.innerHTML = dateWarning + '<div class="prop-grid">' + ps.map(p => {
    if (!p.has) return `<div class="prop-row prop-row--empty"><div class="prop-label">${p.label}</div><div class="prop-value">Faltan medidas</div></div>`;
    const pct = Math.min((p.current / p.target) * 100, 120);
    // Tres estados y no un gradiente: dentro de rango, por debajo, por encima.
    const state = pct >= 95 && pct <= 105 ? 'ok' : pct < 95 ? 'low' : 'high';
    return `<div class="prop-row prop-row--${state}">
        <div class="prop-label">${p.label}</div>
        <div class="prop-value">${p.current.toFixed(1)}cm <span class="prop-target">/ ${p.tl}</span></div>
        <div class="prop-bar"><div class="prop-fill" style="width:${Math.min(pct, 100)}%"></div></div>
      </div>`;
  }).join('') + '</div>';
}

/** Calculate BMR, maintenance, and target calorie ranges */
export function calcCalories(db) {
  const last = getLatestBodyData(db);
  const h = safeNum($calcHeight.value, 100, 250) ?? DEFAULT_HEIGHT;
  const age = safeNum($calcAge.value, 10, 120) ?? DEFAULT_AGE;
  const peso = last.peso || 70, grasa = last.grasa || 15;
  const t1 = 10 * peso + 6.25 * h - 5 * age + 5;
  const lbm = peso * (1 - grasa / 100);
  const t2 = 370 + 21.6 * lbm;
  const tmb = (t1 + t2) / 2, m = tmb * 1.65;
  const row = (k, v, note) =>
    `<div class="kv-row"><span class="kv-k">${k}${note ? ` <small>· ${note}</small>` : ''}</span><span class="kv-v">${v}</span></div>`;
  $caloriesPanel.innerHTML = `<div class="kv">
      ${row('Basal, en reposo', Math.round(tmb), 'media de dos fórmulas')}
      ${row('Mantener el peso', Math.round(m), '× 1.65')}
      ${row('Volumen', `${Math.round(m * 1.1)}–${Math.round(m * 1.15)}`, '+10 a 15 %')}
      ${row('Definición', Math.round(m * .85), '−15 %')}
      ${row('Definición máxima', Math.round(peso * 22), '22 por kg')}
    </div>
    <p class="panel-note">Con ${peso} kg y ${grasa} % de grasa${last.peso ? '' : ' (valores por defecto: registra tu peso)'}.</p>`;
}
