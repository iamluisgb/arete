# Auditoría UX — Areté

> Agosto 2026 · sobre `main` de `projects/arete` (rev. `7df3ff9`) y `projects/arete-android` (`BACKLOG.md` de 2026-07-28).
> Método: lectura del código de los 13.460 LOC de `js/`, `app.html` (861 líneas), `app.css` (1.062), `sw.js`, los documentos de tesis (`blog/8-dominios.html`, `mejoras_arete.md`) y los dos documentos de diseño previos (`propuesta-ux-sesion-fuerza.md`, `plan-sesion-fuerza.md`).
> Estado de la suite: **274 tests, 16 ficheros, todos en verde**. La base es sana; los problemas son de producto y de interfaz, no de estabilidad.

---

## 1. Resumen ejecutivo

- **La tesis del producto no está en el producto.** Los 7 dominios, la regla "tu nivel = el mínimo", el radar y los tests son el 100% del argumento diferencial de Areté — y no aparecen ni una sola vez en `js/` ni en `app.html`. `grep -i 'radar\|dominio\|glicolít'` sobre el código devuelve cero. El radar existe en `dashboard-prototype.html` y en el blog; la app real abre con cuatro anillos genéricos (volumen, sesiones, km, carreras) y una cita motivacional. **Es el hallazgo número uno y el que más rinde arreglar**: sin él, Areté es un tracker más, y todas las demás decisiones (incluida la de running) se toman sin criterio.

- **La tipografía es demasiado pequeña para el contexto de uso.** El tamaño de texto más frecuente del sistema es `--fs-base: .72rem` = **11,5 px** (69 declaraciones), seguido de `--fs-sm` 10,4 px (41) y `--fs-xs` 9,6 px (36). Para una app que se lee con el móvil en el suelo, sudado, entre series, esto es un fallo funcional, no estético.

- **El contraste incumple WCAG AA de forma sistemática.** `--text2` da ~2,8:1 y `--text3` ~2,0:1 sobre el fondo claro (mínimo exigible: 4,5:1). `--text3` es justo el color de las etiquetas de serie, de los estados vacíos y de las unidades de las métricas.

- **Un usuario nuevo estrena la app con datos falsos.** `js/app.js:112-125` siembra un entreno inventado del 9 de febrero de 2026 en el historial de todo el mundo. Contamina PRs, racha, dashboard y el contexto que Quirón le pasa al modelo. Es un fallo de confianza y se arregla en diez minutos.

- **La sesión de fuerza está bien resuelta hasta el último segundo, y ahí se cae.** El `set-runner.js` es excelente trabajo — descanso ligado a la serie, un tap por serie, cero scroll, wake lock, invariante de presentación documentada. Pero `finish()` (`set-runner.js:286-289`) cierra la hoja y devuelve al usuario a la lista, sin resumen y sin guardar: hay que hacer scroll hasta el botón de guardar. El P9 de `propuesta-ux-sesion-fuerza.md:250` sigue abierto y es el remate barato de un flujo ya construido.

- **Hay dos codebases divergiendo, cada uno con la mitad de las mejoras.** El repo Android tiene el GPS en background resuelto (foreground service nativo, `running-tracker.js` con 15 referencias a Capacitor, 763 líneas); la PWA no lo tiene (662 líneas, cero Capacitor). A la inversa: la PWA tiene el runner de fuerza y el CSS nuevo (`training.js` 1071 vs 899; `app.css` 1062 vs 888) y Android está atrás. Este fork es hoy el mayor coste oculto del proyecto, y su epicentro es running.

- **Running ocupa ~27% del JS, ~37% de `app.html`, ~24% del CSS, ~31% de los tests y ~20% de los commits** — y la mitad de esa superficie depende del GPS. La app llega a advertir al usuario, en el momento de arrancar, de que su propio tracker no es fiable (`running.js:647`: *"Mantén la pantalla encendida para GPS continuo"*).

- **Quirón, el diferenciador real que sí está construido (1.011 líneas, herramientas, ingesta por visión, propuestas de plan), está detrás de un muro de configuración técnica**: `quiron.js:184-190` oculta la barra de entrada hasta que el usuario pega una API key en Ajustes. Es pedirle a un atleta que traiga su propio proveedor de LLM.

---

## 2. Mapa de la experiencia actual

### 2.1 Jerarquía de navegación

```
header (sticky) ─ Areté · indicador de sync · offline banner
nav (fixed bottom, 5 pestañas — app.html:782-788)
 ├─ Inicio      #secDashboard    4 anillos + racha + cita + 2 CTA + actividad reciente
 ├─ Fuerza      #secStrength     sub-nav 4: Actividad · Historial · Progreso · Plan
 ├─ Running     #secRunning      sub-nav 4: Actividad · Historial · Progreso · Plan
 ├─ Cuerpo      #secBody         medidas, proporciones, calorías
 └─ Más         #secSettings     1RM, zonas, tema, Drive, planes, Quirón (config)

FAB flotante   #quironFab → panel de chat (modal a pantalla completa)
Overlays a pantalla completa fuera de la nav:
  .set-runner (creado en runtime, set-runner.js:118)
  #runLiveScreen / #runUiLock / #runSummaryScreen (app.html:555-679)
  #shareEditor (app.html:740+)
```

