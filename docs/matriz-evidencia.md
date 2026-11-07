# Matriz de evidencia de los tests de Areté

Revisión del 7-nov-2026. Para cada test que da nivel en `js/domains.js`, cuánto se sostiene:
qué une el test a algo que importe, cuánto ruido tiene la medida y qué le cuesta al atleta.

El marco es una versión reducida de James et al. (2024), *A framework for test measurement
selection in athlete physical preparation* ([doi:10.3389/fspor.2024.1406997](https://doi.org/10.3389/fspor.2024.1406997)).
De sus tres grupos de criterios nos quedamos con lo que cambia decisiones:

- **Cadena de evidencia.** ¿Qué une el resultado del test con un resultado que importe? Dos
  destinos posibles: **salud** (morbilidad, mortalidad) y **rendimiento híbrido** (transferencia
  a esfuerzos mixtos). Es la pregunta filtro del marco: sin cadena, el resto da igual.
- **Ruido frente al escalón.** El error de medida de la literatura comparado con la anchura de un
  nivel en `domains.js`. Si el ruido se acerca al escalón, el nivel puede subir o bajar sin que
  cambie nada.
- **Coste para el atleta.** Material, tiempo, fatiga y si hace falta otra persona.

Escala: **Fuerte** (metaanálisis o cohortes grandes) · **Moderada** (estudios prospectivos sueltos
o en otra población) · **Baja** (mecanismo plausible, sin datos que lo unan) · **Nada**.

Todas las fuentes se han comprobado contra Crossref y el resumen en PubMed. Lo que no se
encontró se dice.

## Resumen

| Test | Cadena a salud | Cadena a rendimiento | Ruido frente al escalón | Coste | Veredicto |
|---|---|---|---|---|---|
| 1RM ×BW (4 básicos) | Moderada | Moderada | Bajo | Nulo (derivado) | Se sostiene |
| Dominadas estrictas | Baja | Moderada | Sin dato | Nulo (derivado) | Se sostiene como rendimiento |
| 400 m | Baja | Moderada | Bajo | Medio | Se sostiene como rendimiento |
| 5K | **Fuerte** | Fuerte | Bajo | Nulo (derivado) | El mejor test del sistema |
| Simple & Sinister | Nada | Baja | Bajo (pasa/no pasa) | Alto | Benchmark, no test |
| McGill (3 tests) | Moderada (extensor) | Baja | Medio | Bajo | Se sostiene con matices |
| AKE | Baja | Baja | **Alto** | Medio | No se sostiene así |
| Dorsiflexión (WBLT) | Moderada (lesión) | Baja | **Alto** | Bajo | Se sostiene, escalones demasiado finos |

Tres conclusiones:

1. **El AKE no pasa el filtro como está.** Es fiable en clínica (con estabilizador y alguien
   que mide), pero en Areté lo mide el propio atleta con el móvil, y los escalones son de 5°
   cuando en el mejor estudio solo el 79-93 % de las medidas caen dentro de 10° entre sí.
   Su cadena a lesión es de calidad muy baja. O se ensancha el escalón o deja de dar nivel.
2. **La dorsiflexión tiene la mejor cadena de la movilidad, pero sus escalones (2 cm) miden
   casi lo mismo que su cambio mínimo detectable (1,6-1,9 cm).** Hacen falta escalones de 3 cm o
   repetir la medida.
3. **Los tests de rendimiento (5K, 400 m, 1RM) tienen ruido muy por debajo del escalón.** Ahí un
   cambio de nivel es real. La funcionalidad «cambio real o ruido» solo cambia algo en
   movilidad y core.

## Por test

### 1RM en ratio al peso (sentadilla, peso muerto, banca, press militar)

- **Salud: Moderada.** La fuerza muscular medida se asocia con menos mortalidad en adultos sanos
  (García-Hermoso et al. 2018, [doi:10.1016/j.apmr.2018.01.008](https://doi.org/10.1016/j.apmr.2018.01.008)).
  El entrenamiento de fuerza también (Saeidifard 2019, −21 %; Shailendra 2022, −15 %, máximo −27 %
  hacia 60 min/semana). Ojo: esas cadenas son sobre *practicar* fuerza o sobre fuerza de prensión,
  no sobre un ratio de sentadilla concreto.
- **Rendimiento: Moderada.** Fuerza máxima como base de potencia y de resistencia a la fatiga.
- **Ruido: Bajo.** 1RM real: CCI mediano 0,97, CV mediano 4,2 % (Grgic et al. 2020,
  [doi:10.1186/s40798-020-00260-z](https://doi.org/10.1186/s40798-020-00260-z)). Areté no mide 1RM:
  lo estima con Epley desde series de hasta 12 repeticiones, que añade error (más cuantas más
  repeticiones), y divide por un peso corporal que oscila 1-2 % por día. Aun así, el escalón
  (0,25 ×BW en sentadilla, un 15-25 %) queda lejos.
- **Coste: Nulo.** Sale de lo registrado.

### Dominadas estrictas

- **Salud: Baja.** No se ha encontrado cohorte que una dominadas con salud. Hay cadenas
  para la fuerza en general (arriba), no para este test.
- **Rendimiento: Moderada.** Fuerza relativa de tracción; muy sensible al peso corporal.
- **Ruido: Sin dato.** No se ha encontrado un estudio de fiabilidad test-retest de repeticiones
  máximas en adultos entrenados. Los escalones (4-8 repeticiones) parecen anchos, pero no está
  medido.
- **Coste: Nulo** (derivado del historial).

### 400 m

- **Salud: Baja.** Sin cadena directa.
- **Rendimiento: Moderada.** Un esfuerzo máximo de ~60 s saca algo más de la mitad de la energía
  de las vías anaeróbicas; el reparto mitad y mitad llega hacia los 75 s (Gastin 2001,
  [doi:10.2165/00007256-200131100-00003](https://doi.org/10.2165/00007256-200131100-00003)). No mide
  solo la vía glicolítica: también aeróbico, técnica y economía de carrera.
- **Ruido: Bajo.** CV de ~0,9 % en sprints de campo, ×1,3 en no atletas (Hopkins et al. 2001,
  [doi:10.2165/00007256-200131030-00005](https://doi.org/10.2165/00007256-200131030-00005)).
  Cronometrar a mano añade unas décimas. El escalón es de 5 s (~7 %).
- **Coste: Medio.** Pista o tramo llano medido, calentamiento, fatiga de un día.
- **Pendiente:** el artículo da umbrales distintos de los del código (artículo: Excelente
  < 60 s; código: nivel V < 55 s). Hay que unificar.

### 5K

- **Salud: Fuerte.** La capacidad cardiorrespiratoria predice morbilidad y mortalidad (Lang et al.
  2024, [doi:10.1136/bjsports-2023-107849](https://doi.org/10.1136/bjsports-2023-107849)); bajo
  frente a élite multiplica por 5 la mortalidad ajustada en 122 007 pacientes (Mandsager et al. 2018,
  [doi:10.1001/jamanetworkopen.2018.3605](https://doi.org/10.1001/jamanetworkopen.2018.3605)). La
  cadena pasa por el VO2max, y el 5K es un proxy: depende también de la economía de carrera.
- **Rendimiento: Fuerte.**
- **Ruido: Bajo.** Pruebas de 1 min a 3 h: CV 0,9-2,0 % (Hopkins 2001). En un 5K de 25 min, unos
  15-30 s. El escalón es de 2-3 min.
- **Coste: Nulo** (derivado de `runningLogs`), siempre que la carrera fuera a tope.
- **Pendiente:** artículo y código no tienen los mismos umbrales (artículo: Novice 26-31 min;
  código: 30/28/25/22/19).

### Simple & Sinister

- **Salud: Nada.** Sin estudios.
- **Rendimiento: Baja.** Mecanismo plausible (cadena posterior, carga metabólica), sin datos.
  Mezcla dos capacidades: resistencia balística (swings) y control bajo carga (get-ups).
- **Ruido: Bajo** en la medida (es pasa o no pasa con un peso), **alto** en el criterio: el
  estándar de técnica de StrongFirst se juzga a ojo.
- **Coste: Alto.** Kettlebells de varios pesos, 15 minutos a tope.
- No se ha encontrado ningún estudio de fiabilidad del test de snatch ni del S&S.

### McGill (flexor, extensor, plancha lateral)

- **Salud: Moderada, solo el extensor.** Una buena resistencia isométrica de extensores se asoció
  con menos primeros episodios de dolor lumbar en hombres en un año (Biering-Sørensen 1984,
  [doi:10.1097/00007632-198403000-00002](https://doi.org/10.1097/00007632-198403000-00002)). Para
  flexor y lateral no hay una cadena equivalente.
- **Rendimiento: Baja.**
- **Ruido: Medio.** Coeficientes > 0,97 en cinco días seguidos y a las 8 semanas (McGill et al.
  1999, [doi:10.1016/S0003-9993(99)90087-4](https://doi.org/10.1016/S0003-9993(99)90087-4)),
  en laboratorio y con un evaluador que decide cuándo se rompe la postura. En casa, el atleta
  se cronometra solo. Escalones de 30 s (15 s la lateral), sin CV publicado para comparar.
- **Coste: Bajo.** Suelo, un banco y un cronómetro; mejor con alguien que mire.
- Normas de McGill 1999 en jóvenes sanos: flexor ~136 s, extensor ~161 s, lateral ~95-99 s.
  Los niveles del código (IV = 150 s flexor/extensor) son coherentes con eso.
- La plancha lateral se registra con un solo valor: el ratio derecha/izquierda que cita el
  artículo no se puede calcular en la app.

### AKE (extensión activa de rodilla)

- **Salud: Baja.** La evidencia de que la flexibilidad o el rango predicen lesión en corredores
  es de calidad muy baja (Christopher et al. 2019,
  [doi:10.1186/s40945-019-0054-7](https://doi.org/10.1186/s40945-019-0054-7)).
- **Rendimiento: Baja.**
- **Ruido: Alto.** Muy fiable con estabilización estricta (r = 0,99 en 15 hombres; Gajdosik y Lusin
  1983, [doi:10.1093/ptj/63.7.1085](https://doi.org/10.1093/ptj/63.7.1085)). Con un aparato sencillo
  y dos evaluadores, CCI 0,75-0,97 y solo el 79-93 % de las medidas dentro de 10° (Hamid et al.
  2013, [doi:10.1589/jpts.25.957](https://doi.org/10.1589/jpts.25.957)). En Areté se lo mide el
  atleta solo, con el móvil. Escalones de 5°.
- **Coste: Medio.** Necesita otra persona o un montaje para fijar la cadera a 90°.
- Lo que sí se sostiene es el motivo para no usar el Sit & Reach: su validez como medida de
  isquiotibiales es débil (R² ≈ 0,3 en Castro-Piñero et al. 2009,
  [doi:10.1055/s-0029-1224175](https://doi.org/10.1055/s-0029-1224175), en niños y adolescentes).
- **Pendiente:** el artículo da umbrales (0/+10/+20°) distintos del código (−5/0/5/15/20°).

### Dorsiflexión (weight-bearing lunge test)

- **Salud: Moderada, como riesgo de lesión.** En jugadores de baloncesto jóvenes, una dorsiflexión
  por debajo de 36,5° se asoció con un 18-29 % de tendinopatía rotuliana en un año, frente al ~2 %
  (Backman y Danielson 2011, [doi:10.1177/0363546511420552](https://doi.org/10.1177/0363546511420552)).
  Un estudio prospectivo, en otra población.
- **Rendimiento: Baja.** Limita la sentadilla profunda; no se ha medido la transferencia.
- **Ruido: Alto frente al escalón.** CCI 0,65-0,99; cambio mínimo detectable 1,6-1,9 cm o 4,6-4,7°
  (Powden et al. 2015, [doi:10.1016/j.math.2015.01.004](https://doi.org/10.1016/j.math.2015.01.004)).
  Los escalones del código son de 2 cm.
- **Coste: Bajo.** Una pared y una cinta métrica.

## Lo que sale de aquí

1. **Unificar umbrales entre artículo y código** (400 m, 5K, dominadas, S&S, AKE). Hoy el
   artículo promete unos niveles y la app calcula otros.
2. **Movilidad:** ensanchar escalones (dorsiflexión a ≥ 3 cm, AKE a ≥ 10°) o pedir dos
   medidas y quedarse con la media. Valorar que el AKE deje de dar nivel y quede como
   indicador.
3. **«Cambio real o ruido»:** solo merece la pena en movilidad y core; en el resto el escalón ya
   es varias veces el ruido.
4. **Plancha lateral por lado** si se quiere que el ratio derecha/izquierda exista.
5. **S&S y dominadas** no tienen estudios de fiabilidad: decirlo en el artículo.
