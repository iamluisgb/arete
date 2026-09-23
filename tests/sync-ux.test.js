// UX-8: diagnóstico de sincronización en la subpágina de copia de seguridad.
// La fila del índice dice hace cuándo fue la última copia; el diagnóstico dice
// por qué falla cuando falla. El formateador es puro y el render se prueba
// contra el app.html de verdad, como el resto de Ajustes.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');

function setupDOM() {
  window.scrollTo = () => {};
  const doc = new JSDOM(HTML).window.document;
  const settings = doc.getElementById('secSettings');
  document.body.innerHTML = '';
  document.body.appendChild(settings.cloneNode(true));
  document.getElementById('secSettings').classList.add('active');
}

async function cargar() {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  return import('../js/ui/settings.js');
}

const MIN = 60_000;

// `now` fijo para que las horas relativas no dependan del reloj del runner.
const NOW = Date.parse('2026-09-23T12:00:00Z');

describe('formatSyncDiag (puro)', () => {
  it('sin motor de sync (diag null) dice que no hay actividad', async () => {
    const { formatSyncDiag } = await cargar();
    const html = formatSyncDiag(null, NOW);
    expect(html).toContain('Sin actividad de sincronización');
  });

  it('ciclo OK hace 5 minutos', async () => {
    const { formatSyncDiag } = await cargar();
    const html = formatSyncDiag(
      { lastResult: 'ok', lastError: null, lastCycleAt: NOW - 5 * MIN, consecutiveFailures: 0, history: [] },
      NOW,
    );
    expect(html).toContain('Último ciclo: OK · hace 5 min');
    expect(html).not.toContain('fallos seguidos');
  });

  it('ciclo con error hace 2 h: enseña el error escapado y los fallos seguidos', async () => {
    const { formatSyncDiag } = await cargar();
    const html = formatSyncDiag(
      {
        lastResult: 'error', lastError: 'pull: 500', lastCycleAt: NOW - 2 * 60 * MIN,
        consecutiveFailures: 3, history: [],
      },
      NOW,
    );
    expect(html).toContain('Último ciclo: error · hace 2 h');
    expect(html).toContain('pull: 500');
    expect(html).toContain('3 fallos seguidos');
  });

  it('escapa el lastError: no hay HTML inyectable desde un mensaje de red', async () => {
    const { formatSyncDiag } = await cargar();
    const html = formatSyncDiag(
      { lastResult: 'error', lastError: '<script>x</script>', lastCycleAt: NOW, consecutiveFailures: 1, history: [] },
      NOW,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('motor arrancado pero sin ciclos todavía', async () => {
    const { formatSyncDiag } = await cargar();
    const html = formatSyncDiag(
      { lastResult: null, lastError: null, lastCycleAt: 0, consecutiveFailures: 0, history: [] },
      NOW,
    );
    expect(html).toContain('Sin ciclos aún');
  });

  it('la historia se trunca a las 3 últimas entradas', async () => {
    const { formatSyncDiag } = await cargar();
    const hist = Array.from({ length: 5 }, (_, i) => ({
      at: NOW - (i + 1) * MIN,
      result: i % 2 ? 'error' : 'ok',
      detail: i % 2 ? `fallo ${i}` : 'pulled:0 pushed:1',
    }));
    const html = formatSyncDiag(
      { lastResult: 'ok', lastError: null, lastCycleAt: NOW - MIN, consecutiveFailures: 0, history: hist },
      NOW,
    );
    const items = html.match(/<li>/g) || [];
    expect(items).toHaveLength(3);
    // La más reciente primero (el motor guarda unshift)
    expect(html).toContain('hace 1 min');
    expect(html).not.toContain('hace 5 min');   // la 5ª entrada queda fuera
  });

  it('las entradas de error de la historia llevan su mensaje', async () => {
    const { formatSyncDiag } = await cargar();
    const html = formatSyncDiag(
      {
        lastResult: 'error', lastError: 'pull: 500', lastCycleAt: NOW - MIN,
        consecutiveFailures: 1,
        history: [{ at: NOW - MIN, result: 'error', detail: 'pull: 500' }],
      },
      NOW,
    );
    expect(html).toContain('error · hace 1 min — pull: 500');
  });
});

describe('UX-8: el bloque en la subpágina de copia de seguridad', () => {
  beforeEach(() => { localStorage.clear(); });

  it('app.html trae el <details> plegado con su summary', async () => {
    await cargar();
    const details = document.getElementById('syncDiag');
    expect(details).not.toBeNull();
    expect(details.tagName).toBe('DETAILS');
    expect(details.open).toBe(false);
    expect(details.querySelector('summary').textContent).toContain('Diagnóstico de sincronización');
    expect(details.querySelector('#syncDiagBody')).not.toBeNull();
  });

  it('sin motor, al abrir la subpágina el cuerpo dice que no hay actividad', async () => {
    const { initSettingsNav } = await cargar();
    initSettingsNav({});
    document.querySelector('[data-setpage="setBackup"]').click();
    expect(document.getElementById('syncDiagBody').textContent).toContain('Sin actividad de sincronización');
  });

  it('renderSyncDiag pinta el diagnóstico en el cuerpo del bloque', async () => {
    const { renderSyncDiag } = await cargar();
    renderSyncDiag();
    // Sin motor de sync en el test: el caso nulo es el que se puede ejercitar
    // sin mockear drive.js entero; los casos con datos están arriba, en el puro.
    expect(document.getElementById('syncDiagBody').textContent).toContain('Sin actividad de sincronización');
  });
});
