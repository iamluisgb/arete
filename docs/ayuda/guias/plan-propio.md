---
title: Escribe tu propio plan (JSON)
author: luis
reviewed_on: 2026-11-15
cuadrante: guias
orden: 8
cubre: "Más · Tus planes · importar"
selector: "#importProgramBtn"
resumen: Un plan es un JSON con cuatro fases, un nombre por sesión y una lista de ejercicios. Se escribe a mano o lo genera una IA con la plantilla, y se importa en dos clics.
---

Los planes de Areté son datos, no código. Si sabes escribir una lista, sabes escribir un plan — y si
no, [la guía de creación de planes](/blog/crear-plan) trae la plantilla para pedírsela a una IA.

## Pasos

1. Copia la estructura de un plan incluido (`programs/arete.json` está en el repositorio y en el
   [formato de la referencia](/ayuda/referencia/planes/)).
2. Escribe tu plan: claves `1`–`4` para las fases, cada una con `name`, `desc` y `sessions`; cada
   sesión con su lista de ejercicios.
3. Cada ejercicio necesita `name`, `sets` y `reps`. `type` es `main` para los principales y `assist`
   para los accesorios. En `reps` cabe `5`, `8-10`, `F` (al fallo) o un aguante (`2min`,
   `1min/lado`).
4. Guarda el fichero con extensión `.json` y ve a **Más → Tus planes → Importar plan (.json)**.
5. Elige el plan en el chip de la cabecera de **Entrenar**. Aparecerá marcado como *Custom*.

## Cómo sabes que funcionó

El plan aparece en **Tus planes** con su nombre y descripción, se puede seleccionar y sus sesiones se
entrenan como las de serie. Los pesos propuestos arrancan del historial del ejercicio con ese objetivo
de reps; si no hay historial, empiezas de cero.

## Si algo va mal

- **«El plan no es válido»**: falta alguna de las cuatro fases, una sesión no es una lista o un
  ejercicio no tiene `name`, `sets` o `reps`. La app rechaza el fichero entero en vez de importar
  medio plan.
- **Los ejercicios no cuentan para el nivel**: solo los cinco básicos con nodo en la ontología
  (sentadilla, peso muerto, banca, press militar y dominadas) alimentan el perfil. Un plan con
  nombres inventados se entrena, pero no mueve el nivel.
- **Quiero borrar un plan**: en **Tus planes**, **Eliminar**. Si era el activo, la app vuelve al plan
  Areté.
- **Cambio de plan a mitad de fase**: el historial se juzga contra el objetivo nuevo. Está explicado
  en [cómo se decide el peso de hoy](/ayuda/explicacion/el-peso-de-hoy/).

> [Abrir Más → Tus planes](/app#ajustes/planes)

## Relacionado

- [Formato del plan y planes incluidos](/ayuda/referencia/planes/)
- [Elige tu plan y tu semana](/ayuda/guias/elegir-plan/)
- [Tu primer plan propio](/ayuda/tutoriales/primer-plan/)
