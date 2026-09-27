// UX-4: el overlay de PR roba el foco — al abrirse manda el foco a su botón
// principal y al cerrarse (clic o Escape) lo devuelve a quien lo tenía.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/programs.js', async () => {
  const actual = await vi.importActual('../js/programs.js');
  const mockPrograms = {
    1: {
      name: 'Fuerza',
      sessions: {
        'Sesión A': [{ name: 'Sentadilla', sets: 2, reps: '5', type: 'main' }],
      },
    },
  };
  return {
    ...actual,
    getPrograms: () => mockPrograms,
    getActiveProgram: () => 'arete',
    getAllPhases: () => [{ id: 1, name: 'Fuerza', desc: '' }],
  };
});

function setupDOM() {
  document.body.innerHTML = `
    <span id="phaseName"></span>
    <select id="trainSession"></select>
    <select id="historyFilter"></select>
    <div id="prefillBanner" style="display:none"><span id="prefillText"></span></div>
    <div id="sessionOverview"></div>
    <div class="ex-dots" id="exerciseDots"></div>
    <div id="exerciseList"></div>
    <div class="save-bar" id="saveBar"><textarea id="trainNotes"></textarea><button id="saveWorkoutBtn">Guardar</button></div>
    <input id="trainDate" type="date">
    <div id="prCelebration"><div id="prList"></div><button class="pr-confirm-btn">¡Vamos! 💪</button></div>
    <div id="toastContainer"></div>
  `;
}

const freshDB = () => ({
  workouts: [], bodyLogs: [], customPrograms: [], customSessions: [],
  deletedIds: [], program: 'arete', phase: 1,
});

function fill(ex, set, kg, reps) {
  const k = document.querySelector(`#exerciseList [data-ex="${ex}"][data-set="${set}"][data-field="kg"]`);
  const r = document.querySelector(`#exerciseList [data-ex="${ex}"][data-set="${set}"][data-field="reps"]`);
  if (k) { k.value = String(kg); k.classList.remove('prefilled'); }
  if (r) { r.value = String(reps); r.classList.remove('prefilled'); }
}

async function cargarSesion(db) {
  const t = await import('../js/ui/training.js');
  const { initToast } = await import('../js/ui/toast.js');
  initToast();
  t.initTraining(db, { onCancelEdit: () => {} });
  t.populateSessions(db);
  document.getElementById('trainSession').value = 'Sesión A';
  t.loadSessionTemplate(db, false);
  document.querySelector('#sessionOverview .so-start')?.click();
  return t;
}

/** Guarda una sesión con PR (100kg vs 95kg previos) y devuelve el overlay. */
async function guardarConPR(db) {
  db.workouts.push({
    id: 1, date: '2026-07-01', session: 'Sesión A', phase: 1,
    exercises: [{ name: 'Sentadilla', sets: [{ kg: '95', reps: '5' }] }],
  });
  const t = await cargarSesion(db);
  fill(0, 0, 100, 5);
  const $saveBtn = document.getElementById('saveWorkoutBtn');
  $saveBtn.focus();
  t.saveWorkout(db);
  return { overlay: document.getElementById('prCelebration'), $saveBtn };
}

beforeEach(() => {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
});

