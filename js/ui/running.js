import { saveDB, markDeleted } from '../data.js';
import { getRunningProgramList, getRunningPhases } from '../programs.js';
import { safeNum, esc, confirmDanger, formatDate, today } from '../utils.js';
import { toast } from './toast.js';

// ── Helpers ──────────────────────────────────────────────

const ZONE_COLORS = { Z1: '#999', Z2: '#34c759', Z3: '#ff9f0a', Z4: '#ff6b35', Z5: '#ff3b30' };
const ZONE_LABELS = { Z1: 'Recuperación', Z2: 'Aeróbico', Z3: 'Tempo', Z4: 'Umbral', Z5: 'VAM/VO2max' };

/** Format seconds as "m:ss /km" */
export function formatPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

/** Format total seconds as "h:mm:ss" or "mm:ss" */
export function formatRunDuration(totalSec) {
  if (!totalSec || totalSec <= 0) return '—';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Parse "mm:ss" or "h:mm:ss" into total seconds */
export function parseRunDuration(str) {
  if (!str) return 0;
  str = str.trim();
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// ── State ────────────────────────────────────────────────

let editingId = null;

// ── DOM refs ─────────────────────────────────────────────

let $weekSelect, $sessionSelect, $segments, $date, $type, $distance, $duration;
let $hr, $elevation, $cadence, $notes, $paceDisplay, $saveBtn, $deleteBtn;
let $editBanner, $editText, $historyFilter, $historyList;
let $weeklyChart, $paceChart, $statsPanel;

function cacheSelectors() {
  $weekSelect = document.getElementById('runWeekSelect');
  $sessionSelect = document.getElementById('runSessionSelect');
  $segments = document.getElementById('runSegments');
  $date = document.getElementById('runDate');
  $type = document.getElementById('runType');
  $distance = document.getElementById('runDistance');
  $duration = document.getElementById('runDuration');
  $hr = document.getElementById('runHr');
  $elevation = document.getElementById('runElevation');
  $cadence = document.getElementById('runCadence');
  $notes = document.getElementById('runNotes');
  $paceDisplay = document.getElementById('runPaceDisplay');
  $saveBtn = document.getElementById('runSaveBtn');
  $deleteBtn = document.getElementById('runDeleteBtn');
  $editBanner = document.getElementById('runEditBanner');
  $editText = document.getElementById('runEditText');
  $historyFilter = document.getElementById('runHistoryFilter');
  $historyList = document.getElementById('runHistoryList');
  $weeklyChart = document.getElementById('runWeeklyChart');
  $paceChart = document.getElementById('runPaceChart');
  $statsPanel = document.getElementById('runStatsPanel');
}

// ── Init ─────────────────────────────────────────────────

export function initRunning(db) {
  cacheSelectors();
  $date.value = today();

  // Sub-nav tabs
  document.querySelectorAll('.run-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.run-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.run-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.run).classList.add('active');

      if (btn.dataset.run === 'runHistory') renderRunHistory(db);
      if (btn.dataset.run === 'runProgress') renderRunProgress(db);
    });
  });

  // Populate program weeks
  populateRunWeeks(db);

  $weekSelect.addEventListener('change', () => {
    db.runningWeek = parseInt($weekSelect.value) || 1;
    saveDB(db);
    populateRunSessions(db);
  });

  $sessionSelect.addEventListener('change', () => loadRunSessionTemplate(db));

  // Live pace calculation
  const calcPace = () => {
    const dist = parseFloat($distance.value);
    const dur = parseRunDuration($duration.value);
    if (dist > 0 && dur > 0) {
      $paceDisplay.textContent = `Ritmo: ${formatPace(dur / dist)}`;
      $paceDisplay.style.display = '';
    } else {
      $paceDisplay.style.display = 'none';
    }
  };
  $distance.addEventListener('input', calcPace);
  $duration.addEventListener('input', calcPace);

  // Save
  $saveBtn.addEventListener('click', () => saveRunningLog(db));

  // Delete (only visible in edit mode)
  $deleteBtn.addEventListener('click', () => {
    confirmDanger($deleteBtn, () => deleteRunLog(db, editingId));
  });

  // Cancel edit
  document.querySelector('.run-edit-cancel')?.addEventListener('click', () => cancelEdit(db));

  // History filter
  $historyFilter.addEventListener('change', () => renderRunHistory(db));

  // History list click delegation
  $historyList.addEventListener('click', e => {
    const card = e.target.closest('.run-history-card');
    if (!card) return;
    const id = parseInt(card.dataset.id);
    if (e.target.closest('.run-edit-btn')) {
      startRunEdit(id, db);
    } else if (e.target.closest('.run-delete-btn')) {
      confirmDanger(e.target.closest('.run-delete-btn'), () => deleteRunLog(db, id));
    }
  });
}

