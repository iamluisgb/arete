// Ayuda de Areté: tema, navegación en móvil y búsqueda.
//
// Sin dependencias y sin build: este fichero se sirve tal cual. Hace tres cosas
// y ninguna toca los datos del atleta.

// ── Tema ──────────────────────────────────────────────────
// Misma clave que la app (`areteTheme`): si el atleta eligió oscuro en Ajustes,
// la ayuda abre oscura. Sin elección, manda el sistema.
(function tema() {
  const KEY = 'areteTheme';
  const mq = window.matchMedia('(prefers-color-scheme:dark)');
  const aplicar = () => {
    let guardado = null;
    try { guardado = localStorage.getItem(KEY); } catch { /* modo privado */ }
    const oscuro = guardado === 'dark' || ((guardado === null || guardado === 'auto') && mq.matches);
    document.documentElement.classList.toggle('dark', oscuro);
  };
  aplicar();
  mq.addEventListener('change', aplicar);
})();

// ── Navegación en móvil ───────────────────────────────────
(function navegacion() {
  const boton = document.querySelector('.doc-side-toggle');
  const lado = document.getElementById('docSide');
  if (!boton || !lado) return;
  boton.addEventListener('click', () => {
    const abierto = lado.classList.toggle('is-open');
    boton.setAttribute('aria-expanded', String(abierto));
  });
})();

// ── Búsqueda ──────────────────────────────────────────────
// El índice lo genera `scripts/build-ayuda.mjs` desde los artículos: título,
// resumen y los primeros 900 caracteres. Se carga al primer uso — no en cada
// visita al artículo.
(function busqueda() {
  const input = document.getElementById('docQ');
  const caja = document.getElementById('docRes');
  if (!input || !caja) return;

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
