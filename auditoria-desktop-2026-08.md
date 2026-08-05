# Auditoría de escritorio — Areté

> **Estado: aplicado.** Todo el bloque de CSS (Q1–Q16) y los arreglos de JS J1, J2, J3, J7 y J10 están en `main`. Lo que queda abierto y por qué, en [§8](#8-qué-queda-abierto).

> Agosto 2026 · sobre `main` de `projects/arete` (rev. `7df3ff9`).
> Complementa a [`auditoria-ux-2026-08.md`](auditoria-ux-2026-08.md), que audita el eje móvil. Aquí no se repiten sus hallazgos: el eje de este documento es **qué pasa cuando Areté se abre en un monitor**.
> Método: `app.css` (1.202 líneas), `app.html` (891), `js/ui/*`, más recorrido en vivo con Playwright a 390 / 768 / 1024 / 1280 / 1512 / 1920 px sobre una base de datos sembrada (10 entrenos, 9 carreras, 6 medidas corporales) para ver las pantallas con contenido real y no con estados vacíos.
> Capturas en `/Users/lgb/workspace/.playwright-mcp/desk-*.png`.

---

## 0. Resumen del diagnóstico

Areté en escritorio no es una app mal adaptada: es una app **no adaptada**. Hay exactamente **un** breakpoint de layout en toda la hoja de estilos (`app.css:195`, `min-width:500px`) y lo único que hace es centrar la columna de teléfono. Medido a 1512×900:

| Medida | Valor |
| --- | --- |
| Ancho de la columna de contenido | **500 px** (`body{max-width:500px}`) |
| Superficie horizontal sin usar | **1.012 px = 67 %** |
| Distancia del FAB de Quirón al borde de la columna | **438 px** (a 1920 serían 642) |
| Tarjetas visibles en "Hoy" sin hacer scroll | **5**, y "Actividad reciente" queda tapada por la nav |
| Alto de "Más" en una sola columna | **2.329 px** de scroll |
| Alto de "Cuerpo" en una sola columna | **2.207 px** de scroll |
| Declaraciones `:hover` en `app.css` | **0** |
| Declaraciones `:focus-visible` | **2** |
| Declaraciones `:active` | **37** |
| Burbuja de chat de Quirón a 1512 px | hasta **1.330 px** de medida (~200 caracteres/línea) |

Los tres fallos de mayor coste, por orden:

1. **La navegación primaria es una barra de pulgar flotando a media pantalla.** Cinco pestañas de 56 px de alto ancladas abajo, centradas en 500 px, en un contexto donde el puntero está en el centro de la pantalla y hay 1.000 px de gris a los lados donde un rail lateral cabría sin robarle un solo píxel al contenido.
2. **La interfaz no responde al ratón.** Cero `:hover` en 1.202 líneas. Los 37 `:active` son el único feedback de estado, y `:active` con ratón dura lo que dura el clic: al pasar el puntero por encima de una tarjeta, un botón o una fila de ajustes, no pasa nada. La app se siente muerta antes de tocarla.
3. **Los overlays a pantalla completa no son diálogos de escritorio.** El `.set-runner` declara `aria-modal="true"` pero no atrapa el foco, no recibe el foco y **Escape no lo cierra** (verificado en vivo: con el runner abierto, `Tab` lleva el foco a los botones de la pantalla que hay *detrás*).

Hay una buena noticia estructural que condiciona todo el plan: **la nav ya es un `<flex>` de 5 botones con icono sobre etiqueta**. Convertirla en rail vertical es una regla de CSS, sin tocar `app.html` ni `nav.js`. La mayor decisión de layout de este informe es, a efectos de implementación, un quick win.

---

## 1. Diagnóstico por pantalla

### 1.1 Hoy (`#secDashboard`, `app.html:54-116`)

`desk-1512-hoy2.png`

- El bento es `grid-template-columns:1fr 1fr` fijo (`app.css:831`). En escritorio siguen siendo **dos** columnas de 234 px cuando caben cuatro anillos en una fila cómodamente. El resultado: 4 tarjetas ocupan dos filas de 155 px = 310 px de alto para 4 números.
- Con 900 px de viewport entran **5 bloques**: saludo, nivel, 2 filas del bento y racha. Los dos CTA quedan al borde y **"Actividad reciente" queda literalmente tapada por la nav fija**. La pantalla que debería resumir el estado del atleta no cabe en una pantalla de escritorio.
- `.dash-activity-scroll` (`app.css:846-847`) es un carrusel horizontal con scrollbar oculta. En móvil es correcto; en escritorio es un patrón sin affordance: no hay swipe, no hay flechas, y la barra está deliberadamente escondida. El usuario de ratón no tiene forma de saber que hay más tarjetas a la derecha.
- La tarjeta de nivel (`app.css:1195`, "un resumen que lleva al Perfil, no un segundo radar") es una decisión correcta en móvil que en escritorio deja de serlo: con 1.500 px hay sitio para el radar y para el resumen sin competir.

### 1.2 Entrenar / Fuerza (`#secStrength`, `app.html:122-197`)

`desk-1512-train.png`, `desk-1512-runner.png`

- **Actividad** en reposo: 640 px de contenido en un viewport de 900. Sobra alto *y* sobra ancho. La sub-nav de 4 pestañas (`.str-subnav`, `app.css:475`) es un segmented control de 460 px con 4 destinos — a 1024+ esas 4 vistas pueden convivir en dos columnas en vez de ocultarse entre sí.
- **Actividad con sesión iniciada**: aparece el timer, la fecha/sesión, los `.ex-dots` y las tarjetas de ejercicio apiladas. Los `.ex-dots` (`app.css:36-39`) son la navegación rápida entre ejercicios: **`<span>` de 8×8 px**, sin `tabindex`, sin `role`. En escritorio son el peor objetivo de clic de toda la app (WCAG 2.2 SC 2.5.8 pide 24×24) y no existen para el teclado. Con 1.000 px libres a la izquierda, la lista de ejercicios de la sesión pide a gritos ser un índice lateral persistente.
- `body{padding-bottom:84px}` (`app.css:6`) y `#saveWorkoutBtn{bottom:max(84px,…)}` (`app.css:35`) codifican a mano la altura de la nav inferior. En cuanto la nav pase a ser lateral en escritorio, ambas reservas se convierten en 84 px de aire fantasma al pie de todas las secciones. **Hay que tokenizar esa altura (`--nav-h`) antes de mover la nav**, o el rail dejará un artefacto en las 5 secciones.

### 1.3 Sesión de fuerza en curso — `.set-runner` (`js/ui/set-runner.js:118-135`)

`desk-1512-setrunner.png`

Esta es la pantalla mejor diseñada de la app y, a la vez, la que peor se comporta con teclado.

- **Layout**: correcto en su intención. Un ejercicio, un peso, unas reps, un botón. Pero a 900 px de alto quedan ~300 px muertos entre los campos y "Serie hecha", porque el bloque está pensado para un teléfono de 844 px con teclado virtual. Es un problema de centrado vertical, **no de reflow**: no hay que ensanchar nada aquí.
- **Foco**: `set-runner.js:126` pone `aria-modal="true"`, pero el trap de foco global (`js/app.js:465-478`) solo observa elementos con clase `.modal-overlay` **presentes en el DOM al cargar**. El runner se crea en runtime (`set-runner.js:123`) y no lleva esa clase → nunca se le aplica `trapFocus`. Verificado: con el runner abierto el `document.activeElement` sigue siendo `#startRunnerBtn` (el botón de debajo, ya invisible) y un `Tab` lleva el foco a `.set-label` de la lista que hay detrás del overlay.
- **Escape no funciona.** El handler existe (`set-runner.js:421-423`) pero está montado sobre `sheet`; como el foco nunca entra en `sheet`, el `keydown` jamás burbujea hasta él. Verificado en vivo: `Escape` deja el runner abierto.
- Consecuencia práctica en escritorio: no hay forma de completar una serie sin ratón, y no hay forma de salir sin ratón.

### 1.4 Entrenar / Fuerza · Historial (`js/ui/history.js`, `js/ui/calendar.js`)

`desk-1512-hist.png`

- El calendario mensual (`app.css:126`, `repeat(7,1fr)`) ocupa 460×480 px y **consume la pantalla entera**. La lista de sesiones del mes queda íntegramente bajo el pliegue: a 900 px de alto no se ve ni una.
- Al pulsar un día se abre un `.modal-overlay` (`app.css:155-157`). En escritorio es el antipatrón clásico: tapar el 100 % de una pantalla de 1512 px para mostrar el detalle de una sesión, cuando calendario y detalle caben lado a lado. **Es el caso de maestro-detalle más evidente de la app.**
- Detalle de forma: el `.modal` base conserva `border-radius:var(--radius-lg) var(--radius-lg) 0 0` y la animación `slideUp` incluso cuando `app.css:196` lo centra verticalmente. Resultado: una hoja inferior de móvil flotando en mitad de un monitor, con dos esquinas cuadradas abajo sin motivo. Solo `.detail-modal` y `.run-detail-modal` reciben el radio completo (`app.css:197`).

### 1.5 Entrenar / Fuerza · Progreso (`js/ui/progress.js`)

`desk-1512-prog.png`

- Estructura: selector de ejercicio → gráfica → 4 tiles de stats → historial completo del ejercicio. Cuatro bloques que en escritorio son dos columnas naturales (selector+historial | gráfica+stats), y hoy son 1.100 px de scroll.
- **Bloqueante para ensanchar**: la gráfica se genera como SVG con `viewBox="0 0 340 180"` y `style="width:100%;height:auto"` (`js/ui/progress.js:111`), y sus etiquetas están escritas en unidades de usuario: `font-size="9"`, `font-size="10"`, `stroke-width="2.5"`. Medido hoy, el SVG se pinta a 428 px = escala ×1,26. Si el contenedor pasa a 800 px, la escala es ×2,35 y esas etiquetas se renderizan a **21 px** con trazos de 5,9 px. **Ensanchar Progreso sin tocar `progress.js` produce una gráfica deformada.** Mismo patrón en `js/ui/running.js:1424`.
- El historial del ejercicio (`progress.js:135+`) es una lista de filas fecha · kg · reps · volumen · PR. Es una tabla; en escritorio debe verse como una tabla, con cabecera y alineación numérica a la derecha.

### 1.6 Entrenar / Carrera (`#secRunning`, `app.html:198-321`)

`desk-1512-run.png`

- Mismo problema de columna, pero con una particularidad de producto: **la acción principal de esta pantalla en escritorio es "Importar del reloj"**. El GPX/TCX vive en el PC, y exportar desde Garmin Connect o Strava es un flujo de escritorio. `js/ui/run-import.js` ya parsea GPX y TCX con `DOMParser`. Sin embargo la pantalla no ofrece **ninguna** affordance de escritorio: no hay zona de soltar, no hay drag & drop, solo un `<input type="file">` disfrazado de botón. Es el hueco donde el escritorio podría dar a Areté algo que el móvil no puede.
- El bloque "Objetivo semanal" tiene un anillo de 96 px y un texto instructivo ("Toca el engranaje…") con verbo táctil: en escritorio se **pulsa**, no se toca. Hay más literales con vocabulario de dedo repartidos por la app.
- Los `.run-prs-grid` y `.run-stats-grid` son `1fr 1fr` fijos (`app.css:529`, `565`): cuatro PRs en 2×2 cuando en escritorio caben en 1×4.

### 1.7 Carrera en vivo (`app.css:722`, `min-width:700px`)

**Es la única pantalla con un layout de escritorio real y está bien resuelta**: panel de datos de 380 px + mapa fluido, `max-width:1200px`, métricas que pasan de rejilla a lista etiquetada, botón de pausa de 56 px. No hay que rehacerla; hay que **extender su criterio** a las demás. Es la prueba de que el equipo ya sabe hacer esto: sencillamente no se ha hecho fuera de aquí.

Único apunte: al ser un overlay a pantalla completa fuera de la nav, comparte con el `.set-runner` la ausencia de trap de foco.

### 1.8 Perfil (`#secProfile`, `js/ui/profile.js`)

`desk-1512-hoy.png` (la app abre en Perfil por `areteLastTab`)

- **El radar de los 7 dominios —el argumento entero del producto— se dibuja en 292 px de ancho útiles.** `app.css:1114`: `.radar-wrap{max-width:360px;padding:0 34px}`. El SVG sí escala (`profile.js:31`, `CX 150 CY 150 R 92`, con `width:100%;height:auto` en `app.css:1115`), así que el techo es puramente el `max-width`. En un monitor de 1512 px, la pieza que justifica que Areté no sea un tracker es un sello de correos.
- La lista de 7 dominios es una columna de 7 filas de 64 px = 448 px, más el bloque de "siguiente test", más dos notas al pie. Total: 1.335 px de scroll para 7 datos. En escritorio: radar grande a la izquierda, los 7 dominios a la derecha, todo en una pantalla, y el "limitante" señalado visualmente en ambos a la vez. Es el mayor salto cualitativo disponible con puro CSS.

### 1.9 Cuerpo (`#secBody`, `js/ui/body.js`)

`desk-1512-body.png` — **la pantalla peor adaptada de todas.**

- 11 campos de medida, uno por fila, con la etiqueta pegada al borde izquierdo y el input de 74 px pegado al derecho. A 1512 px eso deja **~370 px de vacío entre una etiqueta y el campo al que pertenece**. Es una ruptura de proximidad de manual: el ojo tiene que recorrer un tercio de la pantalla para emparejar "CINTURA" con su casilla, y la asociación se pierde con dos filas seguidas.
- El formulario entero mide 660 px de alto para 11 números que caben en una rejilla de 3×4 en 240 px.
- La sección completa son **2.207 px de scroll**: medidas + proporciones + altura/edad + 5 tarjetas de calorías + historial. Las 5 tarjetas de calorías son 5 números; hoy son 5 filas de 76 px.
- El "Historial corporal" muestra **solo la fecha y un botón Editar**: seis tarjetas de 84 px que no enseñan ni un dato. En escritorio esto es una tabla de 6 filas × 8 columnas donde se ve la evolución de un vistazo, que es literalmente para lo que existe la pantalla.

### 1.10 Más / Ajustes (`#secSettings`, `js/ui/settings.js`)

`desk-1512-more.png`

- **2.329 px de scroll** en una columna de 500 px, con 8 grupos temáticamente independientes: Apariencia, 1RM estimados, Zonas de carrera, Frecuencia cardiaca, Mis planes, Quirón, Google Drive, Datos. Ninguno depende del anterior. Es el caso de libro de una rejilla de 2 columnas: el scroll se reduce a la mitad sin mover una sola tarjeta de sitio.
- Los 4 `1RM estimados` son 4 tarjetas apiladas de 88 px cada una; a 1024+ son una fila de 4.
- **Bug visible, no solo de escritorio**: `app.html:425` es `<input type="password" id="quironKey">`, y el selector de campos de `app.css:19` cubre `select, input[type="date"], input[type="number"], input[type="text"]` — **`password` no está**. El campo de la API key se renderiza con el estilo por defecto del navegador: 125 px de ancho, borde de sistema, tipografía distinta. Es el único control de toda la app que se sale del design system, y está justo en la pantalla de configuración de Quirón, que es el paso que separa a un usuario nuevo del diferenciador del producto.

### 1.11 Quirón (`.quiron-panel`, `app.css:907`)

`desk-1512-quiron.png`

- `position:fixed; inset:0` sin `max-width`: el panel ocupa los 1512 px. `.q-bubble{max-width:88%}` (`app.css:917`) → **una respuesta del modelo puede tener 1.330 px de medida, unos 200 caracteres por línea**. El óptimo tipográfico está en 45–75. Es, con diferencia, el peor problema de legibilidad de la app en escritorio, y afecta a la superficie donde el usuario lee más texto seguido.
- El chat es, además, la funcionalidad *más* de escritorio de Areté (escribir con teclado, leer una respuesta larga, copiar un plan). Que sea también la peor tratada en escritorio es una inversión de prioridades.
- Los 4 botones del header (`.quiron-hbtn`, 38×38) no tienen etiqueta ni `title`. En móvil se aceptan; en escritorio el hover permite un tooltip gratis.
- El panel tampoco atrapa el foco ni cierra con `Escape` (el único `Escape` implementado en esa zona es el de `share-editor.js:1084`).

### 1.12 Modales

- `.modal-overlay` (`app.css:155`) → `.modal{max-width:500px;max-height:75vh}`. El ancho es correcto para escritorio (un formulario de una entrada no debe ensancharse). Lo incorrecto es la **forma**: radio superior solo, animación `slideUp`, es decir, una hoja inferior de móvil renderizada en el centro de un monitor.
- El trap de foco sí funciona aquí (`app.js:465-478` + `utils.js:39-54`), pero con dos límites: solo cubre los `.modal-overlay` **existentes al cargar** (11 medidos en el DOM), y el handler está montado sobre el propio overlay, así que si el foco arranca fuera, no encierra nada. Es exactamente lo que falla con el `.set-runner`.
- `app.css:197` y `app.css:198-199` centran `.detail-btn-bar` y `.share-editor-overlay` con `transform:translateX(-50%)` sobre un `max-width:500px` **escrito a mano**. Cualquier cambio del ancho de la shell hay que replicarlo en esas tres reglas o quedarán descentradas. Motivo suficiente para tokenizar el ancho (`--shell`) en el mismo commit.

---

## 2. Estrategia de layout — recomendación

### Las tres opciones sobre la mesa

**A. Ensanchar la columna y ya.** `max-width` de 500 → 800 y a otra cosa. Es tentador por barato, y hay que descartarlo como estrategia única: una columna de 800 px no arregla nada de lo que duele. Las filas de tarjeta de Areté son "etiqueta a la izquierda, valor a la derecha" (`.so-ex`, `.sc-row-action`, `.dst-label`, las medidas de Cuerpo): ensancharlas **empeora** la lectura, porque separa cada etiqueta de su dato. Y no toca el problema vertical, que es el más grave (2.300 px de scroll en Ajustes y en Cuerpo). Ensanchar sin reorganizar es cambiar gris lateral por vacío interno.

**B. Ensanchar + rejillas multi-columna, conservando la nav inferior.** Arregla la densidad. No arregla la navegación: una barra de pulgar centrada a 500 px en una pantalla de 1512 sigue siendo un objeto flotante sin anclaje, sigue robando 84 px de alto a cada sección vía `body{padding-bottom}` y sigue dejando el FAB huérfano a 438 px de distancia.

**C. Rail lateral en ≥1024 + rejillas + maestro-detalle en Historial y Progreso.** ← **Recomendada.**

### Por qué C

1. **Es más barato de lo que parece.** `nav` ya es `display:flex` con 5 `<button>` de icono + etiqueta (`app.css:7-10`). Pasar a rail es cambiar `flex-direction`, `position` y las dimensiones dentro de un media query. **Cero HTML, cero JS.** `nav.js` sigue funcionando: los `data-sec` no se tocan.
2. **Libera las dos dimensiones a la vez.** El rail ocupa gris que hoy no sirve para nada y devuelve 84 px de alto a las cinco secciones. Es la única opción que mejora el scroll vertical sin reordenar contenido.
3. **Da un ancla al FAB de Quirón.** En el rail, Quirón deja de ser un satélite en el borde derecho de la pantalla y pasa a ser lo que conceptualmente es: un sexto destino, permanentemente visible y alcanzable.
4. **Hace posible el maestro-detalle** sin robarle sitio al detalle, que es lo que hoy impide plantearlo.
5. **Ya existe el precedente en el repo**: `app.css:722` hace exactamente esto (panel fijo + área fluida) para la carrera en vivo, y funciona.

### Breakpoints propuestos

| Breakpoint | Nombre | Shell | Navegación | Por qué ese número |
| --- | --- | --- | --- | --- |
| `< 640px` | móvil | 100 % | inferior fija | Se queda **exactamente como está**. Cubre hasta el iPhone Pro Max en horizontal parcial. |
| `≥ 640px` | columna ancha | **600 px** | inferior fija | Sustituye al actual `500px`. Un tablet en vertical (768) y una ventana partida de portátil ganan un 20 % de ancho sin que ninguna fila etiqueta-valor se rompa. Por debajo de 1024 el rail no cabe sin comprimir el contenido, así que aquí solo se ensancha. |
| `≥ 1024px` | escritorio | rail **232 px** + contenido **hasta 880 px** | **rail lateral**; desaparece la barra inferior | Es el ancho mínimo donde 232 + 880 + márgenes entran sin que el contenido baje de los ~640 px que necesita una rejilla de 2 columnas legibles. Coincide con el portátil pequeño y el tablet en horizontal, que es donde el ratón/trackpad empieza a ser el puntero real. |
| `≥ 1440px` | escritorio ancho | rail 232 px + contenido **hasta 1.180 px** | rail lateral | Donde una tercera columna es útil (Cuerpo, Ajustes, bento). Techo duro: **por encima de 1.180 px de contenido no se sigue creciendo**. En 1920 el resultado es una app centrada con márgenes generosos, no una app estirada. |

Se mantiene sin cambios el `@media(min-width:700px)` de `app.css:722`: la carrera en vivo es un overlay sin nav y su umbral responde a otra necesidad (que quepan panel y mapa). Mezclarlo con la escala general sería peor.

**Maestro-detalle: sí, pero solo en dos sitios.** Historial (calendario | sesiones del día) y Progreso (lista de ejercicios | gráfica y stats). Son las dos únicas pantallas donde el usuario compara elementos de una colección; en el resto el maestro-detalle añadiría un panel que casi siempre estaría vacío. Requiere JS (hoy Historial abre modal) y por eso va en la fase 3, no en la 1.

---

## 3. Sistema de rejilla

### 3.1 Tokens y contenedores

Todo el ancho vive hoy en literales repetidos (`500px` aparece 6 veces en `app.css:195-200`). Primer paso, mecánico:

```
:root{ --shell: 100%; --nav-h: 84px; --rail-w: 0px; }
@media(min-width:640px) { :root{ --shell: 600px; } }
@media(min-width:1024px){ :root{ --shell: 880px; --nav-h: 0px; --rail-w: 232px; } }
@media(min-width:1440px){ :root{ --shell: 1180px; } }
```

Y sustituir por `var(--shell)` las seis apariciones de `500px` y por `var(--nav-h)` los dos `84px` de `app.css:6` y `app.css:35`. Sin esto, cada ajuste posterior hay que hacerlo en seis sitios y el `.detail-btn-bar` acabará descentrado.

### 3.2 Anchos máximos por tipo de contenido

El `--shell` es el contenedor. Dentro, **no todo debe ocupar el contenedor**:

| Contenido | max-width | Motivo |
| --- | --- | --- |
| Rejillas de tarjetas (bento, PRs, calorías, 1RM) | `--shell` | Son datos, no prosa. Cuantas más quepan por fila, mejor. |
| Prosa y chat (`.quiron-msgs`, notas, textos de ayuda) | **46 rem (~736 px)**, centrado | 60–75 caracteres. Hoy Quirón llega a 200. |
| Formularios (registro manual, editar medida, modales) | **520 px** | Un campo por línea. Ensanchar solo aleja la etiqueta del control. |
| Listas de series (`.sets-grid`, `app.css:80`) | **460 px** | Ver §7. |
| `.set-runner` | **480 px**, centrado en ambos ejes | Ver §7. |
| Tablas (historial de ejercicio, historial corporal) | `--shell` | Aquí sí: más columnas visibles = más valor. |

### 3.3 Qué pasa a varias columnas

**A 2 columnas en ≥1024:**

| Pantalla | Columna A | Columna B |
| --- | --- | --- |
| **Perfil** | Radar (hasta 520 px) + tarjeta "siguiente test" | Los 7 dominios + notas de calibración |
| **Hoy** | Bento (pasa a 4 columnas en una fila) + racha + CTA | Nivel + actividad reciente **en vertical** (se abandona el carrusel horizontal) |
| **Entrenar/Fuerza · Actividad** | Timer + fecha/sesión + resumen de sesión (400 px) | Tarjetas de ejercicio (columna estrecha, 460 px) |
| **Entrenar/Fuerza · Historial** | Calendario (380 px, fijo) | Sesiones del día seleccionado — maestro-detalle |
| **Entrenar/Fuerza · Progreso** | Lista de ejercicios (280 px) | Gráfica + stats + tabla de historial |
| **Entrenar/Carrera · Actividad** | Objetivo semanal + PRs | Importar (con zona de soltar) + registro manual + próxima sesión del plan |
| **Ajustes** | Apariencia · 1RM · Zonas · FC | Quirón · Planes · Drive · Datos |

**A 3 columnas en ≥1440:** solo el formulario de medidas de Cuerpo (11 campos con **la etiqueta encima del campo**, no al lado) y las tarjetas de calorías. Nada más: por encima de tres columnas se pierde el orden de lectura.

**Rejillas que solo cambian de conteo, no de estructura** (una línea cada una):
`.dash-bento` 2 → 4 (`app.css:831`) · `.run-prs-grid` 2 → 4 (`app.css:565`) · `.run-stats-grid` 2 → 4 (`app.css:529`) · `.run-type-grid` 2 → 4 (`app.css:655`) · las 4 tarjetas de 1RM 1 → 4 · las 5 de calorías 1 → 5.

### 3.4 Qué se queda en columna estrecha

Explicado en §7, pero para tenerlo en la misma tabla mental: `.set-runner`, `.sets-grid`, todos los modales de una sola entrada, el timer de descanso, los toasts y las burbujas de Quirón.

---

## 4. Affordances de escritorio que faltan

### 4.1 `:hover` — cero de cero

**No hay ni una sola declaración `:hover` en las 1.202 líneas de `app.css`.** Los 37 `:active` que existen son el único feedback de interacción: `.btn:active{transform:scale(.97)}`, `.sc-row-action:active`, `.q-chip:active`, `.cal-nav button:active`… En táctil eso es correcto y deliberado. Con ratón significa que **nada reacciona hasta que ya has hecho clic**: el usuario no puede distinguir qué es pulsable sin probarlo.

Regla: añadir hover **siempre** bajo `@media (hover:hover) and (pointer:fine)`, nunca suelto. Un `:hover` sin guardar se queda "pegado" en táctil después de tocar, y esta es una PWA que se instala en el móvil.

Prioridad de cobertura, por frecuencia de uso: `nav button` (→ rail), `.btn` / `.btn-outline`, `.sc-row-action`, `.so-ex`, `.history-item`, `.q-chip`, `.str-tab` / `.run-tab`, `.cal-grid` días con sesión, `.dash-card` cuando es clicable, `.prof-domain-row`, `#quironFab`, `.quiron-hbtn`, `.toggle-btn`.

### 4.2 `:focus-visible` — dos declaraciones

Solo `app.css:34`: `button:focus-visible,.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`. Es un buen anillo y cubre todo lo que sea `<button>` (que es la mayoría). Faltan:

- **Inputs y selects**: tienen `:focus` (`app.css:19-22`) con `box-shadow`, que se dispara igual con ratón. Funciona, pero es un lenguaje distinto del resto; unificar bajo `:focus-visible` con el mismo anillo.
- **`.ex-dot`**: es un `<span>`. No es focusable en absoluto. Debe ser `<button>`.
- **Los días del calendario**: si son clicables tienen que ser focusables.
- **`a`**: la app tiene enlaces sin regla propia (heredan el `outline` del navegador, que es distinto del anillo del design system).

### 4.3 Teclado y foco en overlays

Tres arreglos, en este orden:

1. **Generalizar el trap.** `app.js:465-478` solo observa `.modal-overlay` presentes al cargar. Que observe `document.body` con `childList:true, subtree:true` y aplique el trap a cualquier `[role="dialog"][aria-modal="true"]` que se conecte — cubre de golpe el `.set-runner`, la pantalla de carrera en vivo y todo overlay futuro.
2. **Mover el foco al abrir.** `trapFocus` (`utils.js:52`) ya hace `first.focus()`; el problema es que al `.set-runner` no se le llama.
3. **Escape global.** Un único handler en `document` que cierre el overlay superior, en lugar de handlers por overlay montados sobre nodos que nunca reciben el foco (`set-runner.js:421`).

### 4.4 Atajos de teclado

No existe ninguno. Propuesta mínima, solo en `pointer:fine`, y **con una hoja de "?" que los liste** (si no se descubren, no existen):

| Tecla | Acción |
| --- | --- |
| `1`–`5` | Ir a Hoy / Entrenar / Perfil / Cuerpo / Más |
| `Esc` | Cerrar el overlay o modal superior |
| `/` | Abrir Quirón y enfocar el campo |
| `Espacio` | "Serie hecha" dentro del `.set-runner` |
| `←` / `→` | Mes anterior/siguiente en el calendario; ejercicio anterior/siguiente en la sesión |
| `?` | Mostrar la lista de atajos |

`Espacio` y `Esc` en el runner no son comodidad: hoy es imposible completar o abandonar una sesión sin ratón.

### 4.5 Scrollbars

`app.css:194`: `::-webkit-scrollbar{width:0}`. Selector global, sin condición de puntero. En móvil oculta algo que el SO ya oculta; en escritorio **borra la única señal de que un contenedor tiene más contenido** — y lo hace precisamente en las pantallas más largas de la app (Ajustes 2.329 px, Cuerpo 2.207 px, historial de ejercicio, mensajes de Quirón). El usuario de ratón pierde la posición y la longitud del documento.

Arreglo (3 líneas):
```
@media (pointer:coarse){ ::-webkit-scrollbar{width:0} }
@media (pointer:fine){
  *{ scrollbar-width:thin; scrollbar-color:var(--text3) transparent; }
  ::-webkit-scrollbar{width:10px;height:10px}
  ::-webkit-scrollbar-thumb{background:var(--text3);border-radius:5px;border:3px solid transparent;background-clip:content-box}
}
```
Nota de detalle: la regla actual solo pone `width:0`, no `height:0`, así que las barras **horizontales** sí aparecen (por ejemplo en `.q-code{overflow-x:auto}`). O sea: hoy el comportamiento no es ni siquiera consistente consigo mismo.

Excepción a mantener: `.dash-activity-scroll` (`app.css:846-847`) esconde su barra a propósito. En escritorio esa lista deja de ser carrusel, así que la excepción desaparece sola.

### 4.6 Tamaños de objetivo y densidad

En escritorio el objetivo puede apretarse: el ratón apunta con precisión de píxel, y lo que se gana es información por pantalla. **Solo dentro de `≥1024`**, para no tocar el móvil:

| Elemento | Móvil | Escritorio | Ganancia |
| --- | --- | --- | --- |
| `.btn` padding | 16 / 24 | 12 / 20 | −8 px por botón |
| `.sc-row-action` alto | ~56 | 44 | −12 px × 12 filas en Ajustes |
| `.dash-card` padding | 20 | 16 | −8 px por tarjeta |
| `.section` padding | 16 / 20 | 24 / 32 | (se ensancha, no se aprieta: los márgenes laterales sí crecen) |
| `nav button` | 56 alto | filas de 44 en el rail | — |

Suelo innegociable: **44×44 px** en cualquier control del `.set-runner`, del timer de descanso y del reproductor de carrera. Son controles que se usan sudado y con prisa, y comparten CSS con el móvil.

Y en la dirección contraria, un objetivo que hay que **agrandar** en escritorio: `.ex-dot` de 8×8 a 24×24 mínimo (o su sustitución por un índice lateral, que es la solución buena).

### 4.7 `cursor`

Bien cubierto: 71 declaraciones `cursor:pointer`. Medido en vivo sobre 41 elementos interactivos visibles, solo 5 sin `pointer`, y son `<label>` y `<select>`. Añadir `select{cursor:pointer}` y revisar los `<label>` que actúan como botón. No es un problema, pero es gratis cerrarlo.

### 4.8 Tooltips

En escritorio el hover permite explicar sin ocupar espacio. Candidatos inmediatos: los 4 botones sin etiqueta del header de Quirón (`.quiron-hbtn`), los chips de zonas de pace y FC (`Z1`…`Z5` sin decir qué es cada zona), el icono de engranaje del objetivo semanal, y el badge `PR` del historial. Un `title` es suficiente y no cuesta nada.

---

## 5. Tipografía y densidad en escritorio

### 5.1 Corrección al dato de la auditoría previa

La auditoría de móvil afirma que el tamaño base es **11,5 px** (`--fs-base:.72rem`). **Ese dato ya no es correcto**: `app.css:4` define hoy `--fs-base:.875rem` = **14 px**, y `:root` lleva un comentario explícito que fija el suelo de la escala en 11 px y el cuerpo en 14. El hallazgo se atendió. La escala actual:

| Token | rem | px | Usos |
| --- | --- | --- | --- |
| `--fs-2xs` | .6875 | 11 | 16 |
| `--fs-xs` | .75 | 12 | 37 |
| `--fs-sm` | .8125 | 13 | 55 |
| `--fs-base` | .875 | **14** | **83** |
| `--fs-md` | 1 | 16 | 59 |
| `--fs-lg` | 1.125 | 18 | 35 |
| `--fs-xl` | 1.375 | 22 | 25 |
| `--fs-2xl` | 1.625 | 26 | 15 |
| `--fs-3xl` | 2.25 | 36 | 7 |
| `--fs-4xl` | 3 | 48 | 5 |

### 5.2 ¿Debe cambiar en escritorio? Sí, un escalón, y por una razón física

La distancia de lectura en un monitor es de ~60 cm frente a ~35 cm en el móvil. A igualdad de píxeles, un texto de 14 px en escritorio se percibe como uno de **~8 px** en el móvil. Es decir: el tamaño que ya se corrigió para el móvil **vuelve a quedarse corto en escritorio**, aunque el número sea idéntico.

Recomendación: redefinir los tokens dentro del breakpoint. Una regla, cero refactor, porque los 337 usos ya van por variable:

```
@media (min-width:1024px){
  :root{
    --fs-2xs:.75rem;  --fs-xs:.8125rem; --fs-sm:.875rem;  --fs-base:.9375rem;
    --fs-md:1.0625rem; --fs-lg:1.1875rem; --fs-xl:1.5rem;  --fs-2xl:1.75rem;
    --fs-3xl:2.5rem;   --fs-4xl:3.25rem;
  }
}
```

Es ~+7 % en cuerpo y ~+10 % en display. **No más**: el objetivo es compensar distancia, no agrandar.

**Descartado: `html{font-size:17px}`.** Parece más elegante (escala todos los tokens de golpe), pero los píxeles literales del sistema **no** escalan: `nav button svg{width:24px}`, `.sc-row-icon{28px}`, `.toggle-btn{50×30}`, los radios y los `--sp-*`. El resultado sería texto crecido dentro de iconos y contenedores del mismo tamaño de siempre. La redefinición de tokens cuesta lo mismo y no descoordina nada.

### 5.3 Interlineado

37 declaraciones puntuales de `line-height`, ninguna base en `body`. Con líneas cortas (460 px) el valor por defecto pasa desapercibido; con líneas de 700–880 px se nota. Fijar `body{line-height:1.5}` y bajar explícitamente a 1.1–1.25 en los display (`.sr-name`, los valores del bento, `--fs-3xl`/`--fs-4xl`), donde 1.5 abre demasiado.

### 5.4 El problema real de densidad no es tipográfico

Conviene decirlo claro para no gastar esfuerzo donde no toca: en escritorio Areté no falla por tamaño de letra. Falla por (a) **medida de línea** —200 caracteres en Quirón, `app.css:917`— y (b) **densidad de información** —5 tarjetas visibles donde caben 12—. Ninguno de los dos se arregla con la escala tipográfica: se arreglan con la rejilla de §3 y con los paddings de §4.6. La tipografía es un ajuste de acompañamiento, no la palanca.

---

## 6. Backlog priorizado

Escala: impacto 1–5, esfuerzo 1–5 (1 = trivial).

### 6.1 Quick wins de CSS puro — sin tocar `app.html` ni `js/`

| # | Arreglo | Dónde | Imp. | Esf. |
| --- | --- | --- | --- | --- |
| **Q1** | **Rail lateral en ≥1024**: `nav` pasa a `flex-direction:column`, fija a la izquierda, 232 px; botones en fila icono+etiqueta | `app.css:7-10` + nuevo MQ | **5** | **2** |
| **Q2** | **Tokenizar `--shell` y `--nav-h`** y sustituir los seis `500px` y los dos `84px` | `app.css:6,35,195-200` | 4 | 1 |
| **Q3** | **`:hover` bajo `@media(hover:hover)`** para los ~14 componentes interactivos principales | transversal | **5** | 3 |
| **Q4** | **Anclar el FAB de Quirón** a la shell (y en ≥1024, integrarlo en el rail) | `app.css:903` | 4 | 1 |
| **Q5** | **Medida de Quirón**: `.quiron-msgs{max-width:46rem;margin-inline:auto}` + `.q-bubble{max-width:min(88%,34rem)}` | `app.css:916-917` | **5** | 1 |
| **Q6** | **Radar a 520 px** en ≥1024 | `app.css:1114` | 4 | 1 |
| **Q7** | **Scrollbar fina en `pointer:fine`** | `app.css:194` | 3 | 1 |
| **Q8** | **`input[type="password"]`** al selector de campos (bug visible) | `app.css:19` | 3 | 1 |
| **Q9** | **Rejillas 2→4 columnas**: bento, PRs, stats, 1RM, calorías | `app.css:529,565,655,831` | 4 | 2 |
| **Q10** | **2 columnas en Perfil, Hoy, Ajustes, Cuerpo** | nuevo MQ | **5** | 3 |
| **Q11** | **Cuerpo: etiqueta encima del campo** + rejilla 3×4 en ≥1440 | `js/ui/body.js` render + CSS | 4 | 2 |
| **Q12** | **Escala tipográfica ≥1024** + `line-height` base | `app.css:4` | 3 | 1 |
| **Q13** | **Apretar paddings** en ≥1024 | transversal | 3 | 2 |
| **Q14** | **Modales sin forma de bottom sheet** en ≥640: radio completo, `fadeIn` en vez de `slideUp` | `app.css:157` | 2 | 1 |
| **Q15** | **`.set-runner` centrado vertical** a 480 px de ancho, sin reflow | `app.css:1081` zona | 2 | 1 |
| **Q16** | **`select{cursor:pointer}`** y `:focus-visible` en inputs y enlaces | `app.css:19-22,34` | 2 | 1 |

### 6.2 Requiere tocar HTML/JS

| # | Arreglo | Dónde | Imp. | Esf. |
| --- | --- | --- | --- | --- |
| **J1** | **Trap de foco genérico + `Escape` global** para todo `[role=dialog][aria-modal]`, incluido el `.set-runner` | `js/app.js:465-478`, `js/ui/set-runner.js:126,421` | **5** | 2 |
| **J2** | **Gráficas que no se deforman al ensanchar**: `viewBox` proporcional al ancho real o etiquetas con `vector-effect`/px fijos | `js/ui/progress.js:111`, `js/ui/running.js:1424` | 4 | 3 |
| **J3** | **Drag & drop de GPX/TCX** en escritorio (el parser ya existe) | `js/ui/run-import.js` | 4 | 2 |
| **J4** | **Maestro-detalle en Historial**: el día seleccionado pinta en un panel, no en un modal, en ≥1024 | `js/ui/history.js`, `js/ui/calendar.js` | **5** | 4 |
| **J5** | **Maestro-detalle en Progreso**: selector `<select>` → lista lateral | `js/ui/progress.js` | 4 | 3 |
| **J6** | **Atajos de teclado** + hoja de ayuda con `?` | `js/app.js`, `js/ui/nav.js` | 3 | 2 |
| **J7** | **`.ex-dot` → `<button>` de 24 px**, o índice lateral de ejercicios en ≥1024 | `js/ui/training.js:238` | 3 | 2 |
| **J8** | **Historial corporal como tabla** con las medidas visibles | `js/ui/body.js` | 3 | 2 |
| **J9** | **Historial de ejercicio como tabla** con cabecera y números alineados | `js/ui/progress.js:135` | 2 | 2 |
| **J10** | **`title` en los iconos sin etiqueta** | `app.html`, `js/ui/quiron.js` | 2 | 1 |
| **J11** | **Vocabulario**: "Toca" → "Pulsa" en ≥1024, o neutro siempre | transversal | 1 | 2 |

### 6.3 Los cinco que dan la mayor parte del resultado

1. **Q1 + Q2 — rail lateral y tokens de ancho.** Es la decisión estructural de la que cuelga todo lo demás, y sale de un media query. Sin ella, cada arreglo posterior se pelea con los `500px` y los `84px` escritos a mano.
2. **Q3 — `:hover`.** El cambio más barato con más efecto percibido. Hoy la app no responde al ratón en absoluto; con esto deja de parecer una captura de pantalla.
3. **Q5 + Q4 — medida de Quirón y anclaje del FAB.** Dos reglas. Arreglan las dos cosas más visiblemente rotas en un monitor: un botón huérfano a 438 px del contenido y líneas de 200 caracteres en la pantalla donde más se lee.
4. **Q10 + Q6 + Q9 — dos columnas en Perfil, Hoy, Ajustes y Cuerpo.** Donde está la mayor parte del gris y la mayor parte del scroll. El radar a 520 px, en particular, es el argumento del producto pasando de sello de correos a pieza principal.
5. **J1 — foco y `Escape` en el `set-runner`.** El único fallo del lote que no es estético: hoy, en escritorio, no se puede completar ni abandonar una sesión de fuerza sin ratón, y el foco se escapa por debajo del overlay.

Orden de ejecución sugerido: **Q2 → Q1 → Q4 → Q5 → Q3 → Q9 → Q10 → Q6 → Q7/Q8/Q12 → J1 → J2 → J3 → J4/J5**. La fase de Q's es puro CSS y se puede desplegar entera sin riesgo de regresión funcional; J2 es prerrequisito de cualquier ensanchado de Progreso.

---

## 7. Qué NO tocar

Lista explícita de sitios donde el diseño móvil ya es correcto y ensancharlo sería un error:

1. **El `.set-runner` (`js/ui/set-runner.js`).** Un ejercicio, un peso, unas reps, un botón, centrado. La invariante de "un tap por serie, cero scroll" está documentada en `propuesta-ux-sesion-fuerza.md` y es el mejor trabajo de la app. En escritorio **no se ensancha, no se le añade una segunda columna y no se le mete la lista de ejercicios al lado**. Solo dos cosas: centrarlo verticalmente en 480 px para que no queden 300 px muertos bajo los campos, y arreglarle el foco y el `Escape` (J1). Cualquier otra cosa que se le haga es una regresión.

2. **`.sets-grid` (`app.css:80`, `grid-template-columns:auto 1fr 1fr`).** La fila `S1 · kg · reps` debe quedarse por debajo de ~460 px. Ensanchada, la etiqueta de serie se separa de sus campos y se pierde la asociación exactamente igual que pasa hoy en Cuerpo. Es el ejemplo canónico de por qué la estrategia "ensanchar la columna y ya" está descartada.

3. **La `nav` inferior por debajo de 1024 px.** Es correcta, está probada y respeta el alcance del pulgar. El rail sustituye a la barra **solo** a partir de 1024; por debajo no se toca nada.

4. **El ancho de los modales de una sola entrada** (timer de descanso, registro manual de carrera, editar medida, confirmaciones). 500 px es el ancho correcto para un formulario en cualquier pantalla. Lo único que cambia en escritorio es la **forma**: quitarles el radio de hoja inferior y el `slideUp` (Q14). El ancho se queda.

5. **La pantalla de carrera en vivo (`app.css:722`).** Ya está resuelta y es el modelo a imitar. No hay que rehacerla ni alinear su breakpoint de 700 px con la escala general: es un overlay sin nav y su umbral responde a que quepan panel y mapa, que es otra pregunta.

6. **La escala tipográfica base.** El suelo de 11 px y el cuerpo de 14 px son una decisión de producto argumentada en el propio `:root` ("se lee con el móvil en el suelo, sudado, entre series"). En escritorio se sube un escalón dentro del media query; **la escala base no se vuelve a bajar** por ganar densidad.

7. **`.dash-activity-scroll` en móvil (`app.css:846-847`).** El carrusel horizontal con la barra oculta es correcto en táctil. Lo que cambia es que en ≥1024 esa lista deja de ser carrusel y pasa a columna; la excepción de la scrollbar desaparece con él, no antes.

8. **Los 44 px de objetivo mínimo en el runner, el timer y los controles de carrera.** El apretado de densidad de §4.6 no llega a estos controles ni siquiera en escritorio: comparten CSS con el móvil y se usan con prisa y sudor.

9. **`--text3` y el contraste.** Es un hallazgo abierto de la auditoría de móvil y sigue vivo, pero es un problema de color, no de ancho: no se arregla ni se empeora con nada de este plan. Solo una advertencia: al agrandar el radar y las gráficas, `--text3` gana superficie, así que conviene cerrarlo antes o a la vez.

---

## 8. Qué queda abierto

Aplicado en este pase: **Q1–Q16** (todo el bloque de CSS) y **J1, J2, J3, J7, J10**. Notas de lo que cambió respecto a lo planeado:

- **J2 solo afectaba a `progress.js`.** El informe señalaba `running.js:1424` como el mismo patrón, y no lo es: esa gráfica ya mide `container.clientWidth` y fija `height` en px, así que nunca se deformó. Solo se tocó `progress.js`, que ahora calcula el `viewBox` desde el ancho real y se rehace con un `ResizeObserver`.
- **J10 estaba medio hecho.** Tres de los cuatro botones del header de Quirón ya tenían `title`; faltaba el de cerrar. Se añadieron además en el timer, el mini-timer y la navegación de mes.
- **Q15 no hacía falta.** El `.set-runner` ya centra sus hijos en 520px y la fase de trabajo ya va centrada en vertical (`.sr-phase{flex:1;justify-content:center}`). No se tocó.
- **Dos fallos encontrados al aplicar, no en la auditoría:**
  - La `nav` fija combinaba el `right:0` de la regla base con el `left:50%` del media query, así que se quedaba en **media pantalla** (384px en un viewport de 768) y su `max-width` no llegaba a aplicarse nunca. Existía desde antes, con el shell de 500px.
  - Un grid item con `margin-inline:auto` deja de estirarse y se queda en su ancho de contenido: el radar seguía en 340px con `max-width:520px` puesto. Necesita `width:100%` explícito.
- **El calendario ahora se capa a 420px entre 640 y 1024**: al ensanchar la columna, las celdas de día se volvían círculos enormes y el mes dejaba de leerse como rejilla.

Pendiente, por orden de valor:

| # | Qué | Por qué se dejó |
| --- | --- | --- |
| **J4** | Maestro-detalle real en Historial: el día seleccionado pinta en el panel, no en un modal | El CSS ya pone calendario y lista lado a lado, que era el 80% del valor. Cerrar el modal requiere reescribir `history.js` + `calendar.js`. |
| **J5** | Progreso: `<select>` de ejercicio → lista lateral navegable | Igual: la rejilla ya separa selector de gráfica; convertir el select en lista es trabajo de `progress.js`. |
| **J6** | Atajos de teclado (`1`–`5`, `/`, `?`, `Espacio` en el runner) | `Escape` sí está (J1). El resto necesita guardas para no dispararse al escribir en un campo, y una hoja de ayuda o no se descubren. |
| **J8/J9** | Historial corporal y de ejercicio como tabla | Cambia el render, no el layout. |
| **J11** | "Toca" → "Pulsa" | Barrido de copy, transversal. |

Y un hallazgo que sigue vivo de la auditoría de móvil y que este pase **empeora ligeramente**: al agrandar el radar y las gráficas, `--text3` (~2,0:1 de contraste) gana superficie. Conviene cerrarlo antes de dar por buena la fase de escritorio.
