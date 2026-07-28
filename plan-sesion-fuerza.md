# Plan — nueva sesión de fuerza

> Llevar a la app el runner persistente y las ilustraciones validados en
> `sesion-fuerza-prototype.html` y `catalogo-ejercicios.html`.
> Estado: `pendiente` · `en curso` · `hecho`

## Qué se cambia y por qué

Hoy `renderSetsCard` ([training.js:309](js/ui/training.js#L309)) es **el único de los
once renderizadores de modo que no emite `timerBtnHtml()`** ([:305](js/ui/training.js#L305)).
Es decir: el modo `sets` —el núcleo del programa— es el único sin descanso ligado a la
serie. Las 758 líneas de `training-timer.js` (wake lock, beeps, pausa sin drift,
notificación por SW) sirven solo a HIIT, circuitos y Tabata.

El resultado medido en el prototipo: **~30-40 taps y 13 idas y vueltas** por sesión,
frente a **1 tap por serie** con el runner.

---

## Las tres restricciones que mandan sobre el diseño

Descubiertas leyendo el código, y son la razón de que el plan tenga la forma que tiene.

### 1. El borrador lee los inputs por índice

`saveDraft` ([:21](js/ui/training.js#L21)) hace
`$exerciseList.querySelectorAll('input')` y guarda un array posicional;
`restoreDraft` ([:65-66](js/ui/training.js#L65)) lo descarta entero si
`inputs.length !== draft.values.length`.

> **Los inputs del runner tienen que vivir FUERA de `$exerciseList`.**
> Si se meten dentro, se desplazan todos los índices y cada borrador guardado
> antes del despliegue se invalida en silencio.

### 2. El guardado busca en `document`, no en la tarjeta

`saveWorkout` ([:737](js/ui/training.js#L737)) usa
`document.querySelector('[data-ex="i"][data-set="s"][data-field="kg"]')`.

> **Los inputs del runner NO pueden llevar `data-ex` / `data-set` / `data-field`.**
> Duplicarlos haría que `querySelector` devolviese el del runner y no el de la
> tarjeta, y se guardaría el valor equivocado.

### 3. La `.sets-grid` sigue siendo la fuente de verdad

De 1 y 2 sale el modelo entero: el runner es una **capa de presentación** que escribe
de vuelta en el input real (`writeBack()` en el prototipo). Mientras el DOM de la grid
no cambie, `saveWorkout`, `startEdit` ([:663](js/ui/training.js#L663)), `saveDraft` y
`restoreDraft` no se enteran de nada y **no hay que tocarlos**. Eso es lo que baja el
coste de ~900 líneas a ~300.

---

## Fases

### F0 — Preparación de medios `pendiente`

Sin esto no hay imágenes que enseñar. Es independiente del resto y se puede enviar solo.

- [ ] Mover las ~100 WebP reestilizadas de `.eval/repdb-arete-full/` a
      `assets/exercises/`. Peso: **1,7 MB**.
- [ ] `js/exercise-media.js`: mapa nombre normalizado → asset, generado desde
      `.eval/match.json`. Incluye el normalizador (tildes, paréntesis, plurales
      ES e inglés tras sibilante) ya depurado en `tools/match-exercises.py`.
- [ ] Regla dura: **sin match fiable, no se dibuja nada**. Los 4 sin imagen
      (`Press Jabalina`, `Roll-out`, `Roll-out con Barra`, `Standups`) quedan vacíos.
- [ ] Atribución obligatoria de la licencia: «Exercise data by RepDB (repdb.co)»
      en Ajustes → Créditos.
- [ ] `sw.js`: añadir `assets/exercises/*` al precache **y subir `CACHE_NAME`**
      (hoy `arete-v108`, [sw.js:1](sw.js#L1)). Sin el bump, los clientes ya
      instalados no bajan nada.
- [ ] Decidir si 1,7 MB extra en el precache es aceptable, o si las imágenes van a
      caché diferida bajo demanda. **Recomendación:** precache; son 1,7 MB una vez y
      el gimnasio sin cobertura es el caso de uso real.
- [ ] Retirar los SVG de Everkinetic de `assets/exercises/` y su `ATRIBUCION.md`:
      quedaron obsoletos al elegir RepDB, y su CC BY-SA obliga a cosas que RepDB no.

**Riesgo:** los 26 movimientos de confianza «base» muestran la familia, no la variante
(«Dominada Prono» → dominada genérica). Revisar en `catalogo-ejercicios.html` y degradar
a "sin imagen" los que no convenzan, antes de mover nada.

---

### F1 — Descanso automático en fuerza `pendiente`

El cambio de mayor impacto por línea escrita. **Enviable solo**, sin runner.

- [ ] Exportar `startRestCountdown` ([training-timer.js:493](js/ui/training-timer.js#L493)),
      hoy privada del módulo, o añadir una `startSetRest()` hermana.
- [ ] `renderSetsCard`: emitir `data-rest` y una `.set-rest-zone` por ejercicio.
- [ ] `_markSetDone` ([:813](js/ui/training.js#L813)) invoca el descanso.
- [ ] Duración por cascada desde el `type` que el JSON ya trae:
      `main` 180 s · `assist` 90 s · kettlebell 60 s.
- [ ] `vibrate(100)` al marcar la serie.
- [ ] Wake lock: sale gratis, ya está implementado para HIIT ([:12](js/ui/training-timer.js#L12)).
- [ ] Todo detrás de un `if`, revertible.

---

### F2 — Runner persistente `pendiente`

La hoja no baja durante la sesión. Dos fases sobre un índice plano de series.

- [ ] Lista plana de series y máquina de estados `trabajo` ⇄ `descanso`
      (`showWork` / `showRest` / `markDone` / `finish` del prototipo).
- [ ] **El marcado del DOM va fuera de `$exerciseList`** — ver restricción 1.
- [ ] Generalizar `body.hiit-focus` → `body.session-focus`
      ([app.css:353-359](app.css#L353)) y reusar `.hiit-rest`, `.hiit-skip-btn`.
- [ ] Auto-avance al llegar a 0: es lo que da el **1 tap por serie**.
- [ ] `writeBack()` a los inputs reales en cada edición.
- [ ] «Ver sesión completa» baja la hoja y vuelve donde estaba.
- [ ] Entrada al runner desde la etiqueta de serie y desde un CTA de la sesión.
- [ ] Salida limpia: al terminar, la hoja baja y queda la lista para revisar y guardar.

**Casos que hay que resolver y no están en el prototipo:**

- [ ] **Edición de un entreno pasado** (`startEdit`): el runner no debe abrirse.
- [ ] **Restauración de borrador** con series ya marcadas: el runner debe arrancar
      en la primera serie pendiente, no en la primera.
- [ ] **Sesiones mixtas**: un plan puede combinar `sets` con HIIT. El runner solo
      gobierna los ejercicios en modo `sets`; al llegar a uno de otro modo, baja y
      cede el control al timer existente.
- [ ] **Interrupción**: cerrar la app a mitad. El borrador ya persiste valores y
      checks; el runner debe reconstruir su índice desde ahí.

---

### F3 — Ilustraciones en el runner `pendiente`

- [ ] Pictograma en fase de trabajo (168 px), lista (52 px) y cabecera de descanso (34 px).
- [ ] Flipbook de N fotogramas con `steps(1,end)`; `img:only-child` sin animación.
- [ ] `prefers-reduced-motion`: se queda en la pose inicial.
- [ ] Burpee: secuencia reconstruida de 4 fases (3 en «sin salto»).
      Ver `COMPUESTOS` en `tools/build-exercise-catalog.py`.
- [ ] `tips_es` de RepDB como nota técnica durante el descanso — hay 3 minutos muertos
      y el dato ya está descargado.

---

### F4 — Deuda descubierta por el camino `pendiente`

Bugs reales encontrados al leer el código para esto. Ninguno bloquea, todos son baratos.

- [ ] `_updateActiveSet` ([:827](js/ui/training.js#L827)) opera por `.sets-grid`, así
      que marca **una serie activa por ejercicio** — con 3 ejercicios hay 3 «activas»
      a la vez. Debe ser una en toda la sesión.
- [ ] `_setupExDots` ([:141](js/ui/training.js#L141)) acumula listeners en cada render.
- [ ] `.timer-bar` declara `z-index:50` **sin `position`** ([app.css:78](app.css#L78)),
      así que la propiedad no hace nada. Es inofensivo porque `.mini-timer` sí es
      sticky, pero es una línea que engaña al leerla.
- [ ] Contraste: `--text3` da **2,05:1** y `--text2` **2,85:1** sobre blanco; ambos
      fallan AA. Se usan en `.sets-header` y `.set-label`, que son texto funcional.
- [ ] `input.partial` ([app.css:312](app.css#L312)) es CSS muerto: la regla base pone
      `border:none` y gana.
- [ ] El peso anterior se muestra **tres veces**: `placeholder`, `value` y `.prev-data`.
- [ ] Doble mecanismo de «serie hecha»: el auto-marcado por blur
      ([:849-862](js/ui/training.js#L849)) no dispara en el camino por defecto, porque
      el prefill de [:314](js/ui/training.js#L314) marca `.prefilled`.

---

## Pruebas

Base actual: **209 tests en verde** (12 ficheros, `npx vitest run`).

- [ ] `training.test.js` y `training-timers.test.js` deben seguir pasando **sin
      modificarse**. Si hay que tocarlos, es señal de que el runner se ha metido en
      el DOM de la grid y viola la restricción 3.
- [ ] Test nuevo: `writeBack()` deja el input real con el valor correcto.
- [ ] Test nuevo: el normalizador de nombres resuelve las variantes reales
      (`Swing (KB)`, `Snatches (KB)`, `Sentadillas`, `Deadlift`).
- [ ] Test nuevo: sin match, `pict()` devuelve cadena vacía.
- [ ] Manual en móvil real: wake lock, vibración, sesión completa sin scroll,
      cerrar y reabrir a mitad.

## Orden sugerido

**F0 y F1 son independientes y cada una mejora sola.** F1 primero si quieres el
mayor impacto con el menor riesgo: arregla el defecto más grave —que la fuerza no
tenga descanso— sin tocar la estructura. F0 después. F2 es el grueso y conviene
que vaya sola en su rama. F3 depende de F0 y F2. F4 cuando apetezca.
