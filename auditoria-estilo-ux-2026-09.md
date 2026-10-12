# Auditoría de estilo y UX/UI — Areté

**Fecha:** 2026-09-29 · **Alcance:** `app.html`, `app.css`, `js/ui/*` en `main @ dff50a1`
**Método:** lectura del sistema de diseño + recorrido instrumentado con un Chromium real
(Playwright) sobre `app.html` servido en local, con una base sembrada desde
`evals/fixtures/arete-hibrido.json`. Se midió en 390×844 (móvil) y 1440×900 (escritorio),
tema claro y oscuro, con el service worker bloqueado.
**Referencia previa:** `auditoria-ux-2026-08.md`, `auditoria-desktop-2026-08.md`, `mejoras_ux.md`.
Los hallazgos ya cerrados en esos documentos **no** se repiten aquí; cuando un problema viejo
sigue vivo se dice expresamente.

## Cómo se midió (reproducible)

```bash
cd projects/arete && python3 -m http.server 8899 --bind 127.0.0.1
# Chromium del caché de Playwright, serviceWorkers: 'block', localStorage 'arete' = fixture
# Capturas: 5 secciones × 2 viewports × 2 temas + hojas, runner, Quirón, onboarding.
# Sondas: font-size computado, bounding boxes de objetivos táctiles, desbordes,
#          contraste WCAG calculado con el alfa compuesto sobre el fondo efectivo.
```

Dos avisos de honestidad sobre lo medido:

- Las capturas se tomaron con `navigator.onLine = false` para que la app no intentara red. El
  banner rojo «Sin conexión» que aparece en las imágenes es **el estado correcto en ese caso**,
  no un defecto.
- Las imágenes *full page* se tomaron con la nav fija reposicionada; su solapamiento en la
  captura es un artefacto del método. Se verificó aparte con `elementFromPoint` que **ningún
  botón queda tapado** por la nav al final del scroll en las cinco secciones.

---

## Resumen ejecutivo

El sistema de diseño de Areté es, con diferencia, lo mejor del proyecto: hay una capa de tokens
cerrada, una regla de contraste escrita junto a los valores, una escala de profundidad con
nombre y una regla de oro («si necesitas un valor que no es token, o falta el token o el diseño
está mal»). Lo que falla **no es el sistema: es su cumplimiento y la jerarquía de algunas
pantallas**.

Tres conclusiones:

1. **El producto tiene tres pantallas que van en contra de su propia tesis.** El Historial
   imprime 3.966 px de series sueltas en móvil; la captura entierra el primer campo de kg por
   debajo del pliegue; y Progreso dibuja un serrucho que oculta la tendencia que el atleta viene
   a ver. Las tres nacen del mismo error de fondo: **mostrar el dato crudo en lugar de la
   lectura del dato**.
2. **El rojo de acción dejó de ser único.** No es ya el «una sola acción primaria por vista»
   (eso se respeta), sino que el color *de dato* se usa para jerarquía: PR en cada fila, barras
   segmentadas sin leyenda, cifras de tabla. Cuando el rojo aparece 20 veces deja de señalar.
3. **La deuda de estilo es acotada y verificable**: 39 clases CSS sin uso, 6 tokens muertos,
   3 hex fuera de la capa de tokens, un radio `--pill` aplicado a una tarjeta, y etiquetas de
   radar a 10,5 px hardcodeadas en JS por debajo del suelo de 11 px que el propio sistema
   declara. Todo eso son horas, no semanas.

Severidades: **Bloqueante** (rompe la tarea o el contrato del producto) · **Alta** (fricción
medible en el camino principal) · **Media** (ruido de comprensión o de estilo) · **Baja**.

