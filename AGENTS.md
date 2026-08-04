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

## Google Drive

Copia de seguridad y sync automático contra la carpeta `appDataFolder` del usuario.

- [`js/drive-auth.js`](js/drive-auth.js) — autorización: **authorization-code + PKCE**. El
  `refresh_token` vive en localStorage y el access token solo en memoria, renovado en silencio.
  Es lo que hace que la sincronización automática siga funcionando pasada la primera hora; el
  implicit flow anterior daba tokens de 1h sin renovación, así que el "auto-sync" moría solo.
- [`auth/callback.html`](auth/callback.html) — destino del popup de Google; devuelve el código
  por `BroadcastChannel` y se cierra.
- [`workers/auth/`](workers/auth/) — Worker `arete-auth`, gemelo del de bookreader. Custodia el
  `client_secret` (el navegador no puede) y hace de intermediario con Google. No guarda nada.
  Deploy: `npx wrangler deploy --cwd workers/auth`. El secreto:
  `npx wrangler secret put GOOGLE_CLIENT_SECRET --cwd workers/auth`.
- [`js/drive.js`](js/drive.js) — llamadas a la API. Un 401 renueva el token y reintenta una vez;
  solo si vuelve a fallar se considera permiso perdido y se pide reconectar.

**Cada origen nuevo desde el que se sirva la app** hay que darlo de alta en el OAuth client de
Google Cloud Console, y en dos sitios distintos: **orígenes JavaScript autorizados** y **URIs de
redirección autorizados** (`<origen>/auth/callback.html`). Además hay que añadirlo a
`ALLOWED_ORIGINS` en [`workers/auth/wrangler.toml`](workers/auth/wrangler.toml) y redesplegar el
Worker, o el CORS lo rechaza con un 403.
