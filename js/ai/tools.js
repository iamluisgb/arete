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

// Herramientas de ESCRITURA (Fase 5.0). No mutan la db: registran una PROPUESTA que
// la app muestra al atleta para confirmar (patrón proponer→preview→confirmar→deshacer).
// Se activan solo en el chat normal (no en el informe).
// La tool es una SEÑAL LIGERA de intención (no el plan entero): los modelos rellenan
// mal objetos JSON grandes como argumentos de tool, pero sí describen el objetivo en
// una frase. Cuando el modelo la llama, la app genera el JSON real con una llamada
// dedicada (JSON-en-contenido, fiable) y muestra la tarjeta de confirmación.
export const QUIRON_WRITE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'propose_program',
      description: 'Úsala cuando el atleta pida CREAR o EDITAR un plan de entrenamiento. No emites el plan aquí: describes en `goal` qué plan hay que generar (deporte, días/semana, duración, ejercicios/objetivo, progresión) y la app lo construye y se lo muestra para confirmar. Consulta antes su e1RM/marca con las tools de lectura para poder decir las cargas objetivo en `goal`.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Descripción completa del plan a generar, en una o dos frases, incluyendo cargas/ritmos de referencia del atleta si aplican.' },
          basedOn: { type: 'string', description: 'Opcional: id del plan que se edita (bifurca si es de fábrica, versiona si es custom). Omitir para un plan nuevo.' },
        },
        required: ['goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_workout',
      description: 'Úsala cuando el atleta describa un entrenamiento YA HECHO para registrarlo (p. ej. "hoy sentadilla 5x5 a 100, banca 3x5 a 70"). Pasa en `description` el texto del entreno tal cual, con la fecha si la menciona. La app lo estructura y le muestra una tarjeta para revisar y confirmar antes de guardar.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'El entrenamiento a registrar, en el texto del atleta (ejercicios, series, kg, reps, fecha si la dice).' },
        },
        required: ['description'],
      },
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
 * @param {Object} deps  { getPrograms, validateProgram, onProposal } — inyectable para tests.
 *   Las tools de lectura solo usan getPrograms; las de escritura, validateProgram + onProposal.
 */
export function makeToolExecutor(db, deps = {}) {
  const progFns = deps;   // alias: las tools de lectura ya usaban `progFns.getPrograms`
  return async function execute(name, args = {}) {
    // ── Escritura: señales de intención (la app genera el dato real y lo confirma) ──
    if (name === 'propose_program') {
      const goal = String(args.goal || '').trim();
      if (!goal) return 'ERROR: falta `goal` describiendo el plan a generar.';
      if (deps.onProposal) deps.onProposal({ type: 'program_request', goal, basedOn: args.basedOn || null });
      return 'Solicitud de plan registrada. La app generará el plan y se lo mostrará al atleta para confirmar. En tu respuesta, dile en una frase que le has preparado un plan para revisar (sin listar el detalle).';
    }
    if (name === 'log_workout') {
      const description = String(args.description || '').trim();
      if (!description) return 'ERROR: falta `description` con el entrenamiento a registrar.';
      if (deps.onProposal) deps.onProposal({ type: 'workout_request', description });
      return 'Entreno recibido. La app lo estructurará y le mostrará al atleta una tarjeta para revisar y confirmar. En tu respuesta, dile en una frase que lo tiene listo para revisar (sin repetir todas las series).';
    }

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
