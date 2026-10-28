// Hoja de revisión: instantáneas de cada ejercicio hechas con un solo
// renderizador, comprobaciones medidas y veredicto de quien revisa (se guarda
// en este navegador).

import { createStage } from './engine/stage.js';
import { createFigure } from './engine/figure.js';
import { createProps } from './engine/props.js';
import { EXERCISES } from './engine/exercises.js';

const KEY = 'arete3dReview';
const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
const save = () => localStorage.setItem(KEY, JSON.stringify(saved));
const $list = document.getElementById('list');
const $count = document.getElementById('count');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Instantáneas: principio, mitad y final de lado; el punto más exigente en 3/4.
// Las profundidades van de 0 a 1; en el peso muerto el 1 es el suelo.
const SHOTS = [['Inicio', 0, null], ['Mitad', 0.5, null], ['Final', 1, null], ['3/4', 1, 'three']];

let family = null;
for (const ex of EXERCISES) {
  if (ex.family !== family) { family = ex.family; $list.insertAdjacentHTML('beforeend', `<h2>${esc(family)}</h2>`); }
  const v = saved[ex.id] || {};
  $list.insertAdjacentHTML('beforeend', `<article class="card" id="c-${ex.id}">
    <div class="head"><span class="name">${esc(ex.name)}</span><span class="meta">${esc(ex.gear)} · ${esc(ex.id)}</span></div>
    <div class="shots">${SHOTS.map(([l]) => `<figure><img alt="${esc(ex.name)}, ${l}"><figcaption>${l}</figcaption></figure>`).join('')}</div>
    <div class="checks" data-checks>Midiendo…</div>
    <div class="verdict">
      <button type="button" data-v="ok" aria-pressed="${v.v === 'ok'}">Bien</button>
      <button type="button" data-v="bad" aria-pressed="${v.v === 'bad'}">Falla</button>
      <input type="text" placeholder="Qué falla (opcional)" value="${esc(v.note || '')}">
      <a href="index.html?ex=${ex.id}">En movimiento</a>
    </div>
  </article>`);
}

function tally() {
  const ok = EXERCISES.filter(e => saved[e.id]?.v === 'ok').length;
  const bad = EXERCISES.filter(e => saved[e.id]?.v === 'bad').length;
  $count.textContent = `${EXERCISES.length} ejercicios · ${ok} bien · ${bad} fallan · ${EXERCISES.length - ok - bad} sin revisar`;
}

$list.addEventListener('click', e => {
  const b = e.target.closest('.verdict button');
  if (!b) return;
  const id = b.closest('.card').id.slice(2);
  saved[id] = { ...saved[id], v: b.dataset.v };
  b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  save(); tally();
});
$list.addEventListener('input', e => {
  if (!e.target.matches('.verdict input')) return;
  const id = e.target.closest('.card').id.slice(2);
  saved[id] = { ...saved[id], note: e.target.value };
  save();
});
document.getElementById('copy').addEventListener('click', async () => {
  const lines = EXERCISES.map(e => {
    const v = saved[e.id] || {};
    const mark = v.v === 'ok' ? 'BIEN' : v.v === 'bad' ? 'FALLA' : 'sin revisar';
    return `- ${e.name} (${e.id}): ${mark}${v.note ? ` — ${v.note}` : ''}`;
  });
  const text = `Revisión tanda 1\n${lines.join('\n')}`;
  try { await navigator.clipboard.writeText(text); document.getElementById('copy').textContent = 'Copiado'; }
  catch { prompt('Copia el resumen:', text); }
});

// ── Render ──
const work = document.getElementById('work');
const stage = createStage(work, { controls: false, preserve: true });
stage.resize(360, 480);
const props = createProps(stage.scene);
const figure = await createFigure(stage.scene);

for (const ex of EXERCISES) {
  const card = document.getElementById('c-' + ex.id);
  const imgs = card.querySelectorAll('img');
  let worst = 0;
  for (let i = 0; i <= 20; i++) {
    const err = figure.apply(ex.pose(i / 20));
    worst = Math.max(worst, ...Object.values(err), 0);
  }
  SHOTS.forEach(([, s, cam], i) => {
    const pose = ex.pose(s);
    figure.apply(pose);
    props.place(pose.props);
    stage.setCam(cam || 'side');
    props.update(stage.camera);
    stage.renderer.render(stage.scene, stage.camera);
    imgs[i].src = stage.renderer.domElement.toDataURL('image/jpeg', 0.85);
  });
  const hasGrip = ex.pose(0).arms.l.grip || ex.pose(0).arms.r.grip;
  const mm = (worst * 1000).toFixed(1);
  card.querySelector('[data-checks]').innerHTML = [
    'Pies quietos y espalda en bloque: <b>por construcción</b>',
    hasGrip ? `Agarre: el puño, a <b class="${worst > 0.005 ? 'bad' : ''}">${mm} mm</b> del implemento en el peor instante` : 'Sin implemento',
  ].join(' · ');
  await new Promise(r => setTimeout(r, 0));          // deja pintar la tarjeta antes de la siguiente
}
tally();
window.__reviewDone = true;