**Observación estructural**: dos de las cinco pestañas primarias — Fuerza y Running — son la misma acción del usuario ("entrenar hoy"), con sub-navs simétricas de cuatro pestañas cada una (Actividad/Historial/Progreso/Plan) y código duplicado en paralelo (`nav.js:49-59` vs el `switchRunTab` equivalente). Mientras tanto, el concepto que define el producto —el perfil de dominios— no tiene sitio en la navegación.

### 2.2 Flujos y dónde se rompen

**Onboarding → primer uso** — *se rompe al principio y al final*
```
[3 slides estáticas]  app.html:832-856
   Areté → Registra tus series → Timer de descanso
        ↓ (no se pregunta nada: ni nombre, ni peso, ni 1RM, ni objetivo)
[Dashboard]  "Hola, Guerrero" (literal en app.html:57)
             4 anillos contra objetivos inventados (dashboard.js:131,138,157)
             1 entreno falso de febrero ya en el historial (app.js:112-125)
```
Rotura: el usuario no ha dicho quién es, y la app ya le está puntuando contra 50 toneladas semanales y le muestra un entreno que no hizo. El `wizard.js` (141 líneas, `createWizard`) existe, está precacheado en `sw.js:157` y **no lo importa nadie** — la infraestructura para un onboarding real ya está escrita y sin usar.

**Sesión de fuerza** — *el mejor flujo de la app, con el remate sin hacer*
```
Fuerza → Actividad
  [Overview]  training.js:190-244 · nombre, ejercicios, objetivo, "última vez", edad del borrador
        ↓ "Empezar entreno"
  [Lista de tarjetas]  11 renderizadores por modo (training.js:395-408)
        ↓ botón "Empezar sesión" (training.js:418-432)
  [Runner a pantalla completa]  set-runner.js
        trabajo → "Serie hecha ✓" → descanso (anillo, ±30s que se recuerdan) → siguiente
        ↓ última serie
  finish() → close()  ← ✗ la hoja desaparece. Ni resumen, ni PRs, ni guardado.
        ↓ el usuario tiene que buscar
  #saveWorkoutBtn (sticky bottom) → toast "Sesión guardada"
```

**Running con GPS** — *se rompe cuando el sistema operativo dice que no*
```
Running → "Iniciar carrera" → picker de tipo → startGpsRun (running.js:624)
   ├─ toast: "Mantén la pantalla encendida para GPS continuo"  (:647)
   ├─ nav.style.display = 'none'  (:694)
   └─ overlay #runLiveScreen + mapa Leaflet
        ↓ si el permiso se deniega o el GPS falla
   tracker.onError → sólo un toast (running.js:454-456)
        ↓
   overlay abierto, cronómetro a 00:00, nav oculta.  ← ✗ callejón sin salida
```

**Coach IA (Quirón)** — *se rompe en la puerta*
```
FAB → panel → showSetupIfNeeded() (quiron.js:184-190)
   sin API key → barra de entrada oculta, chips ocultos, tarjeta de setup
   → "ve a Ajustes → Quirón → proveedor, base URL, key, modelo, modelo de visión"
```
Detrás de esa puerta hay mucho producto: informes semanales, ingesta de entrenos por texto y por foto, propuestas de plan con tarjeta de confirmación y undo (`quiron.js:589-835`), sesiones sueltas que aterrizan en "Tus sesiones" (`nav.js:68-130`). Casi nadie va a llegar.

---

## 3. Hallazgos priorizados

