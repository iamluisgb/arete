// Coherence: bump CACHE_NAME whenever ASSETS or the content of ANY file in it
// changes — the SW is cache-first, so a stale name keeps serving old bytes.
const CACHE_NAME = 'arete-v198';
const ASSETS = [
  './',
  './app.html',
  './app.css',
  './index.html',
  './style.css',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './blog/index.html',
  './blog/filosofia-arete.html',
  './blog/8-dominios.html',
  './blog/programa-arete.html',
  './blog/crear-plan.html',
  './blog/nutricion.html',
  './blog/suplementos.html',
  './blog/efecto-kettlebell.html',
  './programs.json',
  './programs/arete.json',
  './programs/kettlebell.json',
  './programs/running/media-maraton-1h40.json',
  './js/ui/running.js',
  './js/ui/running-tracker.js',
  './js/ui/audio.js',
  './js/ui/running-audio.js',
  './js/ui/training-timer.js',
  './js/ui/hr-monitor.js',
  './js/run-store.js',
  './assets/silence.mp3',
  './js/exercise-media.js',
  './js/exercise-ontology.js',
  './assets/exercises/barbell-ab-rollout-peak.webp',
  './assets/exercises/barbell-ab-rollout-start.webp',
  './assets/exercises/barbell-calf-raise-peak.webp',
  './assets/exercises/barbell-calf-raise-start.webp',
  './assets/exercises/barbell-curl-peak.webp',
  './assets/exercises/barbell-curl-start.webp',
  './assets/exercises/barbell-reverse-lunge-peak.webp',
  './assets/exercises/barbell-reverse-lunge-start.webp',
  './assets/exercises/barbell-row-peak.webp',
  './assets/exercises/barbell-row-start.webp',
  './assets/exercises/bench-dips-peak.webp',
  './assets/exercises/bench-dips-start.webp',
  './assets/exercises/bench-press-peak.webp',
  './assets/exercises/bench-press-start.webp',
  './assets/exercises/bodyweight-squat-peak.webp',
  './assets/exercises/bulgarian-split-squat-peak.webp',
  './assets/exercises/bulgarian-split-squat-start.webp',
  './assets/exercises/chest-supported-kettlebell-row-peak.webp',
  './assets/exercises/chest-supported-kettlebell-row-start.webp',
  './assets/exercises/clap-push-ups-peak.webp',
  './assets/exercises/clap-push-ups-start.webp',
  './assets/exercises/clean-peak.webp',
  './assets/exercises/clean-start.webp',
  './assets/exercises/crunches-peak.webp',
  './assets/exercises/crunches-start.webp',
  './assets/exercises/diamond-push-ups-peak.webp',
  './assets/exercises/diamond-push-ups-start.webp',
  './assets/exercises/dips-peak.webp',
  './assets/exercises/dips-start.webp',
  './assets/exercises/double-kettlebell-dead-clean-peak.webp',
  './assets/exercises/double-kettlebell-dead-clean-start.webp',
  './assets/exercises/double-kettlebell-dead-split-snatch-peak.webp',
  './assets/exercises/double-kettlebell-dead-split-snatch-start.webp',
  './assets/exercises/double-kettlebell-swing-snatch-peak.webp',
  './assets/exercises/double-kettlebell-swing-snatch-start.webp',
  './assets/exercises/hanging-leg-raise-peak.webp',
  './assets/exercises/hanging-leg-raise-start.webp',
  './assets/exercises/high-plank-main.webp',
  './assets/exercises/inverted-row-peak.webp',
  './assets/exercises/inverted-row-start.webp',
  './assets/exercises/jump-squat-peak.webp',
  './assets/exercises/jump-squat-start.webp',
  './assets/exercises/jumping-jacks-peak.webp',
  './assets/exercises/jumping-jacks-start.webp',
  './assets/exercises/kettlebell-deadlift-peak.webp',
  './assets/exercises/kettlebell-deadlift-start.webp',
  './assets/exercises/kettlebell-floor-press-peak.webp',
  './assets/exercises/kettlebell-floor-press-start.webp',
  './assets/exercises/kettlebell-goblet-lunge-peak.webp',
  './assets/exercises/kettlebell-goblet-lunge-start.webp',
  './assets/exercises/kettlebell-pistol-squat-peak.webp',
  './assets/exercises/kettlebell-pistol-squat-start.webp',
  './assets/exercises/kettlebell-sumo-high-pull-peak.webp',
  './assets/exercises/kettlebell-sumo-high-pull-start.webp',
  './assets/exercises/kettlebell-swing-peak.webp',
  './assets/exercises/kettlebell-swing-start.webp',
  './assets/exercises/kettlebell-turkish-get-ups-peak.webp',
  './assets/exercises/kettlebell-turkish-get-ups-start.webp',
  './assets/exercises/kettlebell-windmills-peak.webp',
  './assets/exercises/kettlebell-windmills-start.webp',
  './assets/exercises/knee-push-ups-peak.webp',
  './assets/exercises/knee-push-ups-start.webp',
  './assets/exercises/lunge-peak.webp',
  './assets/exercises/lunge-start.webp',
  './assets/exercises/mountain-climbers-peak.webp',
  './assets/exercises/mountain-climbers-start.webp',
  './assets/exercises/negative-pull-ups-peak.webp',
  './assets/exercises/negative-pull-ups-start.webp',
  './assets/exercises/ohp-peak.webp',
  './assets/exercises/ohp-start.webp',
  './assets/exercises/one-arm-kettlebell-bottoms-up-press-peak.webp',
  './assets/exercises/one-arm-kettlebell-bottoms-up-press-start.webp',
  './assets/exercises/one-arm-kettlebell-front-squat-peak.webp',
  './assets/exercises/one-arm-kettlebell-front-squat-start.webp',
  './assets/exercises/one-arm-kettlebell-push-press-peak.webp',
  './assets/exercises/one-arm-kettlebell-push-press-start.webp',
  './assets/exercises/one-arm-kettlebell-row-peak.webp',
  './assets/exercises/one-arm-kettlebell-row-start.webp',
  './assets/exercises/pike-push-ups-peak.webp',
  './assets/exercises/pike-push-ups-start.webp',
  './assets/exercises/pistol-squat-peak.webp',
  './assets/exercises/pistol-squat-start.webp',
  './assets/exercises/plank-main.webp',
  './assets/exercises/pull-up-peak.webp',
  './assets/exercises/pull-up-start.webp',
  './assets/exercises/push-press-peak.webp',
  './assets/exercises/push-press-start.webp',
  './assets/exercises/push-up-peak.webp',
  './assets/exercises/push-up-start.webp',
  './assets/exercises/side-lunge-peak.webp',
  './assets/exercises/side-lunge-start.webp',
  './assets/exercises/side-plank-main.webp',
  './assets/exercises/sit-ups-peak.webp',
  './assets/exercises/sit-ups-start.webp',
  './js/ui/exercise-pict.js',
  './js/ui/set-runner.js',
  './js/bg-worker.js',
  './js/ui/running-helpers.js',
  './js/ui/running-history.js',
  './js/ui/running-calendar.js',
  './js/ui/share-editor.js',
  './js/ui/profile-card.js',
  './js/ui/card-kit.js',
  './js/ui/session-card.js',
  './js/ui/running-progress.js',
  './js/ui/running-plan.js',
  './js/app.js',
  './js/data.js',
  './js/schedule.js',
  './js/programs.js',
  './js/sessions.js',
  './js/progression.js',
  './js/migrate-origin.js',
  './js/utils.js',
  './js/constants.js',
  './js/ui/wizard.js',
  './js/ui/sortable.js',
  './js/ui/nav.js',
  './js/ui/plan-sheet.js',
  './js/anim3d/catalog.js',
  './assets/anim3d/frames/deadlift-0.webp',
  './assets/anim3d/frames/deadlift-1.webp',
  './assets/anim3d/frames/deadlift-2.webp',
  './assets/anim3d/frames/deadlift-3.webp',
  './assets/anim3d/frames/elevacion-talones-0.webp',
  './assets/anim3d/frames/elevacion-talones-1.webp',
  './assets/anim3d/frames/elevacion-talones-2.webp',
  './assets/anim3d/frames/elevacion-talones-3.webp',
  './assets/anim3d/frames/front-squat-0.webp',
  './assets/anim3d/frames/front-squat-1.webp',
  './assets/anim3d/frames/front-squat-2.webp',
  './assets/anim3d/frames/front-squat-3.webp',
  './assets/anim3d/frames/kb-deadlift-0.webp',
  './assets/anim3d/frames/kb-deadlift-1.webp',
  './assets/anim3d/frames/kb-deadlift-2.webp',
  './assets/anim3d/frames/kb-deadlift-3.webp',
  './assets/anim3d/frames/kb-deadlift-maleta-0.webp',
  './assets/anim3d/frames/kb-deadlift-maleta-1.webp',
  './assets/anim3d/frames/kb-deadlift-maleta-2.webp',
  './assets/anim3d/frames/kb-deadlift-maleta-3.webp',
  './assets/anim3d/frames/kb-deadlift-sumo-0.webp',
  './assets/anim3d/frames/kb-deadlift-sumo-1.webp',
  './assets/anim3d/frames/kb-deadlift-sumo-2.webp',
  './assets/anim3d/frames/kb-deadlift-sumo-3.webp',
  './assets/anim3d/frames/kb-sentadilla-0.webp',
  './assets/anim3d/frames/kb-sentadilla-1.webp',
  './assets/anim3d/frames/kb-sentadilla-2.webp',
  './assets/anim3d/frames/kb-sentadilla-3.webp',
  './assets/anim3d/frames/kb-single-leg-deadlift-0.webp',
  './assets/anim3d/frames/kb-single-leg-deadlift-1.webp',
  './assets/anim3d/frames/kb-single-leg-deadlift-2.webp',
  './assets/anim3d/frames/kb-single-leg-deadlift-3.webp',
  './assets/anim3d/frames/pistol-squat-0.webp',
  './assets/anim3d/frames/pistol-squat-1.webp',
  './assets/anim3d/frames/pistol-squat-2.webp',
  './assets/anim3d/frames/pistol-squat-3.webp',
  './assets/anim3d/frames/pm-unilateral-0.webp',
  './assets/anim3d/frames/pm-unilateral-1.webp',
  './assets/anim3d/frames/pm-unilateral-2.webp',
  './assets/anim3d/frames/pm-unilateral-3.webp',
  './assets/anim3d/frames/rack-squat-0.webp',
  './assets/anim3d/frames/rack-squat-1.webp',
  './assets/anim3d/frames/rack-squat-2.webp',
  './assets/anim3d/frames/rack-squat-3.webp',
  './assets/anim3d/frames/romanian-deadlift-0.webp',
  './assets/anim3d/frames/romanian-deadlift-1.webp',
  './assets/anim3d/frames/romanian-deadlift-2.webp',
  './assets/anim3d/frames/romanian-deadlift-3.webp',
  './assets/anim3d/frames/sentadilla-basica-0.webp',
  './assets/anim3d/frames/sentadilla-basica-1.webp',
  './assets/anim3d/frames/sentadilla-basica-2.webp',
  './assets/anim3d/frames/sentadilla-basica-3.webp',
  './assets/anim3d/frames/squat-0.webp',
  './assets/anim3d/frames/squat-1.webp',
  './assets/anim3d/frames/squat-2.webp',
  './assets/anim3d/frames/squat-3.webp',
  './js/domains.js',
  './js/platform.js',
  './js/leaflet-loader.js',
  './js/ui/run-import.js',
  './js/ui/profile.js',
  './js/ui/domain-test.js',
  './js/ui/training.js',
  './js/ui/calendar.js',
  './js/ui/history.js',
  './js/ui/progress.js',
  './js/ui/body.js',
  './js/ui/settings.js',
  './js/ui/timer.js',
  './js/ui/toast.js',
  './js/ui/shortcuts.js',
  './js/ui/drive-ui.js',
  './js/drive.js',
  './js/drive-auth.js',
  './js/sync/merge.js',
  './js/sync/schema.js',
  './js/sync/engine.js',
  './js/sync/quiron.js',
  './js/quiron-memory.js',
  './js/ui/quiron.js',
  './js/ai/llm.js',
  './js/ai/dictation-engine.js',
  './js/ai/mic.js',
  './js/ai/metrics.js',
  './js/ai/context.js',
  './js/ai/tools.js',
  './js/ai/exercise-catalog.js',
  './js/ai/soul.js'
];

