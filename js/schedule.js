// Programación semanal (odd/tasks/programacion-semanal.md · D1 y D6).
//
// Modelo (D1): cada plan tiene una COLA de sesiones pendientes y una lista de
// DÍAS ANCLA por semana. La n-ésima sesión pendiente cae en el n-ésimo día
// ancla a partir de la fecha de referencia. No hay días fijos por sesión: si
// un día se cae, la sesión reaparece en el siguiente ancla, y marcar sesiones
// como hechas desplaza todo hacia atrás. Fuerza y carrera se programan por
// separado (D3), cada uno con sus propios anclas.
//
// Módulo puro (D6): nada de DOM ni localStorage. La UI solo consume; los
// programas activos se resuelven vía programs.js, que ya está en memoria cuando
// la app arranca (loadPrograms) y que los tests pueden sembrar con
// reindexCustomPrograms sin tocar la red.
//
// Detección de "hecho" (D7): se mapea sobre los datos que ya existen, sin
// estructura nueva.
//  - Fuerza: la cola es la semana en curso del bloque (js/plan.js, weekQueue).
//    Cuenta los entrenos de la racha del programa y la fase activos; cada
//    semana reparte tantas sesiones como días ancla, rotando por las de la
//    fase. Antes contaba todo lo hecho en la fase desde siempre y, tras una
//    sola pasada por A·B·C, la cola quedaba vacía para siempre.
//  - Running: db.runningLogs con `program` === db.runningProgram y `session`
//    === nombre planificado. Los logs GPS importados suelen llegar sin nombre
//    de sesión (`session: ''`): esos NO consumen cola y la sesión sigue
//    pendiente. Es una limitación documentada, no se adivina.
//
// Fechas: todas las operaciones usan fechas locales (mediodía implícito vía
// componentes Y/M/D) y devuelven 'YYYY-MM-DD' local. Con refs de mediodía —
// como usan el snapshot y los tests— coincide con la fecha UTC de toISOString.

import { getRunningProgram } from './programs.js';
import { PLAN_STRENGTH, PLAN_RUNNING, SCHEDULE_DEFAULTS, getScheduleConfig } from './schedule-config.js';
import { weekQueue, blockQueue } from './plan.js';

export { PLAN_STRENGTH, PLAN_RUNNING, SCHEDULE_DEFAULTS, getScheduleConfig };

/** Horizonte máximo de cálculo por llamada (días). Nadie programa más lejos. */
const HORIZON_DIAS = 35;

/** Cuántos días hacia atrás mira scheduleOverdue para encontrar anclas vencidos. */
const OVERDUE_LOOKBACK = 14;

// ── Fechas ──────────────────────────────────────────────────────────────────

