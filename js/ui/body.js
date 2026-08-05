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
let $bodySheet, $bodyNowPanel, $bodyLastLog;

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

  $bodySaveBtn.addEventListener('click', () => saveBodyLog(db));
  document.getElementById('bodyLogBtn').addEventListener('click', (e) => openBodySheet(e.currentTarget));
  document.getElementById('bodySheetClose').addEventListener('click', () => closeBodySheet());
  // Clic en el velo, no en el panel: el gesto universal de "cerrar esto".
  $bodySheet.addEventListener('click', (e) => { if (e.target === $bodySheet) closeBodySheet(); });

  // "Registrar la primera" del estado vacío abre la misma hoja.
  $bodyNowPanel.addEventListener('click', (e) => {
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
    markDeleted(db, editingBodyId);
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

  const tiles = getBodyMeasures()
    .filter(m => last[m.id] != null)
    .map(m => {
      const val = last[m.id];
      const prev = previousValue(db, m.id, last._dates[m.id]);
      // La variación NO se colorea de bueno/malo: la app no sabe si subir de
      // peso es tu objetivo o tu problema. El signo lo dice y el usuario juzga.
      const delta = prev == null ? ''
        : `<div class="tile-delta tile-delta--flat">${signed(val - prev.v)} desde ${formatDate(prev.date)}</div>`;
      return `<div class="tile">
          <div class="tile-label">${esc(m.label)}</div>
          <div class="tile-value">${round1(val)}</div>
          ${delta}
        </div>`;
    }).join('');

  const missing = getBodyMeasures().filter(m => last[m.id] == null).length;
  $bodyNowPanel.innerHTML = tiles + (missing
    ? `<div class="tile tile--empty"><div class="tile-label">Sin medir</div><div class="tile-value">${missing} ${missing === 1 ? 'medida' : 'medidas'}</div></div>`
    : '');
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
  const head = cols.map(m => `<th scope="col" class="bh-num">${esc(m.label)}</th>`).join('');
  const filas = logs.map(l => `
    <tr data-body-id="${l.id}">
      <th scope="row" class="bh-date">${formatDate(l.date)}</th>
      ${cols.map(m => `<td class="bh-num">${l[m.id] != null ? l[m.id] : '—'}</td>`).join('')}
      <td class="bh-action"><button type="button" class="btn btn--sm btn--secondary hi-edit-btn">Editar</button></td>
    </tr>`).join('');

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
    $proportionsPanel.innerHTML = '<p class="panel-note">Registra la muñeca para calcular las proporciones: es la referencia de estructura ósea de la que salen todas.</p>';
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
  $proportionsPanel.innerHTML = dateWarning + ps.map(p => {
    if (!p.has) return `<div class="prop-row prop-row--empty"><div class="prop-label">${p.label}</div><div class="prop-value">Faltan medidas</div></div>`;
    const pct = Math.min((p.current / p.target) * 100, 120);
    // Tres estados y no un gradiente: dentro de rango, por debajo, por encima.
    const state = pct >= 95 && pct <= 105 ? 'ok' : pct < 95 ? 'low' : 'high';
    return `<div class="prop-row prop-row--${state}">
        <div class="prop-label">${p.label}</div>
        <div class="prop-value">${p.current.toFixed(1)}cm <span class="prop-target">/ ${p.tl}</span></div>
        <div class="prop-bar"><div class="prop-fill" style="width:${Math.min(pct, 100)}%"></div></div>
      </div>`;
  }).join('');
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
  const tile = (label, value, sub) =>
    `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}<span class="tile-unit">kcal</span></div>${sub ? `<div class="tile-delta tile-delta--flat">${sub}</div>` : ''}</div>`;
  $caloriesPanel.innerHTML = `<div class="tiles">
      ${tile('TMB (media)', Math.round(tmb), `Peso ${peso}kg · Grasa ${grasa}%`)}
      ${tile('Mantenimiento', Math.round(m), '×1.65')}
      ${tile('Volumen', `${Math.round(m * 1.1)}–${Math.round(m * 1.15)}`, '+10 a 15%')}
      ${tile('Definición', Math.round(m * .85), '−15%')}
      ${tile('Def. máxima', Math.round(peso * 22), '×22/kg')}
    </div>`;
}