// ── Program / Week / Session population ──────────────────

function populateRunWeeks(db) {
  const programs = getRunningProgramList();
  if (programs.length === 0) {
    $weekSelect.innerHTML = '<option value="">Sin programa</option>';
    $sessionSelect.innerHTML = '<option value="">Sesión libre</option>';
    $segments.innerHTML = '';
    return;
  }

  // Use first running program or saved one
  const progId = db.runningProgram || programs[0].id;
  db.runningProgram = progId;
  const phases = getRunningPhases(progId);
  const weekKeys = Object.keys(phases).sort((a, b) => parseInt(a) - parseInt(b));

  $weekSelect.innerHTML = weekKeys.map(k =>
    `<option value="${k}" ${parseInt(k) === db.runningWeek ? 'selected' : ''}>${phases[k].name || 'Semana ' + k}</option>`
  ).join('');

  populateRunSessions(db);
}

function populateRunSessions(db) {
  const progId = db.runningProgram;
  const phases = getRunningPhases(progId);
  const week = phases[$weekSelect.value];
  if (!week || !week.sessions) {
    $sessionSelect.innerHTML = '<option value="">—</option>';
    $segments.innerHTML = '';
    return;
  }

  const sessionNames = Object.keys(week.sessions);
  $sessionSelect.innerHTML = sessionNames.map(s =>
    `<option value="${esc(s)}">${esc(s)}</option>`
  ).join('');

  loadRunSessionTemplate(db);
}

function loadRunSessionTemplate(db) {
  const progId = db.runningProgram;
  const phases = getRunningPhases(progId);
  const week = phases[$weekSelect.value];
  if (!week) { $segments.innerHTML = ''; return; }

  const sessionName = $sessionSelect.value;
  const segs = week.sessions?.[sessionName];
  if (!segs || segs.length === 0) { $segments.innerHTML = ''; return; }

  $segments.innerHTML = segs.map((seg, i) => {
    const zone = seg.zone || 'Z2';
    const color = ZONE_COLORS[zone] || ZONE_COLORS.Z2;
    const zoneLabel = ZONE_LABELS[zone] || zone;

    let info = '';
    if (seg.mode === 'run-intervals') {
      info = `${seg.reps} × ${seg.distance || seg.duration || ''}`;
      if (seg.pace) info += ` a ${seg.pace}`;
      if (seg.recovery) info += ` · Rec: ${seg.recovery}`;
    } else {
      info = seg.duration || '';
      if (seg.desc) info += ` · ${seg.desc}`;
    }

    return `
      <div class="run-segment-card" style="border-left-color:${color}">
        <div class="run-seg-header">
          <span class="run-seg-name">${esc(seg.name)}</span>
          <span class="run-seg-zone" style="background:${color}">${zone}</span>
        </div>
        <div class="run-seg-info">${esc(info)}</div>
        <div class="run-seg-inputs">
          <div><label>Ritmo real</label><input type="text" class="run-seg-pace" data-idx="${i}" placeholder="m:ss" inputmode="numeric"></div>
          <div><label>FC</label><input type="number" class="run-seg-hr" data-idx="${i}" placeholder="—" min="0" max="250" inputmode="numeric"></div>
        </div>
      </div>`;
  }).join('');

  // Auto-select type based on session name
  const name = sessionName.toLowerCase();
  if (name.includes('vam') || name.includes('×') || name.includes('series')) $type.value = 'intervalos';
  else if (name.includes('rodaje')) $type.value = 'rodaje';
  else if (name.includes('tempo')) $type.value = 'tempo';
  else if (name.includes('fartlek')) $type.value = 'fartlek';
  else if (name.includes('cuesta')) $type.value = 'cuestas';
  else if (name.includes('competición') || name.includes('competicion') || name.includes('maratón') || name.includes('maraton')) $type.value = 'competicion';
  else if (name.includes('ritmo')) $type.value = 'intervalos';
}

