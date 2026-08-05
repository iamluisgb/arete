# Prompt — Design system de Areté

> Documento de encargo. Se le pasa entero a un agente (o a un diseñador) como brief.
> No es documentación del sistema: es la petición de crearlo.

---

## 0. Instrucción de arranque

Vas a diseñar y ejecutar el **design system de Areté**, una PWA de entrenamiento híbrido.
Hoy la app funciona pero **no parece un producto**: parece una hoja de estilos que ha crecido
pantalla a pantalla. Tu trabajo es convertirla en un sistema — reglas explícitas, componentes
nombrados, una sola forma de hacer cada cosa — y luego **migrar la app real a ese sistema**,
no solo escribir el documento.

Antes de proponer nada, lee en este orden:

1. `AGENTS.md` — el contrato del repo (vanilla ES modules, sin build step, service worker).
2. `auditoria-ux-2026-08.md` y `auditoria-desktop-2026-08.md` — auditorías previas ya hechas.
   **No repitas su trabajo**: parte de sus hallazgos y márcalos como resueltos o descartados.
3. `app.css` entera y `app.html` entera. Son 1.600 y 900 líneas: léelas, no las muestrees.
4. `js/ui/` — para saber qué clases se generan desde JS y no aparecen en el HTML estático.

**Entrega en dos fases y para cuando acabe la fase 1.** Fase 1 = el documento del sistema
+ la capa de tokens + una pantalla migrada como prueba. Fase 2 = la migración del resto.
No empieces la fase 2 sin que la 1 esté revisada.

---

## 1. Qué es Areté (contexto de producto, no adorno)

App de entrenamiento híbrido (fuerza + carrera) para un atleta que entrena solo. Mide **7
dominios de rendimiento** y tu nivel es el más bajo de todos. Tiene un agente conversacional,
**Quirón**, que lee tus datos y programa sesiones.

Dos contextos de uso radicalmente distintos, y el sistema tiene que servir a los dos:

| | **Móvil, en el gimnasio** | **Escritorio, en casa** |
|---|---|---|
| Postura | De pie, sudado, entre series | Sentado, sesión larga |
| Duración | 10–40 s por interacción | 5–30 min |
| Tarea | Registrar una serie, ver el objetivo | Planificar, analizar, hablar con Quirón, revisar historial |
| Prioridad | Objetivo táctil grande, cero lectura | Densidad de información, comparación, varias cosas a la vez |

El error actual es tratar el escritorio como **móvil estirado**: misma jerarquía, mismos
componentes a ancho completo, misma densidad. Un sistema serio da **dos densidades del mismo
lenguaje**, no dos diseños.

---

## 2. Los problemas concretos que hay que resolver

Estos son los síntomas reportados por el dueño del producto. Son obligatorios: si tu propuesta
no los resuelve explícitamente, no está terminada. Diagnostica la **causa** de cada uno, no
parchees el síntoma.

### 2.1 El botón de Quirón está mal colocado
`#quironFab` es un FAB `position:fixed` anclado abajo a la derecha en móvil y que en escritorio
acaba **abajo a la izquierda, flotando sobre el rail** (ver `app.css` §964 y la regla de rail en
§245). Problemas: tapa contenido, no tiene sitio propio, y en escritorio compite visualmente con
la navegación en vez de pertenecer a ella.

Quirón no es una acción secundaria: es **el diferencial del producto**. Merece un sitio
estructural. Decide y justifica: ¿entrada en la navegación? ¿panel lateral persistente en
escritorio (tercera columna a ≥1440)? ¿barra de comando invocable por teclado? Da **una**
recomendación, con la alternativa descartada y por qué.

### 2.2 La navegación lateral no se puede ocultar
A partir de 1024px `nav` se convierte en un rail fijo de 232px (`--rail-w`) sin forma de
colapsarlo. En una sesión de análisis con tablas anchas eso son 232px permanentemente perdidos.

Necesitas: rail **colapsable** a modo icono (~64px) y expandido (232px), con el estado
persistido, atajo de teclado, transición respetando `prefers-reduced-motion`, y tooltips en modo
icono. El colapso debe salir de `--rail-w`, que ya es la variable de la que dependen todos los
elementos fijos — **no lo escribas a mano en ningún sitio**.

