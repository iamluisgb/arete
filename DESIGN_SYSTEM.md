# Design system de Areté

Cómo se construye la interfaz de Areté y por qué. No es un catálogo: es el conjunto de reglas que
permiten **rechazar** un diseño concreto. Si una decisión de esta página no sirve para decir "esto
no", sobra.

La fuente de verdad viva es [`app.css`](app.css): este documento explica lo que hay ahí y lo que
falta por llevar allí. Cuando los dos discrepen, gana el CSS y este documento está desactualizado.

**Estado: terminado.** Las nueve pantallas están migradas, los alias heredados borrados, la hoja
organizada en capas de cascada y el inventario cerrado: fuera de `:root` no queda ningún color,
`z-index`, duración ni radio escrito a mano. Lo que sigue es el sistema, no un plan.

---

## 1. El inventario, que es el argumento

Antes de proponer nada hay que contar lo que hay. Estas son las cifras del `app.css` de partida
(1.607 líneas, 1.281 reglas):

| Qué | Cuántos había | Cuántos hay en el sistema |
| --- | --- | --- |
| Radios de esquina distintos | **24** (`16px`, `24px`, `20px`, `10px`, `8px`, `2px`, `6px`, `12px`, `3px`, `18px`, `14px`, `7px`, `5px`, `4px`, `22px`, `15px`, `19px`, `9px`, `50%`…) | **6** + `pill` + `50%` |
| Valores de `z-index` distintos | **18** (`1, 40, 45, 46, 50, 55, 60, 90, 95, 100, 101, 200, 210, 250, 260, 300, 500, 600`) | **16 con nombre**, escala documentada |
| Duraciones de animación/transición | **22** entre `transition` y `animation` (`.05s`→`3s`, más `200ms`) | **4** |
| Tamaños de botón distintos (padding + cuerpo + alto mínimo) | **49** | **3** (`sm`/`md`/`lg`) |
| Colores literales usados como color, fondo o borde | **52** — de ellos **19 neutros/grises** distintos y **33 hex** sueltos, más **64 rgba()** | **2 niveles**: 22 primitivos, 30 semánticos |
| Custom properties en `:root` | **45**, todas en un solo nivel, mezclando primitivo y significado | **~110**, en dos niveles + alias |
| Selectores que son un botón | **66** clases distintas | 1 componente con 3 ejes |
| Clases que contienen "card" | **25** | 1 componente (`.panel`) + los que quedan por migrar |
| Pesos de fuente | 6 (`300`→`800`) sin roles | **9 roles** que atan tamaño+peso+interlineado+tracking |
| `letter-spacing` distintos | **16** | atados a los roles |
| `width:100%` en la hoja | **51** | `.btn` deja de ser uno de ellos: `.btn--block` se usa **9 veces** |
| `style=""` inline | **58** en `app.html` + **76** en plantillas JS + **122** `.style.X =` desde JS | los que quedan sirven para pasar un color de dato (el color de un dominio, el de una zona), no para maquetar |

La conclusión que sale sola del inventario: **no había un sistema, había sedimento**. Cada pantalla
añadió su propio radio, su propio gris y su propio tamaño de botón porque no existía el sitio donde
mirar cuál usar. Todo lo que sigue es ese sitio.

---

## 2. Principios

Cinco. Cada uno tiene que poder rechazar algo concreto.

### 2.1 El escritorio gana densidad, no tamaño

Ningún componente crece al pasar de móvil a escritorio: crecen **en número por fila**. Un
`MetricTile` mide lo mismo en un iPhone que en un monitor de 27"; lo que cambia es que en el móvil
caben dos y en el monitor ocho.

> Rechaza: ensanchar una tarjeta de sesión a 1.100px; una fila `S1 · kg · reps` estirada hasta que
> la etiqueta de serie se separa de sus campos; un formulario a ancho de shell.

La única excepción declarada es la **escala tipográfica**, que sube un escalón entero a partir de
1024px: un texto de 14px a 60cm se percibe como uno de 8px a 35cm. Es física, no estética.

### 2.2 Capturar y consultar no comparten plano

Una pantalla o te está preguntando algo o te está contando algo. Si hace las dos cosas a la vez, el
usuario no sabe cuál es. La entrada de datos que no es la tarea principal de la pantalla vive en una
hoja invocada; la pantalla por defecto es la de lectura.

> Rechaza: la Cuerpo anterior, once campos vacíos apilados sobre cuatro paneles de resultado.

### 2.3 Una sola acción primaria en rojo por vista

El rojo `#d4372c` es la marca. Hoy se usaba para la acción primaria, los títulos de sección, las
cifras destacadas, los chips, los enlaces y el botón de borrar. Un acento que aparece diez veces por
pantalla deja de acentuar y se convierte en textura.

**Presupuesto:** un relleno rojo por vista. La segunda acción es `--secondary`; la tercera,
`--ghost`. Los títulos de sección **no** son rojos: son `--color-text-secondary` en versalitas. Lo
destructivo usa el rojo de **estado**, no el de marca, y nunca compite con la acción primaria en la
misma fila.

> Rechaza: diez botones "Editar" rojos en las filas de una tabla (lo que hacía el historial
> corporal).

### 2.4 El estado nunca se marca con una barra de acento lateral

Ni `border-left` de color, ni inset lateral, en ninguna tarjeta, fila o alerta. El ojo lo lee como
decoración de borde, no como estado. El estado se marca con **fondo, tipografía, icono o punto**.

> Regla del dueño del producto, no negociable. Rechaza cualquier `border-left:3px solid var(--…)`.

### 2.5 Si necesitas un valor que no es un token, o falta el token o el diseño está mal

Es la regla de oro y la única forma de que el inventario no se vuelva a llenar de sedimento. Un
`padding:9px 13px` escrito a mano es siempre una de dos cosas: un token que falta (dilo y añádelo) o
una decisión que no se sostiene (deshazla).

---

## 3. Tokens

Dos niveles, y la disciplina está en la frontera entre ellos.

### 3.1 Primitivos