| id | Área | Severidad |
|---|---|---|
| AE-01 | Onboarding se dibuja como círculo | Alta |
| AE-02 | Etiquetas del radar a 10,5 px hardcodeadas en JS | Alta |
| AE-03 | Token terciario usado para texto informativo (3,53:1) | Alta |
| AE-04 | Tres hex fuera de la capa de tokens | Media |
| AE-05 | Un icono de dominio pintado con primitivo (`--red-200`, 1,7:1) | Media |
| AE-06 | 39 clases CSS sin uso, incluidas piezas del sistema | Media |
| AE-07 | 6 tokens muertos | Baja |
| AE-08 | Dos vocabularios para «título de bloque» | Media |
| AE-09 | Dos anillos de foco distintos conviviendo | Media |
| AE-10 | Numerales de nivel sin ancla textual | Media |
| AE-11 | `assets/icons/icon.svg` es un asset huérfano con OTRA marca | Baja |
| AU-01 | Onboarding sin salida | Alta |
| AU-02 | La pared de «atrasada» en Hoy | Alta |
| AU-03 | El primer campo de la captura bajo el pliegue | Alta |
| AU-04 | Historial como volcado de series | Alta |
| AU-05 | Quirón: placeholder cortado y cabecera comprimida | Alta |
| AU-06 | Cuerpo: 5 tiles de calorías sin explicar | Media |
| AU-07 | «Editar» repetido en 8 filas de tabla | Media |
| AU-08 | Cinco objetivos táctiles por debajo de 44 px en Hoy | Media |
| AU-09 | Etiqueta partida a mitad de palabra en Ajustes | Media |
| AU-10 | Barra segmentada sin leyenda en Carrera | Media |
| AU-11 | Tres barras de pestañas apiladas en Entrenar | Media |
| AU-12 | Progreso: la gráfica mezcla variantes A y B | Alta |
| AU-13 | Progreso: PR en cada repetición del récord | Alta |
| AU-14 | Progreso: «1RM estimado» y «Peso máx» sin explicar la diferencia | Media |
| AU-15 | «1 ejercicios» | Baja |
| AU-16 | Onboarding que no captura nada y no se puede reabrir | Media |
| AU-17 | El ancho de la acción primaria no sigue una regla: 94 % / 36 % / 23 % | Alta |
| AU-18 | Los controles segmentados crecen con el viewport (4 pestañas de 280 px) | Media |

---

## A. Estilo y sistema de diseño

### AE-01 · Bloqueante visual — `--radius-pill` convierte la tarjeta de onboarding en un círculo

```
app.css:1726  .onboarding-card{...;border-radius:var(--radius-pill);padding:40px 28px 28px;max-width:340px;width:90%}
```

Medido: **340 × 345 px con `border-radius: 999px`** → el navegador clampa el radio a la mitad
del lado menor y la tarjeta se dibuja como un círculo. El texto ocupa 284 px de ancho contra una
cuerda disponible que se estrecha hacia arriba y hacia abajo, así que las dos líneas del párrafo
y el botón «Siguiente» quedan apretados contra la curva. En un móvil de 390 px se ve exactamente
así (primera captura del recorrido).

`--radius-pill` está declarado para botones y chips; usarlo en una tarjeta de texto es la regla
de oro violada por el token de forma. El radio correcto es `--radius-xl` (24 px), que es el de
`.panel` y `.sheet-panel`.

### AE-02 · Alta — las etiquetas del radar no son tokens y rompen el suelo tipográfico

```
js/ui/profile.js:87  + `fill="${color}" font-size="10.5" font-weight="${...}" `
app.css:703          --fs-2xs:.6875rem;   /* = 11px, el suelo declarado */
app.css:623          @media ≥1024 → --fs-2xs:.75rem (12px)  ← el radar NO escala
```

Medido: las siete etiquetas del radar («Fuerza máx», «Tracción», «Glicolítico», «Cardio»,
«Res. fuerza», «Core», «Movilidad») se computan a **10,5 px en móvil y en escritorio**. Es la
única tipografía de la app por debajo del suelo de 11 px que el sistema declara como decisión de
producto (`app.css:697-700`) y es la única que **no sube** con el escalón de escritorio, porque
el valor vive en un atributo SVG escrito a mano y no en una variable. El `DESIGN_SYSTEM` afirma
que la escala «sube un escalón entera» a partir de 1024: para este gráfico no es cierto.

### AE-03 · Alta — el token terciario se usa para texto informativo

```
app.css:107  --color-text-tertiary:rgba(var(--brown-700-rgb),.64)  /* 3,53:1 sobre surface-1 */
app.css:1088 .listrow-status--off{color:var(--color-text-tertiary)}
```

Medido en las pantallas reales: `.listrow-status` a **13 px y 3,54:1** («Solo los incluidos»,
«Sin configurar», «Sin copia»), `.dash-sched-context` a 13 px y 3,54:1 («Areté · Fase I — Media
Maratón 1h40 · Semana 8»). La tabla de contraste del propio sistema rotula ese par como
**«AA no textual»** — es decir, el sistema ya sabe que ese token no sirve para texto, y la UI lo
usa para texto que informa (el estado de la copia de seguridad, por ejemplo).

