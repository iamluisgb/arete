import { formatDate, esc } from '../utils.js';
import { getActiveProgram, getCustomPrograms } from '../programs.js';
import { formatRunDuration } from './running-helpers.js';
import { getScheduleConfig } from '../schedule.js';
import { saveDB } from '../data.js';
import * as LLM from '../ai/llm.js';
import { isConnected, getSyncDiag } from '../drive.js';

function normLift(name) {
  const n = name.toLowerCase();
  if (n.includes('sentadilla') && !n.includes('frontal') && !n.includes('1 pierna')) return 'Sentadilla';
  if (n.includes('press') && (n.includes('banca') || n.includes('bench'))) return 'Press Banca';
  if (n.includes('press') && n.includes('militar')) return 'Press Militar';
  if (n.includes('peso muerto') && !n.includes('rumano') && !n.includes('unilateral')) return 'Peso Muerto';
  if (n === 'clean') return 'Clean';
  if (n.includes('remo')) return 'Remo con Barra';
  return null;
}

/** Render estimated 1RMs or personal records panel */
export function render1RMs(db) {
  const prog = getActiveProgram();
  const title = document.getElementById('rmTitle');
  if (prog !== 'arete') {
    title.textContent = 'Récords Personales';
    renderRecords(db, prog);
    return;
  }
  title.textContent = '1RM Estimados';
  const lifts = {};
  db.workouts.filter(w => (w.program || 'arete') === 'arete').forEach(w => {
    w.exercises.forEach(ex => {
      const n = normLift(ex.name);
      if (!n) return;
      ex.sets.forEach(s => {
        const kg = parseFloat(s.kg), reps = parseInt(s.reps);
        if (!kg || !reps || reps < 1) return;
        const rm = kg * reps * .0333 + kg;
        if (!lifts[n] || rm > lifts[n].rm) lifts[n] = { rm, kg, reps, date: w.date };
      });
    });
  });
  const p = document.getElementById('rmPanel'), k = Object.keys(lifts);
  if (!k.length) {
    p.innerHTML = '<p class="panel-note">Registra entrenamientos para ver tus 1RM estimados.</p>';
    return;
  }
  p.innerHTML = `<div class="tiles">${k.map(n =>
    `<div class="tile"><div class="tile-label">${esc(n)}</div><div class="tile-value">${lifts[n].rm.toFixed(1)}<span class="tile-unit">kg</span></div><div class="tile-delta tile-delta--flat">${lifts[n].kg}kg × ${lifts[n].reps} · ${formatDate(lifts[n].date)}</div></div>`
  ).join('')}</div>`;
}

function renderRecords(db, prog) {
  const workouts = db.workouts.filter(w => (w.program || 'arete') === prog);
  const records = {};
  workouts.forEach(w => {
    w.exercises.forEach(ex => {
      if (!records[ex.name]) records[ex.name] = { maxKg: 0, bestResult: '', bestNum: 0, kgDate: '', resDate: '', count: 0 };
      const rec = records[ex.name];
      rec.count++;
      ex.sets.forEach(s => {
        const kg = parseFloat(s.kg) || 0;
        if (kg > rec.maxKg) { rec.maxKg = kg; rec.kgDate = w.date; }
        const num = parseInt(s.reps) || 0;
        if (num > rec.bestNum) { rec.bestNum = num; rec.bestResult = s.reps; rec.resDate = w.date; }
      });
    });
  });
  const p = document.getElementById('rmPanel');
  const entries = Object.entries(records).sort((a, b) => b[1].count - a[1].count);
  if (!entries.length) {
    p.innerHTML = '<p class="panel-note">Registra entrenamientos para ver tus récords.</p>';
    return;
  }
  p.innerHTML = `<div class="tiles">${entries.map(([name, r]) => {
    const val = r.maxKg > 0
      ? `${r.maxKg} kg`
      : (r.bestResult || '—');
    const sub = r.maxKg > 0
      ? `Mejor peso · ${formatDate(r.kgDate)}`
      : (r.resDate ? `Mejor resultado · ${formatDate(r.resDate)}` : '');
    return `<div class="tile"><div class="tile-label">${esc(name)} · ${r.count}×</div><div class="tile-value">${esc(val)}</div>${sub ? `<div class="tile-delta tile-delta--flat">${sub}</div>` : ''}</div>`;
  }).join('')}</div>`;
}

// ── Programación semanal: días ancla por plan ──────────────────────────────
// Cada plan (fuerza / running) reparte sus sesiones pendientes entre los días
// ancla que el atleta marque. Es un checkbox por día: el estado vive en
// db.settings.schedule, que viaja con el sync existente por ser parte de
// db.settings. Persistimos por saveDB, el mismo camino que el resto de Ajustes.

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const LETRA_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const PLANES_ANCLA = [['arete', 'schedAnchorsArete'], ['running', 'schedAnchorsRunning']];

/** Resumen corto de anclas: "L·X·V" — para el estado de la fila del índice. */
function resumenAnclas(anchors) {
  return anchors.map(n => LETRA_DIA[n - 1]).join('·');
}

