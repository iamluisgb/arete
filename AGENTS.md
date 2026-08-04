# AGENTS.md — Areté

PWA de entrenamiento híbrido (fuerza + resistencia). 100% frontend, vanilla JS con módulos ES,
sin build step: lo que hay en el repo es lo que se sirve.

## Desarrollo
- Servir en local: `python3 -m http.server` y abrir `index.html` (landing) o `app.html` (la app).
  Hace falta un servidor: los módulos ES y el service worker no funcionan con `file://`.
- `npm test` — vitest sobre `tests/` (jsdom). `npm run test:watch` para iterar.

## Despliegue

Cloudflare Pages, proyecto **`arete`** de *direct upload* (no está conectado a GitHub: no hay
deploy automático al hacer push; se despliega a mano). Mismo esquema que bookreader.

```
npm run deploy:pages
```

Construye `dist/` y lo sube. Tres cosas que conviene tener claras:

- **El origen es HEAD, no el disco.** El build sale de `git archive HEAD`, así que lo que tengas
  sin commitear no se despliega — el script avisa de esos ficheros antes de seguir.
- **Rechaza un HEAD que no esté en `origin/main`**, para que nunca haya en producción código que
  no exista en el remoto. Escape: `DEPLOY_ALLOW_UNPUSHED=1`.
- **Lista blanca**, en `PUBLIC` dentro de [`scripts/build-pages.mjs`](scripts/build-pages.mjs).
  El repo tiene tests, evals, tools, prototipos y notas de trabajo que no deben publicarse, y
  copiar la raíz entera los publica todos. **Si añades un fichero o carpeta de primer nivel que
  deba estar en producción, hay que añadirlo a `PUBLIC` o simplemente no se sube.**

El commit desplegado queda sellado en `dist/build.json` y se sirve como `/build.json`: eso
responde "¿qué hay ahí fuera ahora mismo?" sin comparar ficheros a ojo.

`npm run build:preview` construye desde el árbol de trabajo (incluye lo no commiteado). Solo
para mirar `dist/` en local; no lo despliegues.

Al tocar ficheros precacheados hay que subir `CACHE_NAME` en [`sw.js`](sw.js) y añadirlos a
`ASSETS`, o los clientes instalados seguirán con la versión vieja.

### Dónde vive
- `https://arete-6a8.pages.dev` — el deploy de Cloudflare Pages.
- `https://arete.raiatech.com` — dominio de producción. El DNS de `raiatech.com` está en
  **Namecheap**, no en Cloudflare: el CNAME hacia `arete-6a8.pages.dev` se añade a mano allí.
- `https://luisgonzalezbernal.com/arete/` — GitHub Pages, sigue vivo sirviendo la raíz del repo
  desde `main` (todo el repo, sin lista blanca). Los `canonical`/`og:url` aún apuntan aquí.

### Google Drive
La sincronización usa un client ID de OAuth ([`js/drive.js`](js/drive.js)). Cada origen nuevo
desde el que se sirva la app tiene que estar en los orígenes JavaScript autorizados de Google
Cloud Console, o el login de Drive falla solo en ese dominio.
