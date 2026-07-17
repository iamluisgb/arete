// Herramientas de retrieval para Quirón (capa 2 del contexto): el snapshot cubre
// el estado reciente; con esto el modelo excava en el histórico completo bajo
// demanda vía chatToolsLoop. Definiciones en formato OpenAI + ejecutor sobre la db.
// `progFns` se inyecta (por defecto, programs.js del app) para poder testear con fixtures.

import { workoutTonnage, epley } from './metrics.js';

export const QUIRON_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_exercise_history',
      description: 'Histórico completo de un ejercicio de fuerza: todas las sesiones con sus series (kg×reps) y e1RM de cada día. Usa el nombre tal como aparece en el snapshot (acepta coincidencia parcial, sin distinguir mayúsculas).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre (o parte) del ejercicio, p. ej. "sentadilla"' },
          limit: { type: 'number', description: 'Máximo de sesiones, las más recientes (por defecto 30)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_workouts',
      description: 'Sesiones de fuerza completas en un rango de fechas, con ejercicios, series y tonelaje.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
          to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
          limit: { type: 'number', description: 'Máximo de sesiones, las más recientes (por defecto 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_runs',
      description: 'Carreras registradas en un rango de fechas, con distancia, duración, ritmo, FC, desnivel y parciales por km si existen.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (opcional)' },
          to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
          type: { type: 'string', description: 'Filtrar por tipo: libre, rodaje, intervalos, tempo, fartlek, cuestas, competicion (opcional)' },
          limit: { type: 'number', description: 'Máximo de carreras, las más recientes (por defecto 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_body_logs',
      description: 'Registros corporales (peso y medidas) ordenados por fecha.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Máximo de registros, los más recientes (por defecto 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_program_detail',
      description: 'Detalle del programa de fuerza activo: fases, sesiones y ejercicios objetivo (sets×reps). Útil para saber qué toca hoy o comparar plan vs realidad.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

const fmtDur = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
};
const fmtPace = (p) => p ? `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')}/km` : '—';

function inRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/**
 * Ejecutor de herramientas sobre la db. Devuelve SIEMPRE strings compactos
 * (es lo que se manda de vuelta al modelo como mensaje `tool`).
 * @param {Object} db
 * @param {Object} progFns  { getPrograms } — inyectable para tests
 */
export function makeToolExecutor(db, progFns = {}) {
  return async function execute(name, args = {}) {
    if (name === 'get_exercise_history') {
      const q = String(args.name || '').toLowerCase().trim();
      if (!q) return 'ERROR: falta el nombre del ejercicio.';
      const rows = [];
      for (const w of (db.workouts || [])) {
        for (const ex of (w.exercises || [])) {
          if (!ex.name.toLowerCase().includes(q)) continue;
          const sets = (ex.sets || []).filter(s => s.kg || s.reps)
            .map(s => (s.kg ? `${s.kg}×${s.reps || '?'}` : String(s.reps || ''))).join(' ');
          let best = null;
          for (const s of (ex.sets || [])) {
            const rm = epley(s.kg, s.reps);
            if (rm != null && (!best || rm > best)) best = rm;
          }
          rows.push({ date: w.date, line: `${w.date} [${ex.name}] ${sets}${best ? ` — e1RM ${best.toFixed(1)} kg` : ''}` });
        }
      }
      if (!rows.length) return `Sin registros para "${args.name}".`;
      rows.sort((a, b) => b.date.localeCompare(a.date));
      return rows.slice(0, args.limit || 30).map(r => r.line).join('\n');
    }

    if (name === 'get_workouts') {
      const rows = [...(db.workouts || [])]
        .filter(w => inRange(w.date, args.from, args.to))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, args.limit || 20)
        .map(w => {
          const exs = (w.exercises || []).map(ex => {
            const sets = (ex.sets || []).filter(s => s.kg || s.reps)
              .map(s => (s.kg ? `${s.kg}×${s.reps || '?'}` : String(s.reps || ''))).join(' ');
            return `${ex.name}: ${sets}`;
          }).join(' · ');
          return `${w.date} [${w.session || 'sesión'}] tonelaje ${workoutTonnage(w)} kg${w.notes ? ` (${w.notes})` : ''}\n  ${exs}`;
        });
      return rows.length ? rows.join('\n') : 'Sin sesiones de fuerza en ese rango.';
    }

    if (name === 'get_runs') {
      const rows = [...(db.runningLogs || [])]
        .filter(r => inRange(r.date, args.from, args.to))
        .filter(r => !args.type || r.type === args.type)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, args.limit || 20)
        .map(r => {
          const bits = [`${r.distance || 0} km`, fmtDur(r.duration || 0), fmtPace(r.pace)];
          if (r.hr) bits.push(`${r.hr} ppm`);
          if (r.elevation) bits.push(`${r.elevation} m+`);
          if (r.cadence) bits.push(`${r.cadence} ppm cadencia`);
          const splits = (r.splits || []).length
            ? `\n  parciales: ${r.splits.map(s => `km${s.km} ${fmtPace(s.pace)}`).join(' ')}` : '';
          return `${r.date} [${r.type || 'libre'}] ${bits.join(' · ')}${r.notes ? ` (${r.notes})` : ''}${splits}`;
        });
      return rows.length ? rows.join('\n') : 'Sin carreras en ese rango.';
    }

    if (name === 'get_body_logs') {
      const rows = [...(db.bodyLogs || [])]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, args.limit || 20)
        .map(l => {
          const { id, date, ...measures } = l;
          const ms = Object.entries(measures).map(([k, v]) => `${k} ${v}`).join(' · ');
          return `${date}: ${ms || '—'}`;
        });
      return rows.length ? rows.join('\n') : 'Sin registros corporales.';
    }

    if (name === 'get_program_detail') {
      const phases = progFns.getPrograms ? progFns.getPrograms() : null;
      if (!phases || !Object.keys(phases).length) return 'No hay programa de fuerza cargado.';
      const L = [];
      for (const [k, phase] of Object.entries(phases)) {
        L.push(`FASE ${k} — ${phase.name || ''}${phase.desc ? ` (${phase.desc})` : ''}`);
        for (const [sName, exercises] of Object.entries(phase.sessions || {})) {
          const exs = (exercises || []).map(ex => `${ex.name} ${ex.sets || '?'}×${ex.reps || '?'}`).join(' · ');
          L.push(`  ${sName}: ${exs}`);
        }
      }
      return L.join('\n');
    }

    return `ERROR: herramienta desconocida "${name}".`;
  };
}
