// D8: el appender del dictado añade el texto SIN pisar lo que el atleta haya escrito
// a mano. La base se recalcula quitando solo lo último que escribió el micrófono, así
// que una corrección manual sobrevive al siguiente parcial del reconocedor.
import { describe, it, expect } from 'vitest';

const { makeAppender } = await import('../js/ai/mic.js');

function textarea(initial = '') {
  const el = document.createElement('textarea');
  el.value = initial;
  document.body.appendChild(el);
  return el;
}

describe('makeAppender', () => {
  it('escribe en un campo vacío', () => {
    const input = textarea();
    makeAppender(input)('hola');
    expect(input.value).toBe('hola');
  });

  it('añade tras texto escrito a mano, separado con un espacio', () => {
    const input = textarea('esto ya estaba');
    makeAppender(input)('y esto dictado');
    expect(input.value).toBe('esto ya estaba y esto dictado');
  });

  it('encadena parciales sobre lo último dictado, sin duplicar', () => {
    const input = textarea();
    const append = makeAppender(input);
    append('hola');
    append('hola qué tal');
    expect(input.value).toBe('hola qué tal');
  });

  it('una edición manual sobrevive al siguiente parcial', () => {
    const input = textarea();
    const append = makeAppender(input);
    append('hola');
    input.value = 'hola, oye';            // corrección manual (ya no acaba en `last`)
    append('hola qué tal');
    expect(input.value).toBe('hola, oye hola qué tal');
  });

  it('una edición manual al FINAL del dictado se conserva: solo se quita lo nuestro', () => {
    const input = textarea();
    const append = makeAppender(input);
    append('sentadilla');
    input.value = 'mis sentadilla';       // el usuario edita antes del texto dictado
    append('sentadilla 5 series');
    expect(input.value).toBe('mis sentadilla 5 series');
  });

  it('dispara el evento input (el composer se re-autoajusta)', () => {
    const input = textarea();
    let fired = 0;
    input.addEventListener('input', () => fired++);
    makeAppender(input)('hola');
    expect(fired).toBe(1);
  });
});