| # | Hallazgo | Evidencia | Sev. | Esf. | Impacto |
|---|---|---|---|---|---|
| 1 | **Los 7 dominios no existen en la app.** Cero ocurrencias de radar/dominio/test en `js/` y `app.html`. El dashboard son 4 anillos genéricos + cita. El radar sólo vive en el prototipo y el blog. | `app.html:54-113`, `dashboard.js:115-218`, `dashboard-prototype.html` (6 refs a radar), `blog/8-dominios.html` | Crítica | 🔴 | El producto no comunica su tesis. Sin esto no hay razón para elegir Areté sobre Hevy+Strava |
| 2 | **Fork PWA ↔ Android.** GPS background resuelto sólo en Android; runner de fuerza y CSS nuevo sólo en la PWA. Cada mejora hay que portarla a mano. | `arete/js/ui/running-tracker.js` 662 L / 0 Capacitor vs `arete-android/www/js/ui/running-tracker.js` 763 L / 15 Capacitor; `training.js` 1071 vs 899; `app.css` 1062 vs 888 | Crítica | 🔴 | Duplica el coste de todo lo demás; es la causa raíz de que running sea caro |
| 3 | **Datos falsos sembrados a todo usuario nuevo.** | `app.js:112-125` (`seedInitialData`) | Crítica | 🟢 | Rompe la confianza en el minuto 1; envenena PRs, racha y el contexto de Quirón |
| 4 | **Escala tipográfica por debajo del mínimo legible.** 155 de ~290 declaraciones de `font-size` usan tokens < 12 px. | `app.css:1` (`--fs-base:.72rem`, `--fs-sm:.65rem`, `--fs-xs:.6rem`, `--fs-2xs:.55rem`) | Crítica | 🟡 | Es el contexto de uso completo: sudor, movimiento, móvil en el suelo |
| 5 | **Contraste fuera de AA en los dos colores secundarios.** `--text2` ≈2,8:1, `--text3` ≈2,0:1 sobre `--bg`. `--text3` se usa en etiquetas de serie, estados vacíos y unidades. | `app.css:1`, uso en `app.css:78` (`.set-label`), `:530` (`.empty-state`) | Crítica | 🟢 | Accesibilidad + legibilidad al sol |
| 6 | **`backupToDrive` no está importado en `app.js`.** El toggle de auto-sync lanza `ReferenceError`, capturado por el `catch` y mostrado como "Error: backupToDrive is not defined". | `app.js:389` llama; `app.js:14` no lo importa (sí lo hace `drive-ui.js:4`) | Alta | 🟢 | La activación de la copia de seguridad desde Ajustes está rota |
| 7 | **La sesión de fuerza no tiene final.** Tras la última serie el runner se cierra sin resumen ni guardado. | `set-runner.js:286-289`; `training.js:1049` (único disparador de guardado); P9 en `propuesta-ux-sesion-fuerza.md:250` | Alta | 🟡 | Es el momento de mayor recompensa del flujo y hoy está vacío |
| 8 | **Callejón sin salida si el GPS falla tras arrancar.** `onError` sólo hace toast; el overlay sigue abierto y la nav oculta. | `running.js:454-456`, `:694` (oculta nav), `:850` (única restauración) | Alta | 🟢 | El usuario tiene que matar la app |
| 9 | **La app admite que su tracker no es fiable, al usuario, en el momento de arrancar.** | `running.js:647`, `:641-643` (toast de gap GPS) | Alta | — | Estratégico: ver §5 |
| 10 | **Quirón exige API key propia.** | `quiron.js:184-190`, `app.html:264-297`, `llm.js:31` | Alta | 🔴 | El diferenciador construido queda inaccesible para el 99% |
| 11 | **Onboarding no captura nada** y `wizard.js` (141 L) está muerto pero precacheado. | `app.html:832-856`, `app.js:208-224`; `wizard.js` sin ningún import; `sw.js:157` | Alta | 🟡 | Objetivos, saludo y radar necesitan estos datos |
| 12 | **Barras de acento laterales** — infringe la restricción de diseño declarada del proyecto. | `app.css:481` (`.run-segment-card{…border-left:4px solid var(--accent)}`), `:844` (`.dash-act-card.has-pr`), `:845` (`.dash-act-card.dash-act-run`) | Alta | 🟢 | Coherencia del sistema visual |
| 13 | **Dos mecanismos contradictorios de "serie hecha"**: auto-marcado en `blur` y toggle en `click`, sin confirmación ni undo. Un roce con la mano sudada desmarca. | `training.js:1019-1035` vs `:1036-1046` | Alta | 🟡 | Pérdida silenciosa de datos durante el entreno |
| 14 | **Objetivos de fuerza hardcodeados** (50 t/semana, 4 sesiones) sin forma de cambiarlos. El de running sí es configurable. | `dashboard.js:131,138,157` vs `app.html:690-703` (`#runGoalModal`) | Media | 🟢 | Anillos que nunca se cierran = anillos que se ignoran |
| 15 | **Leaflet se carga de un CDN y no está en el precache.** En una PWA offline-first, el mapa de detalle y el mapa en vivo fallan sin red, sin mensaje. | `app.html:858` (unpkg); `sw.js` no contiene "leaflet" | Media | 🟡 | Rompe la promesa "funciona sin conexión" |
| 16 | **La carga anterior aparece hasta tres veces** en la misma tarjeta: `placeholder` + `value` prefilled + `.prev-data`. | `training.js:443-460` | Media | 🟢 | Ruido visual en la pantalla que más se mira |
| 17 | **Estados vacíos sin salida**: texto gris de 2:1 de contraste, sin CTA. La excepción bien hecha es "Tus sesiones". | `running-progress.js:18,46,68`, `running-history.js:23`, `running-plan.js:16,148,213`, `progress.js:58` vs `nav.js:76` (con botón) | Media | 🟢 | Momento de máxima intención perdida |
| 18 | **`console.log` de depuración en producción**, en cada render del dashboard. | `dashboard.js:144,146` | Baja | 🟢 | Higiene |
| 19 | **La lista de citas motivacionales (41) pesa más que la lógica del dashboard** y es tonalmente ajena a un producto de diagnóstico. | `dashboard.js:6-47` (42 líneas de 218) | Baja | 🟢 | Posicionamiento: "el hierro no miente" no es lenguaje de laboratorio |
| 20 | **Sub-navs de Fuerza y Running duplicadas** (Actividad/Historial/Progreso/Plan × 2), con dos rutas de render paralelas. | `nav.js:39-59`, `app.html:126-129` y `:430-433` | Media | 🔴 | Duplica el mantenimiento de cuatro pantallas |

