// Demo de la fase 0 (docs/PROPUESTA-ANIMACIONES-3D.md).
//
// Un ejercicio no es una animación hecha a mano: son poses descritas por un
// parámetro de profundidad s (0 = arriba, 1 = abajo) y unas reglas que se
// cumplen en cada fotograma:
//   · los pies no se mueven del suelo;
//   · la barra va sobre el mediopié;
//   · la barra no atraviesa el cuerpo (en el peso muerto las rodillas se
//     retrasan para dejarla pasar, como en un levantamiento de verdad);
//   · la espalda se mueve en bloque: neutra, sin doblarse.
// El cálculo da dónde va cada articulación; luego se giran los huesos del
// modelo para que lleguen ahí.
//
// Estética: estatua clásica de mármol, como las romanas copiadas de originales
// griegos: marfil cálido y mate, fondo negro y un solo foco que esculpe el músculo.
// Modelo: Universal Base Characters de Quaternius (CC0).
// Ejes del mundo: x hacia donde mira el atleta, y arriba, z a su derecha.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const rad = d => d * Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep

// ── Medidas del modelo (m), sacadas de su esqueleto en reposo ─
const M = {
  ankleH: 0.086,
  shank: 0.459, thigh: 0.429,
  // Del centro de las caderas al centro de los hombros: 0,484 arriba y 0,029 atrás.
  torsoLen: Math.hypot(0.484, 0.029), torsoOff: Math.atan2(-0.029, 0.484),
  upper: 0.251, fore: 0.243,
  toe: { dx: 0.143, dy: -0.071 },          // del tobillo a la bola del pie
  shinR: 0.04, kneeR: 0.055, thighR: [0.06, 0.075],
};
const ANKLE_X = -0.085;                     // así el mediopié queda en x = 0
const MID_X = 0;
const PLATE_R = 0.225;                      // disco de 20 kg
const BAR_R = 0.014;

// ── Geometría plana (plano sagital) ──────────────────────
const v2 = (x, y) => ({ x, y });
const add2 = (a, b) => v2(a.x + b.x, a.y + b.y);
const polar = (len, ang) => v2(len * Math.sin(ang), len * Math.cos(ang));   // ángulo desde la vertical, + hacia delante
const shoulderFrom = (H, tr) => add2(H, polar(M.torsoLen, tr + M.torsoOff));

/** Cruce de dos circunferencias; el punto más atrasado (x menor). */
function circleCross(c1, r1, c2, r2) {
  const dx = c2.x - c1.x, dy = c2.y - c1.y;
  const D = Math.hypot(dx, dy);
  const d = Math.min(Math.max(D, Math.abs(r1 - r2) + 1e-6), r1 + r2 - 1e-6);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
  const ux = dx / D, uy = dy / D;
  const px = c1.x + a * ux, py = c1.y + a * uy;
  const p1 = v2(px - h * uy, py + h * ux), p2 = v2(px + h * uy, py - h * ux);
  return p1.x < p2.x ? p1 : p2;
}

/** x del eje de un segmento a la altura y (null si y queda fuera). */
function xAt(a, b, y) {
  if (y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) return null;
  return lerp(a.x, b.x, (y - a.y) / (b.y - a.y || 1e-9));
}

/** ¿La barra pasa por delante de tibia, rodilla y muslo, sin tocarlos? */
function barClear(A, K, H, bar) {
  const gap = BAR_R + 0.002;                  // la barra puede rozar la tibia, como en la salida real
  const xs = xAt(A, K, bar.y);
  if (xs != null && xs + M.shinR + gap > bar.x) return false;
  if (Math.abs(bar.y - K.y) < M.kneeR && K.x + M.kneeR + gap > bar.x) return false;
  const xt = xAt(K, H, bar.y);
  if (xt != null) {
    const r = lerp(M.thighR[0], M.thighR[1], (bar.y - K.y) / (H.y - K.y || 1e-9));
    if (xt + r + gap > bar.x) return false;
  }
  return true;
}

