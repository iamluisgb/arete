# Plan de mejora de estilo y UX/UI — Areté

**Fecha:** 2026-09-29 · **Origen:** `auditoria-estilo-ux-2026-09.md`
**Demo funcional de la propuesta:** `propuesta-ui-2026-09.html` (abrir con servidor local)

## Principios de intervención

Cinco reglas que este plan respeta y que conviene declarar antes que las rondas:

1. **No se rediseña el sistema, se cumple.** La capa de tokens se queda como está salvo los
   cuatro arreglos puntuales de la ronda 1. Nada de nuevos tokens sin justificar el hueco.
2. **La forma sigue a la decisión, no al revés.** Cada cambio de layout responde a una tarea
   concreta («ver si progreso», «empezar la sesión de hoy», «registrar una serie»). Si un cambio
   no acorta una decisión, no entra.
3. **Ninguna pantalla crece en scroll.** Es la métrica que más se degrada hoy y la más fácil de
   vigilar: se mide antes y después y se anota en la unidad de trabajo.
4. **Cada ronda es una unidad de revisión.** Un PR por ronda, con tests y docs en el mismo
   commit; ninguna ronda mezcla estética con lógica de dominio.
5. **Lo roto de verdad primero.** Hay dos bugs de producto (el PR siempre encendido y la gráfica
   mezclada) que no son de estilo y van antes que cualquier ajuste visual: mienten al atleta.

## Ronda 0 · los dos bugs que mienten (bloqueante, va primera)

| id | qué |
|---|---|
| AU-13 | `js/ui/progress.js:226` — `isPR` usaba `===`, no `>`, y el récord era único para todo el ejercicio, así que el 110 kg del día B borraba el del día A. Ahora es por variante, estricto, y la igualdad tiene su propio distintivo. |
| AU-12 | La serie es **(ejercicio, sesión del plan)**, no «todos los entrenos del programa»: el dato ya viajaba en `w.session`. Además el eje X pasó a ser **de fechas compartido** — escalando cada serie por su propio índice, dos variantes de semanas distintas se dibujarían una encima de la otra y la gráfica afirmaría que van en paralelo. El relleno de área queda solo con una serie: dos áreas apiladas dejan una debajo y convierten una variante en serie de segunda sin que nada lo diga. |
| AU-14 | La tabla gana la columna **Sesión** cuando hay más de una variante. Con el récord partido por variante, una fila con PR junto a otra al mismo peso y sin él son inexplicables si la tabla no dice de dónde viene cada una. |
| nuevo | El delta de «Progreso» se mide sobre la serie principal. Restando el primer y el último entreno del periodo, con dos variantes el «desde» podía ser un día A y el «hasta» un día B: en el fixture eso daba **−5 kg cuando la sentadilla había subido +5**. |
| nuevo | **`.ph-pr` se rellenaba con `--color-accent-text`**: en oscuro vale `#ff5545` y con el texto blanco encima son **3,16:1**, por debajo del AA de texto. Es exactamente el fallo que el §1.3 ya documentó y arregló una vez para el botón primario —el acento tipográfico no es un relleno— y había sobrevivido en la insignia que celebra un récord. Ahora usa `--color-action-primary`, con un test de contrato de fuente que lo fija. |

Por qué primero: mientras estas dos no se arreglen, Progreso demuestra lo contrario de lo que el
producto afirma (que el nivel sube). Es la pantalla con más valor declarado y la que hoy engaña.

**Estado: aplicado.** `js/ui/progress.js`, `app.css`, `sw.js` (v166) y
`tests/progress-chart.test.js` — 12 tests nuevos, **8 en rojo antes del arreglo**, suite
`927/927`. Medido con el fixture de 94 entrenos: la serie pasó de una sola línea con 94
vértices mezclando A y B a **dos series de 59 y 35 puntos**, cada una nombrada en una
leyenda. Tabla: 42 PR estrictos y 31 «= récord».

