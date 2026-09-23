// U2 / UX-1: al tocar el nivel en "Hoy" con un dominio limitante, la tarjeta de
// ese dominio en Perfil se resalta. Aquí solo el resaltado; la navegación vive
// en app.js y el cálculo del perfil en domains.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function setupDOM() {
  document.body.innerHTML = `
    <div class="section" id="secProfile">
      <div id="profLevel"></div><div id="profLevelName"></div><div id="profLimited"></div>
      <svg id="profRadar"></svg>
      <div id="profNext"></div>
      <div id="profDomains"></div>
      <div id="profNote"></div>
    </div>
    <div id="toastContainer"></div>
  `;
}

const freshDB = (over = {}) => ({
  workouts: [], bodyLogs: [], runningLogs: [], domainTests: [],
  ...over,
});

async function cargar() {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  (await import('../js/ui/toast.js')).initToast();
  return await import('../js/ui/profile.js');
}

function seedDomains(ids) {
  document.getElementById('profDomains').innerHTML = ids
    .map(id => `<div class="prof-domain" data-domain="${id}"><div class="prof-domain-head"></div></div>`)
    .join('');
}

beforeEach(() => { localStorage.clear(); });

describe('resaltado del dominio limitante', () => {
  it('marca la tarjeta del dominio indicado', async () => {
    const profile = await cargar();
    seedDomains(['strength', 'endurance']);
    profile.highlightDomain('endurance');
    const card = document.querySelector('.prof-domain[data-domain="endurance"]');
    expect(card.classList.contains('domain-highlight')).toBe(true);
    expect(document.querySelector('.prof-domain[data-domain="strength"]')
      .classList.contains('domain-highlight')).toBe(false);
  });

  it('el resaltado se retira al interactuar con la tarjeta', async () => {
    const profile = await cargar();
    seedDomains(['strength']);
    const card = document.querySelector('.prof-domain[data-domain="strength"]');
    profile.highlightDomain('strength');
    expect(card.classList.contains('domain-highlight')).toBe(true);
    card.dispatchEvent(new Event('pointerdown'));
    expect(card.classList.contains('domain-highlight')).toBe(false);
  });

  it('un id desconocido no rompe ni marca nada', async () => {
    const profile = await cargar();
    seedDomains(['strength']);
    expect(() => profile.highlightDomain('noexiste')).not.toThrow();
    expect(document.querySelectorAll('.domain-highlight')).toHaveLength(0);
    expect(() => profile.highlightDomain(undefined)).not.toThrow();
  });

  it('el CSS declara el resaltado y lo respeta con prefers-reduced-motion', async () => {
    const css = readFileSync(resolve(process.cwd(), 'app.css'), 'utf8');
    expect(css).toMatch(/\.domain-highlight\{/);
    // Reduced motion: sin animación, solo el contorno.
    expect(css).toMatch(/prefers-reduced-motion[^}]*\.domain-highlight\{animation:none/);
  });
});