El secundario está calibrado al límite (`.80` → 4,96:1) justo porque el `.78` fallaba por tres
centésimas. El terciario necesita el mismo tratamiento: o sube a `.80` en los usos textuales, o
esos tres sitios pasan a `--color-text-secondary`.

### AE-04 · Media — tres hex fuera de la capa de tokens

```
app.css:1880  .quiron-quota--low .quiron-quota-bar>span{background:#f59e0b}
app.css:1972  #quironMicBtn.is-on{color:#e53935}
app.css:1979  .mic-bar-cancel:hover{color:#e53935}
app.css:1982  .mic-bar-dot{background:#e53935}
```

Total: 37 literales hex en la hoja y **4 usos fuera de `@layer tokens`**. Dos de ellos son el
mismo rojo de micrófono escrito tres veces, y ninguno es el `--red-*` de la marca. Son los
únicos puntos donde «si necesitas un valor que no es token…» no se cumple.

### AE-05 · Media — un icono de dominio se pinta con un primitivo

`js/ui/profile.js` inyecta el color de cada dominio como `style="color:${d.color}"`. Seis de los
siete usan tokens semánticos; uno usa `var(--red-200)`, que es un **primitivo** — y el sistema
prohíbe explícitamente que un componente consuma la capa primitiva. Medido: ese icono queda a
**1,7:1** sobre `surface-1` en tema claro, por debajo del 3:1 que la WCAG 1.4.11 pide para un
elemento no textual con significado. Los otros seis iconos están entre 3,3:1 y 3,7:1: pasan,
pero por poco.

### AE-06 · Media — 39 clases declaradas que no existen en ninguna plantilla

Comparadas contra todo `app.html` + `js/**`:

```
badge--info badge--success badge--warning calc-result cr-label cr-sub cr-value delete-zone f1
field-error leaflet-container listrow--stack listrow-meta mb2 panel-head prog-deload prog-up
prop-row--high prop-row--low prop-row--ok q-assistant q-user run-context-bar run-goal-nogoal
run-hist-actions run-seg-inputs run-share-card settings-group-title t-body-strong t-caption
t-display t-metric t-metric-lg t-title-lg tile-delta--down tile-delta--up toast-error
toast-info toast-success
```

Dos grupos distintos y con tratamiento distinto:

- **Piezas del sistema documentadas y nunca usadas** (`.t-display`, `.t-metric`,
  `.t-title-lg`, `.t-caption`, `.badge--success/warning/info`, `.toast-*`): el
  `DESIGN_SYSTEM` dice que las clases `.t-*` son *preferidas* a los tokens sueltos y que
  `.badge` tiene variantes. O se adoptan o se declaran fuera del sistema. Hoy son superficie de
  deriva: alguien las va a usar y van a estar sin probar.
- **Restos de pantallas reescritas** (`prop-row--*`, `cr-*`, `q-user`/`q-assistant`,
  `run-share-card`, `run-context-bar`, `delete-zone`, `calc-result`, `panel-head`,
  `settings-group-title`): CSS de componentes que ya no existen. `--z-sheet` apunta a hojas de
  «test de dominio» y el comentario de `app.css:2562` todavía describe una sección de Ajustes que
  ya es otra cosa.

### AE-07 · Baja — seis tokens declarados sin un solo `var()`

`--font-mono`, `--measure-table`, `--z-sheet`, `--z-sticky-context`, `--dur-pulse`,
`--ease-linear`. `--measure-table:100%` es el más llamativo: está documentado como una de las
cuatro medidas de contenido y no se aplica en ningún sitio.

### AE-08 · Media — dos vocabularios para «título de bloque»

| | clase | forma |
|---|---|---|
| Cuerpo, Perfil, Hoy | `.sec-title` | 12 px, versalitas, `--color-text-secondary` |
| Ajustes | `.group-title` | 22 px, 800, negro, caja alta y baja |

`app.css:217` vs `app.css:648`. Ambas cosas titulan un bloque dentro de una sección. En la misma
app, «ESTADO ACTUAL» y «Entrenamiento» son el mismo rango jerárquico con dos formas opuestas. El
sistema eligió versalitas («títulos de sección NO rojos, versalitas secundarias») y Ajustes es
la excepción sin declararlo.

