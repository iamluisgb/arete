---
title: Tus datos y quién los ve
author: luis
reviewed_on: 2026-11-15
cuadrante: explicacion
orden: 6
cubre: "Más · copia de seguridad"
selector: "#setBackup"
resumen: Areté no tiene servidor ni cuentas. Tus datos viven en el navegador y, si quieres, en tu propio Drive. Lo único que sale del dispositivo es lo que le mandas a Quirón.
---

Areté es una app estática: no hay backend de Areté, no hay base de datos de usuarios y no hay analítica
de producto. Esto no es marketing, es la arquitectura — y explica también sus límites.

## Dónde viven tus datos

En el **almacenamiento del navegador** de tu dispositivo: entrenos, medidas, carreras, planes y
ajustes. Los recorridos GPS y las series de frecuencia cardiaca, que son lo pesado, viven en
IndexedDB.

Consecuencias directas:

- Si borras los datos del sitio, se van. Sin copia, no hay nada que recuperar.
- No hay «tu cuenta» que recuperar en otro móvil: la continuidad es la copia de Drive o un fichero.
- El navegador no deja que otra web lea tu almacenamiento, aunque sea del mismo autor.

## La copia, si la activas

La copia va a **tu propio Google Drive**, en la carpeta privada de la app (`appDataFolder`). El
permiso se pide una vez y se renueva en silencio. Areté no tiene las llaves de tu Drive: el
`client_secret` lo custodia un Worker mínimo que no guarda nada, y el token vive en tu navegador.

## Lo que sí sale del dispositivo

Una sola cosa: **cuando hablas con Quirón**. El agente necesita enviar al proveedor del modelo tu
pregunta y el contexto que arma —un resumen de tu estado y los datos que pida con sus herramientas—.
Con la demo, ese proveedor es el gateway de Areté; con tu clave, el que tú elijas.

Dos controles que puedes ver en la app:

- **Presupuesto de contexto**: solo viajan los últimos mensajes y el snapshot; los volcados de
  herramientas viejos no se reenvían.
- **Aviso de contexto enorme**: por encima de 60.000 tokens estimados, la app pregunta antes de
  enviar. Puedes cancelar.

Y una memoria: lo que Quirón decide recordar se guarda **en tu dispositivo**, y lo puedes ver y borrar
en **Memoria**.

## Lo que Areté no hace con tus datos

- No los vende ni los comparte con terceros.
- No hay analítica de uso, ni píxeles, ni identificadores publicitarios.
- No hay correo de registro, ni newsletter automática.
- No hay forma de que el autor vea tu historial: no está en ningún sitio al que tenga acceso.

## Cómo lo borras

**Más → Borrar todos los datos** deja el dispositivo como el primer día. Si tenías Drive activado,
la copia sigue en tu Drive hasta que la borres allí.

## Relacionado

- [Copia de seguridad en tu Drive](/ayuda/guias/copia-drive/)
- [Qué es Quirón y qué no es](/ayuda/explicacion/que-es-quiron/)
- [Recupera tus datos del origen viejo](/ayuda/guias/origen-viejo/)
