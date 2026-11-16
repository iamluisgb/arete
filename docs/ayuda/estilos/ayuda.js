// Ayuda de Areté: tema, navegación, índice de la página y búsqueda.
//
// Sin dependencias y sin build: este fichero se sirve tal cual. Hace cuatro cosas
// y ninguna toca los datos del atleta.

// ── Tema ──────────────────────────────────────────────────
// Misma clave que la app (`areteTheme`): si el atleta eligió oscuro en Ajustes,
// la ayuda abre oscura. El ciclo es automático → claro → oscuro → automático, así
// que la preferencia del sistema se puede recuperar. `data-tema` en <html> es la
// única fuente de verdad: el icono del botón lo elige la hoja con ese atributo.
(function tema() {
  const KEY = 'areteTheme';
  const MODOS = ['auto', 'light', 'dark'];
  const ETIQUETA = {
    auto: ['Tema automático', 'claro'],
    light: ['Tema claro', 'oscuro'],
    dark: ['Tema oscuro', 'automático'],
  };
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const boton = document.querySelector('.doc-theme');
  const normal = (v) => (v === 'light' || v === 'dark' ? v : 'auto');

  function aplicar(modo) {
    const oscuro = modo === 'dark' || (modo === 'auto' && mq.matches);
    document.documentElement.classList.toggle('dark', oscuro);
    document.documentElement.setAttribute('data-tema', modo);
    if (boton) {
      const [nombre, siguiente] = ETIQUETA[modo];
      boton.setAttribute('aria-label', `${nombre}. Cambiar a ${siguiente}`);
      boton.title = nombre;
    }
  }

  let modo = normal((() => { try { return localStorage.getItem(KEY); } catch { return null; } })());
  aplicar(modo); // el script del <head> ya lo aplicó; esto solo sincroniza el botón

  mq.addEventListener('change', () => { if (modo === 'auto') aplicar('auto'); });
  if (boton) boton.addEventListener('click', () => {
    modo = MODOS[(MODOS.indexOf(modo) + 1) % MODOS.length];
    try { localStorage.setItem(KEY, modo); } catch { /* modo privado */ }
    aplicar(modo);
  });
})();

// ── Navegación en móvil ───────────────────────────────────
// Dos disparadores para el mismo cajón: el icono de la cabecera y la fila
// «Secciones» que se ve al entrar en una página desde el móvil.
(function navegacion() {
  const lado = document.getElementById('docSide');
  if (!lado) return;
  const botones = [...document.querySelectorAll('.doc-nav-toggle, .doc-side-toggle')];
  const cerrar = () => {
    lado.classList.remove('is-open');
    botones.forEach(b => b.setAttribute('aria-expanded', 'false'));
  };
  botones.forEach(boton => boton.addEventListener('click', () => {
    const abierto = lado.classList.toggle('is-open');
    botones.forEach(b => b.setAttribute('aria-expanded', String(abierto)));
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lado.classList.contains('is-open')) cerrar();
  });
})();

// ── Grupos plegables ──────────────────────────────────────
// El grupo de la página abierta llega abierto del generador; los que el lector
// abre a mano se recuerdan entre páginas. Lo que no se guarda es el grupo que se
// abre solo por ser el actual: si no, navegar deja el menú con medio árbol abierto.
(function grupos() {
  const KEY = 'areteHelpGrupos';
  const cajas = [...document.querySelectorAll('.doc-side-group')];
  if (!cajas.length) return;
  const clave = (d) => (d.querySelector('summary')?.textContent || '').trim();
  let abiertos = [];
  try { abiertos = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { /* modo privado */ }
  if (Array.isArray(abiertos)) {
    for (const d of cajas) if (abiertos.includes(clave(d))) d.open = true;
  }
  // Los `toggle` que provocan las líneas de arriba llegan en una tarea posterior:
  // hasta que pase, no son decisiones del lector y no se guardan.
  let listo = false;
  setTimeout(() => { listo = true; }, 0);
  for (const d of cajas) d.addEventListener('toggle', () => {
    if (!listo) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(cajas.filter(x => x.open).map(clave)));
    } catch { /* modo privado */ }
  });
})();