### AE-09 · Media — dos anillos de foco distintos

```
app.css:200   select:focus,input:focus{background:var(--color-surface-1);box-shadow:0 0 0 2px var(--color-focus-ring)}
app.css:243   button:focus-visible,.btn:focus-visible{outline:2px solid var(--color-accent-text);outline-offset:2px}
```

El primero se dispara **también con el ratón** (`:focus`, no `:focus-visible`) y pinta un
`box-shadow` en vez de un `outline`, así que convive con el segundo en el mismo elemento. Efecto
visible medido: la hoja «Registrar medidas» abre con el campo de fecha autofocado y este queda
con un borde rojo de 2 px y fondo blanco, el elemento más llamativo de la pantalla después de
«Guardar medidas».

### AE-10 · Media — los numerales de nivel no tienen ancla textual

Los niveles se pintan como glifos romanos sueltos: `II`, `III`, `IV`, `—` (`js/ui/profile.js`,
`.prof-domain-lvl`). En el encabezado de Perfil hay un **«II» a 36 px centrado** que se lee como
un icono de pausa, no como «nivel 2». Dentro de las filas funciona porque lo acompaña el nombre
del dominio; en el encabezado está solo. Falta la unidad: «Nivel II de V» o «Nivel II · 2/5».

### AE-11 · Baja — hay dos marcas distintas en `assets/icons/` y la que sobra es la nueva

```
assets/icons/icon-16.png  ·  icon-32.png  ·  icon-192.png  ·  icon-512.png   → triángulo rojo + columna
assets/icons/icon.svg     (2026-09-24, sin una sola referencia)              → barra con discos en cuadrado rojo
```

Verificado: `grep -rn "icon.svg" app.html index.html sw.js scripts/` no devuelve nada. El
encabezado, el `manifest.json` y `index.html` usan `icon-192.png`; los cuatro PNG son la misma
marca. El SVG es otra cosa por completo y es el fichero más reciente del directorio.

No es cosmético: un asset de icono sin usar y con una marca distinta es exactamente lo que
termina de `favicon` por accidente, y entonces la pestaña del navegador y la app instalada
enseñan dos logos que no se parecen. Y al revés: a 24 px en la cabecera un SVG sería más nítido
en cualquier densidad de pantalla que un PNG de 192 escalado a la octava parte — pero no se
puede cambiar el uno por el otro sin decidir antes **cuál es la marca**. Dos salidas: unificar
en el triángulo (y borrar el SVG), o adoptar el SVG como marca única y reexportar los PNG.
Decisión de producto, no de código.

De paso, en el mismo sitio: la copia del onboarding de la app dice «Todo en tu **movil**, sin
cuenta, sin anuncios» (`app.html:1290`). Le falta la tilde, y es uno de los tres casos que el
pase de `UX-13` se dejó detrás.

---

## B. UX/UI por pantalla

### AU-17 · Alta — el ancho de la acción primaria no sigue una regla

**Estado: aplicado** (ver «Corrección aplicada» al final de este hallazgo; queda en el
árbol de trabajo, sin commitear).

El sistema ya lo dice, con estas palabras, en `app.css:333`:

> `.btn` ya NO es `width:100%`. Un "Iniciar sesión" de 1.100px en un monitor no es
> un botón, es una valla. El ancho completo es la excepción declarada de la acción
> principal de una hoja móvil, y se pide con `.btn--block`.

Y el diagnóstico del problema ya está escrito **componente a componente** más abajo
en la misma hoja («dejaban de ser vallas de ancho completo», «seis vallas del color
de la marca», «era el resto de un ancho completo de móvil»). Lo que no se hizo fue
**una regla**: la cura se aplicó tres veces a mano y las tres **empezaban en 1024**.

```
app.css:2404  #strTrain>.save-bar #saveWorkoutBtn{width:auto;min-width:240px;margin-left:auto}
app.css:2453  @media(min-width:1024px){.run-start-btn{width:auto;min-width:260px;margin-inline:auto}}
app.css:2467  .str-plan-start-btn.btn--block{width:auto;min-width:200px;margin-left:auto}
```

Tres `min-width` distintos (240 / 260 / 200), dos alineaciones distintas
(`margin-left` / `margin-inline`) y una franja entera **sin cubrir**: de 640 a 1023
ninguna de las tres aplica y el botón vuelve a ser el de móvil.

