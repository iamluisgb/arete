---
title: Copia de seguridad en tu Drive
author: luis
reviewed_on: 2026-11-15
cuadrante: guias
orden: 10
cubre: "Más · copia de seguridad"
selector: "#setBackup"
resumen: Tus datos viven en el navegador. Si borras el navegador sin copia, se van con él. Drive es la copia recomendada y la sincronización automática se mantiene sola.
---

Areté no tiene servidor. La copia de seguridad es **tu propio Google Drive**, en una carpeta privada
de la app (`appDataFolder`), y el navegador solo guarda el permiso para escribir ahí.

## Pasos

1. **Más → Copia de seguridad**.
2. Activa **Sincronización automática** y autoriza Google. Se abre una ventana de Google: acepta y
   vuelve; la app recibe el permiso por un canal interno, sin que la clave pase por ninguna web.
3. Espera la primera subida. La fila del índice pasa a `Drive · hace un momento`.
4. Para llevarte los datos a otro dispositivo, entra ahí con tu cuenta y **Restaurar desde Drive**.

## Cómo sabes que funcionó

La fila de **Copia de seguridad** en **Más** dice cuándo fue la última copia. Desde otro navegador,
tras conectar el mismo Google, tu historial, tus medidas y tus planes están ahí. La app hace *merge*
de las dos copias: no se pisan.

## Si algo va mal

- **«Falta reconectar»**: el permiso caducó. Vuelve a activar la sincronización; se renueva en
  silencio y sigue sola.
- **Dos dispositivos con datos distintos**: el merge es puro por identificador, así que se quedan los
  dos. Un entreno creado en cada móvil el mismo día aparece dos veces, que es lo correcto: son dos
  entrenos.
- **Sospechas que has perdido algo**: **Recuperar versión anterior** guarda copias anteriores. Mira
  ahí antes de restaurar nada.
- **Sin cuenta de Google**: **Guardar copia en un archivo** deja un `.json` en tu dispositivo, y
  **Restaurar desde un archivo** lo devuelve. Es el mismo formato.
- **Diagnóstico**: si la sincronización falla, el bloque **Diagnóstico de sincronización** dice el
  motivo y desde cuándo, en vez de dejar el aviso en un icono.

> [Abrir Más → Copia de seguridad](/app#ajustes/copia)

## Relacionado

- [Tus datos y quién los ve](/ayuda/explicacion/tus-datos/)
- [Recupera tus datos del origen viejo](/ayuda/guias/origen-viejo/)
- [Trabaja sin conexión](/ayuda/guias/sin-conexion/)
