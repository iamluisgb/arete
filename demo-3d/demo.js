// Demo de la fase 0 (docs/PROPUESTA-ANIMACIONES-3D.md).
//
// Un ejercicio no es una animación hecha a mano: son poses descritas por un
// parámetro de profundidad s (0 = arriba, 1 = abajo) y dos reglas que se
// cumplen en cada fotograma — los pies no se mueven y la barra va sobre el
// mediopié. Ángulos de tibia y muslo salen de s; el torso (o la cadera, en el
// peso muerto) se calcula para que la barra caiga donde debe. Así la barra no
// puede irse por delante de los dedos aunque se toquen las poses.
//
// Eje x: hacia donde mira el atleta. y: arriba. z: a su izquierda/derecha.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const rad = d => d * Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep

// ── Medidas (m), ~1,78 m de altura ───────────────────────
const M = {
  ankleH: 0.08, shank: 0.45, thigh: 0.45, torso: 0.50,
  upper: 0.32, fore: 0.30, headR: 0.105,
  hipZ: 0.10, shoulderZ: 0.19,
};
const ANKLE_X = -0.05;
const MID_X = ANKLE_X + 0.05;          // mediopié
const PLATE_R = 0.225;                 // disco de 20 kg

// ── Geometría plana 2D (plano sagital) ───────────────────
const v2 = (x, y) => ({ x, y });
const add2 = (a, b) => v2(a.x + b.x, a.y + b.y);
const polar = (len, ang) => v2(len * Math.sin(ang), len * Math.cos(ang));   // ang desde la vertical, + hacia delante

/** Cruce de dos circunferencias; devuelve el punto más atrasado (x menor). */
function circleCross(c1, r1, c2, r2) {
  const dx = c2.x - c1.x, dy = c2.y - c1.y;
  let d = Math.hypot(dx, dy);
  d = Math.min(Math.max(d, Math.abs(r1 - r2) + 1e-6), r1 + r2 - 1e-6);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
  const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
  const px = c1.x + a * ux, py = c1.y + a * uy;
  const p1 = v2(px - h * uy, py + h * ux), p2 = v2(px + h * uy, py - h * ux);
  return p1.x < p2.x ? p1 : p2;
}