Medido con cada `.btn--block` visible en su sección:

| elemento | 1440 px | 900 px | 390 px |
|---|---|---|---|
| «Empezar entreno» / tarjeta de 560 | 528 px (**94 %**) | 528 px (**94 %**) | 318 px (91 %) |
| «Iniciar sesión» (Plan) / tarjeta de 560 | 200 px (36 %) | 528 px (**94 %**) | 318 px (91 %) |
| «Importar del reloj» / panel de 1116 | 260 px (23 %) | 520 px (**93 %**) | 350 px (90 %) |

La misma clase en la misma app: al 94 % de su contenedor en una pantalla y al 23 % en
otra, y la peor de las tres —la que no tenía excepción— es «Empezar entreno»: 528 px
de relleno rojo en un monitor.

**Corrección aplicada** (`app.css` §3.1 capa de sistema; `app.html`; `js/ui/nav.js`).
La regla sube a la capa de sistema y **empieza en 640**:

```css
.btn--block{width:100%}
@media(min-width:640px){
  .btn--block{width:auto;min-width:200px}
  .btn--end{display:flex;width:fit-content;margin-inline-start:auto}
}
```

Se borran las tres excepciones locales. Las dos que anclaban a la derecha pasan a ser
`btn--end` en la plantilla (`#saveWorkoutBtn`, `str-plan-start-btn` ×2), que es
exactamente lo que ya hacían; la que anclaba a la izquierda (`.run-start-btn`) no
necesita nada. Verificado después del cambio: **200 px a 1440, 200 px a 900 y 318 px
(ancho completo) a 390** en los tres casos; `915/915` tests en verde.

Por qué 640 y no 1024: por debajo de 640 el ancho completo es correcto —el pulgar, una
mano, y el contenedor es tan estrecho que no hay nada que ganar—; de 640 arriba no hay
ningún caso donde estirar ayude. `min-width:200px` no es decoración: es lo que mantiene
un objetivo grande sin estirarlo. Las referencias lo dicen igual: Apple pide un
objetivo de **44×44 pt** —alto y ancho, no ancho de pantalla— y ordena la importancia
por orden de lectura, no por superficie; Material mantiene la etiqueta centrada dentro
del botón y deja que el ancho lo fije el contenido; Volvo define el primario como «la
única acción más importante del viewport», no como su elemento más grande.

**Decisión de alineación, dicha entera.** El ancla es el borde **final** de la fila. Es
la regla de Carbon para diálogos y asistentes («the primary button will be right-aligned
and appear to the right of the secondary/tertiary button within wizards and dialog
windows») y es lo que ya seguía la app en la cabecera de pantalla, en
`.str-plan-start-btn` y en `#saveWorkoutBtn`. Carbon y GOV.UK prescriben el borde
**inicial** para el pie de un formulario de página completa («Align the primary action
button to the left edge of your form»); Areté **no tiene** pies de formulario en la
página —sus formularios viven en hojas— así que esa regla no aplica aquí y no se
contradice. Lo que sí se descarta es el centrado, que no es la convención de ninguno de
los sistemas consultados.

### AU-18 · Media — los controles segmentados crecen con el viewport

En escritorio, la sub-nav de Entrenar (Actividad · Historial · Progreso · Plan) mide
**280 px por pestaña en una barra de 1132 px**. Es el mismo error que AU-17 con otro
componente: la barra es `display:flex` con `flex:1` en cada pestaña, así que crece con
la pantalla. Un control segmentado de cuatro opciones cortas no necesita 1.132 px: se
mide por contenido y se queda donde el ojo lo busca. **No aplicado**: el prototipo lo
corrige con `width:fit-content` desde 640, pero la app a partir de 1024 tiene la
navegación secundaria resuelta como columna, así que merece su propia vuelta.

### AU-01 / AU-16 · Alta — el onboarding es un círculo sin salida que no captura nada

Tres pasos («Areté» → «Registra tus series» → «Timer de descanso») con un único botón
«Siguiente» (`js/app.js:223-239`). No hay «Saltar», ni cerrar, ni Escape: la única forma de ver
la app es pulsar tres veces. Y cuando termina, la app queda en una base vacía sin pedir peso,
altura ni un test — el primer paso real del producto lo tiene que adivinar el atleta. Es el
hallazgo `F11`/`UX-2` del audit de agosto, todavía abierto: `js/ui/wizard.js` existe, sigue en el
precache de `sw.js:163` y **no lo importa nadie**.

