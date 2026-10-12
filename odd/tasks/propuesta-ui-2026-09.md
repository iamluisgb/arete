# Feature: auditoría de estilo/UX y propuesta de UI (2026-09)

Goal: auditar estilo y UX/UI de la app con evidencia medida (no lectura de código
solamente), proponer un plan de mejora por rondas y entregar una demo HTML funcional
de la propuesta. **No se toca `app.html` ni `app.css`: nada de esta feature modifica
la app.** Los tres artefactos son documentos y un prototipo aislado.

## Entregables

- `auditoria-estilo-ux-2026-09.md` — auditoría (26 hallazgos con id, severidad y medición)
- `plan-mejora-ux-2026-09.md` — plan en 5 rondas + ronda 0 de bugs de producto
- `propuesta-ui-2026-09.html` — demo funcional de la propuesta (tokens reales de `app.css`)

## Tasks

- [x] T1: recorrido instrumentado de la app real — Chromium headless sobre
      `python3 -m http.server`, `app.html` con `localStorage.arete` sembrado desde
      `evals/fixtures/arete-hibrido.json`, 390×844 y 1440×900, claro y oscuro,
      service worker bloqueado. 22 capturas + 3 sondas automáticas.
- [x] T2: sondas — tipografía computada, objetivos táctiles, desbordes, contraste WCAG
      calculado con el alfa compuesto, clases y tokens muertos por comparación con
      `app.html` + `js/**`.
- [x] T3: auditoría escrita, con los hallazgos previos (F*, Q*, UX-*, DS-*, MA*)
      verificados uno a uno para no reportar lo ya cerrado.
- [x] T4: plan por rondas, con tamaño de revisión estimado por ronda y el corte
      declarado donde la ronda pasa de 400 líneas.
- [x] T5: demo funcional. Verificada: capas CSS parseando, 0 objetivos < 32 px,
      primer input de la captura sobre el pliegue (520 px de 772), tarjeta de
      onboarding con radio de tarjeta (350×538, `--radius-xl`), etiquetas del radar
      a 12 px reales con escala 1,000, PR estricto (2 PR + 3 «= récord» de 9 filas),
      y el `textarea` de Quirón sin desbordar (44/44).
- [x] T6: **AU-17 aplicado en la app** (pedido explícito del usuario tras ver el
      botón a ancho completo en el prototipo). La regla del ancho de la acción sube
      a la capa de sistema de `app.css` y empieza en 640 en lugar de 1024; se borran
      las tres excepciones locales (`#saveWorkoutBtn`, `.run-start-btn`,
      `.str-plan-start-btn`) y el ancla pasa a la clase `.btn--end`. Verificado:
      200 px a 1440, 200 px a 900 (antes 94 %) y ancho completo a 390. `915/915`
      tests. `sw.js` subido a `arete-v165` por el precache de `app.css`.
- [x] T7: AU-18 (segmentados que crecen con el viewport) corregido en el prototipo y
      **documentado como pendiente** en la app: a partir de 1024 su navegación
      secundaria es una columna, así que necesita su propia vuelta.
- [x] T8: el prototipo usa **el logo real de la app** en la cabecera y en la tarjeta de
      onboarding, con las mismas medidas que `app.html` (24 px, `--radius-xs`), más
      `favicon` y `apple-touch-icon` para que la pestaña también lo enseñe. Verificado:
      `naturalWidth/Height` 192×192, render 24×24 y `border-radius: 6px` en los tres
      casos (1440 claro, 390 claro, 390 oscuro), sin una sola respuesta HTTP ≥ 400.
      De paso salió AE-11: `assets/icons/icon.svg` es un asset huérfano con **otra**
      marca (barra con discos en cuadrado rojo) que no referencia nadie.
