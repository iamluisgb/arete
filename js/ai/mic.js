// Dictado enganchado a un <textarea> + un botón, portado de bookreader. Nace de la barra
// del chat (escribirle al coach desde el móvil con el pulgar es el cuello de botella real),
// pero no sabe nada de quién lo usa: recibe los dos elementos y ya.
//
// Los motores y su porqué están en dictation-engine.js; aquí está la UI que los envuelve
// (barra de grabación, acumulado, papelera). Resumen: si hay modelo de transcripción
// configurado (BYOK) se graba con MediaRecorder y se transcribe al soltar — acierta mucho
// más con vocabulario de entrenamiento y NO se corta solo por silencio, que es el fallo nº1
// del dictado del navegador en móvil. Si no, se cae al reconocedor del navegador, que sí da
// texto en vivo. Sin ni lo uno ni lo otro, no hay botón.
//
// Adaptación a arete (D2): sin i18n —textos en castellano—, iconos como spans de
// material-symbols-outlined (aquí el botón lleva ICONO, no etiqueta de texto, así que
// `ui()` no pisa su span: solo titula y alterna clases/atributos).
import * as LLM from './llm.js';
import {
  speechSupported, createDictation, recorderSupported, createRecorder, DICTATION_LANG,
} from './dictation-engine.js';

export function micAvailable() { return speechSupported() || (LLM.hasStt() && recorderSupported()); }
function useProviderStt() { return LLM.hasStt() && recorderSupported(); }

