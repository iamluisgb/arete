# Propuesta UX — Sesión de fuerza en Areté

> Documento de diseño. No modifica código. Todas las referencias son a
> `js/ui/training.js`, `js/ui/training-timer.js`, `js/ui/timer.js`, `app.html`,
> `app.css` y `programs/arete.json` en el estado actual del repo (rama `main`).

---

## 1. Cómo es hoy la pantalla (reconstrucción desde el código)

### 1.1 Jerarquía real del DOM

Todo vive dentro de `#strTrain` (`app.html:131-165`), la primera pestaña del
sub-nav de Fuerza (`.str-subnav`, `app.html:125-130`):

```
header (sticky, top:0, z:60)
context-bar / phase-context
.str-subnav  [Actividad | Historial | Progreso | Plan]
#strTrain
  ├─ #timerBar        .timer-bar     ← temporizador global, NO sticky
  ├─ #miniTimer       .mini-timer    ← sticky top:82px, solo si el timer corre
  ├─ #prefillBanner                  ← "Cargada tu última Sesión A (07/14)"
  ├─ .row  [Fecha] [Sesión]
  ├─ #sessionOverview                ← tarjeta previa "Empezar entreno"
  ├─ #exerciseDots    .ex-dots       ← sticky top:82px, solo si ≥3 ejercicios
  ├─ #exerciseList                   ← N × .ex-card
  └─ #saveBar
       ├─ notas plegables
       └─ #saveWorkoutBtn            ← sticky bottom:84px
nav (fixed bottom, z:100)
```

Hay **dos pantallas** en la misma sección, alternadas por `setFormVisible()`
(`training.js:179-188`) y la bandera de módulo `_formExpanded`:

- **Overview** (`renderSessionOverview`, `training.js:190-244`): tarjeta con
  nombre de sesión, lista de ejercicios con su objetivo (`exTargetText`,
  `:163-177`), fecha de la última vez, aviso de borrador y un botón
  "Empezar entreno" / "Continuar entreno".
- **Formulario** (`loadSessionTemplate`, `:247-303`): renderiza el `innerHTML`
  completo de `#exerciseList` con una tarjeta por ejercicio, despachando por
  `mode` a once renderizadores distintos (`:287-300`).

Está bien resuelto que el overview exista: da un "¿qué toca hoy?" antes de
enterrarte en inputs, y el estado de borrador se comunica con su antigüedad
("hace 40min", `:209`). Eso ya es mejor que Strong.

### 1.2 Qué se muestra por serie en modo `sets`

`renderSetsCard` (`training.js:309-334`) produce, por ejercicio, un
`.ex-card` con:

```
Sentadilla                       ← .ex-name    (fs-md, 700)
3×5                              ← .ex-target  (fs-sm, --text2)
       Kg      Reps              ← .sets-header (fs-xs, --text3)
[S1]  [100 ]  [ 5  ]
[S2]  [100 ]  [ 5  ]
[S3]  [100 ]  [ 5  ]
Anterior: 100×5 · 100×5 · 100×5  ← .prev-data
```

- `S1..Sn` son `<button type="button" class="set-label">` de 44×44 con
  `border-radius:50%` (`app.css:76`). La primera lleva `.active-set`
  (`training.js:318`).
