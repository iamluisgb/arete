# Interfaz del agente (Quirón) — ronda de mejora

Goal: resolver los dos problemas del usuario (2026-09-27): "los botones no
están claros y el historial de conversaciones tampoco" + los hallazgos del
scout de la ronda de memoria. Fuente del mapa: scout 2026-09-27 (inventario
de botones, modal de historial, chips, renderConvo) + findings de las
revisiones de quiron-memoria.

## Alcance

Estado: U1–U6 todos completados (2026-09-27). Decisión del parent: en
conversación vacía los chips NO se pueden ocultar con el toggle
(`chipsOn || sin turno user`) — comportamiento correcto: en vacío son la
guía; el toggle importa cuando ya hay turnos. La expectativa contraria fue
del enunciado de verificación, no del diseño.

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

- [x] U6 (hallazgo del worker): el título "Cerrar (Esc)" prometía Escape y
      el panel no lo cerraba (el handler global solo cubre .modal-overlay y
      .sheet). Handler en capture phase con precedencia modal-primero.

## Evidencia de commits

- `6ed17af` feat(quiron): U1-U6 (labels apilados con degrade <360px, bienvenida
  efímera + toggle lightbulb de chips, hora/separadores ts>0, preview + borrado
  en dos toques en historial, Escape del panel en capture phase). +12 tests.
- chore(sw): CACHE_NAME v159→v160 (app.html/app.css/quiron.js precacheados).
- Suite: 882/882 (52 ficheros).

## Hallazgos registrados (fuera de alcance)

- La fila de chips se oculta del todo sin contenido (antes strip vacío ~16px):
  cambio intencional del toggle.
- Streaming del assistant no lleva hora hasta renderConvo (efímero por diseño).

## Evidencia de verificación

- gentle-ai-verify: PASS checks 1-5 — suite 882/882, diff limitado a los 6
  ficheros esperados, revisión de fuente completa (bienvenida efímera no
  persistida, precedencia Escape capture-phase con guard de app.js:598,
  ts<=0 sin hora, preview 80 chars), 11 tests de markup contra app.html real
  clonado, y **test en vivo a 390 y 320**: labels visibles/ocultas según
  media query, scrollWidth==clientWidth en ambas, bienvenida+chips en vacío,
  HH:mm + 2 separadores de día + legacy sin adornos, preview y borrado en dos
  toques, Escape con precedencia modal→panel.
- Única desviación: toggle de chips no oculta en convo vacía → decisión del
  parent: comportamiento correcto (ver Estado arriba).

## Revisión nativa + incidente de binding

- review-6a3805fac1570637: tier medium, lente review-reliability.
  **APPROVED**, autoridad quemada. 3 findings informativos:
  R3-chips-toggle-stale-when-setup (quiron.js:396-404),
  R3-history-delete-confirm-permanent (:1461-1470),
  R3-quiron-daysep-undefined-ts (:357-361).
- Incidente: dos `capture-binding-rejected` por mezclar en el binding la
  revisión de autoridad con la `expected-revision` del binding (y no copiar
  `artifactSubject.authorityRevision` fresco). Resolución: STATUS → copiar el
  string del binding verbatim (authorityRevision == expected-revision ==
  5cf266a8…) → forecast → ack → run. Lección: copiar el binding SIEMPRE
  byte a byte del STATUS, nunca recomponerlo.

## Ronda 2 — Estado PC sin key + navegación con panel abierto (2026-09-27)

Reporte: "en Quirón, cambio a Más y sigue en Quirón; en el PC no me deja
escribir ni hacer scroll — está roto". Cadena reproducida en 1440×793 sin
`areteAiKey` con la conversación sincronizada desde Drive:

- P1: `showSetupIfNeeded` oculta el composer sin key (por diseño), pero la
  regla `.quiron-panel:has(.quiron-setup:not([hidden])) .quiron-msgs{flex:0 0 auto}`
  hace que el chat (2955px) no se contraiga: setup queda a y=3017 (fuera de
  pantalla), msgs sh==ch (sin scroll interno) y NO hay ningún elemento
  scrollable del panel → scroll muerto y setup invisible. El PC no tiene key
  (la key no viaja en el sync; solo el chat), por eso el estado imposible.
- P2: `switchTab` (nav.js) no cierra el panel de Quirón: la sección cambia
  detrás (Más queda active con el panel encima, body sigue `quiron-open`).

Alcance: P1 CSS (msgs siempre `flex:1 1 auto; min-height:0` + setup
`order:-1` como cabecera cuando visible), P2 evento `arete:section-switch`
decoplado (patrón de `arete:ask-quiron`) → closePanel, tests (P2 conductual,
P1 source-contract), sw v164. Fuera de alcance: sincronizar la API key
(secreto, diseño actual la mantiene por origen).

Evidence: (pendiente)