Valores crudos, sin significado: `--red-600`, `--sand-200`, `--ink-800`, `--green-400`. **Un
componente no los usa nunca.** Solo se leen desde la capa semántica. Si ves `var(--red-600)` en una
regla de componente, falta un semántico.

Los que se combinan con alfa se guardan como canales RGB (`--brown-700-rgb: 93,63,59`) para poder
escribir `rgba(var(--brown-700-rgb), .8)`.

### 3.2 Semánticos

Dicen para qué sirve el color, no cuál es:

- **Superficies:** `--color-surface-0` (lienzo) · `-1` (tarjeta, panel) · `-2` (campo, chip, pista) ·
  `-3` (hover de una superficie 1) · `--color-surface-glass`.
- **Texto:** `--color-text-primary` / `-secondary` / `-tertiary` / `-inverse`.
- **Bordes:** `--color-border-subtle`, `--color-border-ghost`.
- **Acción:** `--color-action-primary` (el relleno del botón), `--color-action-primary-fg` (el texto
  sobre ese relleno), `--color-accent-text` (el acento cuando es texto o icono),
  `--color-accent-soft`, `--color-accent-wash`, `--color-accent-glow`, `--color-focus-ring`.
- **Estado:** `--color-state-success` / `-warning` / `-danger` / `-info`.
- **Dominio:** `--color-domain-strength` (rojo) y `--color-domain-running` (cian). Son dominios, no
  estados: carrera no es "info".

**Por qué la acción tiene dos tokens y no uno.** Porque el relleno de un botón y el acento
tipográfico tienen requisitos de contraste **opuestos**, y en el tema oscuro divergen. Ver §3.3.

### 3.3 Contraste, medido

Todas las cifras son ratios WCAG 2.1 reales, con el alfa compuesto sobre cada fondo. Si cambias un
color, vuelves a medir y actualizas esta tabla y el comentario de `app.css`.

**Tema claro** — fondos `bg #f4f2f0` · `surface #fff` · `surface2 #ebe8e5` · `high #f0eeeb`:

| Token | bg | surface | surface2 | high | Veredicto |
| --- | --- | --- | --- | --- | --- |
| `--color-text-primary` | 15,39 | 17,19 | 14,08 | 14,84 | AAA |
| `--color-text-secondary` | 4,96 | 5,34 | **4,68** | 4,85 | AA de texto |
| `--color-text-tertiary` | 3,36 | 3,53 | **3,23** | 3,30 | AA no textual (1.4.11) |
| `--color-action-primary` | 4,29 | 4,79 | 3,93 | 4,14 | — |
| blanco sobre la acción primaria | — | — | — | — | **4,79** → AA |

El alfa `.80`/`.64` del secundario y el terciario está calibrado al límite: con `.78`, el secundario
caía a **4,46** sobre `surface2` y fallaba el AA por tres centésimas justo dentro de las tarjetas.
No es un número redondo por casualidad.

**Tema oscuro** — fondos `bg #131313` · `surface #201f1f` · `surface2 #2a2a2a` · `high #353534`:

| Token | bg | surface | surface2 | high | Veredicto |
| --- | --- | --- | --- | --- | --- |
| `--color-text-primary` | 14,42 | 12,76 | 11,14 | 9,53 | AAA |
| `--color-text-secondary` | 7,02 | 6,42 | 5,76 | 5,07 | AA de texto |
| `--color-text-tertiary` | 4,85 | 4,57 | 4,21 | 3,80 | AA de texto |
| `--color-accent-text` (`#ff5545`) | 5,87 | 5,20 | 4,54 | 3,88 | AA sobre el lienzo |

**Y una corrección que trae este pase.** El relleno de la acción primaria en oscuro era `#ff5545`
con texto blanco: **3,16:1**. Falla el AA de texto en el botón más importante de la aplicación, y
llevaba así desde que existe el tema oscuro. Arreglado partiendo el token:

- `--color-accent-text` se queda en `#ff5545` (5,87:1 sobre el lienzo — el acento tipográfico pasa).
- `--color-action-primary` baja a `#d4372c`, donde el blanco da **4,79:1** y el propio botón
  conserva **3,88:1** contra el fondo, por encima del 3,0 que pide 1.4.11 para un componente.

Es exactamente el motivo por el que la acción tiene dos tokens.

### 3.4 Los alias heredados, borrados

Aquí vivieron `--bg`, `--surface`, `--surface2`, `--text`, `--text2`, `--text3`, `--accent`,
`--green`, `--red`, `--teal`, `--radius` y compañía, apuntando a la capa semántica mientras duraba la
migración. **Ya no existen**: no queda un solo uso ni en `app.css`, ni en las plantillas de `js/`, ni
en los SVG inline de `app.html`. Borrarlos era la condición para dar la migración por terminada.

Si vuelve a aparecer uno de esos nombres es que alguien ha copiado código de un commit viejo.

### 3.4b Las familias de color que no son superficies

Cuatro familias existen aparte del sistema de superficies, y cada una tiene su razón:

- **Categóricos** (`--cat-violet`, `--cat-orange`, `--cat-amber`, `--cat-indigo`). Los modos de
  ejercicio —EMOM, superserie, escalera, workout— no son estados ni dominios: son categorías **sin
  orden**. Meterlos en la escala de estado haría que "superserie" pareciera un aviso.
- **Blackout** (`--color-blackout*`). La pantalla de bloqueo de la carrera es negra de verdad, para
  que el móvil no gaste batería en el bolsillo. No sigue el tema porque no es una superficie de la
  app: es la ausencia de una.
- **Overlay** (`--color-overlay-*`). El editor de compartir es oscuro en los dos temas: encima se
  previsualiza una imagen, y un lienzo claro falsearía cómo va a quedar.
- **Share card** (`--share-card-*`). Las dos tarjetas de compartir son una **imagen que se exporta**
  y se manda por WhatsApp: se dibujan claras siempre, porque la ve alguien que no tiene tu tema
  puesto. Es la única excepción declarada al sistema de superficies.

### 3.5 Tipografía

