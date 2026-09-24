// D8: transcribe contra /audio/transcriptions con fetch mockeado — éxito y errores
// 401/404 — más el probe del slot de dictado (kind 'stt': transcribe un WAV de
// silencio generado en JS y espera HTTP 200).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Cada test recarga el módulo: las claves viven en localStorage y la reparación del
// token br- corre al cargar.
async function freshLLM(ajustes = {}) {
  vi.resetModules();
  localStorage.clear();
  const base = {
    areteAiKey: 'k-test',
    areteAiBaseUrl: 'https://api.nan.builders/v1',
    areteAiSttModel: 'whisper-1',
    ...ajustes,
  };
  for (const [k, v] of Object.entries(base)) localStorage.setItem(k, v);
  return import('../js/ai/llm.js');
}

const blob = () => new Blob(['audio-falso'], { type: 'audio/webm' });

afterEach(() => { vi.unstubAllGlobals(); });
beforeEach(() => { localStorage.clear(); });

describe('transcribe', () => {
  it('envía el multipart al endpoint correcto y devuelve el texto recortado', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push({ url, form: init.body });
      return { ok: true, status: 200, json: async () => ({ text: '  hola coach ' }) };
    }));
    const { transcribe } = await freshLLM();

    const text = await transcribe({ blob: blob(), prompt: 'Press de Banca', language: 'es-ES' });

    expect(text).toBe('hola coach');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.nan.builders/v1/audio/transcriptions');
    const form = calls[0].form;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('prompt')).toBe('Press de Banca');
    expect(form.get('language')).toBe('es-ES');
    // El nombre importa: algunos proveedores deciden el formato por la extensión.
    expect(form.get('file').name).toBe('audio.webm');
  });

  it('recorta el prompt al límite de Whisper (900 chars)', async () => {
    let sent = '';
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      sent = init.body.get('prompt');
      return { ok: true, status: 200, json: async () => ({ text: 'ok' }) };
    }));
    const { transcribe } = await freshLLM();
    await transcribe({ blob: blob(), prompt: 'x'.repeat(2000) });
    expect(sent).toHaveLength(900);
  });

  it('401: mensaje de API key inválida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => '' })));
    const { transcribe } = await freshLLM();
    await expect(transcribe({ blob: blob() })).rejects.toThrow('API key inválida (401).');
  });

  it('404: el proveedor no ofrece transcripción o el modelo no existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' })));
    const { transcribe } = await freshLLM();
    await expect(transcribe({ blob: blob() })).rejects.toThrow('El proveedor no ofrece transcripción, o el modelo no existe.');
  });

  it('sin modelo STT configurado falla ANTES de gastar la llamada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { transcribe } = await freshLLM({ areteAiSttModel: '' });
    await expect(transcribe({ blob: blob() })).rejects.toThrow('No hay modelo de transcripción');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("probeModel kind 'stt'", () => {
  it('prueba el slot transcribiendo un WAV de silencio y espera HTTP 200', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push({ url, form: init.body });
      return { ok: true, status: 200, json: async () => ({ text: '' }) };
    }));
    const { probeModel } = await freshLLM({ areteAiSttModel: '' });

    const out = await probeModel({ kind: 'stt', model: 'whisper-1' });

    expect(out.ok).toBe(true);
    expect(calls[0].url).toBe('https://api.nan.builders/v1/audio/transcriptions');
    expect(calls[0].form.get('model')).toBe('whisper-1');
    const file = calls[0].form.get('file');
    expect(file.name).toBe('probe.wav');
    // WAV de silencio: cabecera RIFF de 44 bytes y cuerpo todo a ceros (PCM 16 bit).
    // jsdom no da File.arrayBuffer(): se lee con FileReader.
    const buf = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsArrayBuffer(file);
    });
    const bytes = new Uint8Array(buf);
    expect(bytes.length).toBeGreaterThan(44);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(bytes.slice(44).every((b) => b === 0)).toBe(true);
  });

  it('sin modelo en el formulario: usa el valor guardado', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push(init.body.get('model'));
      return { ok: true, status: 200, json: async () => ({ text: '' }) };
    }));
    const { probeModel } = await freshLLM();   // areteAiSttModel: 'whisper-1'
    await probeModel({ kind: 'stt' });
    expect(calls[0]).toBe('whisper-1');
  });

  it('404 en el probe: el id no existe en el proveedor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' })));
    const { probeModel } = await freshLLM();
    await expect(probeModel({ kind: 'stt', model: 'no-existe' })).rejects.toThrow('no reconoce el modelo "no-existe" (404)');
  });
});
