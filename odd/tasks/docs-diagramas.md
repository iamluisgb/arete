# Docs — diagramas para la documentación

Mejorar la documentación introduciendo diagramas Mermaid en los documentos
clave, sin reescribir la prosa existente. El contenido nuevo va en castellano
de España. Rama: `feat/docs-diagramas`.

## Tareas

- [x] 1. `AGENTS.md` — diagrama del turno de Quirón (snapshot → LLM streameado →
      tool calls locales → segunda vuelta) en la sección «Quirón (el agente)».
- [x] 2. `AGENTS.md` — diagrama del modelo de 7 dominios (derivadas vs. medidas,
      mínimo global, caducidad, `REP_CAP`) en «Los 7 dominios».
- [x] 3. `docs/EVALS.md` — diagrama del pipeline de evals (fixture sintético
      versionado → `run.mjs` genera → `check.mjs` comprueba; duros capan).
- [x] 4. `docs/SYNC-V2.md` — diagrama del ciclo pull → merge → push y del merge
      puro (convergencia, tombstones).
- [x] 5. Verificación: sintaxis Mermaid válida, prosa intacta, commits por unidad.

## Evidencia

Ejecutado por Claude Code (Opus 5.5) en terminal Orca
(`term_359b723d-bc41-473b-b9e8-cd5c1b38bce2`) sobre esta rama. Diff puramente
aditivo: 97 inserciones, 0 borrados. Bloques mermaid: 2 en AGENTS.md, 1 en
docs/EVALS.md, 1 en docs/SYNC-V2.md.

- `b84cd67` docs(agents): add domain model flowchart to the 7 domains section
- `2d4e4e6` docs(agents): add Quiron turn sequence diagram
- `5d61856` docs(evals): add eval pipeline flowchart
- `2711c57` docs(sync): add pull-merge-push cycle flowchart

El agente corrigió tres imprecisiones del encargo contra el código real: los
volcados viajan como mensajes de herramienta y solo se guardan como `role: data`
en la conversación (donde los quita `windowConversation`); el 412 emulado es
releer la revisión remota antes del push (los Web Locks son el bloqueo entre
pestañas) y se comprueba antes del no-op por huella; y las propiedades del merge
son `A⊕B == B⊕A · A⊕A == A`, no una sola igualdad triple. Pendiente: PR y merge,
decisión del usuario.