La escala `--fs-2xs` → `--fs-4xl` se audita y se queda: el suelo de 11px y el cuerpo de 14px son una
decisión de producto argumentada ("se lee con el móvil en el suelo, sudado, entre series"), y a
partir de 1024px sube un escalón **entera**, redefiniendo los tokens y no `html{font-size}` — eso
descoordinaría los px literales de iconos, toggles y radios.

Lo que faltaba eran los **roles**, que atan las cuatro propiedades:

| Rol | Uso |
| --- | --- |
| `--type-display` | La cifra o el saludo que domina una pantalla |
| `--type-title-lg` | Título de pantalla o de hoja |
| `--type-title` | Título de tarjeta |
| `--type-body` / `--type-body-strong` | Texto corrido y su versión de énfasis |
| `--type-caption` | Apoyo, meta, notas |
| `--type-label` | Etiquetas en versalitas |
| `--type-metric` / `--type-metric-lg` | **Cifras.** Siempre `tabular-nums` |

Dos cautelas prácticas:

1. El shorthand `font:` **no** admite `letter-spacing`, así que cada rol viene con su `--track-*`.
2. El shorthand `font:` **resetea** `font-variant-numeric`. Por eso las clases `.t-*` existen: aplican
   las cuatro propiedades y ponen las cifras tabulares donde tocan. Úsalas en vez de los tokens
   sueltos salvo que necesites componer.

**Las cifras siempre `tabular-nums`.** Una columna de números que baila al cambiar de dígito no se
compara de un vistazo, y este producto son números.

### 3.6 Espaciado

Tres capas, y la de layout es la que da la densidad:

- **Escala base:** `--sp-1` (4px) → `--sp-10` (40px). No cambia.
- **De componente:** `--pad-y-sm/md/lg` y `--pad-x-sm/md/lg` — el relleno interno por tamaño de
  control. Un botón `sm` y un chip `sm` comparten estos dos valores; no se los inventan.
- **De layout:** `--gap-tight` (dentro de una fila), `--gap-stack` (entre tarjetas), `--gap-group`
  (entre bloques de una sección), `--gap-section` (entre secciones y entre columnas), `--pad-card`.

**La densidad cambia por breakpoint desde el token.** A partir de 1024, `--pad-card` sube a 20 y
`--gap-stack` a 16: con ratón el relleno de tarjeta se aprieta y la separación entre bloques se abre,
que es lo contrario de lo que hace el móvil. Un componente que usa estos tokens cambia de densidad
sin escribir un solo media query propio.

### 3.7 Radios, sombras, profundidad, movimiento

- **Radios:** `--radius-xs` 6 · `-sm` 8 · `-md` 10 · `-lg` 16 · `-xl` 24 · `-pill` 999. Más `50%`
  para lo circular. De 24 valores a 6.
- **Sombras:** `--shadow-1` (pegado) · `-2` (flotando) · `-3` (sobre todo lo demás) ·
  `--shadow-action` (la única teñida de acento, exclusiva del botón primario) · `--shadow-panel`.
  Son elevación, no decoración. `.panel` no lleva sombra: la separación la da el salto de superficie,
  y en oscuro las sombras no separan nada.
- **Profundidad:** escala nombrada, y el nombre dice qué tapa a qué:
  `--z-raised` 1 · `--z-sticky-action` 40 · `--z-sticky-dots` 45 · `--z-sticky-mini` 46 ·
  `--z-sticky-timer` 50 · `--z-sticky-context` 55 · `--z-header` 60 · `--z-runner` 90 ·
  `--z-sheet` 95 · `--z-nav` 100 · `--z-overlay` 200 · `--z-overlay-top` 210 · `--z-toast` 250 ·
  `--z-toast-top` 260 · `--z-alert` 300 · `--z-immersive` 500 · `--z-immersive-top` 600.
  **Nada nuevo se escribe fuera de esta escala.** Si tu caso no cabe, es que hay un conflicto de
  arquitectura, no un número que falta.
- **Movimiento:** `--dur-instant` .1s (respuesta al dedo) · `--dur-fast` .15s (color, hover) ·
  `--dur-base` .2s (panel, pestaña) · `--dur-slow` .3s (hoja, barrido). Curvas:
  `--ease-standard`, `--ease-sheet`, `--ease-linear`. Toda animación nueva respeta
  `prefers-reduced-motion`, que ya está resuelto globalmente al final de la hoja.

---

## 4. Layout y responsive

### 4.1 Breakpoints, y qué cambia conceptualmente en cada uno

| | Qué cambia |
| --- | --- |
| **< 640** | Una columna. Navegación abajo, al alcance del pulgar. Objetivos ≥44px. Las hojas suben desde abajo. |
| **≥ 640** | La columna se ensancha a 600px y se centra. La nav sigue abajo. Los modales dejan de ser hojas: radio completo y `fadeIn`. |
| **≥ 1024** | **La nav se convierte en rail lateral** y `--nav-h` pasa a 0. Aparecen las segundas columnas. La escala tipográfica sube un escalón. Aparecen `:hover` y los atajos de teclado. |
| **≥ 1440** | Tercera columna donde aporta. El contenido no crece más de 1.180px: pasado ese ancho, una línea deja de leerse. |

El `@media(min-width:700px)` de la carrera en vivo es aparte a propósito: es un overlay sin nav y su
umbral responde a que quepan panel y mapa, que es otra pregunta.

### 4.2 La shell

`--shell` (ancho del contenido), `--nav-h` (alto de la nav inferior), `--rail-w` (ancho del rail).
Todo lo fijo que tenga que alinearse con el contenido —la barra de detalle, el editor de compartir,
los toasts, el panel de Quirón— **sale de estas tres variables**. Antes el ancho estaba escrito a
mano en seis sitios y cualquier cambio dejaba elementos descentrados.

El rail plegable añade `--rail-w-open` (232) y `--rail-w-icon` (64). Ni 232 ni 64 se escriben a mano
en ninguna otra regla.

### 4.3 Medidas máximas por tipo de contenido