---

## 4. Propuesta de mejora

### 4.1 Las dos primeras semanas — arreglar lo que sangra

Todo lo de esta lista es 🟢 o 🟡 y no requiere decidir nada estratégico.

**Día 1 — media jornada, seis arreglos**
1. Borrar `seedInitialData()` (`app.js:112-125`) y su llamada en `:129`. Un historial vacío con un buen estado vacío es infinitamente mejor que uno falso.
2. Añadir `backupToDrive` al import de `app.js:14`.
3. Borrar los dos `console.log` de `dashboard.js:144,146`.
4. Sustituir las tres `border-left` de acento (`app.css:481,844,845`) por recursos legítimos: chip de texto en la tarjeta (`PR`, `Carrera`), peso tipográfico y color del propio icono ya presente en `dash-act-name`. Ninguna banda en el borde.
5. En `running.js:454-456`, hacer que `onError` con `code 1` (permiso denegado) cierre el overlay, restaure la nav y ofrezca "Registrar manualmente" en su lugar.
6. Borrar `js/ui/wizard.js` o —mejor— usarlo (punto 9 de esta lista). Si se borra, quitar también `sw.js:157`.

**Días 2-4 — legibilidad y contraste**

La escala actual es coherente pero está calibrada un escalón y medio por debajo de lo que pide el contexto. Propuesta: subir el suelo sin tocar la relación entre pasos.

```
                    hoy        propuesto     dónde manda
--fs-2xs   .55rem  8.8px  →   .6875rem  11px   (usar sólo en badges)
--fs-xs    .60rem  9.6px  →   .75rem    12px
--fs-sm    .65rem 10.4px  →   .8125rem  13px
--fs-base  .72rem 11.5px  →   .875rem   14px   ← el más usado: 69 declaraciones
--fs-md    .82rem 13.1px  →   1rem      16px
--fs-lg    .90rem 14.4px  →   1.125rem  18px
--fs-xl   1.10rem 17.6px  →   1.375rem  22px
```
Como el 100% de los tamaños pasan por tokens, es un cambio en una línea (`app.css:1`) más una pasada de revisión de los sitios donde el layout es rígido: `.sets-grid` (`app.css:80`), `.dash-card`, `.run-live-metrics` y los chips de zona.

Contraste, en la misma línea de variables:
```
claro:  --text2  rgba(93,63,59,.55) → .78   (~2.8:1 → ~4.6:1)
        --text3  rgba(93,63,59,.40) → .62   (~2.0:1 → ~3.4:1, y prohibido para texto < 18px)
oscuro: --text2  rgba(231,189,183,.60) → .78
        --text3  rgba(231,189,183,.45) → .62
```
Regla que conviene escribir en el CSS como comentario: **`--text3` es para separadores e iconografía, nunca para texto que haya que leer**. Los sitios que hoy la usan para leer —`.set-label` (`app.css:78`), `.empty-state` (`:530`)— pasan a `--text2`.

**Días 5-8 — cerrar la sesión de fuerza**

El único hueco del flujo mejor construido de la app. `finish()` en `set-runner.js:286` deja de llamar a `close()` y pinta una tercera fase de la hoja:

```
┌─────────────────────────────────────┐
│                                     │
│              Sesión A               │  ← fs-lg
│           completada                │
│                                     │
│     18 / 18 series      52 min      │  ← fs-3xl, dos columnas
│                                     │
│   ●●●●●●●●●●●●●●●●●●                │  ← los mismos puntos del runner, todos llenos
│                                     │
│  ┌───────────────────────────────┐  │
│  │ RÉCORD                        │  │  ← chip, sin barra lateral
│  │ Sentadilla   100 kg → 105 kg  │  │
│  └───────────────────────────────┘  │
│                                     │
│  Volumen  4.850 kg  (+6% vs 07/28)  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      Guardar sesión         │    │  ← llama a saveWorkout(db)
│  └─────────────────────────────┘    │
│      Revisar antes de guardar       │  ← devuelve a la lista
└─────────────────────────────────────┘
```

