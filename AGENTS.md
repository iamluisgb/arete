# AGENTS.md — Areté

PWA de entrenamiento híbrido (fuerza + resistencia). 100% frontend, vanilla JS con módulos ES,
sin build step: lo que hay en el repo es lo que se sirve.

## Desarrollo
- Servir en local: `python3 -m http.server` y abrir `index.html` (landing) o `app.html` (la app).
  Hace falta un servidor: los módulos ES y el service worker no funcionan con `file://`.
- `npm test` — vitest sobre `tests/` (jsdom). `npm run test:watch` para iterar.
- **Al iterar en el navegador, el service worker sirve la versión cacheada** y tus cambios en
  `js/` no aparecen. Desregístralo y vacía cachés desde DevTools, o abre desde otro puerto.

## Los 7 dominios — el núcleo del producto

Areté no es un tracker: mide **7 dominios de rendimiento** y tu nivel es **el más bajo**. La
tesis está argumentada en [`blog/8-dominios.html`](blog/8-dominios.html) y es código en
[`js/domains.js`](js/domains.js), que es la **fuente de verdad del perfil**.

Dos reglas que no se negocian, porque son el producto:
1. El nivel de un dominio es el **mínimo** de sus métricas (un OHP rezagado no se disuelve en
   una media).
2. El nivel global es el **mínimo de los dominios medidos**. Los que faltan **no** cuentan como
   nivel 0 — eso convertiría cualquier perfil incompleto en nivel I; el perfil se marca
   `provisional` en su lugar.

Las métricas llegan por dos vías y la UI distingue una de otra:
- **Derivadas** — salen solas de lo ya registrado: los cuatro básicos en ratio al peso corporal
  (Epley + el peso más reciente de `bodyLogs`), las dominadas sin lastre del historial y el
  mejor 5K de `runningLogs`. Sin peso corporal no hay ratios de fuerza, y el perfil lo dice.
- **Medidas** — `db.domainTests`, un registro por métrica con su fecha. Caducan (6 semanas los
  tests baratos, 10 los caros). Un test manual **siempre gana** a la derivación.

**Epley no estima por encima de 12 reps** (`REP_CAP`, en `js/domains.js` y en
[`js/ai/metrics.js`](js/ai/metrics.js)): devuelve `null` y la serie no cuenta. Por encima de ahí
las fórmulas divergen a doble dígito y el número habla de capacidad de trabajo, no de fuerza
máxima — un OHP de 45 kg × 20 sale a 75 kg, que para un atleta de 75 kg es 1.00×BW, nivel V. Y
como la derivación se queda con el **máximo histórico**, una sola serie de volumen fija la
métrica para siempre. El daño no es un número feo: infla un dominio, el mínimo global se va a
otro sitio y el perfil deja de señalar la debilidad real, que es lo único que hace. Si por el
tope no queda ninguna serie estimable de un básico, `unratedLifts()` lo detecta y el perfil lo
dice — un dominio vacío sin explicación se lee como un fallo de la app.

Un test manual guarda **una fila por métrica, con ids distintos**: el merge de Drive deduplica
por id y tres McGill con el mismo id se comerían entre ellos.