No todo debe ocupar la shell:

| Token | Valor | Para qué |
| --- | --- | --- |
| `--measure-prose` | 46rem | Texto seguido. El óptimo son 45–75 caracteres; el chat de Quirón sin esto son ~200 por línea |
| `--measure-form` | 520px | Un formulario **no se ensancha nunca** |
| `--measure-panel` | 560px | Filas etiqueta-valor y filas de serie |
| `--measure-table` | 100% | Una tabla vale más cuantas más columnas se vean a la vez |

### 4.4 Capas de cascada

`app.css` está organizado en `@layer`, y el orden está declarado una sola vez arriba del fichero:

```css
@layer tokens, base, sistema, pantallas, escritorio, overrides;
```

A partir de ahí, **quién gana un empate de especificidad lo decide la capa, no quién está más abajo
en el fichero**. Eso es lo que permite reordenar sin miedo, y es la razón por la que las capas no
entraron en la fase 1: una regla dentro de una capa pierde *siempre* contra una sin capa, así que
meterlas a medias habría invertido la cascada de todo lo que se moviera. Entraron de una vez cuando
ya no quedaba nada fuera.

| Capa | Qué contiene | Reglas |
| --- | --- | --- |
| `tokens` | primitivos, semánticos, escalas. Ningún selector real | 14 bloques |
| `base` | el reset, los selectores de elemento, cuatro utilidades de layout | 52 |
| `sistema` | los componentes de §5 | 106 |
| `pantallas` | lo propio de cada pantalla. **Gana al sistema por definición**: una pantalla ajusta su componente, nunca al revés | 941 |
| `escritorio` | todo lo que vive dentro de un `min-width`. Gana a lo anterior porque es una decisión tomada con más información, no una excepción | 18 |
| `overrides` | `prefers-reduced-motion`, estados de puntero, barras de scroll | 15 |

El reparto dice algo por sí solo: **106 reglas de sistema contra 941 de pantalla**. Un design system
honesto no pretende que todo sea componente reutilizable; pretende que lo que se repite lo sea.

### 4.5 Container queries

Están declaradas como la herramienta correcta para el componente que debe adaptarse a **su
contenedor** y no al viewport, pero **no ha hecho falta ninguna**: `grid-template-columns:
repeat(auto-fill, minmax(…, 1fr))` resuelve `MetricTile`, la rejilla de medidas y los récords sin
consultar nada, y es más barato. La única adaptación al contenedor que sí hizo falta —colapsar la
rejilla de Actividad cuando no hay sesión en curso— es una consulta sobre el **contenido**, no sobre
el ancho, y para eso la herramienta es `:has()`. Se usarán container queries cuando aparezca el
primer caso que de verdad dependa del ancho del contenedor.

---

## 5. Componentes

Convención de nombres: **prefijo por módulo + BEM ligero**. `bloque`, `bloque-elemento` con un guion,
`bloque--modificador` con dos. `.btn`, `.btn--secondary`, `.panel-title`, `.tile-delta--up`.

### 5.1 Button

**Anatomía:** icono opcional · etiqueta · icono opcional. Tres ejes independientes.

| Eje | Valores |
| --- | --- |
| Jerarquía | `.btn` (primario) · `.btn--secondary` · `.btn--ghost` · `.btn--danger` |
| Tamaño | `.btn--sm` · (md por defecto) · `.btn--lg` |
| Ancho | auto por defecto · `.btn--block` |

**Estados:** reposo · `:hover` (solo bajo `@media(hover:hover) and (pointer:fine)`; un `:hover` suelto
se queda pegado en táctil después de tocar, y esto es una PWA que se instala en el móvil) ·
`:focus-visible` (anillo de 2px con offset) · `:active` (escala .97) · `:disabled` / `[aria-disabled]`
(opacidad .45, sin puntero).

**Accesibilidad:** alto mínimo 44px en todos los tamaños, incluido `sm`. Un botón que solo lleva
icono es `.btn--icon` y **exige** `aria-label`: sin él es un botón sin nombre.

**Cuándo NO usarlo:** para navegar entre secciones (eso es la nav o un enlace); para alternar un
ajuste (eso es `Toggle`); para filtrar una lista (eso es `Chip` o `Segmented`).

**Los dos cambios respecto a lo que había:**

1. `.btn` ya no es `width:100%`. Un "Iniciar sesión" de 1.100px en un monitor no es un botón, es una
   valla, y cualquier botón secundario gritaba exactamente lo mismo que el primario.
2. El tamaño por defecto es **md** (12/20, cuerpo md). El viejo defecto era lg (16/24, cuerpo lg),
   que es el tamaño de una acción de hoja, no el de un botón cualquiera.

Los **66** botones de las pantallas todavía sin migrar llevan `btn--lg btn--block` añadidos en este
pase. No es dejadez: hace explícito lo que antes recibían implícitos, y así ninguna pantalla que aún
no se ha rediseñado cambia de aspecto. `grep -c 'btn--block'` es la barra de progreso de la fase 2.

### 5.2 IconButton — `.btn--icon`

Cuadrado de 44×44, radio `md`, sin `gap`. Hereda jerarquía y tamaño de `Button`. `aria-label`
obligatorio, y `title` cuando además sea útil el tooltip nativo.
**Cuándo NO usarlo:** si la acción no es evidente por el icono. "Compartir" y "Cerrar" lo son;
"Aplicar propuesta" no.

### 5.3 Input / Select / Textarea — `.field`

**Anatomía:** `.field-label` (versalitas, **siempre encima**) · el control · `.field-hint` o
`.field-error`.

La etiqueta encima y no al lado, siempre: con la etiqueta a la izquierda y un campo de 85px a la
derecha, en un monitor quedan ~370px de vacío entre una etiqueta y el campo al que pertenece, y la
asociación se pierde a partir de la segunda fila. Era literalmente el problema del Cuerpo anterior.

Un formulario va dentro de `.form` (o de un contenedor con `max-width:var(--measure-form)`).
**Estados:** reposo · `:focus-visible` (anillo `--color-focus-ring`) · error (`.field-error` + el
mensaje, nunca solo color) · deshabilitado.