// ── Save ─────────────────────────────────────────────────

function saveRunningLog(db) {
  const distance = safeNum($distance.value, 0.01, 500);
  const duration = parseRunDuration($duration.value);

  if (!distance && !duration) {
    toast('Introduce al menos distancia o duración', 'warn');
    return;
  }

  const segments = [];
  document.querySelectorAll('.run-segment-card').forEach((card, i) => {
    const paceInput = card.querySelector('.run-seg-pace');
    const hrInput = card.querySelector('.run-seg-hr');
    const name = card.querySelector('.run-seg-name')?.textContent || '';
    segments.push({
      name,
      actualPace: paceInput?.value || '',
      actualHr: safeNum(hrInput?.value, 30, 250) || null
    });
  });

  const log = {
    id: editingId || Date.now(),
    date: $date.value || today(),
    session: $sessionSelect.value || '',
    program: db.runningProgram || '',
    week: parseInt($weekSelect.value) || 0,
    type: $type.value,
    distance: distance || 0,
    duration: duration || 0,
    pace: distance && duration ? Math.round(duration / distance) : 0,
    hr: safeNum($hr.value, 30, 250) || null,
    elevation: safeNum($elevation.value, 0, 10000) || null,
    cadence: safeNum($cadence.value, 50, 300) || null,
    segments: segments.length > 0 ? segments : [],
    notes: $notes.value.trim()
  };

  if (!Array.isArray(db.runningLogs)) db.runningLogs = [];

  if (editingId) {
    const idx = db.runningLogs.findIndex(l => l.id === editingId);
    if (idx >= 0) db.runningLogs[idx] = log;
    else db.runningLogs.push(log);
  } else {
    db.runningLogs.push(log);
  }

  saveDB(db);
  toast(editingId ? 'Sesión actualizada' : 'Sesión guardada');
  resetForm(db);
}

function resetForm(db) {
  editingId = null;
  $date.value = today();
  $distance.value = '';
  $duration.value = '';
  $hr.value = '';
  $elevation.value = '';
  $cadence.value = '';
  $notes.value = '';
  $paceDisplay.style.display = 'none';
  $editBanner.style.display = 'none';
  $deleteBtn.style.display = 'none';
  $saveBtn.textContent = 'Guardar sesión';
  loadRunSessionTemplate(db);
}

function cancelEdit(db) {
  resetForm(db);
}

// ── Edit ─────────────────────────────────────────────────

