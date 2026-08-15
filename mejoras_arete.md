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

6. **Dos temporizadores de descanso viven en paralelo.** `.timer-bar` (la barra de la pestaña
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

## Anterior (recuperar de la lista original si aparece)

7. **Tabla de umbrales femenina.** Los umbrales de los 7 dominios están calibrados para hombre de
   ~75 kg y así se declara en pantalla (`CALIBRATION_NOTE`). Falta la columna femenina; necesita
   datos normativos, no código.
