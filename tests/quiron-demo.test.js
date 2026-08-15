// Demo sin API key de Quirón (gateway compartido con bookreader). Dos cosas que fija
// este spec, y las dos vienen de un fallo real en bookreader:
//
//  1. El token de la demo no se enseña ni se puede mover de sitio. Cuando se enseñaba,
//     guardar Ajustes lo mandaba al proveedor del desplegable y todo respondía 401
//     "API key inválida" — con el usuario convencido de que la clave nacía rota.
//  2. El producto viaja en la petición: el gateway ata cada token a su app, y sin
//     mandarlo emitiría uno de bookreader que aquí no sirve para nada.
//
// Se prueba contra el app.html real, como settings-ui.test.js: si alguien le cambia el
// id al botón, el fallo sale aquí y no en producción.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');
const GATEWAY = 'https://bookreader-gateway.luisgonzalezb93.workers.dev/v1';
const NAN = 'https://api.nan.builders/v1';

// El trozo de DOM que toca Quirón: su subpágina de Ajustes y el panel del chat.
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

async function cargar(ajustes = {}) {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  for (const [k, v] of Object.entries(ajustes)) localStorage.setItem(k, v);
  const [{ initQuiron }, LLM] = await Promise.all([
    import('../js/ui/quiron.js'),
    import('../js/ai/llm.js'),
  ]);
  initQuiron(freshDB());
  return LLM;
}

function stubDemoToken(respuesta = { token: 'br-demo-abc', remaining: 30, product: 'arete', model: 'arete-fast' }, status = 200) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return { ok: status < 400, status, json: async () => respuesta };
  }));
  return calls;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('Quirón · demo sin API key', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('el botón pide el token PARA ARETE y autoconfigura los tres slots', async () => {
    const LLM = await cargar();
    const calls = stubDemoToken();

    document.getElementById('quironDemoBtn').click();
    await vi.waitFor(() => expect(calls.length).toBe(1));

    expect(calls[0].url).toContain('/demo-token');
    expect(calls[0].body).toEqual({ product: 'arete' });
    await vi.waitFor(() => {
      expect(LLM.getKey()).toBe('br-demo-abc');
      expect(LLM.getBaseUrl()).toBe(GATEWAY);
      expect(LLM.getModel()).toBe('arete-fast');
      expect(LLM.getVisionModel()).toBe('arete-vision');   // las capturas también funcionan
      expect(LLM.isDemo()).toBe(true);
    });
  });

  it('activada la demo, el bloque desaparece y el chat deja de pedir configuración', async () => {
    await cargar();
    stubDemoToken();
    document.getElementById('quironDemoBtn').click();

    await vi.waitFor(() => {
      expect(document.getElementById('quironDemoPanel').hidden).toBe(true);
      expect(document.getElementById('quironDemoOn').hidden).toBe(false);
      expect(document.getElementById('quironSetup').hidden).toBe(true);
    });
  });

  it('si el gateway rechaza, lo dice y el botón sigue usable', async () => {
    const LLM = await cargar();
    stubDemoToken({ error: { message: 'No demo tokens left today.', code: 'demo_sold_out' } }, 429);
    const btn = document.getElementById('quironDemoBtn');
    btn.click();

    await vi.waitFor(() => {
      expect(document.getElementById('quironDemoStatus').textContent).toContain('No demo tokens left today');
    });
    expect(btn.disabled).toBe(false);
    expect(LLM.hasKey()).toBe(false);
  });

  it('el token de la demo no se enseña en el campo de clave', async () => {
    await cargar({ areteAiBaseUrl: GATEWAY, areteAiKey: 'br-demo-abc', areteAiModel: 'arete-fast' });
    expect(document.getElementById('quironKey').value).toBe('');
    expect(document.getElementById('quironDemoOn').hidden).toBe(false);
  });

  it('cambiar de proveedor sin pegar clave NO manda el token de la demo a nan', async () => {
    const LLM = await cargar({ areteAiBaseUrl: GATEWAY, areteAiKey: 'br-demo-abc', areteAiModel: 'arete-fast' });
    const prov = document.getElementById('quironProvider');
    prov.value = 'nan';
    prov.dispatchEvent(new Event('change'));

    expect(LLM.getBaseUrl()).toBe(GATEWAY);
    expect(LLM.getKey()).toBe('br-demo-abc');
    expect(document.getElementById('quironAiStatus').textContent).toContain('Sigues con la demo');
    expect(document.getElementById('quironBaseUrl').value).toBe(GATEWAY);
  });

  it('pegar una clave propia sí cambia de proveedor', async () => {
    const LLM = await cargar({ areteAiBaseUrl: GATEWAY, areteAiKey: 'br-demo-abc', areteAiModel: 'arete-fast' });
    const prov = document.getElementById('quironProvider');
    prov.value = 'nan';
    const key = document.getElementById('quironKey');
    key.value = 'sk-mia';
    prov.dispatchEvent(new Event('change'));

    expect(LLM.getBaseUrl()).toBe(NAN);
    expect(LLM.getKey()).toBe('sk-mia');
  });

  it('guardar otro campo con la demo puesta no borra el token', async () => {
    const LLM = await cargar({ areteAiBaseUrl: GATEWAY, areteAiKey: 'br-demo-abc', areteAiModel: 'arete-fast' });
    const modelo = document.getElementById('quironModel');
    modelo.value = 'arete-fast';
    modelo.dispatchEvent(new Event('change'));

    expect(LLM.getKey()).toBe('br-demo-abc');
    expect(LLM.isDemo()).toBe(true);
  });

  // Quien ya se quedó con el estado roto no puede arreglarlo desde la UI: no ve el
  // token que habría que borrar.
  it('un token del gateway con otra base URL se repara al cargar el módulo', async () => {
    const LLM = await cargar({ areteAiBaseUrl: NAN, areteAiKey: 'br-demo-abc', areteAiModel: 'deepseek-v4-flash' });
    expect(LLM.getBaseUrl()).toBe(GATEWAY);
    expect(LLM.getModel()).toBe('arete-fast');
    expect(LLM.isDemo()).toBe(true);
  });

  it('el índice de Ajustes dice que estás en la demo, no un alias sin sentido', async () => {
    await cargar({ areteAiBaseUrl: GATEWAY, areteAiKey: 'br-demo-abc', areteAiModel: 'arete-fast' });
    const { renderSettingsIndex } = await import('../js/ui/settings.js');
    renderSettingsIndex(freshDB());
    expect(document.getElementById('setQuironStatus').textContent).toBe('Demo · sin API key');
  });
});
