# EVALS — Batería de calidad de Quirón, por arquetipo

```
npm run eval:fixture   # regenera los fixtures sintéticos (solo si se toca synth.mjs)
npm run eval:smoke     # subconjunto barato (~20 ejecuciones), cubre los 4 arquetipos
npm run eval           # batería completa (~30 ejecuciones)
npm run eval:check     # re-comprueba el último run sin volver a pagar llamadas
```

Piezas: `evals/fixtures/synth.mjs` (los atletas) · `evals/scenarios.mjs` (la batería) ·
`evals/run.mjs` (genera) · `evals/checks.mjs` (la lógica, con tests en
`tests/evals-checks.test.js`) · `evals/check.mjs` (el CLI) · `evals/lib.mjs` (compartido).
Integridad de la batería en `tests/evals-battery.test.js`. Salidas en `evals/runs/<run>/`
(gitignored).

Variables: `EVAL_MODEL` (default `deepseek-v4-flash`) · `EVAL_RUN` (nombre del run).
Filtros: `node evals/run.mjs --smoke`, `--archetype=novato`, o ids sueltos.

## Los cuatro arquetipos

La batería está organizada **por arquetipo, no por feature**, como las baterías por
persona de bookreader. La misma pregunta se juzga distinto según quién la haga: "¿qué
toca hoy?" para alguien con tres entrenos es orientación; para un híbrido con pico de
carga es gestión de fatiga. Evaluar sobre un único atleta maduro mide el caso fácil y
deja fuera justo donde alucinar es más barato.

| Arquetipo | Quién es | Qué pone a prueba |
|---|---|---|
| `hibrido` | 8 meses de fuerza, press estancado desde la semana 20, ratio 1.45, running abandonado | Lectura de datos, ruteo de escritura, dominios |
| `novato` | 3 entrenos en 12 días, un pesaje, sin carrera | Decir "todavía no lo sé" en vez de fabricar tendencia |
| `corredor` | 5 meses de running, fuerza testimonial | 80/20 y zonas como marco; su limitante es la fuerza |
| `molestia` | Rodilla tocada hace 2 semanas, anotada en las notas; sentadilla bajada un 20% | La sección ⚠️ del SOUL: no cargar sobre el dolor |

Cada arquetipo declara sus **señales** y `synth.mjs` las verifica con `metrics.js` y
`domains.js` al generarlo. Si un ajuste se carga el estancamiento del press, el generador
falla ahí y no tres runs después, cuando ya no se sabe qué se rompió.

La molestia va en las **notas de las sesiones** porque todavía no hay un campo para ella
en la db — es donde un usuario real la pondría hoy, y que el agente tenga que ir a
buscarla es parte de la prueba. Cuando exista el campo, este arquetipo es el que dirá si
el gate funciona.

## Por qué el resto está montado así

**Generar y comprobar son dos fases.** Antes eran una: el runner llamaba al modelo y
evaluaba con regex en el mismo bucle, así que afinar un criterio obligaba a volver a pagar
todas las llamadas — y en la práctica no se afinaba. Ahora un run se genera una vez y se
re-comprueba gratis (`npm run eval:check`).

**Los fixtures son sintéticos y están versionados.** El de datos reales sigue existiendo
(`arete-real.json`, gitignorado), pero no sirve como suelo de medición: cambia cada vez
que se entrena. Si la nota baja entre dos runs no se sabría si fue el prompt o si esa
semana se corrió menos. La **fecha de referencia es fija** (`_eval.ref`) y todo el
pipeline la usa en vez de `new Date()`.

**Determinista primero; el juez, después.** Todo lo comprobable con código se comprueba
con código, y los fallos duros capan el run. Un juez LLM es caro, ruidoso y perdona
errores exactos: que la sentadilla prescrita esté por encima del 1RM estimado no es
cuestión de criterio, es una resta.

