# Areté — Mejoras pendientes

> Backlog de correcciones sobre la guía de dominios y sus referencias científicas.
> Ninguna toca la arquitectura del sistema: son juntas a apretar antes de que lo lea alguien que busque el punto débil.
> Estado: `pendiente` · `en curso` · `hecho` · `descartado`

**Leyenda de esfuerzo/impacto:** 🟢 barato · 🟡 medio · 🔴 costoso · ⭐ alto impacto en credibilidad

---

## Progreso — 2026-07-10

Aplicado sobre `blog/8-dominios.html` (+ `dashboard-prototype.html`) y subido a `main` (`a164916`). El repo local estaba 38 commits por detrás de GitHub; la guía de dominios v2 (interferencia, AKE, McGill, limitaciones) ya existía en remoto y fue la base de estos cambios.

- **hecho** — #1 Rename "Fuerza empuje" → "Fuerza máxima" (artículo + tarjeta y label del radar en el prototipo de dashboard).
- **hecho** — #2 Regla de agregación documentada: nivel de dominio = mínimo de los 4 ratios, con la contrapartida del OHP explicitada.
- **hecho** — #3 Solape S&S ↔ 400m reconocido y resuelto por modo + duración; matizada la narrativa "3 vías + 4 dimensiones".
- **hecho** — #4 Reconocida la fragilidad del dominio (tobillo + hombro) y **añadido** el weight-bearing lunge test (dorsiflexión).
- **parcial** — #7 Mínimo viable hecho: declarada la calibración para hombre ~75 kg y cómo ajustan las mujeres. Falta la tabla con columna femenina (requiere datos normativos).
- **hecho** — #8 Correlaciones r=0.72/0.38 de Cejudo eliminadas (no localizadas); afirmación suavizada.
- **hecho** — #9/#10 Corregido el cruce Saeidifard 2019 (*Eur J Prev Cardiol*) vs Shailendra 2022 (*Am J Prev Med*); cifras no verificadas (19/14/21%) retiradas.
- **hecho** — #11 IDs de PMC sustituidos por autor+año+revista (Christopher et al. 2019 *Archives of Physiotherapy*; Lang et al. 2024 *BJSM*); PMC11057624 reformulado sin ID.
- **hecho** — #12 mTOR/AMPK matizado (interferencia crónica multifactorial, no solo señalización aguda).

### P4 — estructura del blog (commit `c52ee40`)

- **hecho** — Decisión de identidad resuelta por la vía recomendada (absorber al sistema).
- **hecho** — Índice reorganizado en capas visibles (manifiesto → pilares → aplicación → eventos); eliminados los chips y sus contadores obsoletos.
- **hecho** — `suplementos` fusionado dentro de `nutricion` (reencuadrado como Blueprint de Nutrición); `suplementos.html` convertido en redirect a `nutricion.html#suplementos`.
- **hecho** — `efecto-kettlebell` reposicionado como "cómo entrenar el dominio de resistencia de fuerza sin gimnasio", enlazado a su dominio.
- **hecho** — `programa-arete` reposicionado como plan de ejemplo importable.
- **hecho** — Enlazado ascendente + CTA a la app + fecha de última revisión en los artículos del núcleo.
- **pendiente** — Artículos nuevos por escribir: pilar de **interferencia** (el moat), "por qué nivel = mínimo", "cómo leer tu radar", "cómo programar re-tests", y el vertical **ultra 100K** (hoy es una tarjeta "próximamente"). Elevar `crear-plan` de tutorial a especificación formal del schema.
- **nota** — Quedan orphans legacy en la raíz (`filosofia-arete.html`, `fase1-fuerza-modelo.html`) no enlazados desde la nav viva; decidir si borrarlos.

**Pendiente global:** #5, #6 (decisiones de alcance de dominios), #7 tabla femenina completa, y los artículos nuevos de P4 listados arriba.

---

## P0 — Contradicciones que un evaluador crítico detecta al instante

### 1. Renombrar "Fuerza empuje" → "Fuerza máxima" 🟢⭐
- [ ] El dominio contiene **peso muerto**, que es el patrón de bisagra/tracción por excelencia. Llamarlo "empuje" es una contradicción que cualquier powerlifter o entrenador señala de inmediato.
- [ ] Renombrar a **"Fuerza máxima"** (neutro y correcto) o "Fuerza de barra".
- [ ] Revisar que el cambio se propague a: tabla de niveles, radar del dashboard, textos del artículo y cualquier copy de la app.
- **Fricción añadida:** el dominio 2 se llama "tracción" pero solo cubre dominadas (tracción vertical con peso corporal). Con el rename, aclarar la distinción: dominio 1 = fuerza máxima con barra; dominio 2 = tracción vertical de peso corporal.

