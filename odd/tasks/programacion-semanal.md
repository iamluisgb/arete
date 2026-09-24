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
