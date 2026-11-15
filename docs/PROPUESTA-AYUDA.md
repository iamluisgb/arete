# Propuesta de ayuda para Areté — qué copiar de la de FnF y qué no

*15-nov-2026 · Revisada la ayuda de FnF en producción (`fnfanalytics.com/ayuda/`, 200 OK: 33 páginas,
27 de ellas artículos) y el árbol que la genera (`agridashboard@docs/f0`: `mkdocs.yml`, `docs/`,
`hooks/procedencia.py`).
Contrastado con Areté hoy: `arete.raiatech.com/ayuda/` responde **404** y no existe ninguna guía en el repo.*

> **Estado a 15-nov-2026: implementado.** F0 (generador, 12 guías, procedencia, enlaces en las
> fricciones) y F1 (4 tutoriales, 7 explicaciones) completos; F2 (referencia generada y novedades) y
> la parte barata de F3 (ayuda en el punto de fricción, offline y `buscar_ayuda` con su check de
> eval) dentro. La fuente vive en `docs/ayuda/` y lo que se sirve, en `ayuda/`; el detalle operativo
> está en `AGENTS.md`. Sigue sin haber analítica ni capturas, a propósito.

---

## Veredicto

La ayuda de FnF no funciona por ser un help center: funciona porque detrás hay **una obligación externa
con fecha** (el cuaderno electrónico, los fitosanitarios de 2027) y **dos roles que la dividen** (quien
explota y quien lleva cartera). Eso da urgencia, orden y una razón para volver cada campaña.

Areté no tiene norma. Tiene **números que la app decide por ti** y que el atleta no puede auditar:
el nivel del perfil, el peso que toca hoy, la caducidad de un test, el `null` de Epley por encima de
12 repeticiones. Ahí está su ayuda. La tesis, en una línea:

> **La ayuda de Areté no documenta pantallas: documenta los números que la app decide por ti — y por
> qué se niega a decidir algunos.**

Se copia la **arquitectura** de FnF entera (dos puertas, ejes, Diátaxis, Procedencia, novedades como
colección, ayuda en el punto de fricción, docs como corpus del agente). Se sustituye el **motor**:
donde FnF pone el BOE, Areté pone la medición.

**Op1 (recomendada): 12 guías + 4 tutoriales + 7 explicaciones en F0–F1, referencia generada del
código en F2, y en F3 la ayuda como tercera capa de Quirón.** Detalle abajo.

---

## 0. Lo que hay hoy en FnF (lo revisado, con números)

| Pieza | Qué es | Por qué funciona |
|---|---|---|
| Portada | 6 tarjetas por tarea + «Según el momento» | Entra por *lo que quiero hacer*, no por el índice |
| 13 guías prácticas | Una tarea, un artículo, pasos numerados | El 80 % del uso real |
| 4 tutoriales | «Tu primer día», «Tu primer SIEX», «Tu primera cartera», «Tu primer parte en 2 min» | Un tutorial por rol; el del operario es de 2 minutos |
| 5 explicaciones | Obligatorio y cuándo, qué es el CUE, cómo se calcula el coste, reparto entre cultivos, qué pasa con tu dictado | El porqué de las cosas, sin pasos |
| 5 referencias | Objetos y campos (generada), tipos de parte R001–R005, vademécum, roles, API BI | Datos exactos, no tutoriales |
| Novedades | Dos motores: **producto** y **regulación** | Anti-«app abandonada» en un mercado quemado |
| Barra Procedencia | autor · revisado el · válido hasta | Una página caducada **se ve** caducada |
| Pie | «¿Te ha servido esta página?» 👍/👎 + mailto | El único canal de mejora sin analítica |
| Publicación | `fnfanalytics.com/ayuda`, mismo dominio, MkDocs `strict: true` | SEO long-tail que alimenta la landing |