// Auditoría móvil: el nav inferior debe poder recortar su etiqueta (P0-2) y en
// el setup de Quirón la acción primaria es el demo, no "Ir a Ajustes" (P1-e).
// Se prueba contra el app.html real, como quiron-demo.test.js.
describe('markup audit (mobile visual fixes)', () => {
  const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');

  it('cada botón del nav inferior envuelve su etiqueta en .nav-label', () => {
    const start = HTML.indexOf('<nav id="mainNav"');
    const end = HTML.indexOf('</nav>', start);
    document.body.innerHTML = HTML.slice(start, end + 6);

    const buttons = document.querySelectorAll('#mainNav button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach(btn => {
      const label = btn.querySelector('.nav-label');
      expect(label).not.toBeNull();
      // Nav sin texto no es nav: cada botón necesita su etiqueta visible.
      expect(label.textContent.trim()).not.toBe('');
    });
  });

  it('Quirón setup: el demo queda primario y "Ir a Ajustes" es secundario', () => {
    const demo = HTML.match(/<button[^>]*id="quironSetupDemoBtn"[^>]*>/)?.[0];
    expect(demo).toBeTruthy();
    expect(demo).toContain('btn--primary');

    const goSettings = HTML.match(/<button[^>]*id="quironGoSettings"[^>]*>/)?.[0];
    expect(goSettings).toBeTruthy();
    expect(goSettings).toContain('btn--secondary');
    expect(goSettings).not.toContain('btn--primary');
  });

  // R2-2: en móvil angosto la etiqueta "Compartir" se recortaba (99px de
  // contenido en una caja de 88px). Bajo 400px queda solo el icono, así que el
  // botón necesita aria-label y su texto visible vive en un span ocultable.
  it('el botón Compartir del detalle envuelve su etiqueta y tiene aria-label', () => {
    const bar = document.createElement('div');
    bar.innerHTML = HTML.slice(HTML.indexOf('<div class="detail-btn-bar"'), HTML.indexOf('</div>', HTML.indexOf('detail-share-btn')) + 6);
    const share = bar.querySelector('.detail-share-btn');
    expect(share).not.toBeNull();
    expect(share.getAttribute('aria-label')).toBe('Compartir');
    const label = share.querySelector('.detail-share-label');
    expect(label).not.toBeNull();
    expect(label.textContent.trim()).toBe('Compartir');
  });

  // R2-1: text-overflow no aplica a contenedores flex — la elipsis del chip del
  // calendario vive en el span hijo del texto, no en el chip. chipsDia no está
  // exportada; se audita su plantilla en el fuente, como el resto del bloque.
  it('el texto de sesión del chip del calendario va dentro de .cal-chip-txt', () => {
    const src = readFileSync(resolve(process.cwd(), 'js/ui/calendar.js'), 'utf-8');
    expect(src).toContain('<span class="cal-chip-txt">');
  });

  // R2-1 (mismo caso): el clamp del nombre de sesión en el historial es un
  // contrato del CSS — si alguien toca la regla, este test avisa.
  it('.hi-session limita el nombre a 2 líneas con -webkit-line-clamp:2', () => {
    const css = readFileSync(resolve(process.cwd(), 'app.css'), 'utf-8');
    const rule = css.match(/\.hi-session\{[^}]*\}/)?.[0];
    expect(rule).toBeTruthy();
    expect(rule).toContain('-webkit-line-clamp:2');
  });

  // R2-2 (mismo caso): bajo 433px la etiqueta "Compartir" se oculta y queda
  // solo el icono; el aria-label del botón es lo que sostiene la accesibilidad.
  it('app.css oculta .detail-share-label bajo el breakpoint de 433px', () => {
    const css = readFileSync(resolve(process.cwd(), 'app.css'), 'utf-8').replace(/\s+/g, '');
    expect(css).toContain('@media(max-width:433px){.detail-share-label{display:none}}');
  });

  // D6 (memoria duradera): el atleta SIEMPRE ve lo que Quirón recuerda. El
  // botón de cabecera necesita su aria-label (es solo icono) y el modal su
  // lista y contador; el estado vacío vive en el render de quiron.js, como el
  // chip del calendario: se audita el fuente.
  it('Memoria: botón de cabecera con aria-label y modal con lista y contador', () => {
    const btn = HTML.match(/<button[^>]*id="quironMemoryBtn"[^>]*>/)?.[0];
    expect(btn).toBeTruthy();
    expect(btn).toContain('aria-label="Memoria del agente"');
    expect(HTML).toMatch(/<div class="modal-overlay[^"]*"[^>]*id="quironMemoryModal"/);
    expect(HTML).toContain('id="quironMemoryList"');
    expect(HTML).toContain('id="quironMemoryCount"');
  });

  it('Memoria: el estado vacío habla en la voz de Quirón', () => {
    const src = readFileSync(resolve(process.cwd(), 'js/ui/quiron.js'), 'utf-8');
    expect(src).toContain('Aún no recuerdo nada');
    expect(src).toContain('acuérdate de');
  });
});

describe('celebración de PR: foco y cierre', () => {
  it('al abrirse manda el foco a su primer botón', async () => {
    const db = freshDB();
    const { overlay } = await guardarConPR(db);

    expect(overlay.style.display).toBe('flex');
    expect(document.activeElement).toBe(overlay.querySelector('button'));
  });

  it('Escape cierra el overlay y restaura el foco previo', async () => {
    const db = freshDB();
    const { overlay, $saveBtn } = await guardarConPR(db);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(overlay.style.display).toBe('none');
    expect(document.activeElement).toBe($saveBtn);
  });

  it('el clic en el overlay también restaura el foco previo', async () => {
    const db = freshDB();
    const { overlay, $saveBtn } = await guardarConPR(db);

    overlay.click();

    expect(overlay.style.display).toBe('none');
    expect(document.activeElement).toBe($saveBtn);
  });
});

