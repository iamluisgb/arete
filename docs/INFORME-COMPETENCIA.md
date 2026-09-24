# Informe — Panorama competitivo del agente de Areté

Investigación de competencia para el agente Quirón y la app en su conjunto.
Fecha: 2026-09-24 · Método: búsqueda web y lectura directa de comparativas 2026,
webs de producto y documentación pública de cada competidor. Todas las cifras de
precio y claims de producto son los que cada fuente declara sobre sí misma; donde
un dato es un claim del propio fabricante se señala.

---

## 1. Resumen ejecutivo

1. **La categoría existe y está caliente.** El mercado de apps de fitness generó
   10,6 B$ en 2024 (proyección: 33,6 B$ en 2033, ResearchAndMarkets vía Fast.io)
   y la oleada 2024–2026 de "AI coaches" conversacionales produce productos que
   compiten frontalmente con Quirón: agente con memoria, tools de lectura sobre
   el historial, propuestas de sesión y registro conversacional.

2. **La frontera del sector se ha movido a los wearables.** La taxonomía de
   Fast.io separa Tier 1 (generación estática), Tier 2 (adaptación a lo
   registrado) y Tier 3 (reescritura del plan desde HRV, sueño y pulso en
   reposo). Quirón es un Tier 2 con un agente excepcional; los competidores
   mejor posicionados ya operan en Tier 3. **Esta es la brecha nº 1.**

3. **El competidor más peligroso es Cora** (backed por Y Combinator): es
   conceptualmente Areté con distribución — agente coach, datos locales del
   usuario, y **un servidor MCP para ChatGPT/Claude ya en producción**, la misma
   tesis que BookReader validó con su MCP local. Además está en app, iMessage y
   Apple Watch.

4. **Areté conserva ventajas reales y defendibles**: privacidad local-first sin
   backend (ninguno de los Tier 3 puede decir lo mismo), BYOK con demo sin
   fricción, el modelo de 7 dominios con nivel-mínimo (sin paralelo en el
   mercado), y una disciplina de evals con checks duros que ningún competidor
   siquiera reclama.

5. **La brecha más barata de cerrar es el agente proactivo**: Areté ya tiene la
   cola de dos carriles (`background: true`) construida y sin usar. Los
   competidores reconstruyen el plan *antes* de que el atleta pregunte; Quirón
   responde cuando le hablan.

---

## 2. Metodología

- Comparativas técnicas 2026 leídas completas: Fast.io («8 Best AI Fitness Apps
  in 2026, Ranked by Real AI Depth», pruebas de 2+ semanas por app), Ionik
  Health, Arvo (30 días por app), MyWorkoutCalendar, AIToolsBakery.
- Webs de producto leídas: Cora, Kin, Sensai, Rizin (features), Forge, Ellim,
  Coachly, TrainrAI, Omnio, The Protocol, Vitera.
- Contraste con el inventario real de Areté: `js/ai/` (tools, contexto, cola,
  métricas), `AGENTS.md`, `docs/PLAN-ONTOLOGIA.md`, `docs/EVALS.md`.
- Límite del método: no hay pruebas de primera mano de los competidores; los
  claims (p. ej. «91 % de finalización» de Ray) son autopercibidos por el
  fabricante. Los precios pueden cambiar.

---

## 3. Inventario honesto de Areté (línea base del contraste)

Lo que existe hoy en producción (rama main, cache v148):

| Capacidad | Estado |
| --- | --- |
| Agente conversacional (Quirón) | 10 tools: 6 lectura, 2 propuesta, 1 escritura (`log_workout`), 1 prescripción |
| Contexto | Snapshot siempre presente (`context.js`) + excavación bajo demanda; presupuesto de contexto y `TOKEN_GUARD` |
| Conocimiento estructurado | Ontología de 89 ejercicios (74 mapeados; F1 pendiente), vocabularios controlados, contraindicaciones, regresiones |
| Modelo de dominio | 7 dominios, nivel = mínimo; derivadas (Epley con `REP_CAP`) vs. medidas con caducidad |
| Carrera | GPS, mejor 5K, zonas de FC sin color |
| Calidad del agente | Batería de evals con 11 checks (duros capan), fixture sintético versionado |
| Infra agéntica | Cola de dos carriles (sin uso real), reintentos con backoff, probe de modelos, gateway de demo |
| Datos | 100 % local-first, sync v2 con merge puro sobre Drive |
| Modelo económico | Gratuito; BYOK o token de demo del gateway |

