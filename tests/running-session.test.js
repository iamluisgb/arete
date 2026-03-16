import { describe, it, expect } from 'vitest';
import { parseSegDuration, segModeToRunType } from '../js/ui/running.js';
import { parseSegDistance } from '../js/ui/running-helpers.js';

// ── parseSegDistance ──────────────────────────────────────

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
