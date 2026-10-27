// Hoja «Plan y fase» de fuerza.
//
// Plan y fase se eligen juntos: tocar un plan solo lo despliega y enseña sus
// fases; lo que cambia algo es tocar una fase. Antes, tocar un plan lo activaba
// en el acto, reiniciaba la fase a la I y cerraba la hoja, así que ir a la
// fase II de otro plan costaba cuatro pasos, y un roce en la lista te cambiaba
// de plan sin vuelta atrás. Ahora el cambio se avisa con un toast que deshace
// (avisar, nunca bloquear): sin confirm().

import { saveDB } from '../data.js';
import { ROMAN } from '../constants.js';
import { getProgramList, getProgramById, programPhaseKeys, getActiveProgram, setActiveProgram, isBuiltinProgram } from '../programs.js';
import { buildQueue } from '../schedule.js';
import { esc } from '../utils.js';
import { toast } from './toast.js';

let $sheet, $body;
let expanded = null;
let onChange = () => {};

const roman = n => ROMAN[n - 1] || String(n);

/** Fases de un plan cualquiera (no solo el activo), en orden. */
export function phasesOf(programId) {
  const prog = getProgramById(programId);
  return programPhaseKeys(prog)
    .map(k => ({ id: parseInt(k), key: k, phase: prog[k] }))
    .filter(p => !Number.isNaN(p.id) && p.phase && typeof p.phase === 'object')
    .sort((a, b) => a.id - b.id)
    .map(({ id, phase }) => ({
      id,
      name: phase.name || `Fase ${id}`,
      desc: phase.desc || '',
      sessions: phase.sessions ? Object.keys(phase.sessions).length : 0,
    }));
}

// El toast es una píldora: un nombre de plan de 80 caracteres la convierte en un bloque.
const short = (t, max = 26) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que queda de la fase en curso, dicho corto: «Quedan 3 de 6». Vacío si no se ha empezado. */
function progressText(db, total) {
  if (!total) return '';
  const left = buildQueue(db).length;
  if (left === 0) return 'Hecha';
  return left < total ? `Quedan ${left} de ${total}` : '';
}

function planMeta(db, plan, phases, isActive, isOpen) {
  if (isActive && !isOpen) {
    const cur = phases.find(p => p.id === db.phase);
    if (cur) {
      const prog = progressText(db, cur.sessions);
      return [`Fase ${roman(cur.id)}`, cur.name, prog].filter(Boolean).join(' · ');
    }
  }
  return [plural(phases.length, 'fase', 'fases'), plan.desc].filter(Boolean).join(' · ');
}

function renderPlan(db, plan, active) {
  const phases = phasesOf(plan.id);
  const isActive = plan.id === active;
  const isOpen = plan.id === expanded;
  const panelId = `planPhases-${plan.id.replace(/[^\w-]/g, '_')}`;

  const head = `<button type="button" class="plan-row" data-plan="${esc(plan.id)}" aria-expanded="${isOpen}" aria-controls="${panelId}">
      <span class="plan-row-main">
        <span class="plan-row-name">${esc(plan.name)}</span>
        <span class="plan-row-meta">${esc(planMeta(db, plan, phases, isActive, isOpen))}</span>
      </span>
      ${isActive ? '<span class="plan-row-now">Ahora</span>' : ''}
      <span class="material-symbols-outlined plan-row-chev" aria-hidden="true">expand_more</span>
    </button>`;
  if (!isOpen) return `<div class="plan-item">${head}</div>`;

  const items = phases.map(p => {
    const sel = isActive && p.id === db.phase;
    const desc = [p.desc, p.sessions ? plural(p.sessions, 'sesión', 'sesiones') : ''].filter(Boolean).join(' · ');
    const side = sel ? progressText(db, p.sessions) : '';
    return `<li><button type="button" class="plan-phase${sel ? ' is-selected' : ''}" data-plan="${esc(plan.id)}" data-phase="${p.id}"${sel ? ' aria-current="true"' : ''}>
        <span class="plan-phase-num" aria-hidden="true">${roman(p.id)}</span>
        <span class="plan-phase-text">
          <span class="plan-phase-name">${esc(p.name)}</span>
          ${desc ? `<span class="plan-phase-desc">${esc(desc)}</span>` : ''}
        </span>
        ${side ? `<span class="plan-phase-side">${esc(side)}</span>` : ''}
      </button></li>`;
  }).join('');

  const note = isActive ? ''
    : '<p class="plan-note">Empezar aquí recalcula tu cola de sesiones. Tu historial no se toca.</p>';
  const empty = phases.length ? '' : '<p class="plan-note">Este plan no tiene fases.</p>';
  return `<div class="plan-item is-open">${head}
    <div id="${panelId}">${note}${empty}<ul class="plan-phases" role="list">${items}</ul></div>
  </div>`;
}