La celebración de PRs ya existe (`training.js:947-956`, `#prCelebration`): aquí se integra en su sitio natural en vez de aparecer como un overlay suelto después de guardar. Coste estimado: ~100 líneas, sin migración de datos, la `.sets-grid` sigue siendo la fuente de verdad tal como exige el invariante de `set-runner.js:11-17`.

**Días 9-10 — un mecanismo de "serie hecha", no dos**

Eliminar el auto-marcado en `blur` (`training.js:1020-1035`). Que marcar sea siempre un acto explícito: el CTA del runner, o el tap en la etiqueta desde la lista. Y que desmarcar desde la lista pida confirmación implícita mediante un `undo` de 4 s en el toast, que ya existe como componente (`toast.js`).

### 4.2 El trimestre — poner la tesis dentro de la app

**A. El radar entra en el dashboard y la nav se reorganiza**

La navegación actual gasta dos de cinco ranuras en la misma acción y no tiene ninguna para lo que hace único al producto. Propuesta:

```
hoy:        Inicio · Fuerza · Running · Cuerpo · Más
propuesto:  Hoy · Entrenar · Perfil · Cuerpo · Más
                              ↑ radar de 7 dominios + tests + histórico de nivel
             ↑ una sola sección de entreno; la sesión de hoy manda,
               sea de fuerza o de carrera (el plan ya las mezcla)
```

`Entrenar` absorbe las dos sub-navs simétricas en una: Actividad · Historial · Progreso · Plan, con un filtro fuerza/carrera donde haga falta. El dashboard ya unifica ambos tipos de actividad (`dashboard.js:182-217`), así que el modelo mental ya está probado.

Pantalla `Hoy`:
```
┌─────────────────────────────────────┐
│  MARTES 4 AGO                       │
│                                     │
│  Sesión A · Fuerza                  │  ← lo que toca hoy, según el plan
│  Sentadilla · Banca · Peso muerto   │
│  ┌───────────────────────────────┐  │
│  │        Empezar sesión         │  │
│  └───────────────────────────────┘  │
│                                     │
│  ── Tu nivel ───────────────────    │
│                                     │
│        Fuerza máx                   │
│            ╱│╲                      │
│      Mov ─  ●  ─ Tracción           │  ← radar de 7 vértices
│          ╲ ╱ ╲ ╱                    │
│      Glicol   Res. fuerza           │
│                                     │
│  NIVEL 3 · limitado por MOVILIDAD   │  ← la regla del mínimo, dicha
│  Test de dorsiflexión: hace 94 días │
│  ┌───────────────────────────────┐  │
│  │      Retestear movilidad      │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

Esto no es una pantalla nueva: es la promesa que ya está escrita en `blog/8-dominios.html` y dibujada en `dashboard-prototype.html`. Lo que falta es el modelo de datos: `db.domains = { [id]: { level, tests: [{date, value, source}] } }`, una función de agregación (mínimo de ratios dentro del dominio, mínimo entre dominios para el nivel global — la decisión ya está tomada en `mejoras_arete.md`, punto #2), y un derivador que lea de lo que ya hay en `db`: los 1RM de Ajustes alimentan Fuerza máxima, las dominadas del historial alimentan Tracción, el mejor 5K de `runningLogs` alimenta Resistencia aeróbica, el 400m alimenta Capacidad glicolítica.

**B. Los tests como flujo de primera clase**

Cada dominio necesita un test con protocolo, y `test-day-prototype.html` (43 KB) ya lo tiene diseñado. La app necesita: pantalla de test guiada (protocolo → ejecución → resultado → nivel actualizado → "próximo retest sugerido: 8 semanas"), y un recordatorio cuando un test caduca. Esto es lo que convierte el radar de gráfico bonito en motor de decisión.

**C. Onboarding que sirva para algo**

Resucitar `wizard.js:18` (`createWizard`) para tres pasos que sí capturan:
```
1. ¿Cómo te llamas? · sexo · peso · altura        → saluda por tu nombre, calibra los ratios
2. ¿Qué persigues?  [ Híbrido · Fuerza · Ultra ]  → objetivos del dashboard, no 50 t inventadas
3. ¿Qué sabes ya de ti?
   1RM sentadilla ___  banca ___  PM ___  OHP ___   (todos opcionales)
   Mejor 5K ___
   → "Con esto ya podemos dibujar 3 de tus 7 dominios. Los otros 4 los mides cuando quieras."
