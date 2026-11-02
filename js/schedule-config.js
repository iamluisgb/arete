// Configuración de la programación semanal: identificadores de plan, anclas
// por defecto y lectura de db.settings.schedule. Vive aparte de schedule.js
// para que plan.js (el bloque en el tiempo) y schedule.js (la semana) puedan
// leerla los dos sin importarse en círculo. schedule.js la reexporta.

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

