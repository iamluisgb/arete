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

- [x] 1. `js/ai/dictation-engine.js` (motores, port fiel menos i18n/Storage).
- [x] 2. `js/ai/mic.js` (barra + appender + attachMic, iconos material).
- [x] 3. `llm.js`: slot STT + `transcribe` + probe `'stt'`.
- [x] 4. Ajustes: campo `quironSttModel` en `app.html` + carga/guardado en `quiron.js`.
- [x] 5. Composer: botón + wiring de envío esperando al dictado en vuelo.
- [x] 6. CSS de la barra en `app.css`.
- [x] 7. `sw.js`: ASSETS + v149.
- [x] 8. Tests de D8 y `npm test` verde.

## Evidencia

Implementado por writer delegado (gentle-ai-worker) y verificado de forma
independiente (gentle-ai-verify): PASS en las 4 comprobaciones.

- `npm test`: 48 ficheros, 745/745 verdes (28 nuevos).
- Diff: 13 ficheros, +1374/−24, dentro de las superficies declaradas;
  `tools.js`, `context.js`, `soul.js` y `evals/` intactos.
- Commits: `db8b62c` (motores+barra), `d3ac0c0` (slot STT+transcribe),
  `a29c8a2` (composer+ajustes), `25a2127` (sw v149), `a9c9bb2` (ODD),
  `c4cbb91` (informe competencia, viaja en la misma rama).
- Follow-up no bloqueante detectado por el verificador: race de doble click en
  enviar (el chequeo `busy` va antes del `await mic.stop()`); setear la flag
  antes del await lo cierra.
- Pendiente de humo manual en Chrome/Android: los motores son stubs en jsdom.
