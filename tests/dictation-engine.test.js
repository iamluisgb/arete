// D8: speechErrorMessage mapea los códigos del reconocedor (`no-speech`/`aborted` no
// son errores: devuelven '' para que el motor reintente en silencio) y el motor del
// navegador se REARRANCA solo mientras el usuario no haya parado (el navegador corta
// tras cada pausa, y en Android ignora `continuous`).
import { describe, it, expect, afterEach } from 'vitest';

const { speechErrorMessage, createDictation, speechSupported } = await import('../js/ai/dictation-engine.js');

// Doble del reconocedor: cuenta arranques y deja disparar los eventos al test.
let instances = [];
let starts = 0;
class FakeRecognition {
  constructor() { instances.push(this); }
  start() { starts++; }
  stop() { this.onend?.(); }
}

afterEach(() => {
  delete window.SpeechRecognition;
  instances = [];
  starts = 0;
});

describe('speechErrorMessage', () => {
  it('no-speech y aborted NO son errores: cadena vacía (se reintenta)', () => {
    expect(speechErrorMessage('no-speech')).toBe('');
    expect(speechErrorMessage('aborted')).toBe('');
  });

  it('not-allowed y service-not-allowed hablan de permiso', () => {
    expect(speechErrorMessage('not-allowed')).toMatch(/permiso/i);
    expect(speechErrorMessage('service-not-allowed')).toMatch(/permiso/i);
  });

  it('audio-capture y network tienen mensaje propio', () => {
    expect(speechErrorMessage('audio-capture')).toMatch(/micr/i);
    expect(speechErrorMessage('network')).toMatch(/conexi/i);
  });

  it('código desconocido: mensaje con el código, nunca silencio', () => {
    expect(speechErrorMessage('weird')).toContain('weird');
    expect(speechErrorMessage(undefined)).toContain('?');
  });
});

describe('createDictation (motor del navegador)', () => {
  it('sin SpeechRecognition devuelve null', () => {
    expect(speechSupported()).toBe(false);
    expect(createDictation({})).toBeNull();
  });

  it('rearranca solo tras un onend del navegador, y para de verdad al stop()', () => {
    window.SpeechRecognition = FakeRecognition;
    const ended = [];
    const d = createDictation({ onEnd: (t) => ended.push(t) });
    d.start();
    expect(starts).toBe(1);

    instances[0].onend();                    // el navegador corta por la pausa…
    expect(starts).toBe(2);                  // …y el motor vuelve a arrancar solo

    d.stop();                                // el usuario SÍ quiere parar
    expect(starts).toBe(2);                  // no hay rearranque
    expect(ended).toEqual(['']);
  });

  it('acumula lo final FUERA del reconocedor: los reinicios no borran lo dicho', () => {
    window.SpeechRecognition = FakeRecognition;
    const texts = [];
    const d = createDictation({ onText: (t) => texts.push(t) });
    d.start();
    const rec = instances[0];
    rec.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'hola' } }] });
    rec.onend();                             // pausa → rearranque (misma instancia, nuevo start)
    expect(starts).toBe(2);
    rec.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'mundo' } }] });
    expect(texts[texts.length - 1]).toBe('hola mundo ');
    d.stop();
  });

  it('un error fatal (not-allowed) para el motor y avisa con el mensaje', () => {
    window.SpeechRecognition = FakeRecognition;
    const errors = [];
    const d = createDictation({ onError: (msg, code) => errors.push({ msg, code }) });
    d.start();
    instances[0].onerror({ error: 'not-allowed' });
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toMatch(/permiso/i);
    expect(errors[0].code).toBe('not-allowed');
    d.stop();                                // no rearranca: wantsRunning ya está a false
    expect(starts).toBe(1);
  });

  it('no-speech no avisa: la pausa la gestiona onend reanudando', () => {
    window.SpeechRecognition = FakeRecognition;
    const errors = [];
    const d = createDictation({ onError: (msg) => errors.push(msg) });
    d.start();
    instances[0].onerror({ error: 'no-speech' });
    expect(errors).toHaveLength(0);
    d.stop();
  });
});

// Chrome Android repite en cada resultado final todo lo dicho en la sesión. Antes se
// sumaban todos y salía "hola hola probando hola probando nota…".
const { mergeResults } = await import('../js/ai/dictation-engine.js');
const res = (...items) => items.map(([text, isFinal]) => Object.assign([{ transcript: text }], { isFinal }));

describe('mergeResults', () => {
  it('Android: finales acumulativos no se repiten', () => {
    const r = res(['hola', true], ['hola probando', true], ['Hola probando nota de voz', true]);
    expect(mergeResults(r)).toEqual({ final: 'Hola probando nota de voz', interim: '' });
  });

  it('Android: el provisional que repite lo final solo aporta lo nuevo', () => {
    const r = res(['hola probando', true], ['hola probando nota', false]);
    expect(mergeResults(r)).toEqual({ final: 'hola probando', interim: 'nota' });
  });

  it('escritorio: frases distintas se juntan tal cual', () => {
    const r = res(['hola probando', true], ['nota de voz', true], ['y algo', false]);
    expect(mergeResults(r)).toEqual({ final: 'hola probando nota de voz', interim: 'y algo' });
  });
});

describe('createDictation con resultados de Android', () => {
  it('no duplica el texto ni entre eventos ni entre reinicios', () => {
    window.SpeechRecognition = FakeRecognition;
    const seen = [];
    const d = createDictation({ onText: (full) => seen.push(full) });
    d.start();
    const r = instances[0];
    r.onresult({ resultIndex: 0, results: res(['hola', true]) });
    r.onresult({ resultIndex: 0, results: res(['hola', true], ['hola probando', true]) });
    r.onend();                       // pausa: rearranca, la sesión nueva empieza vacía
    r.onresult({ resultIndex: 0, results: res(['nota de voz', true]) });
    expect(seen.at(-1)).toBe('hola probando nota de voz ');
    d.stop();
  });
});
