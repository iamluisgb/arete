// Cliente LLM OpenAI-compatible con streaming (BYOK), portado de bookreader.
// Base URL, modelo y key son configurables (Ajustes → Quirón). Por defecto, nan.
// La key vive solo en el navegador (localStorage).
//
// Particularidades:
// - Reintentos con backoff ante 429/5xx transitorios, honrando Retry-After.
// - `chatAgent` (streaming + tools) es el camino del chat. La premisa heredada de
//   bookreader —"nan/DeepSeek solo emiten tool_calls fiables SIN streaming"— se volvió a
//   medir el 2026-08-07 contra deepseek-v4-flash y ya no se cumple: cinco tool_calls
//   simultáneas llegaron completas y con los argumentos parseables. `_chatToolsLoop` se
//   conserva sin streaming para quien no lo soporte, pero el chat no lo usa.

const DEFAULT_BASE_URL = 'https://api.nan.builders/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash';

// Demo sin API key, sobre el gateway compartido con bookreader (su repo: workers/gateway,
// ADR-021). El botón "Probar Quirón" pide un token self-service y autoconfigura los tres
// ajustes; el atleta no ve token ni URLs. Los alias son PROPIOS de arete: el gateway ata
// cada token a su producto, así que un token de arete solo puede usar `arete-*` —es lo
// que permite saber cuánto consume cada app— y `arete-vision` apunta a qwen3.6, el
// modelo con el que aquí está verificada la lectura de capturas.
const GATEWAY_BASE_URL = 'https://bookreader-gateway.luisgonzalezb93.workers.dev/v1';
const GATEWAY_MODEL = 'arete-fast';
const GATEWAY_VISION_MODEL = 'arete-vision';
// Tope de tokens de salida por respuesta. Si el proveedor corta por longitud
// (finish_reason 'length'), la UI ofrece "Continuar" (ver onDone).
const MAX_TOKENS = 4096;

// Presets para prefijar base URL + modelos sugeridos en la UI. El usuario puede
// escribir su propia base URL y su propio modelo (proveedor "custom" implícito).
// `concurrent` (opcional): el proveedor tolera peticiones simultáneas con la misma
// key. Se declara SOLO donde está verificado; sin declarar → se serializa, que es lo
// único seguro ante un BYOK desconocido. En nan lo midió bookreader (12/12 simultáneas
// correctas en dos medidas independientes, 2026-08-01 y 2026-08-02).
// Los ids de OpenRouter vienen corregidos de bookreader: los que había aquí
// (`claude-3.7-sonnet`, `gemini-2.0-flash-001`) ya no existen en su catálogo, así que
// el preset ofrecía modelos muertos.
export const PROVIDERS = [
  { id: 'nan',        name: 'nan',        baseUrl: 'https://api.nan.builders/v1',    models: ['deepseek-v4-flash', 'mimo-v2.5', 'qwen3.6', 'gemma4'], concurrent: true },
  { id: 'openai',     name: 'OpenAI',     baseUrl: 'https://api.openai.com/v1',      models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'], concurrent: true },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',   models: ['google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite', 'deepseek/deepseek-chat-v3.1', 'anthropic/claude-haiku-4.5'], concurrent: true },
  { id: 'groq',       name: 'Groq',       baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], concurrent: true },
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
export function setBaseUrl(u) {
  set('areteAiBaseUrl', ((u || '').trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''));
  // Salir de la demo tira su cupo: si no, volver a entrar enseñaría el porcentaje del
  // token anterior hasta la primera llamada.
  if (!isDemo()) localStorage.removeItem('areteAiDemoQuota');
}

/** Preset que coincide con la base URL actual, o null si es personalizada */
export function currentProvider() {
  const b = getBaseUrl();
  return PROVIDERS.find(p => p.baseUrl.replace(/\/+$/, '') === b) || null;
}

// ---- Demo del gateway ---------------------------------------------------------

/** ¿Está configurada la demo? (no es un preset de la lista y no tiene key que enseñar) */
export function isDemo() { return isGatewayUrl(getBaseUrl()); }

/** Igual, pero para una URL suelta: lo que hay ESCRITO en el formulario de Ajustes. */
export function isGatewayUrl(u) { return (u || '').trim().replace(/\/+$/, '') === GATEWAY_BASE_URL; }