### 5.4 Toggle — `.toggle-btn`

Pastilla de 50×30 dentro de un `ListRow --control`: etiqueta + descripción a la izquierda, control a
la derecha. Es un `role="switch"` y **su estado va en `aria-checked`**, no solo en una clase de CSS
que el lector de pantalla no ve.

### 5.5 Card — `.panel`

Superficie 1, radio `xl`, relleno `--pad-card`. `.panel-title` en versalitas secundarias (**no en
rojo**: eso era parte del problema del acento). `.panel--flush` quita el relleno para cuando el hijo
trae el suyo, como una tabla con scroll.

**Cuándo NO usarlo:** para envolver un solo dato (eso es `MetricTile`); para anidar tarjetas dentro
de tarjetas — dos niveles de superficie 1 no se distinguen y el segundo nivel es `--color-surface-2`.

### 5.6 MetricTile — `.tile`

La cifra grande: peso, kcal, un PR. `.tile-label` · `.tile-value` (tabular) · `.tile-unit` ·
`.tile-delta`. Van en `.tiles`, una rejilla `auto-fill` de mínimo 132px: **crece en número por fila,
nunca de tamaño**. 132 y no 148 porque en un móvil de 375 la columna útil son 303px y a 148 los tiles
caían de dos a uno justo donde más importa la densidad.

`.tile-delta--up` / `--down` colorean la variación **solo donde la dirección tiene significado**. En
Cuerpo se usa `--flat`: la app no sabe si subir de peso es tu objetivo o tu problema. El signo lo
dice y el usuario juzga.

### 5.7 ListRow — `.listrow`

Nombre a la izquierda, valor a la derecha, separador arriba. Es el patrón más repetido del producto y
hasta ahora estaba reescrito en quince sitios con quince nombres (`.sc-row`, `.prof-metric`,
`.round-item`, `.run-live-split`, `.dtest-res-metric`…). **Cuándo NO usarlo:** cuando hay tres o más
valores por fila — eso es una `Table`.

### 5.8 Segmented / Tabs — `.subnav-tabs`

Un único componente donde había tres con CSS casi idéntico y tres nombres (`.str-subnav`,
`.run-subnav`, `.train-mode`). La pastilla activa se marca con **fondo y peso**; nunca con una banda
de acento ni con un subrayado de color.

`.subnav` es el bloque de navegación secundaria de una sección: el modo arriba y sus destinos debajo.
En móvil son dos segmentados apilados; en ≥1024 se convierte en la **columna izquierda** de la
pantalla, que es lo que quita las tres barras de Entrenar (§7.2).

**Estados:** activo (`.active` + `aria-selected="true"`) · reposo · `:hover` bajo `hover:hover` ·
`:focus-visible`. **Cuándo NO usarlo:** con más de cinco destinos, o cuando las opciones no sean
mutuamente excluyentes — eso son `Chip`s de filtro.

### 5.9 Chip y Badge

La distinción, que hasta ahora no existía: un **Chip** es interactivo —filtra, selecciona, se pulsa—
y por eso mide 44px de alto; un **Badge** informa y no se toca. Estaban mezclados en siete clases
(`.prof-chip`, `.q-chip`, `.zp-chip`, `.run-plan-pill`, `.dash-act-chip`, `.prev-badge`,
`.ex-mode-badge`) con la misma pinta y comportamientos distintos.

Variantes de Badge: neutra (por defecto), `--accent`, `--success`, `--warning`, `--info`.
**Un Badge nunca es rojo salvo que el rojo signifique algo** —tu dominio limitante, un récord—:
el presupuesto del acento (§2.3) cuenta también las etiquetas.

Los chips de contexto de Entrenar (programa, fase, semana) son Chips: dicen dónde estás y se pulsan
para cambiarlo.

### 5.10 Modal / BottomSheet — `.sheet`

**El mismo componente y la misma API**: hoja que sube desde abajo en el móvil, diálogo centrado a
partir de 640. Cambia la presentación, no el contrato.

**Anatomía:** `.sheet` (velo) > `.sheet-panel` > `.sheet-head` (`.sheet-title` + cerrar) ·
`.sheet-body` (lo único que hace scroll) · `.sheet-foot` (las acciones).

**Comportamiento:** `.open` lo muestra. `role="dialog"` y `aria-modal` van en el HTML, porque el
componente no decide si es modal — lo decide quien lo usa. El cierre está en tres sitios y los tres
llevan al mismo código: la X, el clic en el velo y `Escape`. El foco vuelve a quien la abrió; sin eso
el foco se queda en el `<body>` y el teclado tiene que recorrer la página entera para volver.

**Es aquí donde existe `.btn--block`**, y prácticamente en ningún otro sitio: la acción principal de
una hoja móvil.

### 5.11 Toast

`.toast` + `.toast-container`. Ya existía y es correcto. Pendiente: pasar sus valores a tokens.

### 5.12 EmptyState

`.empty-state` con título, subtítulo y **una salida**. Un texto que dice "no hay nada" y no ofrece la
acción que lo llena deja al usuario en un callejón. El botón del estado vacío es `--secondary`, no
primario: la acción primaria ya está en la cabecera de la pantalla (§2.3).

### 5.13 Table

`.table-scroll` > `<table>`. Cabeceras en versalitas, números a la derecha y tabulares, sombras de
scroll que solo aparecen del lado por el que queda tabla por ver.
**Cuándo NO usarla:** con menos de tres columnas — eso es una lista de `ListRow`.

### 5.14 Rail / NavBar

Un solo `<nav>` con cinco destinos. Por debajo de 1024 es la barra inferior; por encima, el rail
lateral. El HTML no cambia entre los dos.

**El rail se pliega** (§7.3): 232px expandido, 64px en modo icono. En modo icono la etiqueta pasa a
un clip de lector de pantalla y el nombre del destino pasa a `title`; sin eso, el rail plegado son
cinco pictogramas a adivinar. El estado se recuerda en `localStorage` y el atajo es `N`.

