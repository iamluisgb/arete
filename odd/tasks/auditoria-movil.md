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

## Ronda 2 — Historial móvil (reporte del usuario: "las sesiones se salen de la cajita")

- [x] R2-1 Calendario del Historial: `.cal-chip` es inline-flex → text-overflow
      no aplica; contenido 58-61px en caja de 39/29px se corta a mitad de
      palabra sin ellipsis y cruza el borde del círculo punteado. Fix:
      envolver texto del chip en `<span class="cal-chip-txt">` (calendar.js
      chipsDia) + CSS ellipsis real con min-width:0.
- [x] R2-2 Detalle de sesión: botón "Compartir" truncado en la barra
      (99px>88 a 390; 90>71 a 320). Fix: por debajo de 400px, solo icono
      con aria-label (envolver texto en span en app.html:921).
- [x] R2-3 Lista: nombres largos de sesión parten la línea y dejan la chip
      de plan huérfana. Fix: `.hi-session` a 2 líneas con elipsis
      (-webkit-line-clamp).
- [x] R2-4 sw bump v154→v155; suite verde; verificación con probe
      (scrollWidth<=clientWidth del chip y del botón, ellipsis visible) y
      capturas antes/después.

Evidence commits / verificación:
- `670781e` fix(ui): keep history calendar chips and detail actions inside their boxes
  (calendar.js, app.css, app.html, sw v155, tests +2).
- Ajuste inline del parent: media query del share label de 399px → 433px (la fila de
  4 botones necesita ≥434px para icono+texto; 400-433 se quedaría corto).
- Suite: 807/807 (flake conocido de ui-polish UX-7 no apareció; aislado 13/13).
- gentle-ai-verify: PASS 4/4 en 390/320/412 — ellipsis real en chips, chip dentro
  del día, share label oculto y botón sin recortar, barra y documento sin desborde,
  clamp de .hi-session configurado, sin regla que reabra el label, media queries
  desktop/móvil disjuntas.

## Revisión nativa ronda 2

- review-036b91048ee3ac23: **APPROVED**, autoridad quemada (burn
  gentle-ai.review-acknowledged/v1). 3 findings informativos no bloqueantes:
  - R3-calchip-assertion-trivial WARNING tests/ui-polish.test.js:131-135
  - R3-hi-session-clamp-untested SUGGESTION app.css:952-956
  - R3-share-breakpoint-unproved WARNING tests/ui-polish.test.js:112-129
- Verificado en vivo además por gentle-ai-verify (390/320/412): ellipsis real,
  chip dentro del día, share solo-icono <434px, barra y documento sin desborde.

## Ronda 3 — Las series se salen de la cajita (reporte con captura del usuario)

- [x] R3-1 Diagnóstico: `.hi-rows` grid con col1 `minmax(0,max-content)` y
      `.hi-sets{white-space:nowrap}` SIN min-width/overflow → con datos reales
      (4-5 series tipo "18×10-12", nombres largos) el texto desbordaba la
      tarjeta y la pantalla: **scrollWidth 660 vs 390**. Las dos rondas de
      auditoría lo no pillaron: la semilla tenía series cortas.
- [x] R3-2 Fix: col1 → `minmax(0,45%)` (tope fijo; `fit-content(45%)`
      dentro de `minmax` es inválido — probado, Chrome tiraba la regla) +
      `.hi-sets` con `min-width:0; white-space:normal; overflow-wrap:anywhere`
      (las series envuelven en su 55%, nada se sale). sw v155→v156.
- [x] R3-3 Verificación con datos réplica del usuario (4 series ×4 ejercicios
      con rangos + Clean ×5 + nombre largo): doc 390/390 y 320/320,
      sin desborde sin controlar, layout lado-a-lado preservado, captura
      visual de la tarjeta larga correcta. Suite 807/807.

Evidence commits / revisión:
- `11b4eb4` fix(ui): keep exercise set lists inside history cards (app.css, sw v156, doc).
- Suite 807/807. Réplica de datos del usuario: doc scrollWidth == clientWidth
  en 390 y 320; captura visual de la tarjeta larga correcta (nombres con
  elipsis, series envueltas dentro de la columna 55%).
- Revisión nativa review-c8333f191cf54ef7: **APPROVED**, autoridad quemada.
  2 findings informativos: R3-cache-bump-coherence (sw.js:1),
  R3-grid-track-overflow (app.css:972).
