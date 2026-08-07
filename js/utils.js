/** Parse a number safely, returning null if out of range or NaN */
export function safeNum(val, min = 0, max = Infinity) {
  const n = parseFloat(val);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Escape HTML entities to prevent XSS */
export function esc(str) {
  if (!str && str !== 0) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

/** Two-tap confirm for dangerous actions (delete, clear, etc.) */
export function confirmDanger(btn, action, timeout = 3000) {
  if (btn.dataset.confirm === 'true') { action(); return; }
  const orig = btn.textContent;
  const origW = btn.style.width;
  btn.dataset.confirm = 'true';
  btn.textContent = '¿Seguro?';
  setTimeout(() => { btn.dataset.confirm = 'false'; btn.textContent = orig; btn.style.width = origW; }, timeout);
}

/** Format 'YYYY-MM-DD' as 'DD/MM/YYYY' */
export function formatDate(d) {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

/**
 * 'YYYY-MM-DD' como 'DD/MM' — la fecha corta, sin año, para etiquetas donde el
 * año se da por sabido: el eje de un gráfico, un badge de récord, "última vez".
 *
 * Existe porque había ocho sitios haciendo `date.slice(5).replace('-','/')`, que
 * corta el año y deja **MM/DD**. Convivía con formatDate(), que da DD/MM, en la
 * misma pantalla: la tarjeta del historial decía 05/08/2026 y Actividad decía
 * 08/05 del mismo entreno. Con día ≤12 era ambiguo; con día >12, falso.
 */
export function formatDateShort(d) {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : d;
}

/**
 * El texto del chip de fase: "Fase II · Hipertrofia", o "Fase I" a secas cuando
 * el nombre de la fase repite al modo que tiene al lado en la cabecera.
 *
 * Con el segmentado Fuerza/Carrera a ocho píxeles del chip, "Fase I · Fuerza"
 * decía Fuerza dos veces. Se calla solo en ese caso: las fases II a IV se llaman
 * Hipertrofia, Definición Máxima y Ajustes, y ahí el nombre es lo único que
 * informa — borrarlo por sistema cambiaría una redundancia por una pérdida.
 *
 * Vive aquí, y no en nav.js, porque lo necesitan nav.js y training.js y
 * training.js no importa nav.js: acoplarlos sería un ciclo. Es pura a propósito.
 *
 * @param {string|number} roman  el numeral ya formateado
 * @param {string} name          nombre de la fase, puede ser ''
 * @param {string} modoActivo    'fuerza' | 'carrera'
 */
export function phaseChipLabel(roman, name, modoActivo) {
  const n = (name || '').trim();
  const repite = n.toLowerCase() === (modoActivo || '').toLowerCase();
  return n && !repite ? `Fase ${roman} · ${n}` : `Fase ${roman}`;
}

/** @returns {string} Today's date as 'YYYY-MM-DD' */
export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Trap focus inside a modal element. Returns a cleanup function.
 *
 * El listener va en `document`, no en `el`: montado sobre el propio overlay
 * solo encierra el foco si el foco ya estaba dentro, y si arranca fuera —que es
 * lo que pasaba con el .set-runner— el Tab se lo lleva a la pantalla de detrás
 * sin que el handler llegue a ejecutarse.
 */
export function trapFocus(el) {
  const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const nodesIn = () => [...el.querySelectorAll(focusable)]
    .filter(n => !n.disabled && n.getClientRects().length > 0);
  function handler(e) {
    if (e.key !== 'Tab') return;
    const nodes = nodesIn();
    if (nodes.length === 0) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (!el.contains(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }
  document.addEventListener('keydown', handler, true);
  // El foco entra en el diálogo al abrirlo, o el primer Tab se va fuera. Entra
  // en el contenedor, no en el primer campo: enfocar un input abre el teclado
  // virtual en el móvil, y el .set-runner empieza por el peso.
  const prev = document.activeElement;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  requestAnimationFrame(() => {
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
  });
  return () => {
    document.removeEventListener('keydown', handler, true);
    // Devolver el foco a donde estaba: si no, queda en el <body> y el siguiente
    // Tab reinicia el recorrido desde el principio de la página.
    if (prev?.isConnected && el.contains(document.activeElement)) prev.focus();
  };
}

const safeArr = v => Array.isArray(v) ? v : [];

function mergeById(local, remote, deleted, key = 'id') {
  const map = new Map();
  for (const item of local) { if (item?.[key] != null) map.set(item[key], item); }
  for (const item of remote) { if (item?.[key] != null) map.set(item[key], item); }
  for (const id of deleted) map.delete(id);
  return [...map.values()];
}

/** @param {Object} local - Local DB object
 *  @param {Object} remote - Remote DB object (e.g. from Drive)
 *  @returns {Object} Merged DB */
export function mergeDB(local, remote) {
  const localDel = safeArr(local.deletedIds);
  const remoteDel = safeArr(remote.deletedIds);
  const allDeleted = [...new Set([...localDel, ...remoteDel])];
  const merged = { ...remote };
  merged.workouts = mergeById(safeArr(local.workouts), safeArr(remote.workouts), allDeleted);
  merged.bodyLogs = mergeById(safeArr(local.bodyLogs), safeArr(remote.bodyLogs), allDeleted);
  merged.deletedIds = allDeleted;
  merged.customPrograms = mergeById(safeArr(local.customPrograms), safeArr(remote.customPrograms), [], '_customId');
  merged.customSessions = mergeById(safeArr(local.customSessions), safeArr(remote.customSessions), allDeleted);
  merged.runningLogs = mergeById(safeArr(local.runningLogs), safeArr(remote.runningLogs), allDeleted);
  merged.domainTests = mergeById(safeArr(local.domainTests), safeArr(remote.domainTests), allDeleted);
  return merged;
}