// ---- Cupo de la demo ----------------------------------------------------------
// El gateway manda `X-Quota-Remaining` y `X-Quota-Total` en CADA respuesta, así que se
// leen en el único sitio por el que pasan todas las llamadas. Se enseña en PORCENTAJE:
// lo que cuesta un turno varía (una llamada, o dos si Quirón pide herramientas) y un
// contador que baja a saltos se lee como un timo. El TOTAL viene del servidor para que
// el porcentaje sobreviva a un navegador limpio.
const QUOTA_KEY = 'areteAiDemoQuota';

/** { remaining, total, pct } del cupo demo, o null si no estamos en la demo. */
export function getQuota() {
  let q = null;
  try { q = JSON.parse(localStorage.getItem(QUOTA_KEY) || 'null'); } catch { /* corrupto */ }
  if (!isDemo() || !q || !(q.total > 0)) return null;
  return { ...q, pct: Math.max(0, Math.min(100, Math.round(100 * q.remaining / q.total))) };
}

function saveQuota(remaining, total) {
  localStorage.setItem(QUOTA_KEY, JSON.stringify({ remaining, total }));
  window.dispatchEvent?.(new CustomEvent('llm:quota', { detail: getQuota() }));
}

function readQuota(res) {
  const remaining = Number(res.headers?.get?.('X-Quota-Remaining'));
  const total = Number(res.headers?.get?.('X-Quota-Total'));
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return;
  saveQuota(remaining, total);
}

// Pide un token demo y AUTOCONFIGURA proveedor, modelo y visión. Devuelve
// { token, remaining, model, product } y deja Ajustes listo: quien pulsa el botón
// quiere preguntarle a Quirón, no rellenar un formulario.
export async function requestDemoToken() {
  const res = await fetch(GATEWAY_BASE_URL.replace(/\/v1$/, '') + '/demo-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: 'arete' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
  setBaseUrl(GATEWAY_BASE_URL);
  setKey(body.token);
  setModel(body.model || GATEWAY_MODEL);
  setVisionModel(GATEWAY_VISION_MODEL);
  // El cupo ya se conoce al emitir: el medidor existe desde el primer momento en vez
  // de aparecer de golpe a mitad de la primera respuesta.
  const total = Number(body.quota ?? body.remaining);
  if (total > 0) saveQuota(Number(body.remaining), total);
  return body;
}

// ---- Demo automática ----------------------------------------------------------
// Un solo clic: quien abre Quirón sin clave escribe y envía; si no hay clave, la demo se
// pide sola en ese momento y el turno sigue. Es el `ensureKey` de bookreader.
//
// En el momento de USARLO, no al cargar: el gateway da una demo por red y día y tiene un
// disyuntor de emisión diaria, así que pedirla en cada visita gastaría el cupo para nada.
// Un fallo («esta red ya tuvo su demo hoy», disyuntor, red) se recuerda HASTA MAÑANA, o
// cada envío volvería a preguntar lo mismo al gateway.
const AUTO_FAIL_KEY = 'areteAiDemoAutoFailed';
let autoDemo = null;

// Un navegador automatizado (Playwright, un bot) no pide demos solo: cada test que abre
// Quirón sin clave gastaría una demo real del gateway de producción.
const autoAllowed = () => !navigator.webdriver || localStorage.getItem('areteAiDemoAutoWebdriver') === '1';

const today = () => new Date().toISOString().slice(0, 10);

/** Motivo por el que hoy no habrá demo automática ('' si no lo hay), o null si sí la habrá. */
export function autoDemoBlocked() {
  if (!autoAllowed()) return '';
  let failed = null;
  try { failed = JSON.parse(localStorage.getItem(AUTO_FAIL_KEY) || 'null'); } catch { /* corrupto */ }
  return failed && failed.day === today() ? (failed.error || '') : null;
}

/** Deja una clave puesta (la del atleta o una demo nueva). → { ok, auto, error } */
export function ensureKey() {
  if (hasKey()) return Promise.resolve({ ok: true, auto: false });
  const blocked = autoDemoBlocked();
  if (blocked !== null) return Promise.resolve({ ok: false, auto: false, error: blocked });
  // Dos envíos seguidos comparten UNA petición.
  if (!autoDemo) {
    autoDemo = requestDemoToken().then(
      (body) => {
        localStorage.removeItem(AUTO_FAIL_KEY);
        window.dispatchEvent?.(new CustomEvent('llm:demo-auto', { detail: body }));
        return { ok: true, auto: true };
      },
      (e) => {
        localStorage.setItem(AUTO_FAIL_KEY, JSON.stringify({ day: today(), error: e.message }));
        return { ok: false, auto: true, error: e.message };
      },
    ).finally(() => { autoDemo = null; });
  }
  return autoDemo;
}

// Reparación de un estado imposible: un token `br-…` es del gateway y solo vale ahí.
// Verlo junto a otra base URL significa que Ajustes lo movió de sitio (guardar con la
// demo activa y otro proveedor en el desplegable), y el síntoma es un 401 en todo con
// el atleta convencido de que la key de la demo nació rota. Se restaura la demo; quien
// pegue su propia key la pisa igual que siempre. Misma cura que en bookreader.
if (/^br-/i.test(getKey().trim()) && !isGatewayUrl(getBaseUrl())) {
  setBaseUrl(GATEWAY_BASE_URL);
  setModel(GATEWAY_MODEL);
  setVisionModel(GATEWAY_VISION_MODEL);
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
  if (isDemo()) return GATEWAY_VISION_MODEL;   // la demo también lee capturas
  return '';
}
export function hasVision() { return getVisionModel().length > 0; }

// Modelo de TRANSCRIPCIÓN (voz → texto, para dictarle por voz a Quirón). Sin valor
// por defecto por proveedor: el dictado por proveedor solo entra si el usuario
// configura uno (D1); si no, se cae al reconocedor del navegador.
export function getSttModel()  { return (get('areteAiSttModel', '') || '').trim(); }
export function setSttModel(m) { set('areteAiSttModel', (m || '').trim()); }
export function hasStt()       { return getSttModel().length > 0; }

// ---- Cola de llamadas: prioridad + serialización solo donde hace falta -------
// Antes se serializaban TODAS las llamadas con una cadena de promesas, por un límite
// de nan que ya no existe. Dos problemas, los mismos que arregló bookreader:
//   1. Era el límite de UN proveedor aplicado a todos.
//   2. Peor: el chat quedaba detrás de lo que estuviera generándose en ese momento
//      (un informe, un plan). El usuario pregunta y espera a que termine otra cosa.
// Ahora hay dos carriles. Lo interactivo (chat) adelanta a lo de fondo. No hay
// preempción: una llamada en vuelo se termina.
const INTERACTIVE = 0, BACKGROUND = 1;
const waiting = [[], []];
let running = 0;

function maxConcurrent() {
  const p = currentProvider();
  return p && p.concurrent ? 4 : 1;
}

function pump() {
  while (running < maxConcurrent()) {
    const next = waiting[INTERACTIVE].shift() || waiting[BACKGROUND].shift();
    if (!next) return;
    running++;
    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => { running--; pump(); });
  }
}