/** Normaliza una ref (Date o 'YYYY-MM-DD') a medianoche local. */
function normDate(ref) {
  if (ref instanceof Date) return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const [y, m, d] = String(ref).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date local → 'YYYY-MM-DD' local. */
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Día de semana ISO: 1=lun … 7=dom (getDay() dice 0=dom). */
function isoWeekday(d) {
  const g = d.getDay();
  return g === 0 ? 7 : g;
}

// ── Cola de sesiones pendientes (D1, D7) ────────────────────────────────────

/** Nombres de sesión de la semana activa de running, en orden declarado. */
function sesionesRunning(db) {
  const prog = getRunningProgram(db.runningProgram || '');
  const semana = prog?.[String(db.runningWeek)];
  return semana?.sessions ? Object.keys(semana.sessions) : [];
}

/**
 * Cola de sesiones pendientes del plan.
 *  - Fuerza: lo que queda del ciclo del bloque, empezando por lo pendiente de
 *    la semana en curso (blockQueue en js/plan.js).
 *  - Running: las sesiones de la semana activa en orden declarado; cada carrera
 *    hecha EN ESA SEMANA (log.week) consume la primera aparición pendiente de su
 *    nombre. Así, tras hacer A y B, la cola empieza en C. Sin el filtro de
 *    semana, un «Rodaje Z2» de la semana 1 tachaba el de la semana 2. Las
 *    carreras antiguas sin semana cuentan en cualquiera, como siempre.
 */
export function buildQueue(db, plan = PLAN_STRENGTH, ref = new Date()) {
  // Fuerza va por semanas del bloque (js/plan.js): la cola es lo que queda del
  // ciclo, empezando por lo pendiente de la semana en curso.
  if (plan === PLAN_STRENGTH) return blockQueue(db, ref);
  const names = sesionesRunning(db);
  if (!names.length) return [];

  const enPlan = new Set(names);
  const source = db.runningLogs || [];
  const done = {};
  for (const item of source) {
    const name = item?.session || '';
    if (!name || !enPlan.has(name)) continue;
    if ((item.program || '') !== (db.runningProgram || '')) continue;
    if (item.week && item.week !== (db.runningWeek || 1)) continue;
    // Una carrera hecha en la descarga compartida no cierra su semana del
    // programa: la descarga se intercala y esa semana se hace después.
    if (item.deload) continue;
    done[name] = (done[name] || 0) + 1;
  }

  const queue = [];
  for (const name of names) {
    if (done[name] > 0) { done[name]--; continue; }
    queue.push(name);
  }
  return queue;
}

/**
 * Pendientes por plan (para el contador del dashboard y Quirón). En fuerza, las
 * de la semana en curso: el resto del bloque no es deuda, es el plan. Un plan
 * con la programación apagada (sin anclas) no tiene pendientes que contar: si
 * no, la cola de fuerza, que ya no se agota, dejaría «Hoy» en descanso eterno.
 */
export function pendingCount(db, ref = new Date()) {
  const { [PLAN_STRENGTH]: fza, [PLAN_RUNNING]: run } = getScheduleConfig(db);
  return {
    [PLAN_STRENGTH]: fza.anchors.length ? weekQueue(db, ref).length : 0,
    [PLAN_RUNNING]: run.anchors.length ? buildQueue(db, PLAN_RUNNING, ref).length : 0,
  };
}

/**
 * ¿Qué planes están usando los anclas de fábrica (F3)? Un plan cae a defaults
 * cuando no hay config guardada para él; un `anchors: []` explícito NO cuenta
 * como default: es el plan apagado a propósito y no merece hint.
 */
export function usesDefaultAnchors(db) {
  const raw = db?.settings?.schedule || {};
  const sinConfig = (plan) => !Array.isArray(raw[plan]?.anchors);
  return { [PLAN_STRENGTH]: sinConfig(PLAN_STRENGTH), [PLAN_RUNNING]: sinConfig(PLAN_RUNNING) };
}

// ── Cálculo de fechas (D1) ──────────────────────────────────────────────────

/**
 * Programa las sesiones pendientes de UN plan: la k-ésima sesión pendiente
 * cae en el k-ésimo día ancla >= ref. Devuelve [{ date, session, plan }] en
 * orden. Anclas vacíos → [] (feature apagada para ese plan).
 *
 * Los anclas llegan normalizados (ordenados, sin duplicados, 1..7), así que
 * listas desordenadas, repetidas o con días fuera de rango no rompen nada.
 */
export function schedulePlan(db, plan = PLAN_STRENGTH, ref = new Date(), { horizonDays = HORIZON_DIAS } = {}) {
  const { anchors } = getScheduleConfig(db)[plan];
  const queue = buildQueue(db, plan, ref);
  if (!anchors.length || !queue.length) return [];

  const out = [];
  const d = normDate(ref);
  const limite = normDate(ref);
  limite.setDate(limite.getDate() + horizonDays);
  let qi = 0;
  while (d <= limite && qi < queue.length) {
    if (anchors.includes(isoWeekday(d))) out.push({ date: toISO(d), session: queue[qi++], plan });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Ambos planes, ordenados por fecha. */
export function scheduleAll(db, ref = new Date(), opts = {}) {
  return [
    ...schedulePlan(db, PLAN_STRENGTH, ref, opts),
    ...schedulePlan(db, PLAN_RUNNING, ref, opts),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/** Sesiones programadas para un día concreto ('YYYY-MM-DD'). */
export function scheduleDay(db, dateStr, ref = new Date()) {
  return scheduleAll(db, ref).filter(e => e.date === dateStr);
}

/**
 * Anclas pasados perdidos con ventana configurable (D1 — saltar un día no la
 * pierde, pero tampoco la esconde). Mira hacia atrás `lookbackDays` desde ref.
 *  - Fuerza: los días ancla que pasaron SIN entrenar desde el último entreno
 *    del bloque, con la sesión que les tocaba. La cola de fuerza repite nombres
 *    semana a semana, así que «¿sigue ese nombre pendiente?» ya no dice nada:
 *    lo que dice si un ancla se perdió es que después no hubo entreno.
 *  - Running: programados en un ancla ya pasado y que siguen en la cola.
 */
export function scheduleMissed(db, ref = new Date(), lookbackDays = OVERDUE_LOOKBACK) {
  const hoy = toISO(normDate(ref));
  const desde = normDate(ref);
  desde.setDate(desde.getDate() - lookbackDays);

  const pendRun = new Set(buildQueue(db, PLAN_RUNNING, ref));
  const running = schedulePlan(db, PLAN_RUNNING, desde, { horizonDays: lookbackDays })
    .filter(e => e.date < hoy && pendRun.has(e.session));

  // El último entreno de fuerza del programa, aunque un parón haya reiniciado
  // el bloque: lo que hay antes de él no se perdió.
  const program = db?.program || 'arete';
  const ultimo = (db?.workouts || [])
    .filter(w => w?.date && !w.sessionId && (w.program || 'arete') === program && w.date < hoy)
    .map(w => w.date).sort().pop() || null;
  let inicio = desde;
  if (ultimo && ultimo >= toISO(desde)) {
    inicio = normDate(ultimo);
    inicio.setDate(inicio.getDate() + 1);
  }
  const { anchors } = getScheduleConfig(db)[PLAN_STRENGTH];
  const cola = buildQueue(db, PLAN_STRENGTH, inicio);
  const fuerza = [];
  if (anchors.length && cola.length) {
    for (const d = new Date(inicio); toISO(d) < hoy; d.setDate(d.getDate() + 1)) {
      if (anchors.includes(isoWeekday(d))) {
        fuerza.push({ date: toISO(d), session: cola[fuerza.length % cola.length], plan: PLAN_STRENGTH });
      }
    }
  }

  return [...fuerza, ...running].sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Sesiones ATRASADAS para el dashboard: misma cuenta, con la ventana corta de
 * siempre (14 días). El calendario usa scheduleMissed directamente porque
 * navega por meses y necesita mirar más atrás.
 */
export function scheduleOverdue(db, ref = new Date()) {
  return scheduleMissed(db, ref);
}

/**
 * Avance de semana de running (odd/tasks/planificacion.md · plan híbrido, paso 1).
 * Una semana se cierra al hacer sus sesiones, como las de fuerza: cuando la cola
 * de la semana activa se vacía con al menos una carrera registrada EN ella, pasa
 * a la siguiente. Muta db.runningWeek y devuelve { from, to }, o null si no
 * toca (quedan sesiones, no hay semana siguiente o la cola se vació solo con
 * carreras antiguas sin semana). Quien llama guarda y avisa con deshacer.
 */
export function advanceRunWeek(db) {
  const prog = getRunningProgram(db?.runningProgram || '');
  if (!prog) return null;
  const actual = db.runningWeek || 1;
  if (!prog[String(actual + 1)]) return null;
  if (buildQueue(db, PLAN_RUNNING).length) return null;
  const enEsta = (db.runningLogs || []).some(l =>
    l?.session && !l.deload && l.week === actual && (l.program || '') === (db.runningProgram || ''));
  if (!enEsta) return null;
  db.runningWeek = actual + 1;
  return { from: actual, to: actual + 1 };
}
