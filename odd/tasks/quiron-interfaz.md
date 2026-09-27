# Interfaz del agente (Quirón) — ronda de mejora

Goal: resolver los dos problemas del usuario (2026-09-27): "los botones no
están claros y el historial de conversaciones tampoco" + los hallazgos del
scout de la ronda de memoria. Fuente del mapa: scout 2026-09-27 (inventario
de botones, modal de historial, chips, renderConvo) + findings de las
revisiones de quiron-memoria.

## Alcance

- **U1 — Cabecera clara**: los 5 botones `.quiron-hbtn` (Informe, Memoria,
  Historial, Nueva, Cerrar) son solo-icono (aria-label + title sí, pero nada
  visible). Objetivo: cada acción se entiende sin adivinar. Restricciones:
  cabecera a 320-390px sin scroll horizontal; Esc sigue cerrando; sin romper
  el patrón de foco del panel. Dirección recomendada (decide el worker con
  la medida real): icono+label corto para las acciones poco evidentes
  (Informe/Memoria/Historial/Nueva) con Cerrar solo-icono; o labels debajo
  del icono si no cabe en fila. Añadir test de contrato markup.
- **U2 — Estado vacío + chips persistentes**: hoy no hay bienvenida y los
  4 chips (`CHIPS`) desaparecen para siempre tras el primer mensaje. Fix:
  burbuja de bienvenida efímera (render, no persistida) cuando `convo` está
  vacío, con una línea de expectativas de memoria ("recuerdo lo importante
  con 🧠 Memoria y tus últimos mensajes; tus datos siempre al día"), y un
  **toggle de sugerencias** junto al composer (p. ej. icono `lightbulb`)
  que re-muestre los chips cuando el usuario quiera (chips auto-solo en
  vacío, como hoy). El "Continuar respuesta" efímero se deja como está
  (documentado, fuera de alcance).
- **U3 — Historial legible**:
  - Hora (`HH:mm`) en cada burbuja usando el `ts` existente; mensajes
    legacy (ts=0) sin hora.
  - Separadores de fecha entre días (solo ts>0).
  - Modal de conversaciones: añadir **preview de la última respuesta**
    bajo el título; el borrado pasa a confirmación en dos toques (patrón
    del modal de memoria), quitando el ✕ de un solo toque.
- **U4 — Escape**: el finding R3-memory-modal-missing-close-on-escape —
  Escape debe cerrar el modal de memoria; verificar que Historial y
  Memoria se comportan igual con Esc y con clic en el overlay.
- **U5 — Tests**: contratos markup (labels visibles de cabecera, toggle de
  sugerencias, bienvenida, preview en modal), render de hora/separador en
  burbujas (si el render es testeable en jsdom sin sobreescribir setup), y
  el contrato de Escape si hay handler unit-testable.

## Fuera de alcance

- Borrado de conversaciones que revive tras sync (trade-off U3 documentado).
- Buscador en el modal de historial (15 entradas, P2).
- Persistir "Continuar respuesta".
- Cambiar la ventana de 8 mensajes del modelo.

## Evidencia de commits

(pendiente)

## Evidencia de verificación

(pendiente)