**Una decisión sigue abierta, ahora con dato.** El distintivo «= récord» aparece en **31 de 94
filas (33 %)**: en un plan que se estanca es más ruido que señal. El plan proponía «badge
distinto o nada»; los dos caminos están implementados y quitarlo es una línea (`p._eq = false`).
Con el dato delante, recomiendo quitarlo.

## Ronda 1 · higiene de estilo (bajo riesgo, alto retorno)

Todo verificado por lectura y medible sin criterio de diseño. Es la ronda más barata y la que
cierra la deuda que el `DESIGN_SYSTEM` ya declara como regla.

> **Estado de la ronda:** AU-17 ya está aplicado (era la queja concreta del usuario sobre el
> prototipo: un botón primario comiéndose el ancho). El resto sigue pendiente.

| id | qué | dónde |
|---|---|---|
| AE-01 | `--radius-pill` → `--radius-xl` en `.onboarding-card` | `app.css:1726` |
| AE-02 | Etiquetas del radar: `10.5` → `12` y sacarlas de un literal a un atributo por token (`--fs-2xs` no aplica en SVG; usar `font-size` en el `<text>` con el valor del escalón móvil y subirlo en el bloque ≥1024, o redondear a 12 que ya cumple en los dos) | `js/ui/profile.js:87` |
| AE-03 | Los tres usos textuales del terciario pasan a `--color-text-secondary`, **o** `--color-text-tertiary` sube a `.80`. Recomendación: subir el token a `.78` y volver a medir (el `.80` ya está ocupado por el secundario; `.78` daba 4,46 sobre `surface-2` en su día, pero estos usos viven sobre `surface-1` y `surface-0`, donde sí pasa) | `app.css:107`, `1088` |
| AE-04 | Cuatro hex → tokens. El rojo del micrófono merece token propio (`--color-mic-live`) o reusar `--color-state-danger`; el ámbar de cupo bajo es `--color-state-warning` | `app.css:1880,1972,1979,1982` |
| AE-05 | El icono del séptimo dominio pasa a un token semántico. Sin inventar color nuevo: reusar `--color-state-warning` (ya existe la wash) o subir el primitivo a un tono que pase 3:1 | `js/ui/profile.js` mapa de dominios |
| AE-06 | Borrar las 39 clases muertas **en dos pasos**: (a) borrar los restos de pantallas reescritas; (b) decidir explícitamente sobre las piezas del sistema sin uso (`.t-*`, `.badge--*`, `.toast-*`) — adoptarlas en las pantallas donde el sistema las prefiere o borrarlas. No dejarlas «por si acaso» | `app.css` |
| AE-07 | Borrar los 6 tokens muertos, o usarlos. `--measure-table` es un caso a resolver: o se aplica o se retira de la doc | `app.css` |
| AE-08 | Ajustes adopta `.sec-title` (versalitas), o el sistema declara `.group-title` como el título de bloque de nivel 2 y se documenta la distinción | `app.css:648`, `app.html:520,550,564,592,606` |
| AE-09 | Unificar foco: `:focus` → `:focus-visible` en campos, un solo anillo (el `outline` global) | `app.css:200,204` |
| AU-09 | Etiqueta `Programación semanal`: cota de ancho + `ellipsis` como `.hi-ex`, o permitir dos líneas sin partir palabra (`overflow-wrap: break-word` + `hyphens: auto`) | `app.css` `.listrow-name` |
| AU-15 | «1 ejercicios» → pluralización y unidad correcta («1 bloque · 3 rondas») | `js/ui/nav.js`, `training.js` |
| AU-17 | **Aplicado** — regla del ancho de la acción en la capa de sistema: `.btn--block` deja de estirarse desde 640, con `.btn--end` para el ancla. Se borran las tres excepciones locales a ≥1024 y se cierra la franja 640-1023 | `app.css` §3.1, `app.html:245`, `js/ui/nav.js:149,221`, `sw.js` (v165) |
| AU-18 | **Pendiente** — los segmentados (sub-nav de Entrenar) también crecen con el viewport: `width:fit-content` desde 640 | `app.css` `.subnav` |

