// Atajos de teclado.
//
// Solo con puntero fino: en un móvil no hay teclado físico y estos atajos no
// tienen dónde dispararse. Y con dos guardas que no son opcionales:
//
//  1. Si el foco está en un campo, no hay atajo. Escribir "5" en el peso de una
//     serie no puede llevarte a otra pestaña.
//  2. Si hay un diálogo abierto, tampoco. El único que sigue vivo es Escape, y
//     ese ya lo gestiona `app.js`.
//
// Y una regla de producto: un atajo que no se descubre no existe. Por eso `?`
// abre la hoja que los lista, y la hoja se menciona en Ajustes.

const TECLAS_SECCION = { 1: 'secDashboard', 2: 'secTrain', 3: 'secProfile', 4: 'secBody', 5: 'secSettings' };

export const ATAJOS = [
  { tecla: '1 – 5', que: 'Ir a Hoy, Entrenar, Perfil, Cuerpo o Más' },
  { tecla: '/', que: 'Abrir Quirón y escribir' },
  { tecla: 'Espacio', que: 'Serie hecha, con la sesión en curso' },
  { tecla: '← →', que: 'Mes anterior y siguiente en el calendario' },
  { tecla: 'Esc', que: 'Cerrar lo que esté abierto' },
  { tecla: '?', que: 'Esta lista' },
];

/** ¿El usuario está escribiendo? Entonces no hay atajos que valgan. */
function escribiendo(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** ¿Hay algún diálogo visible? */
function hayDialogo() {
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .some(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
}

function hoja() {
  let el = document.getElementById('shortcutSheet');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'shortcutSheet';
  el.className = 'modal-overlay shortcut-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'shortcutSheetTitle');
  el.innerHTML = `<div class="modal">
      <h3 id="shortcutSheetTitle">Atajos de teclado</h3>
      <dl class="shortcut-list">
        ${ATAJOS.map(a => `<div class="shortcut-row"><dt><kbd>${a.tecla}</kbd></dt><dd>${a.que}</dd></div>`).join('')}
      </dl>
      <button class="btn btn-outline" data-close>Cerrar</button>
    </div>`;
  el.addEventListener('click', e => {
    if (e.target === el || e.target.closest('[data-close]')) el.classList.remove('open');
  });
  document.body.appendChild(el);
  return el;
}

export function toggleShortcutSheet() {
  const el = hoja();
  el.classList.toggle('open');
}

export function initShortcuts(db, { switchTab } = {}) {
  if (!matchMedia('(pointer:fine)').matches) return;

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (escribiendo(document.activeElement)) return;

    // La hoja de atajos se cierra sola con Escape (lo hace app.js) y se abre
    // con ? incluso si no hay nada más en pantalla.
    if (e.key === '?') { e.preventDefault(); toggleShortcutSheet(); return; }

    // El runner no es un diálogo cualquiera: es la pantalla activa mientras
    // entrenas, y ahí Espacio es "serie hecha". Va antes de la guarda general.
    const runner = document.getElementById('setRunner');
    if (runner?.classList.contains('up')) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        runner.querySelector('.sr-cta')?.click();
      }
      return;
    }

    if (hayDialogo()) return;

    const seccion = TECLAS_SECCION[e.key];
    if (seccion) {
      e.preventDefault();
      const btn = document.querySelector(`nav button[data-sec="${seccion}"]`);
      if (btn && switchTab) switchTab(btn, db);
      else btn?.click();
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('quironFab')?.click();
      // El panel se abre en el mismo tick; el campo, en el siguiente.
      requestAnimationFrame(() => document.getElementById('quironInput')?.focus());
      return;
    }

    // Las flechas solo mandan si hay un calendario a la vista: en cualquier
    // otra pantalla son scroll, y robárselo al usuario sería peor que no tener
    // atajo.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const nav = [...document.querySelectorAll('.cal-nav')]
        .find(n => n.getClientRects().length > 0);
      if (!nav) return;
      const botones = nav.querySelectorAll('button');
      const btn = e.key === 'ArrowLeft' ? botones[0] : botones[botones.length - 1];
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });
}