// Por defecto todo es interactivo: si alguien añade una ruta nueva y se olvida de
// marcarla, el fallo es que va rápida — no que el usuario se queda esperando.
function enqueue(task, background) {
  return new Promise((resolve, reject) => {
    waiting[background ? BACKGROUND : INTERACTIVE].push({ task, resolve, reject });
    pump();
  });
}

/** Estado de la cola (tests y diagnóstico). */
export function queueState() {
  return { running, interactive: waiting[INTERACTIVE].length, background: waiting[BACKGROUND].length };
}

export function chatStream(opts)    { return enqueue(() => _chatStream(opts), opts?.background); }
// ---- DSML: la llamada de herramienta escrita como TEXTO ----------------------
//
// deepseek-v4-flash (el modelo de la demo) tiene su propia sintaxis de tool-call. Cuando
// no puede usar el canal `tool_calls` —o decide no usarlo— la escribe en `content`:
//
//   <｜｜DSML｜｜ calls>
//   <｜｜DSML｜｜ invoke name="remember">
//   <｜｜DSML｜｜ parameter name="texto" string="true">…</｜｜DSML｜｜ parameter>
//   </｜｜DSML｜｜ invoke>
//   </｜｜DSML｜｜ calls>
//
// Se midió el 2026-10-26 contra producción: pasaba en la ronda final de una pregunta de
// principiante (18 marcas, 0 tool_calls), el atleta veía el markup en la burbuja y el
// turno acababa sin respuesta; además quedaba guardado en `areteQuiron` y se reenviaba
// al modelo en los turnos siguientes. La causa era quitar `tools` en la última ronda
// "para forzar el cierre": el modelo seguía queriendo llamar y se quedaba sin canal.
//
// Tres piezas, y las tres hacen falta:
//   1. `tools` viaja en TODAS las rondas (el cierre lo fuerza el presupuesto, no la
//      ausencia de herramientas).
//   2. `createDsmlFilter` lo retiene en streaming: ni un carácter llega a la burbuja,
//      ni siquiera cuando la marca viene partida entre dos chunks.
//   3. `parseDsmlCalls` la convierte en una llamada de verdad, se ejecuta y se abre una
//      ronda más para que el modelo conteste con el resultado dentro.
//
// Lo que no se puede hacer es pedirle al modelo que no la emita: con `tools` +
// `tool_choice: 'none'` la seguía escribiendo (medido). Por eso el filtro es del cliente.
const DSML_OPEN = '<｜｜DSML｜｜';
const DSML_CALLS_END = '</｜｜DSML｜｜ calls>';
const DSML_INVOKE = /<｜｜DSML｜｜\s*invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/｜｜DSML｜｜\s*invoke>/g;
const DSML_PARAM = /<｜｜DSML｜｜\s*parameter\s+name="([^"]+)"(?:\s+string="(true|false)")?\s*>([\s\S]*?)<\/｜｜DSML｜｜\s*parameter>/g;