```
El último paso es el que enseña la tesis en el momento en que el usuario tiene máxima atención, y deja el radar medio pintado — que es un motivador mucho más honesto que una cita de Jim Rohn.

**D. Quirón sin muro**

Tres opciones, de menor a mayor coste: (a) un proxy propio con cuota gratuita mensual y la opción de traer tu key para uso ilimitado; (b) mover la configuración al primer uso del panel con un flujo guiado en vez de mandar a Ajustes; (c) dejarlo como está y aceptar que es una feature para uno mismo. Si Quirón es parte de la propuesta de valor —y el volumen de código dice que sí— (a) es el único camino coherente.

**E. Leaflet al precache** (`sw.js`) o sustituirlo por un render estático de la ruta en SVG para las tarjetas de historial, reservando Leaflet sólo para el detalle interactivo. Lo segundo elimina una dependencia de CDN de la ruta crítica.

---

## 5. Decisión sobre running

### 5.1 Qué hay hoy, medido

| Superficie | Running | Total app | % |
|---|---|---|---|
| JS (líneas) | 3.679 | 13.460 | **27%** |
| `app.html` | ~322 (418-739) | 861 | **37%** |
| `app.css` (reglas `.run-*`) | 241 | 995 | **24%** |
| Tests | 818 (`gps`, `running-tracker`, `running-session`) | 2.657 | **31%** |
| Commits del repo que lo tocan | 44 | 218 | **20%** |

Desglose del JS: `running.js` 1943 · `running-tracker.js` 662 · `running-plan.js` 262 · `hr-monitor.js` 203 · `running-helpers.js` 155 · `run-store.js` 123 · `running-history.js` 121 · `running-progress.js` 120 · `running-calendar.js` 72 · `running-audio.js` 18. Más `share-editor.js` (1.166), compartido con el historial de fuerza.

### 5.2 La línea de corte: qué depende del GPS y qué no

**Depende del GPS (~1.860 L, la mitad del módulo):**
- `running-tracker.js` completo (662) — `watchPosition` (`:418`), filtros de precisión y salto, auto-pausa, splits, elevación, serialize/restore.
- En `running.js`: persistencia de carrera activa (`:19-90`), restauración tras interrupción (`:474-598`), ciclo de vida de la carrera (`:599-871`), UI en vivo y paneles por tipo (`:872-1262`), mapa en vivo (`:1265-1307`). ~980 líneas.
- `hr-monitor.js` (203, BLE en vivo) y `running-audio.js` (18, beeps de segmento).
- En HTML: `#runLiveScreen`, `#runUiLock`, `#runSummaryScreen` (`app.html:555-679`), ~125 líneas.
- Los 818 tests.

**No depende del GPS (~1.815 L):**
- `running-plan.js` (262) — programas estructurados, semanas, segmentos, próxima sesión.
- `running-helpers.js` (155) — **zonas de ritmo calculadas desde el 5K y zonas de FC desde la FC máx**. Esto es infraestructura del dominio aeróbico, no del tracker.
- `running-history.js`, `running-calendar.js`, `running-progress.js` (313) — historial, calendario, gráficos de km y ritmo.
- `run-store.js` (123) — IndexedDB para rutas pesadas.
- En `running.js`: entrada manual (`:1468-1580`), edición/borrado (`:1581-1640`), modal de detalle (`:1641-1713`), objetivo semanal (`:1714-1802`), récords personales (`:1804+`). ~960 líneas.

**La lectura importante**: los dos dominios que el sistema de Areté necesita de la carrera —resistencia aeróbica (5K) y capacidad glicolítica (400m)— **son dos números, no dos tracks**. Ninguno de los dos requiere una sola línea de `running-tracker.js`. Un 400m se mide con un cronómetro en una pista; un 5K se mide en una carrera popular o con el reloj que el atleta ya lleva puesto. El tracker GPS no es el dominio: es una forma —cara y frágil— de rellenar el dato.

### 5.3 Estado real de la fiabilidad

Esto merece precisión porque cambia la conclusión respecto a lo que se supondría de una PWA:

- **En Android, el GPS en background funciona.** El `BACKLOG.md` del wrapper lo marca resuelto: foreground service nativo (`AreteLocation`), buffer en `SharedPreferences`, resync al volver, validado con pantalla bloqueada. BUG-001 (crash al conceder permiso) y BUG-002 (auto-pausa) están cerrados. Ese trabajo está hecho y es bueno.
- **En la PWA no.** `arete/js/ui/running-tracker.js` no tiene ni una referencia a Capacitor: es `watchPosition` puro más un `Web Worker` de timer (`bg-worker.js`) y el keep-alive de audio. De ahí el toast de `running.js:647` — *"Mantén la pantalla encendida para GPS continuo"*, una app pidiéndole al usuario que compense un límite del navegador.
- **Y quedan bugs caros abiertos**: BUG-003 (P1) escribe **~800 MB a flash en una carrera de una hora** por reescritura completa del buffer en cada fix; BUG-004 (P1) pierde puntos en silencio al drenar; BUG-005 (P2) puede dejar un wake lock de hasta 6 h corriendo sin nadie escuchando. El Sprint 1 del backlog Android son 3-4 días dedicados sólo a esto.
- **Y el fork.** Mientras el tracker vive en dos repos, cada mejora de fuerza hay que portarla a Android (hoy `training.js` va 172 líneas por detrás y `app.css` 174) y cada mejora de GPS hay que portarla a la PWA (101 líneas por detrás). Ese es el coste que no aparece en ninguna estimación.