### 5.15 SectionHeader — `.page-head`

Título de pantalla, subtítulo de contexto y **la única acción primaria de la vista**. El subtítulo es
contexto real (cuándo se midió por última vez, qué programa está activo); si no hay nada que decir,
se omite el elemento.

### 5.16 Skeleton

**No existe y no se añade todavía.** Areté lee de `localStorage` de forma síncrona: no hay latencia
que enmascarar en ninguna de las pantallas actuales. Un esqueleto que aparece y desaparece en el
mismo frame es peor que nada. Se añadirá cuando lo pidan las respuestas de Quirón o una carga desde
Drive, que son los dos únicos sitios donde hay espera real — y hoy ya tienen su propio indicador.

---

## 6. Patrones de página

### 6.1 Pantalla de captura

`SectionHeader` con la acción → la hoja. Dentro de la hoja: fecha o contexto primero, campos en
rejilla, ayuda antes de los campos y no después, acciones abajo con la principal en `--block`.
Un solo formulario para crear y para editar; el modo de edición se anuncia con un `banner`, nunca con
un segundo formulario. **Ejemplo:** `#bodySheet`.

### 6.2 Pantalla de análisis

`SectionHeader` → panel de estado (`MetricTile`s a ancho completo) → paneles de lectura en dos
columnas → tabla a ancho completo. La tabla siempre abajo y siempre entera: es donde se compara.
**Ejemplo:** `#secBody`.

### 6.3 Pantalla de lista

Filtro o calendario en la columna estrecha, lista en la ancha, detalle acoplado a la derecha en
≥1024 (no modal: tapar un monitor de 1.500px para enseñar el detalle de una sesión, cuando el
calendario y la lista siguen siendo útiles detrás, es el antipatrón clásico). Ya resuelto en
Historial; queda formalizarlo.

### 6.4 Pantalla de ejecución de sesión

`.set-runner`. **No se toca.** Un ejercicio, un peso, unas reps, un botón, centrado, un tap por serie
y cero scroll. En escritorio no se ensancha, no se le añade una segunda columna y no se le mete la
lista de ejercicios al lado. Cualquier otra cosa que se le haga es una regresión. Lo único que hereda
del sistema son los tokens.

---

## 7. Decisiones de arquitectura

Las dos que cambian la forma de la interfaz. Se escribieron y se justificaron aquí antes de tocar el
código, se aprobaron, y **están implementadas**.

### 7.1 Dónde vive Quirón — *implementado*

**Quirón es un destino de la navegación, no una acción flotante.**

Ha dejado de ser `#quironFab` y es una entrada del `<nav>`: la sexta del rail en escritorio, al pie y
separada por un filete porque es de otra naturaleza (una conversación, no una pantalla de tus datos);
y la sexta pestaña de la barra inferior en móvil, donde a 375px cada una mide 62px, muy por encima
del objetivo táctil de 44.

Sigue siendo un **panel y no una `.section`**, y eso es deliberado: necesita el alto completo con la
barra de entrada anclada abajo, y se abre desde otras pantallas ("Pedir una sesión" en el Plan) sin
cambiar de pestaña. Abrirlo lo marca como destino activo y atenúa la pestaña que lo estaba; cerrarlo
la devuelve intacta y el foco vuelve a la entrada de Quirón. Atajos: `/` abre con el cursor puesto en
el campo, y `6` es el número que le toca como sexto destino.

**Por qué.** El FAB es hoy un satélite: en móvil tapa contenido; en escritorio acaba abajo a la
izquierda flotando sobre el rail, compitiendo con la navegación en vez de pertenecer a ella. Y el
propio CSS ya lo confiesa — `#quironFab{left:calc((var(--rail-w) - 52px)/2)}` es un botón fingiendo
ser un elemento del rail. Convertirlo en uno de verdad es hacer honesto lo que el código ya intenta.
Además, Quirón es el diferencial del producto: un elemento estructural declara eso; un botón flotante
declara lo contrario.

**Alternativa descartada: panel lateral persistente como tercera columna a ≥1440.** Por dos razones.
La primera es aritmética: a 1440 la shell son 1.180 más 232 de rail; una tercera columna de 380
obliga a las dos columnas de contenido a bajar por debajo de los anchos con los que están probadas, y
el monitor de trabajo real no siempre es más ancho. La segunda es de uso: Quirón se consulta a
ráfagas, no se monitoriza. Un chat siempre visible y casi siempre vacío son píxeles muertos en la
pantalla donde más falta hacen. Lo que sí se conserva de esa idea, y ya está en el CSS, es que el
panel arranca donde acaba el rail (`.quiron-panel{left:var(--rail-w)}`): el chat no tapa la
navegación, es una superficie más de la app.

**Alternativa descartada: barra de comando invocable por teclado.** Es un buen segundo acceso y de
hecho ya existe (`/`), pero no resuelve el problema: un atajo que no se ve no le da a Quirón un sitio
estructural, y en móvil no hay teclado.

### 7.2 Cómo se reorganiza la navegación de Entrenar — *implementado*

**Tres barras apiladas pasan a una, moviendo cada nivel a donde pertenece.**

Antes de que apareciera un solo dato, Entrenar apilaba el segmentado Fuerza/Carrera, la
`.context-bar` con los chips de programa y fase, y las pestañas
Actividad/Historial/Progreso/Plan: ~180px verticales de navegación consecutiva. Lo aplicado:

1. **El contexto sube a la cabecera.** Los chips de programa y fase son **estado**, no navegación:
   dicen dónde estás, no te llevan a ningún sitio. Se van al `SectionHeader` de la sección, en la
   misma línea que el título, y dejan de ser `sticky`. Desaparece una barra entera.
2. **Fuerza/Carrera se queda como modo**, pero en escritorio deja de ser una barra horizontal y pasa
   a encabezar la navegación secundaria lateral.
