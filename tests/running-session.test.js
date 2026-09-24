import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { canTrackRunsMock } = vi.hoisted(() => ({ canTrackRunsMock: vi.fn() }));
vi.mock('../js/platform.js', () => ({ canTrackRuns: canTrackRunsMock }));

import { parseSegDuration, segModeToRunType, updateGpsAvailability, sessionSegMarkup } from '../js/ui/running.js';
import { parseSegDistance } from '../js/ui/running-helpers.js';

const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');

/** Inyecta el panel de entrenar real de app.html: el bloque GPS y la nota viven
 *  ahí, y si alguien mueve un id el fallo sale aquí y no en producción. */
function setupRunTrain() {
  const doc = new DOMParser().parseFromString(HTML, 'text/html');
  document.body.innerHTML = '';
  document.body.appendChild(doc.getElementById('runActivity').cloneNode(true));
}

// ── parseSegDistance ──────────────────────────────────────

beforeEach(() => { canTrackRunsMock.mockReset(); });

describe('parseSegDistance', () => {
  it('parses meters', () => {
    expect(parseSegDistance('200m')).toBeCloseTo(0.2);
    expect(parseSegDistance('400m')).toBeCloseTo(0.4);
    expect(parseSegDistance('1000m')).toBeCloseTo(1.0);
  });

  it('parses kilometers', () => {
    expect(parseSegDistance('1km')).toBe(1);
    expect(parseSegDistance('5km')).toBe(5);
    expect(parseSegDistance('2.5km')).toBe(2.5);
  });

  it('parses distance with trailing text (e.g. "200m trote")', () => {
    expect(parseSegDistance('200m trote')).toBeCloseTo(0.2);
    expect(parseSegDistance('100m suave')).toBeCloseTo(0.1);
    expect(parseSegDistance('1km fácil')).toBe(1);
  });

  it('returns 0 for empty/null/undefined', () => {
    expect(parseSegDistance('')).toBe(0);
    expect(parseSegDistance(null)).toBe(0);
    expect(parseSegDistance(undefined)).toBe(0);
  });

  it('returns 0 for text without distance', () => {
    expect(parseSegDistance('trote')).toBe(0);
    expect(parseSegDistance('—')).toBe(0);
  });
});

// ── parseSegDuration ─────────────────────────────────────

describe('parseSegDuration', () => {
  it('parses minutes', () => {
    expect(parseSegDuration('20min')).toBe(1200);
    expect(parseSegDuration('10min')).toBe(600);
    expect(parseSegDuration('5min')).toBe(300);
  });

  it('parses hours', () => {
    expect(parseSegDuration('1h')).toBe(3600);
    expect(parseSegDuration('2h')).toBe(7200);
  });

  it('parses hours + minutes (e.g. 1h30)', () => {
    expect(parseSegDuration('1h30')).toBe(5400);
    expect(parseSegDuration('1h15')).toBe(4500);
  });

  it('handles whitespace and case', () => {
    expect(parseSegDuration(' 20min ')).toBe(1200);
    expect(parseSegDuration('20MIN')).toBe(1200);
    expect(parseSegDuration('1H30')).toBe(5400);
  });

  it('returns 0 for empty/null/undefined', () => {
    expect(parseSegDuration('')).toBe(0);
    expect(parseSegDuration(null)).toBe(0);
    expect(parseSegDuration(undefined)).toBe(0);
  });

  it('returns 0 for unrecognized formats', () => {
    expect(parseSegDuration('abc')).toBe(0);
    expect(parseSegDuration('fast')).toBe(0);
  });
});

// ── segModeToRunType ─────────────────────────────────────

describe('segModeToRunType', () => {
  it('maps run-intervals to intervalos', () => {
    expect(segModeToRunType({ mode: 'run-intervals' })).toBe('intervalos');
  });

  it('maps Z3 zone to tempo', () => {
    expect(segModeToRunType({ mode: 'run-steady', zone: 'Z3' })).toBe('tempo');
  });

  it('maps Z4 zone to tempo', () => {
    expect(segModeToRunType({ mode: 'run-steady', zone: 'Z4' })).toBe('tempo');
  });

  it('maps Z1 zone to rodaje', () => {
    expect(segModeToRunType({ mode: 'run-steady', zone: 'Z1' })).toBe('rodaje');
  });

  it('maps Z2 zone to rodaje', () => {
    expect(segModeToRunType({ mode: 'run-steady', zone: 'Z2' })).toBe('rodaje');
  });

  it('maps Z5 zone to rodaje (not tempo)', () => {
    expect(segModeToRunType({ mode: 'run-steady', zone: 'Z5' })).toBe('rodaje');
  });

  it('defaults to rodaje for unknown mode/zone', () => {
    expect(segModeToRunType({ mode: 'other' })).toBe('rodaje');
    expect(segModeToRunType({})).toBe('rodaje');
  });
});

// ── UX-9: el GPS que no está, explicado ──────────────────
//
// En el navegador el tracker se oculta (watchPosition se estrangula en segundo
// plano). Un botón que desaparece sin explicación parece un fallo: donde
// estaría, una nota muda dice qué sí se puede hacer.

describe('UX-9: nota de GPS en el navegador', () => {
  it('sin soporte GPS: la nota se ve con la copia exacta y el bloque GPS queda oculto', () => {
    setupRunTrain();
    canTrackRunsMock.mockReturnValue(false);
    updateGpsAvailability();
    const nota = document.getElementById('runGpsNote');
    expect(nota.hidden).toBe(false);
    expect(nota.textContent.trim())
      .toBe('El GPS en vivo solo está en la app instalada. Importa tu GPX o registra la carrera a mano.');
    expect(document.getElementById('runGpsActions').hidden).toBe(true);
  });

  it('con soporte GPS: la nota no aparece y el bloque GPS se ve', () => {
    setupRunTrain();
    canTrackRunsMock.mockReturnValue(true);
    updateGpsAvailability();
    expect(document.getElementById('runGpsNote').hidden).toBe(true);
    expect(document.getElementById('runGpsActions').hidden).toBe(false);
  });

  it('la nota vive una sola vez en el HTML: los re-renders no la duplican', () => {
    setupRunTrain();
    canTrackRunsMock.mockReturnValue(false);
    updateGpsAvailability();
    updateGpsAvailability();   // re-render del sub-tab
    expect(document.querySelectorAll('#runGpsNote')).toHaveLength(1);
  });

  it('app.html trae la nota oculta por defecto, dentro del panel de entrenar', () => {
    setupRunTrain();
    const nota = document.getElementById('runGpsNote');
    expect(nota).not.toBeNull();
    expect(nota.hidden).toBe(true);
  });
});

// ── UX-10: la zona no se comunica solo con color ─────────

describe('UX-10: los tramos de sesión nombran su zona', () => {
  it('el tramo lleva la zona como texto, no solo el color de fondo', () => {
    const html = sessionSegMarkup({ name: 'Serie', zone: 'Z3' }, { current: true, done: false });
    expect(html).toContain('Z3');
    expect(html).toContain('Serie');
  });

  it('sin zona declarada cae en Z2 y sigue nombrándola', () => {
    const html = sessionSegMarkup({ name: 'Trote' }, { current: false, done: true });
    expect(html).toContain('Z2');
  });
});