Tres decisiones de FnF que hay que copiar sin discutir: la ayuda **se lee antes de tener cuenta**, el
build **falla si un enlace está roto** (`strict`), y **no hay PDF ni FAQ suelta** — la FAQ de la
landing no sustituye a la ayuda, la alimenta.

---

## 1. Diagnóstico de Areté: mucho material suelto, ninguna ayuda

| Lo que ya existe | Dónde | Sirve como ayuda |
|---|---|---|
| 8 artículos de blog (8 dominios, programa, kettlebell, crear plan, nutrición, suplementos, filosofía) | `blog/` | **No**: son ensayos. Explican el *porqué* del método, no *cómo* hacer algo hoy |
| 5 blueprints (sueño, recuperación, movilidad, breathwork, digital detox) | `blueprints/` | **No**: son protocolos, no producto |
| 7 preguntas frecuentes | `index.html` (landing) | **No**: venden, no resuelven |
| El porqué del peso en cada ejercicio (`.prog-why`) | `js/ui/training.js` | **Sí, y muy bien** — pero sin enlace al que ampliar |
| Nota de calibración en el perfil (`CALIBRATION_NOTE`) | `js/ui/profile.js` | **Sí**: honestidad que ningún competidor tiene |
| Aviso de básicos no estimables (`unratedLifts`) | `js/ui/profile.js` | **Sí**: pero solo dice que el dominio está vacío |
| Hoja de atajos (`?`) | `js/ui/shortcuts.js` | **Sí**: ya es una página de referencia, sin URL |
| «Empieza por aquí» — 3 pasos que se marcan solos | `js/ui/dashboard.js` (`dash-starter`) | **Sí**: es la checklist de Shopify, ya viva |
| Quirón | `js/ai/` (14 tools, 11 checks de eval) | **No**: responde, pero no tiene corpus que citar |

Y lo que no existe: **cero guías de tarea, cero referencia, cero novedades, cero búsqueda, cero
enlaces desde la app a nada que explique la app** (el único hash es `app.html#quiron`).

### Las siete fricciones reales (esto es el índice de la ayuda)

Están sacadas del código, no imaginadas. Cada una es un correo de soporte que hoy no tiene dónde
llegar:

1. **«He cambiado algo y no veo el cambio.»** El service worker sirve la versión cacheada
   (`AGENTS.md`, "Despliegue"): es el ticket nº 1 de toda PWA.
2. **«Mi nivel no sube.»** Cinco causas distintas: sin peso corporal no hay ratios; el básico no está
   en la ontología y devuelve `null` en silencio (R3-001 de `mejoras_arete.md`); más de 12 reps y
   Epley no estima (`REP_CAP`); el dominio nunca se midió; el test caducó (42/70 días).
3. **«El peso de hoy no ha subido.»** Un estancamiento es fallar **al mismo peso**; los modos que no
   son de series no llevan progresión; una pesa rusa sube de pesa en pesa, no de 2,5 en 2,5.
4. **«He perdido mis datos.»** Local-first, cambio de móvil, Drive, y el origen viejo
   (`luisgonzalezbernal.com/arete` → `arete.raiatech.com`).
5. **«Quirón me pide una clave.»** La demo es por red y día; `app.html#quiron` salta la bienvenida.
6. **«El GPS no graba con la pantalla apagada.»** `canTrackRuns()` solo es cierto en el wrapper
   nativo; en navegador `watchPosition` se estrangula.
7. **«No lee mi .FIT.»** Los `.FIT` se detectan por extensión antes de parsear, para poder decir
   «expórtalo como GPX».

Ninguna de las siete está escrita en ningún sitio. Eso es la ayuda de Areté.

---

## 2. El motor se sustituye, la arquitectura se copia

