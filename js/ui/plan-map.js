// Mapa del plan: el programa de fuerza entero en una línea de tiempo vertical
// (odd/tasks/planificacion.md · D8). Vive arriba de Entrenar → Plan.
//
// Una fila por fase con sus fechas proyectadas y un punto por semana; la
// descarga es una fila más baja entre fases. Las fases anteriores a la activa
// salen atenuadas y sin fechas: el plan no sabe si las hiciste (puedes haber
// empezado por la II), así que no lo afirma.
//
// Los datos salen de js/plan.js (planStatus, planTimeline, programBlocks); aquí
// solo se pinta. Las fechas son proyección y la nota lo dice: si pierdes una
// semana, todo se corre.

import { esc } from '../utils.js';
import { ROMAN } from '../constants.js';
import { planStatus, planTimeline, programBlocks } from '../plan.js';

const roman = n => ROMAN[n - 1] || String(n);

/** '2026-11-03' → '3 nov' */
function fechaCorta(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}
const rango = (a, b) => `${fechaCorta(a)} → ${fechaCorta(b)}`;

/** Puntos de semana: hechos, el de la semana en curso y los que faltan. */
function puntos(total, hechas, enCurso) {
  return Array.from({ length: total }, (_, i) => {
    const cls = i < hechas ? ' is-done' : i === hechas && enCurso ? ' is-now' : '';
    return `<span class="plan-map-dot${cls}"></span>`;
  }).join('');
}

/**
 * HTML del mapa, o '' si el programa activo no tiene fases.
 * @param {Object} db
 * @param {Date|string} [ref]
 */
export function planMapHtml(db, ref = new Date()) {
  const st = planStatus(db, ref);
  if (!st) return '';
  const blocks = programBlocks(db);
  const tl = planTimeline(db, ref);
  const ultimo = tl[tl.length - 1];

  const filas = [];
  for (const b of blocks) {
    if (b.id < st.phase) {
      filas.push(`<li class="plan-map-row is-past">
        <button type="button" class="plan-map-phase" data-map-phase="${b.id}">
          <span class="plan-map-num" aria-hidden="true">${roman(b.id)}</span>
          <span class="plan-map-main"><span class="plan-map-name">${esc(b.name)}</span>
          <span class="plan-map-meta">${b.weeks} semanas</span></span>
        </button></li>`);
      continue;
    }
    const carga = tl.find(t => t.phase === b.id && t.kind === 'carga');
    const descarga = tl.find(t => t.phase === b.id && t.kind === 'descarga');
    const actual = b.id === st.phase;

    // Fila de la fase. En la activa, los puntos dicen dónde estás; si ya estás
    // en la descarga, la carga está toda hecha y su tramo no viene en el timeline.
    const hechas = actual ? (st.kind === 'descarga' ? b.weeks : st.week - 1) : 0;
    const enCurso = actual && st.kind === 'carga';
    const fechas = carga ? rango(carga.start, carga.end) : 'hecha';
    const estado = actual
      ? (st.kind === 'carga' ? `Semana ${st.week} de ${b.weeks}` : 'Carga hecha')
      : `${b.weeks} semanas`;
    const vuelta = actual && st.cycle > 1 ? ` · ${st.cycle}ª vuelta` : '';
    filas.push(`<li class="plan-map-row${actual ? ' is-current' : ''}"${enCurso ? ' aria-current="step"' : ''}>
      <button type="button" class="plan-map-phase" data-map-phase="${b.id}">
        <span class="plan-map-num" aria-hidden="true">${roman(b.id)}</span>
        <span class="plan-map-main">
          <span class="plan-map-name">${esc(b.name)}</span>
          <span class="plan-map-meta">${esc(estado + vuelta)} · ${esc(fechas)}</span>
          <span class="plan-map-dots" aria-hidden="true">${puntos(b.weeks, hechas, enCurso)}</span>
        </span>
        ${enCurso ? '<span class="plan-map-now">Ahora</span>' : ''}
      </button></li>`);

    if (b.deload && descarga) {
      const ahora = actual && st.kind === 'descarga';
      filas.push(`<li class="plan-map-row plan-map-row--deload${ahora ? ' is-current' : ''}"${ahora ? ' aria-current="step"' : ''}>
        <span class="plan-map-deload">
          <span class="plan-map-name">Descarga</span>
          <span class="plan-map-meta">${esc(rango(descarga.start, descarga.end))}</span>
          ${ahora ? '<span class="plan-map-now">Ahora</span>' : ''}
        </span></li>`);
    }
  }

  const fin = ultimo ? `Termina hacia el ${fechaCorta(ultimo.end)}` : '';
  return `<section class="plan-map" aria-labelledby="planMapTitle">
    <div class="plan-map-head">
      <h3 class="plan-map-title" id="planMapTitle">Tu plan</h3>
      ${fin ? `<span class="plan-map-end">${esc(fin)}</span>` : ''}
    </div>
    <ol class="plan-map-list" role="list">${filas.join('')}</ol>
    <p class="plan-map-note">Las fechas se recalculan con cada entreno: una semana se cierra al hacer sus sesiones, y si pierdes una, todo se corre. Toca una fase para ver sus sesiones.</p>
  </section>`;
}
