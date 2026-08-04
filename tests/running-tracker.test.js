import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { haversine, GpsTracker } from '../js/ui/running-tracker.js';

// ── haversine ────────────────────────────────────────────

describe('haversine', () => {
  it('returns 0 for same point', () => {
    expect(haversine(40.4168, -3.7038, 40.4168, -3.7038)).toBe(0);
  });

  it('calculates Madrid → Barcelona (~505 km)', () => {
    const d = haversine(40.4168, -3.7038, 41.3874, 2.1686);
    expect(d).toBeGreaterThan(490_000);
    expect(d).toBeLessThan(520_000);
  });

  it('calculates short distance (~100m apart)', () => {
    // ~111m per 0.001 degree latitude at equator
    const d = haversine(0, 0, 0.001, 0);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('handles antipodal points (~20000 km)', () => {
    const d = haversine(0, 0, 0, 180);
    expect(d).toBeGreaterThan(20_000_000);
    expect(d).toBeLessThan(20_100_000);
  });

  it('handles negative coordinates', () => {
    const d = haversine(-33.8688, 151.2093, -34.6037, -58.3816);
    // Sydney → Buenos Aires ~11800 km
    expect(d).toBeGreaterThan(11_000_000);
    expect(d).toBeLessThan(12_500_000);
  });

  it('is symmetric', () => {
    const d1 = haversine(40.4168, -3.7038, 41.3874, 2.1686);
    const d2 = haversine(41.3874, 2.1686, 40.4168, -3.7038);
    expect(d1).toBeCloseTo(d2, 6);
  });
});

// ── GpsTracker ───────────────────────────────────────────

describe('GpsTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new GpsTracker();
  });

  it('starts in idle state', () => {
    expect(tracker.state).toBe('idle');
    expect(tracker.distance).toBe(0);
    expect(tracker.elapsed).toBe(0);
    expect(tracker.splits).toEqual([]);
    expect(tracker.coords).toEqual([]);
  });

  it('getResult returns proper structure with zero values', () => {
    const result = tracker.getResult();
    expect(result).toHaveProperty('distance', 0);
    expect(result).toHaveProperty('duration', 0);
    expect(result).toHaveProperty('pace', 0);
    expect(result).toHaveProperty('avgSpeed', 0);
    expect(result).toHaveProperty('splits');
    expect(result).toHaveProperty('route');
    expect(result).toHaveProperty('elevation');
    expect(result).toHaveProperty('source', 'gps');
    expect(Array.isArray(result.splits)).toBe(true);
    expect(Array.isArray(result.route.coords)).toBe(true);
  });

  it('getResult rounds distance to 3 decimals', () => {
    tracker.distance = 5.12345;
    const result = tracker.getResult();
    expect(result.distance).toBe(5.123);
  });

  it('getResult calculates pace correctly', () => {
    tracker.distance = 5;
    tracker.elapsed = 1500; // 25min for 5km = 300 sec/km
    const result = tracker.getResult();
    expect(result.pace).toBe(300);
  });

  it('getResult returns pace 0 when distance is 0', () => {
    tracker.distance = 0;
    tracker.elapsed = 100;
    const result = tracker.getResult();
    expect(result.pace).toBe(0);
  });

  it('getResult calculates avgSpeed correctly', () => {
    tracker.distance = 10;
    tracker.elapsed = 3600; // 1h for 10km = 10 km/h
    const result = tracker.getResult();
    expect(result.avgSpeed).toBe(10);
  });

  it('getResult returns avgSpeed 0 when elapsed is 0', () => {
    tracker.distance = 5;
    tracker.elapsed = 0;
    const result = tracker.getResult();
    expect(result.avgSpeed).toBe(0);
  });

  it('getResult rounds route coords', () => {
    tracker.coords = [[40.4168123456, -3.7038123456, 650.123, 1000]];
    const result = tracker.getResult();
    expect(result.route.coords[0][0]).toBe(40.416812);
    expect(result.route.coords[0][1]).toBe(-3.703812);
    expect(result.route.coords[0][2]).toBe(650.1);
  });

  it('_calcTotalElevation sums only positive gains > 1m', () => {
    tracker.coords = [
      [0, 0, 100, 0],
      [0, 0, 105, 1], // +5 (counted)
      [0, 0, 103, 2], // -2 (ignored)
      [0, 0, 110, 3], // +7 (counted)
      [0, 0, 110.5, 4], // +0.5 (ignored, < 1m noise)
    ];
    expect(tracker._calcTotalElevation()).toBe(12); // 5 + 7
  });

  it('_calcTotalElevation returns 0 for empty coords', () => {
    expect(tracker._calcTotalElevation()).toBe(0);
  });

  it('_calcTotalElevation handles null altitude', () => {
    tracker.coords = [
      [0, 0, null, 0],
      [0, 0, 50, 1],
      [0, 0, null, 2],
    ];
    // null→50 = +50, 50→null(0) = -50
    expect(tracker._calcTotalElevation()).toBe(50);
  });

  it('stop returns null when already idle', () => {
    expect(tracker.stop()).toBeNull();
  });
});

// Un permiso denegado dejaba al usuario con el overlay abierto, el cronómetro a
// cero y la nav oculta. La UI necesita distinguir el error del que no se vuelve.
describe('clasificación de errores de GPS', () => {
  let tracker, errores, origGeo;

  beforeEach(() => {
    tracker = new GpsTracker();
    errores = [];
    tracker.onError((msg, opts) => errores.push({ msg, ...opts }));
    origGeo = navigator.geolocation;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: origGeo, configurable: true });
  });

  /** Arranca el watcher capturando su callback de error. */
  function watcherConError() {
    let onErr;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition: (_ok, err) => { onErr = err; return 1; }, clearWatch: () => {} },
    });
    tracker._startGps();
    return onErr;
  }

  it('sin geolocalización en el dispositivo el error es fatal', () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    expect(tracker.start()).toBe(false);
    expect(errores[0]).toMatchObject({ fatal: true });
  });

  it('permiso denegado (code 1) es fatal', () => {
    watcherConError()({ code: 1 });
    expect(errores[0]).toMatchObject({ msg: 'Permiso GPS denegado', fatal: true });
  });

  it('GPS no disponible (code 2) es fatal', () => {
    watcherConError()({ code: 2 });
    expect(errores[0]).toMatchObject({ fatal: true });
  });

  it('un timeout (code 3) NO es fatal: el watch sigue vivo y se recupera solo', () => {
    watcherConError()({ code: 3 });
    expect(errores[0]).toMatchObject({ msg: 'Timeout GPS', fatal: false });
  });
});
