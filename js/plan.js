// Plan en el tiempo: bloques con duración y semanas de descarga
// (odd/tasks/planificacion.md · fase 1, D3 y D4).
//
// schedule.js dice QUÉ toca esta semana; este módulo dice EN QUÉ PUNTO del
// bloque estás: semana 3 de 6 de la Fase I, descarga en 4, y qué viene
// después. Solo fuerza: el running ya viene por semanas.
//
// Módulo puro, como schedule.js y progression.js: nada de DOM ni de
// localStorage, y nada guardado. La posición se DERIVA del historial cada vez:
//
//   · El bloque actual es la racha final de entrenos del programa y la fase
//     activos. Un entreno de otra fase u otro programa la corta (cambiar de
//     fase empieza bloque), y también un parón de más de BREAK_DAYS: quien
//     vuelve de un mes de vacaciones no está en la semana 5, empieza de nuevo.
//   · Una semana se cierra al completar sus sesiones, no al pasar el
//     calendario. Si pierdes una semana, todo se corre y la fecha de fin se
//     vuelve a proyectar. Es la cola de schedule.js llevada al nivel del bloque.
//   · Tras las semanas de carga viene una de descarga (si la fase la lleva).
//     Al terminar el bloque, si sigues en la misma fase, empieza un ciclo
//     nuevo de la misma fase: nunca se bloquea nada, se avisa de que hay una
//     fase siguiente.
//
// Las sesiones sueltas (`w.sessionId`) no son del plan: ni cuentan ni cortan.

import { getProgramById, programPhaseKeys } from './programs.js';
import { getScheduleConfig, PLAN_STRENGTH } from './schedule-config.js';

/** Semanas de carga de una fase que no declara `weeks`. */
export const DEFAULT_WEEKS = 4;
/** Una fase de menos semanas que esto no lleva descarga detrás por defecto. */
export const DELOAD_MIN_WEEKS = 4;
/** Un parón de más días que esto reinicia el bloque. */
export const BREAK_DAYS = 21;
/** Fracción de las series que se hacen en descarga (60 % → 3 de 5, 2 de 3). */
export const DELOAD_SETS = 0.6;

const DAY = 86400000;

// ── Fechas (locales, como schedule.js) ──────────────────────────────────────

function normDate(ref) {
  if (ref instanceof Date) return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const [y, m, d] = String(ref).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoWeekday(d) {
  const g = d.getDay();
  return g === 0 ? 7 : g;
}
const daysBetween = (a, b) => Math.round((normDate(b) - normDate(a)) / DAY);

// ── Fases ───────────────────────────────────────────────────────────────────

/** Semanas de carga de una fase: `weeks` entero 1..26, si no DEFAULT_WEEKS. */
export function phaseWeeks(phase) {
  const w = phase?.weeks;
  return Number.isInteger(w) && w >= 1 && w <= 26 ? w : DEFAULT_WEEKS;
}

/** ¿La descarga está activada en Ajustes? Por defecto, sí. */
export function deloadEnabled(db) {
  return db?.settings?.plan?.deload !== false;
}

/**
 * ¿Esta fase lleva semana de descarga detrás? `deload` explícito en el JSON
 * manda; si no, solo las de DELOAD_MIN_WEEKS semanas o más (un programa de
 * fases de dos semanas, como el de kettlebell, no descarga cada dos).
 */
export function phaseHasDeload(db, phase) {
  if (!deloadEnabled(db)) return false;
  if (typeof phase?.deload === 'boolean') return phase.deload;
  return phaseWeeks(phase) >= DELOAD_MIN_WEEKS;
}

/** Fases del programa en orden: [{ id, name, weeks, deload }]. */
export function programBlocks(db, programId = db?.program || 'arete') {
  const prog = getProgramById(programId);
  return programPhaseKeys(prog)
    .map(k => ({ id: parseInt(k, 10), phase: prog[k] }))
    .filter(p => !Number.isNaN(p.id) && p.phase && typeof p.phase === 'object')
    .sort((a, b) => a.id - b.id)
    .map(({ id, phase }) => ({
      id,
      name: phase.name || `Fase ${id}`,
      weeks: phaseWeeks(phase),
      deload: phaseHasDeload(db, phase),
    }));
}

/**
 * Sesiones que forman una semana. Con días ancla de fuerza, tantos como anclas
 * (quien entrena lunes, miércoles y viernes hace semanas de tres); sin anclas,
 * las sesiones que declara la fase; y si no hay nada, tres.
 */
export function sessionsPerWeek(db) {
  const anchors = getScheduleConfig(db)[PLAN_STRENGTH].anchors.length;
  if (anchors) return anchors;
  const fase = getProgramById(db?.program || 'arete')?.[String(db?.phase)];
  const n = fase?.sessions ? Object.keys(fase.sessions).length : 0;
  return n || 3;
}

// ── El bloque actual ────────────────────────────────────────────────────────

/**
 * Entrenos del bloque actual, del más viejo al más nuevo: la racha final del
 * programa y la fase activos, cortada por otra fase u otro programa o por un
 * parón de más de BREAK_DAYS (también entre el último entreno y hoy).
 * Un entreno legacy sin `phase` no corta la racha (lo mismo que schedule.js).
 */
export function blockWorkouts(db, ref = new Date()) {
  const program = db?.program || 'arete';
  const ws = (db?.workouts || [])
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w && w.date && !w.sessionId)
    .sort((a, b) => String(a.w.date).localeCompare(String(b.w.date)) || a.i - b.i)
    .map(x => x.w);

  const out = [];
  let siguiente = toISO(normDate(ref));
  for (let i = ws.length - 1; i >= 0; i--) {
    const w = ws[i];
    if (w.date > siguiente) continue;            // entreno futuro: no es del bloque aún
    if (daysBetween(w.date, siguiente) > BREAK_DAYS) break;
    if ((w.program || 'arete') !== program) break;
    if (w.phase != null && w.phase !== db.phase) break;
    out.push(w);
    siguiente = w.date;
  }
  return out.reverse();
}