### 2.3 Todos los botones ocupan el ancho completo
`.btn` tiene `width:100%` en la clase base (`app.css`, sección de botones). Consecuencia: un
"Iniciar sesión" de 1.100px de ancho en escritorio, y cualquier botón secundario gritando lo
mismo que el primario.

Hace falta una **taxonomía de botones** de verdad: jerarquía (primario / secundario / terciario /
peligro), tamaños (sm / md / lg), ancho (auto por defecto, `block` como modificador explícito), e
**iconográficos** con `aria-label`. El ancho completo debe ser la excepción declarada
(`.btn--block`), reservada a la acción principal de una hoja móvil, no el valor por defecto.

### 2.4 "Actividad" desperdicia el espacio en escritorio
La pestaña Actividad muestra una tarjeta de sesión de ~530px en un viewport de 2.800px, con el
resto en blanco. No es aire de diseño: es hueco.

Además, antes del contenido hay **tres barras apiladas**: el segmentado Fuerza/Carrera, la
`.context-bar` con los chips de programa/fase, y las pestañas Actividad/Historial/Progreso/Plan.
Tres niveles de navegación consecutivos que consumen ~180px verticales antes de que aparezca un
solo dato. Resuélvelo: fusiona niveles, mueve el contexto a la cabecera, o convierte las
pestañas en navegación lateral secundaria en escritorio. Justifica la elección.

### 2.5 "Cuerpo" mezcla formularios y datos sin jerarquía
`secBody` (`app.html` §339) apila: campo de fecha, rejilla de 11 medidas vacías, botón de
guardar, proporciones, altura/edad, calorías estimadas, historial. Entrada de datos y lectura de
datos revueltos en un mismo plano visual, sin agrupación semántica.

Hay que separar **capturar** de **consultar**: qué es formulario, qué es panel de resultado, qué
es historial. Probablemente la captura sea una hoja/modal invocada y la pantalla por defecto sea
el panel de lectura. Decídelo tú, pero el criterio queda escrito en el sistema.

### 2.6 "Más" (Ajustes) tiene el mismo problema
`secSettings` ya tiene `.settings-group` y `.settings-card`, que es la semilla correcta. Falta
consistencia: filas de ajuste con la misma anatomía siempre (label + descripción + control a la
derecha), agrupación, y separación entre lo que se toca a diario y lo que se toca una vez.

---

## 3. Restricciones técnicas (no negociables)

Violar cualquiera de estas invalida la entrega.

- **Sin build step.** Vanilla, módulos ES, lo que hay en el repo es lo que se sirve. **No
  introduzcas Tailwind, PostCSS, Sass, ni ningún framework de componentes.** El sistema se
  expresa en **CSS nativo**: custom properties, capas (`@layer`), `:has()`, container queries.
- **`app.css` es un solo fichero servido tal cual.** Si lo divides, tienes que ajustar
  `sw.js` (`CACHE_NAME` + `ASSETS`) y la lista `PUBLIC` de `scripts/build-pages.mjs`, y
  justificar que el coste de peticiones extra compensa. Por defecto: **un fichero, reordenado
  en capas con índice al principio.**
- **Service worker:** cualquier fichero precacheado que toques exige subir `CACHE_NAME`.
- **Modo oscuro** vía `:root.dark`, ya existe. Todo token nuevo se define en ambos temas.
- **PWA:** respeta `env(safe-area-inset-*)` y `100dvh`; hay reglas que ya dependen de ello.
- **Accesibilidad, ya conquistada — no la pierdas:**
  - Los valores de `--text2`/`--text3` están calibrados al límite del AA sobre los tres fondos
    claros. El comentario en `app.css` §1 explica por qué `.78` fallaba por tres centésimas.
    **Si cambias un color, vuelves a medir el contraste y lo documentas.**
  - Objetivos táctiles ≥44px. Ya se cumple en varios sitios a propósito.
  - `prefers-reduced-motion` está respetado en 6 sitios. Toda animación nueva lo respeta.
  - `:focus-visible` visible en todo lo interactivo, incluido el rail colapsado.
