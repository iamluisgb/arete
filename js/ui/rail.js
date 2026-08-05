// Rail colapsable.
//
// De 1024px hacia arriba la navegación es un rail lateral de 232px que hasta
// ahora no se podía quitar. En una sesión de análisis con tablas anchas eso son
// 232px permanentemente perdidos, y el atleta que se sienta a mirar su historial
// en un monitor los está pagando en cada pantalla.
//
// Tres reglas que sostienen esto:
//
//  1. **El estado vive en :root, no en la nav.** El ancho del rail es --rail-w,
//     y de --rail-w cuelgan la shell, el panel de Quirón, la barra de detalle y
//     los toasts. Plegar es cambiar una variable; ningún componente se entera.
//  2. **Se recuerda.** Quien pliega el rail lo pliega para su forma de trabajar,
//     no para una pantalla. Va a localStorage, como el tema.
//  3. **El nombre del destino no se pierde.** En modo icono la etiqueta se va a
//     un clip de lector de pantalla y el nombre pasa a `title`, que es el
//     tooltip nativo. Sin eso, el rail plegado son cinco pictogramas a adivinar.
//
// Por debajo de 1024 no hay rail: la nav es la barra inferior y esto no aplica.
// El módulo no se molesta en comprobarlo — la clase no tiene efecto porque las
// reglas de CSS que la leen viven dentro del media query.

const KEY = 'areteRail';

/** ¿Está el rail en modo icono? */
export function isRailCollapsed() {
  return localStorage.getItem(KEY) === 'icon';
}

function paint(collapsed) {
  document.documentElement.classList.toggle('rail-collapsed', collapsed);

  const toggle = document.getElementById('railToggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Desplegar la navegación' : 'Plegar la navegación';
    toggle.setAttribute('aria-label', label);
    toggle.title = `${label} (N)`;
    const icon = toggle.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = collapsed ? 'left_panel_open' : 'left_panel_close';
  }

  // El tooltip de cada destino solo existe plegado: expandido duplicaría una
  // etiqueta que ya se está leyendo.
  document.querySelectorAll('nav button[data-sec]').forEach(btn => {
    const name = btn.querySelector('span:not(.material-symbols-outlined)')?.textContent?.trim();
    if (!name) return;
    if (collapsed) btn.title = name;
    else btn.removeAttribute('title');
  });
}

export function setRailCollapsed(collapsed) {
  localStorage.setItem(KEY, collapsed ? 'icon' : 'open');
  paint(collapsed);
}

export function toggleRail() {
  setRailCollapsed(!isRailCollapsed());
}

export function initRail() {
  paint(isRailCollapsed());
  document.getElementById('railToggle')?.addEventListener('click', toggleRail);
}

// El estado se aplica antes de que el módulo se inicialice para que el rail no
// se vea abierto y salte a plegado. Es el mismo truco que usa el tema en
// app.js; con módulos ES no hay forma de adelantarlo más sin un script inline.
if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('rail-collapsed', isRailCollapsed());
}
