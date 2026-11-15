---
title: Trabaja sin conexión
author: luis
reviewed_on: 2026-11-15
cuadrante: guias
orden: 11
cubre: "Más · versión de la app"
selector: "#appVersion"
resumen: Areté es una PWA instalable: entrenar, registrar y consultar funciona sin red. Lo que necesita conexión es Quirón. Y si no ves un cambio, casi siempre es la versión cacheada.
---

La app se instala desde el navegador (**Añadir a pantalla de inicio**) y a partir de ahí arranca
desde su propia caché. En el gimnasio, en el monte o en un sótano, se entrena igual.

## Qué funciona sin red

- Registrar series, sesiones, medidas y carreras manuales.
- Ver perfil, historial, progreso, calendario y récords.
- Importar un GPX/TCX desde un fichero (no necesita red).
- Leer las guías de la ayuda que ya hayas abierto.

Lo que **no** funciona sin red: Quirón (habla con un proveedor de modelos) y la sincronización con
Drive, que reintenta sola cuando vuelve la conexión.

## Pasos

1. Instala la app desde el navegador y ábrela una vez con red, para que la caché se llene.
2. Entrena sin conexión con normalidad. Nada se bloquea.
3. Al volver la red, la cola de sincronización sube lo pendiente sin que hagas nada.

## Si no ves un cambio de la app

Es la fiebre de toda PWA: el **service worker** sirve la versión cacheada. Lo que hay que saber:

1. Si aparece el aviso **«Nueva versión disponible · Actualizar»**, púlsalo. La app se recarga con la
   versión nueva.
2. Si no aparece, cierra la app del todo y vuelve a abrirla. Al arrancar comprueba si hay versión
   nueva.
3. Para saber qué hay desplegado de verdad, abre `/build.json`: lleva el commit exacto que se está
   sirviendo.
4. **No borres los datos del sitio** para «arreglarlo»: eso borra tus entrenos. La caché se refresca
   sin tocar el almacenamiento.

## Si algo va mal

- **Una pantalla en blanco después de actualizar**: cierra y abre. Si sigue, escribe a
  [hola@arete.raiatech.com](mailto:hola@arete.raiatech.com) con lo que dice `/build.json`.
- **Dos pestañas abiertas**: la vieja puede quedarse con el código anterior. Cierra una.
- **Quirón no responde sin cobertura**: es lo esperado. El resto de la app no depende de él.

> [Abrir Ajustes](/app#ajustes)

## Relacionado

- [Copia de seguridad en tu Drive](/ayuda/guias/copia-drive/)
- [Tus datos y quién los ve](/ayuda/explicacion/tus-datos/)
- [Qué es Quirón y qué no es](/ayuda/explicacion/que-es-quiron/)
