# Plan — Ontología de ejercicios

> Dotar a Areté de un catálogo estructurado de ejercicios (patrón, músculo, material, dominio)
> para cerrar el bucle diagnóstico → prescripción y arreglar la derivación de dominios.
> Estado por tarea: `pendiente` · `en curso` · `hecho` · `descartado`
> Esfuerzo: 🟢 barato · 🟡 medio · 🔴 costoso · ⭐ alto impacto

---

## Por qué

Hoy los ejercicios son **cadenas de texto libre**. Lo único estructurado es
[`js/exercise-media.js`](../js/exercise-media.js): 89 entradas con `alias`, `frames` y `tip`.
No existe patrón de movimiento, material, músculo, ni la arista ejercicio→dominio.

Tres consecuencias que ya se pagan:

1. **[`domains.js`](../js/domains.js) resuelve los básicos con cuatro regex** (`LIFT_PATTERNS`).
   Un front squat o un hex-bar deadlift no matchean: el atleta entrena y el perfil no se mueve.
   Es un bug de integridad en la fuente de verdad del producto, no una carencia del agente.
2. **`propose_session` no está anclado.** Ante "algo para mi punto débil, en casa", los
   ejercicios y el material salen de la cabeza del modelo. Nada comprueba que existan.
3. **No hay volumen por patrón.** "12 series de empuje contra 4 de tracción" es imposible
   de calcular porque la app no sabe qué es empuje.

## Decisiones ya tomadas (con las mediciones que las respaldan)

**Fuente: `free-exercise-db`, no wger.** 873 ejercicios, licencia Unlicense (dominio público),
campos uniformes: `force`, `mechanic`, `level`, `equipment`, `primaryMuscles`,
`secondaryMuscles`, `category`, `instructions[]`.
wger queda descartado: sus 644 traducciones al español no aportan nada —los 89 nombres en
español ya están en `alias`— y su CC-BY-SA 4.0 contaminaría el JSON derivado con share-alike.
Lo único exclusivo que ofrecía era `variation_group`, y no compensa la obligación.

**El mapeo se revisa a mano, entero.** Medición sobre los 89 ejercicios reales:
solo **24/89 (27%)** casan exacto tras normalizar. El emparejamiento difuso produjo pares
equivocados con alta confianza — `Remo con Barra → Curl con barra`,
`Plancha Abdominal → Crunch abdominal`, `Burpee con flexión → Burpees sin Flexión`.
**No se escribe un matcher por similitud de cadenas.** Un LLM propone, un humano confirma las 89.

**Vive en `js/`, no en `data/`.** El `PUBLIC` de [`scripts/build-pages.mjs`](../scripts/build-pages.mjs)
es lista blanca y no incluye `data/`: una carpeta nueva de primer nivel no se desplegaría.
`js/exercise-ontology.js` como módulo ES generado, mismo patrón que `exercise-media.js`.

**Los vocabularios son cerrados y pequeños:** 17 músculos primarios, 13 valores de material,
3 de `force`, 7 categorías. Se declaran como constantes y nada fuera de ellas es válido.

**El catálogo son los 89 de Areté, no los 873 de fedb.** Los 873 se quedan como cantera en el
script de build; al bundle solo van los que tienen ilustración y `tip` propios. Así todo lo que
Quirón puede proponer se puede pintar, el fichero se queda en decenas de KB en vez de ~350, y
cada alta pasa por criterio humano. El coste —Quirón no puede prescribir fuera del catálogo— es
justo la propiedad que hace que el check `catalogo` de F5 signifique algo. Reversible: ampliar
es cambiar un filtro en el script y curar las altas nuevas.

**No hay conexión en runtime.** El grafo viaja dentro del bundle como módulo ES precacheado y se
consulta con `Map`/índices invertidos en memoria. Las únicas conexiones de red son de build
(fedb, una vez) y de autoría (OpenAlex, F6), y ambas corren fuera de la app — mismo patrón que
ya se usó con RepDB en `exercise-media.js`. Reconsiderar solo si aparecen miles de ejercicios,
contribuciones de usuarios que moderar, o estadísticas cruzadas entre atletas: ninguna de las
tres está en el roadmap, y las tres rompen el offline-first antes que el modelo de datos.

---

## F0 — Esqueleto y vocabularios 🟢

- [ ] `tools/build-exercise-ontology.py` — baja `free-exercise-db`, cachea el JSON crudo.
- [ ] Definir en el propio script los vocabularios controlados:
  - `PATTERN`: `hinge · squat · lunge · push_h · push_v · pull_h · pull_v · carry · core · loco`
  - `EQUIPMENT`: mapeo de los 13 valores de fedb a los que Areté declara (barra, mancuerna,
    kettlebell, dominadas, ninguno, banco…). `other` y los 77 nulos se resuelven a mano.
  - `MUSCLE`: los 17 de fedb traducidos a español de entrenador (no latín).
- [ ] Esquema de salida por ejercicio:
  ```
  { id, name, aliases[], pattern, equipment[], primary[], secondary[],
    domains[], unilateral, mechanic, contraindications[], regression, progression, substitutes[] }
  ```

**Hecho cuando:** el script emite un `js/exercise-ontology.js` vacío pero válido y los tests pasan.

## F1 — Mapear los 89 🟡⭐ ← el trabajo real

- [ ] Generar una tabla de propuestas (LLM sobre nombre + alias + tip vs. los 873 candidatos),
      con el id de fedb sugerido y su confianza.
- [ ] **Revisar las 89 filas a mano.** Tres salidas por fila: id de fedb confirmado / entrada
      propia de Areté (los kettlebell del S&S y variantes que fedb no cubre) / descartado.