### 5.4 Las cuatro opciones

**Opción A — mantener tal cual.**
*Coste*: 3-4 días de Sprint 1 para cerrar BUG-003/004/005, más el fork indefinidamente, más el 27% del JS y el 31% de los tests compitiendo por atención con un radar de dominios que no existe. *Beneficio*: cero trabajo ahora; el atleta-fundador conserva su herramienta. *Problema*: es la opción que ya se ha tomado por defecto durante 44 commits, y el resultado es que el diferenciador del producto sigue sin construirse.

**Opción B — recortar a lo que no depende del GPS.**
*Ahorro*: ~1.860 líneas de JS, 125 de HTML, ~100 de CSS, 818 tests, y —lo más valioso— la eliminación completa de la causa del fork. *Coste*: se pierde el tracking en vivo, incluidas las sesiones guiadas por intervalos que hoy funcionan bien (`running.js:988-1262`). Un atleta que corre con el móvil y sin reloj se queda sin app. *Riesgo*: es tirar trabajo nativo que ya funciona en Android.

**Opción C — delegar el tracking e importar.**
Strava/Garmin/Health Connect trackean; Areté importa GPX/FIT o lee Health Connect y se queda con lo que le interesa: distancia, tiempo, ritmo, FC, splits. Todo el aparato de plan, calendario, historial, progreso, PRs y zonas sigue igual, porque **ya funciona sobre `db.runningLogs`, no sobre el tracker**. *Ahorro*: el mismo que B. *Coste*: construir el importador (FEAT-006 Fase 2 del backlog ya lo contempla, y explícitamente dice que **no depende de SQLite** y se puede adelantar). *Beneficio adicional*: exportar/importar en formatos estándar refuerza la posición "tus datos son tuyos", que es coherente con una app sin cuenta y sin anuncios.

**Opción D — eliminar running del todo.**
*Ahorro*: 3.679 líneas, 37% del HTML, una pestaña de la nav. *Coste*: se rompen dos de los siete dominios. La resistencia aeróbica y la capacidad glicolítica dejarían de tener dónde vivir, y con la regla "nivel = mínimo" eso no degrada el modelo: lo invalida. Un atleta híbrido sin carrera no es un atleta híbrido. **Descartada.**

### 5.5 Recomendación

> **Opción C. Areté deja de ser un tracker de carreras y pasa a ser el sistema que interpreta tus carreras. El tracker GPS sale de la PWA y sobrevive únicamente como capacidad de la app Android, detrás de detección de plataforma.**

En concreto:

1. **El dominio se queda entero, el tracker no.** Resistencia aeróbica y capacidad glicolítica pasan a ser dos tests con su protocolo, igual que el AKE o el weight-bearing lunge: *5K a tope* y *400m a tope*. Se registran como resultado, no como track. Con esto los 7 dominios quedan intactos y —por primera vez— running deja de ser una isla y se conecta a la tesis.

2. **Todo lo que no depende del GPS se conserva sin tocar**: plan de running, calendario, historial, progreso, PRs, objetivo semanal, zonas de ritmo y de FC. Son ~1.815 líneas que funcionan y que dan valor. Nada de esto se borra.

3. **La entrada de datos pasa a ser: importar > manual > GPS.** El botón principal de la pestaña deja de ser "Iniciar carrera" y pasa a ser "Añadir carrera", con importación de GPX/FIT y —en Android— Health Connect. La entrada manual ya existe y está completa (`app.html:642-711`: distancia, duración, splits, FC, desnivel, cadencia, notas).

4. **En la PWA, el tracker se retira.** Se borran `running-tracker.js`, la mitad en vivo de `running.js`, `#runLiveScreen`/`#runUiLock`/`#runSummaryScreen`, `hr-monitor.js`, `running-audio.js` y sus 818 tests. La PWA deja de prometer algo que el navegador no le deja cumplir, y desaparece el toast de `running.js:647` que hoy es la confesión de esa promesa rota.

5. **En Android se conserva, pero como *feature de plataforma*, no como núcleo.** El foreground service ya está hecho y validado; sería absurdo tirarlo. Pero baja de categoría: no bloquea releases de la PWA, no exige paridad, y BUG-003/004/005 dejan de ser P1 para ser "cuando toque". Si en seis meses el uso real no lo justifica, se retira también y no se habrá perdido nada.

6. **El fork se cierra en la dirección correcta.** Con el tracker fuera del código compartido, `www/` de Android puede volver a ser un espejo de la PWA más un puñado de ficheros nativos, en vez de un fork con lógica propia en `running-tracker.js`.