function startRunEdit(id, db) {
  const log = (db.runningLogs || []).find(l => l.id === id);
  if (!log) return;

  editingId = id;

  // Switch to train sub-tab
  document.querySelectorAll('.run-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.run-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-run="runTrain"]').classList.add('active');
  document.getElementById('runTrain').classList.add('active');

  $date.value = log.date || '';
  $type.value = log.type || 'libre';
  $distance.value = log.distance || '';
  $duration.value = log.duration ? formatRunDuration(log.duration) : '';
  $hr.value = log.hr || '';
  $elevation.value = log.elevation || '';
  $cadence.value = log.cadence || '';
  $notes.value = log.notes || '';

  // Show pace
  if (log.pace) {
    $paceDisplay.textContent = `Ritmo: ${formatPace(log.pace)}`;
    $paceDisplay.style.display = '';
  }

  // Fill segment inputs if available
  if (log.segments) {
    log.segments.forEach((seg, i) => {
      const paceInput = document.querySelector(`.run-seg-pace[data-idx="${i}"]`);
      const hrInput = document.querySelector(`.run-seg-hr[data-idx="${i}"]`);
      if (paceInput) paceInput.value = seg.actualPace || '';
      if (hrInput) hrInput.value = seg.actualHr || '';
    });
  }

  $editBanner.style.display = '';
  $editText.textContent = `Editando sesión del ${formatDate(log.date)}`;
  $deleteBtn.style.display = '';
  $saveBtn.textContent = 'Guardar cambios';
}

// ── Delete ───────────────────────────────────────────────

function deleteRunLog(db, id) {
  if (!id) return;
  markDeleted(db, id);
  db.runningLogs = (db.runningLogs || []).filter(l => l.id !== id);
  saveDB(db);
  toast('Sesión eliminada');
  if (editingId === id) resetForm(db);
  renderRunHistory(db);
}

// ── History ──────────────────────────────────────────────

export function renderRunHistory(db) {
  const logs = (db.runningLogs || []).slice().sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id - a.id;
  });

  const filter = $historyFilter?.value || '';
  const filtered = filter ? logs.filter(l => l.type === filter) : logs;

  if (filtered.length === 0) {
    $historyList.innerHTML = '<div class="empty-state">Sin sesiones de running registradas</div>';
    return;
  }

  $historyList.innerHTML = filtered.slice(0, 50).map(log => {
    const typeLabel = log.type ? log.type.charAt(0).toUpperCase() + log.type.slice(1) : '';
    const pace = log.pace ? formatPace(log.pace) : '';
    const dur = log.duration ? formatRunDuration(log.duration) : '';
    const dist = log.distance ? `${log.distance} km` : '';

    let details = [dist, dur, pace].filter(Boolean).join(' · ');
    let extras = [];
    if (log.hr) extras.push(`♥ ${log.hr} bpm`);
    if (log.elevation) extras.push(`↑ ${log.elevation} m`);
    if (log.cadence) extras.push(`${log.cadence} ppm`);

    return `
      <div class="run-history-card" data-id="${log.id}">
        <div class="run-hist-top">
          <span class="run-hist-date">${formatDate(log.date)}</span>
          <span class="run-hist-type">${esc(typeLabel)}</span>
        </div>
        ${log.session ? `<div class="run-hist-session">${esc(log.session)}</div>` : ''}
        <div class="run-hist-details">${esc(details)}</div>
        ${extras.length ? `<div class="run-hist-extras">${extras.join(' · ')}</div>` : ''}
        <div class="run-hist-actions">
          <button class="btn-sm btn-outline run-edit-btn">Editar</button>
          <button class="btn-sm btn-outline run-delete-btn">Borrar</button>
        </div>
      </div>`;
  }).join('');
}

// ── Progress ─────────────────────────────────────────────