/**
 * Proyecta en qué fecha cae la n-ésima sesión por hacer (n ≥ 1), usando los
 * días ancla de fuerza; sin anclas, reparte `perWeek` sesiones por semana.
 * Si hoy ya hubo entreno, hoy no cuenta como hueco.
 */
function projectSession(db, n, ref, perWeek, entrenoHoy) {
  const d = normDate(ref);
  if (entrenoHoy) d.setDate(d.getDate() + 1);
  if (n <= 0) return toISO(normDate(ref));
  const { anchors } = getScheduleConfig(db)[PLAN_STRENGTH];
  if (!anchors.length) {
    d.setDate(d.getDate() + Math.ceil((n / perWeek) * 7) - 1);
    return toISO(d);
  }
  let k = 0;
  for (let guard = 0; guard < 3660; guard++) {
    if (anchors.includes(isoWeekday(d)) && ++k === n) return toISO(d);
    d.setDate(d.getDate() + 1);
  }
  return toISO(d);
}

/**
 * Dónde está el atleta dentro del bloque de fuerza.
 *
 * @returns {null | {
 *   program, phase, name, weeks, deload, perWeek,
 *   cycle,        // 1 la primera pasada por la fase, 2 si ya la completó una vez…
 *   done,         // sesiones hechas en el ciclo actual
 *   week,         // semana en curso, 1-based (weeks+1 = la de descarga)
 *   kind,         // 'carga' | 'descarga'
 *   weekDone,     // sesiones hechas en la semana en curso
 *   deloadIn,     // semanas que faltan para la descarga (0 si es esta); null si no hay
 *   startedAt,    // fecha del primer entreno del bloque, null si no ha empezado
 *   endsAt,       // fecha proyectada de la última sesión del ciclo
 *   next,         // { id, name } de la fase siguiente, o null
 * }}
 */
export function planStatus(db, ref = new Date()) {
  const blocks = programBlocks(db);
  const idx = blocks.findIndex(b => b.id === db?.phase);
  if (idx === -1) return null;
  const b = blocks[idx];
  const perWeek = sessionsPerWeek(db);
  const totalWeeks = b.weeks + (b.deload ? 1 : 0);
  const porCiclo = totalWeeks * perWeek;

  const ws = blockWorkouts(db, ref);
  const n = ws.length;
  const cycle = Math.floor(n / porCiclo) + 1;
  const done = n % porCiclo;
  const week = Math.floor(done / perWeek) + 1;
  const kind = b.deload && week > b.weeks ? 'descarga' : 'carga';
  const hoy = toISO(normDate(ref));
  const entrenoHoy = ws.some(w => w.date === hoy);

  return {
    program: db.program || 'arete',
    phase: b.id,
    name: b.name,
    weeks: b.weeks,
    deload: b.deload,
    perWeek,
    cycle,
    done,
    week,
    kind,
    weekDone: done % perWeek,
    deloadIn: b.deload ? Math.max(0, b.weeks + 1 - week) : null,
    startedAt: done ? ws[n - done].date : null,
    endsAt: projectSession(db, porCiclo - done, ref, perWeek, entrenoHoy),
    next: blocks[idx + 1] ? { id: blocks[idx + 1].id, name: blocks[idx + 1].name } : null,
  };
}

