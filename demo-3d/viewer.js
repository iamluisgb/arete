// Visor: un ejercicio del catálogo en movimiento, con su ritmo.
// ?ex=<id> abre directamente ese ejercicio; ?t=<s>&cam=<vista> fija instante y cámara (pruebas).

import * as THREE from 'three';
import { createStage } from './engine/stage.js';
import { createFigure } from './engine/figure.js';
import { createProps } from './engine/props.js';
import { EXERCISES, byId } from './engine/exercises.js';
import { MID_X, lerp } from './engine/poses.js';

const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const el = document.getElementById('stage');
const $phase = document.getElementById('phase');
const $tempo = document.getElementById('tempo');
const $select = document.getElementById('exSelect');
const $gear = document.getElementById('gear');
const params = new URLSearchParams(location.search);

const stage = createStage(el);
const { scene, camera, controls, renderer } = stage;
const props = createProps(scene);

// Trayectoria del implemento y guía del mediopié.
const TRAIL_N = 160;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xe9dcc8, transparent: true, opacity: 0.55 }));
scene.add(trail);
const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(MID_X, 0.002, 0.8), new THREE.Vector3(MID_X, 1.85, 0.8)]),
  new THREE.LineDashedMaterial({ color: 0x6d655d, dashSize: 0.04, gapSize: 0.03 }));
guide.computeLineDistances();
scene.add(guide);

// Selector agrupado por familia.
const families = [...new Set(EXERCISES.map(e => e.family))];
$select.innerHTML = families.map(f => `<optgroup label="${f}">${EXERCISES.filter(e => e.family === f)
  .map(e => `<option value="${e.id}">${e.name}</option>`).join('')}</optgroup>`).join('');

let ex = byId(params.get('ex')) || EXERCISES[0];
let t = 0, speed = 1, playing = true, figure = null, lastErr = {};
const cycle = () => ex.tempo.reduce((a, p) => a + p.dur, 0);

function sAt(time) {
  let left = time % cycle();
  for (let i = 0; i < ex.tempo.length; i++) {
    const p = ex.tempo[i];
    if (left < p.dur) return { s: lerp(p.from, p.to, ease(left / p.dur)), i, rest: p.dur - left };
    left -= p.dur;
  }
  return { s: ex.tempo[0].from, i: 0, rest: 0 };
}

function fillTrail() {
  const pos = trailGeo.attributes.position;
  for (let i = 0; i < TRAIL_N; i++) {
    const p = ex.pose(i / (TRAIL_N - 1)).track;
    pos.setXYZ(i, p.x, p.y, 0.8);
  }
  pos.needsUpdate = true;
  trailGeo.computeBoundingSphere();
}

function pressed(groupId, key, value) {
  document.querySelectorAll(`#${groupId} button`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === value)));
}

function setEx(id, { cam = null } = {}) {
  ex = byId(id) || EXERCISES[0];
  $select.value = ex.id;
  $gear.textContent = ex.gear;
  t = 0;
  $tempo.innerHTML = ex.tempo.map(p => `<span>${p.label} ${String(p.dur).replace('.', ',')} s</span>`).join('');
  fillTrail();
  setCam(cam || ex.cam);
  history.replaceState(null, '', `?ex=${ex.id}`);
}
function setCam(name) { stage.setCam(name); pressed('camSeg', 'cam', name); }

function segGroup(id, onPick) {
  document.getElementById(id).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll(`#${id} button`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    onPick(b.dataset);
  });
}
$select.addEventListener('change', () => setEx($select.value));
segGroup('camSeg', d => setCam(d.cam));
segGroup('speedSeg', d => { speed = parseFloat(d.speed); });
segGroup('finishSeg', d => { figure?.setFinish(d.finish); props.setFinish(d.finish); });
segGroup('buildSeg', d => figure?.setBuild(d.build));
document.getElementById('play').addEventListener('click', e => {
  playing = !playing;
  e.currentTarget.textContent = playing ? 'Pausa' : 'Seguir';
});
document.getElementById('trail').addEventListener('change', e => { trail.visible = guide.visible = e.target.checked; });

new ResizeObserver(() => stage.resize()).observe(el);
stage.resize();
if (matchMedia('(prefers-reduced-motion: reduce)').matches) { playing = false; document.getElementById('play').textContent = 'Seguir'; }
setEx(ex.id, { cam: params.get('cam') });
if (params.has('t')) { t = parseFloat(params.get('t')); playing = false; }

let last = performance.now(), lastPhase = -1;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (playing) t += dt * speed;
  const { s, i, rest } = sAt(t);
  const pose = ex.pose(s);
  lastErr = figure.apply(pose);
  props.place(pose.props);
  if (i !== lastPhase) { $tempo.querySelectorAll('span').forEach((x, j) => x.classList.toggle('on', j === i)); lastPhase = i; }
  $phase.innerHTML = `<b>${ex.tempo[i].label}</b> · ${Math.ceil(rest / speed)} s`;
  controls.update();
  props.update(camera);
  renderer.render(scene, camera);
}

$phase.textContent = 'Cargando figura…';
createFigure(scene).then(f => {
  figure = f;
  renderer.setAnimationLoop(frame);
}).catch(err => { $phase.textContent = 'No se pudo cargar la figura'; console.error(err); });

// Para las pruebas.
window.__viewer = {
  ready: () => !!figure,
  pause: () => { playing = false; },
  setTime: x => { t = x; },
  setEx, setCam,
  err: () => lastErr,
  closeUp: (pos, target) => { camera.position.set(...pos); controls.target.set(...target); controls.update(); },
};