### 2. Especificar cómo se colapsan los 4 levantamientos a un nivel 🟢⭐
- [ ] Squat, DL, bench y OHP son patrones con adaptaciones parcialmente independientes. El artículo lista sus ratios por separado pero **no dice cómo se agregan** a un único nivel de dominio.
- [ ] Decidir y documentar la regla de agregación. Coherente con la filosofía "nivel = mínimo" sería tomar el **mínimo de los cuatro ratios**, pero eso implica que un solo levantamiento débil (típicamente el OHP) te define dos veces: dentro del dominio y como posible mínimo global.
- [ ] Alternativa a considerar: media de los cuatro para el nivel de dominio, reservando la regla del mínimo solo para el nivel global entre dominios. Elegir una y justificarla explícitamente.
- **Nota:** el OHP es el levantamiento que más rezaga en la mayoría de atletas. La regla elegida determina cuánto peso tiene ese sesgo conocido.

### 3. Reconocer el solape metabólico S&S ↔ 400m 🟢
- [ ] La tesis del sistema es "cada dominio mide algo que los otros seis no capturan". **Resistencia de fuerza (S&S)** y **capacidad glicolítica (400m)** ocupan territorio energético solapado (zona glicolítica-oxidativa media).
- [ ] Añadir una frase que reconozca el solape y lo resuelva por diferenciación de **modo** (cíclico balístico vs. sprint) y **duración**, en lugar de por vía metabólica pura.
- [ ] Esto también obliga a matizar la narrativa "3 vías + 4 dimensiones": las cuatro "añadidas" no son todas metabólicamente ortogonales.

---

## P1 — Huecos de cobertura que limitan el valor como producto

### 4. Ampliar el dominio de Movilidad más allá de isquiotibiales 🟡⭐
- [ ] El AKE es una buena elección y el argumento anti-Sit&Reach está bien construido. Pero medir "movilidad funcional" **solo por longitud de isquios** deja fuera los dos limitantes más relevantes para un atleta híbrido:
  - [ ] **Dorsiflexión de tobillo** — limita la sentadilla profunda y predice lesión en carrera mejor que los isquios. Es el eslabón más común en trail. Su ausencia es el hueco más serio.
  - [ ] **Movilidad de hombro** — limita OHP y dominadas.
- [ ] Opción mínima: reconocer explícitamente la limitación en el texto. Opción correcta: añadir al menos el test de dorsiflexión (weight-bearing lunge test, medible con la app de inclinación del propio móvil).
- **Riesgo actual:** un dominio de movilidad de un solo test es el más frágil de los siete.

### 5. Añadir cobertura de bisagra / tracción horizontal cargada 🟡
- [ ] Hay dominadas (tracción vertical, peso corporal) pero **ningún remo ni tracción horizontal con carga externa**.
- [ ] El peso muerto cubre la bisagra pero está enterrado dentro del dominio 1 ("empuje"/fuerza máxima).
- [ ] Para un atleta híbrido que carga y arrastra objetos, remo y bisagra son funcionalmente centrales. Decidir si se cubren dentro de los dominios existentes (haciéndolo explícito) o si falta un patrón.

### 6. Test alternativo para Resistencia de fuerza sin kettlebell 🟡
- [ ] S&S es un test excelente pero **asume acceso a una pesa de 32/48 kg**. Como dominio obligatorio, excluye a quien no tiene ese implemento.
- [ ] Definir un test equivalente medible sin kettlebell específico: p.ej. thrusters con carga estándar, o farmer's carry por distancia/tiempo.
- [ ] Mapear la equivalencia de niveles entre el test principal y el alternativo.

---

## P2 — Equidad y alcance ("la mejor app para atletas híbridos", no "para hombres híbridos")

### 7. Añadir columna femenina a la tabla de niveles 🔴⭐
- [ ] Toda la tabla maestra de 5 niveles y todos los umbrales están calibrados para **hombres de ~75 kg**.
- [ ] Se menciona el desdoble solo en S&S (32 kg hombres / 24 kg mujeres), pero la tabla maestra no tiene columna femenina.
- [ ] Crítico: los ratios ×BW de tren superior (bench, OHP, dominadas) **no escalan igual entre sexos** — menor masa relativa de tren superior en mujeres significa que un OHP de 1.0×BW no es el mismo percentil de élite para ambos.
- [ ] Mínimo viable: declarar explícitamente que el sistema está calibrado para un perfil y cómo ajustar. Correcto: tabla de niveles con columna por sexo.
- **Por qué P2 y no P0:** es el arreglo más costoso (requiere datos normativos femeninos por levantamiento), pero es un agujero de producto, no solo de artículo.