/** Bisección: el ángulo de torso que deja la barra en x = target. */
function solveTorso(H, target, barBack) {
  let lo = rad(-5), hi = rad(80);
  const barX = a => H.x + M.torso * Math.sin(a) - barBack * Math.cos(a);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (barX(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Ejercicios: poses en función de s ────────────────────
const EXERCISES = {
  squat: {
    name: 'Sentadilla trasera',
    // excéntrica 3 s · pausa abajo 1 s · concéntrica 1 s · arriba 1 s
    phases: [
      { label: 'Bajada', dur: 3, from: 0, to: 1 },
      { label: 'Pausa', dur: 1, from: 1, to: 1 },
      { label: 'Subida', dur: 1, from: 1, to: 0 },
      { label: 'Arriba', dur: 1, from: 0, to: 0 },
    ],
    pose(s) {
      const A = v2(ANKLE_X, M.ankleH);
      const K = add2(A, polar(M.shank, rad(36) * s));                 // rodilla por delante
      const th = rad(112) * s;                                       // muslo: de vertical a por debajo de paralelo
      const H = add2(K, v2(-M.thigh * Math.sin(th), M.thigh * Math.cos(th)));
      const barBack = 0.05;                                          // barra sobre los trapecios
      const tr = solveTorso(H, MID_X, barBack);
      const S = add2(H, polar(M.torso, tr));
      const bar = v2(S.x - barBack * Math.cos(tr), S.y + barBack * Math.sin(tr) + 0.03);
      return { A, K, H, S, tr, bar, grip: 0.42, armPole: new THREE.Vector3(-0.6, -1, 0), kneeZ: 0.15, footZ: 0.15 };
    },
  },
  deadlift: {
    name: 'Peso muerto',
    // empieza en el suelo: subida 1 s · arriba 1 s · bajada 2 s · reset 1 s
    phases: [
      { label: 'Subida', dur: 1.2, from: 1, to: 0 },
      { label: 'Bloqueo', dur: 1, from: 0, to: 0 },
      { label: 'Bajada', dur: 2, from: 0, to: 1 },
      { label: 'Suelo', dur: 1, from: 1, to: 1 },
    ],
    pose(s) {
      const A = v2(ANKLE_X, M.ankleH);
      const K = add2(A, polar(M.shank, rad(16) * s));
      const reach = M.upper + M.fore - 0.02;
      const topBar = M.ankleH + M.shank + M.thigh + M.torso - reach + 0.01;
      const barY = lerp(topBar, PLATE_R, s);
      // Hombros algo por delante de la barra abajo, encima arriba.
      const sx = MID_X + 0.08 * s;
      const S = v2(sx, barY + Math.sqrt(reach * reach - (sx - MID_X) ** 2));
      const H = circleCross(K, M.thigh, S, M.torso);
      const tr = Math.atan2(S.x - H.x, S.y - H.y);
      return { A, K, H, S, tr, bar: v2(MID_X, barY), grip: 0.24, armPole: new THREE.Vector3(-1, 0, 0), kneeZ: 0.12, footZ: 0.13 };
    },
  },
};

// ── Escena ───────────────────────────────────────────────
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 2.2;
controls.maxDistance = 7;
controls.maxPolarAngle = rad(88);

scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d0c8, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(1.5, 4, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 2, bottom: -0.5, near: 0.5, far: 10 });
sun.shadow.radius = 4;
scene.add(sun);

const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.ShadowMaterial({ opacity: 0.16 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.006, 96), new THREE.MeshBasicMaterial({ color: 0xd6cfc8 }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.001;
scene.add(ring);

// Maniquí: cilindros entre articulaciones y esferas en ellas, un solo gris.
// Las extremidades del lado izquierdo (z+, el de la cámara de lado) van un
// tono más claro: sin eso, de lado brazos y piernas se funden en una mancha.
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4542, roughness: 0.75, metalness: 0 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0x3a3634, roughness: 0.7 });
const nearMat = new THREE.MeshStandardMaterial({ color: 0x7a736e, roughness: 0.75 });
const nearJoint = new THREE.MeshStandardMaterial({ color: 0x66605b, roughness: 0.7 });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f1d1c, roughness: 0.5, metalness: 0.3 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x9a948f, roughness: 0.35, metalness: 0.7 });

const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 20);
const unitSph = new THREE.SphereGeometry(1, 24, 16);
const Y = new THREE.Vector3(0, 1, 0);

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  scene.add(m);
  return m;
}
function segment(r0, r1 = r0, mat = bodyMat) {
  // Un cono truncado de altura 1 escalado entre dos puntos.
  const geo = new THREE.CylinderGeometry(r1, r0, 1, 20);
  const m = mesh(geo, mat);
  m.place = (a, b) => {
    const d = new THREE.Vector3().subVectors(b, a);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(1, d.length(), 1);
    m.quaternion.setFromUnitVectors(Y, d.normalize());
  };
  return m;
}
function joint(r, mat = jointMat) {
  const m = mesh(unitSph, mat);
  m.scale.setScalar(r);
  return m;
}

const P = {
  shinL: segment(0.048, 0.06, nearMat), shinR: segment(0.048, 0.06),
  thighL: segment(0.064, 0.085, nearMat), thighR: segment(0.064, 0.085),
  upperL: segment(0.045, 0.05, nearMat), upperR: segment(0.045, 0.05),
  foreL: segment(0.034, 0.042, nearMat), foreR: segment(0.034, 0.042),
  neck: segment(0.045, 0.045),
  ankleL: joint(0.05, nearJoint), ankleR: joint(0.05), kneeL: joint(0.062, nearJoint), kneeR: joint(0.062),
  hipL: joint(0.085), hipR: joint(0.085), shL: joint(0.058, nearJoint), shR: joint(0.058),
  elL: joint(0.045, nearJoint), elR: joint(0.045), handL: joint(0.045, nearJoint), handR: joint(0.045),
  head: joint(M.headR, bodyMat),
};
const footGeo = new THREE.BoxGeometry(0.25, 0.06, 0.09);
footGeo.translate(0.06, 0, 0);
P.footL = mesh(footGeo, nearJoint); P.footR = mesh(footGeo, jointMat);
// Pelvis y tronco: cápsulas aplanadas que siguen la inclinación.
P.pelvis = mesh(new THREE.CapsuleGeometry(0.1, 0.12, 6, 16), bodyMat);
P.chest = mesh(new THREE.CapsuleGeometry(0.13, 0.24, 8, 20), bodyMat);