export function renderRunProgress(db) {
  const logs = (db.runningLogs || []).slice().sort((a, b) => a.date.localeCompare(b.date));

  if (logs.length === 0) {
    $weeklyChart.innerHTML = '<div class="empty-state">Sin datos</div>';
    $paceChart.innerHTML = '';
    $statsPanel.innerHTML = '';
    return;
  }

  // ── Weekly km chart (last 12 weeks) ──
  renderWeeklyChart(logs);

  // ── Pace evolution chart ──
  renderPaceChart(logs);

  // ── Stats summary ──
  renderStats(logs);
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function renderWeeklyChart(logs) {
  const weekMap = new Map();
  for (const log of logs) {
    if (!log.distance) continue;
    const wk = getWeekKey(log.date);
    weekMap.set(wk, (weekMap.get(wk) || 0) + log.distance);
  }

  const weeks = [...weekMap.entries()].slice(-12);
  if (weeks.length === 0) {
    $weeklyChart.innerHTML = '<div class="empty-state">Sin datos de distancia</div>';
    return;
  }

  const maxKm = Math.max(...weeks.map(w => w[1]));
  $weeklyChart.innerHTML = `
    <div class="run-bar-chart">
      ${weeks.map(([wk, km]) => {
        const pct = maxKm > 0 ? (km / maxKm) * 100 : 0;
        const label = wk.split('-W')[1];
        return `<div class="run-bar-col">
          <div class="run-bar-value">${km.toFixed(1)}</div>
          <div class="run-bar" style="height:${Math.max(pct, 4)}%"></div>
          <div class="run-bar-label">S${label}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderPaceChart(logs) {
  const paceLogs = logs.filter(l => l.pace && l.pace > 0 && l.distance >= 1);
  if (paceLogs.length < 2) {
    $paceChart.innerHTML = '<div class="empty-state">Necesitas al menos 2 sesiones con distancia ≥ 1km</div>';
    return;
  }

  const paces = paceLogs.map(l => l.pace);
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const range = maxPace - minPace || 1;

  const points = paceLogs.map((l, i) => {
    const x = (i / (paceLogs.length - 1)) * 100;
    const y = 100 - ((l.pace - minPace) / range) * 80 - 10;
    return { x, y, pace: l.pace, date: l.date };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  $paceChart.innerHTML = `
    <svg class="run-pace-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points="${polyline}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="2" fill="var(--accent)" vector-effect="non-scaling-stroke"/>`).join('')}
    </svg>
    <div class="run-pace-labels">
      <span>${formatPace(maxPace)}</span>
      <span>${formatPace(minPace)}</span>
    </div>
    <div class="run-pace-dates">
      <span>${formatDate(paceLogs[0].date)}</span>
      <span>${formatDate(paceLogs[paceLogs.length - 1].date)}</span>
    </div>`;
}

function renderStats(logs) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthLogs = logs.filter(l => l.date?.startsWith(thisMonth));

  const totalKm = logs.reduce((s, l) => s + (l.distance || 0), 0);
  const monthKm = monthLogs.reduce((s, l) => s + (l.distance || 0), 0);
  const withPace = logs.filter(l => l.pace > 0);
  const avgPace = withPace.length ? withPace.reduce((s, l) => s + l.pace, 0) / withPace.length : 0;
  const bestPace = withPace.length ? Math.min(...withPace.map(l => l.pace)) : 0;

  $statsPanel.innerHTML = `
    <div class="run-stats-grid">
      <div class="run-stat-card"><div class="run-stat-value">${totalKm.toFixed(1)}</div><div class="run-stat-label">Km totales</div></div>
      <div class="run-stat-card"><div class="run-stat-value">${monthKm.toFixed(1)}</div><div class="run-stat-label">Km este mes</div></div>
      <div class="run-stat-card"><div class="run-stat-value">${formatPace(avgPace)}</div><div class="run-stat-label">Ritmo medio</div></div>
      <div class="run-stat-card"><div class="run-stat-value">${formatPace(bestPace)}</div><div class="run-stat-label">Mejor ritmo</div></div>
      <div class="run-stat-card"><div class="run-stat-value">${logs.length}</div><div class="run-stat-label">Sesiones totales</div></div>
      <div class="run-stat-card"><div class="run-stat-value">${monthLogs.length}</div><div class="run-stat-label">Sesiones este mes</div></div>
    </div>`;
}

/** Called when switching to the running tab */
export function refreshRunning(db) {
  populateRunWeeks(db);
}