---

## P3 — Rigor de referencias (verificar antes de mantener como cifra dura)

> Regla general: sustituir todo ID de PMC por **autor + año + revista**. Citar por ID en divulgación es frágil — no dice al lector qué estudio es y un ID mal transcrito es indetectable.

### 8. Cejudo et al. 2019 — correlaciones r=0.72 vs r=0.38 🟡
- [ ] No se pudo confirmar esas correlaciones exactas (AKE vs Sit&Reach contra sentadilla profunda). Cejudo tiene trabajo real sobre ROM y rendimiento, pero esas dos cifras concretas no se localizaron.
- [ ] Verificar el DOI y la fuente exacta.
- [ ] Si no aparece la fuente: **suavizar** a "la evidencia sugiere mayor validez del AKE" sin el número.

### 9. Saeidifard et al. 2022 — reducción de mortalidad 15/19/14% 🟢
- [ ] Existe un Saeidifard sobre fuerza y mortalidad. Confirmar: año, revista (se cita *Am J Prev Med*) y las tres cifras contra el abstract.
- [ ] Los meta-análisis de fuerza y mortalidad suelen dar rangos de 10–21%, así que la magnitud es plausible — pero atribuir las cifras exactas al paper correcto.

### 10. Shailendra et al. 2019 — 21%, *Eur J Prev Cardiol* 🟢
- [ ] Verificar el **año**. Hay un meta-análisis muy citado de fuerza y mortalidad que podría ser 2022, no 2019.

### 11. Reemplazar IDs de PMC por referencias legibles 🟢
- [ ] `PMC11057624`
- [ ] `PMC11103301`
- [ ] `PMC6373037`
- [ ] Sustituir cada uno por autor + año + revista, como en el resto del corpus.

### 12. Matizar la narrativa mTOR vs AMPK 🟢
- [ ] Se presenta como "batalla molecular" donde AMPK inhibe mTOR. Es la narrativa clásica, pero la literatura post-2018 ha matizado que la inhibición aguda de AMPK sobre mTOR **no explica limpiamente** la interferencia crónica a nivel de todo el cuerpo (el efecto real es multifactorial: fatiga, glucógeno, competencia por recuperación).
- [ ] Añadir una frase de matiz. No hace falta reescribir la sección — basta con blindar la afirmación para el lector con formación en fisiología.

---

## Referencias que NO requieren acción (verificadas / sólidas)

Registradas para no re-auditarlas:

- **Hickson 1980** — interferencia, fundacional. Correcto.
- **Wilson et al. 2012 (JSCR)** — entrenamiento concurrente; el ~50% de reducción en hipertrofia/fuerza y efecto mínimo en resistencia es fiel.
- **Mandsager et al. 2018 (Mayo Clinic Proceedings)** — 122.043 pacientes. Correctamente representado.
- **Bandy & Irion 1994 (Physical Therapy)** — extensión de rodilla; paper clásico de referencia para longitud de isquios.
- **McGill (corpus)** — resistencia de core y ratio flexor/extensor ~0.75. Canónico.
- **Gastin 2001 (Sports Medicine)** — contribución de vías metabólicas. Real y muy citado.

---

## P4 — Estructura del blog: qué mantener, fusionar y escribir

> Principio rector: **el blog no es un blog de fitness, es la documentación de una tesis.** Cada artículo debe justificar una decisión del sistema o del producto ("¿por qué Areté hace X así?"). Lo que no lo hace, compite en terreno de commodity donde no se puede ganar, y diluye el mensaje.

### Problema estructural de fondo: dos identidades de producto mezcladas 🔴⭐

El blog mezcla hoy dos tesis que no encajan:
- **Identidad A — sistema de dominios / atleta híbrido:** `filosofia-arete`, `8-dominios`, `crear-plan`, `efecto-kettlebell`.
- **Identidad B — recomposición corporal / estética** (vocabulario de culturismo: fases de definición, "el cuerpo que puede", "come como un animal"): `programa-arete`, `nutricion`, `suplementos`.

- [ ] **Decisión grande a tomar:** el blog debe servir a UNA tesis (la del motor de diagnóstico híbrido). Elegir camino para la identidad B:
  - [ ] **Opción recomendada — absorber al sistema:** convertir `programa-arete` en "plan de ejemplo importable"; fusionar `nutricion`+`suplementos` en un **Blueprint de nutrición** (encaja con la capa de Blueprints: sueño, recuperación, respiración, nutrición).
  - [ ] **Opción alternativa — separar:** mover el contenido de recomposición a una sección propia ("Programas"), fuera del blog-tesis, para que no diluya el mensaje de dominios.
  - [ ] **Lo que NO hacer:** dejarlos como están, mezclados en una lista plana, obligando al lector a reconciliar dos productos.

