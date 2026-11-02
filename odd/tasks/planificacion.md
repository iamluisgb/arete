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
  - **Por señal**: el `loadRatio` por encima de 1,3 dos semanas seguidas, atascos de
    `progression.js` en dos o más básicos a la vez, o un check-in malo sostenido
    (ver D5).

  Una semana de descarga mantiene las sesiones con el 60 % de las series y −10 % de carga, y
  la aplica `progression.js`, no un plan aparte.
- **D5 — Estado del atleta (`db.athleteState`).** Es una lista de entradas con fecha que
  viaja con el sync:
  - `molestia`: `{ zona, lado, intensidad 0-10, tipo: agujeta|molestia|dolor|lesion,
    desde, hasta?, nota }`. La zona sale de una lista cerrada (hombro, codo, muñeca,
    lumbar, cadera, rodilla, tobillo, isquio, gemelo…) que encaja con la ontología de
    ejercicios.
  - `checkin`: `{ sueño 1-5, energía 1-5, estrés 1-5, rpeSesion? }`. Es opcional: se
    pregunta en una tarjeta de 3 toques antes de entrenar o lo saca Quirón de la
    conversación.
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
  | Check-in malo (sueño o energía ≤ 2) | La sesión de hoy pasa a ser la versión ligera (−30 % de volumen, sin intentos de récord) |
  | `loadRatio` > 1,3 sostenido | Adelantar la descarga |
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
2. **Pestaña Plan + metas.** Metas atadas a dominios y eventos; construcción hacia atrás
   desde la meta A; línea de tiempo; absorbe «Plan y fase»; componente en `patterns.html`.
3. **Estado del atleta.** `db.athleteState` + sync; tool `report_state`; tarjeta de
   check-in opcional; zonas cruzadas con la ontología de ejercicios.
4. **Motor de ajuste.** `js/adapt.js` con las reglas de D6 y sus tests; ajustes de sesión
   aplicados con deshacer; integración con `progression.js` (descarga, reentrada, series
   que no cuentan como falladas).
5. **Ajustes de plan por Quirón.** `propose_plan_change` con diff; meta en peligro;
   historial de ajustes; evals de Quirón (`docs/EVALS.md`) con conversaciones de
   lesión, agujetas, viaje y semana mala.

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
- ¿Check-in diario por defecto o solo cuando Quirón lo pide? Propuesta: apagado por
  defecto, con un toque en «Hoy» para activarlo.
