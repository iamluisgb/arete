// UX-5: los errores crudos del proveedor ("Failed to fetch", "invalid_api_key")
// no le dicen nada al atleta. friendlyQuironError los clasifica en un mensaje
// legible y marca cuándo corresponde conservar el detalle original (BYOK).
import { describe, it, expect } from 'vitest';

const { friendlyQuironError } = await import('../js/ui/quiron.js');

describe('friendlyQuironError', () => {
  const err = (m) => ({ name: 'Error', message: m });

  it.each([
    ['Failed to fetch'],
    ['NetworkError when attempting to fetch resource.'],
    ['TypeError: fetch failed'],
    ['net::ERR_CONNECTION_REFUSED'],
  ])('red de red: %s', (msg) => {
    const fe = friendlyQuironError(err(msg));
    expect(fe.matched).toBe(true);
    expect(fe.text).toBe('Quirón no pudo contactar al proveedor. Revisa la conexión e inténtalo de nuevo.');
  });

  it.each([
    ['Request failed with status code 402'],
    ['429 insufficient_quota: has excedido tu cuota'],
    ['Insufficient credits'],
  ])('cuota/crédito: %s', (msg) => {
    const fe = friendlyQuironError(err(msg));
    expect(fe.matched).toBe(true);
    expect(fe.text).toBe('El proveedor rechazó la petición: sin cuota o crédito disponible.');
  });

  it.each([
    ['Request failed with status code 401'],
    ['403 Forbidden'],
    ['Unauthorized'],
    ['Incorrect API key provided: invalid_api_key'],
  ])('auth: %s', (msg) => {
    const fe = friendlyQuironError(err(msg));
    expect(fe.matched).toBe(true);
    expect(fe.text).toBe('La clave del proveedor no es válida o expiró. Revisala en Ajustes.');
  });

  it.each([
    ["This model's maximum context length is 8192 tokens"],
    ['max_tokens exceeds context length'],
    ['Response too long'],
  ])('longitud: %s', (msg) => {
    const fe = friendlyQuironError(err(msg));
    expect(fe.matched).toBe(true);
    expect(fe.text).toBe('La respuesta cortó por longitud. Usa el botón Continuar respuesta.');
  });

  it.each([
    ['Request timed out'],
    ['ETIMEDOUT'],
    ['socket hang up after timeout'],
  ])('timeout: %s', (msg) => {
    const fe = friendlyQuironError(err(msg));
    expect(fe.matched).toBe(true);
    expect(fe.text).toBe('El proveedor tardó demasiado. Inténtalo de nuevo.');
  });

  it('desconocido: conserva el mensaje crudo como fallback (útil con BYOK)', () => {
    const fe = friendlyQuironError(err('Algo raro del proveedor'));
    expect(fe.matched).toBe(false);
    expect(fe.text).toBe('No se pudo completar la respuesta: Algo raro del proveedor');
  });

  it('la red gana sobre longitud (ERR_CONTENT_LENGTH_MISMATCH es de red)', () => {
    const fe = friendlyQuironError(err('net::ERR_CONTENT_LENGTH_MISMATCH'));
    expect(fe.matched).toBe(true);
    expect(fe.text).toContain('no pudo contactar');
  });

  it('tolera un error sin message', () => {
    expect(friendlyQuironError(null).matched).toBe(false);
  });
});
