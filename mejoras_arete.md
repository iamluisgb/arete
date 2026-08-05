# Mejoras pendientes — Areté

Bugs y deuda encontrados de paso y anotados en vez de arreglados sobre la marcha. El sitio donde
apuntar lo que no toca ahora.

> Nota: este fichero se recrea aquí durante el pase del design system porque `AGENTS.md` lo cita y no
> existía en el árbol. Si aparece una versión anterior con más entradas, fusiónalas: la numeración
> alta (#7, la tabla de umbrales femenina) viene de esa lista.

## Encontrado durante el design system (fase 1, 2026-08)

1. **`--text-sec` no existe.** Se usa 7 veces en `app.css` (`.run-type-card-desc`,
   `.run-type-extra label`, `.run-type-pace-target-label`, `.run-type-race-label`,
   `.run-type-race-eta`, `.run-type-interval-seg`, `.run-type-elev-label`) y no está declarada en
   ningún `:root`. Esos textos, que deberían ser secundarios, heredan el color del contenedor. Se
   arregla al migrar las pantallas de carrera (fase 2, paso 7); no se toca ahora porque cambiaría el
   aspecto de una pantalla que este pase no rediseña.

2. **El parche de contraste del texto funcional de la sesión ya no hace lo que dice.** El bloque
   "Contraste del texto funcional de la sesión" de `app.css` sube el alfa a `.78` en tema claro para
   `.ex-card .sets-header`, `.ex-card .set-label`, `.sr-load span`, `.sr-lbl` y `.sr-did-k`, con el
   comentario de que `--text2` "da 2,86:1 y falla AA". Medido hoy: `--text2` (alfa `.80`) da
   **5,34:1** sobre blanco y el override de `.78` da **5,06:1**. El parche **baja** el contraste. Su
   propio comentario dice "PENDIENTE: revisar a nivel de sistema". Se borra al migrar el runner de
   sesión (fase 2, paso 8).

3. **Dos acciones primarias en "Hoy".** `#dashStartBtn` (rojo) y `#dashStartRunBtn` (cian) compiten
   con el mismo peso visual. Viola el presupuesto del acento (`DESIGN_SYSTEM.md` §2.3). Se resuelve
   al migrar el dashboard (fase 2, paso 3), decidiendo cuál de los dos es la acción del día.

4. **`.hi-edit-btn` es un botón rojo por fila de tabla.** Corregido dentro de Cuerpo con un override
   acotado; sigue igual en el historial de fuerza y en el de carrera.

5. **`aria-modal="true"` en `.detail-modal` a partir de 1024.** El comentario de `app.css` dice que
   `showDetail` lo pone a `false` cuando el detalle deja de ser modal y se acopla a la derecha;
   conviene comprobar que sigue siendo cierto tras cualquier cambio en el panel, porque si se queda
   en `true` el foco se encierra en un panel que no es modal.

## Anterior (recuperar de la lista original si aparece)

7. **Tabla de umbrales femenina.** Los umbrales de los 7 dominios están calibrados para hombre de
   ~75 kg y así se declara en pantalla (`CALIBRATION_NOTE`). Falta la columna femenina; necesita
   datos normativos, no código.
