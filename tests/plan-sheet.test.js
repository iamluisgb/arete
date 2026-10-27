// Hoja «Plan y fase»: desplegar un plan no cambia nada; tocar una fase cambia
// plan y fase a la vez, cierra y deja deshacer. Los planes se siembran como
// custom (reindexCustomPrograms), igual que en schedule.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reindexCustomPrograms, setActiveProgram, getActiveProgram } from '../js/programs.js';
import { initToast } from '../js/ui/toast.js';
import { initPlanSheet, openPlanSheet, isPlanSheetOpen, phasesOf } from '../js/ui/plan-sheet.js';

const PLAN_A = {
  _meta: { name: 'Plan A', desc: 'Barra' }, _customId: 'p-a',
  1: { name: 'Base', desc: '3×5', sessions: { 'A1': [], 'A2': [] } },
  2: { name: 'Pico', sessions: { 'A3': [] } },
};
const PLAN_B = {
  _meta: { name: 'Plan B', desc: 'Sin equipamiento' }, _customId: 'p-b',
  2: { name: 'Dos', sessions: { 'B2': [] } },
  1: { name: 'Uno', sessions: { 'B1': [], 'B1b': [] } },
};

let db, onChange;

function mount() {
  document.body.innerHTML = `
    <button id="ctxChip"></button>
    <div class="sheet" id="programModal"><div class="sheet-panel">
      <button id="programModalClose"></button>
      <div id="planSheetBody"></div>
    </div></div>
    <div id="toastContainer"></div>`;
  db = {
    workouts: [{ program: 'p-a', phase: 1, session: 'A1' }], runningLogs: [], settings: {},
    customPrograms: [PLAN_A, PLAN_B], program: 'p-a', phase: 1,
  };
  reindexCustomPrograms(db);
  setActiveProgram('p-a');
  onChange = vi.fn();
  initToast();
  initPlanSheet(db, { onChange });
}

const $ = sel => document.querySelector(sel);
const body = () => $('#planSheetBody');

describe('hoja de plan y fase', () => {
  beforeEach(mount);

  it('ordena las fases por número aunque el JSON venga desordenado', () => {
    expect(phasesOf('p-b').map(p => p.name)).toEqual(['Uno', 'Dos']);
    expect(phasesOf('p-b')[0].sessions).toBe(2);
  });

  it('abre con el plan activo desplegado y su fase marcada con lo que queda', () => {
    $('#ctxChip').click();
    expect(isPlanSheetOpen()).toBe(true);
    const open = body().querySelector('.plan-row[aria-expanded="true"]');
    expect(open.dataset.plan).toBe('p-a');
    const sel = body().querySelector('.plan-phase.is-selected');
    expect(sel.dataset.phase).toBe('1');
    expect(sel.textContent).toContain('Quedan 1 de 2');
    expect(body().querySelectorAll('.plan-row[aria-expanded="false"]').length).toBe(1);
  });

  it('desplegar otro plan no cambia nada y avisa de la cola', () => {
    openPlanSheet(db);
    body().querySelector('.plan-row[data-plan="p-b"]').click();
    expect(db.program).toBe('p-a');
    expect(onChange).not.toHaveBeenCalled();
    expect(isPlanSheetOpen()).toBe(true);
    expect(body().querySelector('.plan-row[data-plan="p-b"]').getAttribute('aria-expanded')).toBe('true');
    expect(body().textContent).toContain('recalcula tu cola');
    // El activo, plegado, resume su fase en curso.
    expect(body().querySelector('.plan-row[data-plan="p-a"] .plan-row-meta').textContent).toContain('Fase I · Base');
  });

  it('tocar una fase de otro plan cambia los dos, cierra y se deshace', () => {
    openPlanSheet(db);
    body().querySelector('.plan-row[data-plan="p-b"]').click();
    body().querySelector('.plan-phase[data-plan="p-b"][data-phase="2"]').click();
    expect(db.program).toBe('p-b');
    expect(db.phase).toBe(2);
    expect(getActiveProgram()).toBe('p-b');
    expect(isPlanSheetOpen()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);

    const toast = $('#toastContainer .toast');
    expect(toast.textContent).toContain('Plan B · Dos');
    toast.querySelector('.toast-action').click();
    expect(db.program).toBe('p-a');
    expect(db.phase).toBe(1);
    expect(getActiveProgram()).toBe('p-a');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('tocar la fase en curso solo cierra', () => {
    openPlanSheet(db);
    body().querySelector('.plan-phase.is-selected').click();
    expect(isPlanSheetOpen()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect($('#toastContainer .toast')).toBeNull();
  });

  it('separa los planes de fábrica de los propios', () => {
    openPlanSheet(db);
    const groups = [...body().querySelectorAll('.plan-group')].map(h => h.textContent);
    expect(groups).toEqual(['Tus planes']);
  });
});