| FnF | Areté |
|---|---|
| Obligación legal con fecha (RD 1054/2022, fitosanitarios 1-ene-2027) | **La caducidad de la medida**: 42 días un test barato, 70 uno caro; el estancamiento |
| Dos roles: explotación / cartera | **Dos formas de usar**: entrenar / montarlo a tu manera |
| Ejes por cultivo (6–8) | **Ejes por dominio** (7) **y por material** (gimnasio, una pesa rusa, casa, sin material, solo correr) |
| Vademécum contra el MAPA | **Umbrales contra los normativos** (StrengthLevel, McGill 2015, Tsatsouline) |
| API de BI para desarrolladores | **Formato del plan JSON** y atajos de teclado |
| `mailto:hola@fnfanalytics.com` en el pie | **Hueco a decidir**: hoy no hay dirección de soporte (ver §14) |
| Capturas de pantalla del e2e | **Enlaces profundos** a la pestaña exacta (no hay e2e en Areté, y una captura de una PWA sin build caduca en un mes) |

---

## 3. Arquitectura de la información

**Ruta: `arete.raiatech.com/ayuda/`**, en el dominio principal. Areté tiene un solo dominio y el
long-tail de fitness es enorme («qué es el RIR», «cómo calcular tu 1RM», «nivel de fuerza relativa»,
«plan de fuerza en JSON»); un subdominio huérfano no recibe nada. La ayuda **se lee sin instalar**,
como la de FnF: es la página que decide si alguien prueba la app.

**Dos puertas**, antes que cualquier cuadrante:

| Puerta | Para quién | Primera promesa |
|---|---|---|
| **Quiero entrenar** (primaria) | El que abre la app y quiere entrenar hoy | De cero a primera sesión registrada y nivel leído |
| **Lo monto a mi manera** | El que trae su plan, su historial de otra app, o quiere que Quirón le lleve | Plan propio importado, o datos de fuera dentro |

No hay tres puertas. El que programa **no** es un rol distinto: es el mismo atleta con más intención
—y en Areté la intención es el producto («no entrenar *por* el atleta, sino ayudarle a entrenar»,
`js/ai/soul.js`).

**Ejes de entrada**, por encima de las colecciones:

- *Por momento*: «empiezo hoy» · «vengo de otra app» · «quiero medirme» · «quiero correr» ·
  «se me ha roto algo».
- *Por dominio*: fuerza máxima · tracción · glicolítico · cardio · resistencia de fuerza · core ·
  movilidad. Es el equivalente exacto de los cultivos de FnF, y ya es el esqueleto del producto.
- *Por material*: gimnasio completo · una pesa rusa · en casa · sin material · solo correr.

**Cuadrantes Diátaxis** — un artículo, un objetivo, un cuadrante:

| Cuadrante | Qué contiene | Regla |
|---|---|---|
| Tutoriales | Un primer éxito con checklist | Se puede terminar en una sesión |
| Guías prácticas | Una tarea, pasos numerados | <300 palabras antes del primer paso; si aparece «y también puedes», es otro artículo |
| Explicación | Los números y sus límites | Sin pasos. Es donde vive la honestidad del método |
| Referencia | Tablas exactas | **Generada del código**, no escrita a mano |
| Novedades | Producto + **método** | Cada cambio con la versión que describe |

**Colecciones por pantalla** (índice secundario, como los módulos de Odoo): Hoy · Entrenar (fuerza /
carrera) · Perfil · Cuerpo · Más.

---

## 4. F0 — las 12 guías prácticas

Ancladas a pantallas y controles que existen hoy. La tercera columna es la que hace que la guía sea
verificable: **qué se ve al terminar**.

