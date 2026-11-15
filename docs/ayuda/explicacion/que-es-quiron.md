---
title: Qué es Quirón y qué no es
author: luis
reviewed_on: 2026-11-15
cuadrante: explicacion
orden: 7
cubre: "Quirón · chat"
selector: "#qtabChat"
resumen: Un coach que lee tus datos y propone, no un generador de planes. Qué herramientas tiene, qué decide él y qué decide el motor, y dónde están sus límites.
---

Quirón es el centauro que entrenó a Aquiles. En Areté es lo mismo: no entrena *por* ti, te ayuda a
entrenar con más intención. Escribe en tu idioma, mira tus números y propone — pero no decide por su
cuenta.

## Qué puede hacer

- **Leer** tu historial: sesiones, carreras, medidas, perfil de dominios, plan, catálogo de ejercicios.
  Ocho herramientas de lectura.
- **Calcular** lo que ya está calculado: el peso que te toca hoy sale del motor de progresión, no de
  su cabeza.
- **Proponer** una sesión o un plan. Siempre en una tarjeta de confirmación: nada se guarda sin que lo
  aceptes.
- **Anotar** un entreno que le dictes.
- **Recordar** lo que le cuentes, en una memoria que vive en tu dispositivo y que puedes ver y borrar.

## La regla que lo hace fiable

La progresión tiene **una sola fuente de verdad**, y es el motor (`js/progression.js`). Antes la regla
vivía en el prompt del agente y no solo era no determinista: **contradecía al motor** — el tren
inferior sube de 5 en 5, una pesa rusa sube a la pesa siguiente, y el estancamiento son tres sesiones
al mismo peso. Dos fuentes para el mismo número es una de más.

Por eso Quirón **lee** la prescripción y la explica; si te dice un peso distinto del que enseña la
sesión, manda la sesión y es un fallo que queremos saber.

## Cómo se controla que no invente

Hay una batería de comprobaciones sobre conversaciones de prueba, con un fixture sintético versionado.
La que importa en este dominio: **toda cifra con unidad de una respuesta descriptiva tiene que salir
del snapshot o de una herramienta**. La alucinación aquí no es la cita falsa: es el número inventado.

## Sus límites, dichos claro

- **No es un médico.** No diagnostica dolor, ni interpreta una lesión, ni sustituye una consulta.
- **No te ve.** No corrige tu técnica: ningún número de la app sabe cómo bajas la sentadilla.
- **No conoce el mundo.** Sabe de tu historial y del catálogo de ejercicios; lo que no esté ahí puede
  inventarlo con toda la confianza del mundo. Contrasta lo que te importe.
- **No está siempre.** Sin red no hay Quirón. El resto de la app funciona igual.
- **La demo es una demo.** Un cupo por red y día, con un modelo pequeño. Si le vas a pedir mucho, pon
  tu clave.

## Relacionado

- [Habla con Quirón sin configurar nada](/ayuda/guias/hablar-con-quiron/)
- [Tus datos y quién los ve](/ayuda/explicacion/tus-datos/)
- [Cómo se decide el peso de hoy](/ayuda/explicacion/el-peso-de-hoy/)
