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

(pendiente)

## Evidencia de verificación

(pendiente)
