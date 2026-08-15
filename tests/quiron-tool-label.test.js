// Lo que se le enseña al atleta mientras corren las herramientas.
//
// Con el protocolo de dos fases la espera era ciega y daba igual qué pusiera; desde que el
// turno es una sola llamada streameada, este texto es lo único que se ve entre que el
// modelo pide una herramienta y que empieza a salir la respuesta. Merece contrato:
//
//  1. Una tool nueva sin etiqueta NO puede dejar el hueco en blanco ni imprimir su nombre
//     interno ("get_domain_profile") en la cara del atleta.
//  2. Dos herramientas que miran lo mismo no deben decirlo dos veces.
import { describe, it, expect } from 'vitest';
import { toolLabel } from '../js/ui/quiron.js';
import { QUIRON_TOOLS, QUIRON_WRITE_TOOLS } from '../js/ai/tools.js';

describe('toolLabel', () => {
  it('traduce una herramienta a lenguaje del atleta', () => {
    expect(toolLabel(['get_exercise_history'])).toBe('repasando tu histórico…');
  });

  it('encadena varias herramientas distintas', () => {
    const out = toolLabel(['get_runs', 'get_body_logs']);
    expect(out).toBe('repasando tus carreras · mirando tu peso y medidas…');
  });

  it('no repite la misma etiqueta dos veces', () => {
    const out = toolLabel(['get_workouts', 'get_workouts']);
    expect(out).toBe('repasando tus sesiones…');
  });

  it('cae a un texto genérico ante una tool desconocida, sin filtrar su nombre interno', () => {
    const out = toolLabel(['get_something_new']);
    expect(out).toBe('consultando tus datos…');
    expect(out).not.toContain('get_something_new');
  });

  it('sin herramientas devuelve el genérico en vez de una cadena vacía', () => {
    expect(toolLabel([])).toBe('consultando tus datos…');
    expect(toolLabel()).toBe('consultando tus datos…');
  });

  // El que de verdad protege: si mañana se añade una tool y se olvida su etiqueta, el
  // atleta vería "consultando tus datos…" donde el resto del turno le habla claro.
  it('toda herramienta declarada tiene etiqueta propia', () => {
    const sinEtiqueta = [...QUIRON_TOOLS, ...QUIRON_WRITE_TOOLS]
      .map(t => t.function.name)
      .filter(name => toolLabel([name]) === 'consultando tus datos…');
    expect(sinEtiqueta).toEqual([]);
  });
});
