# Cierre de la ontología (reconciliar + F5 + 8 filas)

Fuente: reconciliación por scout (2026-09-26) sobre `docs/PLAN-ONTOLOGIA.md` y
`odd/tasks/f0f2|f3|f4-ontologia*.md` contra el código real en `main` (f84182a).

## Estado real reconciliado

- **F0–F4: HECHOS en código** (verificado con file:line): build tool con
  vocabularios, 74 nodos generados, `resolveExercise` (js/exercise-ontology.js:1193),
  `LIFT_PATTERNS` eliminado (domains.js:3,177-183), tools `find_exercises`/
  `explain_exercise` (tools.js:95,115), soul.js SEGURIDAD a nivel instrucción
  (soul.js:26), volumen por patrón en contexto (context.js:153-163).
  Dos reviews RDD aprobadas (review-09db02bde4b69356, review-570c2a324c119cb5).
- **Docs que mienten**: PLAN F0–F2/F4 desmarcados (hechos), `f3-ontologia-derivacion.md`
  5 checkboxes sin marcar (hecho), PLAN promete `substitutes[]` en el esquema F0
  (derivable en `exercise-catalog.js:90`), cuenta "873" (real 876), D7–D12 del
  f0f2 no escritas en el PLAN.
- **No empezado (gap real)**: F5 evals — check `catalogo` en `evals/checks.mjs`,
  test en `tests/evals-checks.test.js`, escenario "molesta el hombro → sustituir
  press militar". F6 (OpenAlex) queda fuera de alcance.
- **Humano → aceptado por el usuario (2026-09-26)**: aplicar las 8 filas
  `confianza: media` con criterio propio, citadas fila a fila en el PR.

## Tareas

- [x] W1 — 8 filas: `confianza` → `confirmada` en `docs/ontologia-propuestas.json`
      con `nota` de cierre por fila (criterio: variante de implementación
      aceptada en el nodo fedb; regresión/progresión distinguen la variante).
      Regenerar `js/exercise-ontology.js` + `docs/ontologia-propuestas.md` con
      `tools/build-exercise-ontology.py` (sin --refresh: cache local). Vigilar
      avisos de alias descartados por colisión de mediaKey.
- [x] W2 — Higiene de docs: PLAN F0–F2/F4 checkboxes [x]; esquema F0
      (`substitutes[]` → derivado, ver exercise-catalog.js:90); 873→876;
      D7–D12 escritas en el PLAN; `f3-ontologia-derivacion.md` 5 checkboxes +
      sección de evidencia; nota de cierre (8 filas aplicadas 2026-09-26).
- [x] E1 — F5: check `catalogo` hard en `evals/checks.mjs` (todo ejercicio que
      Quirón nombra resuelve con `resolveExercise` + compatibilidad de
      equipamiento declarado por escenario) + casos adversariales en
      `tests/evals-checks.test.js` (un check que no caza nada debe fallar).
- [x] E2 — F5: escenario "molesta el hombro → sustituir press militar" en
      `evals/scenarios.mjs` (ejercita soul.js SEGURIDAD end-to-end).
- [ ] V — suite completa verde (delta de fixtures de dominios = 0), bump
      sw v156→v157 (cambia js/exercise-ontology.js), verificación, revisión
      nativa, PR, deploy.

## Fuera de alcance

- F6 OpenAlex (`tools/verify-refs.py`).
- Escenarios de evals adicionales (pierna-sin-gimnasio ya existe como routing).
- Los 9 findings informativos del review F4 (ya registrados como trabajo futuro).
- `build-exercise-catalog.py` / página de catálogo.

## Evidencia de commits

- `cb9d2e9` fix(tools): first-wins alias dedup (regresión 239/239 claves de main sin cambio).
- `de8732a` feat(ontology): 8 filas confirmadas → 82 nodos, test total 82, sw v157.
- `6f69e59` docs(ontology): PLAN + docs de tarea reconciliados.
- W1 detalle: el build avisa de colisiones de alias; con first-wins las filas
  nuevas ceden sus claves ('Handstand Push-Ups' sigue en hspu, 'Sit-Up' en
  situps, etc.). 'Desplantes' → kb-zancada (coherente: primer nodo en orden).
- Suite: 807/807 verde tras W1+W2.

## Evidencia de verificación

- `5f1de6b` feat(evals): catalogo check + molestia-hombro + docs (suite 812/812).
- Nota E1: la sub-check de equipamiento usa el campo opcional `equipment` del
  escenario — solo cubierto por tests de momento (ningún escenario real lo
  declara todavía; declararlo en `ruteo-sesion-sin-material` caparía runs
  reales — pendiente de decisión cuando se ejecuten evals a escala).
- Pendiente de verificación independiente + revisión nativa.