Lo que **no** existe: nutrición, señales de wearable (sueño/HRV/RPR), turnos
proactivos, voz, visión/cámara, app de reloj, notificaciones push, capa social,
exportación MCP/API.

---

## 4. Mapa competitivo

### 4.1 Competidores directos: el agente coach conversacional

**Cora** (corahealth.app, Y Combinator) — *la amenaza principal.*
- Agente que "lee las señales del cuerpo, decide y actúa" en app, iMessage,
  Apple Watch y dentro de ChatGPT/Claude vía **servidor MCP propio**.
- Demo de producto: 6:45 lee del Apple Watch «6h 12m de sueño, HRV −18 %»;
  6:47 reconstruye el día (sentadillas pesadas → jueves, Zone 2 en su lugar);
  12:10 registra «chicken burrito bowl» → 720 kcal, 52 g proteína por SMS;
  15:00 responde «¿cómo va mi entrenamiento?» desde Claude con el histórico
  real de 4 semanas.
- Combina entrenamiento + nutrición (macros) + recuperación en un solo agente.
- Nota estratégica: su MCP «seguro para datos de salud» es exactamente la tesis
  del MCP de BookReader (P28), ejecutada y monetizada. La idea funciona en el
  mercado; nadie la tiene en el nicho fuerza/salud local-first.

**Kin** (trainwithkin.com) — coach conversacional sobre Claude, iOS.
- «El producto ES la conversación»: registro en una frase («four sets of five
  deadlifts at 100»), la semana se reconstruye ante lesión, viaje o mal sueño.
- Briefing matinal, plan multi-disciplina (fuerza, Pilates, yoga, runs, nado),
  comidas que se adaptan.
- 9,99 €/mes; sin reloj aún; offline: plan y registro previos visibles, la
  conversación requiere red.
- Su FAQ es un espejo: «si ya tienes tu hoja de cálculo de programación, Kin no
  es para ti» — mismo posicionamiento «coach, no tracker» que Areté.

**Rizin** (rizin.app) — coach con «memoria real»: sabe qué levantaste el
martes, cómo estabas de agujetas el jueves y qué desayunaste; ajusta el plan al
momento. Posicionamiento idéntico al de Quirón con nutrición integrada.

**Sensai** (sensai.fit) — planes adaptados a la recuperación del wearable
(Apple Watch, Garmin, Oura vía HealthKit; lista declarada: Whoop, Polar, Strava,
MyFitnessPal, 8Sleep…). Ajuste de sesión en curso por zonas de FC en tiempo
real. Freemium.

**Ray** — entrenador por **voz en tiempo real** con LLM: ajusta el ejercicio en
el momento ante feedback verbal («me duele la rodilla» → swap inmediato),
conteo de reps por visión por computador, memoria de lesiones. 19,99 $/mes.
Claims propios: 91 % de finalización, 3,2 sesiones/semana.

**Otros del mismo patrón**: Ionik Health (coach que replanifica la semana y
explica el porqué), Forge Trainer (gym + memoria, <5 $/mes), Ellim (tracker
gratis + coach premium que «lee todo y escribe el plan»), Coachly (entreno +
macros + Apple Health), Fitly, WorkoutBuddy, TrainrAI (iPhone/Watch con datos de
Apple Health, «privacy-first»), Arvo (4 €/mes, 5 metodologías de bodybuilding).

### 4.2 Motores deterministas: el otro eje de la competencia

No son agentes conversacionales; compiten por la programación:

| App | Fortaleza | Precio | Hueco que deja |
| --- | --- | --- | --- |
| Fitbod | 1.000+ ejercicios, adaptación por recuperación muscular, flexibilidad de equipo | 12,99 $/mes | Sin señales externas, reactivo |
| JuggernautAI | Periodización por bloques para powerlifting (Israetel/Wesley Smith) | 34,99 $/mes | Solo barra; sin wearables |
| Dr. Muscle | Sobrecarga progresiva automática, deloads por detección de estancamiento | 49,99 $/mes | Sin awareness de recuperación |
| Alpha Progression | Carga/repes por serie, RIR, deloads programados | 12,99 $/mes | Sin coaching conversacional |
| Freeletics | 54M usuarios entrenando el modelo; bodyweight y viaje | 99,99 $/año | Feedback subjetivo, poca barra |
| Planfit | 11M entrenamientos registrados; el mejor tier gratuito | gratis/premium | Adaptación solo in-app |
| Future | Coach **humano** + Apple Watch | 199 $/mes | Precio; depende del coach asignado |

