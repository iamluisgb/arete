# Feature: planificacion (Metas, bloques y plan que se adapta)

**Estado**: fase 1 hecha (2-nov) · siguiente: fase 2

## Objetivo

Areté registra muy bien lo que pasó y sabe qué toca esta semana (`programacion-semanal.md`),
pero no sabe **hacia dónde va** el atleta ni **cómo está hoy**. Faltan tres cosas:

1. **Metas a medio y largo plazo** con fecha.
2. **Un plan en el tiempo**: bloques con duración, semanas de descarga y semanas de test.
3. **Un plan que se adapta** a lo que el atleta le cuenta a Quirón (lesiones, agujetas,
   sueño, estrés, viajes) y a lo que dicen sus datos, como lo haría el preparador de un
   deportista de élite.

La meta del producto: que el atleta deje de decidir solo cuándo cambiar de fase, cuándo
descargar o qué hacer con una rodilla que molesta.

## Lo que ya hay y se reutiliza

- `js/schedule.js`: cola de sesiones y días ancla. Horizonte de 35 días. Es el nivel micro y
  no cambia.
- `js/progression.js`: la carga de hoy la calcula la app, no el modelo. Ya descarga un 10 %
  tras 3 sesiones atascadas (`DELOAD_AFTER`).
- `js/ai/metrics.js` → `loadRatio`: carga aguda/crónica (7 contra 28 días).
- `js/quiron-memory.js`: memorias con las categorías `dolor` y `objetivo`. Hoy son texto que
  solo lee el modelo; no mueven nada.
- `js/domains.js`: niveles por dominio y caducidad de los tests (6 y 10 semanas).
- `soul.js` ya dice "no cargues sobre el dolor" y "pregunta el RPE", pero es una instrucción
  al modelo, no una regla de la app.

## Decisiones de diseño

- **D1 — Las reglas las pone la app, el modelo propone.** Es el mismo principio que
  `get_next_prescription`. Quirón **traduce** lo que cuenta el atleta a un estado
  estructurado y **explica** los cambios. La app **calcula** el ajuste con reglas puras y
  testeadas. Un preparador de élite no improvisa la carga cada vez; aplica un criterio
  estable y lo justifica.
- **D2 — Metas atadas a los dominios.** Una meta es una de estas tres cosas:
  - **Nivel de dominio**: "Resistencia de II a III antes del 01-03".
  - **Métrica concreta** de las que ya calcula `domains.js`: "sentadilla 1,5× peso
    corporal", "5K por debajo de 22:00".
  - **Evento**: "media maratón el 15-03", "test de dominios el 20-12".

  Cada meta tiene fecha y prioridad (A, B o C, como en el calendario de un atleta: solo
  puede haber una A a la vez). El dominio más bajo sigue mandando: si la meta A no
  trabaja el dominio limitante, Plan lo dice.
- **D3 — Bloques con duración, fechas proyectadas.** Las fases de un programa ganan
  `weeks` (opcional; sin él, 4). El plan es una secuencia de bloques:
  `entrenamiento | descarga | test | taper | libre`. **Una semana se cierra cuando se
  completan sus sesiones, no cuando pasa el calendario.** Si pierdes una semana, todo se
  corre y las fechas de fin se recalculan. Es la cola de `schedule.js` llevada al nivel
  macro. Hacia atrás, el plan se construye desde la meta A: el taper y el test caen
  antes del evento, y el resto se reparte hacia atrás.
- **D4 — Descargas por defecto y por señal.**
  - **Por defecto**: 1 semana de descarga cada 3–5 de carga, configurable.
  - **Por señal**, en este orden (ver D10): un check-in malo sostenido o RPE de sesión
    alta en sesiones que deberían ser fáciles (ver D5), atascos de `progression.js` en dos
    o más básicos a la vez, y por último el `loadRatio` por encima de 1,3 dos semanas
    seguidas, que solo propone si las dos primeras no dicen lo contrario.

  Una semana de descarga mantiene las sesiones con el 60 % de las series y −10 % de carga, y
  la aplica `progression.js`, no un plan aparte.