- `kg` es `input[type=number] step=0.5`, `reps` es `input[type=text]
  inputmode=numeric`. Ambos con `aria-label` correcto ("Peso serie 1 de
  Sentadilla", `:319`) — esto está bien hecho.
- Cada input lleva a la vez `placeholder="${pK}"` **y** `value="${vK}"` con la
  misma cifra de la sesión anterior. Si `shouldPrefill` es true ves el valor con
  clase `.prefilled` (fondo rojo tenue + borde punteado, `app.css:410`); si no,
  ves el mismo número como placeholder gris.
- `.prev-data` repite otra vez lo mismo abajo ("Anterior: 100×5 · 100×5 · 100×5").
  Es decir: **la carga de la sesión anterior aparece hasta tres veces
  simultáneamente en la misma tarjeta** (placeholder, value, prev-data).

### 1.3 Cómo se registra un set — el flujo real

Hay **dos mecanismos independientes** y se pisan:

**(a) Auto-marcado al perder el foco** (`training.js:849-862`): si el input no
tiene la clase `.prefilled` y tanto kg como reps tienen valor, se marca la serie
como hecha.

**(b) Tap en el label** (`training.js:864-873`): toggle manual, sin confirmación
ni feedback háptico.

El problema es la interacción entre ambos. El camino por defecto tras
`populateSessions()` es `loadSessionTemplate(db, true)` (`:123`) → **prefill
activado**, o sea todos los inputs nacen con `.prefilled`. Consecuencia:

| Situación | ¿Se auto-marca la serie? |
|---|---|
| Repito el peso de la semana pasada, no toco nada | **No** — hay que tocar el label |
| Toco el input para subir 2,5 kg | El handler `input` (`:844-847`) quita `.prefilled` → **sí**, al hacer blur |
| Toco el input y lo dejo igual | También quita `.prefilled` → **sí** |

Dos usuarios idénticos con el mismo entreno obtienen comportamientos distintos
según si tocaron el campo. Y el toggle del label no distingue "hecho" de
"corregido": un roce con la mano sudada desmarca la serie y no vibra, no hay
undo, no hay nada.

`_markSetDone` (`:813-819`) además **sustituye el texto del botón por "✓"**,
guardando el original en `dataset.original`. La consecuencia es que en cuanto
llevas 3 series hechas la columna izquierda es `✓ ✓ ✓ S4 S5`: pierdes el número
de serie precisamente cuando más lo necesitas para orientarte.

### 1.4 Cómo funciona el descanso — el hallazgo principal

**En modo `sets` no existe descanso ligado a la serie. En absoluto.**

`timerBtnHtml()` (`training.js:305-307`) genera el botón "▶ Iniciar timer" y su
`.ex-timer-zone`, y se invoca desde `renderResultCard`, `renderIntervalCard`,
`renderTabataCard`, `renderRoundsCard`, `renderWorkoutCard`, `renderAmrapCard`
y `renderEmomCard`. **No se invoca desde `renderSetsCard`** (`:309-334`).

Todo `training-timer.js` (758 líneas: `startExTimer`, `startRestCountdown`,
`_hiitDotsSVG`, wake lock, beeps de cuenta atrás, pausa/reanudación con
corrección de reloj) está construido **exclusivamente** para HIIT, circuitos,
intervalos, Tabata, EMOM y AMRAP. La fuerza —el núcleo del programa Areté,
literalmente `"Full-body · 3×5 · Progresión lineal"` en
`programs/arete.json`— es el único modo que no tiene nada.

El único descanso disponible para fuerza es la `.timer-bar` global
(`app.html:132-146`), y está desacoplada del registro:

- **No es sticky**: `.timer-bar{z-index:50;...}` (`app.css:110`) declara
  `z-index` sin `position`, así que el `z-index` no hace nada y la barra
  scrollea fuera de vista con el resto del contenido.
- El paliativo es `#miniTimer`, sticky en `top:82px`, pero
  `updateMiniTimerVisibility()` (`timer.js:201-205`) sólo lo muestra si
  **el timer ya está corriendo**. Con el timer parado —que es el estado en el
  que estás justo cuando acabas una serie— no hay ningún acceso al descanso sin
  scrollear hasta arriba del panel.
- Marcar una serie no arranca nada: `_markSetDone` (`:813`) sólo toca clases y
  llama a `_updateActiveSet`.
- La duración por defecto es 2:00 fija (`.timer-btn.active-dur` en
  `app.html:139`), igual para una sentadilla pesada que para una plancha.

Es decir: el ciclo real hoy es **terminar serie → tocar el label → scrollear
arriba → (elegir preset) → tocar ▶ → scrollear abajo → buscar dónde estaba**.
Con el móvil apoyado en el banco, sudado, a 60 segundos de la siguiente serie.

### 1.5 Coste de taps hoy

Sesión de un ejercicio a 5×5, escenario realista (subes 2,5 kg respecto a la
semana pasada y las reps salen):

| Acción | Taps |
|---|---|
| Serie 1: enfocar kg | 1 |
| Borrar "100" (3 backspaces) + teclear "102.5" | ~8 |
| Blur | 1 |
| Scroll arriba + ▶ + scroll abajo | 1 tap + 2 scrolls |
| Series 2-5: tap label ✓ + scroll arriba + ▶ + scroll abajo | 4×2 = 8 taps + 8 scrolls |
| Guardar | 1 |
| **Total** | **~20 taps + 10 recorridos de scroll** |

Sesión completa real (`Sesión A` de fase 1: 3+3+2+3+2 = **13 series**):
**~30-40 taps y 13 idas y vueltas de scroll**, muchas de ellas con teclado
numérico abierto tapando la mitad inferior de la pantalla.

Referencia: Hevy resuelve una serie con **1 tap** (el botón ✓ de la fila, que
además arranca el descanso). Ladder, con 1 tap a pantalla completa.

### 1.6 Qué pasa con el scroll en sesiones largas

`Sesión A` de fase 1 tiene 5 ejercicios. Cada `.ex-card` es
`padding:16px` + `border-radius:24px` + `margin-bottom:12px` (`app.css:71`), con
filas de inputs de `min-height:44px` (`app.css:78`). Estimación: ~230-280 px por
tarjeta de 3 series → **~1400 px de contenido**, unas 2,5 pantallas de un iPhone
en vertical, más los ~300 px que se come el teclado numérico al enfocar.

Paliativos existentes:
- `.ex-dots` (`_setupExDots`, `training.js:131-161`): puntos de scroll-spy con
  `IntersectionObserver`, sticky en `top:82px`. Sólo aparecen con ≥3 ejercicios
  (`:133`) y son puntos anónimos de 8 px — no te dicen a qué ejercicio saltas ni
  cuál está completo.
- **Bug real**: `_setupExDots` hace `$dots.addEventListener('click', ...)`
  (`:141`) en cada llamada sin retirar el anterior. Como `loadSessionTemplate`
  se llama al cambiar de sesión (`:875`), al cancelar edición (`:701`), al
  guardar (`:807`) y al empezar (`:241`), **los listeners se acumulan**: tras
  cinco cambios de sesión, un tap en un punto dispara cinco `scrollIntoView`.

---

## 2. Diagnóstico — problemas concretos

Ordenados por impacto real en el gimnasio.

### P1 · El descanso está desconectado del registro (crítico)
`renderSetsCard` (`training.js:309-334`) no emite `timerBtnHtml()`. Ni
`_markSetDone` (`:813`) ni el auto-marcado por blur (`:849-862`) arrancan
temporizador alguno. El descanso es una barra separada que ni siquiera queda
fija en pantalla (`app.css:110` declara `z-index` sin `position`). Todo el motor
de descanso ya existe en `training-timer.js:493-581` (`startRestCountdown`, con
beeps a 3-2-1, auto-avance y botón de saltar) y **jamás se ejecuta para fuerza**.

### P2 · La pantalla se bloquea entre series
`requestWakeLock()` (`training-timer.js:10-14`) sólo se invoca desde
`startExTimer` (`:322`), que nunca corre en modo `sets`. En una sesión de fuerza
de 45 minutos la pantalla se apaga entre cada serie: desbloquear el móvil con
las manos con magnesio, volver a la app, encontrar el punto. La notificación
persistente vía Service Worker ya existe para el timer global
(`timer.js:27-36` → `sw.js:175-196`) pero tampoco se aprovecha aquí.

### P3 · Dos mecanismos contradictorios de "serie hecha"
Detallado en §1.3. El resultado observable: con prefill (el caso por defecto,
`training.js:123`) nada se auto-marca; sin prefill sí. El tap en el label
(`:864-873`) es un toggle sin `vibrate()` ni `aria-pressed`, cuando el resto de
la app vibra en cada transición (`training-timer.js:20-22`).

### P4 · No hay concepto de "siguiente serie de la sesión"
`_updateActiveSet` (`training.js:827-838`) recibe `label.closest('.sets-grid')`
y opera sólo dentro de esa rejilla. Con 5 ejercicios hay **5 series marcadas
como `.active-set` a la vez**. La UI no sabe responder a la única pregunta que
importa mientras entrenas: *¿qué toca ahora?*

### P5 · La app no sugiere la carga, y tiene los datos para hacerlo
La fase 1 de Areté es progresión lineal explícita. El prefill (`:314-317`) copia
literalmente la sesión anterior; el badge de récord (`_prevBadgeHtml`, `:632`)
sólo se muestra en el caso reps-only (`isRepsOnly`, `:325`). Mientras tanto, el
e1RM por ejercicio (Epley) ya está calculado en `js/ai/context.js:60-64` y en
`render1RMs` (`js/ui/settings.js:16`), y `buildPRCache` (`training.js:547-566`)
ya indexa el máximo histórico. Nada de eso llega a la pantalla donde se usa.

### P6 · Escribir el peso cuesta ~8 taps
`input[type=number]` con el valor anterior dentro (`:319`). iOS no selecciona al
enfocar, así que hay que borrar dígito a dígito. No hay steppers ±, no hay
`enterkeyhint`, no hay avance automático kg → reps → siguiente serie. En un 5×5
casi todas las series repiten el mismo peso: la interacción óptima sería
"heredar de la serie anterior" y sólo intervenir si cambia.

### P7 · Redundancia visual en la tarjeta
El peso anterior aparece como `placeholder`, como `value.prefilled` y otra vez
en `.prev-data` (`:319` y `:331`). Y `.prefilled` (fondo rojo tenue, borde
punteado, `app.css:410`) usa el color de acento —el color de "acción"— para
significar "dato viejo, todavía no confirmado". A un metro de distancia y con la
luz de un gimnasio, un valor prefilled y un valor confirmado son casi idénticos.

### P8 · CSS muerto: `.partial` no se ve
`input.partial{border-color:var(--text3);color:var(--text2)}` (`app.css:312`).
Pero la regla base es `input[...]{border:none}` (`app.css:16`), así que
`border-color` no pinta nada. El único efecto es un color de texto más apagado,
indistinguible de un input normal. `stopExTimer` (`training-timer.js:369, 372,
375, 379`) confía en esa clase para señalar "resultado parcial" y el usuario
nunca lo ve.

### P9 · No hay pantalla de fin de sesión
`saveWorkout` (`:787-796`) sólo muestra `#prCelebration` **si hay PR**. Si no,
un `toast('Sesión guardada')` (`:808`) y vuelta al overview (`:806-807`). No hay
duración, ni tonelaje, ni series completadas vs planificadas, ni comparación con
la sesión anterior. El momento de máxima motivación se desperdicia.

### P10 · El estado vive en el DOM
`saveWorkout` (`:732-753`) y `startEdit` (`:683-690`) leen y escriben con
`document.querySelector('[data-ex=..][data-set=..][data-field=..]')`. El
borrador (`saveDraft`, `:19-45`) serializa los inputs **por índice posicional** y
se descarta entero si `inputs.length !== draft.values.length` (`:66`). Por eso
no se puede guardar: hora de inicio de sesión, timestamp por serie, descanso
real, series saltadas ni orden de ejecución. *No propongo tirar esto* — es una
decisión razonable para una PWA vanilla y funciona; pero es el techo de lo que
se puede construir encima, y conviene saber dónde está.

### P11 · Accesibilidad — contraste
Calculado sobre los tokens reales de `app.css:1`:

| Token | Sobre | Ratio | AA (4.5) |
|---|---|---|---|
| `--text2` `rgba(93,63,59,.55)` | `--surface` `#fff` | **2,85:1** | falla |
| `--text3` `rgba(93,63,59,.40)` | `--surface` `#fff` | **2,05:1** | falla |
| `--text2` (dark) `rgba(231,189,183,.60)` | `#201f1f` | **4,35:1** | falla por poco |

`--text3` es el color de `.sets-header` ("Kg"/"Reps", `app.css:80`), del
`.set-label` en reposo (`:76`) y de `.hiit-ex-item` (`:343`). En modo claro, con
sudor en la pantalla y luz cenital, esos números son ilegibles. Los touch
targets, en cambio, están bien: 44×44 en `.set-label` (`:76`), 44 min en los
inputs (`:78`), 52 en `.hiit-skip-btn` (`:373`).

### P12 · Bug de listeners acumulados en `ex-dots`
`training.js:141`, detallado en §1.6.

---

## 3. Lo que ya está bien y no hay que tocar

Para no rediseñar por rediseñar:

- **El overview previo** (`renderSessionOverview`, `:190-244`) con antigüedad del
  borrador y "Continuar entreno". Es un patrón que Strong no tiene.
- **El auto-guardado de borrador** con debounce de 500 ms y caducidad a 12 h
  (`:47-55, :63`). Robusto y bien dimensionado.
- **El sistema de PR con caché invalidada por revisión** (`buildPRCache`,
  `:547-566` + `getSaveRevision`). Evita escanear todo el histórico en cada
  guardado. Es buena ingeniería.
- **Todo el motor de temporizador HIIT**: el cálculo por reloj de pared
  (`Date.now()` en vez de contadores, `training-timer.js:204, 210, 216`)
  sobrevive a que el navegador suspenda la pestaña, y la pausa corrige el drift
  (`resumeExTimer`, `:664-681`). Está mejor hecho que en muchas apps comerciales.
- **`body.hiit-focus`** (`app.css:353-359`): oculta header, nav, context-bar y
  subnav. **Ya existe un modo pantalla completa en esta app.** Toda la propuesta
  se apoya en él.
- **Los `aria-label` de los inputs de serie** (`:319`).
- **La paleta**: `--accent #d4372c` / `--green #16a34a` con acento invertido en
  oscuro (`#ff5545`, `#30d158`) es coherente y distintiva.

---

## 4. Tres direcciones de diseño

### Dirección A — "Runner": una serie a la vez, a pantalla completa

**Modelo de interacción.** La sesión deja de ser un formulario y pasa a ser una
secuencia. Un objeto `session` en memoria mantiene la cola de series
(`[{exIdx, setIdx, kgSugerido, repsObjetivo, estado}]`). La pantalla muestra
**una sola serie**, ocupando todo el alto. Un botón enorme la completa y avanza.
Swipe lateral para cambiar de ejercicio. Botón "ver lista" para el índice.

```
┌──────────────────────────────────────┐
│  ●●●○○  Sesión A · 6/13              │
│                                      │
│                                      │
│         SENTADILLA                   │
│         Serie 3 de 3                 │
│                                      │
│      ┌──────────────────────┐        │
│      │   102,5  kg          │        │
│      │   −            +     │        │
│      └──────────────────────┘        │
│      ┌──────────────────────┐        │
│      │      5    reps       │        │
│      │   −            +     │        │
│      └──────────────────────┘        │
│                                      │
│   Última vez: 100 × 5                │
│   e1RM 118 kg · PR 105 kg            │
│                                      │
│                                      │
│  ┌────────────────────────────────┐  │
│  │      ✓  SERIE HECHA            │  │
│  └────────────────────────────────┘  │
│      Saltar serie   ·   Ver lista    │
└──────────────────────────────────────┘
```

**Taps.** Una serie sin cambio de peso: **1**. Con +2,5 kg: **2** (un tap en
`+`). 5×5 completo: **5-7 taps**, cero scroll. Sesión de 13 series: **~15 taps**.

**Gana.** El menor coste de interacción posible. Tipografía enorme, legible a un
metro (resuelve P11 por la vía de no depender de grises pequeños). Un solo foco:
imposible perderse (P4). Se acabó el teclado numérico (P6). Es el patrón de
Ladder, Caliber y Juggernaut, y funciona.

**Pierde.** Desaparece la visión de conjunto: no puedes ojear qué queda ni
saltar al ejercicio 4 sin navegar. Editar una serie ya hecha exige retroceder
por la cola. En superseries y trabajo alternado (que Areté ya modela con
`mode:'superset'`, `training.js:505`) el patrón lineal encaja mal. Y para el
usuario que sólo quiere anotar rápido un entreno ya hecho, es lentísimo.

**Coste de implementación.** El más alto con diferencia.
- Nuevo módulo de estado de sesión (~200 líneas) y nuevo renderizador
  (~250 líneas).
- **Rompe el contrato de `saveWorkout`** (`:732-753`) y de `startEdit`
  (`:683-690`): ambos leen `document.querySelector('[data-ex][data-set]')`, y en
  un runner sólo existe en el DOM la serie actual. Hay que reescribir ambos para
  leer del modelo.
- **Rompe `saveDraft`/`restoreDraft`** (`:19-81`), que serializa inputs por
  índice posicional.
- Rompe `_setupExDots` (`:131`) y `setFormVisible` (`:179`).
- Hay que decidir qué pasa con los otros 10 modos (`:287-300`): o se duplica todo
  o conviven dos paradigmas.
- Estimación honesta: **800-1000 líneas nuevas o modificadas**, y `training.js`
  ya son 903.

---

### Dirección B — "Lista con foco": acordeón de ejercicios (patrón Hevy/Strong)

**Modelo de interacción.** Se mantiene la lista, pero sólo **un ejercicio está
expandido**: el activo. Los completados colapsan a una línea de resumen; los
pendientes, a una línea de objetivo. Cada fila de serie tiene un botón ✓ que la
completa. Una barra de progreso de sesión sustituye a los `ex-dots`.

```
┌──────────────────────────────────────┐
│ ████████████░░░░░░░░  6/13 · 24:12   │
│                                      │
│ ✓ Sentadilla   102,5×5 ·5 ·5    ▾   │
│ ✓ Press Banca   80×5 ·5 ·5      ▾   │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ PESO MUERTO              2×5     │ │
│ │ Última: 130×5 · 130×5            │ │
│ │                                  │ │
│ │      Kg        Reps              │ │
│ │ ✓  [132,5]   [  5 ]        ✓     │ │
│ │ 2  [132,5]   [  5 ]        ○     │ │
│ └──────────────────────────────────┘ │
│                                      │
│   Dominada Prono              3×F   ▸│
│   Plancha Abdominal        2×2min   ▸│
│                                      │
│         ┌──────────────────┐         │
│         │  Guardar sesión  │         │
│         └──────────────────┘         │
└──────────────────────────────────────┘
```

**Taps.** Una serie: **1** (el ✓ de la fila) si el peso se hereda; **2-3** con
stepper. 5×5: **5-8 taps**. 13 series: **~15-20 taps** más 3-4 scrolls cortos
(sólo entre ejercicios, no dentro).

**Gana.** Mantiene el contexto: sabes qué has hecho y qué queda. El scroll baja
de ~1400 px a ~600 px (P-scroll). Sigue funcionando para todos los modos: los
`.ex-card` de HIIT, AMRAP, etc. simplemente son "el ejercicio activo" sin más
cambios. Editar una serie hecha es expandir su ejercicio: un tap.

**Pierde.** Sigue siendo denso: los inputs siguen a `fs-xl` en celdas de 44 px,
no a tamaño de "lo leo desde el suelo". Y el colapso/expansión introduce un
estado nuevo que hay que sincronizar con el borrador. No resuelve P1 ni P2 por
sí sola: podrías tener acordeón perfecto y seguir sin descanso.

**Coste de implementación.** Medio.
- `renderSetsCard` (`:309-334`): añadir botón ✓ por fila y clases de estado.
- Nuevo estado de expansión + delegación de eventos en `initTraining` (`:841`).
- `_updateActiveSet` (`:827`) pasa a operar sobre `#exerciseList` entero.
- **Compatible con `saveWorkout`, `startEdit`, `saveDraft`**: si los ejercicios
  colapsados mantienen sus inputs en el DOM (con `hidden` o `max-height:0`, no
  con `display:none` ni desmontados), todos los `querySelector` siguen
  funcionando y `inputs.length` no cambia. **Esto es clave y hay que respetarlo.**
- Sustituir `_setupExDots` (`:131-161`) por una barra de progreso arregla P12 de
  paso.
- Estimación: **~250 líneas** modificadas, sin migración de datos.

---

### Dirección C — "El descanso manda": la lista se queda, el descanso toma la pantalla ★ RECOMENDADA

**Modelo de interacción.** Se parte de la observación de que en fuerza pasas
**más tiempo descansando que levantando**: en un 5×5 con 3 minutos de descanso,
~80% de la sesión son pausas. Hoy la app diseña la pantalla para el 20% (el
formulario) y no diseña nada para el 80%.

La lista de ejercicios se mantiene tal cual (con las mejoras de B como fase
posterior). El cambio estructural es que **completar una serie invoca una hoja
de descanso a pantalla completa** que se convierte en la pantalla principal de
la sesión: cuenta atrás gigante, qué toca después, y la posibilidad de corregir
lo que acabas de hacer sin salir de ahí.

Estado reposo (la lista, sin descanso activo):

```
┌──────────────────────────────────────┐
│  ████████░░░░░░░░░░  4/13 · 18:40    │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ SENTADILLA                 3×5   │ │
│ │            Kg       Reps         │ │
│ │  ✓  [ 102,5 ]   [  5  ]          │ │
│ │  ✓  [ 102,5 ]   [  5  ]          │ │
│ │  3  [ 102,5 ]   [  5  ]          │ │
│ │  Anterior 100×5 · PR 105 · +2,5  │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ PRESS DE BANCA             3×5   │ │
│ │  ...                             │ │
└──────────────────────────────────────┘
```

Estado descanso (tras tocar ✓ en la serie 3) — **pantalla completa,
`body.session-focus`, nav y header ocultos, wake lock activo**:

```
┌──────────────────────────────────────┐
│  ●  ●  ●  ○  ○         Sesión  24:12 │
│                                      │
│            DESCANSA                  │
│                                      │
│              2:14                    │
│                                      │
│  ────────────────────────────░░░░░   │
│                                      │
│   Acabas de hacer                    │
│   ┌──────────────────────────────┐   │
│   │ Sentadilla S3   102,5 × 5    │   │
│   │       − kg +      − reps +   │   │
│   └──────────────────────────────┘   │
│                                      │
│   Siguiente                          │
│   Press de Banca · S1 · 82,5 × 5     │
│                                      │
│  ┌──────────┐  ┌──────────────────┐  │
│  │  +30 s   │  │  SALTAR DESCANSO │  │
│  └──────────┘  └──────────────────┘  │
└──────────────────────────────────────┘
```

Al llegar a cero: beep + vibración (ya existen, `training-timer.js:20-22`), la
hoja se retira sola y la lista queda scrolleada exactamente en la siguiente
serie, ya marcada como activa.

**Taps.** Una serie: **1** (el ✓). El descanso arranca solo. Corregir el peso
son taps *durante* el descanso, cuando ya no cuestan tiempo real. 5×5: **5 taps
+ 1 guardar = 6**. Sesión de 13 series: **~14-16 taps y cero scroll manual**
(la lista se autoposiciona).

**Gana.**
- Ataca P1 y P2, que son los dos problemas graves, y son precisamente los que
  ninguna cantidad de rediseño cosmético arregla.
- Reutiliza infraestructura que ya existe y ya está depurada:
  `startRestCountdown` (`training-timer.js:493-581`), `requestWakeLock`
  (`:10-14`), `_hiitDotsSVG` (`:114-120`), `body.hiit-focus` (`app.css:353`),
  `.hiit-rest` (`app.css:366-369`), `.hiit-skip-btn` (`:373`), los beeps
  (`:20-22`) y la notificación de Service Worker (`sw.js:175-196`).
- **Da coherencia a la app**: hoy el HIIT tiene una experiencia guiada preciosa
  y la fuerza es un formulario de Excel. Con C, ambos modos se sienten como la
  misma app.
- La corrección de peso/reps ocurre en el momento correcto —descansando— y no
  compitiendo con el teclado por el espacio de pantalla (P6).
- Al retirarse, el auto-scroll a la siguiente serie elimina el problema de
  orientación de §1.6 sin necesidad de rediseñar la lista.

**Pierde.**
- La lista sigue siendo larga en reposo. Sin la fase 2 (dirección B como capa),
  navegar entre ejercicios sigue costando scroll.
- Introduce una pantalla modal: si el usuario quiere ojear el resto de la sesión
  mientras descansa tiene que salir. Se mitiga con un gesto de arrastrar hacia
  abajo para minimizar a una barra sticky (reutilizando `#miniTimer`,
  `app.html:148`).
- No sirve para el caso "anoto un entreno que ya hice ayer". Necesita un
  interruptor: si `$trainDate.value !== hoy`, el modo descanso no se activa.

**Coste de implementación.** El más bajo de los tres para el beneficio obtenido.
- `renderSetsCard` (`:309-334`): añadir un `data-rest` calculado y un
  `<div class="set-rest-zone">` hermano del grid.
- `_markSetDone` (`:813-819`): llamar a una nueva `startSetRest()`.
- `training-timer.js`: nueva rama en `startRestCountdown` (`:493`) o mejor una
  función hermana `startSetRest(exIdx, setIdx, secs, ctx)` de ~80 líneas que
  reutiliza el patrón de `:497-536`.
- `app.css`: renombrar/duplicar `body.hiit-focus` (`:353-359`) como
  `body.session-focus` y añadir un bloque `.set-rest` de ~30 líneas apoyado en
  `.hiit-rest` (`:366`).
- **No toca** `saveWorkout`, `startEdit`, `saveDraft`, `restoreDraft`, ni el
  modelo de datos. Los tests de `tests/training.test.js` y
  `tests/training-timers.test.js` siguen pasando sin cambios.
- Estimación: **~180 líneas nuevas** en el primer envío útil.

---

### Comparativa

| | A · Runner | B · Acordeón | C · Descanso manda |
|---|---|---|---|
| Taps por serie | 1-2 | 1-3 | 1 |
| Taps sesión 5×5 | 5-7 | 5-8 | 5-6 |
| Scroll en sesión de 13 series | 0 | 3-4 | 0 (auto) |
| Resuelve P1 (descanso) | sí | no | **sí** |
| Resuelve P2 (wake lock) | sí | no | **sí** |
| Resuelve P4 (serie activa global) | sí | sí | parcial |
| Mantiene visión de conjunto | no | **sí** | sí (en reposo) |
| Funciona para los 11 modos | no | **sí** | **sí** |
| Rompe `saveWorkout`/`startEdit`/draft | **sí** | no | **no** |
| Líneas estimadas | 800-1000 | ~250 | **~180** |

**Recomendación: C, con B como fase 2.** El motivo no es que C sea la más bonita
—A lo es— sino que en una PWA vanilla de un solo desarrollador la métrica que
importa es *beneficio por línea de código de riesgo*. C toca cuatro funciones,
reutiliza un motor ya probado en producción, no requiere migración de datos ni
reescribir el contrato DOM del que dependen guardado, edición y borrador, y
ataca los dos únicos defectos que hacen la app peor que Hevy en el gimnasio.
A es un rediseño de tres fines de semana que además obliga a decidir qué hacer
con los otros diez modos de ejercicio.

---

## 5. Detalle de la dirección recomendada

### 5.1 Comportamiento del descanso

**Duración por defecto.** El modelo ya distingue `type` en
`programs/arete.json`: `"main"` (sentadilla, banca, peso muerto, clean) y
`"assist"` (dominadas, planchas). Regla propuesta, en cascada:

1. `ex.rest` si el JSON del programa lo trae (el campo ya existe y se usa en
   HIIT/circuitos, `training.js:343, 404`).
2. `type: "main"` → **180 s**.
3. `type: "assist"` → **90 s**.
4. Última serie de un ejercicio → **60 s** (transición, no recuperación).
5. Override manual persistido por ejercicio en `db.settings.restOverrides`.

**Arranque.** `_markSetDone` (`:813`) llama a `startSetRest()`. Sólo si:
- el modo es `sets`,
- `$trainDate.value` es hoy (si estás anotando un entreno pasado, no descansas),
- no es la última serie de la sesión.

**Durante.** Cuenta atrás con `Date.now()` (mismo patrón que
`training-timer.js:516`, resistente a suspensión de la pestaña). Wake lock
mediante `requestWakeLock()` (`:10`). Beeps a 3-2-1 con
`beep(660 + (3-remaining)*220, 100)` — exactamente el patrón de `:522-525` — y
`exBeepWork()` al terminar. Si `document.visibilityState === 'hidden'`, enviar
`swPost({type:'timer-start-live'})` como hace `timer.js:29`, para que la
notificación persistente muestre la cuenta atrás en la pantalla de bloqueo.

**Controles.** Tres, y sólo tres:
- **`+30 s`** — extiende. Es el control que más se usa en la vida real.
- **`SALTAR DESCANSO`** — reutiliza `.hiit-skip-btn` (`app.css:373`), 52 px de
  alto, borde de acento que se rellena al pulsar.
- **Arrastrar hacia abajo** — minimiza a `#miniTimer` (`app.html:148`, ya
  sticky en `top:82px`) y devuelve la lista, con el descanso corriendo. Es la
  válvula de escape para "quiero mirar qué viene después".

**Al terminar.** Retirar la hoja, quitar `body.session-focus`, liberar el wake
lock, y `scrollIntoView({behavior:'smooth', block:'center'})` sobre la fila de
la siguiente serie, que pasa a `.active-set`.

**Si la app estaba en segundo plano** cuando terminó: al volver a primer plano,
`visibilitychange` (patrón de `timer.js:255-262`) detecta que el descanso venció
y la hoja aparece ya en estado "listo" con el texto `Descanso terminado hace
1:20` en `--accent`, no una cuenta atrás en negativo.

### 5.2 Registro de peso y reps

**Herencia.** El primer valor de kg de un ejercicio se propone por la regla de
progresión (§5.3). Las series 2..n **heredan de la serie inmediatamente
anterior** en cuanto ésta se marca hecha, en vez de venir del prefill histórico.
Es como funciona un 5×5 real: mismo peso en todas las series salvo excepción.

**Steppers.** Reemplazar el `input[type=number]` desnudo (`:319`) por:

```
┌───┐  ┌─────────┐  ┌───┐
│ − │  │  102,5  │  │ + │       ← 44×44 / 76×44 / 44×44
└───┘  └─────────┘  └───┘
```

El input central **conserva sus atributos actuales** (`data-ex`, `data-set`,
`data-field`, `aria-label`) para no romper `saveWorkout:737`, `startEdit:685` ni
el conteo posicional de `saveDraft:21`. Incremento: 2,5 kg por defecto; 5 kg en
sentadilla y peso muerto; 1,25 kg si `db.settings.microplates` está activo.
Pulsación larga en `+` → repetición acelerada.

Un tap en el número central sigue abriendo el teclado numérico para introducir
un valor arbitrario (jamás quitar esa salida).

**Reps.** Chips en vez de teclado. Con `ex.reps === "5"`, mostrar
`[3][4][5][6][7]` con el 5 preseleccionado; el resto de valores por teclado.
Para `reps: "F"` (dominadas al fallo, `programs/arete.json`) o `"2min"`, seguir
con input libre. Para `"3-5"` o `"5-8"` (fase 2 del programa), generar los chips
del rango.

### 5.3 Sugerencia de carga

Nueva función junto a `getExercisePR` (`training.js:569`), aprovechando
`buildPRCache` (`:547`):

```
suggestNextLoad(db, ex) →
  { kg, motivo: 'progresion' | 'repeticion' | 'descarga' | 'sin-datos' }
```

Reglas para fase 1 (progresión lineal, que es lo que el programa declara):
- Si en la última sesión **todas** las series alcanzaron las reps objetivo:
  `+5 kg` en sentadilla / peso muerto / clean, `+2,5 kg` en banca / press
  militar. → `motivo: 'progresion'`.
- Si falló alguna serie: repetir peso. → `'repeticion'`.
- Si falló **dos sesiones seguidas**: `−10 %` redondeado a 2,5. →
  `'descarga'` (deload).
- Sin histórico: campo vacío con placeholder `—`. → `'sin-datos'`.

**Presentación.** No rellenar en silencio. Un chip tocable bajo el ejercicio:

```
Anterior 100×5 ·  PR 105  ·  [ ↑ 102,5 kg ]
                              ^^^^^^^^^^^^^ tap → aplica a todas las series
```

Con `--green` para `progresion`, `--text2` para `repeticion`, `--accent` para
`descarga` (con tooltip "3ª sesión fallando, toca descargar"). Esto sustituye a
`.prev-data` (`:331`) y elimina de paso la triplicación de P7: el placeholder de
los inputs pasa a ser el valor sugerido, y el `value` sólo se rellena cuando el
usuario lo confirma. Adiós a `.prefilled` como estado ambiguo.

### 5.4 Editar una serie ya hecha

Dos caminos, ambos de un tap:

1. **Durante el descanso**: el bloque "Acabas de hacer" de la hoja es editable
   en sitio con los mismos steppers. Es el 90 % de los casos reales ("me han
   salido 4, no 5").
2. **Después**: tap en el `✓` de la serie. Hoy eso desmarca (`:867`). Propuesta:
   tap corto → abre la fila en edición manteniendo el estado hecho; **pulsación
   larga (500 ms) con vibración** → desmarca. Invierte la prioridad hacia la
   acción frecuente y protege la destructiva. El `.set-label` recupera su número
   (`S3`) con un check pequeño superpuesto, en vez de perder el número
   (`_markSetDone:816`).

### 5.5 Progreso dentro de la sesión

Sustituir `.ex-dots` (`app.css:33-36`, `training.js:131-161` — y de paso matar
el bug de listeners de P12) por una barra sticky en `top:82px`:

```
████████████░░░░░░░░░░  6/13 · 24:12 · 3.180 kg
```

- Series completadas / totales (contando sólo las de `mode:'sets'`).
- Tiempo desde la primera serie marcada (no desde que se abrió la pantalla).
- Tonelaje acumulado (`Σ kg × reps`), que es la métrica que el propio módulo de
  IA ya usa (`js/ai/context.js`).

Fondo `var(--bg)`, relleno `var(--accent)`, altura 4 px + una línea de texto en
`--fs-sm` con `--text2`. Al tocarla, despliega el índice de ejercicios con su
estado (esto es la puerta de entrada natural a la dirección B en la fase 2).

### 5.6 Al terminar

Cambiar la condicionalidad de `saveWorkout:787` (`if (prs.length > 0)`) por un
resumen que se muestre **siempre**, con el bloque de PR como sección opcional
dentro:

```
┌──────────────────────────────────────┐
│              SESIÓN A                 │
│           47 min · 13 series          │
│                                       │
│   Tonelaje       6.340 kg   ▲ +4 %    │
│   Series         13/13      ✓         │
│   Descanso medio 2:47                 │
│                                       │
│  🏆 NUEVO PR                          │
│  Sentadilla    100 kg → 102,5 kg      │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │           Hecho                 │  │
│  └─────────────────────────────────┘  │
│         Compartir  ·  Ver detalle     │
└──────────────────────────────────────┘
```

Reutiliza `#prCelebration` / `.pr-card` (`app.html:408-416`) y su `#prList`,
que ya se llena en `:788-794`. "Compartir" enlaza con `shareCard`
(`js/ui/history.js:154`), que ya existe.

### 5.7 Estados vacíos y de error

| Situación | Comportamiento propuesto |
|---|---|
| Primera vez con un ejercicio (sin `prev`) | Sin chip de sugerencia; placeholder `—`; texto `Primera vez — anota lo que uses` en `--text2`. Hoy simplemente no aparece `.prev-data` (`:323`), sin explicación. |
| Cambio de sesión con datos sin guardar | Hoy `$trainSession.addEventListener('change')` (`:875`) llama a `clearDraft()` **sin preguntar**: se pierde todo. Añadir confirmación si hay alguna serie marcada. Es una pérdida de datos silenciosa real. |
| Guardar sin ningún dato | Ya resuelto: `toast('Introduce al menos un dato…', 'error')` (`:757`). Mantener. |
| Sesión abandonada a medias | El borrador ya cubre 12 h (`:63`). Añadir en el overview: `Borrador guardado hace 40min · 6/13 series` en vez de sólo la antigüedad (`:210`). |
| `localStorage` lleno | `saveDraft` traga la excepción en silencio (`:44`, `catch { /* quota */ }`). Mostrar `toast('No se pudo guardar el borrador', 'error')` una sola vez por sesión. |
| Wake lock denegado | `requestWakeLock` traga el error (`training-timer.js:13`). Aceptable; el descanso sigue funcionando por reloj de pared. Sin aviso al usuario. |
| Audio bloqueado por el navegador | Ya se resuelve con el `touchstart` de desbloqueo (`training-timer.js:754-757`). La vibración es el respaldo. |

### 5.8 Accesibilidad

**Touch targets.** La app ya cumple 44×44 en `.set-label` (`app.css:76`) e
inputs (`:78`). Para los elementos nuevos:
- Botón ✓ de serie: **56×56** (es la acción primaria, con manos sudadas).
- Steppers `−`/`+`: 44×44, separados 8 px del campo para evitar toques cruzados.
- `SALTAR DESCANSO` y `+30 s`: 52 px de alto, como `.hiit-skip-btn` (`:373`).
- Zona muerta de 300 ms tras marcar una serie, para que el tap de confirmación
  no atraviese a la hoja de descanso que aparece debajo del dedo.

**Contraste.** Corregir lo medido en P11 dentro de la superficie de sesión:
- La cuenta atrás usa `--text` (`#1c1b1b` sobre `--surface2 #ebe8e5` = 14,5:1) a
  `--fs-4xl` (3 rem), no `--text3`.
- Los encabezados `Kg`/`Reps` (`.sets-header`, `app.css:80`) pasan de `--text3`
  (2,05:1) a `--text2`, y ganan `font-weight:700` y `letter-spacing` — o
  desaparecen, porque los steppers ya se explican solos.
- El número de serie en reposo pasa de `--text3` a `--text2`.
- No usar nunca `--text3` para texto por debajo de `--fs-md` dentro de la
  sesión activa. Como color de borde/decoración sigue estando bien.

**Semántica.**
- `.set-label` gana `aria-pressed="true|false"` y conserva su número
  (`aria-label="Serie 3 de Sentadilla, completada"`).
- La hoja de descanso: `role="dialog"`, `aria-modal="true"`,
  `aria-live="polite"` sobre la cuenta atrás con actualización **cada 15 s y en
  los últimos 5**, no cada 250 ms (saturaría cualquier lector de pantalla).
- Foco atrapado dentro de la hoja mientras esté abierta; devuelto a la serie
  siguiente al cerrarse.
- `prefers-reduced-motion`: sin `scrollIntoView` suave, sin la animación
  `hrd-pop` (`app.css:378`), sin la transición de entrada de la hoja.

### 5.9 Encaje con el sistema visual de Areté

Todo se construye con tokens existentes (`app.css:1` y `:825`). Nada nuevo.

| Elemento | Claro | Oscuro |
|---|---|---|
| Fondo hoja de descanso | `--surface2` `#ebe8e5` | `#2a2a2a` |
| Borde hoja | `1.5px solid var(--accent)` `#d4372c` | `#ff5545` |
| Cuenta atrás | `--text` `#1c1b1b`, `--fs-4xl`, `font-variant-numeric:tabular-nums` | `#e5e2e1` |
| Serie completada | `rgba(22,163,74,.12)` + `--green` | `--green` `#30d158` |
| Serie activa | `--accent-glow` + `--accent` | `rgba(255,85,69,.3)` |
| Chip de progresión | `--green` | `--green` |
| Chip de descarga | `--accent` | `--accent` |
| Radios | `--radius` 16 (hoja), `--radius-lg` 24 (tarjetas) | idem |
| Espaciado | escala `--sp-1..--sp-10` | idem |

Precedentes exactos que se reutilizan sin inventar nada:
- `.ex-timer.hiit-rest` (`app.css:366-369`) — ya es una hoja de descanso con
  cuenta atrás a `--fs-4xl`, cabecera de fase en `--fs-xs` con
  `letter-spacing:2px`, y bloque "Siguiente:". Es literalmente el ancestro
  visual de lo que propongo; sólo cambia el contenido.
- `.hiit-skip-btn` (`app.css:373-374`) — botón fantasma de acento que se rellena
  al pulsar. Se reusa tal cual para "Saltar descanso".
- `.hrd` / `.hiit-rounds-dots` (`app.css:375-378`) — puntos de progreso de
  ronda; pasan a ser puntos de serie.
- `body.hiit-focus` (`app.css:353-359`) — el modo pantalla completa ya existe.
  Se generaliza a `body.session-focus` y `.hiit-focus` queda como alias.

Coherencia de color a respetar: en Areté el verde (`--green`) significa
"completado / conseguido" (`.set-done`, `.hiit-work`, `.prev-data span`) y el
rojo de acento (`--accent`) significa "acción / descanso / atención"
(`.hiit-rest`, `.timer-display.warning`, `.circuit-work`). La propuesta mantiene
exactamente esa gramática: serie hecha en verde, hoja de descanso en acento.

---

## 6. Plan de implementación incremental

### Paso 1 — Descanso automático en fuerza *(el primer envío; ~180 líneas)*

El commit que ya mejora la sesión más que cualquier otra cosa.

- `training.js:309` `renderSetsCard`: añadir `data-rest="${restSecs}"` a la
  tarjeta y un `<div class="set-rest-zone" data-ex="${i}"></div>` tras el grid.
- `training.js:813` `_markSetDone`: invocar `startSetRest(exIdx, setIdx, secs)`
  cuando el modo sea `sets`, la fecha sea hoy y no sea la última serie.
- `training-timer.js`: nueva `export function startSetRest(...)` de ~80 líneas
  calcada del patrón de `startRestCountdown:497-536`, con `requestWakeLock()`,
  beeps a 3-2-1 y `exBeepWork()` al final.
- `app.css`: renombrar `body.hiit-focus` (`:353-359`) a
  `body.session-focus, body.hiit-focus` y añadir `.set-rest` apoyado en
  `.hiit-rest` (`:366`).
- Añadir `vibrate(100)` al marcar/desmarcar serie (`training.js:864-873`) para
  igualar el feedback del resto de la app.

**No toca** `saveWorkout`, `startEdit`, `saveDraft`, `restoreDraft` ni el modelo
de datos. `tests/training.test.js` y `tests/training-timers.test.js` pasan sin
cambios. Riesgo: bajo. Reversible con un `if`.

### Paso 2 — Sugerencia de carga y limpieza de la tarjeta *(~120 líneas)*

- Nueva `suggestNextLoad(db, ex)` junto a `getExercisePR` (`training.js:569`).
- El placeholder del input de kg pasa a ser la sugerencia; el `value` sólo se
  rellena al confirmar. Elimina `.prefilled` como estado ambiguo (P7) y de paso
  arregla el comportamiento errático del auto-marcado (P3), porque ya no habrá
  inputs con valor y clase `.prefilled` a la vez.
- Chip `[↑ 102,5 kg]` que aplica a todas las series de un tap.
- Sustituir `.prev-data` por la línea compacta `Anterior 100×5 · PR 105 · chip`.

### Paso 3 — Steppers y chips de reps *(~100 líneas)*

- Envolver el input de kg en el grupo `−/valor/+` **conservando todos sus
  atributos `data-*`** para no romper `saveWorkout:737` ni `startEdit:685`.
- Chips de reps derivados de `ex.reps` (`"5"`, `"3-5"`, `"5-8"`, `"F"`).
- Herencia de peso de la serie anterior al marcarla hecha.
- Bloque editable "Acabas de hacer" dentro de la hoja de descanso.

### Paso 4 — Barra de progreso de sesión *(~80 líneas)*

- Sustituye `_setupExDots` (`training.js:131-161`) y con ello **arregla el bug
  de listeners acumulados de P12**.
- Series hechas / totales, cronómetro de sesión, tonelaje.
- Al tocarla, índice desplegable de ejercicios: la puerta a la fase B.

### Paso 5 — Resumen de fin de sesión *(~100 líneas)*

- Generalizar el bloque `if (prs.length > 0)` de `saveWorkout:787-796` a un
  resumen que se muestre siempre, con `#prList` como sección interna.
- Reutiliza `.pr-card` (`app.html:409`) y `shareCard` (`history.js:154`).

### Paso 6 — Dirección B: acordeón *(~250 líneas)*

Sólo cuando 1-5 estén asentados y usados unas semanas.
- Colapsar ejercicios completados y pendientes; expandir sólo el activo.
- **Condición innegociable**: los inputs de los ejercicios colapsados
  permanecen en el DOM (`hidden` / `max-height:0`, nunca desmontados), o se
  rompen `saveWorkout:737`, `startEdit:685` y el conteo posicional de
  `saveDraft:21` / `restoreDraft:66`.
- `_updateActiveSet` (`:827`) pasa a operar sobre `#exerciseList` entero,
  resolviendo P4.

### Paso 7 — Opcional: timestamps por serie *(el único con migración)*

- Cambiar `{kg, reps}` a `{kg, reps, t}` en `saveWorkout:739`.
- Requiere revisar `js/data.js`, `tests/merge.test.js` y la lectura del
  histórico. Desbloquea descanso real medido, densidad y duración exacta.
- Marcado como opcional a propósito: es el único paso con coste de
  compatibilidad hacia atrás, y los pasos 1-5 no lo necesitan.

### Orden de valor por esfuerzo

```
Paso 1  ████████████████████  descanso + wake lock   (180 líneas)
Paso 2  ███████████████       sugerencia de carga    (120)
Paso 3  ██████████            steppers               (100)
Paso 4  ███████               progreso               (80)
Paso 5  █████                 resumen final          (100)
Paso 6  █████                 acordeón               (250)
Paso 7  ██                    timestamps             (migración)
```

---

## 7. Nota final

La conclusión honesta tras leer el código: **la sesión de fuerza no está mal
diseñada, está sin diseñar**. El overview, el borrador con caducidad, la caché
de PR y sobre todo el motor de temporizador HIIT —con reloj de pared, wake lock,
pausa sin drift y notificación por Service Worker— demuestran criterio y oficio.
Lo que ocurre es que toda esa inversión se hizo en el modo HIIT y el modo `sets`
se quedó siendo el formulario original.

Por eso la propuesta no es un rediseño: es conectar dos partes de la app que ya
existen y todavía no se hablan.