### 4.3 El ecosistema de «readiness» (Tier 3 puro)

Omnio, The Protocol, Athenae, Vitera, Xeep, Reps: leen HRV/sueño/RPR del
wearable y convierten eso en «hoy toca empujar o frenar». Son una prueba de que
la señal wearable → decisión de entrenamiento es una categoría propia — y el
terrén exacto donde Quirón aún no juega.

---

## 5. Contraste dimensión a dimensión

| Dimensión | Areté | Los mejores del mercado |
| --- | --- | --- |
| Agente con tools + memoria | ✔ 10 tools, snapshot + excavación | Cora, Kin, Rizin (equivalente funcional) |
| Escritura del agente en los datos | ✔ `log_workout` con ruteo evaluado | Todos los conversacionales |
| Señales de wearable | ✖ ninguna | Cora, Kin (readiness), Sensai, Omnio, The Protocol |
| Nutrición | ✖ | Cora, Kin, Coachly, Protokl |
| Proactividad (replanifica sin que preguntes) | ✖ (carril de fondo vacío) | Cora (6:47 AM), Kin (briefing + semana que se cose sola) |
| Voz | ✖ | Ray (voz en tiempo real), Kin (voz/texto) |
| Visión/cámara | slot `arete-vision` sin explotar | Ray (conteo de reps), Zing (técnica) |
| Multi-superficie | PWA only | Cora (app + Watch + iMessage + MCP), Kin (iOS) |
| Puente a LLMs externos | ✖ (MCP existe en BookReader, no en Areté) | Cora: MCP para ChatGPT/Claude, en producción |
| Catálogo de ejercicios | 89 nodos (74 mapeados) | Fitbod 1.000+, Freeletics 700+ |
| Motor de periodización determinista | ✖ (la progresión vive en el prompt + snapshot) | JuggernautAI, Dr. Muscle, Alpha Progression |
| Escala de datos | 1 atleta (por diseño) | Freeletics 54M, Planfit 11M |
| Privacidad local-first sin backend | ✔ (único) | TrainrAI lo declara; los Tier 3 necesitan cloud |
| BYOK / demo sin fricción | ✔ (único) | Ninguno |
| Modelo de perfil de nivel (mínimo de 7 dominios) | ✔ (único) | Ninguno: todos trabajan por objetivo/aíslan músculo |
| Evals del agente con checks duros | ✔ (único que se conoce) | Ninguno lo reclama públicamente |
| Precio para el atleta | 0 + su clave | 5–50 $/mes |

---

## 6. Las brechas, en profundidad

### 6.1 Señales de recuperación (brecha crítica)
El sector entero ha moved la meta: adaptarse a lo registrado ya no diferencia;
diferencia leer el cuerpo *antes* de la sesión. El meta-análisis citado por
Fast.io (Granero-Gallegos et al., 2020) da a la programación guiada por HRV un
efecto positivo sobre VO2max (ES 0.402) — hay base fisiológica, no solo moda.
Para Areté el hueco es doble: sin esas señales, el snapshot de Quirón describe
*lo que hiciste*, no *en qué estado estás para hacerlo*.

### 6.2 El agente reactivo (brecha barata)
Cora reconstruye el día a las 6:47 sin que nadie pregunte; Kin entrega briefing
matinal. Quirón espera. La ironía: la cola de dos carriles de `llm.js` existe
precisamente para trabajo de fondo y hoy no tiene ningún ocupante. El gap no es
de infraestructura sino de producto: un turno proactivo nocturno/matinal
(«revisa el snapshot, detecta patrón de fatiga o desequilibrio entre dominios,
propone ajuste») cabe en la arquitectura actual.

### 6.3 Nutrición (brecha de producto, no de agente)
Todos los conversacionales maduros la integran porque multiplica las razones de
abrir la app a diario. Para Areté es una decisión de alcance seria (BD nueva,
nueva superficie, nuevo dominio de errores), no un feature.

### 6.4 Multi-superficie y MCP (brecha de distribución)
Cora valida dos cosas: que la tesis MCP funciona (lo que BookReader ya sabía) y
que la superficie importa (registro por SMS/iMessage elimina la fricción de
abrir la app). Para Areté, un MCP local sobre su layout de sync sería el mismo
movimiento que BookReader hizo en P28 — y sus datos ya tienen un layout
estable y un merge puro que lo respalda.