// ── Ejercicios: poses en función de s ────────────────────
const EXERCISES = {
  squat: {
    phases: [
      { label: 'Bajada', dur: 3, from: 0, to: 1 },
      { label: 'Pausa', dur: 1, from: 1, to: 1 },
      { label: 'Subida', dur: 1, from: 1, to: 0 },
      { label: 'Arriba', dur: 1, from: 0, to: 0 },
    ],
    stance: { foot: 0.16, knee: 0.19 },
    grip: 0.42,
    pose(s) {
      const A = v2(ANKLE_X, M.ankleH);
      const K = add2(A, polar(M.shank, rad(34) * s));
      const th = rad(112) * s;
      const H = add2(K, v2(-M.thigh * Math.sin(th), M.thigh * Math.cos(th)));
      // La barra va sobre los trapecios: detrás y algo por encima del hombro.
      const barOf = tr => {
        const S = shoulderFrom(H, tr);
        return add2(S, v2(-0.075 * Math.cos(tr) + 0.05 * Math.sin(tr), 0.075 * Math.sin(tr) + 0.05 * Math.cos(tr)));
      };
      // Abajo, barra sobre el mediopié. Arriba se admite algo por detrás: de pie
      // es todo el cuerpo el que se inclina, no solo el tronco.
      const target = MID_X - 0.07 * (1 - s);
      let lo = rad(-5), hi = rad(75);
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (barOf(m).x < target) lo = m; else hi = m; }
      const tr = (lo + hi) / 2;
      const bar = barOf(tr);
      return { A, K, H, tr, bar, wrist: add2(bar, v2(0.02, -0.06)), handDir: new THREE.Vector3(0.35, 1, 0), palm: new THREE.Vector3(1, -0.2, 0) };
    },
  },
  deadlift: {
    phases: [
      { label: 'Subida', dur: 1.2, from: 1, to: 0 },
      { label: 'Bloqueo', dur: 1, from: 0, to: 0 },
      { label: 'Bajada', dur: 2, from: 0, to: 1 },
      { label: 'Suelo', dur: 1, from: 1, to: 1 },
    ],
    stance: { foot: 0.12, knee: 0.12 },
    grip: 0.26,
    pose(s) {
      const A = v2(ANKLE_X, M.ankleH);
      const reach = M.upper + M.fore + 0.075;     // del hombro a la barra: el agarre queda a ~8 cm de la muñeca
      const standS = M.ankleH + M.shank + M.thigh + 0.484;
      const barY = lerp(standS - reach + 0.012, PLATE_R, s);
      const bar = v2(MID_X, barY);
      // Hombros por delante de la barra en el suelo; en el bloqueo, algo por
      // detrás, con el tronco vertical y la barra apoyada en los muslos.
      const sx = MID_X + lerp(-0.1, 0.05, s);
      const S = v2(sx, barY + Math.sqrt(reach * reach - (sx - MID_X) ** 2));
      // Tibia: la que pida la profundidad, salvo que la barra choque. Entonces
      // la rodilla se retrasa lo justo para dejarla pasar.
      let K, H;
      for (let a = rad(14) * s; a >= rad(-8); a -= rad(0.25)) {
        K = add2(A, polar(M.shank, a));
        H = circleCross(K, M.thigh, S, M.torsoLen);
        if (barClear(A, K, H, bar)) break;
      }
      const tr = Math.atan2(S.x - H.x, S.y - H.y) - M.torsoOff;
      return { A, K, H, tr, bar, wrist: add2(bar, v2(-0.01, 0.075)), handDir: new THREE.Vector3(-0.15, -1, 0), palm: new THREE.Vector3(-1, 0, 0) };
    },
  },
};

// ── Escena: sala de museo ────────────────────────────────
const stage = document.getElementById('stage');
const $phase = document.getElementById('phase');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Reflejos suaves de una sala: sin esto el bronce y el pulido del mármol salen planos.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 1.8;
controls.maxDistance = 7;
controls.maxPolarAngle = rad(88);

// Luz de museo: un foco cálido alto y delantero que esculpe el músculo con
// sombras hondas, casi nada de relleno y un borde tenue que separa la figura
// del fondo negro. Es la luz de las fotos de catálogo de escultura.
scene.add(new THREE.HemisphereLight(0xfff1e0, 0x1a1512, 0.25));
const key = new THREE.SpotLight(0xffe6c8, 95, 14, rad(30), 0.55, 2);
key.position.set(1.4, 4.6, 2.9);
key.target.position.set(0, 0.9, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.02;
key.shadow.radius = 8;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xe6dccf, 0.18);
fill.position.set(-2.5, 1.2, 2.0);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xfff0dc, 0.9);
rim.position.set(-1.6, 3.0, -3.4);
scene.add(rim);

