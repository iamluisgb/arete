# Propuesta — Animaciones de ejercicio en 3D

> Sustituir los dibujos de dos poses por un modelo 3D animado que enseñe el
> movimiento entero, desde el ángulo que lo explica y al ritmo que se pide.
> Estado: **propuesta**, pendiente de decidir los puntos del final.

---

## 1. Lo que hay hoy

- **57 juegos de imágenes de RepDB** (2,1 MB en `assets/exercises/`) que cubren
  89 nombres de ejercicio. Casi todos son dos poses, inicio y final.
- **Se alternan a saltos** (`steps(1)`, cada 1,2 s). No hay movimiento intermedio,
  así que no se ve la trayectoria de la barra ni el ritmo de la repetición.
- **El ángulo lo decide el dibujo, no el ejercicio.** El remo con barra está de
  frente: desde ahí no se ve la inclinación del torso ni hacia dónde se tira.
- **No es nuestro.** La licencia gratuita de RepDB obliga a citarlos, y lo que
  ellos no tengan se queda sin dibujo: «Press Jabalina» o «Roll-out» no tienen.

## 2. Qué queremos conseguir

1. Ver la repetición completa y continua, con el ritmo que marca el plan (3-1-X).
2. Que cada ejercicio se vea desde el ángulo que lo explica: de lado sentadilla,
   peso muerto y remo; de frente press militar y zancada lateral.
3. Cubrir los **82 ejercicios** de la clasificación de ejercicios de la app,
   no solo los que tenga un banco de imágenes.
4. Un solo estilo para todos, con los colores de Areté y sin licencias que citar.
5. Que la app no pese más donde no hace falta: las listas siguen siendo ligeras.

## 3. El modelo base

**Recomendación: Universal Base Characters de Quaternius, en proporción «Regular».**

| | Quaternius UBC | MPFB2 (MakeHuman) | Mixamo |
|---|---|---|---|
| Licencia | CC0 | CC0 en lo exportado | Gratis dentro de un producto; no redistribuir ficheros sueltos |
| Cuerpos | 6: hombre y mujer, en tres proporciones | Paramétrico, cualquiera | Catálogo cerrado |
| Esqueleto | Humanoide estándar, apto para trasladar animaciones | Varios a elegir | Propio de Mixamo |
| Peso | ~13.000 triángulos | Más alto, realista | Variable |
| Estilo | Poligonal, sin rasgos | Realista: se acerca al efecto «casi humano» | Variable |

Por qué Quaternius:

- **CC0 de verdad.** El `.glb` se sirve desde la web y cualquiera puede bajarlo; con
  Mixamo eso es zona gris. Con CC0 no hay nada que citar ni que vigilar.
- **Hombre y mujer con el mismo esqueleto.** Las animaciones sirven para los dos sin
  rehacer nada. Encaja con la columna femenina pendiente de `mejoras_arete.md` #7.
- **El estilo encaja.** Con un material plano en los colores de la app, sin cara ni
  pelo, se lee como un maniquí técnico y no como un avatar de videojuego.
- La versión estándar es gratis; la de código fuente (`.blend` con el esqueleto montado)
  cuesta 19,99 $ y solo haría falta si tocamos la malla.

MPFB2 queda como plan B si algún día se quieren complexiones distintas.

## 4. Cómo se anima: por patrón, no ejercicio a ejercicio

La clasificación de ejercicios ya agrupa los 82 en **9 patrones**:

| Patrón | Ejercicios | Ejemplos |
|---|---|---|
| hinge (bisagra de cadera) | 16 | peso muerto, swing, buenos días |
| lunge (zancada) | 10 | zancada, búlgara, step-up |
| push_v (empuje vertical) | 10 | press militar, push press |
| loco (desplazamiento) | 10 | paseo del granjero, burpee |
| push_h (empuje horizontal) | 9 | banca, flexión |
| squat (sentadilla) | 9 | sentadilla, goblet, frontal |
| core | 8 | plancha, rueda, hollow |
| pull_v (tracción vertical) | 5 | dominada, jalón |
| pull_h (tracción horizontal) | 5 | remo con barra, remo invertido |

Cada patrón es **una plantilla de movimiento** y cada ejercicio la ajusta con unos
pocos parámetros: material (barra, pesa rusa, sin peso), agarre, profundidad,
unilateral o no. Una sentadilla goblet es la plantilla «squat» con una pesa rusa
al pecho y el torso más vertical; no es una animación nueva.

Estimación: **unas 35-40 animaciones distintas** cubren los 82 ejercicios.

### Formato de un ejercicio

Un JSON pequeño (~1 KB) por animación, versionado en el repo:

```json
{
  "id": "back-squat",
  "pattern": "squat",
  "props": { "barbell": "back" },
  "camera": "side",
  "tempo": [3, 1, 1, 0],
  "keys": [
    { "t": 0,   "hip": 0,   "knee": 0,   "torso": 5 },
    { "t": 0.5, "hip": 105, "knee": 115, "torso": 40 },
    { "t": 1,   "hip": 0,   "knee": 0,   "torso": 5 }
  ],
  "constraints": { "feet": "planted", "bar": "over-midfoot" }
}
```

