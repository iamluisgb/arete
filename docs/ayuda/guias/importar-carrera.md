---
title: Importa una carrera de otra app
author: luis
reviewed_on: 2026-11-15
cuadrante: guias
orden: 5
cubre: "Entrenar · Carrera · importar"
selector: "#runImportBtn"
resumen: GPX y TCX se leen aquí mismo, sin cuenta y sin conectar nada. El .FIT todavía no. Lo importado entra en tu historial y alimenta el 5K de tu perfil.
---

Areté no compite en tracking con Strava ni Garmin: **importa**. Un fichero que tú entregas es tuyo, y
con eso basta para que el mejor 5K, el calendario y el dominio de cardio funcionen.

## Pasos

1. Exporta la actividad de tu reloj o de tu app como **GPX** o **TCX** (Garmin Connect y Strava lo
   hacen en dos clics).
2. En **Entrenar → Carrera**, pulsa **Importar del reloj** y elige el fichero.
3. Si ya tenías una carrera de ese día con la misma distancia (±0,05 km), la app te avisa antes de
   duplicarla.
4. Guarda. La carrera entra en **Historial** con su recorrido, y el mejor 5K se actualiza si mejora.

## Cómo sabes que funcionó

La carrera aparece en el calendario de carrera y en **Historial** con distancia, tiempo y ritmo. En
**Perfil**, Cardio se mide con tu mejor 5K: si no tenías ninguno, el dominio deja de estar sin medir.

## Si algo va mal

- **«Los .FIT todavía no»**: el `.FIT` de Garmin es binario y pide un lector aparte. Exporta la
  actividad como GPX desde Garmin Connect o Strava y vuelve a intentarlo.
- **«No se pudo importar el fichero»**: el fichero no es un GPX/TCX válido, o está a medias. Ábrelo
  en el editor: un XML truncado no se puede leer.
- **La carrera no trae pulsaciones**: se importa igual, pero sin zonas de FC. Areté no inventa la FC
  que el fichero no trae.
- **Quieres apuntarla a mano**: **Registro manual** está al lado. Sirve para cinta, carreras sin reloj
  o cualquier actividad que solo recuerdas.

> [Abrir Carrera](/app#entrenar/carrera)

## Relacionado

- [Graba una carrera con el GPS](/ayuda/guias/grabar-carrera/)
- [Tu primera carrera importada](/ayuda/tutoriales/primera-carrera/)
- [Qué mide Areté y qué no](/ayuda/explicacion/que-mide-arete/)