/**
 * Sesiones que quedan en la semana en curso del bloque, en orden: es la cola de
 * fuerza de schedule.js. Cada semana reparte `perWeek` sesiones rotando por las
 * de la fase (con A y B y tres días: A·B·A, luego B·A·B), y lo hecho esta
 * semana consume su sesión aunque se hiciera en otro orden. Al cerrar la
 * semana la cola trae la siguiente: un bloque de seis semanas no se da por
 * «completado» al terminar la primera.
 */
export function weekQueue(db, ref = new Date()) {
  const fase = getProgramById(db?.program || 'arete')?.[String(db?.phase)];
  const names = fase?.sessions ? Object.keys(fase.sessions) : [];
  if (!names.length) return [];
  const perWeek = sessionsPerWeek(db);
  const ws = blockWorkouts(db, ref);
  const weekDone = ws.length % perWeek;
  const base = Math.floor(ws.length / perWeek) * perWeek;
  const lista = Array.from({ length: perWeek }, (_, i) => names[(base + i) % names.length]);
  for (const w of ws.slice(ws.length - weekDone)) {
    const j = lista.indexOf(w.session);
    if (j !== -1) lista.splice(j, 1);
  }
  return lista.slice(0, perWeek - weekDone);
}

/**
 * Todo lo que queda del ciclo del bloque, semana a semana: lo pendiente de la
 * semana en curso y después las semanas siguientes (descarga incluida), con la
 * misma rotación. Es la cola de fuerza que schedule.js reparte en los anclas,
 * así que el calendario proyecta semanas, no solo la actual.
 */
export function blockQueue(db, ref = new Date()) {
  const semana = weekQueue(db, ref);
  const st = planStatus(db, ref);
  const fase = getProgramById(db?.program || 'arete')?.[String(db?.phase)];
  const names = fase?.sessions ? Object.keys(fase.sessions) : [];
  if (!st || !names.length) return semana;
  const n = blockWorkouts(db, ref).length;
  const desde = n - st.weekDone + st.perWeek;          // primera sesión de la semana siguiente
  const hasta = n - st.done + (st.weeks + (st.deload ? 1 : 0)) * st.perWeek;
  const resto = [];
  for (let i = desde; i < hasta; i++) resto.push(names[i % names.length]);
  return [...semana, ...resto];
}

/** ¿La semana en curso es de descarga? Atajo para quien prescribe cargas. */
export function isDeloadWeek(db, ref = new Date()) {
  return planStatus(db, ref)?.kind === 'descarga';
}

/** Cuántas series se hacen en descarga de un ejercicio de `sets` series. */
export function deloadSets(sets) {
  const n = Number(sets) || 0;
  return n <= 1 ? n : Math.max(1, Math.round(n * DELOAD_SETS));
}

/**
 * La línea de tiempo del programa desde el bloque actual: el resto del bloque
 * en curso y las fases siguientes, cada una con su descarga, con fechas
 * proyectadas a partir de los días ancla. Las fechas son una proyección, no un
 * compromiso: se recalculan con cada entreno.
 *
 * @returns {Array<{ kind:'carga'|'descarga', phase, name, weeks, start, end, current }>}
 */
export function planTimeline(db, ref = new Date()) {
  const st = planStatus(db, ref);
  if (!st) return [];
  const blocks = programBlocks(db);
  const idx = blocks.findIndex(b => b.id === st.phase);
  const hoy = toISO(normDate(ref));
  const perWeek = st.perWeek;
  const ws = blockWorkouts(db, ref);
  const entrenoHoy = ws.some(w => w.date === hoy);
  const out = [];
  // Posiciones en sesiones RELATIVAS a hoy: negativas = ya hechas en este ciclo.
  let hechas = -st.done;
  const tramo = (kind, b, weeks, current) => {
    const inicio = hechas;
    hechas += weeks * perWeek;
    const start = inicio < 0
      ? ws[ws.length + inicio].date
      : projectSession(db, inicio + 1, ref, perWeek, entrenoHoy);
    const end = projectSession(db, hechas, ref, perWeek, entrenoHoy);
    out.push({ kind, phase: b.id, name: b.name, weeks, start, end, current });
  };

  for (let i = idx; i < blocks.length; i++) {
    const b = blocks[i];
    const actual = i === idx;
    const enCarga = actual && st.kind === 'carga';
    // El tramo de carga del bloque actual solo se pinta si no se ha pasado ya.
    if (!actual || enCarga) tramo('carga', b, b.weeks, enCarga);
    else hechas += b.weeks * perWeek;
    if (b.deload) tramo('descarga', b, 1, actual && st.kind === 'descarga');
  }
  return out;
}

// ── Plan híbrido: fuerza y carrera en dos carriles ──────────────────────────
// (odd/tasks/planificacion.md · «Plan híbrido», paso 2). El plan híbrido es el
// par de programas activos (db.program + db.runningProgram): no hay un objeto
// nuevo hasta que haga falta nombrarlo (paso 4, creación). Lo que los une es el
// calendario de bloques: la descarga de fuerza es también la de carrera.