**Cierre esperado:** cero literales fuera de `@layer tokens`, cero clases muertas, y la tabla de
contraste de `app.css:126-162` actualizada con la cifra nueva del terciario si cambia.

## Ronda 2 · Hoy y la captura (el camino diario)

Son las dos pantallas que el atleta abre todos los días: la primera para decidir, la segunda para
ejecutar.

### AU-02 · Hoy deja de reprochar

- Una **línea de estado** en lugar del titular rojo: «Al día · 2 sesiones esta semana» o
  «3 pendientes» con el conteo, sin adjetivo («atrasada» desaparece del vocabulario).
- La **sesión de hoy** arriba, con su «Empezar»; la cola detrás como **una fila plegable**
  («7 en cola ›») que se despliega solo si el atleta lo pide.
- El pie «Fuerza · Areté Fase I» y «Carrera · …» pasan de enlaces de 3 líneas a filas de 44 px.

### AU-08 · Objetivos táctiles

Los cinco objetivos de la tarjeta suben a ≥44 px de alto (el `×` a 44×44 con `aria-label`).

### AU-03 · La captura empieza por el campo

- **Una sola línea de contexto** cuando hay sesión en curso: modo + fase + sesión, en un control
  compacto de 44 px. Los dos primeros segmentados solo se despliegan en frío (sin sesión).
- El **banner de precarga** se reduce a una línea con una acción (`↺` reiniciar) en vez de un
  bloque de dos líneas con descarte.
- La **barra de descanso** se pliega a una barra fina con la cuenta atrás y el play; sus chips
  (1:00 / 2:00 / 3:00 / ✏) viven en la hoja que abre el `✏`.
- «Modo guiado» deja de ser un botón de ancho completo y pasa a ser un interruptor en la línea de
  contexto.

**Objetivo medible:** el primer input KG/REPS visible **sin scroll** en 390×844. Es el criterio de
aceptación de la ronda.

### AU-10 · Barra segmentada con leyenda

Verde / naranja / gris con etiqueta textual debajo («hecha · pendiente · resto») y `aria-label`
en el contenedor.

### AU-11 · Un solo nivel de pestañas

`Entrenar` en móvil: modo y plan/fase se fusionan en **una línea** (segmented de 2 + un select
combinado «Areté · Fase I»), y quedan las pestañas de contenido como único nivel. En escritorio
se mantiene el layout actual, que ya funciona.

## Ronda 3 · Historial y Progreso (la lectura del dato)

### AU-04 · Historial plegado por sesión

- Cada sesión es **una fila**: fecha · sesión · resumen (`6 ej. · 16 series · 4.820 kg`).
- Se despliega para ver los ejercicios, y las series se agrupan: **`3×5 @ 100 kg`** en vez de
  `100×5 · 100×5 · 100×5`. Cuando las series no son homogéneas, se listan (y solo entonces).
- `Dominada Supino 12` y `Plancha Lateral 1min` ganan su unidad: `12 reps`, `1 min`.
- Paginación real en lugar de «Ver 79 anteriores» (o `content-visibility: auto`, que aquí resuelve
  el coste sin tocar el modelo).

### AU-14 · explicar las dos métricas

Una línea bajo «1RM estimados»: «estimado con Epley sobre tu mejor serie (tope 12 reps); la
gráfica de abajo es el peso que levantaste». Sin eso, 128 arriba y 110 abajo se leen como una
pérdida.

### AE-10 · el nivel se ancla

`Nivel II de V` en el encabezado de Perfil (o `II · 2/5`), y el glifo se mantiene en las filas
donde ya lo acompaña el nombre del dominio.

### AE-02 · radar

Etiquetas legibles y el radar aprovechando el ancho disponible (hoy 282 px de 350 útiles en móvil).

## Ronda 4 · Quirón, Cuerpo y Ajustes

### AU-05 · Quirón

- El `textarea` crece con el contenido (una línea por defecto, hasta 3) — arregla el placeholder
  cortado y de paso deja sitio al dictado.
- La cabecera pasa a **título + un botón de desbordamiento** que despliega Informe / Memoria /
  Historial / Nueva. La acción de cerrar se queda siempre visible y separada.