**Lo que se gana, cuantificado**: −1.860 líneas de JS (−14% del código de la app), −818 tests (−31% de la suite), −125 líneas de HTML, tres bugs P1/P2 que dejan de existir, 3-4 días del Sprint 1 de Android liberados, y el fin de la duplicación entre repos. Con ese presupuesto se construye el radar de dominios y el flujo de tests, que es lo que hace que el producto tenga una razón de existir.

**Lo que se pierde, sin adornos**: las sesiones guiadas por intervalos con audio en vivo, que están bien hechas y no tienen equivalente inmediato en Strava; el mapa en directo; la conexión BLE al pulsómetro; y la comodidad de salir a correr sólo con el móvil. Para el usuario que es el propio fundador, es una pérdida real. La pregunta honesta que hay que hacerse es si Areté es la app de su fundador o un producto — y si es lo segundo, competir en tracking GPS contra Strava y Garmin con una PWA es la peor batalla posible, mientras que **ser el único sitio donde tus siete dominios se cruzan y te dicen cuál te está limitando no lo compite nadie**.

**Señal de que la decisión fue equivocada** (y hay que revertir): si a los tres meses más del 40% de las carreras registradas siguen entrando por "Registro manual" en vez de por importación, significa que los usuarios no tienen reloj y el tracker sí era necesario. Es medible con lo que ya se guarda en cada `runningLog`.

---

## 6. Riesgos y qué NO tocar

**Lo que ya está bien y sería un error rediseñar:**

- **`set-runner.js` entero.** Es lo mejor del repo. La decisión de que el runner sea una capa de presentación sobre la `.sets-grid` —y el comentario de `:11-17` que explica exactamente por qué (el borrador guarda por índice posicional, el guardado busca en `document`)— es el tipo de restricción bien entendida que no se debe reabrir. El descanso que se recuerda por familia de ejercicio (`:340-354`) y el temporizador contra instante absoluto en vez de acumular ticks (`:246-249`) están resueltos con criterio.
- **El overview previo a la sesión** (`training.js:190-244`), con la antigüedad del borrador en lenguaje natural. Da el "¿qué toca hoy?" antes de enterrar al usuario en inputs.
- **La arquitectura de datos.** `data.js` con migraciones versionadas, `run-store.js` moviendo las rutas pesadas a IndexedDB, `merge.js` con su test de merge, el detector de cambios en otra pestaña (`app.js:257-260`). Es más sólido de lo que suele verse en un proyecto de este tamaño.
- **Las sesiones sueltas y las propuestas de Quirón con confirmación y undo** (`sessions.js`, `quiron.js:589-835`, `nav.js:68-130`). El patrón "el modelo propone, el usuario confirma, siempre hay undo" es exactamente el correcto para IA que escribe en los datos del usuario. No lo automatices.
- **La guarda de borrador vivo al cambiar de programa** (`app.js:324-327`): no repoblar sesiones si hay un runner abierto o un borrador. Alguien pensó en el caso real de pedirle algo a Quirón en mitad del entreno.
- **El focus trap global por `MutationObserver`** (`app.js:478-494`). Resuelve la accesibilidad de todos los modales de una vez, sin acoplar nada.
- **Los aria-labels de los inputs de serie** (`training.js:319`, "Peso serie 1 de Sentadilla"). Ya está bien hecho; el problema de accesibilidad de esta app es el contraste y el tamaño, no el etiquetado.

**Riesgos de la propuesta:**

1. **Cambiar la escala tipográfica romperá layouts.** `.sets-grid`, `.dash-bento` y `.run-live-metrics` están calibrados para texto pequeño. Es una tarde de revisión visual, no un cambio de una línea, aunque el token sea uno solo.
2. **Reorganizar la nav invalida `areteLastTab`/`areteLastStrTab`** en `localStorage` (`nav.js:34,54,238-248`). Necesita migración o un fallback silencioso, o los usuarios existentes abrirán la app en una pestaña que ya no existe.
3. **El radar puede quedarse en gráfico decorativo.** Un radar sin tests programados ni acción sugerida es lo mismo que los cuatro anillos de hoy, pero con más aristas. Si no entra con el flujo de retests, mejor no meterlo.
4. **Retirar el tracker de la PWA es irreversible en la práctica** (el código se puede recuperar de git, la confianza del usuario que ya lo usaba no). Conviene anunciarlo con antelación y con la importación ya funcionando, nunca al revés.
5. **`mejoras_arete.md` tiene deuda de credibilidad abierta** (#5, #6, #7: cobertura de bisagra/remo, test alternativo sin kettlebell, tabla de niveles femenina). Construir el radar antes de cerrar #7 significa dibujarle a las usuarias un perfil calibrado para un hombre de 75 kg. Como mínimo, declararlo dentro de la propia app, no sólo en el blog.

---

*Auditoría realizada leyendo el código, no la documentación. Cuando este informe y un documento anterior discrepan, gana el código.*
