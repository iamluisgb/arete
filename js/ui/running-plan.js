import { esc } from '../utils.js';
import { saveDB } from '../data.js';
import { toast } from './toast.js';
import { buildQueue, advanceRunWeek, PLAN_RUNNING } from '../schedule.js';
import { isRunDeloadWeek, deloadRunSegments } from '../plan.js';
import { getRunningProgramList, getRunningPhases } from '../programs.js';
import { ZONE_COLORS, ZONE_LABELS, parseSegDistance, parseSegDuration, estimateZone, getPaceZones } from './running-helpers.js';

// ── Plan tab (programs) ──────────────────────────────
// N5: el <select> de semana del Plan tab se eliminó; el chip de contexto
// (runCtxChip) + la hoja de plan es el único camino de selección. Este módulo solo
// pinta las sesiones de la semana activa (db.runningWeek).

let _onStartSession = null;
export function setOnStartSession(fn) { _onStartSession = fn; }

/** Repuebla el Plan tab con las sesiones de la semana activa. */
export function populateRunWeeks(db, $segments) {
  const programs = getRunningProgramList();
  if (programs.length === 0) {
    $segments.innerHTML = '<div class="empty-state">No hay programas de running disponibles</div>';
    return;
  }

  const progId = db.runningProgram || programs[0].id;
  db.runningProgram = progId;
  renderAllWeekSessions(db, String(db.runningWeek || 1), $segments);
}

function parsePaceToSec(pace) {
  if (!pace) return 0;
  const m = String(pace).match(/(\d+):(\d+)/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
}

function inferZone(seg, db) {
  if (seg.zone) return seg.zone;
  if (seg.mode === 'run-intervals' && seg.pace) return estimateZone(parsePaceToSec(seg.pace), getPaceZones(db));
  return 'Z2';
}

export function buildSegmentBar(segs, db) {
  const blocks = [];
  const GAP = { dur: 0, gap: true };

  for (let i = 0; i < segs.length; i++) {
    if (i > 0) blocks.push(GAP); // gap between main segments

    const seg = segs[i];
    const zone = inferZone(seg, db);
    const color = ZONE_COLORS[zone] || ZONE_COLORS.Z2;

    if (seg.mode === 'run-intervals' && seg.reps > 0) {
      const distKm = parseSegDistance(seg.distance) || 0;
      const paceSec = parsePaceToSec(seg.pace) || 300;
      const workSec = distKm > 0 ? distKm * paceSec : (parseSegDuration(seg.duration) || 60);
      const recSec = parseSegDuration(seg.recovery)
        || (parseSegDistance(seg.recovery) * 360)
        || workSec * 0.5;

      for (let r = 0; r < seg.reps; r++) {
        blocks.push({ dur: workSec, color });
        if (r < seg.reps - 1) blocks.push({ dur: recSec, color: ZONE_COLORS.Z1 });
      }
    } else {
      blocks.push({ dur: parseSegDuration(seg.duration) || 60, color });
    }
  }

  const total = blocks.filter(b => !b.gap).reduce((s, b) => s + b.dur, 0);
  return `<div class="run-seg-bar">${blocks.map(b => {
    if (b.gap) return '<div class="run-seg-bar-gap"></div>';
    const pct = (b.dur / total * 100).toFixed(1);
    return `<div class="run-seg-bar-block" style="width:${pct}%;background:${b.color}"></div>`;
  }).join('')}</div>`;
}

function renderSegmentCards(segs, db) {
  return segs.map(seg => {
    const zone = inferZone(seg, db);
    const color = ZONE_COLORS[zone] || ZONE_COLORS.Z2;

    let info = '';
    if (seg.mode === 'run-intervals') {
      info = `${seg.reps} x ${seg.distance || seg.duration || ''}`;
      if (seg.pace) info += ` a ${seg.pace}`;
      if (seg.recovery) info += ` · Rec: ${seg.recovery}`;
    } else {
      info = seg.duration || '';
      if (seg.desc) info += ` · ${seg.desc}`;
    }

    return `
      <div class="run-segment-card">
        <div class="run-seg-header">
          <span class="run-seg-name">${esc(seg.name)}</span>
          <span class="run-seg-zone" style="background:${color}">${zone}</span>
        </div>
        <div class="run-seg-info">${esc(info)}</div>
      </div>`;
  }).join('');
}

export function renderAllWeekSessions(db, weekKey, $segments) {
  const progId = db.runningProgram;
  const phases = getRunningPhases(progId);
  const week = phases[String(weekKey)];
  if (!week?.sessions) { $segments.innerHTML = '<div class="empty-state">No hay sesiones en esta semana</div>'; return; }

  // Descarga compartida con fuerza: la semana activa se hace al 60 % de volumen.
  const descarga = String(weekKey) === String(db.runningWeek || 1) && isRunDeloadWeek(db);
  const segsDe = name => (descarga ? deloadRunSegments(week.sessions[name]) : week.sessions[name]);
  const sessionNames = Object.keys(week.sessions);
  const aviso = descarga
    ? '<p class="str-plan-desc">Semana de descarga, compartida con fuerza: menos series y rodajes más cortos, a la misma intensidad. Esta semana del plan se hace completa después.</p>'
    : '';
  $segments.innerHTML = aviso + sessionNames.map(name => {
    const segs = segsDe(name);
    if (!segs || segs.length === 0) return '';
    return `<div class="run-plan-session-card">
      <div class="run-plan-session-header">${esc(name)}${descarga ? ' · descarga' : ''}</div>
      ${buildSegmentBar(segs, db)}
      ${renderSegmentCards(segs, db)}
      <button class="btn run-seg-start-btn" data-session="${esc(name)}" style="width:100%;margin-top:8px">Iniciar esta sesión</button>
    </div>`;
  }).join('');

  $segments.querySelectorAll('.run-seg-start-btn[data-session]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.session;
      const segs = segsDe(name);
      const runType = inferRunType(segs);
      _onStartSession?.(segs, runType, name, db);
    });
  });
}

