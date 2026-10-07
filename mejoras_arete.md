# Mejoras pendientes — Areté

Bugs y deuda encontrados de paso y anotados en vez de arreglados sobre la marcha. El sitio donde
apuntar lo que no toca ahora.

> Nota: este fichero se recrea aquí durante el pase del design system porque `AGENTS.md` lo cita y no
> existía en el árbol. Si aparece una versión anterior con más entradas, fusiónalas: la numeración
> alta (#7, la tabla de umbrales femenina) viene de esa lista.

## Encontrado durante el design system (2026-08)

**Resueltos en la fase 2** (se dejan escritos porque el porqué sigue valiendo):
los puntos 1, 2, 3 y 4 de abajo están cerrados. El 5 sigue abierto.


1. ~~**`--text-sec` no existe.**~~ **RESUELTO.** Se usa 7 veces en `app.css` (`.run-type-card-desc`,
   `.run-type-extra label`, `.run-type-pace-target-label`, `.run-type-race-label`,
   `.run-type-race-eta`, `.run-type-interval-seg`, `.run-type-elev-label`) y no está declarada en
   ningún `:root`. Esos textos, que deberían ser secundarios, heredan el color del contenedor. Se
   arregla al migrar las pantallas de carrera (fase 2, paso 7); no se toca ahora porque cambiaría el
   aspecto de una pantalla que este pase no rediseña.

2. ~~**El parche de contraste del texto funcional de la sesión ya no hace lo que dice.**~~ **RESUELTO** — borrado, con las cifras en `DESIGN_SYSTEM.md` §3.3.
   El diagnóstico original, para el registro: El bloque
   "Contraste del texto funcional de la sesión" de `app.css` sube el alfa a `.78` en tema claro para
   `.ex-card .sets-header`, `.ex-card .set-label`, `.sr-load span`, `.sr-lbl` y `.sr-did-k`, con el
   comentario de que `--text2` "da 2,86:1 y falla AA". Medido hoy: `--text2` (alfa `.80`) da
   **5,34:1** sobre blanco y el override de `.78` da **5,06:1**. El parche **baja** el contraste. Su
   propio comentario dice "PENDIENTE: revisar a nivel de sistema". Se borra al migrar el runner de
   sesión (fase 2, paso 8).

3. ~~**Dos acciones primarias en "Hoy".**~~ **RESUELTO** — Fuerza es la primaria y Running la secundaria; el color de dominio sobrevive en el icono. `#dashStartBtn` (rojo) y `#dashStartRunBtn` (cian) compiten
   con el mismo peso visual. Viola el presupuesto del acento (`DESIGN_SYSTEM.md` §2.3). Se resuelve
   al migrar el dashboard (fase 2, paso 3), decidiendo cuál de los dos es la acción del día.

4. ~~**`.hi-edit-btn` es un botón rojo por fila de tabla.**~~ **RESUELTO** en Cuerpo con un override
   acotado. En el historial de fuerza y en el de carrera aparece una vez por tarjeta, no una por
   fila de tabla, así que ahí no compite con nada y se queda como está.

## Abierto

9. **Advisory de la review nativa de F3 (review-6f2d3b1243e2ecaf, aprobada).** Tres hallazgos
   no bloqueantes que quedan como trabajo futuro separado (detalle completo en el ledger de
   gentle-ai; aquí la ubicación y la naturaleza):

   - **R3-001 (WARNING)** — `js/domains.js:182-184`, `liftMetric()`: lo que no está en la
     ontología devuelve `null` y no cuenta, en silencio. Correcto por decisión D1, pero hasta
     que F0–F2 llenen la ontología, cualquier ejercicio no sembrado (accesorios, patrones)
     escapa a la derivación. Se cierra con las fases siguientes del plan.
   - **R3-002 (WARNING)** — `tests/domains.test.js:402-403`: la regresión sobre el fixture real
     es `skipIf(!existsSync(REAL))`; en máquinas sin el fixture gitignoreado el test se salta
     en silencio y la cobertura de regresión desaparece sin aviso.
   - **R3-003 (SUGGESTION)** — `js/exercise-ontology.js:137-146`: el índice de firmas lanza
     `Error` en carga de módulo si hay alias duplicado. Es fail-fast deliberado, pero un error
     de construcción más descriptivo (listar todos los duplicados, no solo el primero) ayudaría
     al mantenimiento.

6. **Dos temporizadores de descanso viven en paralelo.**** `.timer-bar` (la barra de la pestaña
   Actividad) y el anillo del `.set-runner` cuentan lo mismo con dos implementaciones distintas
   (`js/ui/timer.js` y `js/ui/set-runner.js`). No es un fallo de presentación y no se ha tocado,
   pero es la clase de duplicación que acaba divergiendo.

5. **`aria-modal="true"` en `.detail-modal` a partir de 1024.** El comentario de `app.css` dice que
   `showDetail` lo pone a `false` cuando el detalle deja de ser modal y se acopla a la derecha;
   conviene comprobar que sigue siendo cierto tras cualquier cambio en el panel, porque si se queda
   en `true` el foco se encierra en un panel que no es modal.

## Ontología de ejercicios (2026-08)

Plan completo en [`docs/PLAN-ONTOLOGIA.md`](docs/PLAN-ONTOLOGIA.md) — siete fases, con las
decisiones ya cerradas. Resumen de por qué está aquí:

8. **Los ejercicios son texto libre y eso rompe la fuente de verdad del perfil.** `LIFT_PATTERNS`
   en `js/domains.js` resuelve los cuatro básicos con cuatro regex: un front squat o un hex-bar
   deadlift no matchean, así que el atleta entrena y su nivel no se mueve. Es un bug de
   integridad en el núcleo del producto, no una carencia del agente — **la fase F3 del plan es
   independiente y merece hacerse aunque el resto se aparque.**

9. **`propose_session` no está anclado a ningún catálogo.** Ante "algo para mi punto débil, en
   casa", los ejercicios y el material salen de la cabeza del modelo; nada comprueba que existan
   ni que se puedan hacer con lo que hay. Es la segunda alucinación de este dominio —el ejercicio
   inventado— y hoy no la caza ningún check, al contrario que el número inventado (`cifras`).

10. **No hay volumen por patrón ni por grupo muscular.** "12 series de empuje contra 4 de
    tracción" es imposible de calcular porque la app no sabe qué es empuje. Es la clase de lectura
    que separa a un entrenador de un tracker y encaja en el formato RESUMEN que ya existe.

11. **Las referencias del blog siguen sin verificar** (los antiguos #8–#12 de la lista original:
    Cejudo, el cruce Saeidifard/Shailendra, los IDs de PMC). La fase F6 del plan lo resuelve con
    OpenAlex (CC0, sin API key) como herramienta de autoría; no toca la app y es la parte más
    barata de todo el trabajo. Probado: la consulta del weight-bearing lunge test devuelve Bennell
    et al. 1998 (*Aust J Physiother*) y la revisión de 2015 en *Manual Therapy*, con DOI.

**Medición que acota el coste:** de los 89 ejercicios de `exercise-media.js`, solo **24 (27%)**
casan exacto contra `free-exercise-db` tras normalizar, y el emparejamiento difuso produce pares
equivocados con alta confianza (`Remo con Barra → Curl con barra`, `Burpee con flexión → Burpees
sin Flexión`). El mapeo se revisa a mano, entero: es la fase que domina el esfuerzo.

## Encontrado en la auditoría de capacidades del navegador (2026-10)

Medido sobre producción (`arete.raiatech.com`, carga fría con la caché HTTP desactivada) y sobre el
árbol a `dff50a1` (`sw.js` v164). El soporte de cada API está leído de
`@mdn/browser-compat-data@8.1.4`, no de memoria. Nada de esto bloquea nada: es la lista de lo que el
navegador ya sabe hacer y la app no le pide.

12. **`theme_color` del manifest no es el de la app.** `manifest.json:9` declara `#d4372c` (rojo) y
    `js/app.js:37-40` (`applyTheme`) escribe `#f4f2f0`/`#131313` en el `<meta>`. El manifest no se
    actualiza nunca, así que una Areté **instalada** lleva la barra de título de un color que la app no
    muestra en ninguna pantalla. Es un bug, no una mejora: o el manifest hereda el valor claro, o se
    documenta que el que manda en tiempo de ejecución es el meta.

13. **Las 110 fotos de ejercicios son 2,1 MB de los 3,31 MB del precache (63 %).** `sw.js` precachea
    las 110 (110 de 110 en `ASSETS`, v164) en `install`, y solo hacen falta si se abre el catálogo.
    Cachearlas a demanda con un tope LRU deja el precache inicial en ~1,2 MB sin quitar nada offline.

14. **Material Symbols: una dependencia de terceros en el camino crítico para 35 iconos.**
    `app.html:18` sigue pidiendo Inter a `fonts.googleapis.com`, y la hoja de Material Symbols entra
    por `@import url(…) layer(vendor)` en `app.css:35` con un `<link rel="preload">` de consuelo en
    `app.html:22` (el comentario de `app.css:30-34` explica por qué: sin capa ganaba a las 20 reglas de
    tamaño de icono). El apaño está bien hecho — pero sigue habiendo **dos round-trips a un tercero en
    el arranque de una app que se vende offline**, y viaja el fichero de iconos completo para 35
    glifos (`material-symbols-outlined` aparece 35 veces en `app.html`). Con SVG en línea desaparecen
    las tres cosas a la vez: la dependencia, el `@import` bloqueante y la pelea de capas. `assets/icons/`
    ya existe. Prioridad honesta: **baja** — hoy funciona y el preload ya mitiga la latencia.

15. **El manifest declara 10 miembros.** Faltan: `id` (sin él la identidad de lo instalado se deriva
    de `start_url`, y mover esa página deja huérfanas las instalaciones de antes), `shortcuts`
    (Chrome 96 · Safari 17.4) — "Iniciar sesión" es la acción natural de la pulsación larga y ya
    existe como `switchStrTab()` — y `screenshots`, que es lo que convierte la hoja de instalación de
    Android en una tarjeta con imágenes. Además los **dos** iconos van como `"any maskable"` sobre el
    mismo PNG, así que Android va a recortarlo: el mismo fichero no puede ser `any` y `maskable` a la
    vez. BookReader los separa en ficheros distintos; copiar de ahí.

16. **Las pantallas cambian de golpe.** `js/ui/nav.js:31-40` conmuta `classList` (`.section.active`) y
    el panel aparece sin transición; lo mismo con las subpestañas (`js/ui/nav.js:99-104`).
    `document.startViewTransition()` (Chrome 111 · Safari 18 · Firefox 144) da la transición nativa,
    degrada solo donde no exista y no necesita polyfill. Con cinco pestañas más los paneles, es la
    mejora de sensación más barata que queda.

17. **21 bloques `@media (min-width:1024px)` en `app.css` para el layout de escritorio.** El layout
    depende del ancho del panel, no del viewport: `@container` (Chrome 105 · Safari 16 · Firefox 110)
    es la herramienta correcta y colapsa la matriz. **Ojo, esto no es volver a lo que ya se quitó:**
    `app.css:2132-2137` documenta que la `container-type` del segmentado se retiró porque aplica
    contención de layout y el segmentado ya no vive en el carril de 168 px. La propuesta es para el
    layout ancho, no para resucitar ese caso. De paso, `content-visibility: auto` (Chrome 85 ·
    Safari 18 · Firefox 125) en historial y catálogo, que pintan todas sus filas aunque estén fuera de
    pantalla.

18. **No se pide almacenamiento persistente.** Los datos viven en `localStorage` (`loadDB()`) y nada
    llama a `navigator.storage.persist()` (Chrome 55 · Safari 15.2 · Firefox 57). El respaldo de Drive
    es la red de seguridad real, pero persistir el origen cubre la ventana entre sincronizaciones.
    BookReader ya lo pide (`js/sync/blobs.js`).

19. **El wrapper Android va 64 versiones de caché por detrás.** `arete-android/www/` es una copia del
    23-may: su `sw.js` dice **`arete-v100`** contra el **v164** actual, y su `app.css` pesa 80 115 B
    frente a los 235 873 B de hoy (casi un tercio). El repo no recibe commits desde el 2026-07-28
    (`bae9d9f`), ni en local ni en `origin/main`. Y como Capacitor sirve desde `https://localhost`, el
    APK y la PWA son **dos orígenes con dos almacenes**: los datos no son el mismo juego.
    `scope_extensions` (Chrome 138) es la vía moderna para declararlos la misma app;
    `related_applications` (Chrome Android 44) es la señal antigua. Antes de decidir nada:
    ¿el wrapper sigue vivo, o es deuda que conviene retirar?

## Anterior (recuperar de la lista original si aparece)

7. **Tabla de umbrales femenina.** Los umbrales de los 7 dominios están calibrados para hombre de
   ~75 kg y así se declara en pantalla (`CALIBRATION_NOTE`). Falta la columna femenina; necesita
   datos normativos, no código.
