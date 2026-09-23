# F3 — Derivación de dominios vía ontología

Plan fuente: `docs/PLAN-ONTOLOGIA.md` (F3). Criterio de hecho: `npm test` verde y el
perfil del fixture de evals no cambia salvo donde la spec lo declare.

## Decisiones (ver spec en el plan y memoria Engram)

- **D1 — Variantes: no cuentan, sin coeficiente.** Un front squat no alimenta la
  métrica `squat` ni con factor. Declarado por nodo (`variantOf`), nunca por ortografía.
- **D2 — Semilla hand-authored.** F0–F2 no estaban hechos; F3 se implementa con una
  semilla de la ontología (5 lifts canónicos + variantes declaradas). El módulo
  generado por F0/F2 debe subsumirla sin cambiar las claves de resolución.
- **D3 — Matching exacto normalizado.** Se reutiliza `mediaKey` (mudado a
  `js/exercise-ontology.js`); sin substring, sin fallback de regex.
- **D4 — Delta de fixtures: cero.** Verificado con `derivedMetrics` sobre los 6
  fixtures: las variantes que hoy cuelan por ortografía (`Squat con Salto`,
  `Squat en Rack`, `Deadlift High Pull`) son series ligeras que nunca fijaron máximo.

## Tareas

- [ ] 1. Escribir la decisión de variantes en `docs/PLAN-ONTOLOGIA.md` (F3).
- [ ] 2. Semilla `js/exercise-ontology.js` + mover `mediaKey` desde
      `js/ui/exercise-pict.js` + `sw.js` (CACHE_NAME, ASSETS).
- [ ] 3. Sustituir `LIFT_PATTERNS` en `js/domains.js` (derivados + `unratedLifts`),
      dominadas incluidas en la misma resolución.
- [ ] 4. Tests: ontología, variantes no cuentan, básicos siguen derivando,
      perfil del fixture real fijado (skipIf falta el fixture).
- [ ] 5. `npm test` verde, estado del plan, commits por unidad de trabajo.

## Evidencia

- `9951686` feat(ontologia): semilla de ontología y decisión de variantes (F3)
- `ab844a3` feat(dominios): la derivación resuelve vía la ontología (F3)
- Rama `feat/ontologia-f3` (desde `main`). Push/PR: decisión del usuario.
- `npm test`: 32 ficheros, 551 tests verdes (incl. evals-battery con `synth --check`).
- Delta de perfil sobre los 6 fixtures: cero (derivados idénticos antes/después).
- Decisiones también en Engram: `arete/plan-ontologia/variantes`, `arete/plan-ontologia/f3`.