3. **Las cuatro pestañas pasan a navegación lateral secundaria en ≥1024**, en una columna estrecha
   junto al contenido, agrupadas bajo el modo. En móvil siguen siendo un segmentado, que es lo
   correcto ahí. El cromo vertical antes del primer dato pasa de ~180px a ~0.
4. Con la columna secundaria puesta, el contenido tiene por fin una rejilla de verdad. Y cuando **no**
   hay sesión en curso, la rejilla de Actividad se colapsa a una columna con `:has()`: una tarjeta de
   sesión flotando junto a 500px de nada era exactamente el hueco que había que quitar, y esto lo
   resuelve sin JS y sin una clase que alguien tenga que acordarse de quitar.
5. En móvil, Entrenar **renuncia a su título de pantalla**. La barra inferior ya dice "Entrenar" a
   dos centímetros y el subtítulo repetía el modo que está en el segmentado de debajo: eran ~65px de
   cromo para contar dos veces algo que ya se sabe, justo en la pantalla que no podía permitírselos.
   En ≥1024 vuelve, porque ahí hay sitio y la cabecera es la que sostiene el contexto.

El destino activo de la navegación secundaria se marca con **fondo y peso, no en rojo**: el rail ya
dice en qué sección estás, y un segundo rojo diciendo lo mismo un nivel más abajo deja de informar.

**Por qué esta y no otra.** Porque separa por naturaleza: estado a la cabecera, navegación a un solo
sitio. Las tres barras no eran tres niveles de navegación — eran dos niveles y un indicador de estado
disfrazado de barra.

**Alternativa descartada: fundir el modo con las pestañas** (ocho destinos: Fuerza·Actividad,
Fuerza·Historial, Carrera·Actividad…). Multiplica el nivel superior por cuatro y, sobre todo, pierde
el modo como **estado persistente**: `areteTrainMode` se guarda, y `switchStrTab()` lo fuerza a
fuerza porque es lo que necesitan "Iniciar sesión" y Quirón al programar una sesión. Con ocho
destinos, "llévame a entrenar fuerza" deja de tener un sitio al que llevarte.

### 7.3 El rail plegable — *implementado*

Es sistema, no arquitectura de pantalla, así que se aplica ya. 232px expandido, 64px en modo icono,
estado en `localStorage`, atajo `N`, transición sujeta a `prefers-reduced-motion` y `title` en cada
destino solo cuando está plegado.

Dos decisiones dentro de la decisión:

- **La shell recupera exactamente lo que suelta el rail.** Si no creciera, los 168px liberados se
  convertirían en margen y el usuario habría hecho un clic para nada. Colapsar tiene que servir para
  algo: en Cuerpo, plegar el rail pasa la fila de métricas de seis a ocho tiles.
- **El atajo es una letra, no un corchete.** `[` y `]` son lo convencional, pero en el teclado
  español piden AltGr y dejan de ser un atajo. `N`, de navegación, está libre y se teclea.
- **El botón va arriba del rail, no abajo**, porque el pie del rail es de Quirón.

---

## 8. Cuerpo, la pantalla que estrenó el sistema

Fue la primera, y la que probó que el sistema aguantaba: `#secBody` tiene formulario, panel de
resultado y tabla, los tres modos del producto.

**Lo que estaba mal.** La sección apilaba, en una sola columna: campo de fecha, once medidas vacías,
botón de guardar, proporciones, altura y edad, calorías y el historial. Entrada de datos y lectura de
datos revueltas en el mismo plano visual, sin agrupación semántica. Al abrirla no sabías si te estaba
preguntando algo o contándote algo.

**Lo que se ha hecho.**

- **La captura sale del plano.** Fecha y las once medidas viven en `#bodySheet`, la hoja del §5.10.
  Se registra el cuerpo cada muchos días y se consulta muchas más veces que eso: la pantalla por
  defecto tiene que servir al caso frecuente. La hoja vive fuera de `#secBody` a propósito — la
  sección se oculta con `display:none` al cambiar de pestaña, y una hoja que desaparece porque su
  sección se apagó es un error esperando a pasar.
- **La pantalla por defecto es de lectura**, en el orden del §6.2: estado actual → proporciones →
  calorías → historial.
- **"Estado actual" es nuevo y es lo que faltaba**: la última cifra de cada medida con su variación y
  la fecha contra la que se compara. Antes, para saber cuánto pesabas había que leer la primera fila
  de una tabla de once columnas.
- **Altura y edad dejan de ser captura.** No son medidas que se registren: son los dos parámetros del
  cálculo de calorías. Van dentro del panel que alimentan, separados por un filete, como lo que son.
- **Los "Editar" del historial dejan de ser rojos.** Eran diez acciones primarias compitiendo con la
  única que lo es de verdad. Editar una fila es secundario por definición: no es a lo que has venido.
- **Cero valores a mano.** Ni un color, radio, espacio ni duración escritos fuera de `:root` en toda
  la pantalla, ni en el CSS ni en las plantillas de `body.js` (que tenían siete `style=""` inline).
- **Sin barra de acento lateral en ningún sitio**, incluido el banner de edición, que usa fondo
  teñido e icono.

**Dos arreglos colaterales que salieron al migrar:**

1. **`hidden` no funcionaba en toda la app.** La regla del navegador es `display:none` con
   especificidad cero, así que cualquier `display:flex` de una clase la ganaba. Se veía en
   `.quiron-setup[hidden]{display:none}`, un parche puntual para el mismo problema. Ahora hay una
   regla global y `el.hidden = true` oculta de verdad, lo que quita la necesidad de manosear
   `style.display` desde JS.
2. **Cerrar la hoja sin guardar cancela la edición.** Si no, la próxima vez que pulsaras "Registrar
   medidas" estarías reescribiendo sin saberlo el registro que abriste hace media hora: la hoja se
   vería idéntica salvo por un banner.

---

## 9. La migración, terminada

### 9.1 Qué se migró y en qué orden