/** Pinta los checkboxes Lun..Dom de cada plan según db.settings.schedule. */
export function renderScheduleAnchors(db) {
  const cfg = getScheduleConfig(db);
  for (const [plan, sel] of PLANES_ANCLA) {
    const el = document.getElementById(sel);
    if (!el) continue;
    el.innerHTML = DIAS_SEMANA.map((nombre, i) => {
      const dia = i + 1;
      const on = cfg[plan].anchors.includes(dia);
      return `<label class="sched-anchor${on ? ' on' : ''}">` +
        `<input type="checkbox" data-plan="${plan}" value="${dia}"${on ? ' checked' : ''}> ${nombre}</label>`;
    }).join('');
  }
}

/** Guarda los anclas de un plan tras un cambio de checkbox. */
function guardarAnclas(db, plan, contenedor) {
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  const anchors = [...contenedor.querySelectorAll('input[type="checkbox"]:checked')]
    .map(cb => parseInt(cb.value))
    .filter(n => n >= 1 && n <= 7)
    .sort((a, b) => a - b);
  db.settings.schedule = { ...(db.settings.schedule || {}), [plan]: { anchors } };
  saveDB(db);
}

// ── Ajustes: índice y subpáginas ────────────────────────────────────────────
//
// Ajustes dejó de ser una lista plana de 1300px para ser un índice de filas que
// abren subpáginas. Lo que hace que el índice valga la pena no es el plegado en
// sí —eso solo esconde— sino que **cada fila enseña su estado a la derecha**:
// "Sin configurar", "5K 22:40 · FC máx 188", "Drive · hace 2 h". Así el índice
// se lee de un vistazo y solo entras donde vas a cambiar algo.

const AUTOSYNC_KEY = 'areteAutoSync';
const SYNC_TS_KEY = 'areteLastSync';

/** "hace 2 h", "ayer", "12 mar" — la precisión que importa decrece con la edad. */
function timeAgo(ts, now = Date.now()) {
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  return formatDate(new Date(ts).toISOString().slice(0, 10));
}

function setStatus(id, text, { off = false } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  // "Sin configurar" no es un valor, es la ausencia de uno: se marca como
  // secundario para que la vista distinga lo puesto de lo que falta por poner.
  el.classList.toggle('listrow-status--off', off);
}

/** Refresca los valores que cada fila del índice enseña a su derecha. */
export function renderSettingsIndex(db) {
  const race5k = db.settings?.race5k || 0;
  const maxHR = db.settings?.maxHR || 0;
  const zonas = [
    race5k > 0 ? `5K ${formatRunDuration(race5k)}` : null,
    maxHR > 0 ? `FC máx ${maxHR}` : null,
  ].filter(Boolean);
  setStatus('setZonesStatus', zonas.length ? zonas.join(' · ') : 'Por defecto', { off: !zonas.length });

  const customs = getCustomPrograms(db).length;
  setStatus('setPlansStatus',
    customs ? `${customs} propio${customs > 1 ? 's' : ''}` : 'Solo los incluidos',
    { off: !customs });

  // Programación semanal: qué días ancla tiene cada plan, en una línea.
  const sched = getScheduleConfig(db);
  const partes = [
    sched.arete.anchors.length ? `Fuerza ${resumenAnclas(sched.arete.anchors)}` : null,
    sched.running.anchors.length ? `Running ${resumenAnclas(sched.running.anchors)}` : null,
  ].filter(Boolean);
  setStatus('setScheduleStatus', partes.length ? partes.join(' · ') : 'Sin configurar', { off: !partes.length });

  if (LLM.isDemo()) {
    // La demo no es un proveedor de la lista y su alias de modelo no le dice nada a
    // nadie: el índice tiene que decir en qué estado está, no repetir la config.
    setStatus('setQuironStatus', 'Demo · sin API key');
  } else if (LLM.hasKey()) {
    const prov = LLM.currentProvider();
    setStatus('setQuironStatus', `${prov ? prov.id : 'Personalizado'} · ${LLM.getModel()}`);
  } else {
    setStatus('setQuironStatus', 'Sin configurar', { off: true });
  }

  const last = parseInt(localStorage.getItem(SYNC_TS_KEY)) || 0;
  if (localStorage.getItem(AUTOSYNC_KEY) === '1') {
    // Activada sin permiso vivo es el caso peligroso: creerse a salvo y no
    // tener copia. Se dice aquí, no solo dentro de la subpágina.
    setStatus('setBackupStatus', isConnected()
      ? (last ? `Drive · ${timeAgo(last)}` : 'Drive · activada')
      : 'Falta reconectar', { off: !isConnected() });
  } else {
    setStatus('setBackupStatus', last ? `Manual · ${timeAgo(last)}` : 'Sin copia', { off: !last });
  }
}

// ── UX-8: diagnóstico de sincronización ───────────────────────────────────
//
// La fila del índice dice hace cuánto fue la última copia; este bloque dice
// por qué falla cuando falla. El motor de sync (sync/engine.js) lleva la
// cuenta: resultado del último ciclo, error, fallos consecutivos y una
// historia corta de ciclos. Aquí solo se pinta — nada se calcula dos veces.