- **Regla de estilo del dueño:** **nunca** marcar estado con barra de acento lateral
  (`border-left` de color, inset lateral). Ni en tarjetas, ni en filas, ni en alertas. Usa
  fondo, tipografía, icono o punto.
- **El rojo es la marca** (`--accent: #d4372c`). Hoy se usa para todo: acción primaria, títulos
  de sección, énfasis, cifras, botón de borrar. **Eso es parte del problema** — un acento que
  aparece diez veces por pantalla deja de acentuar. Define su presupuesto de uso.

---

## 4. Lo que tienes que entregar

### 4.1 `DESIGN_SYSTEM.md` — el documento

En español, en la raíz del repo, con la voz del resto de la documentación: densa, con el porqué
de cada decisión, sin relleno. Secciones:

**a) Principios.** 4–6 máximo, y que **corten**: un principio que no permite rechazar un diseño
concreto no es un principio. Malo: "claridad". Bueno: "el escritorio gana densidad, no tamaño:
ningún componente crece de tamaño al pasar de móvil a escritorio, crecen en número por fila".

**b) Fundamentos (tokens).**
- **Color:** paleta semántica en dos niveles — primitivos (`--red-600`) y semánticos
  (`--color-action-primary`). Hoy solo hay el segundo nivel, mezclado. Define superficies
  (0/1/2/elevada), texto (primario/secundario/terciario/inverso), bordes, estados
  (éxito/aviso/error/info) y los colores de dominio (fuerza vs carrera: hoy `--color-running`
  existe suelto). **Presupuesto del acento**: máximo una acción primaria visible por vista.
- **Tipografía:** la escala `--fs-*` existe y es razonable; audítala. Necesita también **roles**
  (`--type-title-lg`, `--type-body`, `--type-label`, `--type-metric`) que aten tamaño + peso +
  interlineado + tracking, para que nadie vuelva a escribir `font-size:var(--fs-lg);
  font-weight:700` a mano. Las **cifras siempre** `font-variant-numeric: tabular-nums`.
- **Espaciado:** `--sp-*` existe (4→40). Añade la capa que falta: espaciado **de componente**
  (padding interno por tamaño) y **de layout** (gap entre secciones, entre tarjetas), y que la
  densidad cambie por breakpoint desde el token, no en cada regla.
- **Radios, sombras, bordes, z-index.** El `z-index` sobre todo: hoy hay 40, 45, 50, 55, 60, 90,
  100, 200 repartidos por el fichero. Conviértelo en una escala nombrada y documentada.
- **Movimiento:** duraciones y curvas como tokens. Hoy hay `.1s`, `.15s`, `.2s`, `.25s`, `.3s`,
  `.8s` sin criterio.

**c) Layout y responsive.**
- Los breakpoints actuales (640 / 1024 / 1440) y qué cambia **conceptualmente** en cada uno.
- La shell: `--shell`, `--nav-h`, `--rail-w` y la nueva variante colapsada.
- **Container queries** donde el componente deba adaptarse a su contenedor y no al viewport —
  una tarjeta de sesión en la columna estrecha y en el ancho completo son el mismo componente.
- Medidas máximas por tipo de contenido (`--measure-prose`, `--measure-form` ya existen):
  extiéndelo. Un formulario no se ensancha a 1.180px nunca.

**d) Componentes.** Para cada uno: anatomía, variantes, tamaños, estados (reposo, hover, focus,
activo, deshabilitado, cargando, vacío, error), comportamiento responsive, reglas de
accesibilidad y **cuándo NO usarlo**. Mínimo:
`Button` · `IconButton` · `Input`/`Select`/`Textarea` (con label, ayuda y error) · `Toggle` ·
`Card` · `MetricTile` (la cifra grande: peso, kcal, PR) · `ListRow` (el patrón
nombre-izquierda/valor-derecha que se repite en todo el producto) · `Tabs`/`Segmented` ·
`Chip` · `Badge` · `Modal`/`BottomSheet` (misma API, presentación distinta por breakpoint) ·
`Toast` · `EmptyState` · `Table` (el historial corporal) · `Rail`/`NavBar` · `SectionHeader` ·
`Skeleton`.

