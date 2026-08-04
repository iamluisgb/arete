// ── Qué puede hacer esta plataforma ──────────────────────
//
// Areté corre en dos sitios con capacidades distintas y no conviene fingir que
// son el mismo: la PWA en el navegador y el wrapper nativo de Capacitor.
//
// El tracking GPS continuo es la diferencia que importa. En Android el wrapper
// tiene un foreground service nativo y funciona con la pantalla bloqueada. En el
// navegador no: `watchPosition` se estrangula en segundo plano, y por eso la app
// llegaba a pedirle al usuario "mantén la pantalla encendida para GPS continuo"
// — una app confesando que no puede cumplir lo que ofrece.
//
// Así que el tracker no se borra: se ofrece solo donde funciona.

/** ¿Estamos dentro del wrapper nativo de Capacitor? */
export function isNativePlatform() {
  if (typeof window === 'undefined') return false;
  const cap = window.Capacitor;
  if (!cap) return false;
  // `isNativePlatform` es la API moderna; `isNative` la de Capacitor 3.
  if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform();
  return !!cap.isNative;
}

/**
 * ¿Puede esta plataforma medir una carrera de principio a fin?
 * No basta con tener `geolocation`: el navegador la tiene y aun así no sirve.
 */
export function canTrackRuns() {
  return isNativePlatform();
}