### 6.5 Voz y visión (brecha de experiencia en el gimnasio)
Ray y Zing atacan el momento de verdad: la serie en curso, manos ocupadas.
Areté tiene el slot de visión (`arete-vision`) y la infraestructura streameada;
la voz es un nuevo motor de entrada (dictado existe en BookReader como
referente interno).

### 6.6 Catálogo y periodización (brechas de profundidad)
Fitbod con 1.000+ ejercicios y vídeo frente a 89 nodos: la ontología de Areté es
más *semánticamente rica* (patrones, contraindicaciones, regresiones,
sustitutos derivados) pero desordenadamente más pequeña, y F1 (mapear los 89)
sigue abierta. En periodización, los motores deterministas (deloads por
estancamiento, bloques) hacen numéricamente lo que Quirón hace retóricamente.

---

## 7. Ventajas defendibles de Areté

1. **Privacidad verificable, no declarada.** Sin backend, sin cuentas, datos en
   el dispositivo y en el Drive del atleta, vetados explícitos (`ai_key`,
   `device_id`…). Los Tier 3 no pueden ofrecer esto: su producto ES leer tus
   biometría en su cloud.
2. **El modelo de 7 dominios con nivel-mínimo.** Ningún competidor define el
   perfil como el mínimo de dominios medidos; todos optimizan un objetivo o un
   músculo. Es la tesis de producto más distintiva del mercado y Quirón la usa
   (`get_domain_profile`, el limitador accionable).
3. **Coste cero + BYOK.** El competidor más barato cuesta 4–5 $/mes; Future, 199.
4. **Calidad del agente medida.** Batería de evals con checks duros (ninguna
   cifra sin respaldo, ninguna carga sobre el 1RM estimado) frente a un sector
   que no publica nada sobre la calidad de sus coaches.
5. **Demo sin fricción** (gateway con token por producto) frente a paywalls de
   7 días.

---

## 8. Recomendaciones priorizadas

**Corto plazo (la infraestructura ya existe):**
1. **Turno proactivo en el carril de fondo**: revisión nocturna/matinal del
   snapshot → propuestas al abrir la app. Cero nuevas dependencias; usa la cola
   vacía, el snapshot y el ruteo ya evaluado.
2. **Cerrar F1** (mapear los 89): el catálogo es la credibilidad de las
   propuestas; F5 (evals del catálogo) depende de ella.

**Medio plazo (la brecha crítica):**
3. **Señales de recuperación**: en PWA el camino es HealthKit vía el usuario
   (exportación/importación manual o file import como primer paso), o la vía
   BookReader: el layout de sync como contrato y un worker mínimo. Aunque sea
   solo «sueño auto-registrado + cuestionario de readiness», el snapshot de
   Quirón gana la dimensión que hoy no tiene.

**Decisiones estratégicas (no features):**
4. **MCP de Areté** sobre el layout de sync (réplica de P28): barato, valida
   distribución, y el ecosistema ya premia el patrón (Cora).
5. **Nutrición**: decidir conscientemente si entra (alcance grande, retención
   diaria) o se queda fuera como identidad («solo entrenamiento» es defendible;
   ser incompleto sin decidirlo no).

---

## 9. Fuentes

- Fast.io — «8 Best AI Fitness Apps in 2026, Ranked by Real AI Depth» (pruebas
  propias, taxonomía Tier 1/2/3, precios, meta-análisis HRV).
- Ionik Health — «Best AI Workout Apps 2026: Honest Comparison».
- Arvo — «Best AI Workout Apps 2026: 9 Tested Head-to-Head (30 Days Each)».
- MyWorkoutCalendar, AIToolsBakery — comparativas 2026.
- Cora (corahealth.app), Kin (trainwithkin.com), Sensai (sensai.fit) — webs de
  producto leídas completas.
- Rizin, Forge, Ellim, Coachly, TrainrAI, Omnio, The Protocol, Vitera, Xeep,
  Reps — páginas de producto y listados de App Store (claims del fabricante).
- Inventario de Areté: `AGENTS.md`, `docs/EVALS.md`, `docs/PLAN-ONTOLOGIA.md`,
  `js/ai/` del repo (estado main, 2026-09-24).
