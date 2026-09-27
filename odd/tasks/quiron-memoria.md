# Memoria duradera de Quirón (inspirada en Engram)

Goal: que el agente recuerde entre sesiones el conocimiento conversacional
importante (preferencias, dolores, horarios, decisiones, objetivos) — hoy
perdido tras la ventana de 8 mensajes — visible y editable por el usuario.

Plan madre: `odd/tasks/ronda-limpieza.md` → no; ronda propia. Origen: pregunta
del usuario (2026-09-27) "¿podemos guardar la info importante de las
conversaciones, inspirado en Engram?". Decisión del usuario: **memoria
primero, UI después** (la ronda de botones/historial queda pendiente).

## Estado actual (scout 2026-09-27)

- Conversación: localStorage + archivo de 15 + sync Drive `arete-quiron.json`
  (js/sync/quiron.js, union-by-uid + LWW, SIN tombstones — los borrados locales
  reviven tras sync, trade-off aceptado para el chat).
- Modelo: cada turno envía snapshot fresco (context.js) + últimas 8 mensajes
  (HISTORY_MSGS=8). Todo lo anterior es invisible para el modelo.
- Snapshot ya incluye datos deportivos; falta el conocimiento conversacional.

## Decisiones de diseño

- **D1 — Dónde vive**: array `memorias` DENTRO de `arete-quiron.json` (mismo
  ritmo de cambio que el chat, no ensucia el fingerprint de la db; patrón de
  sync ya probado). Entrada: `{uid, categoria, texto, ts, updatedAt,
  deleted, source}`.
- **D2 — Merge**: mismo contrato que el resto del fichero — union por `uid`,
  LWW por `updatedAt` con tie-break `stableStringify`. **Borrado = flag
  `deleted:true` con updatedAt=now** (propaga entre dispositivos; el LWW
  resuelve; los lectores filtran). Físico: FIFO por updatedAt a 200 entradas
  totales para no crecer sin límite.
- **D3 — Modelo**: tools nuevas `remember({id?, categoria, texto})` (upsert:
  sin id crea, con id reemplaza) y `forget({id})`. IDs cortos visibles en el
  snapshot como `[M1]…[Mn]` (orden por ts, determinístico). Mismo pipeline de
  tools que `get_workouts` (QUIRON_TOOLS).
- **D4 — Límites**: 50 memorias activas visibles; categorías cerradas:
  `horario | dolor | preferencia | decision | objetivo | otro`.
- **D5 — Recuperación**: sección nueva en el snapshot `MEMORIA DEL ATLETA`
  (context.js) — como el snapshot se reconstruye cada turno, la memoria NO
  depende de la ventana de 8 mensajes. Instrucción en soul.js: guarda lo
  duradero dicho por el usuario; NO guardes datos que ya están en el snapshot.
- **D6 — UI**: botón "Memoria" en la cabecera del panel (icono
  `psychology`) → modal: lista (chip de categoría + texto + fecha + id),
  editar inline, borrar con confirmación, contador `N/50`, estado vacío con
  copy. El usuario SIEMPRE ve lo que el agente recuerda.
- **D7 — Sync doc**: ampliar `docs/SYNC-V2.md` (contrato U3) con `memorias`
  y la semántica de `deleted`.

## Tareas

- [x] W1 — Capa de datos: esquema + storage (get/upsert/delete/list con
      filtrado de `deleted`) en js/ui/quiron.js (o módulo dedicado si quima),
      merge de `memorias` en js/sync/quiron.js (union+LWW+flag deleted+FIFO
      200), `docs/SYNC-V2.md`, tests de storage y de merge (2 dispositivos,
      LWW, borrado propagado).
- [x] W2 — Tools: registrar `remember`/`forget` en QUIRON_TOOLS + dispatch +
      labels de espera; ids `[Mn]` coherentes con el orden del snapshot.
- [x] W3 — Snapshot e instrucción: sección MEMORIA DEL ATLETA en context.js
      (sin ella los ids del modelo no existen), instrucción en soul.js; tests.
- [x] W4 — UI: botón Memoria + modal (app.html/app.css/js/ui/quiron.js),
      render de lista, editar/borrar, contador, estado vacío; tests markup.
- [ ] V — suite completa, verificación independiente, revisión nativa, PR,
      deploy (preguntando antes).

## Fuera de alcance (esta ronda)

- Destilación automática periódica (si hace falta, ronda posterior).
- Pin manual desde burbujas (v2 — el usuario ya puede escribir "acuérdate…").
- Cambios en la ventana de 8 mensajes (la pista de UI va en la ronda de interfaz).
- Tombstones para el chat (borrado de conversaciones) — sigue como trade-off.

## Revisión nativa

- review-bfba7aecfceb8b97: tier medium (17 ficheros, 1270 líneas), lente
  review-reliability. **APPROVED**, autoridad quemada. 3 findings informativos:
  R3-edit-blank-null (js/ui/quiron.js:1417), R3-line-length (:1400),
  R3-memory-modal-missing-close-on-escape (:1387) — el de Escape queda
  anotado para la ronda de interfaz.

## Evidencia de commits

- `a0baf18` W1 capa de datos: js/quiron-memory.js (esquema, caps 50/200,
  borrado blando, shortIds), mergeMemorias en sync (union uid + LWW + flag
  deleted + FIFO 200), hooks get/save con slot memorias, SYNC-V2.md. +32 tests.
- `89cff6c` W2+W3: QUIRON_MEMORY_TOOLS (remember/forget con resolución de
  shortId), buildMemoriaSection en snapshot (context.js lee loadMemorias
  directo — hoja, sin ciclo), sección soul.js. +20 tests.
- `fda40b2` W4: wiring (tools array, exclusión del bloque data, labels,
  contrato de labels ampliado), #quironMemoryBtn + #quironMemoryModal
  (lista M1..Mn, edición inline, borrado con confirm en dos toques,
  contador N/50, estado vacío), fixtures con el nuevo modal en su contrato
  de DOM (convención del repo), +3 tests.
- Suite: 870/870 (52 ficheros).

## Evidencia de verificación

- gentle-ai-verify: PASS 8/8 — suite 870/870, diff limitado a 17 ficheros
  esperados, semántica de capa de datos completa (borrado blando, LWW,
  propagación de deleted A→B, caps 50/200, shortIds posicionales) con tests
  nombrados, coherencia de ids [Mn] entre snapshot y tools fijada por test
  (ambos vía listMemorias), tools (validación, replace sin duplicar,
  source:modelo, aviso de democión, forget con error claro), exclusión del
  bloque data, labels + contrato ampliado, snapshot con sección omitida si
  vacía + soul + comentario TOKEN_GUARD, y **check en vivo del modal**
  (abrir, estado vacío, 3 filas con chips/fecha/contador 3/50, editar y
  persistir, borrar con ¿Seguro? → deleted:true y contador 2/50),
  SYNC-V2.md U3 completo.
- Suite del parent tras commit: 870/870 (52 ficheros).

## Segunda revisión (candidato con sw v159)

- `f249a42` chore(sw): js/quiron-memory.js añadido a ASSETS (nuevo módulo
  importado por ui/quiron.js y context.js — sin él, el shell offline-first
  no lo cargaría) + CACHE_NAME v158→v159 por la regla de coherencia.
- review-e8ee3a070764f208: tier medium, lente review-reliability.
  **APPROVED**, autoridad quemada. 4 findings informativos (R3-001..004 en
  js/ui/quiron.js y js/quiron-memory.js) — trabajo futuro.
