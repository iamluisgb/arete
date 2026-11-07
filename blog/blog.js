// Mejoras de lectura del blog. Todo es progresivo: sin JS el artículo se lee
// entero igual. Lo carga cada artículo con <script src="blog.js" defer>
// (la etiqueta la pone scripts/blog-sync.mjs).
(function () {
  var body = document.querySelector('.article-body');
  if (!body) return;
  // Las tablas anchas se desplazan dentro de su caja y no empujan la página.
  [].forEach.call(body.querySelectorAll('table'), function (t) {
    if (t.parentElement.classList.contains('table-scroll')) return;
    var w = document.createElement('div'); w.className = 'table-scroll';
    t.parentNode.insertBefore(w, t); w.appendChild(t);
  });
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // /blog/dominios(.html) → dominios · /protocolos/sueno/ → sueno
  var slug = location.pathname.replace(/\/(index)?(\.html)?$/, '').split('/').pop().replace(/\.html$/, '');

  function track(name, data) {
    try { if (window.umami && window.umami.track) window.umami.track(name, data); } catch (e) {}
  }

  // Índice de secciones: solo en artículos largos (5+ secciones) que no traen
  // el suyo. Los protocolos ya no lo traen: sus fases son h2 y salen aquí.
  var heads = [].slice.call(body.querySelectorAll('h2[id]')).filter(function (h) { return !h.closest('.read-next'); });
  var links = [];
  if (heads.length >= 5 && !document.querySelector('.toc')) {
    var nav = document.createElement('nav');
    nav.className = 'art-toc';
    nav.setAttribute('aria-label', 'En este artículo');
    var details = document.createElement('details');
    var summary = document.createElement('summary');
    summary.textContent = 'En este artículo';
    var ol = document.createElement('ol');
    heads.forEach(function (h) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.trim();
      a.addEventListener('click', function () { if (innerWidth < 1180) details.open = false; });
      li.appendChild(a); ol.appendChild(li); links.push(a);
    });
    details.appendChild(summary); details.appendChild(ol); nav.appendChild(details);
    body.parentNode.insertBefore(nav, body);
    // En escritorio el índice va fijo a la derecha y siempre abierto.
    var wide = matchMedia('(min-width: 1180px)');
    var sync = function () { details.open = wide.matches; };
    sync(); wide.addEventListener('change', sync);

    if ('IntersectionObserver' in window) {
      var current = null;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var i = heads.indexOf(e.target);
          if (current) current.classList.remove('current');
          current = links[i]; current.classList.add('current');
        });
      }, { rootMargin: '0px 0px -70% 0px' });
      heads.forEach(function (h) { io.observe(h); });
    }
  }

  // Progreso de lectura, volver arriba y «artículo leído» (una vez por visita).
  var bar = document.createElement('div');
  bar.className = 'read-progress'; bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  var top = document.createElement('button');
  top.type = 'button'; top.className = 'to-top'; top.setAttribute('aria-label', 'Volver arriba'); top.textContent = '↑';
  top.addEventListener('click', function () { scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  document.body.appendChild(top);

  var end = body.querySelector('.read-next') || body.lastElementChild;
  var read = false, ticking = false;
  function onScroll() {
    ticking = false;
    var start = body.offsetTop, stop = end.offsetTop - innerHeight * 0.6;
    var p = Math.min(1, Math.max(0, (scrollY - start + innerHeight * 0.3) / Math.max(1, stop - start)));
    bar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
    top.classList.toggle('show', scrollY > innerHeight * 1.5);
    if (!read && p >= 0.9) { read = true; track('Artículo leído', { articulo: slug }); }
  }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // Clic en la invitación final a la app.
  [].forEach.call(body.querySelectorAll('a.cta'), function (a) {
    a.addEventListener('click', function () { track('Blog: abrir app', { sitio: 'artículo', articulo: slug }); });
  });
})();