- [x] T10: **Ronda 0 aplicada en la app** — los dos bugs que le mentían al atleta en
      Progreso, más dos defectos que aparecieron al arreglarlos.
      `js/ui/progress.js`: la serie es (ejercicio, sesión del plan) en vez de todos los
      entrenos del programa, con eje X de fechas compartido y una leyenda que nombra cada
      línea; el récord es por variante y estricto, con un distintivo propio para la
      igualdad; la tabla gana la columna Sesión cuando hay más de una variante; y el delta
      de «Progreso» se mide sobre la serie principal (antes, con dos variantes, el «desde»
      y el «hasta» podían ser de variantes distintas: el fixture daba −5 kg cuando la
      sentadilla había subido +5). `app.css`: `.ph-pr` se rellenaba con
      `--color-accent-text`, que en oscuro son 3,16:1 con texto blanco — el AA de texto —
      y es el mismo fallo que el §1.3 ya había arreglado para el botón primario; ahora usa
      `--color-action-primary`. `tests/progress-chart.test.js`: 12 tests, **8 en rojo antes
      del arreglo**. Suite `927/927` (eran 915). `sw.js` a v166.
      Medido con el fixture de 94 entrenos: de 1 línea con 94 vértices a **2 series de 59
      y 35 puntos**; 42 PR estrictos y 31 «= récord» de 94 filas.
- [ ] Decisión del usuario, con el dato delante: el «= récord» sale en **33 % de las filas**;
      quitarlo es una línea y es lo que recomiendo. Y sigue abierto qué rondas se autorizan.
      **No hay commits**: el alcance entregado es documentación, un prototipo y estos dos
      ficheros de la app, y la política del repo es no commitear sin pedido explícito.
- [x] T9: **los nueve arreglos de sistema de la comparación con BookReader**, aplicados
      al prototipo y medidos uno por uno. Lo que más se movió: el tema oscuro pasó de
      430 ms de flash crema (y de quedarse claro con JS apagado) a 1 sola muestra a los
      22 ms ya en oscuro; el logo pasó de 1,02:1 a 2,9:1 en modo oscuro; los 14
      `env(safe-area-inset-*)` dejaron de ser inertes con `viewport-fit=cover`; y el
      bloque oscuro perdió 7 declaraciones duplicadas al derivarlas con `color-mix()`.
      Hallazgo nuevo en el camino, y la app tiene el mismo defecto: **el relleno del
      control activo es más oscuro que su pista en modo oscuro**, así que el
      segmentado activo se lee hundido en vez de elevado; se resuelve con
      `--color-surface-active`. Dos regresiones propias, corregidas en el acto: el
      estado de las filas desbordaba por encima del chevron al darle aire al nombre
      (AU-09 se arreglaba rompiendo otra cosa), y quedaba un `.dark` vivo en el JS.
      Los checks anteriores siguen en verde: primer input sobre el pliegue, PR
      estricto, 0 objetivos < 32 px, tarjeta de onboarding sin forma de círculo.

## Evidence

- Auditoría y plan: `auditoria-estilo-ux-2026-09.md`, `plan-mejora-ux-2026-09.md`.
- Prototipo: `propuesta-ui-2026-09.html`.
- **Cambio en la app (T6), sin commitear**: `app.css` (§3.1 regla del ancho +
  `.sheet-foot` ≥640 + se borran 3 excepciones locales), `app.html:245`,
  `js/ui/nav.js:149,221`, `sw.js` (v164 → v165). `npx vitest run` → 53 ficheros,
  915/915. Medición del ancho: 1440 px → 200/200/218; 900 px → 200/200/226
  (antes 528/528/520); 390 px → 318/318/350.
- `git status --short` muestra los 3 artefactos nuevos **más** los 4 ficheros del
  cambio T6 (`app.css`, `app.html`, `js/ui/nav.js`, `sw.js`). Nada más.
- Hallazgos que bloquean una ronda futura y son de producto, no de estilo:
  `js/ui/progress.js:226` (`isPR` por igualdad) y `js/ui/progress.js:118-132`
  (serie única mezclando las variantes A y B del plan).

## Nota de método

Los tres artefactos existen porque el usuario los pidió en ese orden. La ronda 0 del
plan (los dos bugs de Progreso) es la única que un tercero podría empezar sin más
preguntas; el resto de rondas necesitan las decisiones marcadas en el plan
(qué serie representa «la tendencia» en Progreso, qué captura el onboarding).