// Install: cache all assets and activate immediately.
//
// `cache: 'reload'` en cada asset, no `cache.addAll`: esa API va por la caché
// HTTP, y esta app no tiene build ni nombres con hash. Con el TTL de 4h de
// Pages, un service worker nuevo podía precachear el JavaScript VIEJO —el del
// navegador— y quedarse ahí. `reload` salta la caché HTTP y trae el fichero del
// servidor: es lo que hace que "CACHE_NAME subió" signifique "código nuevo".
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(ASSETS.map(url =>
        fetch(new Request(url, { cache: 'reload' }))
          .then(res => { if (res.ok) return cache.put(url, res); })
          // Un asset que falla no puede tumbar la instalación entera: la app
          // sigue funcionando con lo que sí entró y red lo reintenta al usarlo.
          .catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches and take control
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first with cache fallback (ensures users always get latest version)
self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (!url.startsWith('http')) return;

  // Nunca cachear auth ni las APIs de Google (Drive lleva datos del usuario y
  // los tokens caducan).
  //
  // Ojo con el filtro: durante un tiempo fue `googleapis.com` a secas, y eso se
  // llevaba por delante a `fonts.googleapis.com`, que es de donde sale el
  // @font-face de Material Symbols. Sin conexión no había hoja de fuentes, y
  // como los iconos son ligaduras, la app se llenaba de "fitness_center" y
  // "directions_run" escritos en texto. Las fuentes SÍ se cachean.
  const isGoogleAuthOrApi = url.includes('accounts.google.com') ||
    url.includes('www.googleapis.com') ||
    url.includes('oauth2.googleapis.com');
  if (isGoogleAuthOrApi) {
    event.respondWith(fetch(event.request));
    return;
  }

  // `no-cache` en las peticiones del mismo origen: obliga a revalidar contra el
  // servidor (ETag → 304 si no cambió). Sin esto, el navegador podía servir un
  // JS de hace cuatro horas junto a un HTML recién desplegado, que es
  // exactamente cómo Quirón se quedó sin botones el 2026-10-20.
  const peticion = url.startsWith(self.location.origin)
    ? new Request(event.request, { cache: 'no-cache' })
    : event.request;

  event.respondWith(
    fetch(peticion)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || (event.request.destination === 'document'
            ? caches.match('./app.html')
            : new Response('Offline', { status: 503 }))
        )
      )
  );
});