/** Pinta la hoja con el estado actual. No hace nada si aún no está montada. */
export function renderPlanSheet(db) {
  if (!$body) return;
  const active = getActiveProgram();
  const list = getProgramList();
  if (!expanded || !list.some(p => p.id === expanded)) expanded = active;
  const builtin = list.filter(p => isBuiltinProgram(p.id));
  const custom = list.filter(p => !isBuiltinProgram(p.id));
  const group = (title, plans) => plans.length
    ? `<h4 class="plan-group">${title}</h4>${plans.map(p => renderPlan(db, p, active)).join('')}`
    : '';
  $body.innerHTML = group('De Areté', builtin) + group('Tus planes', custom);
}

export function isPlanSheetOpen() {
  return !!$sheet?.classList.contains('open');
}

export function openPlanSheet(db) {
  expanded = getActiveProgram();
  renderPlanSheet(db);
  $sheet.classList.add('open');
  // Con muchos planes propios, el activo puede quedar por debajo: que se vea.
  $body.querySelector('.plan-item.is-open')?.scrollIntoView?.({ block: 'nearest' });
}

export function closePlanSheet() {
  $sheet?.classList.remove('open');
}

function apply(db, program, phase) {
  const programChanged = (db.program || 'arete') !== program;
  setActiveProgram(program);
  db.program = program;
  db.phase = phase;
  saveDB(db);
  onChange({ programChanged });
}

/** Cambia plan y fase de una vez, cierra y ofrece deshacer. */
export function choosePlanPhase(db, program, phase) {
  const prev = { program: db.program || 'arete', phase: db.phase };
  closePlanSheet();
  if (prev.program === program && prev.phase === phase) return;
  apply(db, program, phase);
  const plan = getProgramList().find(p => p.id === program);
  const ph = phasesOf(program).find(p => p.id === phase);
  toast(`Ahora: ${short(plan?.name || program)} · ${short(ph?.name || `Fase ${roman(phase)}`)}`, 'info', {
    action: 'Deshacer',
    onAction: () => {
      // El plan anterior pudo borrarse mientras tanto: solo se vuelve a uno que exista.
      if (getProgramById(prev.program)) apply(db, prev.program, prev.phase);
    },
  });
}

/**
 * @param {Object} db
 * @param {{onChange?: Function}} opts onChange({programChanged}) se llama tras cambiar
 *   plan o fase (también al deshacer): quien monta la hoja refresca lo que dependa de ellos.
 */
export function initPlanSheet(db, opts = {}) {
  $sheet = document.getElementById('programModal');
  $body = document.getElementById('planSheetBody');
  if (!$sheet || !$body) return;
  onChange = opts.onChange || onChange;

  document.getElementById('ctxChip')?.addEventListener('click', () => openPlanSheet(db));
  document.getElementById('programModalClose').addEventListener('click', closePlanSheet);
  $sheet.addEventListener('click', e => { if (e.target === $sheet) closePlanSheet(); });

  $body.addEventListener('click', e => {
    const phaseBtn = e.target.closest('.plan-phase');
    if (phaseBtn) {
      choosePlanPhase(db, phaseBtn.dataset.plan, parseInt(phaseBtn.dataset.phase));
      return;
    }
    const row = e.target.closest('.plan-row');
    if (!row) return;
    const id = row.dataset.plan;
    // Plegar el abierto deja todo cerrado: la lista entera se ve de un vistazo.
    expanded = expanded === id ? '' : id;
    renderPlanSheet(db);
    // El repintado tira el botón tocado: el foco vuelve a su fila nueva.
    [...$body.querySelectorAll('.plan-row')].find(r => r.dataset.plan === id)?.focus();
  });
}
