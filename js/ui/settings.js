import { formatDate, esc } from '../utils.js';
import { getActiveProgram } from '../programs.js';

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