// Barra con discos.
const bar = new THREE.Group();
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.0, 16), steelMat);
shaft.rotation.x = Math.PI / 2; shaft.castShadow = true;
bar.add(shaft);
// Cada lado con su material: el que queda entre la cámara y el atleta se
// vuelve transparente, o en la vista de lado los discos tapan el cuerpo.
const plateMats = { 1: ironMat.clone(), [-1]: ironMat.clone() };
for (const m of Object.values(plateMats)) { m.transparent = true; }
for (const side of [-1, 1]) {
  for (const [z, r, w] of [[0.62, PLATE_R, 0.045], [0.675, PLATE_R, 0.045], [0.71, 0.05, 0.03]]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 40), r > 0.1 ? plateMats[side] : steelMat);
    plate.rotation.x = Math.PI / 2; plate.position.z = side * z; plate.castShadow = true;
    bar.add(plate);
  }
}
scene.add(bar);

// Trayectoria de la barra y guía del mediopié.
const TRAIL_N = 160;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x1d1b1a, transparent: true, opacity: 0.55 }));
scene.add(trail);
const guideGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(MID_X, 0.002, 0.78), new THREE.Vector3(MID_X, 1.75, 0.78)]);
const guide = new THREE.Line(guideGeo, new THREE.LineDashedMaterial({ color: 0x9a918b, dashSize: 0.04, gapSize: 0.03 }));
guide.computeLineDistances();
scene.add(guide);

// ── Cinemática inversa de dos huesos (brazos) ────────────
function twoBone(root, target, a, b, pole) {
  const dir = new THREE.Vector3().subVectors(target, root);
  const d = Math.min(Math.max(dir.length(), Math.abs(a - b) + 1e-4), a + b - 1e-4);
  dir.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(a * a - along * along, 0));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = root.clone().addScaledVector(dir, along).addScaledVector(p, h);
  const wrist = root.clone().addScaledVector(dir, d);
  return { elbow, wrist };
}

const V = (p, z = 0) => new THREE.Vector3(p.x, p.y, z);

function applyPose(pose) {
  const { A, K, H, S, tr } = pose;
  for (const [side, k] of [[1, 'L'], [-1, 'R']]) {
    const ankle = V(A, side * pose.footZ);
    const knee = V(K, side * pose.kneeZ);
    const hip = V(H, side * M.hipZ);
    P['ankle' + k].position.copy(ankle);
    P['knee' + k].position.copy(knee);
    P['hip' + k].position.copy(hip);
    P['shin' + k].place(ankle, knee);
    P['thigh' + k].place(knee, hip);
    P['foot' + k].position.set(A.x, 0.03, side * pose.footZ);

    const sh = V(S, side * M.shoulderZ);
    P['sh' + k].position.copy(sh);
    const grip = new THREE.Vector3(pose.bar.x, pose.bar.y, side * pose.grip);
    const { elbow, wrist } = twoBone(sh, grip, M.upper, M.fore, pose.armPole);
    P['el' + k].position.copy(elbow);
    P['hand' + k].position.copy(wrist);
    P['upper' + k].place(sh, elbow);
    P['fore' + k].place(elbow, wrist);
  }

  // Tronco: inclinado tr desde la vertical, alrededor del eje z.
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tr);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const hipC = V(H);
  P.pelvis.position.copy(hipC).addScaledVector(up, 0.03);
  P.pelvis.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2).premultiply(q);
  P.pelvis.scale.set(1, 1, 0.85);
  P.chest.position.copy(hipC).addScaledVector(up, M.torso * 0.6);
  P.chest.quaternion.copy(q);
  P.chest.scale.set(0.85, 1, 1.35);

  // Cuello y cabeza: más erguidos que el tronco (mirada neutra, algo al frente).
  const neckBase = V(S).addScaledVector(up, 0.03);
  const headDir = up.clone().lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
  const neckTop = neckBase.clone().addScaledVector(headDir, 0.08);
  P.neck.place(neckBase, neckTop);
  P.head.position.copy(neckTop).addScaledVector(headDir, M.headR * 0.95);

  bar.position.set(pose.bar.x, pose.bar.y, 0);
}

