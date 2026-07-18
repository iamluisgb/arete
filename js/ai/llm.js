// Cliente LLM OpenAI-compatible con streaming (BYOK), portado de bookreader.
// Base URL, modelo y key son configurables (Ajustes → Quirón). Por defecto, nan.
// La key vive solo en el navegador (localStorage).
//
// Particularidades heredadas (verificadas en bookreader):
// - nan rechaza peticiones concurrentes a la misma key → se serializan TODAS las llamadas.
// - nan/DeepSeek solo emiten tool_calls fiables SIN streaming → chatTools/chatToolsLoop no streamean.
// - Reintentos con backoff ante 429/5xx transitorios, honrando Retry-After.

const DEFAULT_BASE_URL = 'https://api.nan.builders/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash';
// Tope de tokens de salida por respuesta. Si el proveedor corta por longitud
// (finish_reason 'length'), la UI ofrece "Continuar" (ver onDone).
const MAX_TOKENS = 4096;

// Presets para prefijar base URL + modelos sugeridos en la UI. El usuario puede
// escribir su propia base URL y su propio modelo (proveedor "custom" implícito).
export const PROVIDERS = [
  { id: 'nan',        name: 'nan',        baseUrl: 'https://api.nan.builders/v1',    models: ['deepseek-v4-flash', 'mimo-v2.5', 'qwen3.6', 'gemma4'] },
  { id: 'openai',     name: 'OpenAI',     baseUrl: 'https://api.openai.com/v1',      models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'] },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',   models: ['deepseek/deepseek-chat', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.0-flash-001'] },
  { id: 'groq',       name: 'Groq',       baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
];

// Ajustes en localStorage, con claves propias (fuera de la db sincronizada a Drive).
const get = (k, d) => { const v = localStorage.getItem(k); return v == null ? d : v; };
const set = (k, v) => { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); };

export function getKey()     { return get('areteAiKey', ''); }
export function setKey(k)    { set('areteAiKey', (k || '').trim()); }
export function hasKey()     { return getKey().trim().length > 0; }
export function getModel()   { return get('areteAiModel', DEFAULT_MODEL) || DEFAULT_MODEL; }
export function setModel(m)  { set('areteAiModel', (m || '').trim() || DEFAULT_MODEL); }
export function getBaseUrl() { return (get('areteAiBaseUrl', DEFAULT_BASE_URL) || DEFAULT_BASE_URL).trim().replace(/\/+$/, ''); }
export function setBaseUrl(u) { set('areteAiBaseUrl', ((u || '').trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')); }

/** Preset que coincide con la base URL actual, o null si es personalizada */
export function currentProvider() {
  const b = getBaseUrl();
  return PROVIDERS.find(p => p.baseUrl.replace(/\/+$/, '') === b) || null;
}

// Modelo de VISIÓN (para ingesta de capturas, Fase 5.1). El modelo de texto por
// defecto (deepseek) no tiene visión; en nan usamos qwen3.6 (verificado). Resolución:
// ajuste explícito del usuario → qwen3.6 si el proveedor es nan → vacío (sin visión).
export function getVisionModelSetting() { return get('areteAiVisionModel', ''); }
export function setVisionModel(m) { set('areteAiVisionModel', (m || '').trim()); }
export function getVisionModel() {
  const explicit = getVisionModelSetting().trim();
  if (explicit) return explicit;
  if (currentProvider()?.id === 'nan') return 'qwen3.6';
  return '';
}
export function hasVision() { return getVisionModel().length > 0; }

// nan rechaza peticiones concurrentes a la misma key, así que serializamos
// TODAS las llamadas: cada una espera a que termine la anterior.
let lastCall = Promise.resolve();
function serialize(task) {
  const p = lastCall.then(task, task);
  lastCall = p.then(() => {}, () => {});
  return p;
}

export function chatStream(opts)    { return serialize(() => _chatStream(opts)); }
export function chatToolsLoop(opts) { return serialize(() => _chatToolsLoop(opts)); }
export function chatVision(opts)    { return serialize(() => _chatVision(opts)); }

// ---- Reintentos con backoff en errores transitorios --------------------------

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
export function isRetryableStatus(status) { return RETRYABLE_STATUS.has(status); }

/** Cabecera Retry-After: segundos (número) o fecha HTTP. Devuelve ms o null. */
export function parseRetryAfter(value) {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(value);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

/** Backoff exponencial con jitter, con techo. i = 0,1,2… → ~700, 1400, 2800 ms (+jitter). */
export function backoffDelay(i, rnd = Math.random) {
  return Math.min(700 * 2 ** i + rnd() * 300, 8000);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => {
      clearTimeout(t); reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

// fetch con reintentos. Reintenta ante red caída y estados retryables; honra Retry-After.
// Devuelve la respuesta final (aunque siga siendo error tras agotar). Respeta AbortSignal.
async function fetchRetrying(url, opts, { retries = 3 } = {}) {
  const signal = opts.signal;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const res = await fetch(url, opts);
      if (res.ok || !isRetryableStatus(res.status) || i === retries) return res;
      const wait = parseRetryAfter(res.headers.get('retry-after')) ?? backoffDelay(i);
      await sleep(wait, signal);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      if (i === retries) throw e;
      await sleep(backoffDelay(i), signal);
    }
  }
  throw lastErr;
}

/** Extrae el error.message de un body con forma OpenAI; si no, recorta el texto */
function apiErrMsg(bodyText) {
  try {
    const m = JSON.parse(bodyText)?.error?.message;
    if (m) return String(m).slice(0, 300);
  } catch { /* no era JSON */ }
  return String(bodyText || '').slice(0, 200);
}

// Streamea una respuesta de chat. onToken(text) por cada fragmento visible.
// Devuelve el texto completo. signal permite abortar.
async function _chatStream({ messages, onToken, onDone, signal, maxTokens = MAX_TOKENS, model }) {
  const key = getKey().trim();
  if (!key) throw new Error('Falta la API key. Configúrala en Ajustes → Quirón.');

  const res = await fetchRetrying(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || getModel(), messages, stream: true, max_tokens: maxTokens }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('API key inválida (401).');
    if (res.status === 429) throw new Error('Límite de uso alcanzado (429). Reintenta en un momento.');
    throw new Error(`Error del modelo (${res.status}). ${apiErrMsg(body)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let finishReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: eventos separados por \n\n, cada línea "data: {json}".
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        let json;
        try { json = JSON.parse(payload); } catch { continue; }
        const choice = json.choices?.[0] || {};
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta || {};
        if (delta.content) {
          full += delta.content;
          if (onToken) onToken(delta.content);
        }
      }
    }
  }
  if (onDone) onDone({ finishReason, truncated: finishReason === 'length' });
  return full;
}

// Bucle multi-turno de tool-use. No-streaming (nan/DeepSeek solo emiten tool_calls
// fiables sin streaming). En cada ronda el modelo puede pedir herramientas; ejecutamos
// execute(name, args) (async → string) y devolvemos el resultado como mensaje `tool`,
// hasta que deje de pedir herramientas o se agoten las rondas.
// Devuelve { content, rounds, calls, exhausted? }.
async function _chatToolsLoop({ messages, tools, execute, maxRounds = 4, maxTokens = MAX_TOKENS, signal, onRound }) {
  const key = getKey().trim();
  if (!key) throw new Error('Falta la API key. Configúrala en Ajustes → Quirón.');
  const convo = [...messages];
  const calls = [];
  for (let round = 1; round <= maxRounds; round++) {
    const res = await fetchRetrying(`${getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getModel(), messages: convo, tools,
        tool_choice: round < maxRounds ? 'auto' : 'none',   // última ronda: obliga a cerrar
        stream: false, max_tokens: maxTokens,
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401) throw new Error('API key inválida (401).');
      throw new Error(`Error del modelo (${res.status}). ${apiErrMsg(body)}`);
    }
    const msg = (await res.json()).choices?.[0]?.message || {};
    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) return { content: msg.content || '', rounds: round, calls };
    // El proveedor exige devolver el mensaje del asistente (con sus tool_calls)
    // antes que los resultados de herramienta.
    convo.push({ role: 'assistant', content: msg.content || null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* args inválidos */ }
      let result;
      try { result = await execute(tc.function?.name, args); } catch (e) { result = 'ERROR: ' + e.message; }
      calls.push({ name: tc.function?.name, args });
      if (onRound) onRound({ round, name: tc.function?.name, args });
      convo.push({ role: 'tool', tool_call_id: tc.id, name: tc.function?.name, content: String(result ?? '') });
    }
  }
  return { content: '', rounds: maxRounds, calls, exhausted: true };
}

// Llamada MULTIMODAL (texto + imagen) al modelo de visión. No-streaming: más simple y
// suficiente para extraer datos de una captura. `image` es un data: URI. Devuelve el texto.
async function _chatVision({ image, prompt, maxTokens = 2048, signal }) {
  const key = getKey().trim();
  if (!key) throw new Error('Falta la API key.');
  const model = getVisionModel();
  if (!model) throw new Error('No hay modelo de visión para este proveedor. Configúralo en Ajustes → Quirón.');
  const res = await fetchRetrying(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: false, max_tokens: maxTokens,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: image } },
      ] }],
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Error del modelo de visión (${res.status}). ${apiErrMsg(body)}`);
  }
  return (await res.json()).choices?.[0]?.message?.content || '';
}

// Prueba de conexión para Ajustes: una completion mínima sin streaming.
// Lanza con mensaje legible si algo falla.
export async function testConnection({ baseUrl, key, model, signal } = {}) {
  const b = (baseUrl != null ? baseUrl : getBaseUrl()).trim().replace(/\/+$/, '');
  const k = (key != null ? key : getKey()).trim();
  const m = (model != null ? model : getModel()).trim();
  if (!b) throw new Error('Falta la Base URL.');
  if (!k) throw new Error('Falta la API key.');
  if (!m) throw new Error('Falta el modelo.');
  let res;
  try {
    res = await fetch(`${b}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'ping' }], stream: false, max_tokens: 5 }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('No se pudo conectar (red o CORS). Comprueba la Base URL.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('API key inválida o sin permisos.');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`El proveedor respondió ${res.status}. ${apiErrMsg(body)}`);
  }
  return true;
}