| # | Pantalla | Estado |
| --- | --- | --- |
| 0 | **Cuerpo** (`#secBody`) | Hecha. Captura en hoja invocada, pantalla por defecto de lectura, panel "Estado actual", altura y edad reubicadas como parámetros del cálculo |
| 1 | **Ajustes** (`#secSettings`) | Hecha. Todas las filas con la misma anatomía; iconos que dejan de ser rojos; el toggle es un `role="switch"` con su `aria-checked` |
| 2 | **Perfil** (`#secProfile`) | Hecha. Métricas a `ListRow`, etiquetas a `Badge`, hoja de test al `.sheet` del sistema. El rojo se reserva para "tu limitante" |
| 3 | **Hoy** (`#secDashboard`) | Hecha. El bento se queda —es identidad— pero desaparece la segunda acción primaria |
| 4 | **Quirón** (§7.1) | Hecho. Sexto destino del rail y sexta pestaña en móvil |
| 5 | **Entrenar** (§7.2) | Hecho. De tres barras a una; navegación secundaria lateral en ≥1024 |
| 6 | **Historial y Progreso** | Hechos. Tokenizados; el maestro-detalle y las tablas ya estaban bien y no se han tocado |
| 7 | **Carrera** (`#secRunning`) | Hecha. Récords y estadísticas a `MetricTile`, tarjetas a `Panel`, importar como única acción primaria |
| 8 | **Carrera en vivo y runner de sesión** | Hechos, **solo tokens**. Cero cambios de forma: son las dos pantallas que se usan sudado y con prisa, y su diseño ya era el correcto |
| 9 | **Alias, anotaciones y capas** | Hecho. Ver §3.4 y §4.4 |

### 9.2 Lo que queda escrito a mano, y por qué

Fuera de `:root`, el inventario está a cero salvo dos cosas que **deben** quedarse:

- **`border-radius:50%`** (19 usos) — lo circular. Un token sería una capa de indirección sin
  significado: `50%` ya dice "círculo".
- **`border-radius:0`** (6 usos) — lo que explícitamente no tiene esquina.

Cero colores, cero `z-index`, cero duraciones, cero sombras y cero anchos inventados. Los números,
frente a los del inventario de partida:

| | Antes | Ahora |
| --- | --- | --- |
| Radios distintos | 24 | 6 tokens + `50%` y `0` |
| `z-index` distintos | 18 | 16 con nombre, 0 literales |
| Duraciones | 22 | 7 tokens, 0 literales |
| Colores literales fuera de `:root` | 52 (33 hex + 64 `rgba()`) | **0** |
| Tamaños de botón | 49 | 3 |
| `.btn--block` | (implícito en los 66 botones) | **9** |
| Reglas en la hoja | 1.281 | 1.349, repartidas en 6 capas |

### 9.3 La deuda que sigue viva

- **Los `style=""` que quedan en las plantillas de `js/` pasan un color de dato**, no maquetan: el
  color de un dominio en el radar, el de una zona de pulso, el ancho de una barra de progreso. Son
  valores calculados en tiempo de ejecución y no pueden ser una clase. Los que maquetaban se han ido.
- **`.calc-result`, `.hi-edit-btn`, `.toast`, `.timer-*`, `.sr-*` y el bloque de HIIT** siguen siendo
  componentes de pantalla con nombre propio, no del sistema. Están tokenizados y viven en la capa
  `pantallas`, que es donde les toca; convertirlos en componentes del sistema solo tendría sentido
  cuando algo más los necesite.
- **`.sec-title-accent` sobrevive como alias vacío** de `.sec-title` mientras siga escrito en las
  plantillas. Es una línea de CSS y quitarla exige tocar seis ficheros de JS por nada.
- **El fichero sigue siendo uno solo.** Dividirlo obligaría a tocar `sw.js` (`CACHE_NAME` +
  `ASSETS`) y la lista `PUBLIC` de `build-pages.mjs` a cambio de peticiones extra en el arranque de
  una PWA que se instala. Con las capas, el argumento para dividirlo —"no encuentro nada"— ya no se
  sostiene.
- **Lo anotado en `mejoras_arete.md`** que es lógica y no presentación: el parser de `.FIT`, la
  tabla de umbrales femenina y `saveDB` serializando la base entera en cada escritura.

## 10. Guía de contribución

**Cómo se añade un componente.**

1. Búscalo primero: 25 clases con "card" y 66 selectores de botón existen porque nadie buscó.
2. Escríbelo en `app.css`, en la sección 3, con su bloque de comentario: qué es, qué variantes, y
   **cuándo NO usarlo**. Esa última línea es la que evita el componente número 26.
3. Solo tokens. Si te falta uno, añádelo a `:root` con un comentario que diga por qué existe.
4. Documenta aquí su anatomía, variantes, estados y reglas de accesibilidad.

**Cómo se nombra.** Prefijo por módulo + BEM ligero: `bloque`, `bloque-elemento` (un guion),
`bloque--modificador` (dos). Sin anidar más de un nivel de elemento. Los ids solo para lo que JS
necesita agarrar, nunca para estilar.

**La regla de oro.** Si necesitas un valor que no es un token, o el token falta o el diseño está mal.

**Antes de dar por buena una pantalla nueva o retocada**, la lista corta:

- [ ] Cero colores, espacios, radios y duraciones escritos a mano; cero `style=""` en sus plantillas.
- [ ] Ningún alias heredado (`--accent`, `--surface2`, `--text2`…): ya no existen.
- [ ] Cada regla en su capa: componente → `sistema`, ajuste de pantalla → `pantallas`.
- [ ] Como máximo **una** acción primaria en rojo en la vista.
- [ ] Ningún componente crece de tamaño de móvil a escritorio.
- [ ] Ningún estado marcado con barra de acento lateral.
- [ ] Se recorre entera con teclado y el foco se ve siempre.
- [ ] Contraste medido y las cifras escritas, si se ha tocado algún color.
- [ ] Verificada a 375, 768, 1024, 1440 y 2560, en claro y en oscuro, **con el service worker
      desregistrado** (o verás la versión cacheada y creerás que tus cambios no se aplican).
- [ ] `npm test` en verde y la consola limpia.
- [ ] `CACHE_NAME` subido en `sw.js`.
