// Snapshot de contexto para Quirón: el estado del atleta compactado a texto.
// Siempre presente en la conversación (capa 1); el histórico profundo se pide
// bajo demanda con herramientas (capa 2, ver tools.js).
// Pura respecto al DOM; la info de programa activo llega inyectada en `prog`
// (la resuelve el llamante desde programs.js) para poder testear con fixtures.

import { formatPace, formatRunDuration, getPaceZones, getHRZones } from '../ui/running-helpers.js';
import { computeProfile, ROMAN, LEVEL_NAMES, CALIBRATION_NOTE } from '../domains.js';
import {
  e1rmByExercise, weeklySeries, loadRatio, recentPRs, bodyTrend,
  lastStrengthSessions, lastRuns, periodStats, runIntensitySplit,
} from './metrics.js';

/** "+12%" · "-4%" · "s/ref" cuando no hay periodo anterior con el que comparar. */
const deltaPct = (v) => (v == null ? 's/ref' : `${v >= 0 ? '+' : ''}${v}%`);

/** "III Intermedio" · "— sin medir" */
const levelLabel = (n) => (n > 0 ? `${ROMAN[n]} ${LEVEL_NAMES[n]}` : '— sin medir');

/**
 * Resumen del perfil de dominios para el snapshot: nivel global, quién lo limita y el
 * nivel de cada dominio. Devuelve null si no hay nada medido todavía (un usuario nuevo
 * no necesita cuatro líneas diciéndole siete veces que no sabemos nada de él).
 */
export function domainSummary(db, ref = new Date()) {
  const p = computeProfile(db, ref);
  if (!p.measured) return null;
  const lines = ['PERFIL DE DOMINIOS (el nivel de un dominio es su métrica MÁS BAJA; el global, el dominio más bajo de los MEDIDOS — lo no medido no cuenta como 0):'];
  lines.push(`  Nivel global: ${levelLabel(p.level)}${p.provisional ? ` — PROVISIONAL, solo ${p.measured}/${p.total} dominios medidos` : ''}`);
  if (p.limitedBy) {
    const w = p.limitedBy.weakest;
    lines.push(`  Te limita: ${p.limitedBy.name} (${levelLabel(p.limitedBy.level)})${w ? ` — por ${w.label}` : ''}`);
  }
  lines.push('  ' + p.domains.map(d => `${d.short} ${d.level > 0 ? ROMAN[d.level] : '—'}${d.stale ? '(caducado)' : ''}`).join(' · '));
  // La calibración es del producto, no del agente, y omitirla haría que Quirón leyera
  // como absolutos unos umbrales que no lo son. La app ya lo declara en pantalla.
  lines.push(`  ${CALIBRATION_NOTE}`);
  return lines;
}

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

  // Perfil de los 7 dominios — el núcleo del producto (ver AGENTS.md y js/domains.js).
  //
  // Estaba ausente del contexto: Quirón no tenía ni snapshot ni herramienta que lo
  // mencionara, así que ante "¿qué me está frenando?" —la pregunta que Areté promete
  // responder— improvisaba desde el histórico de series. Aquí va el resumen; el detalle
  // por métrica se pide con `get_domain_profile` (capa 2).
  //
  // Las dos reglas del producto se enuncian aquí para que el modelo no las "corrija":
  // el nivel es el MÍNIMO (no la media) y lo no medido NO cuenta como cero.
  const dp = domainSummary(db, ref);
  if (dp) L.push(...dp);

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

  // Totales del periodo, YA SUMADOS.
  //
  // La serie semanal de arriba invita a que el modelo sume para responder "¿cómo van mis
  // últimas 4 semanas?", y sumar es justo lo que no sabe hacer: en un eval listó las
  // cuatro cifras semanales correctas y dio un total de 40958 kg donde la suma es 37776
  // (un 8% inventado, en la línea de titular del RESUMEN). El resto del snapshot ya
  // aplica esta regla —el e1RM y el ratio llegan calculados— y esto la extiende a los
  // agregados: si una cifra se puede citar, no hay que derivarla.
  const p7 = periodStats(db, 7, ref);
  const p28 = periodStats(db, 28, ref);
  // Mismo formato que SEMANAS (fuerza N×/kg · running N×/km) para que se lea como su total.
  L.push('TOTALES (calculados por la app — cítalos, NUNCA los sumes tú):');
  L.push(`  7 días:  fuerza ${p7.current.strengthSessions}×/${p7.current.tonnage} kg · running ${p7.current.runSessions}×/${p7.current.km} km`);
  L.push(`  28 días: fuerza ${p28.current.strengthSessions}×/${p28.current.tonnage} kg (${deltaPct(p28.tonnageDeltaPct)} vs los 28d anteriores) · running ${p28.current.runSessions}×/${p28.current.km} km (${deltaPct(p28.kmDeltaPct)})`);

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

