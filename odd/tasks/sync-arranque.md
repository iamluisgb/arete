# Sync de arranque — adopción y rapidez en cada entrada

Goal: que al entrar en la app (web o móvil) los datos de Drive aparezcan
solos y rápido. Síntoma confirmado por el usuario (2026-09-27): "aparecen al
navegar" — el pull funciona y fusiona, pero la UI de aterrizaje no se entera.

Fuente: scout de trazado 2026-09-27 (file:line en los hallazgos).

## Causa raíz (confirmada)

- Boot: `setTimeout(1.5s) → syncNow` (js/app.js:317) bajo
  `isAutoSync() && isConnected()` (app.js:297).
- `pullAndMerge` muta `db` en vivo + `saveDBRaw` (engine.js:178-185) pero
  **nadie re-renderiza**: `onSyncStatus` solo pinta el indicador de cabecera
  (app.js:289-290); `setOnExternalChange` solo dispara en eventos `storage`
  entre pestañas (nunca en la pestaña que escribe). La pantalla pintada al
  arrancar queda vieja hasta que una navegación re-renderiza.
- Contribuyentes: un solo intento de arranque (1.5s) sin reintentos (el
  siguiente es a 90s), y sin pull al recuperar foco en escritorio/PWA
  (visibilitychange existe; focus no).

## Alcance

- **S1 — Adopción (el fix)**: el motor emite un evento `pulled` cuando el
  merge del pull cambió datos (o al menos cuando el ciclo termina en ok).
  `app.js` se suscribe y re-renderiza: `renderDashboard(db)` +
  `refreshActiveSection(db)` (mismo patrón que el hook de Quirón,
  app.js:374). **Guard**: no re-renderizar si hay `.modal-overlay.open` /
  `.sheet.open` / runner abierto / borrador vivo (patrón isRunnerOpen ||
  getLiveDraft, app.js:376) — los datos quedan fusionados igual; la UI se
  pone al día en la siguiente navegación.
- **S2 — Reintentos de arranque**: sustituir el intento único por
  backoff [1.5s, 5s, 20s, 60s]; se corta en cuanto un ciclo devuelve ok.
  Los intentos solo corren con `canSync()`.
- **S3 — Pull al foco**: `window 'focus'` con cooldown (30s desde el último
  intento) para no encadenar refreshes de token al pinchar por escritorio;
  convive con el handler de visibilitychange ya existente.
- **S4 — Contrato honesto**: actualizar `docs/SYNC-V2.md` (la frase "la UI
  se entera sin recargar" solo era cierta para vistas diferidas; ahora lo es).
- **S5 — Tests**: (a) pull con datos cambiados → callback de re-render
  invocado; guard con overlay/runner/borrador lo omite; (b) agenda de
  arranque con fake timers: ok detiene los reintentos, error reintenta en
  la secuencia; (c) focus dispara con cooldown. Dónde: fichero nuevo
  `tests/sync-boot.test.js` (o extender sync-ux/engine si encaja mejor).
- **S6 — sw bump** v161→v162 (app.js/engine/drive precacheados — verificar
  ASSETS).

## Fuera de alcance

- Origen cruzado (`arete.raiatech.com` vs `arete-app.pages.dev` vs
  previews): si la app está totalmente vacía el camino es Ajustes → Conectar;
  redirección canónica = decisión de despliegue aparte.
- Cambios en semántica de merge (LWW+tombstones ya probados).
- Diagnóstico fino del porqué de cada ciclo fallido (el toast de
  reconexión ya existe).

## Evidencia de commits

- `4111e98` docs(odd): feature doc.
- `8e4578b` fix(sync): onPulled con huella (acumulada en 412) →
  applyPulledData con guard (runner/borrador/modal/sheet, storage ANTES de
  la señal), startInitialSync con backoff [1.5s,5s,20s,60s] (ok/off cortan),
  focus con cooldown 30s compartido, doc honesta, sw v162. +21 tests.
- Suite: 904/904 (53 ficheros).

## Evidencia de verificación

- gentle-ai-verify: PASS 9/9 — suite 904/904, diff limitado a 7 ficheros,
  cadena de señal completa (huella + acumulación 412 + fire fuera de finally
  sin re-entrada + saveRaw antes de la señal), no doble render del dashboard
  (nav.js:315), cross-tab intacto, agenda con semántica exacta y stop()
  cancelando timers, visibility sin cooldown (frecuencia no reducida) + focus
  aditivo, 21 tests con mocks importOriginal sin ocultar módulos reales, doc
  sin overclaim, sw solo v161→v162 con los 3 ficheros en ASSETS, sonda jsdom
  real de applyPulledData (guard=0 writes + storage intacta; sin guard=3).
- Observación informativa: un ciclo que mergea y luego falla no repinta hasta
  otro trigger (diseño declarado en SYNC-V2).

## Evidencia de verificación

(pendiente)
