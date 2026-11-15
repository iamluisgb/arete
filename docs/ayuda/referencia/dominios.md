---
title: Los 7 dominios y sus umbrales
author: luis
reviewed_on: 2026-11-15
cuadrante: referencia
orden: 1
cubre: "Perfil · radar de dominios"
selector: "#profDomains"
resumen: Las trece métricas, sus cinco niveles y qué se deriva del historial. Generado de js/domains.js: si cambia un umbral, esta página cambia sola.
generado_de:
  - js/domains.js
---

Los números que deciden tu nivel. Cada tabla es un dominio: las columnas son los cinco niveles y cada
fila una métrica con su unidad. **Un valor por debajo del nivel I sigue siendo nivel I**: haber medido
bajo no es lo mismo que no haber medido.

{{dominios}}

## Cómo leer «Se deriva del historial»

- **Sí**: la métrica sale de lo que ya registras. En fuerza, del mejor e1RM de tus series; en
  dominadas, de tu mejor serie estricta sin lastre; en 5K, de tu mejor carrera.
- **No**: exige un test con protocolo y fecha. Sin test, el dominio se queda sin medir.

El nivel de un dominio es el mínimo de sus métricas; el global, el mínimo de los dominios medidos.
Está explicado en [por qué tu nivel es el mínimo](/ayuda/explicacion/el-nivel-es-el-minimo/).

## Relacionado

- [Mide tus 7 dominios](/ayuda/tutoriales/mide-tus-dominios/)
- [Por qué caducan los tests](/ayuda/explicacion/por-que-caducan-los-tests/)
- [Qué mide Areté y qué no](/ayuda/explicacion/que-mide-arete/)