| # | Guía | Cubre | La consecuencia visible | Si algo va mal |
|---|---|---|---|---|
| 1 | Registra tu primera sesión | Hoy → Iniciar sesión · `.set-runner` · Espacio | Aparece en Historial y el día se marca en el calendario | «No me deja terminar», serie a medias |
| 2 | Registra tu peso corporal | Cuerpo → nueva medida | Fuerza deja de estar sin medir: hay ratios | Sin peso no hay Epley: el perfil lo dice |
| 3 | Haz tu primer test de dominio | Perfil → Test | El perfil deja de ser *provisional* | Test a medias, dominio mal elegido |
| 4 | Lee tu nivel sin engañarte | Perfil | Sabes por qué tu nivel es el mínimo y qué falta | Provisional, caducado, `null` |
| 5 | Importa una carrera de otra app | Carrera → Importar (GPX/TCX) | El 5K entra en Cardio y en el mejor 5K | `.FIT` no se lee |
| 6 | Graba una carrera con el GPS | Carrera → Grabar | La sesión y el recorrido quedan guardados | En navegador no sigue en segundo plano |
| 7 | Elige tu plan y tu semana | Más → Tus planes · Programación semanal | «Hoy» te dice qué toca | Plan activo que no es el que crees |
| 8 | Escribe tu propio plan (JSON) | Más → Tus planes → Importar | El plan aparece con su nombre y se entrena | JSON inválido, ids de ejercicio inexistentes |
| 9 | Habla con Quirón sin configurar nada | `6` o `/` · `app.html#quiron` | El primer envío pide la demo y responde | Demo gastada, clave propia, `TOKEN_GUARD` |
| 10 | Copia de seguridad en tu Drive | Más → Copia de seguridad | Un segundo dispositivo ve lo mismo | Se pide reconectar, merge de dos copias |
| 11 | Trabaja sin conexión (y por qué no ves tus cambios) | Instalar la PWA | Entrenar y consultar funciona sin red | Service worker cacheado, versión vieja |
| 12 | Recupera tus datos del origen viejo | `luisgonzalezbernal.com/arete` | El historial aparece en el dominio nuevo | Enlace cortado a 48.000 caracteres, iframe inútil |

Cada guía termina con tres bloques fijos: **«Cómo sabes que funcionó»** (la consecuencia de la
columna 3), **«Si algo va mal»** (columna 4, con las cadenas literales que enseña la app) y
**«Relacionado»**. Es la estructura de la guía de dictado de FnF, que es la mejor del conjunto.

---

## 5. Tutoriales, explicación, referencia y novedades

**Tutoriales (F1).** Cuatro, uno por primer éxito:

1. **Tu primer día** — alineado uno a uno con «Empieza por aquí» (`dash-starter`: peso → test →
   sesión). La guía no inventa pasos: **reproduce la checklist que la app ya te está enseñando**, y
   añade el cuarto (leer el nivel) que la checklist no pide.
2. **Mide tus 7 dominios** — el recorrido completo, con qué es barato y qué es caro, y qué se puede
   dejar para la semana siguiente.
3. **Tu primera carrera importada** — de un GPX exportado de Strava/Garmin a tu mejor 5K.
4. **Tu primer plan propio** — de la plantilla vacía al plan entrenándose.

**Explicación (F1) — el corazón de la propuesta.** Siete páginas, todas sobre números que hoy no
tienen explicación fuera del código:

- Por qué tu nivel es el mínimo de tus dominios y no la media (y por qué los dominios sin medir no
  cuentan como cero).
- Cómo se calcula tu 1RM — y por qué por encima de 12 repeticiones la app **no da número** (`REP_CAP`).
- Cómo decide el peso de hoy, y por qué a veces no sube (estancamiento = mismo peso; una pesa rusa
  sube de pesa en pesa; los modos sin series no llevan progresión).
- Por qué caducan los tests (42 días los baratos, 70 los caros).
- **Qué mide Areté y qué no** — calibración sobre normativos de hombre de ~75 kg, el 0,7× de
  referencia femenina, S&S a 24/32 kg, sin wearables, sin nutrición. Es la página que nadie más
  escribe y la que más confianza genera.
- Dónde están tus datos y quién los ve — local-first, Drive, y qué sale hacia el proveedor cuando
  hablas con Quirón.
- Qué es Quirón y qué no es — no es entrenador, no es médico, y no sustituye a un test.

**Referencia (F2) — generada, nunca escrita a mano.** Cinco páginas con su fuente declarada:

| Página | Fuente |
|---|---|
| Los 7 dominios, 13 métricas, 5 niveles y sus umbrales | `js/domains.js` |
| Catálogo de ejercicios (82 hoy) con patrón, progresión y regresión | `js/exercise-ontology.js` |
| Formato del plan JSON, campo a campo, con un ejemplo mínimo | `programs/*.json` |
| Atajos de teclado | `ATAJOS` en `js/ui/shortcuts.js` |
| Glosario (RIR, e1RM, ×BW, AMRAP, EMOM, Tabata, S&S, AKE) | escrito, es el único sitio donde se define |

Referencia generada = **la cifra del artículo no puede mentir**. Hoy `AGENTS.md` dice 89 ejercicios y
el array tiene 82: la primera deriva ya ha ocurrido.

**Novedades (F2).** Dos motores, como FnF pero con el segundo cambiado: **producto** (qué cambió en la
app, con el `build.json` del despliegue) y **método** (cuándo cambia un umbral de nivel, un test o una
regla de progresión — y qué significa para tus números de antes). Un cambio de umbral recalcula
niveles pasados: eso hay que decirlo, no descubrirlo.

---

## 6. Procedencia aplicada a la propia ayuda

FnF se pone `reviewed_on` y `válido_hasta` porque una norma caduca. Areté tiene otro reloj: **la
versión de la app**. Sin backend y sin build, la pantalla que describe un artículo puede cambiar en
el siguiente deploy.

```yaml
title: Registra tu primera sesión
author: luis
reviewed_on: 2026-11-15
cuadrante: how-to
cubre: '#startSessionBtn'        # control real de app.html
version: 2026-11-15               # lo que dice /build.json
generado_de:                     # solo si la página cita cifras
  - js/domains.js
```

La barra visible, arriba del artículo: **Revisado 15-nov-2026 · describe la app de esta versión ·
cubre Entrenar → sesión**. Y una regla dura, que se puede testear: *toda cifra de la ayuda se genera
o muere en un test*. Si un artículo dice «12 repeticiones», sale de `REP_CAP`; si dice «42 días», sale
de `RETEST_DAYS`.

---

## 7. La ayuda como tercera capa de Quirón (F3, y es la ventaja)

FnF ya lo tiene claro en sus docs 47 y 54: la documentación es corpus del agente, no solo lectura
humana. Areté está en mejor posición para hacerlo, porque su agente es local y su ayuda es del mismo
dominio:

- **Una herramienta nueva de lectura**, `buscar_ayuda`, en `js/ai/tools.js` (las de lectura hoy son 8;
  esta es la 9 y no gasta: devuelve 800 caracteres y la URL, nunca el artículo entero).
- **Una regla en el SOUL**: «si la pregunta empieza por *cómo* o *por qué*, busca en la guía y cita
  la página; no improvises un método».
- **Un check nuevo en la batería de evals** (`evals/check.mjs`), gemelo del check `cifras`: toda
  respuesta procedimental debe citar una guía **que exista**. Hoy los evals comprueban que no se
  invente números; mañana, que no se invente procedimientos.
- **Y el sentido inverso**: la página de explicación es la respuesta canónica. Si Quirón y la guía
  dicen cosas distintas sobre el nivel o el peso de hoy, hay dos fuentes de verdad para el mismo
  número — el error exacto que se corrigió con el motor de progresión.

Esto es lo que FnF llama «una doc, tres consumidores» (lector, asistente, agente) y en Areté son dos
(el que lee y el que pregunta) con la misma garantía.

---

## 8. En el punto de fricción, no en un menú

La ayuda no va a ser un destino del nav (la nav tiene 5 ranuras y están bien). Va en la fila donde
alguien se atasca, abriendo una hoja con el párrafo exacto y un «saber más»:

| Fricción | Dónde | Qué abre |
|---|---|---|
| «¿Por qué este peso?» | `.prog-why` de cada ejercicio | Hoja con la regla + enlace a *cómo decide el peso de hoy* |
| «¿Por qué mi fuerza no cuenta?» | `unratedLifts()` en Perfil | *Por qué un básico no da número* |
| «Estos umbrales no son los míos» | `CALIBRATION_NOTE` | *Qué mide Areté y qué no* |
| «¿Por qué no me sube el nivel?» | Tarjeta de nivel | *Cómo se lee tu nivel* |
| «No veo el cambio» | Ajustes → versión (`/build.json`) | *Trabaja sin conexión y por qué no ves tus cambios* |
| Atajos | `?` | *Atajos* (hoy es una hoja sin URL: la misma tabla, con dirección) |

La hoja es el patrón `.detail-modal` que ya existe. **La guía larga se lee en la web; la hoja
responde en 60 palabras.** Sin duplicar: la hoja importa el mismo texto generado.

**Offline:** se precachean solo las cuatro que sirven sin red (primer día, registrar sesión,
sin conexión, atajos). La ayuda entera pesa poco, pero el presupuesto del service worker es del
producto, no de la documentación.

**Enlaces profundos.** Proponer un router de hash mínimo en `app.js` (`#perfil`, `#cuerpo`,
`#entrenar/fuerza`, `#ajustes/planes`) para que una guía pueda llevar a la pantalla exacta. Hoy solo
existe `#quiron`. Es media tarde de trabajo y convierte cada guía en accionable.

---

## 9. Cómo se construye y se publica

**Op1 — recomendada: Markdown + generador propio, salida commiteada.**

- Fuente: `docs/ayuda/*.md` con el frontmatter de §6. Nunca se publica directamente.
- Generador: `scripts/build-ayuda.mjs`, Node sin dependencias (parser de frontmatter, un renderer de
  Markdown mínimo, una plantilla única `scripts/ayuda/plantilla.mjs`, un índice de búsqueda en JSON
  y sitemap). Escribe `ayuda/` en la raíz.
- `ayuda/` **es lo que se sirve**: se añade a `PUBLIC` en `scripts/build-pages.mjs` y el deploy no
  cambia. Sigue siendo direct upload, sin CI y sin build en producción.
- `tests/ayuda.test.js` hace cumplir: (a) `ayuda/` está al día con `docs/ayuda/` — regenerar y
  comparar, el test falla si alguien edita el Markdown y no regenera; (b) todo enlace interno
  resuelve; (c) las tablas de referencia son iguales a `DOMAINS` / `ATAJOS` / `EXERCISE_ONTOLOGY`;
  (d) cada `cubre:` existe en `app.html`; (e) todo `href` a `/ayuda/` desde `app.html` o el blog
  apunta a un fichero que existe.

**Op2 — si se quiere empezar mañana:** artículos en HTML a mano con los componentes de `app.css`,
como `patterns.html`. Cuesta un día menos y no hay generador; a cambio no hay referencia generada, y
el enlace roto se descubre en producción, no en `npm test`.

**Descartadas, con motivo:** MkDocs Material (FnF puede permitírselo porque Django ya construye;
Areté vive de «lo que hay en el repo es lo que se sirve», y meterle Python y un build para la ayuda
rompe la única regla de despliegue que tiene) · Eleventy/Astro (un build step para 30 páginas) ·
Markdown renderizado en el navegador (no funciona offline, no lo indexa nadie, y añade un renderer
al bundle de la app).

**Coste:** F0 tres días, F1 tres, F2 dos, F3 tres. Sin dependencias nuevas y sin tocar el pipeline.

---

## 10. Fases y criterios de aceptación

Areté no mide el uso de la app; sí cuenta aperturas de página con **Umami** (sin cookies, solo en
producción), así que un criterio de aceptación no puede ser «X visitas»: no dice si la guía sirvió.
Se acepta con estructura y con tests:

| Fase | Contenido | Se acepta cuando |
|---|---|---|
| **F0** (3 d) | Generador + plantilla + las 12 guías + barra de versión + enlaces desde las 6 fricciones + `tests/ayuda.test.js` | `npm test` en verde con la ayuda; cero enlaces rotos; un perfil vacío puede completar la guía 1 sin salir de ella |
| **F1** (3 d) | Los 4 tutoriales + las 7 explicaciones | Los pasos de «Tu primer día» coinciden con `starterSteps()` y con los selectores reales de `app.html` |
| **F2** (2 d) | Referencia generada + novedades + glosario | Cambiar un umbral en `js/domains.js` y **no** tocar la ayuda rompe el test |
| **F3** (3 d) | Hojas en el punto de fricción + offline + `buscar_ayuda` + check de eval | El check `ayuda` falla si una respuesta procedimental cita una guía inexistente |

Criterio de producto, uno solo: **un atleta nuevo llega a «primera sesión registrada + nivel leído»
sin abrir el blog y sin preguntar a nadie.** Es el equivalente del «de registro a SIEX sin contacto
humano» de FnF.

Y una limitación que hay que decir en voz alta: **sin analítica no se puede medir qué páginas se leen.**
Los tres indicadores honestos son el correo del pie, las preguntas que fallan en los evals y el paso
del tutorial que se abandona en la prueba manual. Cualquier otra métrica exigiría traicionar el
local-first.

---

## 11. Qué NO hacer

- **No un PDF de temporada** ni una guía descargable: Areté se actualiza desplegando, el PDF se queda
  viejo el mismo día.
- **No capturas de pantalla en F0.** Sin e2e no hay forma de regenerarlas, y una PWA sin build cambia
  de aspecto sin cambiar de versión. Enlaces profundos y el texto de la propia app («S1 · kg · reps»)
  envejecen mejor.
- **No documentar nutrición, sueño ni movilidad.** Eso es `blueprints/` y el blog. La ayuda explica
  *la app*; si explica el método entero, compite con el contenido que ya existe.
- **No FAQ sin arquitectura.** La FAQ de la landing se queda donde está; cada pregunta que se repita
  se convierte en guía, no al revés.
- **No help center cerrado** ni «inicia sesión para ver la ayuda»: Areté no tiene cuentas y su ayuda se
  lee antes de instalar.
- **No duplicar el texto entre la web y la app.** La hoja de fricción importa el mismo párrafo; dos
  redacciones divergen en un mes.

---

## 12. Mockup

`docs/ayuda-mockup.html` — con los tokens reales de `app.css` (no una paleta inventada): portada con
las dos puertas, los ejes, la cuadrícula por pantalla, un artículo con la barra de versión y la hoja
de fricción tal como se vería dentro de la app. Comprobado a 390 y 320 px midiendo `scrollWidth`
contra el viewport, como manda `AGENTS.md`.

---

## 13. Decisiones tomadas al implementar

1. **Nombre y ruta**: `/ayuda/`, etiqueta «Ayuda». «La guía» queda libre para el contenido, como se
   propuso.
2. **Canal de soporte**: `hola@arete.raiatech.com` en el pie y en el feedback de cada página. **Falta
   dar de alta el buzón**: hasta entonces el enlace abre un correo que no llega.
3. **Alcance**: las 12 guías, los 4 tutoriales y las 7 explicaciones de golpe. La referencia se genera
   del código desde el primer día porque es lo que evita la deriva.
4. **Quirón**: F3, con el corpus primero. La herramienta `buscar_ayuda` está y el check `cita-guía`
   la vigila, pero el modelo no la usa si no se le pide: hay que **repetir la batería de evals** con
   el SOUL nuevo para ver si el ruteo aparece.
5. **Pendiente fuera de este cambio**: el enlace profundo `#ajustes` solo distingue las subpáginas del
   mapa (`zonas`, `planes`, `programacion`, `quiron`, `copia`); y la búsqueda de la ayuda no indexa los
   encabezados, solo el título, el resumen y el cuerpo. El sitemap propio (`ayuda/sitemap.xml`,
   declarado en `robots.txt`) y los eventos de Umami por sección quedan hechos.