Los umbrales están calibrados para hombre de ~75 kg. Está declarado en pantalla
(`CALIBRATION_NOTE`), no solo en el blog: falta la columna femenina (ver `mejoras_arete.md` #7).

## Navegación

`Hoy · Entrenar · Perfil · Cuerpo · Más`.

**Entrenar** contiene fuerza y carrera como dos modos (`#secStrength` / `#secRunning`, clase
`.train-panel`), no como dos secciones. El modo vive en `areteTrainMode` y `switchStrTab()` lo
fuerza a fuerza, que es lo que usan "Iniciar sesión" y Quirón. `migrateLastTab()` traduce las
pestañas viejas (`secStrength`/`secRunning`) — no la borres o los usuarios existentes abrirán la
app en una sección que ya no existe.

## Progresión: qué peso toca hoy

[`js/progression.js`](js/progression.js) decide la carga de cada ejercicio de series y **dice
por qué**. Antes el prefill copiaba la última sesión tal cual, así que el peso no se movía solo
nunca; la regla de subir vivía únicamente en el prompt de Quirón, donde no es determinista ni
testeable.

Todo es **función pura del historial: nada se escribe de vuelta en un entreno terminado**.
Corregir una serie mal tecleada arregla el objetivo siguiente al instante, y cambiar el plan no
obliga a migrar nada, porque no hay contadores guardados que se desincronicen.

Lo que no es obvio y hay que respetar:

- **Areté no guarda la prescripción con el entreno**, así que el historial se juzga contra el
  objetivo del plan de HOY. Por eso **un estancamiento es fallar al MISMO peso**, no fallar sin
  más: sin esa condición, cambiar un plan de 3×5 a 3×10 relee todo el histórico como fallado y
  recibe al atleta con "18 sesiones seguidas — descarga".
- **La carga registrada manda sobre el nombre.** "Squat" dentro de `kettlebell.json` se
  clasifica como pesa rusa, pero quien registra 100 kg usa una barra: sin la comprobación
  (`onBellLadder`) el salto sería de 4 kg y la descarga lo mandaría de 100 kg a 48.
- **Una pesa rusa sube de pesa en pesa** (`BELLS`), no de 2,5 en 2,5. El programa de kettlebell
  es real y sus 101 series están todas en un solo bell de 20 kg.
- **La subida no se cuadra a la rejilla del salto**: 42,5 + 5 son 47,5, no 50. El atleta ya
  estaba en un peso cargable. El redondeo solo hace falta en la descarga.
- **Un aguante cronometrado se cuela en el campo de reps** (`2min`, `1min/lado`): sin
  descartarlo, una plancha se lee como "2 repeticiones", se cumple siempre y el motor le sube
  el peso a un ejercicio que no lleva peso.
- El hilo de progresión es **(ejercicio, objetivo de reps)**: una sentadilla es la misma salga
  en la Sesión A o en la B, pero 3×5 y 3×10 no se mezclan.
- **No toca los modos que no son de series** (`rounds`, `amrap`, `emom`, `tabata`…): ahí el
  resultado es un tiempo o un total, y una regla inventada sobre eso sería ruido.

El `por qué` se enseña siempre junto al peso (`.prog-why`). Un número que aparece solo y no se
explica es un número que se deja de creer — y se borra.

## Running: se importa, no se trackea

Areté no compite en tracking GPS contra Strava y Garmin. El tracker se ofrece **solo donde el
sistema operativo deja cumplirlo**, detrás de `canTrackRuns()` ([`js/platform.js`](js/platform.js)):
en el wrapper nativo hay foreground service; en el navegador `watchPosition` se estrangula en
segundo plano.

La entrada de datos es **importar > manual > GPS**. [`js/ui/run-import.js`](js/ui/run-import.js)
lee GPX y TCX con el `DOMParser`, sin dependencias. Los `.FIT` son binarios y todavía no se
leen; se detectan por extensión antes de parsear para poder decir "expórtalo como GPX".

Todo lo demás de running (plan, calendario, historial, progreso, PRs, zonas) trabaja sobre
`db.runningLogs`, **no sobre el tracker**: por eso importar basta para que nada se pierda.

## Despliegue

Cloudflare Pages, proyecto **`arete`** de *direct upload* (no está conectado a GitHub: no hay
deploy automático al hacer push; se despliega a mano). Mismo esquema que bookreader.

```
npm run deploy:pages
```

Construye `dist/` y lo sube. Tres cosas que conviene tener claras:

- **El origen es HEAD, no el disco.** El build sale de `git archive HEAD`, así que lo que tengas
  sin commitear no se despliega — el script avisa de esos ficheros antes de seguir.
- **Rechaza un HEAD que no esté en `origin/main`**, para que nunca haya en producción código que
  no exista en el remoto. Escape: `DEPLOY_ALLOW_UNPUSHED=1`.
- **Lista blanca**, en `PUBLIC` dentro de [`scripts/build-pages.mjs`](scripts/build-pages.mjs).
  El repo tiene tests, evals, tools, prototipos y notas de trabajo que no deben publicarse, y
  copiar la raíz entera los publica todos. **Si añades un fichero o carpeta de primer nivel que
  deba estar en producción, hay que añadirlo a `PUBLIC` o simplemente no se sube.**

El commit desplegado queda sellado en `dist/build.json` y se sirve como `/build.json`: eso
responde "¿qué hay ahí fuera ahora mismo?" sin comparar ficheros a ojo.

`npm run build:preview` construye desde el árbol de trabajo (incluye lo no commiteado). Solo
para mirar `dist/` en local; no lo despliegues.

Al tocar ficheros precacheados hay que subir `CACHE_NAME` en [`sw.js`](sw.js) y añadirlos a
`ASSETS`, o los clientes instalados seguirán con la versión vieja.

### Dónde vive
- `https://arete-6a8.pages.dev` — el deploy de Cloudflare Pages.
- `https://arete.raiatech.com` — dominio de producción. El DNS de `raiatech.com` está en
  **Namecheap**, no en Cloudflare: el CNAME hacia `arete-6a8.pages.dev` se añade a mano allí.
- `https://luisgonzalezbernal.com/arete/` — GitHub Pages, sigue vivo sirviendo la raíz del repo
  desde `main` (todo el repo, sin lista blanca). Los `canonical`/`og:url` aún apuntan aquí.

## Quirón (el agente)

Chat con el atleta sobre sus propios datos. Dos capas de contexto, como el agente de
bookreader: un **snapshot** del estado actual siempre presente
([`js/ai/context.js`](js/ai/context.js)) y **herramientas** de lectura para excavar en el
histórico bajo demanda ([`js/ai/tools.js`](js/ai/tools.js)). Un turno = **una llamada
streameada con las herramientas puestas** (`chatAgent` en [`js/ai/llm.js`](js/ai/llm.js)): si
el snapshot basta, ahí acaba; si el modelo pide herramientas, se ejecutan en local y una
segunda vuelta streamea la respuesta con los resultados dentro.

**Demo sin API key.** "Configura tu proveedor y consigue una clave" antes de haber visto
lo que hace el coach es pedir trabajo por adelantado, y ahí se cae casi todo el mundo. El
botón *Probar Quirón* pide un token al **gateway de bookreader**
(`workers/gateway` en aquel repo, ADR-021) y autoconfigura los tres slots; el atleta no ve
token ni URLs. Lo que hay que saber:

- El gateway ata cada token a su **producto**: los de arete solo pueden usar los alias
  `arete-fast` / `arete-vision` (que apuntan a deepseek-v4-flash y qwen3.6). Por eso
  `requestDemoToken` manda `{"product":"arete"}` — sin eso emitiría un token de bookreader,
  inservible aquí. Es también lo que permite saber cuánto consume cada app (`product_stats`).
- **El token no se enseña nunca** en el campo de clave, y guardar Ajustes sin clave escrita
  conserva la demo en vez de moverla. Se enseñaba en bookreader, y "Guardar" mandaba el
  token del gateway al proveedor del desplegable: 401 en todo, con el usuario convencido de
  que la clave de la demo nacía rota. `llm.js` además **repara ese estado al cargar** (un
  token `br-` con otra base URL no puede venir de otro sitio).
- El cupo es por red y día **por producto**: probar bookreader no te deja sin probar arete.

Prácticas que sostienen esto, y por qué:

- **Presupuesto de contexto por turno.** Solo viajan los últimos `HISTORY_MSGS` mensajes, y
  los volcados de herramientas (`role: 'data'`) de turnos anteriores **no se reenvían** — el
  modelo puede volver a pedirlos. Sin esto la conversación crece sin techo: se paga cada
  volcado viejo en cada turno posterior y se diluye la atención del modelo. Por encima de
  `TOKEN_GUARD` se pregunta antes de enviar.
- **Cola de dos carriles** en [`js/ai/llm.js`](js/ai/llm.js): lo interactivo adelanta a lo de
  fondo (`background: true`), y la concurrencia real depende del proveedor — solo se declara
  `concurrent` donde está verificado; ante un BYOK desconocido se serializa. Hoy **nada** está
  marcado como `background`; el carril existe para que la primera tarea larga que se añada no
  deje el chat esperando detrás.
- **Probar cada slot de modelo con una llamada de su tipo** (`probeModel`): el slot de visión
  se prueba con una imagen de 1×1. Un id mal escrito, si no, deja la feature "activada" y
  fallando el día que el atleta le hace la foto a su entreno.
- **Reintentos con backoff** honrando `Retry-After`, y "Continuar" cuando el proveedor corta
  por longitud (`finish_reason: 'length'`).
- **Los prompts que rutean viven fuera de la UI**, para que los evals prueben exactamente el
  prompt que corre en la app. Hoy están en el SOUL ([`js/ai/soul.js`](js/ai/soul.js),
  *CUÁNDO USAR CADA HERRAMIENTA DE ESCRITURA*): el ruteo entre sesión / plan / entreno
  registrado es lo único que separa esto de un generador de ruido.
- **El protocolo de dos fases se retiró el 2026-08-07** (recolección no-streaming que acababa
  en `"LISTO"` + llamada aparte para responder). Costaba 3-4 llamadas por turno y 13-22 s de
  espera ciega antes del primer token, y su regla central era un contrato en lenguaje natural
  que el propio prompt admitía que se podía perder. La premisa heredada de bookreader —"nan
  solo emite tool_calls fiables sin streaming"— se volvió a medir y ya no se cumple.
  `evals/probe-latency.mjs` es la sonda que lo decidió: repítela al cambiar de modelo o de
  proveedor, porque es la única forma de saber si uno "más rápido" lo es aquí.
- **Evals en dos fases** (`npm run eval`, detalle en [`docs/EVALS.md`](docs/EVALS.md)): `run.mjs`
  genera contra un **fixture sintético versionado** con fecha de referencia fija, y `check.mjs`
  comprueba. Separadas porque afinar un criterio no debe costar otra ronda de llamadas, y el
  fixture es sintético porque el real cambia cada vez que se entrena: sin fixture fijo dos runs
  no son comparables y los evals no deciden nada. Los fallos duros capan el run.
- **La alucinación de este dominio es el número inventado**, no la cita falsa: el check `cifras`
  exige que toda cifra con unidad de una respuesta descriptiva salga del snapshot o de un
  resultado de herramienta. Es el equivalente del `[[aN]]` de bookreader.
- **Los checks tienen tests** (`tests/evals-checks.test.js`): un comprobador que no caza nada
  pasa siempre, y entonces un run en verde no significa nada.

## Google Drive

Copia de seguridad y sync automático contra la carpeta `appDataFolder` del usuario.

- [`js/drive-auth.js`](js/drive-auth.js) — autorización: **authorization-code + PKCE**. El
  `refresh_token` vive en localStorage y el access token solo en memoria, renovado en silencio.
  Es lo que hace que la sincronización automática siga funcionando pasada la primera hora; el
  implicit flow anterior daba tokens de 1h sin renovación, así que el "auto-sync" moría solo.
- [`auth/callback.html`](auth/callback.html) — destino del popup de Google; devuelve el código
  por `BroadcastChannel` y se cierra.
- [`workers/auth/`](workers/auth/) — Worker `arete-auth`, gemelo del de bookreader. Custodia el
  `client_secret` (el navegador no puede) y hace de intermediario con Google. No guarda nada.
  Deploy: `npx wrangler deploy --cwd workers/auth`. El secreto:
  `npx wrangler secret put GOOGLE_CLIENT_SECRET --cwd workers/auth`.
- [`js/drive.js`](js/drive.js) — llamadas a la API. Un 401 renueva el token y reintenta una vez;
  solo si vuelve a fallar se considera permiso perdido y se pide reconectar.

**Cada origen nuevo desde el que se sirva la app** hay que darlo de alta en el OAuth client de
Google Cloud Console, y en dos sitios distintos: **orígenes JavaScript autorizados** y **URIs de
redirección autorizados** (`<origen>/auth/callback.html`). Además hay que añadirlo a
`ALLOWED_ORIGINS` en [`workers/auth/wrangler.toml`](workers/auth/wrangler.toml) y redesplegar el
Worker, o el CORS lo rechaza con un 403.
