// Hoja con la animación 3D de un ejercicio. Three.js, el motor y el modelo
// (~1,9 MB entre todo) se cargan la primera vez que se abre; después quedan en
// la caché del service worker y la hoja abre sin red.

const BASE = 'assets/anim3d/';
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);

let el = null;              // la hoja
let engine = null;          // { stage, figure, props, EXERCISES }
let loading = null;
let ex = null, t = 0, last = 0, lastPhase = -1;

function build() {
  el = document.createElement('div');
  el.className = 'sheet anim3d-sheet';
  el.id = 'anim3dSheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'anim3dTitle');
  el.innerHTML = `<div class="sheet-panel">
    <div class="sheet-head">
      <h3 class="sheet-title" id="anim3dTitle"></h3>
      <button class="btn btn--ghost btn--icon" type="button" data-close aria-label="Cerrar" title="Cerrar (Esc)"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
    </div>
    <div class="sheet-body">
      <div class="anim3d-stage"><p class="anim3d-phase" aria-live="polite"></p></div>
      <div class="anim3d-tempo"></div>
      <div class="train-mode anim3d-cams" role="group" aria-label="Vista">
        <button type="button" class="train-mode-btn" data-cam="side">Lado</button>
        <button type="button" class="train-mode-btn" data-cam="three">3/4</button>
        <button type="button" class="train-mode-btn" data-cam="front">Frente</button>
      </div>
      <p class="anim3d-note">En pruebas · arrastra para girar la figura</p>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => {
    if (e.target === el || e.target.closest('[data-close]')) close();
    const cam = e.target.closest('[data-cam]');
    if (cam && engine) setCam(cam.dataset.cam);
  });
  new ResizeObserver(() => engine?.stage.resize()).observe(el.querySelector('.anim3d-stage'));
}

function setCam(name) {
  engine.stage.setCam(name, ex?.view);
  el.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b.dataset.cam === name));
}

async function load() {
  const [{ createStage }, { createFigure }, { createProps }, { EXERCISES }] = await Promise.all([
    import('./stage.js'), import('./figure.js'), import('./props.js'), import('./exercises.js'),
  ]);
  const stage = createStage(el.querySelector('.anim3d-stage'));
  const props = createProps(stage.scene);
  const figure = await createFigure(stage.scene, BASE);
  engine = { stage, figure, props, EXERCISES };
}

function sAt(time) {
  const cycle = ex.tempo.reduce((a, p) => a + p.dur, 0);
  let left = time % cycle;
  for (let i = 0; i < ex.tempo.length; i++) {
    const p = ex.tempo[i];
    if (left < p.dur) return { s: p.from + (p.to - p.from) * ease(left / p.dur), i, rest: p.dur - left };
    left -= p.dur;
  }
  return { s: ex.tempo[0].from, i: 0, rest: 0 };
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) t += dt;
  const { s, i, rest } = sAt(t);
  const pose = ex.pose(s);
  engine.figure.apply(pose);
  engine.props.place(pose.props);
  if (i !== lastPhase) {
    el.querySelectorAll('.anim3d-tempo span').forEach((x, j) => x.classList.toggle('on', j === i));
    lastPhase = i;
  }
  el.querySelector('.anim3d-phase').textContent = `${ex.tempo[i].label} · ${Math.ceil(rest)} s`;
  engine.stage.controls.update();
  engine.props.update(engine.stage.camera);
  engine.stage.renderer.render(engine.stage.scene, engine.stage.camera);
}

/** Abre la animación del ejercicio `id` (de catalog.js). */
export async function openAnim3d(id, title) {
  if (!el) build();
  el.querySelector('#anim3dTitle').textContent = title || '';
  el.querySelector('.anim3d-phase').textContent = 'Cargando la figura…';
  el.querySelector('.anim3d-tempo').innerHTML = '';
  el.classList.add('open');
  try {
    loading = loading || load();
    await loading;
  } catch (err) {
    loading = null;
    el.querySelector('.anim3d-phase').textContent = 'No se pudo cargar la animación. Prueba con conexión.';
    console.error(err);
    return;
  }
  if (!el.classList.contains('open')) return;          // se cerró mientras cargaba
  ex = engine.EXERCISES.find(e => e.id === id);
  if (!ex) { close(); return; }
  t = 0; lastPhase = -1; last = performance.now();
  el.querySelector('.anim3d-tempo').innerHTML = ex.tempo
    .map(p => `<span>${p.label} ${String(p.dur).replace('.', ',')} s</span>`).join('');
  engine.stage.resize();
  setCam(ex.cam);
  engine.stage.renderer.setAnimationLoop(frame);
}

export function close() {
  if (!el) return;
  el.classList.remove('open');
  engine?.stage.renderer.setAnimationLoop(null);      // sin la hoja abierta, nada dibuja
}
