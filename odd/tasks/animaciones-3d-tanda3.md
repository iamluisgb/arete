# Areté: continuar las animaciones 3D de ejercicios (tanda 3)

Trabajas en el repo de Areté (PWA vanilla JS, público en GitHub), en un worktree tuyo.
Lee primero AGENTS.md del repo (manda) y `~/workspace/memory/arete-animaciones-3d.md`.

## Estado
- 20 ejercicios con 3D en producción (tanda 1: sentadillas y bisagras; tanda 2: press militar,
  thruster KB, remo con barra, curl, curl invertido, encogimientos). Motor en `js/anim3d/`
  (stage, figure, poses, props, catalog, sheet), un patrón por fichero en `js/anim3d/patterns/<x>.js`,
  `poses.js` exporta las piezas. Fotogramas para la app en `assets/anim3d/frames/<id>-{0..3}.webp`.
  Revisión visual en `demo-3d/review.html`. Tests: `npm test` (incluye `tests/anim3d-catalog.test.js`).
- Tanda 3 empezada y abandonada el 28-oct sin commitear: banco, barra de dominadas y paralelas en
  `props.js`, más cambios en `figure.js` y `poses.js`. Está en el parche
  `~/workspace/scratch/arete-anim3d-tanda3-wip.patch`. **Aplícalo lo primero** (`git apply`) y
  continúa desde ahí; no lo tires sin leerlo.

## Antes de empezar: ¿se usa el 3D?
Mira en Umami el evento «Abrir 3D» (hostname `arete.raiatech.com`, desde el 28-oct). Acceso en
`~/workspace/memory/umami-fnf-acceso.md` (credenciales en `~/workspace/.secrets`; nunca imprimas
valores). Apunta en tu informe final cuántas aperturas hay y de qué ejercicios. Si no hay datos,
sigue igualmente: Luis ha pedido continuar.

## Tarea: tanda 3
Press banca, dominadas, fondos en paralelas, flexiones y plancha (con sus variantes del catálogo:
mira qué nombres de ejercicio existen en los programas y en `js/anim3d/catalog.js`). Necesitan banco,
barra fija, paralelas y un cuerpo tumbado o colgado.
- Un patrón por fichero en `js/anim3d/patterns/`; mapear los nombres en `catalog.js`.
- Cero choques: mide la interpenetración como en las tandas anteriores (ninguno por encima de 1 cm),
  articulaciones dentro de sus límites, manos que agarran de verdad la barra o el banco, encuadre
  propio si el cuerpo está tumbado o colgado.
- Genera los 4 fotogramas webp de cada ejercicio nuevo, igual que los existentes.
- Revisa TÚ las capturas de cada ejercicio (desde frente, lateral y 3/4) antes de darlo por bueno:
  técnica correcta (escápulas en banca, rango completo en dominadas, codos en fondos, cuerpo recto en
  flexiones y plancha).
- Si un ejercicio sale mal tras varios intentos, déjalo fuera y explícalo; mejor 3 bien que 5 regular.

## Reglas
- Commits pequeños, en español, como el historial reciente («Ejercicios 3D: …»). Nada de secretos.
- Sube `CACHE_NAME` en `sw.js` y añade a `ASSETS` los ficheros nuevos que haya que precachear.
- Al terminar: `npm test` en verde (salvo `evals/fixtures/arete-real.json`, que es privado y no está
  en esta máquina), y deja la rama lista para fusionar. **No fusiones a main, no hagas push a main y no
  despliegues**: Luis revisa antes. Puedes hacer push de tu rama si quieres que la vea en GitHub.
- Informe final en español, corto: qué ejercicios quedan hechos, cuáles no y por qué, datos de Umami,
  y la ruta a las capturas de revisión.
