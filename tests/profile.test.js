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
      <div id="profRadarTable" class="sr-only"></div>
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

// ── UX-11: el radar también se lee sin verlo ─────────────
//
// El radar es role="img": un lector de pantalla no saca los niveles de él.
// La tabla equivalente, oculta visualmente, repite los mismos datos que las
// tarjetas de abajo — mismas filas, mismo origen, sin recálculo.

describe('UX-11: tabla sr-only junto al radar', () => {
  /** Fecha lo bastante vieja para que cualquier test (6 o 10 semanas) esté
   *  caducado, sin acoplarse a la fecha en que corre la suite. */
  const viejo = () => new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

  it('una fila por dominio medido, con nombre y nivel en romano', async () => {
    const profile = await cargar();
    profile.renderProfile(freshDB({
      domainTests: [
        { id: 1, metric: 'ake', value: -10, date: '2026-08-01' },
        { id: 2, metric: 'run400', value: 58, date: '2026-08-01' },
      ],
    }));
    const rows = [...document.querySelectorAll('#profRadarTable tbody tr')];
    expect(rows).toHaveLength(2);
    const texto = rows.map(r => r.textContent).join(' | ');
    expect(texto).toContain('Movilidad funcional');
    expect(texto).toContain('Capacidad glicolítica');
    // AKE -10° es nivel I, run400 58 s es nivel IV (mismos umbrales que la tarjeta)
    expect(texto).toContain('I');
    expect(texto).toContain('IV');
  });

  it('un test caducado se marca como tal, como el chip de la tarjeta', async () => {
    const profile = await cargar();
    profile.renderProfile(freshDB({
      domainTests: [{ id: 1, metric: 'ake', value: 16, date: viejo() }],
    }));
    const fila = document.querySelector('#profRadarTable tbody tr');
    expect(fila.textContent).toContain('Caducado');
  });

  it('los dominios sin medir no aparecen: la tabla no miente como el radar', async () => {
    const profile = await cargar();
    profile.renderProfile(freshDB({
      domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-08-01' }],
    }));
    const texto = document.getElementById('profRadarTable').textContent;
    expect(texto).not.toContain('Fuerza máxima');
  });

  it('sin nada medido, la tabla queda vacía y no rompe', async () => {
    const profile = await cargar();
    expect(() => profile.renderProfile(freshDB())).not.toThrow();
    expect(document.querySelectorAll('#profRadarTable tbody tr')).toHaveLength(0);
  });
});