// ── Reloj del ritmo ──────────────────────────────────────
let ex = EXERCISES.squat;
let t = 0, speed = 1, playing = true;
const cycle = () => ex.phases.reduce((a, p) => a + p.dur, 0);

function sAt(time) {
  let rest = time % cycle();
  for (let i = 0; i < ex.phases.length; i++) {
    const p = ex.phases[i];
    if (rest < p.dur) return { s: lerp(p.from, p.to, ease(rest / p.dur)), i, left: p.dur - rest };
    rest -= p.dur;
  }
  return { s: ex.phases[0].from, i: 0, left: 0 };
}

function fillTrail() {
  const pos = trailGeo.attributes.position;
  for (let i = 0; i < TRAIL_N; i++) {
    const p = ex.pose(i / (TRAIL_N - 1));
    pos.setXYZ(i, p.bar.x, p.bar.y, 0.78);
  }
  pos.needsUpdate = true;
  trailGeo.computeBoundingSphere();
}

// ── Interfaz ─────────────────────────────────────────────
const $phase = document.getElementById('phase');
const $tempo = document.getElementById('tempo');

function renderTempo() {
  $tempo.innerHTML = ex.phases.map(p => `<span>${p.label} ${String(p.dur).replace('.', ',')} s</span>`).join('');
}

function segGroup(id, onPick) {
  const el = document.getElementById(id);
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    onPick(b.dataset);
  });
}

const CAMS = {
  side: [0, 1.0, 3.7],
  front: [3.7, 1.0, 0],
  three: [2.6, 1.4, 2.7],
};
function setCam(name) {
  camera.position.set(...CAMS[name]);
  controls.target.set(0, 0.74, 0);
  controls.update();
}

segGroup('exSeg', d => { ex = EXERCISES[d.ex]; t = 0; renderTempo(); fillTrail(); });
segGroup('camSeg', d => setCam(d.cam));
segGroup('speedSeg', d => { speed = parseFloat(d.speed); });
document.getElementById('play').addEventListener('click', e => {
  playing = !playing;
  e.currentTarget.textContent = playing ? 'Pausa' : 'Seguir';
});
document.getElementById('trail').addEventListener('change', e => {
  trail.visible = guide.visible = e.target.checked;
});

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // En vertical el maniquí tiene que caber a lo alto: se aleja un poco.
  camera.fov = w < h ? 42 : 30;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) { playing = false; document.getElementById('play').textContent = 'Seguir'; }

setCam('side');
renderTempo();
fillTrail();
resize();

let last = performance.now(), lastPhase = -1;
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (playing) t += dt * speed;
  const { s, i, left } = sAt(t);
  applyPose(ex.pose(s));
  if (i !== lastPhase) {
    $tempo.querySelectorAll('span').forEach((el, j) => el.classList.toggle('on', j === i));
    lastPhase = i;
  }
  $phase.innerHTML = `<b>${ex.phases[i].label}</b> · ${Math.ceil(left / speed)} s`;
  controls.update();
  // Cuanto más de lado mira la cámara, más transparente el disco cercano.
  const side = camera.position.z / Math.hypot(camera.position.x, camera.position.z);
  plateMats[1].opacity = 1 - 0.8 * Math.max(0, side - 0.3) / 0.7;
  plateMats[-1].opacity = 1 - 0.8 * Math.max(0, -side - 0.3) / 0.7;
  for (const m of Object.values(plateMats)) m.depthWrite = m.opacity > 0.95;
  renderer.render(scene, camera);
});

// Para las pruebas: fijar el instante y la cámara desde fuera.
window.__demo = { debug: () => ({ s: sAt(t).s, pose: ex.pose(sAt(t).s), hand: P.handL.position.toArray(), el: P.elL.position.toArray(), sh: P.shL.position.toArray(), bar: bar.position.toArray() }), setTime: x => { t = x; }, pause: () => { playing = false; }, setEx: k => { ex = EXERCISES[k]; fillTrail(); renderTempo(); }, setCam };
