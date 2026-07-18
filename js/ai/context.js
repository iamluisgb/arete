// Snapshot de contexto para Quirón: el estado del atleta compactado a texto.
// Siempre presente en la conversación (capa 1); el histórico profundo se pide
// bajo demanda con herramientas (capa 2, ver tools.js).
// Pura respecto al DOM; la info de programa activo llega inyectada en `prog`
// (la resuelve el llamante desde programs.js) para poder testear con fixtures.

import { formatPace, formatRunDuration, getPaceZones, getHRZones } from '../ui/running-helpers.js';
import {
  e1rmByExercise, weeklySeries, loadRatio, recentPRs, bodyTrend,
  lastStrengthSessions, lastRuns, periodStats, runIntensitySplit,
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

/**
 * Datos del INFORME (Fase 5b): agregados de un periodo para que Quirón produzca el
 * formato RESUMEN. Añade lo que el snapshot no trae con marco temporal: tonelaje del
 * periodo vs anterior, adherencia vs plan, reparto de intensidad de carrera (80/20)
 * y lectura de la señal de descarga. Los números salen de metrics.js (JS, exactos).
 * @param {Object} prog  contexto de programas; usa `prog.plannedPerWeek` (nº de sesiones
 *                       de la fase activa) para la adherencia si viene.
 * @param {'week'|'month'} period
 */
export function buildReport(db, prog = {}, { period = 'week', ref = new Date() } = {}) {
  const days = period === 'month' ? 28 : 7;
  const weeks = period === 'month' ? 4 : 1;
  const label = period === 'month' ? 'ÚLTIMAS 4 SEMANAS' : 'ÚLTIMA SEMANA';
  const L = [`INFORME · ${label} (hasta ${ref.toISOString().slice(0, 10)})`];

  const ps = periodStats(db, days, ref);
  const dPct = (v) => v == null ? 's/ref' : `${v >= 0 ? '+' : ''}${v}%`;
  L.push(`Fuerza: ${ps.current.strengthSessions} sesiones · ${ps.current.tonnage} kg tonelaje (${dPct(ps.tonnageDeltaPct)} vs periodo anterior)`);
  L.push(`Running: ${ps.current.runSessions} sesiones · ${ps.current.km} km (${dPct(ps.kmDeltaPct)}) · ${ps.current.runMin} min`);

  // Adherencia vs plan (proxy): sesiones de fuerza hechas vs planificadas por la fase activa
  if (prog.plannedPerWeek > 0) {
    const planned = prog.plannedPerWeek * weeks;
    const pct = Math.round((ps.current.strengthSessions / planned) * 100);
    L.push(`Adherencia fuerza: ${ps.current.strengthSessions}/${planned} sesiones planificadas (${pct}%)`);
  }

  // Reparto de intensidad de carrera (80/20)
  const split = runIntensitySplit(db.runningLogs, days, ref);
  if (split.easyN + split.qualityN > 0) {
    L.push(`Intensidad carrera: ${split.easyPct}% fácil (${split.easyKm} km) / ${100 - split.easyPct}% calidad (${split.qualityKm} km) — objetivo ≈80/20`);
  }

  // Señal de descarga
  const lr = loadRatio(db, ref);
  if (lr.ratio != null) {
    L.push(`Carga aguda 7d vs media 28d: ratio ${lr.ratio} (${lr.ratio > 1.3 ? 'PICO — considerar descarga' : lr.ratio < 0.8 ? 'semana suave' : 'rango normal'})`);
  }

  // PRs y peso
  const prs = recentPRs(db.workouts, days, ref);
  L.push(prs.length ? `PRs del periodo: ${prs.map(p => `${p.name} ${p.rm} kg`).join(' · ')}` : 'PRs del periodo: ninguno');
  const bt = bodyTrend(db.bodyLogs, ref);
  if (bt) L.push(`Peso: ${bt.weight} kg${bt.delta30 != null ? ` (${bt.delta30 > 0 ? '+' : ''}${bt.delta30} kg vs ~30d)` : ''}`);

  // e1RM tendencia de los principales (mejor histórico | mejor últimos 30d)
  const rms = e1rmByExercise(db.workouts, ref);
  const top = Object.entries(rms).filter(([, r]) => r.best).sort((a, b) => b[1].best.rm - a[1].best.rm).slice(0, 6);
  if (top.length) {
    L.push('e1RM (histórico | reciente 30d):');
    for (const [name, r] of top) {
      L.push(`  ${name}: ${r.best.rm.toFixed(1)} | ${r.recent ? r.recent.rm.toFixed(1) : '—'}`);
    }
  }

  return L.join('\n');
}
