---
title: Ejercicios
author: luis
reviewed_on: 2026-11-15
cuadrante: referencia
orden: 2
cubre: "Entrenar · Fuerza"
selector: "#secStrength"
resumen: Los ejercicios que la app reconoce, con su patrón, material, dominios y regresión. Generado de la ontología: lo que no está aquí no tiene ficha, aunque se pueda entrenar.
generado_de:
  - js/exercise-ontology.js
---

La ontología es la lista cerrada de ejercicios que Areté reconoce. Un ejercicio que no está aquí se
puede entrenar y registrar igual, pero **no tiene ficha, ni progresión de referencia, ni cuenta para
la derivación del perfil**. Es la diferencia entre escribir texto libre y nombrar un objeto.

{{ejercicios}}

## Qué significan las columnas

- **Patrón**: el movimiento (`hinge`, `squat`, `push_h`, `pull_v`…). Dos ejercicios del mismo patrón
  se sustituyen entre sí cuando falta material.
- **Material**: lo mínimo para hacerlo. Es lo que usa la app para proponer alternativas en casa.
- **Dominios**: qué capacidad alimenta. La fuerza máxima solo la mueven los cinco nodos canónicos.
- **Regresión**: la versión más fácil del mismo patrón, para cuando el material o el hombro no dan.

## Relacionado

- [Los 7 dominios y sus umbrales](/ayuda/referencia/dominios/)
- [Escribe tu propio plan (JSON)](/ayuda/guias/plan-propio/)
- [Qué mide Areté y qué no](/ayuda/explicacion/que-mide-arete/)
