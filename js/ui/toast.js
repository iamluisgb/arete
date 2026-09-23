let container;

/** Initialize toast notification container */
export function initToast() {
  container = document.getElementById('toastContainer');
}

/** Show a toast notification
 *  @param {string} message - Text to display
 *  @param {'success'|'error'|'info'} type - Toast style
 *  @param {Object} [opts] - Optional: { action: 'Deshacer', onAction: fn } */
export function toast(message, type = 'success', opts) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  // Lectores de pantalla: los toasts ocurren fuera del foco y sin ellos no se
  // enteran. Éxito e info se anuncian al terminar lo que esté sonando (polite);
  // un error manda (assertive/alert) porque habla de algo que ha fallado ya.
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  let timeout;
  if (opts?.action && opts?.onAction) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.action;
    btn.addEventListener('click', () => {
      clearTimeout(timeout);
      opts.onAction();
      el.classList.remove('visible');
      el.addEventListener('transitionend', () => el.remove());
    });
    el.appendChild(btn);
  }

  container.appendChild(el);

  if (navigator.vibrate) navigator.vibrate(type === 'success' ? 50 : [50, 30, 50]);

  requestAnimationFrame(() => el.classList.add('visible'));

  timeout = setTimeout(() => {
    el.classList.remove('visible');
    el.addEventListener('transitionend', () => el.remove());
  }, opts?.action ? 5000 : 2500);
}
