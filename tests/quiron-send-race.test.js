// R3-001: el envío desde el composer espera a la transcripción en vuelo del motor
// de proveedor (segundos, con red). La espera es una sección exclusiva: un segundo
// click (o Enter) durante esa ventana no dispara su propio `send` — el turno sale
// una sola vez, con el texto completo dictado.
//
// Se prueba contra el app.html real (como quiron-demo y settings-ui): si alguien
// cambia el id del botón de enviar o del micro, el fallo sale aquí y no en producción.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');

function setupDOM() {
  window.scrollTo = () => {};
  const doc = new JSDOM(HTML).window.document;
  document.body.innerHTML = '';
  for (const id of ['setQuiron', 'quironPanel', 'quironHistoryModal']) {
    document.body.appendChild(doc.getElementById(id).cloneNode(true));
  }
  // initQuiron toca el rail de navegación y el índice de ajustes al repintar.
  document.body.insertAdjacentHTML('beforeend',
    '<button id="navQuiron"></button><span id="setQuironStatus"></span>');
}

const freshDB = () => ({
  workouts: [], bodyLogs: [], runningLogs: [], domainTests: [],
  customSessions: [], customPrograms: [], deletedIds: [], settings: {}, program: 'arete', phase: 1,
});

const tick = () => new Promise((r) => setTimeout(r, 0));

// Doble de MediaRecorder: `stop()` entrega el chunk y dispara `onstop`, como el navegador.
let recorders = [];
class FakeMediaRecorder {
  constructor(stream) { this.stream = stream; this.state = 'inactive'; recorders.push(this); }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(2000)], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

// Doble de fetch: la transcripción resuelve cuando el test lo decide (la red tarda);
// el chat posterior contesta 401 — aquí solo nos importa CUÁNTAS veces se llama.
function stubFetch() {
  const calls = [];
  let releaseTranscription;
  const transcription = new Promise((r) => { releaseTranscription = r; });
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/audio/transcriptions')) {
      await transcription;
      return { ok: true, status: 200, json: async () => ({ text: 'press banca 3x5' }) };
    }
    return {
      ok: false, status: 401,
      json: async () => ({ error: { message: 'invalid_api_key' } }),
      text: async () => JSON.stringify({ error: { message: 'invalid_api_key' } }),
    };
  }));
  return { calls, releaseTranscription };
}

async function boot() {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  localStorage.setItem('areteAiSttModel', 'whisper-1');
  localStorage.setItem('areteAiKey', 'test-key');   // transcribe exige key antes de fetch
  recorders = [];
  const { initToast } = await import('../js/ui/toast.js');
  document.body.insertAdjacentHTML('beforeend', '<div id="toastContainer"></div>');
  initToast();
  const { initQuiron } = await import('../js/ui/quiron.js');
  initQuiron(freshDB());
  return {
    mic: document.getElementById('quironMicBtn'),
    send: document.getElementById('quironSendBtn'),
    input: document.getElementById('quironInput'),
  };
}

beforeEach(() => {
  localStorage.clear();
  recorders = [];
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: async () => ({ getTracks: () => [] }) },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  recorders = [];
});

describe('envío desde el composer con dictado en vuelo (R3-001)', () => {
  it('un doble click durante la transcripción manda UN solo turno, con el texto dictado', async () => {
    const { mic, send, input } = await boot();
    const { calls, releaseTranscription } = stubFetch();

    mic.click();          // entra en grabación (motor de proveedor)
    await tick(); await tick();
    expect(recorders.length).toBe(1);
    expect(recorders[0].state).toBe('recording');

    send.click();         // para la grabación y espera la transcripción (segundos)
    send.click();         // el click de más cae EN la ventana de espera
    expect(calls.filter((u) => u.includes('/audio/transcriptions')).length).toBe(1);

    releaseTranscription();
    await tick(); await tick(); await tick();

    expect(calls.filter((u) => u.includes('/chat/completions')).length).toBe(1);
    expect(input.value).toBe('');           // el textarea quedó limpio: el turno salió
  });

  it('Enter durante la transcripción tampoco dispara un segundo turno', async () => {
    const { mic, send, input } = await boot();
    const { calls, releaseTranscription } = stubFetch();

    mic.click();
    await tick(); await tick();

    send.click();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(calls.filter((u) => u.includes('/audio/transcriptions')).length).toBe(1);

    releaseTranscription();
    await tick(); await tick(); await tick();

    expect(calls.filter((u) => u.includes('/chat/completions')).length).toBe(1);
    expect(input.value).toBe('');
  });

  it('Enter con el turno ya en marcha no rebota ni duplica (comportamiento previo intacto)', async () => {
    const { send, input } = await boot();
    const { calls, releaseTranscription } = stubFetch();
    releaseTranscription();

    input.value = 'cuéntame la sesión';
    send.click();
    await tick(); await tick();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick(); await tick();

    expect(calls.filter((u) => u.includes('/chat/completions')).length).toBe(1);
  });
});