Que el círculo (AE-01) sea además el primer contacto con el producto no es cosmético: la
primera pantalla de Areté es la que peor representa su sistema de diseño.

### AU-02 · Alta — la pared de «atrasada» en Hoy contradice su propio mensaje

Estado real medido con el fixture de 94 entrenos: la tarjeta «Toca hoy» muestra, en rojo,

> **7 sesiones atrasadas — se re-acomodan solas**

y debajo **siete filas, cada una con la etiqueta «atrasada»** en rojo. El mismo hecho aparece
ocho veces, y el titular se contradice con la etiqueta: si se re-acomodan solas, no están
atrasadas. La única acción disponible es «Empezar» en la primera fila; las otras seis no llevan
a ningún sitio útil. Para un atleta que vuelve después de dos semanas, la primera pantalla del
producto es una lista de reproches con 7 rojos y ninguna decisión.

La información que hace falta es una línea de estado («Al día · 2 sesiones esta semana») y la
cola plegada: cuántas quedan y la acción de hoy.

### AU-03 · Alta — en la captura, el primer campo está bajo el pliegue

Medido en 390×844 sobre `Entrenar → Actividad`: antes del primer input de kg hay

| bloque | alto aprox. |
|---|---|
| fila 1 (Fuerza / Carrera) | 44 px |
| fila 2 (Areté / Fase I) | 44 px |
| fila 3 (Actividad / Historial / Progreso / Plan) | 44 px |
| Fecha + Sesión | 80 px |
| banner «Cargada tu última sesión A» | 50 px |
| barra de descanso con sus chips y el botón de play | ~150 px |
| dots de ejercicio + «Modo guiado» | ~80 px |

≈ **490 px de chrome** antes de «Sentadilla 3×5», y el primer par KG/REPS cae alrededor de
y = 740, por debajo del pliegue y parcialmente tapado por la barra fija de descanso. La pantalla
que el atleta usa **sudando y entre series** es la que más scroll necesita para llegar al campo.

No es un problema de densidad: es que tres controles de navegación (modo, programa/fase,
pestaña) están apilados arriba de la pantalla de captura cuando dos de ellos no cambian durante
la sesión. Deberían colapsar en una sola línea cuando la sesión está empezada.

### AU-04 · Alta — el Historial es un volcado, no un historial

Medido: la lista renderiza **3.966 px de alto en móvil** y termina en «Ver 79 anteriores». Cada
sesión imprime los seis ejercicios con sus series en crudo:

```
Sentadilla         100×5 · 100×5 · 100×5
Press Militar      43.75×5 · 43.75×5 · 43.75×5
Clean              55×3 · 55×3 · 55×3 · 55×3 · 55×3
Dominada Supino    12
Plancha Lateral    1min
```

«100×5 · 100×5 · 100×5» son 26 caracteres para «3×5 @ 100 kg». El «12» de dominadas y el «1min»
de la plancha van sin unidad ni contexto — dos formatos distintos de dato en la misma columna.
Y no hay resumen de sesión: la fecha, el número de series y el volumen son lo que el atleta
busca al mirar atrás; las series sueltas son el detalle.

### AU-05 · Alta — Quirón: el placeholder se corta y la cabecera se comprime

Medido en 390 px:

```
textarea  altura 44 px · clientHeight 44 px · scrollHeight 64 px
placeholder «Pregunta a tu coach…»  → se dibuja en dos líneas y la segunda queda cortada
```

La causa es que el `textarea` del panel tiene alto fijo y `white-space: pre-wrap` en el
placeholder; en escritorio (donde el panel es más ancho) no se ve porque cabe en una línea.

En la misma pantalla, la cabecera mete en 390 px el título «QUIRÓN _tu coach_» más **cuatro
botones etiquetados** (Informe, Memoria, Historial, Nueva) más el cierre. Medido: el último botón
termina en x = 334 y el de cerrar empieza antes de 378 — quedan ~44 px entre etiqueta y aspa.
Encima, `QUIRÓN` está a 22 px y peso 800: el título del agente pesa más que el título de
cualquier pantalla de datos.

### AU-06 · Media — Cuerpo: cinco tiles de calorías que solo entiende el que las escribió

«Calorías estimadas» apila cinco cifras con notación de multiplicador sin desplegar:

