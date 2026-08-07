import { describe, it, expect } from 'vitest';
import { safeNum, esc, formatDate, formatDateShort, today } from '../js/utils.js';

describe('safeNum', () => {
  it('parses valid number within range', () => {
    expect(safeNum('42', 0, 100)).toBe(42);
    expect(safeNum('3.5', 0, 10)).toBe(3.5);
  });

  it('returns null for NaN', () => {
    expect(safeNum('abc')).toBeNull();
    expect(safeNum('')).toBeNull();
  });

  it('returns null when out of range', () => {
    expect(safeNum('5', 10, 100)).toBeNull();
    expect(safeNum('200', 0, 100)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(safeNum('Infinity')).toBeNull();
  });

  it('uses default min=0 and max=Infinity', () => {
    expect(safeNum('50')).toBe(50);
    expect(safeNum('-1')).toBeNull();
  });
});

describe('esc', () => {
  it('escapes HTML entities', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc('"hello" & \'world\'')).toContain('&amp;');
  });

  it('returns empty string for falsy values', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc('')).toBe('');
  });

  it('handles 0 as valid input', () => {
    expect(esc(0)).toBe('0');
  });

  it('passes through safe strings unchanged', () => {
    expect(esc('Sentadilla')).toBe('Sentadilla');
  });
});

describe('formatDate', () => {
  it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(formatDate('2025-03-15')).toBe('15/03/2025');
  });

  it('returns dash for falsy input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('returns input as-is if not splittable', () => {
    expect(formatDate('invalid')).toBe('invalid');
  });
});

// La fecha corta se escribía a mano en ocho sitios como slice(5), que deja
// MM/DD mientras formatDate da DD/MM: el mismo entreno salía como 05/08/2026 en
// el historial y como 08/05 en Actividad. El día >12 es el caso que lo delata.
describe('formatDateShort', () => {
  it('converts YYYY-MM-DD to DD/MM', () => {
    expect(formatDateShort('2026-08-05')).toBe('05/08');
  });

  it('no invierte día y mes cuando el día pasa de 12', () => {
    expect(formatDateShort('2026-05-13')).toBe('13/05');
    expect(formatDateShort('2026-06-24')).toBe('24/06');
  });

  it('coincide con formatDate menos el año', () => {
    const d = '2026-01-31';
    expect(formatDate(d).startsWith(formatDateShort(d))).toBe(true);
  });

  it('devuelve cadena vacía sin fecha, para no pintar un guion en un eje', () => {
    expect(formatDateShort(null)).toBe('');
    expect(formatDateShort('')).toBe('');
  });
});

describe('today', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = today();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
