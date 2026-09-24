// UX-16: si localStorage está lleno, saveConvo fallaba en silencio y el atleta
// perdía el histórico creyendo que se guardaba. Aviso una vez por sesión.
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('saveConvo con localStorage lleno', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toastContainer"></div>';
    vi.resetModules();
    localStorage.clear();
  });

  it('muestra el aviso UNA vez aunque fallen escrituras sucesivas', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    const { initToast } = await import('../js/ui/toast.js');
    const { saveConvo } = await import('../js/ui/quiron.js');
    initToast();

    saveConvo();
    saveConvo();
    saveConvo();

    const toasts = [...document.querySelectorAll('#toastContainer .toast')];
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toBe('No se pudo guardar la conversación (espacio lleno)');
    spy.mockRestore();
  });

  it('no avisa si la escritura funciona', async () => {
    const { initToast } = await import('../js/ui/toast.js');
    const { saveConvo } = await import('../js/ui/quiron.js');
    initToast();

    saveConvo();

    expect(document.querySelectorAll('#toastContainer .toast')).toHaveLength(0);
  });
});
