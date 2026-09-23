# Feature: sync-v2 — motor de sincronización real

## Context
El backup actual (`js/drive.js`) sube la db entera a ciegas: pisado de cambios
remotos (lost-update), borrados que resucitan (sin tombstones), `location.reload()`
a mitad de syncOnLoad, sin protección multi-pestaña, pull solo al arrancar y sin
diagnóstico. Quirón (`areteQuiron`) está fuera del backup. Referencia: el sync de
bookreader (`app/js/sync/`), probado en producción.

## Golden rule (no negociable)
El merge es **conmutativo e idempotente**: A⊕B == B⊕A y A⊕A == A, probado con
tests de propiedad. El push NUNCA pisa a ciegas: pull → merge → push, con
reintento ante conflicto.

## Decisions
- D-S2.1..D-S2.11 — ver engram id 31 (`sync-v2-decisiones`).
- Motor en `js/sync/{merge,schema,engine}.js` (adaptación de bookreader).
- LWW por uid + tombstones (`db.tombstones`, TTL 30 días) + stamps por clave.
- Backup v2 wrapper en `arete-backup.json`; Quirón en `arete-quiron.json`.
- Web Locks para multi-pestaña; reload prohibido DENTRO del ciclo de sync.
- Diagnóstico: historial de ciclos + badge tras 3 fallos consecutivos.
- (U1, hallazgo de las property tests) El merge devuelve orden determinista y
  `canonicalJson` ordena arrays: el ORDEN de los arrays no es parte del
  contrato, y así las huellas no re-botan entre dispositivos.
- (U1) Los tombstones borran solo dentro de su colección (`coll`): los ids se
  numeran por colección y colisionan entre colecciones. `legacy` (drenaje de
  deletedIds) es conservador y filtra en todas.
- (U1) `pickNewer` desempata por contenido (`canonicalJson`), no devuelve el
  local: bookreader lo tapaba con digests; la regla de oro exige convergencia.

## Tasks
1. [x] Explore: bookreader sync + drive.js + Quirón (scout + lectura de merge/schema/engine)
2. [x] Decisiones D-S2.1–D-S2.11 en engram (id 31)
3. [x] ODD doc creado
4. [x] U1: js/sync/merge.js + js/sync/schema.js + tests de propiedad + migración v7 (data.js) + stamping en saveDB + markDeleted→tombstone — commit `85fcef2`
5. [x] U2: js/sync/engine.js (pull→merge→push, fingerprint canonicalJson, 412→backoff+jitter, locks, triggers, diag) + drive.js transport + app.js cablea + applyImport/drive-ui via mergeInto → mergeDB legacy eliminado — commit `3d9cf67`
6. [ ] U3: Quirón en sync (fichero propio arete-quiron.json, LWW por mensaje) + tests
7. [ ] U4: sw.js bump (precache js/sync/*) + docs/SYNC-V2.md
8. [ ] npm test verde completo + escenarios: lost-update explícito, tombstones entre dispositivos, 412
9. [ ] Native review RDD
10. [ ] PR abierta SIN merge (revisión humana)

## Evidence
- U2 `3d9cf67`: engine con ciclo pull→merge→push, transport Drive en drive.js
  (rev = modifiedTime, wrapper v2, v1 backfill), triggers en app.js, 17+6 tests
  nuevos con los escenarios obligatorios. Suite completa 616/616. Verificación
  independiente (gentle-ai-verify): 7/7 ítems sin discrepancias. Endurecimientos
  del writer: purge de tombstones FUERA del ciclo (un push nunca debilita los
  deletes remotos) y guard isEmptyState (una instalación fresca no siembra un
  backup vacío).
- U1 `85fcef2` (rama `feat/sync-v2`): merge LWW conmutativo/idempotente +
  schema (backfill, tombstones, stamps, shadow-diff) + migración v7 +
  markDeleted→tombstone en los 5 call sites + `saveDBRaw`. `npm test` 600/600.
  Bugs que las property tests cazaron: desempate no determinista por contenido,
  arrays vacíos creados (A⊕A≠A), filtro de tombstones sin `coll`, stamps
  reconstruidos en vez de fusionados, y `DEFAULTS.schemaVersion` pisando el
  valor guardado en loadDB (una db sin versión no migraba — bug preexistente).

## Follow-ups (no bloquean)
- UI de diagnóstico en Ajustes (historial legible) — el badge y getDiag() llegarán con U2.
- `location.reload()` por storage-event podría eliminarse si la UI reaccionara a
  mutaciones externas del db (hoy es la red de seguridad multi-pestaña).
- Revisión de las 8 filas en confianza `media` de F1 (pendiente humano, previo).
