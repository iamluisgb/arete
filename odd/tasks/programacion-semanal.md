# Feature: programacion-semanal (Programación semanal de entrenamientos)

**Estado**: en curso · **Rama**: `feat/programacion-semanal`

## Objetivo

Los planes de arete (fuerza y carrera) dicen *qué* entrenar pero no *cuándo*.
Esta feature añade programación con flexibilidad: sesiones pendientes en cola +
días ancla por semana, de modo que si un día se cae, todo se re-acomoda.

## Decisiones de diseño

- **D1 — Modelo**: cola de sesiones pendientes + días ancla semanales, por plan.
  La n-ésima sesión pendiente cae en el n-ésimo día ancla a partir de hoy.
  Saltar un día desplaza todo hacia el siguiente ancla; adelantar una sesión
  hace retrocedir el resto. Sin días fijos por sesión.
- **D2 — Dos planes**: fuerza (sesiones de la fase activa del programa en orden
  declarado) y carrera (sesiones de la semana activa del programa de running).
  Cada plan con sus propios anclas; si coincide día, el dashboard lo muestra.
- **D3 — Configuración**: `db.settings.schedule = { arete: { anchors: [...] },
  running: { anchors: [...] } }` (1=Lun … 7=Dom), con defaults sensatos.
  Vive dentro de `db.settings` → viaja con el sync existente sin cambios.
- **D4 — Superficies**: (a) tarjeta "Hoy" en el dashboard con la sesión de hoy
  y pendientes acumuladas; (b) días futuros pintados en el calendario existente
  (horizonte ~4 semanas); (c) Quirón recibe la programación en su snapshot.
- **D5 — Fuera de alcance (fase 2)**: exportación ICS/webcal; notificaciones
  push; re-programación automática por carga (HRV, fatiga).
- **D6 — Módulo puro**: `js/schedule.js` con la lógica (anclas, cola, cálculo
  por fecha) + tests unitarios en `tests/schedule.test.js`. La UI solo consume.
- **D7 — Detección de "hecho"**: mapear sobre los datos existentes (workouts /
  runningLogs con fecha y sesión); el worker explora la forma exacta y la
  documenta en el módulo.

## Tareas

1. [x] Scheduler puro `js/schedule.js` + `tests/schedule.test.js`
2. [x] Config de anclas en Ajustes + persistencia (`db.settings.schedule`)
3. [x] UI: tarjeta "Hoy" (dashboard) + días futuros en calendario
4. [x] Quirón: bloque de programación en `buildSnapshot`

## Criterios de aceptación

- Saltar el día de una sesión no la pierde: reaparece en el siguiente ancla.
- Marcar una sesión como hecha recalcula la cola (todo se desplaza).
- Fuerza y carrera se programan por separado y son visibles ambas.
- Quirón responde correctamente a "¿qué toca hoy/mañana?" vía snapshot.
- Suite completa en verde.

## Ronda 2 — Fixes de UX (post auditoría)

Auditoría experta read-only identificó 5 fricciones. Fixes autorizados:

- **F1 (crítico)**: "Empezar" en la tarjeta "Toca hoy" preselecciona exactamente
  la sesión anunciada, vía requestStartSession (training.js) en vez de la
  rotación implícita.
