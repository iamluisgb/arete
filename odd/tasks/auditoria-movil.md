# Auditoría móvil — fixes visuales (P0 + quick wins)

Fuente: auditoría UX/UI móvil experta (2026-09-25) sobre capturas reales headless
(390×844@3x y 320×568@2x, app desplegada con db sembrada) + probe de overflow
DOM + lectura de código. Capturas baseline: /tmp/arete-visual/shots-before/.

## Objetivo

Eliminar los 4 defectos de layout que rompen la app en móvil y aplicar los
quick wins de 1 línea de la auditoría. Sin cambios de IA ni de scheduler.

## Tareas

- [x] P0-1 Calendario del Historial desborda (V/S/D cortadas): `.cal-grid`
      `repeat(7,1fr)` → `repeat(7,minmax(0,1fr))` (app.css:914). El resto de
      reglas (`.cal-day-sched`, `.cal-chip` con max-width:100% + ellipsis)
      empiezan a funcionar con tracks resolubles.
- [x] P0-2 Nav inferior no cabe a 320px (#navQuiron right 354 > 320; el nav
      arrastra 42px de scroll lateral): `nav button{min-width:0}` + ellipsis
      en el label + fallback `@media (max-width:359px)` con labels 11px.
- [x] P0-3 Ajustes: nombre de fila pintado encima del valor ("Programación"
      sobre "Fuerza L·X·V…"): `.listrow-main{overflow:hidden}` (~app.css:456).
- [x] P0-4 Fila atrasadas de la tarjeta Hoy mide ~401px rígida en ambos
      viewports (scrollWidth 396 vs 390): `.dash-sched-card{align-items:stretch}`
      (anula el `center` heredado de `.dash-card`, app.css:1734) +
      `.dash-sched-row{flex-wrap:wrap}` + `.dash-sched-overdue-link{white-space:normal}`.
- [x] P1-a Anillo azul de focus a pantalla completa en overlays
      (modal semana, Quirón): `[tabindex="-1"]:focus{outline:none}` global,
      conservando los `:focus-visible` existentes (app.css:203/286).
- [x] P1-b Scrim de modales demasiado débil (nav legible a través): subir alpha
      de `--color-scrim` (0.45→~0.6) o blur extra en `.sheet`/`.modal-overlay`.
- [x] P1-c Header sin safe-area superior: `header{padding-top:max(12px, env(safe-area-inset-top))}`.
- [x] P1-d Botones de navegación del calendario de 36px: `.cal-nav button{min-height:44px}`.
- [x] P1-e Quirón setup: dos botones primarios compiten; "Ir a Ajustes" →
      `.btn--secondary` (app.html:747-760).
- [x] P1-f Recargas silenciosas pierden estado (js/app.js:305 external-change,
      :521 controllerchange): no recargar si hay modal abierto o runner activo;
      aplazar hasta cerrar, con toast informativo.
- [x] Verificación: probe de overflow (scrollWidth == clientWidth en 390 y 320),
      re-captura de pantallas y comparación antes/después; suite completa verde;
      bump sw v153→v154.

## Fuera de alcance

- Rediseño del nav (iconos sin labels), scroll-snap del carrusel de actividad,
  unificación de z-index tokens, cambiar textos de nav. Quedan como follow-ups.

## Evidencia de commits

- `f0df96b` fix(ui): resolve mobile layout breaks found in visual audit (app.css, app.html, tests/ui-polish.test.js, sw v154)
- `9ebe587` fix(app): defer pending reload while a modal or set runner is open (js/app.js)
- Suite: 805/805 tras los commits. Probe inline: scrollWidth == clientWidth en 390 y 320; #navQuiron right 312 <= 320.

## Evidencia de verificación

- gentle-ai-verify: PASS 4/4 (2026-09-25). Suite 805/805; diff exacto vs 3b3b95a;
  cascada CSS correcta (.dash-sched-card línea 2839 gana a .dash-card 1743);
  rail-collapse sigue ocultando .nav-label; scheduleAppReload con guard de
  reentrada e interval limpiado (flag: polling sin tope si un modal queda
  abierto indefinidamente — aceptable, coste trivial);
  flag noting controllerchange no duplica reload.
  Probe vivo (localhost, HEAD local): scrollWidth == clientWidth en 390 y 320;
  #navQuiron right 382/312 <= viewport; .cal-grid right 354/284 <= viewport
  (P0-1 resuelto).

## Findings informativos de la revisión (review-8a876bc2c3066c73) — follow-ups

- R3-001 WARNING js/app.js:517-527 — scheduleAppReload polling
- R3-002 WARNING js/app.js:517-527 — scheduleAppReload polling
- R3-003 SUGGESTION js/app.js:538 — refreshing flag interaction
- R3-004 WARNING tests/ui-polish.test.js:85-110 — assertions de markup
- R3-005 SUGGESTION app.css:543-544 — scrim/sheet blur

## Envío

- PR #11 merged `00d2cac` (merge commit), deploy Cloudflare Pages completado,
  prod: build.json = 00d2cac, sw arete-v154.
- Probe en producción: sw==cw en 320 y 390; #navQuiron right 312/382;
  .cal-grid right 284/354. Sin overflow horizontal.
