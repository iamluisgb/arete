# EVALS — Cómo se mide Quirón

```
npm run eval:fixture   # regenera el fixture sintético (solo si se toca synth.mjs)
npm run eval           # genera un run y lo comprueba
npm run eval:check     # re-comprueba el último run sin volver a pagar llamadas
```

Piezas: `evals/fixtures/synth.mjs` (el atleta) · `evals/scenarios.mjs` (qué se pregunta) ·
`evals/run.mjs` (genera) · `evals/checks.mjs` (la lógica, con tests en
`tests/evals-checks.test.js`) · `evals/check.mjs` (el CLI) · `evals/lib.mjs` (compartido).
Salidas en `evals/runs/<run>/` (gitignored).

Variables: `EVAL_MODEL` (modelo a evaluar, default `deepseek-v4-flash`) ·
`EVAL_FIXTURE` (`synth` | `real`) · `EVAL_RUN` (nombre del run).

## Por qué está montado así

**Generar y comprobar son dos fases.** Antes eran una: el runner llamaba al modelo y
evaluaba con regex en el mismo bucle, así que afinar un criterio obligaba a volver a
pagar todas las llamadas — y en la práctica no se afinaba. Ahora un run se genera una vez
y se re-comprueba gratis las veces que haga falta (`npm run eval:check`).

**El fixture es sintético y está versionado.** El de datos reales sigue existiendo
(`EVAL_FIXTURE=real`), pero no sirve como suelo de medición: está gitignorado —el repo es
público— y, peor, cambia cada vez que se entrena. Si la nota baja entre dos runs con el
fixture real no se sabe si fue el prompt o si esa semana se corrió menos. Sin fixture fijo
no hay comparación, y sin comparación los evals no deciden nada.

El atleta sintético lleva **plantadas** las señales que los escenarios interrogan, y
`synth.mjs` las **verifica con metrics.js** al generarse: press de banca estancado desde
la semana 20, pico de carga (ratio 1.45) en la última semana, cero carrera en 33 días,
PRs recientes de sentadilla y peso muerto. Si un cambio en el generador se carga una
señal, el generador falla ahí y no tres runs después.

La **fecha de referencia es fija** (`_eval.ref`) y todo el pipeline la usa en vez de
`new Date()`. Sin eso, "esta semana" se movería solo cada mañana.

**Determinista primero; el juez, después.** Todo lo comprobable con código se comprueba
con código, y los fallos duros capan el run. Un juez LLM es caro, ruidoso y perdona
errores exactos: que la sentadilla prescrita esté por encima del 1RM estimado no es
cuestión de criterio, es una resta. (El juez con rúbrica es el siguiente paso, ver abajo.)

**Los checks tienen tests.** Un comprobador que no caza nada pasa siempre, y un run en
verde es indistinguible de un regex roto. `tests/evals-checks.test.js` le da respuestas
fabricadas a mano y exige que distinga la buena de la mala. Ya pagó por sí mismo: cazó que
el patrón del ratio no llegaba a la cifra cuando el modelo escribía "tu ratio de carga
está en 0.92", con lo que ese check no miraba nada.

## Los checks

| Check | Tipo | Qué exige |
|---|---|---|
| `ruteo` | duro | la herramienta pedida es la que toca (sesión ≠ plan ≠ registro) |
| `propuesta` | duro | la intención enviada tiene sustancia, no cuatro palabras |
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
cifras **prescriptivas** ("sube a 75 kg", "empieza con 4-5 km"): son nuevas por
definición y exigirles respaldo convertiría el check en ruido. El sesgo es deliberado —
este check persigue el informe fabricado, no la recomendación.

## Lo que todavía no se mide

- **La calidad del JSON generado.** El ruteo se mide (¿pidió `propose_session`?), pero lo
  que la app construye después —el plan o la sesión reales, que es lo que se escribe en
  los datos del atleta— no se evalúa, porque los prompts de generación viven en
  `js/ui/quiron.js`, un módulo de UI que no se puede importar desde node. Es la misma
  razón por la que `GATHER_INSTRUCTION` se sacó a `tools.js`. Sacar `generatePlan`,
  `generateSession` y `generateWorkout` a un `js/ai/generate.js` los pondría al alcance
  del eval, y con ellos `validateProgram`/`validateSession` como checks duros.
- **Lo que exige criterio**: si el consejo es accionable, si la lectura de los datos es la
  correcta, si mantiene la persona. Eso pide un juez LLM con rúbrica y de otra familia que
  el generador (`mimo-v2.5` juzga a `deepseek-v4-flash`), más `compare.mjs` entre runs.
- **La seguridad ante molestias**, porque todavía no hay dónde registrarlas.