- El título baja de peso: `QUIRÓN` es una cabecera de panel, no de portada.

### AU-06 · Cuerpo

- «Calorías estimadas» se reduce a **dos cifras primarias** (Mantenimiento y Definición) y un
  desplegable «Cómo se calcula» con TMB, ×1,65, +10-15 % y ×22/kg.
- El tile «SIN MEDIR / 9 medidas» deja de ser un tile: es un estado de la sección
  («9 medidas sin registrar — Registrar»).
- AU-07: fuera el `Editar` de cada fila; la fila abre la hoja de esa fecha.

### AU-16 / AU-01 · onboarding

- Radio `--radius-xl` (AE-01).
- **«Saltar»** siempre visible, y `areteOnboarded` se escribe también al saltar.
- El último paso captura algo de verdad: **peso corporal y altura** (los dos campos que hacen
  falta para que existan las métricas derivadas). Con eso, el primer perfil deja de ser
  `provisional` sin que el atleta tenga que buscar Ajustes.
- Decisión sobre `js/ui/wizard.js`: borrar o usar. Hoy está precacheado sin que lo importe nadie.

## Ronda 5 · lo que queda declarado, no hecho

No entra en este plan y conviene que quede escrito para que no se lea como olvido:

- **`F3` entreno sembrado a usuarios nuevos.** Es un problema de datos, no de UI, y merece su
  propia decisión de producto (¿se siembra un ejemplo o una base vacía con onboarding?).
- **`F13` doble mecanismo de «serie hecha» sin undo.** Requiere rehacer el modelo de interacción
  del runner; no se toca a las puertas de otra ronda.
- **`MA6` dos temporizadores de descanso.** Es deuda de arquitectura, no de estilo.
- **`D-5` `saveDB` síncrono**, **`F15` Leaflet**, **`MA8`** y **`F14`**: siguen fuera, con su
  documento.

## Ronda 6 · lo que BookReader hace y acá no (aplicado al prototipo)

Comparación pedida por el usuario contra `projects/bookreader` (8 hojas, 5.654 líneas, **sin un
solo `@layer`**). Los nueve están **aplicados en `propuesta-ui-2026-09.html` y medidos**; en la
app siguen pendientes. El detalle de cada medición está en los comentarios del prototipo.

