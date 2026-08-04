// Cola de llamadas al LLM (js/ai/llm.js). Dos cosas que importan y no se ven:
// que un proveedor no verificado siga serializado (no podemos asumir que aguanta
// concurrencia) y que el chat adelante a lo que va en segundo plano.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Cada test recarga el módulo: la cola es estado global del módulo.
async function freshLLM(baseUrl) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('areteAiKey', 'k');
  localStorage.setItem('areteAiBaseUrl', baseUrl);
  localStorage.setItem('areteAiVisionModel', 'vision-model');
  return import('../js/ai/llm.js');
}

// fetch controlable: cada llamada queda colgada hasta que la soltamos a mano.
function deferredFetch() {
  const pending = [];
  const fetchMock = vi.fn(() => new Promise((resolve) => {
    pending.push(() => resolve({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    }));
  }));
  return { fetchMock, pending };
}

const tick = () => new Promise(r => setTimeout(r, 0));

afterEach(() => { vi.unstubAllGlobals(); });

describe('cola de llamadas', () => {
  beforeEach(() => { localStorage.clear(); });

  it('un proveedor verificado como concurrente deja varias en vuelo', async () => {
    const { fetchMock, pending } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    const LLM = await freshLLM('https://api.nan.builders/v1');

    const calls = [1, 2, 3].map(() => LLM.chatVision({ image: 'data:,', prompt: 'x' }));
    await tick();
    expect(LLM.queueState().running).toBe(3);

    pending.forEach(fn => fn());
    await Promise.all(calls);
    expect(LLM.queueState()).toEqual({ running: 0, interactive: 0, background: 0 });
  });

  it('un proveedor desconocido (BYOK) se serializa', async () => {
    const { fetchMock, pending } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    const LLM = await freshLLM('https://llm.mi-empresa.example/v1');

    const calls = [1, 2, 3].map(() => LLM.chatVision({ image: 'data:,', prompt: 'x' }));
    await tick();
    expect(LLM.queueState().running).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Soltar la primera destapa la segunda, no las dos.
    pending.shift()();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    while (pending.length) pending.shift()();
    await tick();
    while (pending.length) pending.shift()();
    await Promise.all(calls);
  });

  it('lo interactivo adelanta a lo de fondo', async () => {
    const { fetchMock, pending } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    const LLM = await freshLLM('https://llm.mi-empresa.example/v1');   // serializado: 1 en vuelo

    const first = LLM.chatVision({ image: 'data:,', prompt: 'ocupa-la-cola' });
    await tick();

    const bg = LLM.chatVision({ image: 'data:,', prompt: 'fondo', background: true });
    const fg = LLM.chatVision({ image: 'data:,', prompt: 'chat' });
    await tick();
    expect(LLM.queueState()).toMatchObject({ running: 1, interactive: 1, background: 1 });

    pending.shift()();      // termina la primera
    await tick();
    // La siguiente en salir es la interactiva, aunque la de fondo llegó antes.
    expect(fetchMock.mock.calls[1][1].body).toContain('chat');

    while (pending.length) { pending.shift()(); await tick(); }
    await Promise.all([first, fg, bg]);
  });
});