// ---- barra de grabación (patrón WhatsApp) ------------------------------------
// Mientras grabas, el textarea se sustituye por una barra con punto latiendo, cronómetro y
// papelera. De WhatsApp se copia el chasis; el medidor de nivel es añadido nuestro y es lo
// que de verdad hace falta aquí: con el motor del proveedor no hay texto en vivo, así que sin
// nivel "te estoy oyendo" y "el micro está mudo" se ven exactamente igual — y no te enteras
// hasta 30 segundos después, cuando vuelve vacío.
function buildBar({ onCancel, onDone }) {
  const bar = document.createElement('div');
  bar.className = 'mic-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" class="mic-bar-cancel" title="Descartar" aria-label="Descartar">
      <span class="material-symbols-outlined" aria-hidden="true">delete</span>
    </button>
    <span class="mic-bar-dot" aria-hidden="true"></span>
    <span class="mic-bar-time" role="timer">0:00</span>
    <span class="mic-bar-level" aria-hidden="true">${'<i></i>'.repeat(14)}</span>
    <span class="mic-bar-hint" role="status">Escuchando…</span>
    <button type="button" class="mic-bar-stop" title="Parar" aria-label="Parar">
      <span class="material-symbols-outlined" aria-hidden="true">check</span>
    </button>`;
  bar.querySelector('.mic-bar-cancel').addEventListener('click', onCancel);
  bar.querySelector('.mic-bar-stop').addEventListener('click', onDone);
  return bar;
}

const mmss = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Nivel de entrada en [0..1] a partir del stream. Se usa RMS y no el pico: el pico se dispara
// con cualquier chasquido y el medidor parece vivo aunque no se te oiga.
// El medidor es un ADORNO: si falla, se graba igual. Por eso va entero en try/catch — sin él,
// un AudioContext que no arranca (Safari con la pestaña en segundo plano, un stream que el
// navegador no acepta como fuente) tiraba la excepción por onStream y se llevaba por delante
// la grabación completa: el micro se quedaba encendido y la promesa nunca resolvía.
function createMeter(stream) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  let ctx;
  let analyser, buf;
  try {
    ctx = new Ctx();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Uint8Array(analyser.fftSize);
  } catch (e) {
    try { ctx?.close(); } catch (e2) { /* ni llegó a abrirse */ }
    return null;
  }
  return {
    read: () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      // ×3.2 porque el habla normal a medio metro da un RMS de ~0,05–0,15: sin escalar, las
      // barras no se moverían y el medidor mentiría diciendo que no se te oye.
      return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
    },
    close: () => { try { ctx.close(); } catch (e) { /* ya cerrado */ } },
  };
}

// Añade el texto dictado SIN pisar lo que el usuario haya escrito a mano: la base se
// recalcula quitando solo lo último que escribimos nosotros, así una corrección manual
// sobrevive al siguiente resultado parcial del reconocedor.
export function makeAppender(input) {
  let last = '';
  return (text) => {
    const cur = input.value;
    const base = last && cur.endsWith(last) ? cur.slice(0, -last.length) : (cur ? cur + ' ' : '');
    input.value = base + text;
    last = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));   // que el composer se re-autoajuste
    input.scrollTop = input.scrollHeight;
  };
}

/**
 * Engancha el micro a un textarea.
 *
 * @param {object} o
 * @param {HTMLTextAreaElement} o.input  destino del texto dictado
 * @param {HTMLElement} o.btn            botón que alterna grabación (icono `mic`)
 * @param {() => string} [o.getPrompt]   vocabulario para sesgar la transcripción (programa
 *                                       activo, fase y ejercicios): sale gratis y arregla
 *                                       justo los nombres propios que Whisper se inventa
 * @param {(msg: string, code?: string) => void} [o.onError]
 * @returns {{ start: () => void, stop: () => Promise<void>, recording: () => boolean }}
 */
export function attachMic({ input, btn, getPrompt = () => '', onError = () => {} }) {
  let active = null;    // motor en marcha (null = parado)
  let done = null;      // promesa de la transcripción en vuelo (motor del proveedor)
  let discard = false;  // la papelera: parar SIN transcribir (ni gastar la llamada)
  let meter = null;
  let raf = 0;

  // Parar estaba SOLO en el botón del micro, que mientras grabas queda fuera de donde miras
  // (la barra sustituye al textarea) y sigue enseñando un icono de micro. La acción principal
  // vive en la propia barra, a la derecha, enfrente de la papelera. El botón del micro sigue
  // alternando: quien ya lo tenía aprendido no pierde nada.
  const bar = buildBar({ onCancel: () => { discard = true; stop(); }, onDone: () => stop() });
  input.parentNode?.insertBefore(bar, input);
  const timeEl = bar.querySelector('.mic-bar-time');
  const hintEl = bar.querySelector('.mic-bar-hint');
  const bars = [...bar.querySelectorAll('.mic-bar-level i')];

  // El cronómetro y el nivel van en el MISMO rAF: son la misma pregunta ("¿sigue vivo
  // esto?") y dos temporizadores desincronizados se notan.
  function startTicking() {
    const t0 = Date.now();
    const tick = () => {
      timeEl.textContent = mmss(Date.now() - t0);
      if (meter) {
        const lvl = meter.read();
        // Las barras se encienden de dentro afuera, como un vúmetro: cuántas se encienden es
        // el nivel, y que se muevan es la prueba de que entra audio.
        bars.forEach((el, i) => el.classList.toggle('on', lvl > (i + 1) / (bars.length + 1)));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopTicking() {
    cancelAnimationFrame(raf);
    raf = 0;
    meter?.close();
    meter = null;
    bars.forEach((el) => el.classList.remove('on'));
    timeEl.textContent = '0:00';
  }

  const ui = (state) => {
    const label = state === 'rec' ? 'Parar' : state === 'busy' ? 'Transcribiendo…' : 'Dictar';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', state === 'rec' ? 'true' : 'false');
    // En arete el botón lleva icono, no texto: el estado se marca con la clase, que lo pinta
    // en rojo mientras graba (grabando es grabando, aunque el acento sea de otro color).
    btn.classList.toggle('is-on', state === 'rec');
    btn.disabled = state === 'busy';
    // La barra sustituye al textarea mientras grabas (WhatsApp): el composer ya va justo de
    // alto en móvil y apilarla encima empujaba el chat.
    //
    // Y NO se va al soltar: con el motor del proveedor el texto tarda segundos en llegar
    // (se sube el audio y se transcribe), y si en ese hueco volvía el textarea vacío parecía
    // que el audio se había perdido. Se queda el mismo chasis con el punto convertido en
    // spinner.
    bar.hidden = state === 'idle';
    bar.classList.toggle('is-busy', state === 'busy');
    hintEl.textContent = state === 'busy' ? 'Transcribiendo…' : 'Escuchando…';
    input.classList.toggle('is-recording', state !== 'idle');
    if (state === 'rec') startTicking(); else stopTicking();
  };

  function startBrowser() {
    const append = makeAppender(input);
    const d = createDictation({
      lang: DICTATION_LANG,
      onText: append,
      onEnd: () => { active = null; ui('idle'); },
      onError: (msg, code) => { active = null; ui('idle'); onError(msg, code); },
    });
    if (!d) return null;
    d.start();
    return d;
  }

  function startProvider() {
    let resolveDone;
    done = new Promise((r) => { resolveDone = r; });
    const rec = createRecorder({
      onStream: (stream) => { meter = createMeter(stream); },
      onStop: async (blob) => {
        active = null;
        try {
          if (discard) return;                     // papelera: ni se envía ni se cobra
          if (!blob || blob.size < 1200) return;   // pulsación accidental: nada que enviar
          ui('busy');
          const text = await LLM.transcribe({ blob, prompt: getPrompt(), language: DICTATION_LANG });
          if (text) makeAppender(input)(text);
        } catch (e) {
          onError(e.message);
        } finally {
          ui('idle');
          resolveDone();
        }
      },
      onError: (msg) => { active = null; ui('idle'); onError(msg); resolveDone(); },
    });
    if (!rec) { resolveDone(); return null; }
    // `start` es asíncrono (pide permiso al usuario): si falla, su `onError` ya ha limpiado.
    rec.start().then((ok) => { if (!ok) { active = null; ui('idle'); resolveDone(); } });
    return rec;
  }

  // Con el motor del proveedor el texto llega DESPUÉS de soltar, así que quien vaya a leer el
  // textarea (enviar el mensaje) tiene que esperar a esta promesa o mandaría el turno sin el
  // último tramo dictado.
  function stop() {
    // Ya soltado y transcribiendo: `active` es null desde que paró el grabador, pero el
    // texto aún no ha llegado. Devolver aquí una promesa resuelta hacía que enviar leyera el
    // textarea todavía vacío y el turno se fuera sin lo dictado — o no se fuera nada, que es
    // lo mismo que ver desde fuera. Se espera a la transcripción en vuelo.
    if (!active) return done || Promise.resolve();
    const d = active;
    d.stop();
    if (!useProviderStt()) { active = null; return Promise.resolve(); }
    return done || Promise.resolve();
  }

  function start() {
    if (active) return;
    discard = false;
    const provider = useProviderStt();
    // Nivel y papelera solo tienen sentido con el motor del proveedor: el del navegador no da
    // stream que medir, y su texto ya está escrito en el textarea, así que "descartar" no
    // podría deshacer nada. Enseñar controles que no hacen lo que prometen es peor que no
    // enseñarlos.
    bar.classList.toggle('is-provider', provider);
    active = provider ? startProvider() : startBrowser();
    if (active) ui('rec');
  }

  btn.addEventListener('click', () => { if (active) stop(); else start(); });

  ui('idle');
  return { start, stop, recording: () => !!active };
}