/** Lo que ve el atleta si la llamada llegó ilegible: una frase, nunca el volcado. */
export const DSML_FALLBACK =
  'No he podido completar la consulta. Repítemela, o acótala un poco.';

// Instrucción de la última ronda: sin ella el modelo sigue pidiendo herramientas hasta
// agotar el presupuesto (y con `tool_choice: 'none'` a secas vuelve a escribir DSML).
// Medido contra la API real: con este empujón responde en prosa, con o sin `none`.
// Viaja solo en esa petición: no se guarda en la conversación.
export const LAST_ROUND_NUDGE =
  '[Sistema] Última vuelta: no llames a ninguna herramienta. Responde ya al atleta con lo que tengas, breve y en prosa.';

/** Convierte el markup DSML de un texto en llamadas { name, args }. [] si no hay. */
export function parseDsmlCalls(text) {
  const out = [];
  if (!text || !text.includes(DSML_OPEN)) return out;
  for (const m of text.matchAll(DSML_INVOKE)) {
    const args = {};
    for (const p of m[2].matchAll(DSML_PARAM)) {
      const [, name, isString, raw] = p;
      if (isString === 'false') {
        try { args[name] = JSON.parse(raw); } catch { args[name] = raw; }
      } else args[name] = raw;
    }
    out.push({ name: m[1], args });
  }
  return out;
}

/**
 * Filtro incremental: recibe los trozos de `content` y devuelve solo el texto que puede
 * verse. Un bloque DSML se descarta entero, y una marca a medias se retiene hasta saber
 * si lo es (si no, un `<` suelto se perdería o el markup se colaría por el corte).
 */
export function createDsmlFilter() {
  let buf = '';
  let inBlock = false;
  let saw = false;
  // Cuántos caracteres del final pueden ser el principio de la marca.
  const tail = (s) => {
    const max = Math.min(s.length, DSML_OPEN.length - 1);
    for (let k = max; k > 0; k--) if (s.endsWith(DSML_OPEN.slice(0, k))) return k;
    return 0;
  };
  return {
    push(chunk) {
      let out = '';
      buf += chunk || '';
      for (;;) {
        if (inBlock) {
          const i = buf.indexOf(DSML_CALLS_END);
          // Sin cierre todavía: se conserva la cola por si el cierre viene partido.
          if (i === -1) { buf = buf.slice(Math.max(0, buf.length - DSML_CALLS_END.length + 1)); return out; }
          buf = buf.slice(i + DSML_CALLS_END.length);
          inBlock = false;
          continue;
        }
        const i = buf.indexOf(DSML_OPEN);
        if (i === -1) {
          const keep = tail(buf);
          out += buf.slice(0, buf.length - keep);
          buf = buf.slice(buf.length - keep);
          return out;
        }
        out += buf.slice(0, i);
        buf = buf.slice(i + DSML_OPEN.length);
        inBlock = true;
        saw = true;
      }
    },
    /** Resto al cerrar el stream. Un bloque sin cerrar o una marca a medias se tiran. */
    flush() {
      const rest = inBlock || tail(buf) ? '' : buf;
      buf = '';
      inBlock = false;
      return rest;
    },
    get sawDsml() { return saw; },
  };
}