| # | qué | antes (medido en Areté) | prototipo | app |
|---|---|---|---|---|
| 1 | Tema sin flash: `data-theme` lo escribe un script inline del `<head>` + `@media (prefers-color-scheme)` en CSS | 430 ms hasta `dark`, con la primera muestra ya en crema a 216 ms; sin JS, la app quedaba clara con el sistema en oscuro | 1 sola muestra, oscura a los 22 ms; sin JS también oscura | pendiente |
| 2 | `viewport-fit=cover` en el `<meta viewport>` | ausente, con 14 `env(safe-area-inset-*)` inertes | añadido | pendiente |
| 3 | Placa de la marca con token (`--logo-tile`) | logo a **1,02:1** contra `#201f1f` | canto a 2,9:1 | aplicado |
| 4 | `color-mix()` como motor de derivación | 1 uso en ~3.000 líneas; 7 lavados duplicados a mano por tema | 9 usos; el bloque oscuro pierde 7 declaraciones | pendiente |
| 5 | Sombras de dos capas + canal `--shadow-color` | `--shadow-1` y `--shadow-3` idénticas en claro y oscuro | dos capas y rampa oscura propia | pendiente |
| — | `--color-surface-active`: el relleno del control activo (hallazgo nuevo, la app lo tiene igual) | en oscuro el activo era **más oscuro** que su pista (#201f1f sobre #2a2a2a): se leía hundido | #353534 sobre #2a2a2a | pendiente |
| 6 | `--kb-inset` desde `visualViewport` | 0 referencias: en iOS el teclado tapa el campo de Quirón | publicado y consumido por el panel | pendiente |
| 7 | `overscroll-behavior` | 0 referencias: tirón = recarga desde la pestaña; carrusel = gesto «atrás» | `contain` / `none` | pendiente |
| 8 | `text-wrap` / `hyphens` | 0 referencias, y el síntoma era AU-09 | `balance` en títulos, `pretty` + guión en etiquetas | pendiente |
| 9 | Tooltips `[data-tip]` propios | 24 `title`, 0 `data-tip`: no existen en táctil ni con teclado | 8 aplicados en los solo-icono | pendiente |
| + | `color-scheme` global | solo parcheado en `:root.dark select/input/textarea`; la barra de scroll se quedaba clara en oscuro | `light`/`dark` por tema | pendiente |

**Dos regresiones que este pase introdujo y se corrigieron en el momento** (van escritas para que no
vuelvan): dar aire al nombre de fila hacía que el estado desbordara por encima del chevron
(«RunningM·J») — se arregla con `max-width` y envoltura en `.listrow-status`, no solo con
`hyphens`; y la duplicación del bloque oscuro es el precio de seguir al sistema sin JS
(`light-dark()` lo elimina, pero exige Safari 17.5+ y no se apuesta el tema entero a eso).

## Orden, tamaño y revisión

| ronda | alcance | ficheros | PR estimado |
|---|---|---|---|
| 0 | 2 bugs de Progreso | `js/ui/progress.js`, tests | ~150 líneas |
| 1 | higiene de estilo | `app.css`, `js/ui/profile.js`, `js/ui/nav.js` | ~200 líneas (casi todo borrado) |
| 2 | Hoy + captura | `app.html`, `app.css`, `js/ui/dashboard.js`, `training.js`, `nav.js` | ~400 líneas → **posible división en 2** (Hoy / captura) |
| 3 | Historial + Progreso | `js/ui/history.js`, `progress.js`, `app.css` | ~300 líneas |
| 4 | Quirón + Cuerpo + Ajustes + onboarding | `js/ui/quiron.js`, `body.js`, `app.js`, `app.css` | ~350 líneas → **dividir** en (Quirón) y (Cuerpo+Ajustes+onboarding) |

La ronda 2 y la 4 son las únicas que pueden pasar de 400 líneas; en ambas el corte natural ya está
dicho. Ninguna ronda toca el runner, la carrera en vivo ni la sincronización.

## Verificación común a todas las rondas

1. `npm test` verde (hoy 915/915) y un test nuevo **rojo antes** del arreglo por cada bug de la
   ronda 0 y por cada contrato de layout que se fije (altura del primer input, objetivos ≥44 px,
   ausencia de la palabra «atrasada», y un `.btn--block` que a 900 px no llegue al 50 % de su
   contenedor).

   Nota sobre AU-17: es un cambio de CSS sin test posible en jsdom (no hay layout). El contrato
   que sí se puede fijar es de fuente, en el estilo de `tests/ui-polish.test.js`: que
   `.btn--block{width:100%}` viva dentro de un `@media(max-width:639px)` o fuera de toda media
   query solo junto a la redefinición de 640, y que ninguna regla vuelva a declarar `width:auto`
   con `min-width` por componente. Sin eso, la deuda vuelve en la próxima pantalla migrada —
   que es exactamente lo que pasó aquí.
2. Captura antes/después en 390×844 y 1440×900, claro y oscuro, con el fixture de 94 entrenos —
   el mismo que usa esta auditoría, para que las cifras sean comparables.
3. Altura de documento por pantalla anotada en la unidad de trabajo. Criterio: **ninguna pantalla
   crece**; Historial y Progreso deben bajar.
4. Tabla de contraste de `app.css:126-162` actualizada si algún token cambia de valor.
5. Subir `CACHE_NAME` en `sw.js` y añadir a `ASSETS` cualquier fichero nuevo (el propio
   `DESIGN_SYSTEM.md` lo exige y es la causa número uno de «no veo el cambio»).
6. Repasar el checklist de cierre de pantalla de `DESIGN_SYSTEM.md` (sección final) antes de dar
   una ronda por cerrada, incluida la verificación con el service worker desregistrado.
