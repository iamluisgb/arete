# Feature: F0+F1+F2 — catálogo de ontología generado (89 de Areté × free-exercise-db)

Plan: docs/PLAN-ONTOLOGIA.md (F0, F1, F2). F3 ya mergeado (PR #1): la semilla
hand-authored en js/exercise-ontology.js es el contrato a subsumir — mismas claves
de resolución (mediaKey), mismos lifts/variantOf, resolveExercise intacto.

## Tareas

- [x] F0: tools/build-exercise-ontology.py — baja fedb (876 ejercicios, plan decía
      873: upstream creció), cachea el JSON crudo en tools/cache/ (gitignored),
      vocabularios controlados (PATTERN/EQUIPMENT/MUSCLE) en el script, esquema por ejercicio.
- [x] F1: docs/ontologia-propuestas.json — las 89 filas (fuente de verdad), decididas
      fila a fila contra shortlists de fedb; matching difuso NO usado como matcher
      (solo jaccard para acotar búsqueda). El .md se genera con --tabla.
- [x] F2: js/exercise-ontology.js regenerado — 74 nodos (37 fedb + 37 propios),
      contrato de semilla verificado (52 claves resuelven idéntico a F3);
      CACHE_NAME v143→v144 en sw.js; el fichero ya estaba en ASSETS desde F3.
- [x] npm test verde (552/552, +1 test de delta cero); delta de perfil de dominios
      cero en los 6 fixtures de evals (verificado módulo viejo vs nuevo).
- [x] Commits por unidad de trabajo; push; PR con la tabla como artefacto de revisión.

## Decisiones registradas

- D7: los nodos nuevos NO llevan lift (delta cero); variantOf es seguro (no alimenta
  liftMetric). Test de cinturón: solo los cinco canónicos de la semilla llevan lift.
- D8: docs/ontologia-propuestas.json es la fuente de verdad; el .md se genera.
- D9: semillas con match fedb claro → source 'fedb'; sin match honesto (pullup,
  búlgara, deadlift-high-pull) → source 'propia' con candidato fedb en la nota.
- D10: 8 claves de media ya resuelven por alias del canónico/variante (source 'alias',
  sin nodo propio). Alias rows no producen nodo.
- D11: 'kettlebell sentadilla' aplicada como variante propia con nota de CONFLICTO
  (tip menciona banco/pie delantero: posible split squat) — revisar ilustración.
- D12: elevación de talones → pattern squat (carga axial vertical), sin ampliar el
  vocabulario cerrado.
- Alias de fedb: el nombre inglés entra como alias salvo colisión de firma (aviso en
  build, p. ej. 'Deadlift' queda en el canónico barra, no en el de KB).

## Evidencia

- commit 1 (F0+F1): tools/build-exercise-ontology.py, docs/ontologia-propuestas.{json,md}, .gitignore
- commit 2 (F2): js/exercise-ontology.js, tests/exercise-ontology.test.js, sw.js
- Checks: npm test 552/552 ✓; delta cero fixtures ✓; contrato semilla ✓ (check en build).
- 8 filas en confianza 'media' NO aplicadas (sit-ups con barra ×2, windmill bajo,
  sentadilla básica con banda, elevación de piernas, elevación de talones, flexión
  pike, zancada) — esperan revisión humana.

## Review RDD (ciclo cerrado)

- Lineage: `review-09db02bde4b69356` (tier high, 4 lens: risk/resilience/readability/reliability,
  4307 líneas, presupuesto corrección 200 sin usar). Base: f907e29 (main).
- Resultado: **approved**; acknowledgement quemado (`gentle-ai.review-acknowledged/v1`,
  store_revision ea07a167). 17 hallazgos, todos informativos/no bloqueantes (SUGGESTION/WARNING
  sobre el script de build: cache poisoning teórico, media_key triplicado, filtro de confianza
  vs doc, ids duplicados como fuente de verdad, fetch sin pin, boot throw en exercise-ontology.js).
- Incidentes resueltos: (1) routing faltante para risk/resilience/readability → añadidos a
  models.json/subagents.json con glm5.3-flash; (2) reviewer readability cortó por longitud
  (stopReason length) → captura por slots individuales; (3) reviewer reliability copió mal el
  subject_hash (binding_mismatch ×2) → tercer intento correcto.
- PR: https://github.com/iamluisgb/arete/pull/2 — merge y deploy quedan como decisión humana.