- **D5 — Estado del atleta (`db.athleteState`).** Es una lista de entradas con fecha que
  viaja con el sync:
  - `molestia`: `{ zona, lado, intensidad 0-10, tipo: agujeta|molestia|dolor|lesion,
    desde, hasta?, nota }`. La zona sale de una lista cerrada (hombro, codo, muñeca,
    lumbar, cadera, rodilla, tobillo, isquio, gemelo…) que encaja con la ontología de
    ejercicios.
  - `checkin`: `{ recuperación 1-5, sueño 1-5, energía 1-5, estrés 1-5 }`. Se pregunta en
    una tarjeta de 3 toques antes de entrenar (encendida por defecto, se puede apagar) o
    lo saca Quirón de la conversación. «Recuperación» va primera: es la pregunta que más
    pesa (D10).
  - La **RPE de sesión** (1-10) no va en el estado sino en el entreno: `w.rpe` y
    `log.rpe`, un toque al terminar la sesión o al registrar/importar una carrera.
    Opcional: sin ella todo sigue funcionando como hoy.
  - `disponibilidad`: `{ desde, hasta, motivo: viaje|trabajo|enfermedad, material? }`.

  Quirón escribe aquí con una tool nueva, `report_state`. La memoria `dolor` se queda para
  lo narrativo; el estado es lo que computa.
- **D6 — Motor de ajuste (`js/adapt.js`, módulo puro).** Recibe el plan, el estado,
  el historial y las métricas y devuelve una lista de **ajustes con su porqué**, sin
  escribir nada. Reglas iniciales:

  | Señal | Ajuste |
  |---|---|
  | Agujetas ≤ 5 | Nada; si ≥ 6 en el grupo de hoy, −1 serie en ese grupo |
  | Molestia (≤ 4) en una zona | Sustituir los ejercicios que cargan esa zona por variantes del catálogo (`find_exercises` con `evita`); mantener el resto |
  | Dolor (≥ 5) o lesión | Fuera los ejercicios de la zona hasta el alta; no cuentan como "fallados" para `progression.js`; aviso de ir al fisio si dura > 10 días |
  | Vuelta de lesión | Reentrada al 60–70 % del último peso, +10 % por sesión limpia |
  | Check-in malo (recuperación, sueño o energía ≤ 2) | La sesión de hoy pasa a ser la versión ligera (−30 % de volumen, sin intentos de récord) |
  | Recuperación ≤ 2 tres días en una semana, o RPE ≥ 7 en sesiones fáciles dos veces seguidas | Proponer adelantar la descarga |
  | Tres días duros seguidos (RPE ≥ 7, en cualquier carril) o una semana sin ningún día fácil (RPE ≤ 4) | Avisar en «Hoy» y a Quirón; no mover nada |
  | `loadRatio` > 1,3 sostenido, sin check-in ni RPE que lo contradigan | Adelantar la descarga |
  | `loadRatio` < 0,8 dos semanas (no por descarga) | Avisar de pérdida de forma; reprogramar fechas |
  | Disponibilidad (viaje) | Sesiones de esos días a la versión con el material disponible o a la cola |
  | Meta A en peligro (proyección pasa de la fecha) | Proponer: alargar, recortar un bloque B o mover la meta |

  Los umbrales viven en una constante, como `DELOAD_AFTER`, y cada regla tiene su test.
- **D7 — Avisar, nunca bloquear; el atleta confirma.** Los ajustes que tocan solo la sesión
  de hoy (sustituir un ejercicio, quitar una serie) se aplican y se pueden deshacer con un
  toast. Los que mueven el plan (adelantar una descarga, alargar un bloque, mover una meta)
  llegan como **propuesta con diff** que el atleta acepta o rechaza, igual que
  `propose_program`. Todo ajuste queda anotado en el plan con su porqué y su origen
  (regla, conversación, check-in).
- **D8 — Superficies.**
  - **Pestaña «Plan»** (es un sitio, cumple "pestañas solo para sitios"): metas arriba;
    línea de tiempo de bloques con la semana actual marcada; estado activo (molestias
    abiertas, disponibilidad); historial de ajustes. Absorbe la hoja «Plan y fase»: no
    puede haber dos sitios donde se cambia la fase.
  - **«Hoy»**: una línea de contexto ("Semana 4 de 6 · Fuerza · descarga en 2") y, si la
    hay, la tarjeta del ajuste de hoy con su porqué.
  - **Quirón**: el snapshot recibe el plan, las metas, el estado y los ajustes pendientes.
    Tools nuevas: `report_state`, `get_plan`, `propose_plan_change`.
