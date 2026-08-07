import { formatDate, esc } from '../utils.js';
import { getActiveProgram, getCustomPrograms } from '../programs.js';
import { formatRunDuration } from './running-helpers.js';
import * as LLM from '../ai/llm.js';
import { isConnected } from '../drive.js';

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
    title.textContent = 'Records Personales';
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
function timeAgo(ts) {
  const min = Math.floor((Date.now() - ts) / 60000);
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

  if (LLM.hasKey()) {
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

/** Muestra una subpágina de Ajustes (o el índice) y lleva el foco a su título. */
export function openSettingsPage(id) {
  const sec = document.getElementById('secSettings');
  if (!sec) return;
  sec.querySelectorAll('.set-page').forEach(p => p.classList.toggle('active', p.id === id));
  sec.dataset.setpage = id;
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
