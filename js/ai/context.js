// Snapshot de contexto para Quirón: el estado del atleta compactado a texto.
// Siempre presente en la conversación (capa 1); el histórico profundo se pide
// bajo demanda con herramientas (capa 2, ver tools.js).
// Pura respecto al DOM; la info de programa activo llega inyectada en `prog`
// (la resuelve el llamante desde programs.js) para poder testear con fixtures.

import { formatPace, formatRunDuration, getPaceZones, getHRZones } from '../ui/running-helpers.js';
import {
  e1rmByExercise, weeklySeries, loadRatio, recentPRs, bodyTrend,
  lastStrengthSessions, lastRuns,
} from './metrics.js';

/**
 * @param {Object} db  la db de la app
 * @param {Object} prog  contexto de programas: { name, phaseName, sessionNames, runProgramName, runWeek }
 * @param {Date} ref  fecha de referencia (tests)
 * @returns {string} snapshot en texto plano
 */
export function buildSnapshot(db, prog = {}, ref = new Date()) {
  const L = [];
  const today = ref.toISOString().slice(0, 10);
  const s = db.settings || {};

  L.push(`FECHA: ${today}`);

  // Perfil
  const profile = [];
  if (s.height) profile.push(`altura ${s.height} cm`);
  if (s.age) profile.push(`edad ${s.age}`);
  const bt = bodyTrend(db.bodyLogs, ref);
  if (bt) profile.push(`peso ${bt.weight} kg (${bt.date}${bt.delta30 != null ? `, ${bt.delta30 > 0 ? '+' : ''}${bt.delta30} kg vs ~30d antes` : ''})`);
  if (s.race5k) profile.push(`marca 5K ${formatRunDuration(s.race5k)}`);
  if (s.maxHR) profile.push(`FC máx ${s.maxHR}`);
  if (profile.length) L.push(`PERFIL: ${profile.join(' · ')}`);

  // Programa activo
  const p = [];
  if (prog.name) p.push(`fuerza: ${prog.name}${prog.phaseName ? ` — fase "${prog.phaseName}"` : ''}${prog.sessionNames?.length ? ` (sesiones: ${prog.sessionNames.join(', ')})` : ''}`);
  if (prog.runProgramName) p.push(`running: ${prog.runProgramName}${prog.runWeek ? ` — semana ${prog.runWeek}` : ''}`);
  if (p.length) L.push(`PROGRAMA ACTIVO: ${p.join(' | ')}`);

  // Zonas
  const paceZones = getPaceZones(db).map(z => `${z.zone}<${z.max === Infinity ? '∞' : formatPace(z.max)}`).join(' ');
  const hrZones = getHRZones(db).map(z => `${z.zone}:${z.min}-${z.max}`).join(' ');
  L.push(`ZONAS: pace [${paceZones}] · FC [${hrZones}]`);

  // Semanas recientes
  const weeks = weeklySeries(db, 8, ref);
  L.push('SEMANAS (lunes · fuerza ses/tonelaje · running ses/km):');
  for (const w of weeks) {
    L.push(`  ${w.weekStart}: fuerza ${w.strengthSessions}×/${w.tonnage} kg · running ${w.runSessions}×/${w.km} km`);
  }

  // Carga aguda vs crónica
  const lr = loadRatio(db, ref);
  if (lr.ratio != null) {
    L.push(`CARGA 7d vs media 28d: ratio ${lr.ratio} (${lr.ratio > 1.3 ? 'pico de carga — precaución' : lr.ratio < 0.8 ? 'semana suave' : 'rango normal'})`);
  }

  // e1RM por ejercicio (mejor histórico + mejor de los últimos 30 días)
  const rms = e1rmByExercise(db.workouts, ref);
  const rmEntries = Object.entries(rms).filter(([, r]) => r.best).sort((a, b) => b[1].best.rm - a[1].best.rm).slice(0, 12);
  if (rmEntries.length) {
    L.push('e1RM (Epley — mejor histórico | mejor últimos 30d):');
    for (const [name, r] of rmEntries) {
      const rec = r.recent ? `${r.recent.rm.toFixed(1)} kg (${r.recent.kg}×${r.recent.reps})` : '—';
      L.push(`  ${name}: ${r.best.rm.toFixed(1)} kg (${r.best.kg}×${r.best.reps}, ${r.best.date}) | ${rec}`);
    }
  }

  // PRs del último mes
  const prs = recentPRs(db.workouts, 30, ref);
  if (prs.length) L.push(`PRs ÚLTIMOS 30 DÍAS: ${prs.map(p2 => `${p2.name} ${p2.rm} kg (${p2.kg}×${p2.reps}, ${p2.date})`).join(' · ')}`);

  // Últimas sesiones
  const str = lastStrengthSessions(db.workouts, 8);
  if (str.length) { L.push('ÚLTIMAS SESIONES DE FUERZA:'); for (const x of str) L.push('  ' + x); }
  const runs = lastRuns(db.runningLogs, 8);
  if (runs.length) { L.push('ÚLTIMAS CARRERAS:'); for (const x of runs) L.push('  ' + x); }

  if (!str.length && !runs.length) L.push('SIN ENTRENAMIENTOS REGISTRADOS TODAVÍA.');

  return L.join('\n');
}