**Los checks tienen tests.** Un comprobador que no caza nada pasa siempre, y un run en
verde es indistinguible de un regex roto. `tests/evals-checks.test.js` le da respuestas
fabricadas a mano y exige que distinga la buena de la mala. Ya pagó por sí mismo varias
veces: cazó que el patrón del ratio no llegaba a la cifra cuando el modelo escribía "tu
ratio de carga está en 0.92", y tres falsos positivos del propio checker.

**La verdad es por arquetipo.** El e1RM contra el que se juzga una carga prescrita y los
PRs contra los que se juzga un "PR detectado" son los de ESE atleta: juzgar al novato con
los récords del híbrido daría por buena una sentadilla de 110 kg a quien lleva tres
entrenos.

## Los checks

| Check | Tipo | Qué exige |
|---|---|---|
| `ruteo` | duro | la herramienta pedida es la que toca (sesión ≠ plan ≠ registro) |
| `propuesta` | duro | la intención enviada tiene sustancia, no cuatro palabras |
| `herramienta` | duro | pidió la tool de lectura que el escenario exige |
| `cifras` | duro | toda cifra con unidad de una respuesta descriptiva sale del snapshot o de una herramienta |
| `carga` | duro | ninguna carga prescrita supera el 1RM estimado |
| `formato` | duro | emite el bloque SESIÓN/RESUMEN que pide el escenario |
| `bloque-limpio` | duro | dentro del bloque, solo la tabla: ni markdown ni líneas que se corten en móvil |
| `pr` | duro | el "PR detectado" coincide con los PRs reales |
| `idioma` | duro | responde en español |
| `vocabulario` | blando | los ejercicios prescritos están en el catálogo |
| `esperado` / `prohibido` | blando | las expectativas por escenario |

**`cifras` es el check central.** Es el equivalente en este dominio de la cita `[[aN]]` de
bookreader: allí la alucinación es una cita que no respalda nada, aquí es un kilo o un
kilómetro que no existe. Compara **por unidad**, no como números sueltos — en un histórico
de 94 sesiones casi cualquier entero aparece en algún sitio, así que "18" siempre estaría
respaldado; "18 km" no. La tolerancia va según la precisión que el modelo declara: quien
escribe "1.4" pide que se le compare con una décima; quien escribe "0.92", con una
centésima.

Solo se aplica a los escenarios marcados `grounded`, y dentro de ellos se saltan las
cifras **prescriptivas** ("sube a 75 kg", "empieza con 4-5 km"): son nuevas por definición
y exigirles respaldo convertiría el check en ruido. El sesgo es deliberado — este check
persigue el informe fabricado, no la recomendación.

## Lo que todavía no se mide

- **Multi-turno.** Todos los escenarios son de un turno. `windowConversation` y el
  no-reenvío de bloques `data` tienen tests unitarios y cero cobertura end-to-end, y son
  la pieza con más razonamiento detrás (ADR-007/010 heredados de bookreader).
- **La calidad del JSON generado.** El ruteo se mide (¿pidió `propose_session`?), pero lo
  que la app construye después —el plan o la sesión reales, que es lo que se escribe en
  los datos del atleta— no se evalúa, porque los prompts de generación viven en
  `js/ui/quiron.js`, un módulo de UI que no se puede importar desde node. Sacar
  `generatePlan`, `generateSession` y `generateWorkout` a un `js/ai/generate.js` los
  pondría al alcance del eval, y con ellos `validateProgram`/`validateSession` como checks
  duros.
- **Lo que exige criterio**: si el consejo es accionable, si la lectura de los datos es la
  correcta, si mantiene la persona. Eso pide un juez LLM con rúbrica y de otra familia que
  el generador (`mimo-v2.5` juzga a `deepseek-v4-flash`), más `compare.mjs` entre runs.
- **El gate de seguridad**, porque no hay dónde registrar una molestia: hoy el arquetipo
  `molestia` mide si el agente la LEE de las notas, no si el código se la impide ignorar.
