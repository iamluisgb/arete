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
//  - Fuerza: db.workouts con `program` === db.program; `session` guarda el
//    nombre de la sesión del plan (normalizeWorkout lo recorta a 60 chars, así
//    que la coincidencia es por nombre tal cual). Si el workout trae `phase`,
//    además debe coincidir con la fase activa; los legacy sin fase consumen
//    cola igualmente (conservador: preferimos sub-programar que repetir).
//  - Running: db.runningLogs con `program` === db.runningProgram y `session`
//    === nombre planificado. Los logs GPS importados suelen llegar sin nombre
//    de sesión (`session: ''`): esos NO consumen cola y la sesión sigue
//    pendiente. Es una limitación documentada, no se adivina.
//
// Fechas: todas las operaciones usan fechas locales (mediodía implícito vía
// componentes Y/M/D) y devuelven 'YYYY-MM-DD' local. Con refs de mediodía —
// como usan el snapshot y los tests— coincide con la fecha UTC de toISOString.

import { getProgramById, getRunningProgram } from './programs.js';

/** Identificadores de plan. Las claves de config y de los resultados los usan. */
export const PLAN_STRENGTH = 'arete';
export const PLAN_RUNNING = 'running';

/**
 * Defaults de anclas (D3): fuerza lun/mié/vie, carrera mar/jue/dom.
 * El usuario los cambia en Ajustes; un plan con `anchors: []` explícito queda
 * apagado (no se programa nada para ese plan).
 */
export const SCHEDULE_DEFAULTS = {
  [PLAN_STRENGTH]: { anchors: [1, 3, 5] },
  [PLAN_RUNNING]: { anchors: [2, 4, 7] },
};

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

// ── Configuración (D3) ──────────────────────────────────────────────────────

/**
 * Lee y normaliza db.settings.schedule. Anclas: enteros 1..7, sin duplicados,
 * ordenados. Un array vacío guardado explícitamente se respeta (plan apagado);
 * lo ausente o inválido cae a los defaults. Nunca muta db.
 */
export function getScheduleConfig(db) {
  const raw = db?.settings?.schedule || {};
  const norm = (plan) => {
    const list = Array.isArray(raw[plan]?.anchors) ? raw[plan].anchors : SCHEDULE_DEFAULTS[plan].anchors;
    const anchors = [...new Set(list.filter(n => Number.isInteger(n) && n >= 1 && n <= 7))].sort((a, b) => a - b);
    return { anchors };
  };
  return { [PLAN_STRENGTH]: norm(PLAN_STRENGTH), [PLAN_RUNNING]: norm(PLAN_RUNNING) };
}

// ── Cola de sesiones pendientes (D1, D7) ────────────────────────────────────

/** Nombres de sesión de la fase activa de fuerza, en orden declarado. */
function sesionesFuerza(db) {
  const prog = getProgramById(db.program || 'arete');
  const fase = prog?.[String(db.phase)];
  return fase?.sessions ? Object.keys(fase.sessions) : [];
}

/** Nombres de sesión de la semana activa de running, en orden declarado. */
function sesionesRunning(db) {
  const prog = getRunningProgram(db.runningProgram || '');
  const semana = prog?.[String(db.runningWeek)];
  return semana?.sessions ? Object.keys(semana.sessions) : [];
}

/**
 * Cola de sesiones pendientes del plan, en orden declarado, retomando después
 * de la última completada: cada completion existente consume la primera
 * aparición pendiente de ese nombre. Así, tras hacer A y B, la cola empieza
 * en C; si se cicla el plan (A, B, A, B), la cola sigue siendo [C] — el resto
 * de repeticiones completadas no re-encola nada.
 */
export function buildQueue(db, plan = PLAN_STRENGTH) {
  const names = plan === PLAN_RUNNING ? sesionesRunning(db) : sesionesFuerza(db);
  if (!names.length) return [];

  const enPlan = new Set(names);
  const source = plan === PLAN_RUNNING ? (db.runningLogs || []) : (db.workouts || []);
  const done = {};
  for (const item of source) {
    const name = item?.session || '';
    if (!name || !enPlan.has(name)) continue;
    if (plan === PLAN_RUNNING) {
      if ((item.program || '') !== (db.runningProgram || '')) continue;
    } else {
      if ((item.program || 'arete') !== (db.program || 'arete')) continue;
      if (item.phase != null && item.phase !== db.phase) continue;
    }
    done[name] = (done[name] || 0) + 1;
  }

  const queue = [];
  for (const name of names) {
    if (done[name] > 0) { done[name]--; continue; }
    queue.push(name);
  }
  return queue;
}

/** Pendientes acumuladas por plan (para el contador del dashboard y Quirón). */
export function pendingCount(db) {
  return {
    [PLAN_STRENGTH]: buildQueue(db, PLAN_STRENGTH).length,
    [PLAN_RUNNING]: buildQueue(db, PLAN_RUNNING).length,
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
  const queue = buildQueue(db, plan);
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
 * Anclas pasados perdidos con ventana configurable: programados en un día ancla
 * ya pasado y que siguen en la cola de pendientes (D1 — saltar un día no las
 * pierde, pero tampoco las esconde). Mira hacia atrás `lookbackDays` desde ref.
 */
export function scheduleMissed(db, ref = new Date(), lookbackDays = OVERDUE_LOOKBACK) {
  const hoy = toISO(normDate(ref));
  const pendientes = {
    [PLAN_STRENGTH]: new Set(buildQueue(db, PLAN_STRENGTH)),
    [PLAN_RUNNING]: new Set(buildQueue(db, PLAN_RUNNING)),
  };
  const desde = normDate(ref);
  desde.setDate(desde.getDate() - lookbackDays);
  return scheduleAll(db, desde, { horizonDays: lookbackDays })
    .filter(e => e.date < hoy && pendientes[e.plan].has(e.session));
}

/**
 * Sesiones ATRASADAS para el dashboard: misma cuenta, con la ventana corta de
 * siempre (14 días). El calendario usa scheduleMissed directamente porque
 * navega por meses y necesita mirar más atrás.
 */
export function scheduleOverdue(db, ref = new Date()) {
  return scheduleMissed(db, ref);
}