// Suelo de piedra con la sombra, y un plinto bajo los pies.
const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 96), new THREE.ShadowMaterial({ opacity: 0.45 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ── Materiales de estatua ────────────────────────────────
/**
 * Mármol envejecido: marfil cálido con grano fino y manchas muy suaves, sin
 * vetas grises. Hecho en un canvas para no cargar otra imagen.
 */
function marbleTexture() {
  const N = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#e4d6bf';
  g.fillRect(0, 0, N, N);
  // Manchas amplias: zonas algo más tostadas y otras más claras, como la pátina.
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * N, y = Math.random() * N, r = 40 + Math.random() * 160;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, Math.random() < 0.55 ? 'rgba(190,160,120,.10)' : 'rgba(250,242,228,.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grano: puntos finos, claros y oscuros.
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.flipY = false;
  return t;
}

const marbleMap = marbleTexture();
const FINISHES = {
  // Mate: el mármol antiguo no brilla, se ve como piedra pulida hace siglos.
  marble: normalMap => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: marbleMap, normalMap, normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.66, metalness: 0,
    sheen: 0.35, sheenColor: new THREE.Color(0xfff0dc), sheenRoughness: 0.8,
  }),
  bronze: normalMap => new THREE.MeshPhysicalMaterial({
    color: 0x8a5a33, normalMap, normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.42, metalness: 0.9, clearcoat: 0.15, clearcoatRoughness: 0.6,
  }),
};

// Barra con discos de bronce. El lado que queda entre la cámara y el atleta se
// vuelve transparente: en la vista de lado los discos taparían el cuerpo.
const plateMat = new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.45, metalness: 0.85 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0xc9c3bc, roughness: 0.28, metalness: 0.9 });
const plateMats = { 1: plateMat.clone(), [-1]: plateMat.clone() };
for (const m of Object.values(plateMats)) m.transparent = true;
const bar = new THREE.Group();
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, 2.0, 20), steelMat);
shaft.rotation.x = Math.PI / 2; shaft.castShadow = true;
bar.add(shaft);
for (const side of [-1, 1]) {
  for (const [z, r, w] of [[0.64, PLATE_R, 0.045], [0.695, PLATE_R, 0.045], [0.735, 0.05, 0.03]]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 64), r > 0.1 ? plateMats[side] : steelMat);
    plate.rotation.x = Math.PI / 2; plate.position.z = side * z; plate.castShadow = true;
    bar.add(plate);
  }
}
scene.add(bar);

// Trayectoria de la barra y guía del mediopié.
const TRAIL_N = 160;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xe9dcc8, transparent: true, opacity: 0.55 }));
scene.add(trail);
const guideGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(MID_X, 0.002, 0.8), new THREE.Vector3(MID_X, 1.85, 0.8)]);
const guide = new THREE.Line(guideGeo, new THREE.LineDashedMaterial({ color: 0x6d655d, dashSize: 0.04, gapSize: 0.03 }));
guide.computeLineDistances();
scene.add(guide);

// ── Modelo y su esqueleto ────────────────────────────────
const B = {};                 // huesos por nombre
const rest = new Map();       // pose de reposo, para empezar de cero cada fotograma
let model = null;
const finishMats = {};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion();

/** Gira un hueso en el espacio del mundo (delta · su orientación actual). */
function rotateWorld(bone, delta) {
  bone.getWorldQuaternion(_q);
  bone.parent.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(delta.clone().multiply(_q)));
  bone.updateMatrixWorld(true);
}

/** Gira un hueso lo mínimo para que su hijo quede en la dirección de target. */
function aim(bone, child, target) {
  bone.getWorldPosition(_v);
  child.getWorldPosition(_w);
  const cur = _w.sub(_v).normalize();
  const want = target.clone().sub(_v).normalize();
  rotateWorld(bone, new THREE.Quaternion().setFromUnitVectors(cur, want));
}

function aimDir(bone, child, dir) {
  bone.getWorldPosition(_v);
  aim(bone, child, _v.clone().add(dir));
}

/** Codo a partir de hombro, muñeca y hacia dónde debe apuntar. */
function twoBone(root, target, a, b, pole) {
  const dir = new THREE.Vector3().subVectors(target, root);
  const d = Math.min(Math.max(dir.length(), Math.abs(a - b) + 1e-4), a + b - 1e-4);
  dir.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(a * a - along * along, 0));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return root.clone().addScaledVector(dir, along).addScaledVector(p, h);
}

