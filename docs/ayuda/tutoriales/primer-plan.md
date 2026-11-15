---
title: Tu primer plan propio
author: luis
reviewed_on: 2026-11-15
cuadrante: tutoriales
orden: 4
cubre: "Más · Tus planes · importar"
selector: "#importProgramBtn"
resumen: De la plantilla vacía a entrenar tu propio plan. Cuatro fases, sesiones con nombre y ejercicios con series y reps: no hay más.
---

Un plan de Areté es un JSON con cuatro fases. Este tutorial coge la plantilla, la rellena con dos
sesiones y la deja entrenándose. Si prefieres que te lo escriba una IA, la guía
[crear un plan](/blog/crear-plan.html) tiene el prompt listo.

## Pasos

1. Descarga o copia la estructura de `programs/arete.json` (está en el
   [formato de la referencia](/ayuda/referencia/planes/)).
2. Renombra las fases: `1`, `2`, `3`, `4` son las claves y no se cambian. Dentro, `name` y `desc` son
   tuyos.
3. En `sessions`, escribe tus sesiones. Un ejemplo mínimo:

```json
{
  "1": {
    "name": "Base",
    "desc": "Dos sesiones, tres ejercicios",
    "sessions": {
      "Sesión A": [
        { "name": "Sentadilla", "sets": 3, "reps": "5", "type": "main" },
        { "name": "Press de Banca", "sets": 3, "reps": "5", "type": "main" },
        { "name": "Remo con Barra", "sets": 3, "reps": "8-10", "type": "assist" }
      ],
      "Sesión B": [
        { "name": "Peso Muerto", "sets": 2, "reps": "5", "type": "main" },
        { "name": "Press Militar", "sets": 3, "reps": "5", "type": "main" }
      ]
    }
  }
}
```

4. Rellena también las fases `2`, `3` y `4` (pueden repetir la estructura; la app pide las cuatro).
5. **Más → Tus planes → Importar plan (.json)** y elige el fichero.
6. Toca el chip del plan en la cabecera de **Entrenar** y selecciónalo.

## Terminado cuando

- El plan aparece en **Tus planes** con su nombre y la etiqueta *Custom*.
- Al seleccionarlo, **Entrenar** enseña **Sesión A** y **Sesión B**.
- Al empezar una sesión, los ejercicios salen con sus series y sus reps, y el peso propuesto se lee
  del historial de ese ejercicio con ese objetivo.

## Si algo va mal

- **«El plan no es válido»**: falta una fase o un ejercicio sin `name`, `sets` o `reps`. La app no
  importa medio plan a propósito.
- **El peso propuesto es raro**: solo los cinco básicos tienen progresión y ontología. Un ejercicio
  con nombre inventado se entrena igual, pero arranca sin historial y no mueve el nivel.
- **Quiero editar el plan después**: vuelve a importar el JSON corregido; el anterior se sustituye.
- **Quiero volver al plan de serie**: en **Tus planes**, elimina el tuyo; la app vuelve a Areté.

## Relacionado

- [Escribe tu propio plan (JSON)](/ayuda/guias/plan-propio/)
- [Formato del plan y planes incluidos](/ayuda/referencia/planes/)
- [Elige tu plan y tu semana](/ayuda/guias/elegir-plan/)