- **F2**: línea de contexto del plan activo bajo la tarjeta ("Areté · Fase II —
  5K · Sem 3") + aviso de consecuencia en los modales de cambio de
  programa/fase/semana (reset silencioso → mensaje inline).
- **F3**: hint descartable cuando se usan defaults sin configurar (flag en
  localStorage) + mini-preview en setSchedule ("Próxima: <sesión> — <día>").
- **F4**: calendario marca los anclas pasados perdidos (día con sesión que
  reaparece hoy) + chips por plan con icono en días multi-sesión + hint de
  asignación para runs GPS sin sesión que dejan la cola en fantasma.
- **F5**: vocabulario consolidado: "Plan" (qué sigues) vs "Programación semanal"
  (cuándo). Renombres de copy: "Seleccionar Programa" → "Elegir plan de
  fuerza", "Programa de Running" → "Elegir plan de carrera", customs → "Tus
  planes". Sin cambios de IA estructurales.

Fuera de alcance ronda 2: rediseño de tarjeta única "Hoy" (north-star, deja los
CTAs genéricos como están), eliminación de caminos duplicados de semana.

## Evidencia de commits (ronda 2)

- `df4a28e` feat(schedule): usesDefaultAnchors + scheduleMissed (+7 tests)
- `61c186f` feat(ui): honest start buttons + plan context + hints (+7 tests)
- `bba07ff` feat(ui): missed anchors + per-plan chips en calendario
- `ea4e620` feat(settings): preview en vivo de anclas
- `9f90e2f` feat(ui): avisos de consecuencia + vocabulario Plan/Programación
- `e5b749e` chore(sw): cache v152

Verificación independiente: PASS 7/7, 790/790 tests (50 archivos). Nota:
js/app.js no requirió cambios (requestStartSession ya era export de training.js).

## Review nativa (ronda 2)

- Primer lineage `review-1592515a9f6e2c71`: reviewer relability detectó hallazgo
  CRÍTICO determinista (registrado como R3-001): `hintDefaults` llamaba a
  `localStorage.getItem` sin guarda → ReferenceError en WebView restringidos →
  dashboard en blanco. Escalada `native_stop_required` (causalidad desconocida),
  lineage terminado.
- Fix: guarda try/catch en lectura (dashboard.js:254) y escritura del dismiss
  (:358), patrón ya existente del starter flag; test de regresión con stub de
  localStorage lanzador. Commit `371ebc4`. Suite: 791/791.
- Segundo lineage `review-88454b66b33666ad` (mismo candidato + fix): APPROVED
  con 6 hallazgos informativos NO bloqueantes (trabajo futuro):
  R3-001→downgraded (WARNING, dashboard.js:355-366), R3-002 settings.js:124-128,
  R3-003 dashboard.js:355-371, R3-004 calendar.js:73-81, R3-005
  calendar.js:150-171 (WARNING), R3-006 schedule.js:203-215 (SUGGESTION).
  `acknowledge-approved` ejecutado, autoridad quemada.

## Ronda 3 — Tarjeta "Hoy" unificada (norte de la auditoría)

Lo que queda de la auditoría tras las rondas 1–2. Todo es capa UI/IA, sin
retoques al scheduler.

- **N1 (norte)**: una sola tarjeta "Hoy" en el dashboard que responde en orden
  de prioridad: sesiones de hoy → atrasadas → día de descanso → sin
  configurar/apagado. Filas agrupadas por plan con cabecera de plan. Los CTAs
  genéricos Fuerza/Running desaparecen del dashboard y quedan degradados a un
  enlace de pie dentro de la tarjeta.
- **N2**: el pie de la tarjeta lleva CTAs etiquetados con contexto ("Fuerza ·
  Areté Fase II" / "Carrera · Semana 3") que llevan a Entrenar en el modo
  correcto.
- **N3**: la línea de atrasadas enlaza al calendario (los días perdidos ya se
  marcan desde F4), en vez de solo texto "se re-acomodan solas".
- **N4**: la cola de sesiones pendientes se hace visible en el Plan tab de
  Entrenar ("Cola: A → B → C") para ambos planes, dando hogar visible al
  acoplamiento fase/semana ↔ programación.
- **N5**: se elimina el camino duplicado de selección de semana (el <select> del
  Plan tab); queda el chip+modal como único camino.
- **N6**: la tarjeta "Hoy" explica el modelo en una línea en sitio ("si se te
  cae un día, la sesión pasa al siguiente día que entrenas") con enlace a
  Ajustes, en los estados descanso/todo hecho.

Estados explícitos exigidos por el norte: sesión(es) de hoy (con botones que
arrancan lo anunciado, heredado de F1), atrasadas acumuladas, descanso con
fecha de la próxima sesión, todo completado, y feature apagada (vacío
existente).

Fuera de alcance ronda 3: cambios de datos, push/ICS, flujo nuevo de asignación
para runs GPS.

## Evidencia de commits (ronda 3)

- `987a497` feat(ui): tarjeta Hoy unificada (N1, N2, N3, N6) (+10 tests)
- `6bdf5af` feat(ui): cola visible en Plan tab de fuerza (N4)
- `3ca31d0` refactor(ui): camino único de semana en running (N5) + cola running
- `d91ac18` chore(ui): fuera CTAs muertos, sw v153

Post-worker del padre: eliminados listeners muertos de app.js; N3 apuntando al
calendario real (#calFold, switchStrTab strHistory). Limpieza: comentario
obsoleto y saveDB sin uso en running-plan.js.

Verificación independiente: PASS 8/8, 801/801 tests. Nota: ui-polish.test.js
flake preexistente bajo paralelismo (verde aislado y en 2/2 corridas completas).

## Evidencia de commits

- `03c16c1` feat(schedule): add pure weekly scheduler with anchor days
- `560d964` feat(ui): schedule surfaces in settings, dashboard and calendar
- `e869835` feat(quiron): include schedule block in agent snapshot
- `9b2a9f1` chore(sw): bump cache to v151 (precache schedule module)

## Evidencia de verificación

- Worker (gentle-ai-worker): 776/776 tests (50 archivos), 28 nuevos del scheduler.
- Verificador independiente (gentle-ai-verify): PASS 6/6 — suite verde, diff
  dentro de superficies autorizadas, semántica D1 confirmada con tests,
  regresiones de calendario/dashboard/snapshot cubiertas, wiring de Ajustes OK.
- Observaciones menores no bloqueantes: riesgo de renombrar sesión implícito
  (documentado en header de schedule.js como match por nombre) y motivo del
  import dinámico en dashboard no explicitado en comentario.
- Review nativa: lineage `review-90b2671bb7c8dda1`, tier medium, lente
  `review-reliability` → **APPROVED** (authority burned). 5 hallazgos
  informativos no bloqueantes como trabajo futuro: filtro por prefijo en
  calendario para running (calendar.js:61-71), render no atómico de la tarjeta
  de schedule (dashboard.js:242-247), posible doble conteo en ventana de
  atrasadas (schedule.js:185-203), default de ref en scheduleDay
  (schedule.js:180-182), slice UTC en snapshot (context.js:45-57).
Review 1 (review-6964733523194246) escaló con R3-001/R3-002 (causalidad
desconocida). R3-001: invariante forward-only de scheduleAll era implícito →
filtro explícito en estadoDescanso + test que lo fija. R3-002: handler N3 sin
try/catch → try/catch + test de la ruta de fallo. Hardening: `+2 tests` (803).

## Evidencia de review (ronda 3)

- `review-6964733523194246`: escalada por R3-001/R3-002 (causalidad desconocida,
  terminal). Resuelta con hardening `f4d7093` + 2 tests de regresión.
- `review-6ef2bb6994dd9527`: **APROBADA**, autoridad quemada. 4 hallazgos
  informativos no bloqueantes (follow-ups):
  - R3-001 WARNING js/ui/dashboard.js:417-421
  - R3-002 WARNING js/ui/dashboard.js:459-467
  - R3-003 SUGGESTION js/ui/running.js:2070-2078
  - R3-004 SUGGESTION js/ui/training.js:1141-1143