const Z = new THREE.Vector3(0, 0, 1);
const V = (p, z = 0) => new THREE.Vector3(p.x, p.y, z);
const wp = n => B[n].getWorldPosition(new THREE.Vector3());

/**
 * Mano cerrada sobre la barra. Primero gira la mano sobre el eje de sus dedos
 * hasta que la palma mire hacia `palm` (delante en la sentadilla, atrás en el
 * peso muerto); luego dobla cada falange alrededor del eje de los nudillos.
 */
function grip(k, palm) {
  const hand = B['hand_' + k];
  const along = wp('middle_01_' + k).sub(wp('hand_' + k)).normalize();
  const across = wp('index_01_' + k).sub(wp('pinky_01_' + k)).normalize();
  // Normal de la palma: perpendicular a dedos y nudillos, hacia el lado del pulgar flexionado.
  const sideSign = k === 'l' ? 1 : -1;
  const normal = new THREE.Vector3().crossVectors(along, across).multiplyScalar(sideSign).normalize();
  const want = palm.clone().addScaledVector(along, -palm.dot(along)).normalize();
  const ang = Math.atan2(new THREE.Vector3().crossVectors(normal, want).dot(along), normal.dot(want));
  rotateWorld(hand, new THREE.Quaternion().setFromAxisAngle(along, ang));
  const axis = wp('index_01_' + k).sub(wp('pinky_01_' + k)).normalize().multiplyScalar(sideSign);
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    for (const n of ['01', '02', '03']) {
      rotateWorld(B[`${f}_${n}_${k}`], new THREE.Quaternion().setFromAxisAngle(axis, rad(n === '01' ? 45 : 60)));
    }
  }
}