**e) Patrones de página.** Cómo se compone una pantalla de captura, una de análisis, una de
lista y una de ejecución de sesión. Aquí es donde se arreglan 2.4, 2.5 y 2.6.

**f) Guía de contribución.** Cómo se añade un componente, cómo se nombra (elige y declara la
convención: BEM, o prefijos por módulo), y **la regla de oro**: si necesitas un valor que no es
un token, o el token falta o el diseño está mal.

### 4.2 La capa de tokens en CSS

`:root` reescrito con la paleta de dos niveles, en ambos temas, con comentarios que expliquen
las decisiones no obvias (como ya hace el fichero con el contraste). Retrocompatible: los
nombres viejos (`--accent`, `--surface2`…) siguen existiendo **como alias** de los nuevos
durante la migración, y el documento dice cuándo se borran.

### 4.3 Una pantalla migrada, entera

Elige **Cuerpo** (`secBody`): tiene formulario, panel de resultado y tabla — los tres modos del
producto. Migrada de verdad, funcionando, en móvil y escritorio.

### 4.4 Plan de migración

Tabla: pantalla → esfuerzo → riesgo → qué se rompe si sale mal. Ordenada. Y la lista de
**deuda** que dejas sin tocar, dicha en voz alta.

---

## 5. Método

1. **Inventario antes que propuesta.** Cuenta lo que hay: cuántos tamaños de botón distintos,
   cuántos radios, cuántos grises, cuántas variantes de "tarjeta". El inventario **es** el
   argumento; sin él la propuesta es opinión.
2. **Enseña antes de ejecutar.** Al terminar el inventario, para y presenta: los hallazgos, la
   decisión sobre Quirón (2.1) y la de la navegación de Entrenar (2.4). Son las dos que cambian
   la arquitectura de la interfaz; el resto se deriva.
3. **Verifica en el navegador.** `python3 -m http.server`, y compruébalo a 375px, 768px, 1024px,
   1440px y 2560px, en claro y oscuro. **Desregistra el service worker o verás la versión
   cacheada** y creerás que tus cambios no se aplican.
4. **`npm test` pasa.** Hay tests sobre `tests/` que tocan clases y DOM.
5. **No cambies comportamiento.** Esto es un rediseño de presentación. Si encuentras un bug de
   lógica, anótalo en `mejoras_arete.md`; no lo arregles de paso.

---

## 6. Criterios de aceptación

- [ ] Los seis problemas de §2 están resueltos, cada uno con su decisión escrita y justificada.
- [ ] Cero valores de color, espacio, radio o duración escritos a mano fuera de `:root`.
- [ ] Ningún componente crece de tamaño de móvil a escritorio; cambian densidad y disposición.
- [ ] `.btn` por defecto es ancho automático; `--block` es explícito y se usa <10 veces.
- [ ] El rail colapsa, recuerda su estado y tiene atajo de teclado.
- [ ] Contraste AA verificado y **documentado con las cifras medidas** en ambos temas.
- [ ] Ningún estado se marca con barra de acento lateral.
- [ ] Como máximo una acción primaria en rojo por vista.
- [ ] Se navega la app entera con teclado, con foco siempre visible.
- [ ] `prefers-reduced-motion` respetado en todo lo nuevo.
- [ ] `npm test` en verde y la app carga sin errores en consola.
- [ ] `sw.js` (`CACHE_NAME`/`ASSETS`) y `PUBLIC` de `build-pages.mjs` actualizados si hace falta.

---

## 7. Tono visual

Areté ya tiene una identidad y **no se tira**: fondo cálido casi-papel (`#f4f2f0`), rojo
terracota, tipografía Inter con tracking negativo apretado en los títulos, esquinas generosas.
Es sobria y adulta, no un tracker de neón. El encargo **no es cambiar el aspecto** — es darle
estructura, jerarquía y disciplina para que ese aspecto se lea como intencionado en vez de como
casual, y para que aguante un monitor de 27 pulgadas igual de bien que un móvil sudado.

Referencias de rigor sistémico, no de estética a copiar: Linear (densidad y teclado), Things
(jerarquía de captura vs consulta), Whoop (métricas grandes legibles de un vistazo).
