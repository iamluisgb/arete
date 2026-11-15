---
title: Planes y formato del plan
author: luis
reviewed_on: 2026-11-15
cuadrante: referencia
orden: 3
cubre: "Más · fichero de plan"
selector: "#importProgramFile"
resumen: El JSON de un plan, campo a campo, y los planes que vienen con la app. Generado del catálogo real y de un plan de ejemplo.
generado_de:
  - programs.json
  - programs/arete.json
---

Un plan es un JSON con cuatro fases. La app valida el fichero entero antes de importarlo: si algo falta,
no entra medio plan.

{{planes}}

## Las reglas que valida la app

- **Cuatro fases** con claves `1`, `2`, `3` y `4`. No se pueden saltar ni renumerar.
- Cada fase necesita `name`, `desc` y `sessions`.
- **Cada sesión** es una lista de ejercicios con `name`, `sets` y `reps`. `type` es opcional (`main` o
  `assist`) y solo cambia el orden visual.
- **`reps`** acepta un número (`5`), un rango (`8-10`), al fallo (`F`) o un aguante (`2min`,
  `1min/lado`). Un aguante no lleva progresión de carga: no es una serie de reps.
- Los **nombres de ejercicio** se cruzan con la [ontología](/ayuda/referencia/ejercicios/): los cinco
  básicos alimentan el perfil, el resto se entrena sin mover el nivel.

## Relacionado

- [Escribe tu propio plan (JSON)](/ayuda/guias/plan-propio/)
- [Tu primer plan propio](/ayuda/tutoriales/primer-plan/)
- [Elige tu plan y tu semana](/ayuda/guias/elegir-plan/)