/**
 * Markup del diagnóstico, puro para que sea testeable: `now` entra como
 * parámetro y nada lee el DOM. `diag` es lo que devuelve getSyncDiag()
 * (js/drive.js), o null si el motor no llegó a arrancar.
 */
export function formatSyncDiag(diag, now = Date.now()) {
  if (!diag) return '<p class="sync-diag-line">Sin actividad de sincronización</p>';
  const lines = [];
  if (!diag.lastCycleAt) {
    lines.push('<p class="sync-diag-line">Sin ciclos aún</p>');
  } else {
    const result = diag.lastResult === 'ok' ? 'OK' : 'error';
    lines.push(`<p class="sync-diag-line">Último ciclo: ${result} · ${esc(timeAgo(diag.lastCycleAt, now))}</p>`);
  }
  if (diag.lastError) lines.push(`<p class="sync-diag-line sync-diag-error">${esc(diag.lastError)}</p>`);
  if (diag.consecutiveFailures > 0) {
    lines.push(`<p class="sync-diag-line">${diag.consecutiveFailures} fallos seguidos</p>`);
  }
  const hist = (diag.history || []).slice(0, 3);
  if (hist.length) {
    lines.push(`<ul class="sync-diag-list">${hist.map(h => {
      const result = h.result === 'ok' ? 'OK' : 'error';
      // El detalle solo importa en los errores: en los OK es "pulled:0 pushed:1".
      const detalle = h.result !== 'ok' && h.detail ? ` — ${esc(h.detail)}` : '';
      return `<li>${result} · ${esc(timeAgo(h.at, now))}${detalle}</li>`;
    }).join('')}</ul>`);
  }
  return lines.join('');
}

/** Pinta el diagnóstico en el bloque plegado de la subpágina de copia. */
export function renderSyncDiag() {
  const el = document.getElementById('syncDiagBody');
  if (!el) return;
  el.innerHTML = formatSyncDiag(getSyncDiag());
}

// drive.js expone UN solo slot onSyncStatus y app.js lo usa para el indicador
// de la cabecera: suscribirnos aquí lo pisaría en silencio. El indicador
// cambia en cada transición del motor ('syncing'/'ok'/'error'), así que
// observarlo equivale al callback sin tocar drive.js ni app.js. Sin intervalos.
let _diagObserver = null;
function watchSyncStatus() {
  if (_diagObserver) return;
  const ind = document.getElementById('syncIndicator');
  if (!ind || typeof MutationObserver === 'undefined') return;
  _diagObserver = new MutationObserver(() => {
    // Solo interesa si el bloque está en pantalla; innerHTML vacío no molesta.
    if (document.getElementById('setBackup')?.classList.contains('active')) renderSyncDiag();
  });
  _diagObserver.observe(ind, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true });
}

/** Muestra una subpágina de Ajustes (o el índice) y lleva el foco a su título. */
export function openSettingsPage(id) {
  const sec = document.getElementById('secSettings');
  if (!sec) return;
  sec.querySelectorAll('.set-page').forEach(p => p.classList.toggle('active', p.id === id));
  sec.dataset.setpage = id;
  // El diagnóstico se refresca al entrar: si refrescara en cada ciclo, pintaría
  // una subpágina que nadie está mirando.
  if (id === 'setBackup') renderSyncDiag();
  // El scroll es de la ventana, no del panel: sin esto entras a una subpágina
  // corta por la mitad, con el scroll heredado del índice.
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.getElementById(id)?.querySelector('.page-title')?.focus();
}

/** Vuelve al índice. Se llama al entrar en Ajustes desde la nav. */
export function resetSettingsToIndex() {
  if (document.getElementById('secSettings')?.dataset.setpage !== 'setIndex') openSettingsPage('setIndex');
}

export function initSettingsNav(db) {
  const sec = document.getElementById('secSettings');
  if (!sec) return;
  sec.dataset.setpage = 'setIndex';
  watchSyncStatus();
  renderScheduleAnchors(db);
  // Cambios de anclas: un checkbox escribe db.settings.schedule y persiste por
  // el camino de siempre. Re-render para sincronizar el resaltado .on.
  sec.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-plan]');
    if (!cb) return;
    guardarAnclas(db, cb.dataset.plan, cb.closest('.sched-anchors'));
    renderScheduleAnchors(db);
    renderSettingsIndex(db);
  });
  sec.addEventListener('click', (e) => {
    const target = e.target.closest('[data-setpage]');
    if (!target) return;
    openSettingsPage(target.dataset.setpage);
    if (target.dataset.setpage === 'setIndex') renderSettingsIndex(db);
  });
  // Escape sale de la subpágina antes que de la app. Solo si no hay un modal
  // abierto por encima: ahí Escape es suyo.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!sec.classList.contains('active') || sec.dataset.setpage === 'setIndex') return;
    if (document.querySelector('.modal-overlay.open, .sheet.open')) return;
    openSettingsPage('setIndex');
    renderSettingsIndex(db);
  });
}