// === Live timer notification ===

let timerInterval = null;
let timerState = null;

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateTimerNotification() {
  if (!timerState) return;
  const now = Date.now();
  const elapsed = Math.floor((now - timerState.startedAt) / 1000);

  if (timerState.mode === 'countdown') {
    const remaining = Math.max(0, timerState.duration - elapsed);
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      timerState = null;
      self.registration.showNotification('¡Tiempo!', {
        body: 'Descanso completado',
        icon: './assets/icons/icon-192.png',
        badge: './assets/icons/icon-192.png',
        tag: 'arete-timer',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
      });
      return;
    }
    self.registration.showNotification('Descanso', {
      body: fmtTime(remaining) + ' restantes',
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: 'arete-timer',
      requireInteraction: true,
      silent: true,
    });
  } else {
    const total = timerState.elapsedBase + elapsed;
    self.registration.showNotification('Cronómetro', {
      body: fmtTime(total),
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: 'arete-timer',
      requireInteraction: true,
      silent: true,
    });
  }
}

function stopTimerNotification() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  timerState = null;
  self.registration.getNotifications({ tag: 'arete-timer' })
    .then(ns => ns.forEach(n => n.close()));
}

// Listen for messages from the app
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') { self.skipWaiting(); return; }

  if (event.data?.type === 'timer-start-live') {
    timerState = {
      mode: event.data.mode,
      startedAt: event.data.startedAt,
      duration: event.data.duration,
      elapsedBase: event.data.elapsedBase,
    };
    updateTimerNotification();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerNotification, 1000);
  }
  if (event.data?.type === 'timer-alarm') {
    stopTimerNotification();
    self.registration.showNotification('¡Tiempo!', {
      body: 'Descanso completado',
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: 'arete-timer',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
    });
  }
  if (event.data?.type === 'timer-clear') {
    stopTimerNotification();
  }

  // Running GPS heartbeat
  if (event.data?.type === 'run-start-live') {
    runState = { startedAt: event.data.startedAt, distance: event.data.distance || 0 };
    updateRunNotification();
    if (runInterval) clearInterval(runInterval);
    runInterval = setInterval(updateRunNotification, 5000);
  }
  if (event.data?.type === 'run-update') {
    if (runState) runState.distance = event.data.distance || 0;
  }
  if (event.data?.type === 'run-clear') {
    stopRunNotification();
  }
});

// === Live run notification (GPS heartbeat) ===

let runInterval = null;
let runState = null;

function updateRunNotification() {
  if (!runState) return;
  const elapsed = Math.floor((Date.now() - runState.startedAt) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  const km = (runState.distance / 1000).toFixed(2);
  self.registration.showNotification('Carrera en curso', {
    body: `${min}:${sec.toString().padStart(2, '0')} · ${km} km`,
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-192.png',
    tag: 'arete-run',
    requireInteraction: true,
    silent: true,
  });
  // Ping app to request GPS position
  self.clients.matchAll({ type: 'window' }).then(cls => {
    cls.forEach(c => c.postMessage({ type: 'run-gps-poll' }));
  });
}

function stopRunNotification() {
  if (runInterval) { clearInterval(runInterval); runInterval = null; }
  runState = null;
  self.registration.getNotifications({ tag: 'arete-run' })
    .then(ns => ns.forEach(n => n.close()));
}

// Tap notification → focus app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) { list[0].focus(); return; }
      clients.openWindow('./app.html');
    })
  );
});