```
TMB (MEDIA) 1720 · Mantenimiento 2838 ×1,65 · Volumen 3121–3263 +10 a 15%
Definición 2412 −15% · Def. máxima 1659 ×22/kg
```

Es la sección más densa de la app y la única donde el significado no se deduce del dato. El
«×1,65» y el «×22/kg» son constantes del modelo, no decisiones del atleta.

Hay además un tile cuyo valor es «SIN MEDIR» con el subtítulo «9 medidas»: un tile de métrica
cuyo número no es un número.

### AU-07 · Media — «Editar» ocho veces

En la tabla «Historial corporal», las 8 filas llevan un botón `Editar` a la derecha. El sistema
declara que un objetivo táctil mide 44 px y que la acción terciaria es *ghost*; aquí la acción
terciaria es el elemento más repetido de la pantalla y compite con el único rojo («Registrar
medidas»). El patrón correcto ya existe en la app: la fila es el objetivo y abre el detalle.

### AU-08 · Media — cinco objetivos táctiles por debajo de 44 px en Hoy

Medidos uno a uno en la tarjeta «Toca hoy»:

```
.dash-sched-overdue        «7 sesiones atrasadas»
.dash-sched-hint-link      «Cámbialos en Ajustes»
.dash-sched-hint-dismiss   «×»
.dash-sched-pie-link   ×2  «Fuerza · Areté Fase I» / «Carrera · Media Maratón 1h40 · Semana 8»
```

El sistema dice «objetivo táctil ≥44 px» y en la tarjeta más densa del producto cinco de sus seis
objetivos no lo cumplen. El «×» de descartar es especialmente caro: es un objetivo de 1 carácter
junto a un enlace de tres líneas.

### AU-09 · Media — «Programac semanal» partida a mitad de palabra

En Ajustes, la fila `Programación semanal` con valor «Fuerza L·X·V · Running M·J·D» deja al
nombre un ancho tal que el navegador lo parte como **«Programac» / «semanal»** — sin guion, sin
`hyphens`, sin `text-overflow`. El nombre de la fila es el dato más importante y es el que se
degrada. La app ya tiene la solución para esto en el Historial (`.hi-ex` con `ellipsis` y una
cota declarada en `app.css:975`): aquí falta.

### AU-10 · Media — barra segmentada sin leyenda

«Próxima sesión» en Carrera pinta una barra de tres colores (verde / naranja / gris) que
representa la semana en curso. No hay etiquetas, ni leyenda, ni título accesible que explique
qué significa cada tramo. Un atleta que ve verde y naranja deduce que verde es bueno, pero no
puede saber si naranja es «parcial», «atrasado» o «otro tipo de sesión».

### AU-11 · Media — tres barras de pestañas apiladas

`Entrenar` apila en móvil: (1) Fuerza / Carrera, (2) Areté / Fase I, (3) Actividad / Historial /
Progreso / Plan. Son tres controles segmentados idénticos con tres alcances distintos, y el
primero y el segundo no son pestañas de la misma naturaleza (uno elige modo, el otro elige plan y
fase). En escritorio los dos primeros se mueven a la derecha del título `ENTRENAR` y la pantalla
respira; en móvil quedan los tres apilados, que es donde peor se leen.

### AU-12 · Alta — Progreso: la gráfica mezcla las variantes A y B del plan

```
js/ui/progress.js:118-132   todos los entrenos del programa con ese ejercicio → un punto cada uno
```

Medido con el fixture: «Sentadilla» sale en Sesión A a 100 kg y en Sesión B a 110 kg, y la
gráfica «Peso máx (kg)» las pinta **en orden de fecha, mezcladas**. El resultado es un serrucho
de ±10 kg con más de 100 vértices en el que la tendencia real —que sube— es invisible. El atleta
no ve progreso donde lo hay: ve ruido.

La causa es la misma que documenta `AGENTS.md` para la progresión («el hilo de progresión es
(ejercicio, objetivo de reps)»): la serie de un ejercicio **no es única** si aparece en más de
una sesión del plan con pesos distintos. El motor de progresión ya lo sabe; el gráfico no.

### AU-13 · Alta — PR en cada repetición del récord

```
js/ui/progress.js:226   const isPR = p[metric] === pr;
```

