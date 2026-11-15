---
title: Graba una carrera con el GPS
author: luis
reviewed_on: 2026-11-15
cuadrante: guias
orden: 6
cubre: "Entrenar · Carrera · GPS"
selector: "#runGpsActions"
resumen: El GPS en vivo solo funciona en la app instalada, donde el sistema deja medir de verdad. En el navegador se importa. Qué permisos pide y qué pasa si la pantalla se apaga.
---

El tracker aparece **solo donde puede cumplir**: dentro de la app instalada. En el navegador no se
enseña, porque `watchPosition` se estrangula en segundo plano y la app no promete lo que no puede
dar. Ahí la vía es [importar el fichero](/ayuda/guias/importar-carrera/).

## Pasos

1. Entra en **Entrenar → Carrera**, en la app instalada.
2. Pulsa **Iniciar carrera** y concede el permiso de ubicación **mientras la app está en uso**.
   Mientras corre, el sistema mantiene la medición con un servicio en primer plano y una notificación
   fija: no la cierres a mano.
3. Corre. La pantalla enseña distancia, tiempo y ritmo en vivo.
4. Al terminar, detén y guarda. La carrera entra en el historial con su recorrido.

## Cómo sabes que funcionó

La carrera aparece con su ruta dibujada en el mapa, importe de kilómetros, ritmo y —si el sensor lo
da— zonas de frecuencia cardiaca. El objetivo semanal de la tarjeta de carrera avanza.

## Si algo va mal

- **No aparece «Iniciar carrera»**: estás en el navegador. Instala la app o importa el GPX. La app lo
  dice con todas las letras: *El GPS en vivo solo está en la app instalada*.
- **El recorrido sale corto**: el sistema estrangula la ubicación en segundo plano si la batería está
  en ahorro extremo. Quita la optimización de batería para Areté.
- **Se pierden las pulsaciones**: el sensor de muñeca no siempre acompaña. Puedes importar la
  actividad del reloj después: el GPX/TCX trae las dos cosas.
- **Dos carreras del mismo día**: si importas la del reloj, borra la del móvil o la app te avisará de
  que ya tienes una de esa fecha y distancia.

> [Abrir Carrera](/app#entrenar/carrera)

## Relacionado

- [Importa una carrera de otra app](/ayuda/guias/importar-carrera/)
- [Qué mide Areté y qué no](/ayuda/explicacion/que-mide-arete/)
- [Tus datos y quién los ve](/ayuda/explicacion/tus-datos/)
