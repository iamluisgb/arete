# Ronda de limpieza — findings informativos + flake de tests

Fuente: ~65 findings informativos acumulados en 6 revisiones aprobadas
(programación-semanal 10, auditoría móvil 10, ontología-cierre 15, f0f2 17,
f4 9, ux-checklist 4) + el flake pre-existente de ui-polish UX-7.

## Criterio de triaje

- **A — arreglar ahora**: riesgo real (flake, polling sin cota, supply chain
  del build tool, crash en boot, dead-end de truncamiento en Quirón).
- **B — hardening barato**: tests que faltan, comentarios que explican
  predicados, cambios de una línea.
- **C — aceptado y documentado**: subjetivos/cosméticos (vocabularios
  duplicados, muscle anyOf, tokens z-index, scrim blur, nav solo-iconos,
  carousel peek) → se documentan como aceptados, no se arreglan.

## Tareas (alcance final del triaje: A=3, B=8, C=14 aceptados, 2 stale)

- [x] S — Scout de triaje: estado actual (file:line) de los candidatos A/B,
      diagnóstico de la raíz del flake UX-7, esfuerzo por item.
- [x] S — RAÍZ DEL FLAKE (scout): `training.js:78-150` `scheduleDraft()` crea un
      timer REAL de 500ms en UX-6 (`input` event) que se filtra entre tests;
      `vi.resetModules()` + `localStorage.clear()` no lo limpian. El timer
      tardío dispara `saveDraft` con los selectores cacheados de la vista
      vieja y escribe el draft de "Sesión A" sobre el de "Sesión B" durante la
      ventana lenta de import del test UX-7 → match en vez de mismatch → sin
      toast → assert falla. Solo en runs en frío en paralelo.
- [ ] A1 — Flake UX-7: guard `if (!$exerciseList?.isConnected) return;` en
      `saveDraft` (js/ui/training.js:52) + test de regresión.
- [ ] A2 (confirmado: js/app.js:517-527, cap ~2 min + toast final) — `scheduleAppReload` (js/app.js): polling acotado (tope de
      intentos + toast final) — findings auditoría R3-001/R3-002.
- [ ] A3 — Supply chain del build tool: fetch sin pin / validación de cache
      (findings f0f2).
- [ ] B1 — metrics.js:178 comentario del predicado de series.
- [ ] B2 — tools.js:275 truncation hint: "refina con pattern/equipment/evita".
- [ ] B3 — test source-contract del clamp de .hi-session (-webkit-line-clamp:2).
- [ ] B4 — test del breakpoint de Compartir (@media max-width:433px).
- [ ] B5 — dedupe del toast de mismatch de borrador (mismo ts no re-toast).
- [ ] B6 — toast(): re-query lazy de #toastContainer (quita acoplamiento de boot).
- [ ] B7 — comentario de coherencia CACHE_NAME/ASSETS en sw.js.
- [ ] B8 — nav-label: assert de texto no vacío en el test de markup.
- [ ] V — suite verde, verificación, revisión nativa, PR, deploy.

## Fuera de alcance (categoría C)

Documentar en este doc al cierre qué se acepta y por qué.

## Evidencia de commits

(pendiente)

## Evidencia de verificación

(pendiente)
