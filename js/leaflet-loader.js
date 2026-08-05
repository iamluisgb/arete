// Leaflet bajo demanda.
//
// Estaba en el <head> como hoja de estilos (render-blocking) y como <script>
// síncrono al final del body, para una librería que solo hace falta en tres
// sitios: el mapa de la carrera en vivo, el del resumen y el del detalle. Es
// decir: todo el mundo pagaba 150 KB en el arranque para una pantalla a la que
// la mayoría de sesiones no llega.
//
// El service worker es network-first con caché de runtime, así que a partir de
// la primera carga sale de caché y sigue funcionando sin conexión.

const CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const CSS_SRI = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';
const JS_SRI = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';

let pending = null;

function inject(tag, attrs) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`No se pudo cargar ${attrs.href || attrs.src}`));
    document.head.appendChild(el);
  });
}

/**
 * Carga Leaflet una sola vez y resuelve cuando `window.L` está disponible.
 * Resuelve a `false` si no se pudo cargar (sin conexión y sin caché), para que
 * quien llame pinte su estado alternativo en vez de romperse.
 *
 * @returns {Promise<boolean>}
 */
export function ensureLeaflet() {
  if (typeof L !== 'undefined') return Promise.resolve(true);
  if (pending) return pending;
  pending = Promise.all([
    inject('link', { rel: 'stylesheet', href: CSS_URL, integrity: CSS_SRI, crossOrigin: 'anonymous' }),
    inject('script', { src: JS_URL, integrity: JS_SRI, crossOrigin: 'anonymous' }),
  ])
    .then(() => typeof L !== 'undefined')
    .catch(() => {
      // Sin memoizar el fallo: si vuelve la conexión, el siguiente intento
      // tiene que poder cargarla.
      pending = null;
      return false;
    });
  return pending;
}
