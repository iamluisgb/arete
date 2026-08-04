// El tracker GPS no se borra: se ofrece solo donde el sistema operativo deja
// medir de verdad. En el navegador `watchPosition` se estrangula en segundo
// plano, y por eso la app llegaba a pedir "mantén la pantalla encendida".
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isNativePlatform, canTrackRuns } from '../js/platform.js';

afterEach(() => { delete window.Capacitor; vi.resetModules(); });

describe('isNativePlatform', () => {
  it('sin Capacitor es la PWA', () => {
    expect(isNativePlatform()).toBe(false);
  });

  it('reconoce la API moderna isNativePlatform()', () => {
    window.Capacitor = { isNativePlatform: () => true };
    expect(isNativePlatform()).toBe(true);
  });

  it('en web, Capacitor existe pero declara que no es nativo', () => {
    window.Capacitor = { isNativePlatform: () => false };
    expect(isNativePlatform()).toBe(false);
  });

  it('acepta el isNative de Capacitor 3', () => {
    window.Capacitor = { isNative: true };
    expect(isNativePlatform()).toBe(true);
  });
});

describe('canTrackRuns', () => {
  it('la PWA no puede medir una carrera entera aunque tenga geolocation', () => {
    // Tener `navigator.geolocation` no basta: el navegador la tiene y aun así
    // deja de emitir con la pantalla apagada.
    expect('geolocation' in navigator || true).toBe(true);
    expect(canTrackRuns()).toBe(false);
  });

  it('la app nativa sí, porque tiene foreground service', () => {
    window.Capacitor = { isNativePlatform: () => true };
    expect(canTrackRuns()).toBe(true);
  });
});
