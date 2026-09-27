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
- [x] A1 — Flake UX-7: guard `if (!$exerciseList?.isConnected) return;` en
      `saveDraft` (js/ui/training.js:52) + test de regresión.
- [x] A2 (confirmado: js/app.js:517-527, cap ~2 min + toast final) — `scheduleAppReload` (js/app.js): polling acotado (tope de
      intentos + toast final) — findings auditoría R3-001/R3-002.
- [x] A3 — Supply chain del build tool: fetch sin pin / validación de cache
      (findings f0f2).
- [x] B1 — metrics.js:178 comentario del predicado de series.
- [x] B2 — tools.js:275 truncation hint: "refina con pattern/equipment/evita".
- [x] B3 — test source-contract del clamp de .hi-session (-webkit-line-clamp:2).
- [x] B4 — test del breakpoint de Compartir (@media max-width:433px).
- [x] B5 — dedupe del toast de mismatch de borrador (mismo ts no re-toast).
- [x] B6 — toast(): re-query lazy de #toastContainer (quita acoplamiento de boot).
- [x] B7 — comentario de coherencia CACHE_NAME/ASSETS en sw.js.
- [x] B8 — nav-label: assert de texto no vacío en el test de markup.
- [ ] V — suite verde, verificación, revisión nativa, PR, deploy.

## Fuera de alcance (categoría C)

Documentar en este doc al cierre qué se acepta y por qué.

## Evidencia de commits

- `b0bb138` fix(test): flake UX-7 (guard isConnected en saveDraft + test rojo/verde) + dedupe toast mismatch + 3 source contracts.
- `9470e89` fix(app): cap de polling 240 ticks + toast final; toast() resiliente al boot-order.
- `599645e` build(ontology): input pineado por SHA-256 (5bb747e3fc65…95d40bf), verificado en cache-load y post-download; regen sin diff.
- `a1867bb` chore(ai): comentario del predicado de series + hint de refinado en truncamiento.
- `494e6dd` chore(sw): regla de coherencia CACHE_NAME/ASSETS.
- Suite: 815/815 (era 812; +3 tests nuevos). ui-polish 16/16 ×3 frías;
  suite completa ×2 frías verde. A3 verificado: diff de regeneración vacío.

## Evidencia de verificación

- gentle-ai-verify: PASS 6/6 — suite ×3 frías 815/815 (0 fallos), test de flake
  ejercita el guard real (rojo verificado por el worker con el guard retirado),
  diff limitado a los 9 ficheros esperados, dedupe B5 solo suprime el toast
  (el descarte sigue), cap de polling no toca el reload inmediato, pin SHA-256
  coincide con `shasum -a 256` del cache y se verifica en ambas rutas,
  regeneración del módulo sin diff, source contracts no triviales (regex +
  whitespace normalizado + trim), CACHE_NAME sigue v157 sin bump (ningún
  activo de ASSETS cambió).

## Revisión nativa

- review-2ad8663a7d411bfa: tier **high** (build tool = process boundary),
  4 lentes materializados en grupo (4 model runs, pi_host_relay). **APPROVED**,
  autoridad quemada. 19 findings informativos (R1-001..002, R2-001..006,
  R3-1..6, R4-A..E) sobre los cambios de esta ronda — trabajo futuro.

## Categoría C — aceptada y documentada (no se arregla)

- Vocabularios duplicados en descripciones de tools (el modelo no ve el módulo generado — intencional).
- Cap de hermanos `.slice(0,3)` duplicado entre running/training (churn sin cambio de comportamiento).
- `muscle` como array libre sin anyOf (la descripción lista el vocabulario; desconocidos no matchean).
- Caps `.slice(0,6)` de explainExercise (elección de producto documentada).
- try/catch silencioso del hint de programación (peor caso: el hint reaparece).
- try/catch del calendario N3 (ya documentado con comentario).
- renderRunPlanQueue / renderPlanQueue (pura presentación con early return).
- renderSchedulePreview con ancla de mediodía (TZ ya mitigado).
- Filtro de plan del calendario y chips con title (semántica documentada arriba del código).
- Ventana de lookback de scheduleMissed (JSDoc).
- Clasificador run-vs-strength de Quirón (input con schema de prompt).
- Sonda GPS de centrado de mapa (acción del usuario, error silenciado aceptable).

## Stale (ya resueltos, sin acción)

- PLAN substitutes contradiction (resuelto en la ronda de cierre de ontología).
- evals catalogo empty-answer (ya visible + test fijado en esa ronda).

## Segunda revisión (candidato con v158) + incidente de transporte

- `a399073` fix(sw): bump v157→v158 — detectado ANTES de entregar: los 5 JS
  modificados están en la precache del SW y el SW sirve cache-first; sin bump
  los clientes instalados nunca recibirían el update. Comentario corregido a
  la regla real (ASSETS o contenido de cualquier fichero listado).
- Incidente: en review-e3e93bb92d21a0ba el revisor resilience devolvió un
  payload con campo desconocido `severity_note` → rechazado en admisión
  (payload preservado en .git/gentle-ai/rejected-results/). STATUS fresco
  reofrió los 3 slots restantes (risk ya admitido), reintento del grupo de 3
  → todos admitidos.
- review-e3e93bb92d21a0ba: **APPROVED** (4 lentes completos), 15 findings
  informativos (R1-1..2, R2-001..007, R3-001..003, R4-A..C), autoridad quemada.
