---
title: Recupera tus datos del origen viejo
author: luis
reviewed_on: 2026-11-15
cuadrante: guias
orden: 12
cubre: "Hoy"
selector: "#secDashboard"
resumen: Si instalaste Areté desde luisgonzalezbernal.com/arete, tus datos siguen en ese origen. El traspaso se hace solo al abrir el sitio viejo, y no pasa por ningún servidor.
---

Los datos de un navegador viven **por origen**: `luisgonzalezbernal.com` y `arete.raiatech.com` son
dos cajones distintos y una web no puede leer el del otro. Por eso el traspaso no puede ser
transparente: la única ventana es **abrir el sitio viejo como página principal**, que es justo lo que
pasa al pulsar tu marcador.

## Pasos

1. Abre `https://luisgonzalezbernal.com/arete/` en el mismo navegador donde entrenabas.
2. La página lee tu historial y tus recorridos GPS, los comprime y te lleva a la app nueva con los
   datos en el fragmento de la dirección — que **no viaja al servidor**.
3. Si ya tienes datos en el destino, la app **pregunta** antes de mezclar. Con la app vacía, importa
   sin molestar.
4. Comprueba que están: **Historial**, **Cuerpo** y las carreras con su recorrido.

## Cómo sabes que funcionó

Tus sesiones antiguas aparecen con sus fechas y sus series, y las carreras conservan el recorrido del
mapa (los recorridos pesados viven en otra base de datos del navegador y también viajan). El origen
viejo **no borra nada**: si algo falla, se puede reintentar.

## Si algo va mal

- **No pasa nada al abrir el sitio viejo**: puede que nunca usaras ese origen, o que entres desde otro
  navegador. Los datos no se mueven entre navegadores.
- **«Demasiado grande para el enlace»**: por encima de 48.000 caracteres se ofrece un **fichero**.
  Descárgalo y restáuralo con **Más → Copia de seguridad → Restaurar desde un archivo**.
- **El enlace se corta**: una URL truncada falla en silencio. Repite el proceso; también puedes usar
  el fichero.
- **Tenías Drive activado**: no hace falta nada de esto. Reconecta Drive en la app nueva y tus datos
  bajan solos.

## Relacionado

- [Copia de seguridad en tu Drive](/ayuda/guias/copia-drive/)
- [Tus datos y quién los ve](/ayuda/explicacion/tus-datos/)
- [Trabaja sin conexión](/ayuda/guias/sin-conexion/)