// ── Presupuesto de contexto por turno ───────────────────────────────────────
// Traído de bookreader (ADR-007/ADR-010 de su DECISIONS.md). Allí el problema era
// el libro entero en cada turno; aquí es el mismo patrón con otra ropa: cada turno
// de Quirón añade a la conversación un bloque `data` con el volcado de las
// herramientas (histórico de un ejercicio, carreras, sesiones…), y la conversación
// entera se reenviaba en el turno siguiente. A los diez turnos se está pagando —y
// diluyendo la atención del modelo con— diez volcados, nueve de ellos de preguntas
// que ya nadie está haciendo.
//
// Dos reglas, las mismas que allí:
//   1. Los `data` viejos NO se reenvían. Son volcados que el modelo puede volver a
//      pedir con las tools si los necesita; el snapshot, que sí es estado actual, se
//      reconstruye entero en cada turno.
//   2. Ventana de historial: solo los últimos N mensajes. La conversación completa
//      se sigue guardando y viendo en el panel; lo que se recorta es lo que viaja.

export const HISTORY_MSGS = 8;      // mensajes verbatim que se reenvían
export const TOKEN_GUARD = 60000;   // por encima de esto, preguntar antes de enviar

/** Estimación barata de tokens (~4 chars/token), igual que en bookreader. */
export function estimateTokens(s) {
  return Math.round((s || '').length / 4);
}

/**
 * Recorta la conversación a lo que se manda al modelo este turno.
 * @param {Array} convo mensajes {role:'user'|'assistant'|'data', content}
 * @param {number} maxMsgs tamaño de la ventana
 */
export function windowConversation(convo, { maxMsgs = HISTORY_MSGS } = {}) {
  let lastUser = -1;
  for (let i = convo.length - 1; i >= 0; i--) {
    if (convo[i].role === 'user') { lastUser = i; break; }
  }
  // `data` solo del turno en curso (los posteriores a la última pregunta).
  const fresh = convo.filter((m, i) => m.role !== 'data' || i > lastUser);
  return fresh.slice(-maxMsgs);
}

/**
 * Traduce a mensajes de la API. Los `data` viajan como `user` con prefijo, porque
 * nan solo admite `system` en el índice 0.
 */
export function toApiMessages(msgs) {
  return msgs.map(m => m.role === 'data'
    ? { role: 'user', content: '[DATOS DEL HISTÓRICO — generados por la app, no por el atleta]\n' + m.content }
    : { role: m.role, content: m.content });
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
  L.push(`Fuerza: ${ps.current.strengthSessions} sesiones · ${ps.current.tonnage} kg tonelaje (${deltaPct(ps.tonnageDeltaPct)} vs periodo anterior)`);
  L.push(`Running: ${ps.current.runSessions} sesiones · ${ps.current.km} km (${deltaPct(ps.kmDeltaPct)}) · ${ps.current.runMin} min`);

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