// UX-6: feedback inmediato en las series — solo pinta, no bloquea el guardado.
describe('feedback inline de series (UX-6)', () => {
  const repsInput = () =>
    document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="reps"]');

  it("'abc' marca .set-invalid, luego '42.5' lo limpia, y vacío también", async () => {
    const db = freshDB();
    await cargarSesion(db);
    const inp = repsInput();

    inp.value = 'abc';
    inp.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(true);
    expect(inp.getAttribute('title')).toBe('Valor no válido');

    inp.value = '42.5';
    inp.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(false);
    expect(inp.hasAttribute('title')).toBe(false);

    // Re-marcado y corregido tecleando (input), sin blur.
    inp.value = 'zz';
    inp.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(true);
    inp.value = '9';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(false);

    inp.value = '';
    inp.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(false);
  });

  it("change (teclado sin blur) también valida", async () => {
    const db = freshDB();
    await cargarSesion(db);
    const inp = repsInput();

    inp.value = 'x';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(true);

    inp.value = '5';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    expect(inp.classList.contains('set-invalid')).toBe(false);
  });

  it('marca negativo y deja el valor intacto (no bloquea ni reescribe)', async () => {
    const db = freshDB();
    await cargarSesion(db);
    const kg = document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="kg"]');

    kg.value = '-5';
    kg.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(kg.classList.contains('set-invalid')).toBe(true);
    expect(kg.value).toBe('-5');
  });
});

// UX-7: el borrador es posicional; si no encaja con el plan se descarta avisando.
describe('borrador descartado por mismatch (UX-7)', () => {
  const DRAFT_KEY = 'arete_sessionDraft';

  it('cuenta de series distinta: toast y no restaura', async () => {
    const db = freshDB();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      session: 'Sesión A', date: '2026-07-01', notes: '',
      values: ['5'], checks: [], ts: Date.now(),
    }));
    const t = await cargarSesion(db); // hay draft: se muestra el formulario directamente

    // populateSessions con expand dispara restoreDraft tras renderizar.
    t.populateSessions(db, { expand: true });

    const toasts = [...document.querySelectorAll('#toastContainer .toast')];
    expect(toasts.some(x => x.textContent.includes('no encaja con el plan actual'))).toBe(true);
    // No restauró el valor posicional en una serie equivocada.
    const kg = document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="kg"]');
    expect(kg.value).toBe('');
  });

  it('borrador de otra sesión: toast al intentar restaurarlo', async () => {
    const db = freshDB();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      session: 'Sesión B', date: '', notes: '',
      values: ['5', '3', '50', '5'], checks: [], ts: Date.now(),
    }));
    const t = await cargarSesion(db); // sesión distinta: sin draft visible

    t.populateSessions(db, { expand: true });

    const toasts = [...document.querySelectorAll('#toastContainer .toast')];
    expect(toasts.some(x => x.textContent.includes('no encaja con el plan actual'))).toBe(true);
  });

  it('borrador que encaja: restaura y NO avisa de mismatch', async () => {
    // isolation: la suite puede dejar toasts de casos anteriores
    document.getElementById('toastContainer')?.replaceChildren();
    const db = freshDB();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      session: 'Sesión A', date: '2026-07-01', notes: 'nota',
      values: ['50', '5', '60', '5'], checks: [], ts: Date.now(),
    }));
    const t = await cargarSesion(db);
    t.populateSessions(db, { expand: true });

    const toasts = [...document.querySelectorAll('#toastContainer .toast')];
    expect(toasts.some(x => x.textContent.includes('no encaja con el plan actual'))).toBe(false);
    const kg = document.querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="kg"]');
    expect(kg.value).toBe('50');
  });

  // Flake UX-7: un timer de draft programado por un test anterior (o por una
  // vista reemplazada) sobrevive al reset de módulos y escribía el borrador
  // viejo — con selectores apuntando a un DOM suelto — encima del nuevo.
  it('un timer de draft de una vista ya reemplazada no escribe el borrador', async () => {
    const db = freshDB();
    await cargarSesion(db); // sin draft: el click en el overview despliega el formulario
    fill(0, 0, 60, 5);
    document
      .querySelector('#exerciseList [data-ex="0"][data-set="0"][data-field="kg"]')
      .dispatchEvent(new Event('input', { bubbles: true })); // programa el timer (UX-6)

    // La vista se reemplaza: #exerciseList sale del DOM y el timer queda huérfano.
    document.getElementById('exerciseList').remove();
    await new Promise((r) => setTimeout(r, 550)); // > 500ms del timer

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