Es igualdad, no «mayor que». Medido en la tabla «Historial de Sentadilla»: las filas del 27/07,
03/08 y 05/08 — todas a 110 kg, todas iguales al máximo histórico — llevan la insignia roja
`PR`, y como el plan alterna A (100 kg) y B (110 kg), **prácticamente una fila de cada dos sale
marcada como récord personal**, con el fondo teñido en rosa. Tres PR en nueve días por el mismo
peso no es un récord: es un recordatorio de que el valor se repite.

### AU-14 · Media — «1RM estimado» y «Peso máx» conviven sin explicarse

Arriba de la misma pantalla, el tile dice «Sentadilla **128,3 kg** — 110 kg × 5»; en la gráfica
de abajo, «Peso máx (kg)» llega a **110**. Son dos métricas distintas (Epley sobre la serie vs.
la carga levantada) con el mismo aspecto y sin ninguna línea que explique la diferencia. El
atleta que vio 128 arriba lee 110 abajo como una pérdida de fuerza.

### AU-15 · Baja — «1 ejercicios»

Medido en la tarjeta de sesión: `HIIT-1` se anuncia con **«1 ejercicios»** y lista cinco
movimientos (Dominadas, Flexiones, Sentadillas, Escaladores, Saltos). El rótulo no concuerda ni en
número ni en unidad: cuenta bloques, no ejercicios. Falta pluralización y falta decir qué cuenta.

---

## C. Lo que esta auditoría no cubrió

Para que el siguiente pase no repita trabajo:

- **Carrera en vivo** (`run-live`) más allá de su barra de pestañas: es un overlay con su propia
  lógica y el audit móvil ya decidió no tocarlo.
- **Editor de compartir** (`js/ui/share-editor.js`): solo se miró su lienzo oscuro. Su flujo
  completo sigue sin auditar desde agosto.
- **Lector de pantalla con VoiceOver/TalkBack real.** Se verificó lo automatizable (ningún botón
  sin nombre accesible, `aria-live` en toasts, tabla `sr-only` del radar) pero no hay recorrido
  integral.
- **Tablet 640–1024** y **pantallas ≥1920**, que el checklist del sistema exige verificar.
- **Rendimiento**: `saveDB` sigue serializando la base entera de forma síncrona por escritura
  (deuda declarada, sin medir).
- **Tema oscuro pantalla por pantalla**: se midió contraste de tokens en oscuro y se capturaron
  Hoy y Perfil, pero no hay barrido de las cinco secciones y las hojas.
- **Conflicto de sincronización como experiencia** (`js/sync/merge.js` tiene tests, nadie ha
  auditado qué ve el atleta cuando hay conflicto).

---

## D. Anexo · estado de la deuda anterior

Lo que los documentos previos dejaban abierto y sigue abierto hoy, verificado:

| previo | estado verificado 2026-09-29 |
|---|---|
| `F3` sembrado de entreno falso a usuarios nuevos | **abierto** — `seedInitialData` sigue existiendo |
| `F11` / `UX-2` onboarding sin captura | **abierto** — ver AU-01/AU-16 |
| `F13` dos mecanismos de «serie hecha» sin undo | **abierto** |
| `F14` objetivos de fuerza hardcodeados | **abierto** |
| `F15` Leaflet por CDN fuera del precache | **abierto** |
| `F19` 41 citas motivacionales | **abierto** — se ven en Hoy |
| `F5` contraste del terciario | **abierto y peor de lo documentado** — ver AE-03 |
| `MA5` `aria-modal` del detalle a ≥1024 | **abierto** |
| `MA6` dos temporizadores de descanso en paralelo | **abierto** |
| `MA8` ejercicios de texto libre que no mueven el nivel | **abierto** |
| `D-3` copia Android desincronizada | **abierto** |
| `D-4` parser `.FIT` | **abierto** |
| `D-5` `saveDB` síncrono | **abierto** |
| `DS-1` bloque `:root.dark` medio muerto en la capa `tokens` | **abierto** |
| `DS-7` `.sec-title-accent` vivo como alias vacío | **abierto** |
| `UX-1` limitante en Hoy | **cerrado** — `.dash-level` lleva a Perfil y resalta el dominio |
| `UX-3/4/5/6/7/8/9/10/11/12/13/16` | **cerrados** (toast `aria-live`, errores de Quirón por clase, diagnóstico de sync, zonas FC con forma, tabla `sr-only`, CTA de estado vacío, tildes) |