- **D9 — Fuera de alcance.** HRV y wearables (la interfaz de `checkin` los admitirá
  después); diagnóstico médico (el motor no diagnostica: sustituye, reduce y deriva al
  fisio); planes de varios atletas.
- **D10 — Lo que siente el atleta manda; el ratio de carga acompaña** (8-nov). Las medidas
  subjetivas (recuperación percibida, fatiga, RPE de sesión) siguen la respuesta al
  entrenamiento mejor que las objetivas (Saw et al., 2016, revisión sistemática,
  [doi:10.1136/bjsports-2015-094758](https://doi.org/10.1136/bjsports-2015-094758)), y las
  métricas de carga tipo ACWR/TRIMP/CTL-ATL no están validadas como predictores
  (Impellizzeri et al., 2020, [doi:10.1123/ijspp.2019-0864](https://doi.org/10.1123/ijspp.2019-0864);
  Passfield et al., 2022, [doi:10.1123/ijspp.2021-0536](https://doi.org/10.1123/ijspp.2021-0536)). Idea sacada de *La naturaleza del
  entrenamiento* (Sola Arjona, 2022), que no se cita como fuente: se citan los estudios.
  - **Regla «take the best»** (Gigerenzer): las señales se miran en orden —check-in y RPE,
    luego atascos de progresión, luego `loadRatio`— y la primera que decide, decide. No se
    promedian: un `loadRatio` bueno no compensa un «estoy reventado».
  - **Polarizar por días, no por zonas.** La mayoría de días fáciles de verdad y pocos
    duros, contados por RPE de sesión y en los dos carriles a la vez. Complementa a
    `interference.js`, que clasifica por contenido.
  - Sin check-in ni RPE, el motor funciona como hasta ahora con el `loadRatio`: no se
    exige nada al atleta para que la app siga sirviendo.

## Fases

1. ✅ **Bloques en el tiempo.** `weeks` en las fases; modelo de plan con bloques y semanas
   que se cierran por sesiones; descarga por defecto; línea de contexto en «Hoy».
   Módulo puro `js/plan.js` + `tests/plan.test.js`. Hecho, con estas decisiones:
   - El bloque y su posición se derivan del historial (racha de la fase, parón > 21 días
     reinicia). Nada guardado salvo `deload: true` en el entreno.
   - Descarga detrás de las fases de ≥ 4 semanas, o la que diga `deload` en el JSON;
     interruptor en Ajustes → Programación semanal.
   - Al acabar el ciclo se empieza otro de la misma fase y «Hoy» avisa de la siguiente.
   - La cola de fuerza de `schedule.js` pasa a ser semanal dentro del bloque: la de antes se
     vaciaba tras una pasada por las sesiones de la fase.
   - Quirón recibe el bloque en el snapshot y la descarga en `get_next_prescription`.
   - Semanas: Areté 6·6·4·4; Kettlebell 2·2·2·4 (las del libro); el resto, 4.
2. **Pestaña Plan + metas.** *Adelantado (2-nov): el mapa del plan —todas las fases en una
   línea de tiempo vertical con semanas, descargas y fechas proyectadas— vive arriba de
   Entrenar → Plan (`js/ui/plan-map.js`). Falta: metas, construcción hacia atrás y sitio propio.*
   Metas atadas a dominios y eventos; construcción hacia atrás
   desde la meta A; línea de tiempo; absorbe «Plan y fase»; componente en `patterns.html`.
3. **Estado del atleta.** `db.athleteState` + sync; tool `report_state`; tarjeta de
   check-in opcional; zonas cruzadas con la ontología de ejercicios.
4. **Motor de ajuste.** `js/adapt.js` con las reglas de D6 y sus tests; ajustes de sesión
   aplicados con deshacer; integración con `progression.js` (descarga, reentrada, series
   que no cuentan como falladas).
5. **Ajustes de plan por Quirón.** `propose_plan_change` con diff; meta en peligro;
   historial de ajustes; evals de Quirón (`docs/EVALS.md`) con conversaciones de
   lesión, agujetas, viaje y semana mala.

## Plan híbrido: fuerza y carrera en un mismo plan

Decidido el 2-nov. **Un plan con dos carriles, no un programa mezclado.** La fuerza vive en
`workouts` y la carrera en `runningLogs` (importada de GPX/TCX, con zonas, marcas y perfil
encima); una sesión que mezclara las dos rompería todo eso por poco a cambio.

- **H1 — `db.plan`** por encima de los dos programas: nombre, programa de fuerza, programa de
  carrera, inicio y (fase 2) meta. Los programas siguen siendo lo que son.
- **H2 — Un calendario de bloques para los dos**: las semanas avanzan juntas y **la descarga cae
  la misma semana en los dos carriles**.
- **H3 — Semana tipo con interferencia**: cada carril con sus días (los anclas de hoy); la app
  avisa —no bloquea— de pierna pesada y series o tirada larga en días seguidos.
- **H4 — Mapa de dos carriles**: fuerza y carrera en paralelo, descargas compartidas a lo ancho.
- **H5 — Creación con Quirón** («la media de marzo sin perder fuerza, 5 días» → los dos
  programas y la semana tipo, con diff) y un editor sencillo para elegir programas y días.

Pasos:
1. ✅ **Las semanas de running avanzan solas** (2-nov). `advanceRunWeek` en `schedule.js`:
   al vaciarse la cola de la semana con al menos una carrera registrada en ella, pasa a la
   siguiente, con toast de deshacer. La cola de running filtra por `log.week` (un «Rodaje»
   de la semana 1 ya no tacha el de la 2). El registro manual tiene «Sesión del plan» (propone
   la siguiente pendiente), y editar una importada permite asignarle la suya. De paso: editar
   una carrera duplicaba en vez de editar, y reescribía una importada como manual pisando su
   recorrido en IndexedDB.
2. ✅ **Descarga compartida y mapa de dos carriles** (2-nov). Sin objeto `db.plan` todavía:
   el plan híbrido es el par de programas activos; el objeto con nombre llega con la creación
   (paso 4), que es cuando hace falta. Cuando fuerza descarga, las carreras de esa semana van
   al 60 % de volumen con la misma intensidad (`deloadRunSegments`: menos series, rodajes más
   cortos; calentamiento y calma intactos), se guardan con `deload: true` y **no cierran su
   semana del programa**: la descarga se intercala y esa semana se hace completa después.
   Interruptor «Descarga compartida con carrera» en Ajustes. En Entrenar → Plan, «Semana a
   semana» con las dos columnas y la descarga compartida a lo ancho (`hybridWeeks`).
3. ✅ **Semana tipo con avisos de interferencia** (2-nov). `js/interference.js` clasifica
   por contenido: pierna pesada = un básico de tren inferior a ≤ 8 reps o dos de volumen;
   carrera de calidad = series o Z3+; tirada larga = 75 min o 15 km seguidos (calentamiento y
   calma no cuentan). Tres reglas: pierna pesada el día antes de calidad/tirada, el mismo día,
   o tirada el día antes de la pierna. «Tu semana» en Ajustes → Programación semanal (los
   próximos 7 días con su clase y los choques), aviso en «Hoy» si el choque es hoy o mañana
   y bloque en el snapshot de Quirón. Avisa y explica; no mueve nada.
4. Crear el plan con Quirón y editor manual.

## Criterios de aceptación

- Perder una semana entera corre el plan y recalcula las fechas sin perder sesiones.
- "Me duele el hombro derecho, un 6" en el chat deja una molestia en el estado y la
  sesión siguiente ya no tiene press por encima de la cabeza, con su porqué visible.
- "Tengo agujetas" con intensidad baja **no** cambia nada (no sobrerreaccionar es parte
  del criterio de un buen preparador).
- Dos semanas con `loadRatio` > 1,3 proponen adelantar la descarga; el atleta puede
  rechazarlo y queda anotado.
- Una meta A con fecha genera taper/test antes del evento y avisa si la proyección no
  llega.
- Ningún ajuste de plan se aplica sin confirmación; ningún ajuste bloquea entrenar.
- Suite completa en verde, incluido `design-system.test.js`.

## Preguntas abiertas

- ¿La meta A puede ser de carrera mientras la fuerza sigue su propio bloque, o el plan es
  único y concurrente (híbrido real, con interferencia)? Propuesta: un plan, dos carriles
  (fuerza y carrera) con descargas sincronizadas.
- ~~¿Check-in diario por defecto o solo cuando Quirón lo pide?~~ Decidido (8-nov, D10):
  encendido por defecto, de 3 toques y apagable en Ajustes; sin respuesta no pasa nada.