- **Poses clave**, no fotogramas: inicio, punto bajo y bloqueo. El resto se interpola.
- **Las restricciones las cumple el cálculo, no la mano.** Con los pies fijos en el suelo
  y la barra sobre el centro del pie, la cinemática inversa (calcular las articulaciones a
  partir de dónde tienen que acabar manos y pies) coloca tobillos, rodillas y caderas.
  Así una sentadilla no puede salir con la barra por delante de los dedos.
- **El ritmo viene del plan**: el 3-1-X de una serie mueve la misma animación más lenta o
  más rápida.

## 5. Dónde se ve y cómo se dibuja

| Sitio | Tamaño | Cómo |
|---|---|---|
| Panel de la serie y descanso | Grande | **En vivo con Three.js**. Se puede girar con el dedo y sigue el ritmo. |
| Pestaña Plan y detalle del ejercicio | Mediano | En vivo, igual que arriba. |
| Listas de sesión (52 px) | Pequeño | **Animación de pocos fotogramas generada antes** a partir de las mismas poses. |

- **Una sola fuente para todo.** Los fotogramas pequeños se generan con un script desde los
  mismos JSON, en el navegador sin pantalla, como ya hacemos con las capturas. Cambiar una
  pose actualiza las dos cosas.
- **Three.js solo se descarga al abrir una vista grande.** Pesa unos 150-180 KB comprimido;
  quien nunca abre el panel no lo paga. El modelo, sin pelo ni texturas y comprimido,
  debería quedar por debajo de 300 KB (a medir en la fase 0).
- **Sin WebGL o con «reducir movimiento»** se enseña la pose final quieta. Sin modelo 3D
  disponible queda el dibujo actual, que no se borra hasta que el 3D lo cubra entero.

### Estilo

- Material plano en la paleta de la app, sin texturas: cuerpo en gris tinta, material
  (barra, pesa) más oscuro, suelo claro con una sombra suave bajo los pies.
- Sin cara ni pelo. Es un maniquí, no un personaje.
- El rojo no se usa en el modelo: en Areté el rojo es récord y dominio.
- Opcional, fase 3: la trayectoria de la barra como una línea fina, y los músculos
  principales tintados (salen de `primary` en la clasificación de ejercicios).

## 6. Herramientas

- **Blender, una vez**: preparar el modelo base (quitar pelo, unificar materiales,
  comprobar el esqueleto) y exportarlo a `.glb`.
- **Un editor de poses propio** en una página interna (como `patterns.html`, no se
  publica): el maniquí en 3D, deslizadores por articulación, cinemática inversa activada,
  reproducción al ritmo y botón «copiar JSON». Hacer las poses ahí es más rápido que en
  Blender y deja el resultado directamente en el formato de la app.
- **Un script** que genera los fotogramas pequeños de todos los ejercicios.

## 7. Fases

| Fase | Qué | Para decidir |
|---|---|---|
| **0 · Prototipo** | El maniquí haciendo una sentadilla con barra de lado, en una página interna. Peso real medido. | ¿Convence el estilo? ¿El movimiento se ve correcto? ¿El peso es aceptable? |
| **1 · Los cinco básicos** | Sentadilla, peso muerto, banca, press militar y remo, en el panel de la serie, con el ritmo del plan. Editor de poses. | ¿Se usa? ¿Ayuda en el descanso? |
| **2 · Catálogo** | Los 9 patrones y sus variantes hasta cubrir los 82. Fotogramas pequeños para las listas. Retirar RepDB. | — |
| **3 · Extras** | Trayectoria de la barra, músculos tintados, elegir cuerpo de hombre o de mujer. | — |

La fase 0 es la que resuelve las dudas de verdad. Si no convence, se para ahí sin haber
tocado la app.

## 8. Riesgos

- **Un movimiento mal hecho enseña mal.** Es peor que el dibujo actual. Criterio para
  aprobar cada animación: pies que no resbalan, barra sobre el centro del pie en los
  ejercicios con barra de pie, espalda neutra en las bisagras, rango completo. Se revisa
  de lado contra un vídeo de referencia.
- **Los balísticos de pesa rusa** (swing, clean, snatch) son los más difíciles de hacer
  creíbles con poses clave. Pueden necesitar más claves o quedarse para el final.
- **El tiempo de autoría** está en las 35-40 animaciones, no en el código. El editor de
  poses está para eso.
- **El peso en móviles flojos**: se mide en la fase 0 en un Android de gama baja antes
  de seguir.

## 9. Decisiones que necesito

1. **Estilo**: maniquí sin rasgos (recomendado) o un cuerpo más realista.
2. **Cuerpo**: solo uno al principio, o hombre y mujer desde la fase 1.
3. **Vista**: cámara fija por ejercicio, o que se pueda girar con el dedo en la vista grande.
4. **Alcance de la fase 0**: solo la sentadilla, o sentadilla y peso muerto para ver un
   patrón de rodilla y uno de cadera.