export function chatAgent(opts)     { return enqueue(() => _chatAgent(opts), opts?.background); }
// Sin uso en la app desde que el chat pasó a `chatAgent`. Se conserva a propósito: es el
// camino para un proveedor BYOK que no emita tool_calls fiables en streaming. Si algún día
// se retira, que sea por esa razón y no por parecer código muerto.
export function chatToolsLoop(opts) { return enqueue(() => _chatToolsLoop(opts), opts?.background); }
export function chatVision(opts)    { return enqueue(() => _chatVision(opts), opts?.background); }

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
      readQuota(res);
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
async function _chatStream({ messages, onToken, onReasoning, onDone, signal, maxTokens = MAX_TOKENS, model }) {
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
        // Modelos de razonamiento: el pensamiento viaja aparte y NO es la respuesta.
        if (delta.reasoning_content && onReasoning) onReasoning(delta.reasoning_content);
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

// ── Bucle de agente: STREAMING + tools en la misma llamada ───────────────────
//
// Es el camino del chat. Sustituye al protocolo de dos fases (recolección no-streaming
// que terminaba en "LISTO" + llamada aparte para la respuesta), que costaba 3 o 4
// llamadas por turno y dejaba al atleta 13-22 segundos mirando un "consultando tus
// datos…" sin un solo token. Aquí:
//
//   · si el snapshot basta, es UNA llamada y el texto empieza a salir a los ~3 s;
//   · si hacen falta datos, son DOS: la primera pide las herramientas, se ejecutan en
//     local (microsegundos) y la segunda streamea la respuesta con los resultados.
//
// Desaparece además la ronda que solo servía para confirmar que no había más que pedir.
//
// Sobre el texto que precede a una tool: algunos modelos escriben una frase antes de
// pedir la herramienta ("voy a mirar tu histórico"). Se streamea igual —informa mejor que
// un spinner— y cuando la ronda resulta llevar tool_calls se avisa con `onRoundReset`
// para que la UI lo descarte antes de pintar la respuesta de verdad.
//
// Devuelve { content, rounds, calls, truncated }.
async function _chatAgent({
  messages, tools, execute, maxRounds = 3, maxTokens = MAX_TOKENS, signal,
  onToken, onReasoning, onRoundReset, onTools, stopAfterTools, onDone,
}) {
  const key = getKey().trim();
  if (!key) throw new Error('Falta la API key. Configúrala en Ajustes → Quirón.');
  const convo = [...messages];
  const calls = [];
  // Presupuesto de rondas: el normal más las que se gasten recuperando una llamada que
  // llegó como texto DSML. Sin el extra, la recuperación se come la ronda de respuesta y
  // el turno acaba sin que el modelo haya contestado.
  let budget = maxRounds;
  const BUDGET_MAX = maxRounds + 2;
  let lastText = '';

  for (let round = 1; round <= budget; round++) {
    // Última ronda del presupuesto: se pide el cierre. Las herramientas siguen viajando
    // (el canal existe) pero con `tool_choice: 'none'` y el empujón en el mensaje, que es
    // lo que de verdad hace que conteste en vez de seguir explorando.
    const isLast = round === budget;
    const roundMessages = isLast ? [...convo, { role: 'user', content: LAST_ROUND_NUDGE }] : convo;
    const res = await fetchRetrying(`${getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getModel(), messages: roundMessages, stream: true, max_tokens: maxTokens,
        // Las herramientas viajan en TODAS las rondas. Quitarlas en la última "para forzar
        // el cierre" era justo lo que provocaba el markup DSML (ver el bloque de arriba):
        // el modelo seguía queriendo llamar y, sin canal, la escribía en `content`.
        ...(tools ? { tools, tool_choice: isLast ? 'none' : 'auto' } : {}),
      }),
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
    let buffer = '', text = '', clean = '', finishReason = null;
    // Los tool_calls llegan troceados: el nombre en un delta y los argumentos en varios,
    // identificados por `index`. Se acumulan y solo se parsean al cerrar el stream.
    const partial = new Map();
    // Nada de DSML llega a la burbuja, venga en el trozo que venga.
    const dsml = createDsmlFilter();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
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
          if (delta.reasoning_content && onReasoning) onReasoning(delta.reasoning_content);
          if (delta.content) {
            text += delta.content;
            const safe = dsml.push(delta.content);
            if (safe) { clean += safe; if (onToken) onToken(safe); }
          }
          for (const tc of (delta.tool_calls || [])) {
            const cur = partial.get(tc.index) || { id: '', name: '', args: '' };
            if (tc.id) cur.id += tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            partial.set(tc.index, cur);
          }
        }
      }
    }

    let toolCalls = [...partial.values()].filter(t => t.name);

    // La llamada llegó como TEXTO (DSML) en vez de por el canal de herramientas. Se
    // convierte, se ejecuta y se abre una ronda más para que el modelo conteste con el
    // resultado dentro. Si no hay ni una llamada legible, el atleta recibe una frase:
    // el markup no se pinta nunca.
    if (!toolCalls.length && dsml.sawDsml) {
      // En la última ronda ya no queda presupuesto para contestar con el resultado, así
      // que una llamada ahí no sirve de nada: se descarta igual que si fuera ilegible.
      const parsed = isLast ? [] : parseDsmlCalls(text);
      if (parsed.length) {
        toolCalls = parsed.map((c, i) => ({
          id: `call_dsml_${round}_${i}`, name: c.name, args: JSON.stringify(c.args ?? {}),
        }));
        budget = Math.min(budget + 1, BUDGET_MAX);
      } else {
        // Sin llamada utilizable: el markup se tira. Si quedó prosa, esa es la respuesta
        // (lo escrito antes del bloque cuenta); si no, una frase. Nunca el volcado.
        const prose = clean.trim();
        const out = prose || DSML_FALLBACK;
        if (onRoundReset) onRoundReset();
        if (onToken) onToken(out);
        if (onDone) onDone({ finishReason, truncated: false });
        return { content: out, rounds: round, calls, recovered: 'drop' };
      }
    }
    const rest = dsml.flush();
    if (rest) { clean += rest; if (onToken) onToken(rest); }
    lastText = clean;

    if (!toolCalls.length) {
      if (onDone) onDone({ finishReason, truncated: finishReason === 'length' });
      return { content: clean, rounds: round, calls, truncated: finishReason === 'length' };
    }

    // La ronda llevaba herramientas: lo escrito era preámbulo, no la respuesta.
    if (onRoundReset) onRoundReset();
    if (onTools) onTools(toolCalls.map(t => t.name));

    convo.push({
      role: 'assistant',
      content: clean || null,
      tool_calls: toolCalls.map((t, i) => ({
        id: t.id || `call_${round}_${i}`, type: 'function',
        function: { name: t.name, arguments: t.args || '{}' },
      })),
    });

    for (const [i, t] of toolCalls.entries()) {
      let args = {};
      try { args = JSON.parse(t.args || '{}'); } catch { /* args inválidos: la tool decide */ }
      let result;
      try { result = await execute(t.name, args); } catch (e) { result = 'ERROR: ' + e.message; }
      calls.push({ name: t.name, args });
      convo.push({
        role: 'tool', tool_call_id: t.id || `call_${round}_${i}`, name: t.name,
        content: String(result ?? ''),
      });
    }

    // Las herramientas de escritura terminan el turno en la tarjeta de confirmación:
    // seguir pidiendo una respuesta sería pagar una llamada para nada.
    if (stopAfterTools && stopAfterTools(calls)) return { content: '', rounds: round, calls, stopped: true };
  }

  // Se agotó el presupuesto pidiendo herramientas. Mejor el último texto limpio que una
  // burbuja vacía, y si no hubo ni eso, una frase: el turno nunca termina en blanco.
  const content = lastText || DSML_FALLBACK;
  if (!lastText && onToken) onToken(content);
  return { content, rounds: budget, calls, exhausted: true };
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

// TRANSCRIPCIÓN (voz → texto) contra `/audio/transcriptions`, formato OpenAI. Va
// FUERA de la cola: el usuario espera mirando la barra, y encolarlo detrás de una
// generación larga lo dejaría mirando «Transcribiendo…» un minuto.
//
// `prompt` es la pieza que justifica todo esto: el modelo lo usa para SESGAR el
// vocabulario, y Quirón lo tiene antes de que el atleta hable (programa activo y
// ejercicios de la fase actual, ver micPrompt en quiron.js).
export async function transcribe({ blob, prompt = '', language = '', signal } = {}) {
  const key = getKey().trim();
  if (!key) throw new Error('Falta la API key. Configúrala en Ajustes → Quirón.');
  const model = getSttModel();
  if (!model) throw new Error('No hay modelo de transcripción configurado. Configúralo en Ajustes → Quirón.');

  const form = new FormData();
  // El nombre importa: algunos proveedores deciden el formato por la extensión del fichero.
  form.append('file', blob, `audio.${extFor(blob.type)}`);
  form.append('model', model);
  if (prompt) form.append('prompt', prompt.slice(0, 900));   // el límite de Whisper son 224 tokens
  if (language) form.append('language', language);

  // Sin `Content-Type`: lo pone el navegador con el `boundary` del multipart.
  const res = await fetchRetrying(`${getBaseUrl()}/audio/transcriptions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form,
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('API key inválida (401).');
    if (res.status === 404) throw new Error('El proveedor no ofrece transcripción, o el modelo no existe.');
    throw new Error(`Error al transcribir (${res.status}). ${apiErrMsg(body)}`);
  }
  const json = await res.json().catch(() => ({}));
  return (json.text || '').trim();
}

function extFor(mime) {
  const m = String(mime || '');
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  return 'webm';
}

// ---- Probar un slot de modelo ----------------------------------------------
// Hay TRES slots (texto, visión y transcripción) y los tres son texto libre: un id mal
// escrito no se nota al guardar, se nota mucho después y en otro sitio. `hasVision()` solo
// mira que la cadena no esté vacía, así que un typo deja la ingesta por captura "activada"
// y fallando justo cuando el atleta le hace la foto a su entreno. Esto —traído de
// bookreader— convierte ese fallo diferido en una respuesta inmediata: se prueba cada
// slot con una llamada mínima DEL TIPO QUE LE CORRESPONDE.

// PNG de 1×1 transparente: la imagen más pequeña posible para comprobar que el modelo
// acepta contenido multimodal. Da igual qué conteste; lo que se prueba es que no
// rechace la forma de la petición.
const PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// WAV de silencio (PCM 16 bit mono). Vale para verificar el endpoint y el id del modelo:
// si transcribe a cadena vacía, es un éxito — lo que se prueba es que la llamada no revienta.
function silentWav(ms = 300, rate = 16000) {
  const n = Math.floor(rate * ms / 1000);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  return new Blob([buf], { type: 'audio/wav' });   // el cuerpo ya es todo ceros = silencio
}

// kind: 'text' | 'vision' | 'stt'. Devuelve { ok, ms }; lanza con un mensaje legible.
export async function probeModel({ kind = 'text', model, baseUrl, key, signal } = {}) {
  const b = (baseUrl != null ? baseUrl : getBaseUrl()).trim().replace(/\/+$/, '');
  const k = (key != null ? key : getKey()).trim();
  const m = String(model != null ? model : (kind === 'vision' ? getVisionModel() : kind === 'stt' ? getSttModel() : getModel())).trim();
  if (!b) throw new Error('Falta la Base URL.');
  if (!k) throw new Error('Falta la API key.');
  if (!m) throw new Error('Falta el id del modelo.');

  const t0 = Date.now();
  let res;
  try {
    if (kind === 'stt') {
      // El slot de voz se prueba transcribiendo un WAV mínimo de silencio: es la única
      // forma de saber que el endpoint existe y el id es de un modelo de transcripción.
      const form = new FormData();
      form.append('file', silentWav(), 'probe.wav');
      form.append('model', m);
      res = await fetch(`${b}/audio/transcriptions`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${k}` }, body: form, signal,
      });
    } else {
      const content = kind === 'vision'
        ? [{ type: 'text', text: 'ok?' }, { type: 'image_url', image_url: { url: PIXEL_PNG } }]
        : 'ok?';
      res = await fetch(`${b}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, messages: [{ role: 'user', content }], stream: false, max_tokens: 5 }),
        signal,
      });
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // "Failed to fetch" no le dice nada a nadie; casi siempre es CORS o la URL mal.
    throw new Error('No se pudo conectar (red o CORS). Comprueba la Base URL.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('API key inválida o sin permisos.');
  if (res.status === 404) throw new Error(`El proveedor no reconoce el modelo "${m}" (404).`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`El proveedor respondió ${res.status}. ${apiErrMsg(body)}`);
  }
  return { ok: true, ms: Date.now() - t0 };
}

/** Prueba del slot de texto. Se mantiene por nombre: es lo que llama la UI. */
export async function testConnection(opts = {}) {
  await probeModel({ ...opts, kind: 'text' });
  return true;
}