/** ¿Hay programa de carrera activo, y comparte la descarga? */
export function deloadShared(db) {
  return !!db?.runningProgram && deloadEnabled(db) && db?.settings?.plan?.shareDeload !== false;
}

/** ¿Las carreras de esta semana se hacen en descarga? */
export function isRunDeloadWeek(db, ref = new Date()) {
  return deloadShared(db) && isDeloadWeek(db, ref);
}

const CALMA = /calentamiento|calma|enfriamiento|warm|cool/i;
const DUR = /^(\d+)h(\d+)?$|^(\d+)\s*min$/i;

/** '1h' → 60, '45min' → 45, '1h30' → 90; null si no se entiende. */
function minutos(str) {
  const m = String(str || '').trim().match(DUR);
  if (!m) return null;
  return m[3] != null ? +m[3] : +m[1] * 60 + (+m[2] || 0);
}

/**
 * Una sesión de carrera en descarga: el 60 % del volumen con la misma
 * intensidad (menos series, rodajes más cortos), que es la descarga habitual
 * en resistencia. Calentamiento y vuelta a la calma no se tocan. Devuelve una
 * copia; el programa no se modifica.
 */
export function deloadRunSegments(segs) {
  return (segs || []).map(seg => {
    const s = { ...seg };
    if (s.mode === 'run-intervals' && s.reps > 1) {
      s.reps = Math.max(1, Math.round(s.reps * DELOAD_SETS));
    } else if (s.mode === 'run-steady' && !CALMA.test(s.name || '')) {
      const min = minutos(s.duration);
      if (min) s.duration = `${Math.max(5, Math.round((min * DELOAD_SETS) / 5) * 5)}min`;
      const km = String(s.distance || '').match(/^([\d.]+)\s*km$/i);
      if (km) s.distance = `${Math.max(1, Math.round(+km[1] * DELOAD_SETS))}km`;
    }
    return s;
  });
}

/**
 * Semana a semana, los dos carriles desde la semana en curso: qué toca en
 * fuerza y qué en carrera, con las descargas compartidas a lo ancho. Es una
 * proyección a una semana de plan por semana de calendario (las semanas reales
 * se cierran por sesiones, así que si se pierde una, todo se corre).
 *
 * Con la descarga compartida, la de carrera se INTERCALA: la semana del
 * programa de carrera que tocaba se hace después, no se pierde.
 *
 * @param {Object} db
 * @param {{ref?: Date|string, runningPhases?: Object}} opts runningPhases: las
 *   semanas del programa de carrera ({ '1': {name, sessions}, … }).
 * @returns {Array<{ start, fuerza: {label, kind, phase}|null, carrera: {label, kind, week}|null, shared }>}
 */
export function hybridWeeks(db, { ref = new Date(), runningPhases = null } = {}) {
  const st = planStatus(db, ref);
  const fuerza = [];
  if (st) {
    const blocks = programBlocks(db);
    for (let i = blocks.findIndex(b => b.id === st.phase); i >= 0 && i < blocks.length; i++) {
      const b = blocks[i];
      const actual = b.id === st.phase;
      const desde = actual ? (st.kind === 'carga' ? st.week : b.weeks + 1) : 1;
      for (let w = desde; w <= b.weeks; w++) fuerza.push({ label: `${b.name} · ${w}/${b.weeks}`, kind: 'carga', phase: b.id });
      if (b.deload) fuerza.push({ label: 'Descarga', kind: 'descarga', phase: b.id });
    }
  }

  const carrera = [];
  if (runningPhases && db?.runningProgram) {
    const keys = Object.keys(runningPhases).map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    const total = keys.length ? keys[keys.length - 1] : 0;
    const compartida = deloadShared(db);
    let semana = db.runningWeek || 1;
    for (let i = 0; semana <= total; i++) {
      if (compartida && fuerza[i]?.kind === 'descarga') {
        carrera.push({ label: 'Descarga', kind: 'descarga', week: semana });
        continue;
      }
      const w = runningPhases[String(semana)];
      carrera.push({ label: w?.name || `Semana ${semana}`, kind: 'carga', week: semana });
      semana++;
    }
  }

  const lunes = normDate(ref);
  lunes.setDate(lunes.getDate() - (isoWeekday(lunes) - 1));
  const n = Math.min(Math.max(fuerza.length, carrera.length), 52);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i * 7);
    const f = fuerza[i] || null;
    const c = carrera[i] || null;
    return { start: toISO(d), fuerza: f, carrera: c, shared: f?.kind === 'descarga' && c?.kind === 'descarga' };
  });
}