// ── «En esta página» ──────────────────────────────────────
// Marca el encabezado en el que estás. Se calcula con las posiciones reales en
// lugar de con un IntersectionObserver: con secciones cortas, el observador
// parpadea entre dos y el índice deja de decir dónde estás.
(function indice() {
  const toc = document.querySelector('.doc-toc');
  if (!toc) return;
  const enlaces = [...toc.querySelectorAll('a[href^="#"]')];
  const destinos = enlaces
    .map(a => document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))))
    .filter(Boolean);
  if (destinos.length < 2) return;

  let pendiente = false;
  function marcar() {
    pendiente = false;
    const y = window.scrollY + 120;
    let activo = destinos[0];
    for (const d of destinos) {
      if (d.getBoundingClientRect().top + window.scrollY <= y) activo = d;
    }
    // Al final del documento la última sección no llega a cruzar la línea de
    // 120 px si es corta: sin esto el índice se queda marcando la penúltima.
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      activo = destinos[destinos.length - 1];
    }
    const actual = '#' + activo.id;
    for (const a of enlaces) {
      const on = a.getAttribute('href') === actual;
      a.classList.toggle('is-activo', on);
      if (on) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  }
  window.addEventListener('scroll', () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(marcar);
  }, { passive: true });
  marcar();
})();

// ── Búsqueda ──────────────────────────────────────────────
// El índice lo genera `scripts/build-ayuda.mjs` desde los artículos: título,
// resumen y los primeros 900 caracteres. Se carga al primer uso — no en cada
// visita al artículo.
(function busqueda() {
  const input = document.getElementById('docQ');
  const caja = document.getElementById('docRes');
  if (!input || !caja) return;
  const cajaPadre = input.closest('.doc-search');

  const norm = (s) => String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let indice = null;
  let cargando = null;
  let activo = -1;

  function cargar() {
    if (indice) return Promise.resolve(indice);
    if (cargando) return cargando;
    cargando = fetch('/ayuda/indice.json')
      .then(r => r.ok ? r.json() : [])
      .then(d => (indice = d))
      .catch(() => (indice = []));
    return cargando;
  }

  function pintar(items, consulta) {
    cajaPadre?.classList.toggle('is-escribiendo', Boolean(consulta));
    if (!consulta) { caja.hidden = true; caja.innerHTML = ''; return; }
    if (!items.length) {
      caja.innerHTML = `<div class="doc-res-empty">Nada con «${escapar(consulta)}».
        Prueba con «test», «plan», «copia» o <a href="mailto:hola@arete.raiatech.com">escríbenos</a>.</div>`;
      caja.hidden = false;
      return;
    }
    caja.innerHTML = items.map((it, i) => `<a href="${it.url}"${i === 0 ? ' class="is-on"' : ''}>
      <span class="doc-res-title">${escapar(it.title)}</span>
      <span class="doc-res-note">${escapar(it.resumen || it.cuadrante)}</span>
    </a>`).join('');
    caja.hidden = false;
    activo = 0;
  }

  function buscar(q) {
    const consulta = norm(q).trim();
    if (consulta.length < 2) { pintar([], ''); return; }
    const palabras = consulta.split(/\s+/).filter(Boolean);
    const puntos = [];
    for (const it of indice || []) {
      const titulo = norm(it.title), resumen = norm(it.resumen || ''), texto = norm(it.texto || '');
      let p = 0;
      for (const w of palabras) {
        if (titulo.includes(w)) p += 12;
        if (resumen.includes(w)) p += 4;
        const enTexto = texto.split(w).length - 1;
        if (enTexto) p += 1 + Math.min(enTexto, 3);
      }
      if (p > 0) puntos.push({ it, p });
    }
    puntos.sort((a, b) => b.p - a.p || a.it.title.localeCompare(b.it.title, 'es'));
    pintar(puntos.slice(0, 6).map(x => x.it), q);
  }

  function escapar(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  input.addEventListener('focus', cargar);
  input.addEventListener('input', async () => {
    await cargar();
    buscar(input.value);
  });
  input.addEventListener('keydown', (e) => {
    const enlaces = [...caja.querySelectorAll('a')];
    if (e.key === 'Escape') { caja.hidden = true; input.blur(); return; }
    if (!enlaces.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activo = (activo + (e.key === 'ArrowDown' ? 1 : -1) + enlaces.length) % enlaces.length;
      enlaces.forEach((a, i) => a.classList.toggle('is-on', i === activo));
    }
    if (e.key === 'Enter' && activo >= 0) { e.preventDefault(); enlaces[activo].click(); }
  });
  document.addEventListener('click', (e) => {
    if (!caja.contains(e.target) && e.target !== input) caja.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });
})();
