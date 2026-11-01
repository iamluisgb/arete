// ── Embudo de producto en Umami ─────────────────────────────────────────────
//
// Umami solo carga en arete.raiatech.com (ver app.html), así que en local y en
// tests `window.umami` no existe y esto no hace nada. Sin datos personales:
// nombres de evento y, como mucho, una categoría (dominio, fuente, tipo).
//
// El tracker se carga con `defer`: un evento que llegue antes se reintenta una
// vez a los 4 s en vez de perderse.

export function track(name, data) {
  try {
    if (window.umami?.track) { window.umami.track(name, data); return; }
    if (location.hostname !== 'arete.raiatech.com') return;
    setTimeout(() => { try { window.umami?.track(name, data); } catch { /* sin analítica */ } }, 4000);
  } catch { /* la analítica nunca rompe la app */ }
}

/** Solo la primera vez en este dispositivo: «primer entreno», «primer test»… */
export function trackOnce(key, name, data) {
  try {
    const k = 'areteTrack_' + key;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, '1');
  } catch { return; }
  track(name, data);
}
