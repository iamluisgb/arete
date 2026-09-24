// UX-3: los toasts ocurren fuera del foco — sin roles ARIA un lector de
// pantalla no se entera de que "Sesión guardada" o "Fallo al guardar".
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('toast a11y', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toastContainer"></div>';
    vi.resetModules();
  });

  it('éxito/info se anuncian en polite (role status + aria-live polite)', async () => {
    const { initToast, toast } = await import('../js/ui/toast.js');
    initToast();
    toast('Sesión guardada');
    const el = document.querySelector('#toastContainer .toast');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('errores son assertivos (role alert + aria-live assertive)', async () => {
    const { initToast, toast } = await import('../js/ui/toast.js');
    initToast();
    toast('Fallo al guardar', 'error');
    const el = document.querySelector('#toastContainer .toast');
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.getAttribute('aria-live')).toBe('assertive');
  });
});