function applyPose(ex, pose) {
  // 1. Reposo.
  for (const [bone, r] of rest) { bone.position.copy(r.p); bone.quaternion.copy(r.q); }
  model.updateMatrixWorld(true);

  // 2. Pelvis: en su sitio y girada con todo el tronco (espalda en bloque).
  rotateWorld(B.pelvis, new THREE.Quaternion().setFromAxisAngle(Z, -pose.tr));
  const hipMid = B.thigh_l.getWorldPosition(new THREE.Vector3()).add(B.thigh_r.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const pelvisW = B.pelvis.getWorldPosition(new THREE.Vector3());
  B.pelvis.position.copy(B.pelvis.parent.worldToLocal(V(pose.H).add(pelvisW.sub(hipMid))));
  model.updateMatrixWorld(true);
  // Cuello: mirada neutra, algo más erguida que el tronco.
  rotateWorld(B.neck_01, new THREE.Quaternion().setFromAxisAngle(Z, pose.tr * 0.45));

  // 3. Piernas: muslo a la rodilla, tibia al tobillo, pie plano.
  for (const [k, side] of [['l', -1], ['r', 1]]) {
    const knee = V(pose.K, side * ex.stance.knee);
    const ankle = V(pose.A, side * ex.stance.foot);
    aim(B['thigh_' + k], B['calf_' + k], knee);
    aim(B['calf_' + k], B['foot_' + k], ankle);
    aim(B['foot_' + k], B['ball_' + k], ankle.clone().add(new THREE.Vector3(M.toe.dx, M.toe.dy, 0)));
  }

  // 4. Brazos: del hombro a la barra, y los dedos cerrados sobre ella.
  for (const [k, side] of [['l', -1], ['r', 1]]) {
    const sh = B['upperarm_' + k].getWorldPosition(new THREE.Vector3());
    const wrist = V(pose.wrist, side * ex.grip);
    const pole = ex === EXERCISES.squat ? new THREE.Vector3(-0.4, -1, side * 0.2) : new THREE.Vector3(-1, 0, side * 0.6);
    const elbow = twoBone(sh, wrist, M.upper, M.fore, pole);
    aim(B['upperarm_' + k], B['lowerarm_' + k], elbow);
    aim(B['lowerarm_' + k], B['hand_' + k], wrist);
    aimDir(B['hand_' + k], B['middle_01_' + k], pose.handDir);
    grip(k, pose.palm);
  }

  bar.position.set(pose.bar.x, pose.bar.y, 0);
}

// ── Proporciones clásicas ────────────────────────────────
// El modelo viene con cuerpo de superhéroe: trapecios, deltoides y brazos de
// culturista. El canon clásico (Policleto, los atletas romanos) es más
// contenido: hombros anchos pero sin volumen de más, cuello largo, brazos y
// muslos firmes y finos. Se esculpe una vez sobre la malla en reposo: cada
// vértice se acerca al eje de sus huesos según cuánto sobra en esa zona. El
// esqueleto no cambia, así que las poses valen igual.
const SLIM = {
  clavicle: 0.68, upperarm: 0.78, lowerarm: 0.87,
  neck_01: 0.74, spine_03: 0.85, spine_02: 0.9, spine_01: 0.96,
  thigh: 0.91, calf: 0.93,
};
const SLIM_CHILD = {
  clavicle: 'upperarm', upperarm: 'lowerarm', lowerarm: 'hand',
  neck_01: 'Head', spine_03: 'neck_01', spine_02: 'spine_03', spine_01: 'spine_02',
  thigh: 'calf', calf: 'foot',
};
const proportions = [];       // { attr, athletic, classic } por malla

function sculptClassic(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  // Eje de cada hueso en el espacio de la malla, en reposo.
  const toMesh = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const axis = bones.map(b => {
    const base = b.name.replace(/_[lr]$/, '');
    const f = SLIM[base];
    if (!f) return null;
    const side = b.name.endsWith('_l') ? '_l' : b.name.endsWith('_r') ? '_r' : '';
    const child = B[SLIM_CHILD[base] + (['Head', 'neck_01', 'spine_02', 'spine_03'].includes(SLIM_CHILD[base]) ? '' : side)];
    if (!child) return null;
    const a = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(toMesh);
    const c = child.getWorldPosition(new THREE.Vector3()).applyMatrix4(toMesh);
    return { a, d: c.clone().sub(a), f };
  });
  const athletic = pos.array.slice();
  const out = pos.array.slice();
  const v = new THREE.Vector3(), acc = new THREE.Vector3(), proj = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    acc.set(0, 0, 0);
    let wsum = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (!w) continue;
      const ax = axis[si.getComponent(i, k)];
      if (ax) {
        // Punto del eje más cercano y acercamiento radial hacia él.
        const t = THREE.MathUtils.clamp(v.clone().sub(ax.a).dot(ax.d) / ax.d.lengthSq(), 0, 1);
        proj.copy(ax.a).addScaledVector(ax.d, t);
        acc.addScaledVector(proj.clone().lerp(v, ax.f), w);
      } else {
        acc.addScaledVector(v, w);
      }
      wsum += w;
    }
    if (wsum > 0) { acc.divideScalar(wsum); out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z; }
  }
  proportions.push({ attr: pos, athletic, classic: out });
}

function setBuild(name) {
  for (const p of proportions) {
    p.attr.array.set(name === 'classic' ? p.classic : p.athletic);
    p.attr.needsUpdate = true;
  }
}

// ── Acabados ─────────────────────────────────────────────
function setFinish(name) {
  if (!model) return;
  model.traverse(o => { if (o.isMesh) o.material = finishMats[name]; });
}

async function loadModel() {
  $phase.textContent = 'Cargando modelo…';
  const gltf = await new GLTFLoader().loadAsync('model/hero.gltf');
  model = gltf.scene;
  // El modelo mira a +z; el atleta de la escena mira a +x.
  model.rotation.y = Math.PI / 2;
  scene.add(model);
  let normalMap = null;
  model.traverse(o => {
    if (o.isBone) { B[o.name] = o; rest.set(o, { p: o.position.clone(), q: o.quaternion.clone() }); }
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      if (o.material.name.includes('Superhero')) normalMap = o.material.normalMap;
      // Las estatuas no tienen cejas ni pelo pintado: se esculpen. Fuera.
      if (o.material.name.includes('Hair')) o.visible = false;
    }
  });
  // Pelo esculpido: el peinado viene colocado sobre el cuerpo en reposo; se
  // cuelga del hueso de la cabeza conservando esa posición.
  model.updateMatrixWorld(true);
  const hair = (await new GLTFLoader().loadAsync('model/hair.gltf')).scene;
  const toHead = new THREE.Matrix4().copy(B.Head.matrixWorld).invert().multiply(model.matrixWorld);
  hair.applyMatrix4(toHead);
  hair.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  B.Head.add(hair);

  model.traverse(o => { if (o.isSkinnedMesh && o.material.name.includes('Superhero')) sculptClassic(o); });
  setBuild('classic');

  for (const [k, make] of Object.entries(FINISHES)) finishMats[k] = make(normalMap);
  setFinish('marble');
}