export function inferRunType(segments) {
  const hasIntervals = segments.some(s => s.mode === 'run-intervals');
  const hasZ3Z4 = segments.some(s => s.zone === 'Z3' || s.zone === 'Z4');
  if (hasIntervals) return 'intervalos';
  if (hasZ3Z4 && !hasIntervals) return 'tempo';
  return 'rodaje';
}

export function populateSumSessionSelect(db) {
  const $sel = document.getElementById('runSumSession');
  $sel.innerHTML = '<option value="">Ninguna</option>';
  const programs = getRunningProgramList();
  if (programs.length === 0) return;

  const progId = db.runningProgram || programs[0].id;
  const phases = getRunningPhases(progId);
  for (const [wk, phase] of Object.entries(phases)) {
    if (phase.sessions) {
      for (const name of Object.keys(phase.sessions)) {
        $sel.innerHTML += `<option value="${esc(name)}">S${wk}: ${esc(name)}</option>`;
      }
    }
  }
}

/**
 * Selector «Sesión del plan» del registro manual: las sesiones de la semana
 * activa. Sin él, una carrera manual o importada nunca tachaba su sesión y, en
 * la web (sin GPS), la semana de running no se podía cerrar. Al registrar una
 * nueva se propone la siguiente pendiente; al editar, la que tenía.
 */
export function populateManualSessionSelect(db, current = null, week = null) {
  const $sel = document.getElementById('runManualSession');
  if (!$sel) return;
  // Al editar, las sesiones de la semana de ESA carrera: la sesión solo tacha
  // la de su semana (schedule.js filtra por log.week).
  const semana = getRunningPhases(db.runningProgram || '')?.[week || db.runningWeek || 1];
  const nombres = semana?.sessions ? Object.keys(semana.sessions) : [];
  if (current && !nombres.includes(current)) nombres.push(current);
  $sel.innerHTML = '<option value="">Ninguna</option>' +
    nombres.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  $sel.value = current ?? (buildQueue(db, PLAN_RUNNING)[0] || '');
}

/**
 * Tras guardar una carrera: si con ella se cerró la semana, se pasa a la
 * siguiente y se avisa con deshacer (avisar, nunca bloquear).
 */
export function announceRunWeekAdvance(db, onChange) {
  const adv = advanceRunWeek(db);
  if (!adv) return null;
  saveDB(db);
  onChange?.();
  toast(`Semana ${adv.from} completada — pasas a la semana ${adv.to}`, 'success', {
    action: 'Deshacer',
    onAction: () => { db.runningWeek = adv.from; saveDB(db); onChange?.(); },
  });
  return adv;
}

export function updateRunContextBar(db) {
  const programs = getRunningProgramList();
  const prog = programs.find(p => p.id === db.runningProgram);
  document.getElementById('runProgramName').textContent = prog?.name || 'Sin programa';
  const phases = getRunningPhases(db.runningProgram);
  const week = phases[db.runningWeek];
  document.getElementById('runWeekName').textContent = week?.name || `Semana ${db.runningWeek || 1}`;
}

export function renderRunProgramModal(db) {
  const programs = getRunningProgramList();
  const active = db.runningProgram || '';
  document.getElementById('runProgramOptions').innerHTML = programs.map(p =>
    `<div class="prog-modal-item${p.id === active ? ' active' : ''}" data-prog="${esc(p.id)}">
      <div style="flex:1"><div class="prog-modal-name">${esc(p.name)}</div><div class="prog-modal-desc">${esc(p.desc)}</div></div>
    </div>`
  ).join('') || '<div class="empty-state">No hay programas de running</div>';
}

export function renderRunWeekModal(db) {
  const phases = getRunningPhases(db.runningProgram);
  const weekKeys = Object.keys(phases).sort((a, b) => parseInt(a) - parseInt(b));
  const current = db.runningWeek || 1;
  document.getElementById('runWeekOptions').innerHTML = weekKeys.map(k => {
    const w = phases[k];
    return `<div class="phase-option${parseInt(k) === current ? ' selected' : ''}" data-week="${k}">
      <div class="po-num">${k}</div>
      <div class="po-text"><div class="po-title">${w.name || 'Semana ' + k}</div><div class="po-desc">${w.desc || Object.keys(w.sessions || {}).join(', ')}</div></div>
    </div>`;
  }).join('');
}

/** Return the next unfinished plan session for the current week, or null */
export function getNextPlanSession(db) {
  const programs = getRunningProgramList();
  if (!programs.length || !db.runningProgram) return null;

  const phases = getRunningPhases(db.runningProgram);
  const week = phases[db.runningWeek];
  if (!week?.sessions) return null;

  // Get this week's logs (Monday–Sunday)
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().slice(0, 10);

  const weekLogs = (db.runningLogs || []).filter(l => l.date >= mondayStr);
  const doneSessions = new Set(weekLogs.map(l => l.session).filter(Boolean));

  const sessionNames = Object.keys(week.sessions);
  const nextName = sessionNames.find(name => !doneSessions.has(name));
  if (!nextName) return null;

  return {
    name: nextName,
    segments: isRunDeloadWeek(db) ? deloadRunSegments(week.sessions[nextName]) : week.sessions[nextName],
    weekName: week.name || `Semana ${db.runningWeek}`,
    weekKey: db.runningWeek,
    done: doneSessions.size,
    total: sessionNames.length
  };
}
