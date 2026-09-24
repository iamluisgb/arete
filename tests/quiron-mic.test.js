// D8: smoke de attachMic — estados idle/rec en clases y atributos, y comportamiento
// elegante cuando no hay ni SpeechRecognition ni modelo de proveedor (el botón existe
// en el DOM pero no rompe ni entra en grabación).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Cada test recarga el módulo: attachMic no lleva estado global, pero llm.js sí
// (localStorage leído al cargar) y así cada test parte limpio.
async function freshMic({ sttModel = '' } = {}) {
  vi.resetModules();
  localStorage.clear();
  if (sttModel) localStorage.setItem('areteAiSttModel', sttModel);
  return import('../js/ai/mic.js');
}

// Doble del reconocedor: stop() dispara onend sincrónicamente, como haría el navegador.
let recs = [];
class FakeRecognition {
  constructor() { recs.push(this); }
  start() { /* el navegador empezaría a escuchar */ }
  stop() { this.onend?.(); }
  say(text) { this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }); }
}

function setupDOM() {
  document.body.innerHTML = `
    <div class="quiron-inputbar">
      <textarea id="qInput"></textarea>
      <button id="qMic" aria-label="Dictar" title="Dictar"><span class="material-symbols-outlined">mic</span></button>
    </div>`;
  return {
    input: document.getElementById('qInput'),
    btn: document.getElementById('qMic'),
    bar: () => document.querySelector('.mic-bar'),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  delete window.SpeechRecognition;
  recs = [];
  vi.unstubAllGlobals();
});

describe('attachMic (smoke)', () => {
  it('sin SpeechRecognition y sin modelo: el click no rompe ni entra en grabación', async () => {
    const { attachMic } = await freshMic();
    const { input, btn } = setupDOM();
    attachMic({ input, btn, onError: () => {} });

    expect(() => btn.click()).not.toThrow();
    await tick();
    expect(input.classList.contains('is-recording')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.mic-bar').hidden).toBe(true);
  });

  it('idle → rec: la barra sustituye al textarea, el botón queda encendido', async () => {
    window.SpeechRecognition = FakeRecognition;
    const { attachMic } = await freshMic();
    const { input, btn, bar } = setupDOM();
    attachMic({ input, btn, onError: () => {} });

    btn.click();

    const b = bar();
    expect(b.hidden).toBe(false);
    expect(b.classList.contains('is-provider')).toBe(false);
    expect(input.classList.contains('is-recording')).toBe(true);
    expect(input.style.display).not.toBe('none');       // lo oculta el CSS, no el inline
    expect(btn.classList.contains('is-on')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Parar');
    expect(b.querySelectorAll('.mic-bar-level i')).toHaveLength(14);
  });

  it('rec → idle (parar): el texto dictado queda en el textarea y las clases vuelven', async () => {
    window.SpeechRecognition = FakeRecognition;
    const { attachMic } = await freshMic();
    const { input, btn, bar } = setupDOM();
    attachMic({ input, btn, onError: () => {} });

    btn.click();
    recs[0].say('cinco series de press banca');
    await btn.click();                                   // stop() es awaitable
    await tick();

    expect(input.value).toBe('cinco series de press banca ');
    expect(input.classList.contains('is-recording')).toBe(false);
    expect(bar().hidden).toBe(true);
    expect(btn.classList.contains('is-on')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('con modelo STT pero sin MediaRecorder: cae al motor del navegador sin romper', async () => {
    // jsdom no tiene MediaRecorder: recorderSupported() es false aunque haya modelo.
    window.SpeechRecognition = FakeRecognition;
    const { attachMic } = await freshMic({ sttModel: 'whisper-1' });
    const { input, btn, bar } = setupDOM();
    attachMic({ input, btn, onError: () => {} });

    btn.click();
    expect(bar().classList.contains('is-provider')).toBe(false);
    expect(input.classList.contains('is-recording')).toBe(true);
  });

  it('un error fatal del reconocedor apaga la grabación y avisa por onError', async () => {
    window.SpeechRecognition = FakeRecognition;
    const { attachMic } = await freshMic();
    const { input, btn, bar } = setupDOM();
    const errors = [];
    attachMic({ input, btn, onError: (msg, code) => errors.push({ msg, code }) });

    btn.click();
    recs[0].onerror({ error: 'not-allowed' });
    await tick();

    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('not-allowed');
    expect(input.classList.contains('is-recording')).toBe(false);
    expect(bar().hidden).toBe(true);
  });
});