- [ ] Rellenar a mano los tres campos que ninguna fuente externa da:
  - `pattern` — derivable en borrador desde `force` + `equipment` + nombre, pero se confirma.
  - `domains[]` — la arista al producto. Es tuya por definición.
  - `regression` / `progression` / `contraindications` — criterio de entrenador.

**Hecho cuando:** los 89 tienen id, patrón y dominio; ninguno queda con confianza sin revisar.
**Riesgo:** es la fase que puede alargarse. Time-box: si un ejercicio no encaja en 2 minutos,
entrada propia de Areté y seguir.

## F2 — Cargar y exponer 🟢

- [ ] `js/exercise-ontology.js` generado y commiteado (está bajo `js/`, ya en `PUBLIC`).
- [ ] Helper `resolveExercise(name)` — de texto libre a nodo, vía `aliases` normalizados.
      Reutiliza la normalización que ya hace `exercise-media.js`.
- [ ] Subir `CACHE_NAME` en [`sw.js`](../sw.js) y añadir el fichero a `ASSETS`.

## F3 — Arreglar la derivación de dominios 🟢⭐ ← independiente, hazlo aunque pares aquí

- [ ] Sustituir `LIFT_PATTERNS` en [`domains.js`](../js/domains.js) por resolución vía ontología.
- [ ] Decidir y **documentar** qué hacen las variantes: o cuentan con coeficiente
      (front squat ≈ 0.85× back squat) o se declara explícitamente que no cuentan.
      Cualquiera de las dos es defendible; lo que no lo es es que dependa de la ortografía.
- [ ] Test de regresión: los cuatro básicos siguen derivando igual que hoy sobre el fixture.

**Hecho cuando:** `npm test` verde y el perfil del fixture no cambia salvo donde se quiso.

## F4 — Agente 🟡⭐

- [ ] Tool `find_exercises({ pattern, equipment, muscle, domain, evita })` en
      [`js/ai/tools.js`](../js/ai/tools.js) — devuelve solo ejercicios del catálogo.
- [ ] Tool `explain_exercise(name)` — sustitutos, regresión/progresión, contraindicaciones.
- [ ] `propose_session` / `propose_program`: el `goal` debe citar ejercicios resueltos.
      Actualizar `GATHER_INSTRUCTION` (vive en `tools.js`, no en la UI, para que los evals
      prueben el prompt que corre de verdad).
- [ ] [`soul.js`](../js/ai/soul.js): la sección de SEGURIDAD pasa de intención a instrucción
      operativa — ante molestia, llamar a `explain_exercise` y proponer la regresión.
- [ ] Volumen por patrón en el snapshot ([`context.js`](../js/ai/context.js)), **calculado en JS**
      igual que el tonelaje, bajo la regla "cítalo, no lo derives tú".

## F5 — Evals 🟡⭐

- [ ] Check nuevo `catalogo` en [`evals/checks.mjs`](../evals/checks.mjs): todo ejercicio que
      Quirón nombre debe resolver contra la ontología y ser compatible con el material declarado
      en el escenario. Es el análogo del check `cifras` para el otro tipo de alucinación
      de este dominio: el ejercicio inventado o imposible.
- [ ] Escenarios en [`evals/scenarios.mjs`](../evals/scenarios.mjs): "sesión de pierna sin
      gimnasio", "me molesta el hombro, sustitúyeme el press militar", "qué hago para mi
      dominio limitante".
- [ ] **Test del check** en `tests/evals-checks.test.js` — un comprobador que no caza nada
      pasa siempre, y entonces el run en verde no significa nada.

## F6 — OpenAlex, para las referencias 🟢 ← paralelo, no toca la app

Independiente de todo lo anterior. Resuelve el bloque P3 de [`mejoras_arete.md`](../mejoras_arete.md)
(#8 Cejudo, #9/#10 Saeidifard vs Shailendra, #11 IDs de PMC).

- [ ] `tools/verify-refs.py` — dado un claim, consulta `api.openalex.org` (CC0, sin API key)
      y devuelve título, año, revista, DOI y citas.
- [ ] Pasar por él las referencias vivas de `blog/8-dominios.html`.
- [ ] Es **herramienta de autoría**: la app no llama a OpenAlex en runtime.

Probado ya: la consulta del weight-bearing lunge test (mejora #4) devuelve Bennell et al. 1998,
*Australian Journal of Physiotherapy* (663 citas) y la revisión sistemática de 2015 en
*Manual Therapy* (262 citas), con DOI.

---

## Orden recomendado

**F6** primero: es barato, no toca la app y cierra deuda ya escrita.
**F3** después, incluso si el resto se aparca — es un bug del núcleo, no una feature.
**F0→F1→F2** es el bloque de datos, y F1 domina el coste.
**F4→F5** solo con F1 cerrada: un agente apoyado en un catálogo a medio mapear es peor que
el de ahora, porque suena anclado sin estarlo.

## Lo que este plan NO arregla

- **La calibración solo para hombre de ~75 kg** (`mejoras_arete.md` #7). Sigue siendo el
  agujero de producto más caro y ninguna ontología de ejercicios lo toca.
- **La exactitud numérica.** Ya es exacta; `metrics.js` calcula en JS.
- **Running.** Intacto. Toda la ganancia está en el lado de fuerza.
- **Latencia y coste por turno.** Ligeramente peor: una tool más y más contexto.

## Atribución

`free-exercise-db` es Unlicense (dominio público): no exige atribución y no impone
share-alike sobre el JSON derivado. Aun así, citar la fuente en la cabecera del fichero
generado, igual que se hace con RepDB en `exercise-media.js`.