// ── Reloj del ritmo ──────────────────────────────────────
let ex = EXERCISES.squat;
let t = 0, speed = 1, playing = true;
const cycle = () => ex.phases.reduce((a, p) => a + p.dur, 0);

function sAt(time) {
  let left = time % cycle();
  for (let i = 0; i < ex.phases.length; i++) {
    const p = ex.phases[i];
    if (left < p.dur) return { s: lerp(p.from, p.to, ease(left / p.dur)), i, rest: p.dur - left };
    left -= p.dur;
  }
  return { s: ex.phases[0].from, i: 0, rest: 0 };
}

function fillTrail() {
  const pos = trailGeo.attributes.position;
  for (let i = 0; i < TRAIL_N; i++) {
    const p = ex.pose(i / (TRAIL_N - 1));
    pos.setXYZ(i, p.bar.x, p.bar.y, 0.8);
  }
  pos.needsUpdate = true;
  trailGeo.computeBoundingSphere();
}

// ── Interfaz ─────────────────────────────────────────────
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

const CAMS = { side: [0, 1.0, 3.6], front: [3.6, 1.0, 0], three: [2.5, 1.35, 2.6] };
function setCam(name) {
  camera.position.set(...CAMS[name]);
  controls.target.set(0, 0.84, 0);
  controls.update();
}

function setEx(k) { ex = EXERCISES[k]; t = 0; renderTempo(); fillTrail(); }
segGroup('exSeg', d => setEx(d.ex));
segGroup('camSeg', d => setCam(d.cam));
segGroup('speedSeg', d => { speed = parseFloat(d.speed); });
segGroup('finishSeg', d => setFinish(d.finish));
segGroup('buildSeg', d => setBuild(d.build));
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
  camera.fov = 40;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  playing = false; document.getElementById('play').textContent = 'Seguir';
}

setCam('three');
renderTempo();
fillTrail();
resize();

let last = performance.now(), lastPhase = -1;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (playing) t += dt * speed;
  const { s, i, rest: left } = sAt(t);
  applyPose(ex, ex.pose(s));
  if (i !== lastPhase) {
    $tempo.querySelectorAll('span').forEach((el, j) => el.classList.toggle('on', j === i));
    lastPhase = i;
  }
  $phase.innerHTML = `<b>${ex.phases[i].label}</b> · ${Math.ceil(left / speed)} s`;
  controls.update();
  const side = camera.position.z / Math.hypot(camera.position.x, camera.position.z);
  plateMats[1].opacity = 1 - 0.8 * Math.max(0, side - 0.3) / 0.7;
  plateMats[-1].opacity = 1 - 0.8 * Math.max(0, -side - 0.3) / 0.7;
  for (const m of Object.values(plateMats)) m.depthWrite = m.opacity > 0.95;
  renderer.render(scene, camera);
}

loadModel()
  .then(() => renderer.setAnimationLoop(frame))
  .catch(err => { $phase.textContent = 'No se pudo cargar el modelo'; console.error(err); });

// Para las pruebas: fijar el instante y la cámara desde fuera.
window.__demo = {
  ready: () => !!model,
  pause: () => { playing = false; },
  setTime: x => { t = x; },
  setEx, setCam, setFinish, setBuild,
  buildInfo: () => proportions.map(p => { let m = 0; for (let i = 0; i < p.classic.length; i++) m = Math.max(m, Math.abs(p.classic[i] - p.athletic[i])); return { n: p.classic.length / 3, maxMove: m }; }),
  debug: () => {
    const p = ex.pose(sAt(t).s);
    const w = n => { const v = B[n].getWorldPosition(new THREE.Vector3()); return [v.x, v.y, v.z]; };
    return { s: sAt(t).s, K: p.K, H: p.H, bar: p.bar, tr: p.tr, bones: { thigh: w('thigh_r'), calf: w('calf_r'), foot: w('foot_r'), upperarm: w('upperarm_r'), hand: w('hand_r') } };
  },
};
