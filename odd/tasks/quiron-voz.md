# Quirón por voz — dictado en el chat

Port del dictado de bookreader (F3, nacido en Feynman y madurado en la barra del
chat) al chat de Quirón. Fuente: `bookreader/app/js/ai/dictation-engine.js` y
`bookreader/app/js/ai/mic.js`, con `transcribe` de `bookreader/app/js/ai/llm.js`.
Motivo: escribirle al coach con el pulgar en móvil es el cuello de botella real.

## Decisiones

- **D1 — Dos motores, igual que bookreader.** Navegador (`SpeechRecognition`,
  texto en vivo, se re-arranca solo mientras el usuario no haya parado) y
  proveedor (`MediaRecorder` + `POST /audio/transcriptions`, sin corte por
  silencio y sesable con prompt, texto al soltar). El proveedor solo entra si
  hay modelo STT configurado; si no, navegador; si tampoco, sin botón.
- **D2 — Módulos nuevos `js/ai/dictation-engine.js` y `js/ai/mic.js`.**
  Adaptados a arete: monolingüe (nada de i18n ni `t()`, textos en castellano) y
  dictado fijo en `es-ES` (v1, sin selector de idioma).
- **D3 — `llm.js`: slot STT + transcribir.** `getSttModel`/`setSttModel`
  (clave `areteAiSttModel`), `hasStt()`, y `transcribe({blob, prompt, language})`
  portado tal cual: FUERA de la cola (el usuario espera mirando), con
  `fetchRetrying` al mismo baseUrl, `extFor` y `apiErrMsg`.
- **D4 — Tercer slot de modelo en Ajustes** (subpágina `setQuiron`): input
  `quironSttModel` + cargar/guardar + probe de tipo `'stt'` (transcribe un WAV
  mínimo de silencio generado en JS y espera HTTP 200), coherente con la regla
  de arete: probar cada slot con una llamada de su tipo.
- **D5 — UI en el composer de Quirón.** Botón de micro en `quironInputBar`
  (material symbol `mic`) y `attachMic({ input, btn, getPrompt })`:
  `getPrompt` sesga la transcripción con vocabulario de entrenamiento (programa
  activo y ejercicios de la fase actual). Enviar (botón y Enter) espera a
  `mic.stop()` si estaba grabando, como en bookreader.
- **D6 — CSS** de la barra (chasis WhatsApp: punto latiendo, cronómetro,
  vúmetro de 14 barras, papelera, spinner en «Transcribiendo…») en `app.css`.
- **D7 — `sw.js`:** los dos módulos nuevos al `ASSETS` y `CACHE_NAME` a v149.
- **D8 — Tests (vitest/jsdom):** el appender no pisa ediciones manuales;
  `speechErrorMessage` mapea códigos (`no-speech`/`aborted` → `''`);
  `transcribe` con fetch mockeado (éxito y errores 401/404); smoke de
  `attachMic` (estados rec/busy/idle).

Fuera de alcance: cambiar el gateway (alias `arete-stt` es trabajo de otro
repo), voz como salida (TTS), selector de idioma de dictado.

## Tareas

- [ ] 1. `js/ai/dictation-engine.js` (motores, port fiel menos i18n/Storage).
- [ ] 2. `js/ai/mic.js` (barra + appender + attachMic, iconos material).
- [ ] 3. `llm.js`: slot STT + `transcribe` + probe `'stt'`.
- [ ] 4. Ajustes: campo `quironSttModel` en `app.html` + carga/guardado en `quiron.js`.
- [ ] 5. Composer: botón + wiring de envío esperando al dictado en vuelo.
- [ ] 6. CSS de la barra en `app.css`.
- [ ] 7. `sw.js`: ASSETS + v149.
- [ ] 8. Tests de D8 y `npm test` verde.

## Evidencia

(pendiente de ejecución; delegado a un writer con superficies acotadas.)
