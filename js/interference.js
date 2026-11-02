// Interferencia entre fuerza y carrera en la semana tipo
// (odd/tasks/planificacion.md · plan híbrido, paso 3).
//
// Cada carril reparte sus sesiones en sus días ancla (schedule.js). Lo que
// ninguno de los dos sabía es qué cae al lado de qué: una sentadilla pesada el
// día antes de las series hace que las series lleguen con las piernas vacías, y
// una tirada larga el día antes de la pierna pesada, al revés. Aquí se detecta;
// la app AVISA y explica, nunca mueve nada sola ni impide entrenar.
//
// Módulo puro: sin DOM. Clasifica las sesiones por su contenido (ejercicios y
// segmentos del programa), no por el nombre que les puso quien lo escribió.

import { getProgramById, getRunningPhases } from './programs.js';
import { scheduleAll, PLAN_STRENGTH, PLAN_RUNNING } from './schedule.js';

// Ejercicios que vacían la pierna. Mismo criterio que el salto de 5 kg en
// progression.js (HEAVY_PATTERN), más la prensa y la sentadilla búlgara.
const PIERNA = /sentadilla|squat|peso\s*muerto|deadlift|zancada|lunge|prensa|hip\s*thrust|b[uú]lgara|good\s*morning|step[-\s]?up/i;
// Calentamiento y vuelta a la calma no dicen nada de la sesión.
const CALMA = /calentamiento|calma|enfriamiento|warm|cool/i;

/** Minutos de un '1h', '1h30', '45min'. */
function minutos(str) {
  const m = String(str || '').trim().match(/^(\d+)h(\d+)?$|^(\d+)\s*min$/i);
  if (!m) return 0;
  return m[3] != null ? +m[3] : +m[1] * 60 + (+m[2] || 0);
}
function km(str) {
  const m = String(str || '').trim().match(/^([\d.]+)\s*(km|m)$/i);
  if (!m) return 0;
  return m[2].toLowerCase() === 'km' ? +m[1] : +m[1] / 1000;
}

/**
 * ¿Es una sesión de pierna pesada? Al menos un ejercicio de series de tren
 * inferior a 8 repeticiones o menos (fuerza), o dos de cualquier rango (volumen).
 * @returns {{ heavyLegs: boolean, ejercicios: string[] }}
 */
export function classifyStrength(exercises) {
  const pierna = (exercises || []).filter(ex => {
    const modo = ex?.mode || (ex?.type === 'hiit' || ex?.type === 'density' ? 'result' : 'sets');
    return modo === 'sets' && PIERNA.test(ex?.name || '');
  });
  const pesados = pierna.filter(ex => {
    const r = parseInt(String(ex.reps ?? ''), 10);
    return !Number.isNaN(r) && r <= 8;
  });
  return { heavyLegs: pesados.length >= 1 || pierna.length >= 2, ejercicios: pierna.map(ex => ex.name) };
}

/**
 * ¿Es una sesión de calidad (series, ritmo en Z3+) o una tirada larga
 * (75 min o 15 km en un solo bloque continuo)? Un rodaje suave no interfiere.
 * @returns {{ quality: boolean, long: boolean }}
 */
export function classifyRun(segments) {
  const segs = (segments || []).filter(s => !CALMA.test(s?.name || ''));
  const quality = segs.some(s => s.mode === 'run-intervals' || ['Z3', 'Z4', 'Z5'].includes(s.zone) || !!s.pace);
  const long = segs.some(s => s.mode === 'run-steady' && (minutos(s.duration) >= 75 || km(s.distance) >= 15));
  return { quality, long };
}

const DIA = 86400000;
const sumaDias = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setTime(d.getTime() + n * DIA);
  return d.toISOString().slice(0, 10);
};

/**
 * La semana tipo con lo que toca cada día y su clase, desde `ref` y durante
 * `days` días: [{ date, plan, session, heavyLegs?, quality?, long? }].
 */
export function typicalWeek(db, ref = new Date(), days = 7) {
  const fase = getProgramById(db?.program || 'arete')?.[String(db?.phase)]?.sessions || {};
  const semana = getRunningPhases(db?.runningProgram || '')?.[db?.runningWeek || 1]?.sessions || {};
  return scheduleAll(db, ref, { horizonDays: days - 1 }).map(e => (
    e.plan === PLAN_STRENGTH
      ? { ...e, ...classifyStrength(fase[e.session]) }
      : { ...e, ...classifyRun(semana[e.session]) }
  ));
}

/**
 * Choques de la semana tipo. Tres reglas, las que aplicaría un preparador:
 *  - 'antes':   pierna pesada el día antes de series o de la tirada larga.
 *  - 'mismo':   pierna pesada el mismo día que series o la tirada larga.
 *  - 'despues': tirada larga el día antes de la pierna pesada.
 * @returns {Array<{ kind, date, strength, run, runDate, text }>}
 */
export function weekConflicts(db, ref = new Date(), days = 7) {
  const semana = typicalWeek(db, ref, days);
  const pierna = semana.filter(e => e.plan === PLAN_STRENGTH && e.heavyLegs);
  const carreras = semana.filter(e => e.plan === PLAN_RUNNING && (e.quality || e.long));
  const out = [];
  for (const f of pierna) {
    for (const c of carreras) {
      const que = c.long ? 'la tirada larga' : 'las series';
      if (c.date === f.date) {
        out.push({ kind: 'mismo', date: f.date, strength: f.session, run: c.session, runDate: c.date,
          text: `«${f.session}» (pierna pesada) y «${c.session}» el mismo día: si no puedes separarlas 6 horas o más, haz primero la que más te importe esta semana.` });
      } else if (c.date === sumaDias(f.date, 1)) {
        out.push({ kind: 'antes', date: f.date, strength: f.session, run: c.session, runDate: c.date,
          text: `«${f.session}» (pierna pesada) el día antes de «${c.session}»: llegarás a ${que} con las piernas cargadas. Mejor dejar un día entre las dos.` });
      } else if (c.long && c.date === sumaDias(f.date, -1)) {
        out.push({ kind: 'despues', date: f.date, strength: f.session, run: c.session, runDate: c.date,
          text: `«${c.session}» (tirada larga) el día antes de «${f.session}» (pierna pesada): la sentadilla llega sin piernas. Mejor dejar un día entre las dos.` });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
