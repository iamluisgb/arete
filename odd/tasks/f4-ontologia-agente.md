# F4 — Agente sobre la ontología

Plan fuente: `docs/PLAN-ONTOLOGIA.md` (F4). El catálogo de 74 nodos está en
producción (85c55c4); esta fase lo expone a Quirón. Criterio de hecho: `npm test`
verde, delta de fixtures cero salvo lo declarado, review nativa aprobada y **PR
abierta sin merge ni deploy** (decisión del usuario: la revisa él).

## Decisiones (spec completa en Engram `plan-ontologia/f4`)

- **D-F4.1 — Motor en módulo propio.** `js/ai/exercise-catalog.js` (hand-authored)
  importa `EXERCISE_ONTOLOGY`/`resolveExercise`; el build script no cambia (datos
  puros, contrato F0/F2 intacto).
- **D-F4.2 — `find_exercises`**: filtros opcionales (pattern/equipment/muscle/domain/
  evita), cap 15. `evita` excluye por nombre/alias/patrón y por texto de
  contraindicaciones (`evita:['hombro']` saca todo lo que menciona Hombro).
  Limitación: las 8 filas media no están en el catálogo y no se ofrecen.
- **D-F4.3 — `explain_exercise`**: nodo + contraindications + regresión/progresión +
  sustitutos derivados (variantOf→lift canónico y hermanos de patrón; no hay campo
  `substitutes` en datos). No resuelve → no está en el catálogo, sin inventar.
- **D-F4.4 — `goal` resuelto**: las descripciones de propose_session/propose_program
  en tools.js exigen citar ejercicios resueltos del catálogo (GATHER_INSTRUCTION del
  plan; no existe como símbolo — se editan esas cadenas).
- **D-F4.5 — SEGURIDAD operativa**: ante molestia, llamar `explain_exercise` y
  proponer la regresión o un sustituto del mismo patrón.
- **D-F4.6 — Volumen por patrón** en el snapshot (context.js), 28d, sets por patrón
  calculados en JS. Delta de evals declarado: cambia el texto del snapshot (deseado).

## Tareas

- [x] 1. Rama `feat/ontologia-f4` + spec F4 en el plan + ODD/memoria.
- [x] 2. `js/ai/exercise-catalog.js` (findExercises/explainExercise) + tests + sw.js.
- [x] 3. Tools `find_exercises`/`explain_exercise` en tools.js + instrucción de goal.
- [x] 4. soul.js: SEGURIDAD operativa + ruteo hacia find_exercises.
- [x] 5. context.js: VOLUMEN POR PATRÓN (28d) en el snapshot + tests.
- [x] 6. `npm test` verde + delta verificado; commits por unidad.
- [ ] 7. Review nativa del candidato + PR abierta (SIN merge ni deploy).

## Evidencia

- `08252da` feat(quiron): catalog search and explanation tools for the agent (F4)
- `99a3f2b` feat(context): per-pattern volume in the agent snapshot (F4)
- `npm test`: 33 ficheros, 575 tests verdes (+23 del motor de catálogo).
- Delta de perfil de dominios sobre los 6 fixtures: cero (diff vacío antes/después).
- Delta de snapshot: el declarado en la spec (nuevo bloque VOLUMEN POR PATRÓN).
- Labels de espera para las dos tools nuevas en `js/ui/quiron.js` (test lo exigía).
- Review: lineage `(pendiente)`; PR abierta sin merge — decisión del usuario.