### Auditoría artículo por artículo

**Mantener y pulir (núcleo):**
- [ ] **`filosofia-arete` ("el manifiesto")** — capa 1, el ancla. Todo debe enlazar aquí arriba. ⚠️ Resolver duplicado con `index.html` de la raíz (ambos son "filosofía"): elegir el manifiesto canónico y redirigir el otro.
- [ ] **`8-dominios`** — capa 2, joya de la corona (43K car., 10 secciones). Aplicar aquí las mejoras P0–P3 de este mismo documento (rename fuerza, tobillo, columna femenina, citas).
- [ ] **`crear-plan`** — capa 3, infraestructura. Documenta el schema JSON = API pública + base del futuro agente. Elevar de "tutorial" a **especificación del formato importable**.

**Reposicionar como aplicación del sistema:**
- [ ] **`efecto-kettlebell`** — reencuadrar de "programa de 10 semanas" genérico a *cómo entrenar el dominio de resistencia de fuerza sin gimnasio*, enlazado a su dominio.

**Fusionar:**
- [ ] **`suplementos`** — el más flojo y commodity (9K car.: creatina, proteína, cafeína). Fusionar como sección dentro de `nutricion`. No merece pieza independiente.
- [ ] **`nutricion`** — tras absorber suplementos, convertir en **Blueprint de nutrición** enlazado a fases (ver decisión grande arriba).

**Decidir:**
- [ ] **`programa-arete`** — programa de recomposición de 4 fases. No es el sistema de dominios. Reposicionar como "plan de ejemplo en formato importable" (sirve al sistema) o mover a sección separada.

### Huecos de contenido a escribir (por capa)

**Capa 2 — pilares del núcleo defendible (extraer de secciones existentes):**
- [ ] **"Por qué nivel = mínimo"** — la filosofía del eslabón débil. Hoy vive como sección dentro de `8-dominios`; es central y contraintuitiva, merece artículo propio.
- [ ] **"Por qué medimos la interferencia"** — el mayor diferenciador, hoy enterrado como sección. Ninguna otra app lo escribe con rigor. **Prioridad alta: es el moat desaprovechado.**

**Capa 3 — aplicación (no existen):**
- [ ] **"Cómo leer tu radar / interpretar tu perfil"** — conecta el dashboard con la teoría.
- [ ] **"Cómo programar tus re-tests sin acumular fatiga"** — la lógica del scheduler, explicada.

**Capa 4 — verticales de evento (la promesa sin cumplir):**
- [ ] **Readiness para ultra 100K** — `8-dominios` ya promete "del dominio al evento" pero no hay artículo. Empezar por este (el caso propio); HYROX después.

### Mejoras estructurales del blog como conjunto

- [ ] **Jerarquía visible en el índice:** mostrar las capas (manifiesto → pilares → aplicación → eventos), no una lista cronológica plana.
- [ ] **Enlazado ascendente obligatorio:** cada pilar enlaza al manifiesto; cada artículo de aplicación enlaza a su pilar. Convierte posts sueltos en cuerpo de doctrina.
- [ ] **CTA a la app al final de cada artículo:** "mídelo en Areté" → enlace al dashboard o test correspondiente. El blog existe para llevar a la app.
- [ ] **Fecha de última revisión, no de publicación:** comunica documentación viva, no post que envejece.

---

## Orden de ejecución sugerido

1. **Sprint de credibilidad (una tarde):** #1, #2, #3, #11, #12. Todo 🟢, alto retorno, no requiere datos nuevos.
2. **Verificación de citas:** #8, #9, #10. Contra fuentes originales.
3. **Cobertura de movilidad:** #4 (al menos reconocer la ausencia de tobillo; idealmente añadir el test).
4. **Decisiones de diseño de dominios:** #5, #6. Requieren decidir alcance del sistema.
5. **Equidad (proyecto propio):** #7. El más costoso; planificar con datos normativos femeninos.
6. **Blog — decisión de identidad (P4):** resolver A vs B antes de tocar artículos individuales; luego fusionar suplementos→nutrición, reposicionar kettlebell, resolver duplicado manifiesto.
7. **Blog — escribir huecos:** empezar por el pilar de **interferencia** (mayor diferenciador desaprovechado), luego "nivel = mínimo", luego aplicación y el vertical de ultra.

---

*Fuente del análisis: revisión de la guía de dominios de Areté y sus referencias. Las mejoras aprietan las juntas del sistema sin tocar su arquitectura — que, apropiadamente para la propia filosofía de Areté, es donde el nivel del conjunto queda definido por su punto más débil.*