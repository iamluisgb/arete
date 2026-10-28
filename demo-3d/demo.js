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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  gripOff: 0.075,                           // muñeca → hueco del puño; se mide al cerrar la mano
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
      // Palmas al frente y la muñeca debajo de la barra: el antebrazo baja hacia el codo.
      return { A, K, H, tr, bar, back: new THREE.Vector3(-0.6, 0.8, 0), forearm: new THREE.Vector3(0.15, -1, 0).normalize() };
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
      // Del hombro a la barra: brazo y antebrazo más lo que va de la muñeca al hueco del puño.
      const reach = M.upper + M.fore + M.gripOff - 0.035;   // el codo nunca del todo bloqueado: así la mano llega
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
      // Agarre prono: el dorso de la mano mira al frente y el brazo cuelga hacia el hombro.
      return { A, K, H, tr, bar, back: new THREE.Vector3(1, -0.1, 0), forearm: new THREE.Vector3(-0.1, 1, 0).normalize() };
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
/** La piel no se pinta en la franja de los pantalones (un poco por dentro del bajo y la cintura, para no dejar hueco). */
function hideUnderShorts(m) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float restY;\nvarying float vRestY;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestY = restY;');
    sh.fragmentShader = 'varying float vRestY;\n' + sh.fragmentShader
      .replace('void main() {', `void main() {\n  if (vRestY > ${(HEM_Y + 0.015).toFixed(3)} && vRestY < ${(WAIST_Y - 0.01).toFixed(3)}) discard;`);
  };
  m.customProgramCacheKey = () => 'skin-under-shorts';
  return m;
}

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
let loaded = false;           // todo listo: modelo, pelo, pantalones y agarre
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

// ── Manos: un puño fijo, colocado sobre la barra ─────────
// Mover cada dedo para que rodee la barra exige límites de articulación,
// oposición del pulgar y contacto con la palma, y la piel se deforma mal al
// doblar mucho. En su lugar: cada mano se cierra una vez en un puño con forma
// de agarre, se mide el hueco que deja (dónde está y hacia dónde pasa) y en
// cada fotograma se coloca la mano entera para que la barra pase por ese
// hueco. El brazo llega luego hasta esa muñeca.
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const FIST = { '01': 70, '02': 95, '03': 65 };             // flexión de cada falange (grados)
const fist = {};                                            // por mano: hueco, eje y nudillos en el marco de la mano

function knuckleAxis(k) { return wp('index_01_' + k).sub(wp('pinky_01_' + k)).normalize(); }

/** Cierra la mano en reposo y guarda esa postura como la de reposo de sus dedos. */
function makeFist(k) {
  model.updateMatrixWorld(true);
  const hand = B['hand_' + k];
  const palm = wp('middle_01_' + k).sub(wp('hand_' + k)).normalize();
  // Sentido de cierre: el que lleva la yema hacia el lado de la palma (abajo en la postura en T).
  let axis = knuckleAxis(k);
  const probe = B['middle_01_' + k], tipB = B['middle_04_leaf_' + k];
  const q0 = probe.quaternion.clone();
  const before = wp('middle_04_leaf_' + k);
  rotateWorld(probe, new THREE.Quaternion().setFromAxisAngle(axis, rad(30)));
  if (wp('middle_04_leaf_' + k).y > before.y) axis.negate();
  probe.quaternion.copy(q0); probe.updateMatrixWorld(true);
  void tipB;
  for (const f of FINGERS) {
    for (const n of ['01', '02', '03']) rotateWorld(B[`${f}_${n}_${k}`], new THREE.Quaternion().setFromAxisAngle(axis, rad(FIST[n])));
  }
  // Pulgar: se dobla hacia la palma, por delante de los dedos.
  const tAxis = new THREE.Vector3().crossVectors(wp('thumb_02_' + k).sub(wp('thumb_01_' + k)).normalize(), new THREE.Vector3(0, -1, 0)).normalize();
  const tb = wp('thumb_04_leaf_' + k);
  const qt = B['thumb_02_' + k].quaternion.clone();
  rotateWorld(B['thumb_02_' + k], new THREE.Quaternion().setFromAxisAngle(tAxis, rad(30)));
  if (wp('thumb_04_leaf_' + k).distanceTo(wp('middle_02_' + k)) > tb.distanceTo(wp('middle_02_' + k))) tAxis.negate();
  B['thumb_02_' + k].quaternion.copy(qt); B['thumb_02_' + k].updateMatrixWorld(true);
  rotateWorld(B['thumb_01_' + k], new THREE.Quaternion().setFromAxisAngle(tAxis, rad(20)));
  rotateWorld(B['thumb_02_' + k], new THREE.Quaternion().setFromAxisAngle(tAxis, rad(35)));
  rotateWorld(B['thumb_03_' + k], new THREE.Quaternion().setFromAxisAngle(tAxis, rad(40)));

  // El puño pasa a ser el reposo de los dedos.
  for (const f of [...FINGERS, 'thumb']) for (const n of ['01', '02', '03']) {
    const b = B[`${f}_${n}_${k}`];
    rest.get(b).q.copy(b.quaternion);
  }

  // Hueco del puño: el centro del lazo del dedo corazón. Todo en el marco de
  // la mano (su orientación en el mundo, sin escala).
  const hq = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const hp = wp('hand_' + k);
  const loop = ['middle_01_', 'middle_02_', 'middle_03_', 'middle_04_leaf_'].map(n => wp(n + k));
  const center = loop.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(loop.length);
  fist[k] = {
    center: center.clone().sub(hp).applyQuaternion(hq),
    axis: knuckleAxis(k).applyQuaternion(hq),
    knuckles: wp('middle_01_' + k).sub(center).normalize().applyQuaternion(hq),
  };
  void palm;
}

/** Base ortonormal (como matriz) a partir de un eje y una segunda dirección. */
function basis(a, u) {
  const e1 = a.clone().normalize();
  const e2 = u.clone().addScaledVector(e1, -u.dot(e1)).normalize();
  const e3 = new THREE.Vector3().crossVectors(e1, e2);
  return new THREE.Matrix4().makeBasis(e1, e2, e3);
}

/**
 * Orientación de la mano en el mundo: el hueco del puño a lo largo de la barra.
 * Se prueban giros alrededor de la barra y se queda el que deja el antebrazo
 * en la dirección que pide el ejercicio (`forearm`, de la barra a la muñeca)
 * y el dorso más cerca de `back`.
 */
function fistQuat(k, pose, grip) {
  const F = fist[k];
  const L = basis(F.axis, F.knuckles);
  let best = null;
  for (const sz of [1, -1]) {
    for (let a = 0; a < 360; a += 5) {
      const u = new THREE.Vector3(Math.cos(rad(a)), Math.sin(rad(a)), 0);
      const q = new THREE.Quaternion().setFromRotationMatrix(basis(new THREE.Vector3(0, 0, sz), u).multiply(L.clone().transpose()));
      const wrist = grip.clone().sub(F.center.clone().applyQuaternion(q));
      const dir = wrist.clone().sub(grip); dir.z = 0; dir.normalize();
      const score = dir.dot(pose.forearm) * 2 + u.dot(pose.back);
      if (!best || score > best.score) best = { q, wrist, score };
    }
  }
  return best;
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

  // 4. Brazos: la mano se coloca con el hueco del puño sobre la barra, y el
  // brazo llega hasta esa muñeca.
  for (const [k, side] of [['l', -1], ['r', 1]]) {
    const grip = V(pose.bar, side * ex.grip);
    const sh = B['upperarm_' + k].getWorldPosition(new THREE.Vector3());
    const { q, wrist } = fistQuat(k, pose, grip);
    const pole = ex === EXERCISES.squat ? new THREE.Vector3(-0.4, -1, side * 0.2) : new THREE.Vector3(-1, 0, side * 0.6);
    const elbow = twoBone(sh, wrist, M.upper, M.fore, pole);
    aim(B['upperarm_' + k], B['lowerarm_' + k], elbow);
    aim(B['lowerarm_' + k], B['hand_' + k], wrist);
    const hand = B['hand_' + k];
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
    hand.updateMatrixWorld(true);
  }

  bar.position.set(pose.bar.x, pose.bar.y, 0);
}

// ── Rizos ────────────────────────────────────────────────
// Los retratos romanos llevan el pelo en mechones cortos y rizados, tallados
// como bucles sueltos sobre el cráneo. Se reparten por la superficie exterior
// del peinado del modelo (que queda debajo como base, para que no asome el
// cráneo entre bucle y bucle) y se funden en una sola malla.

/** Generador pseudoaleatorio con semilla: el mismo peinado en cada carga. */
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function sculptCurls(capMesh) {
  const rnd = seeded(7);
  const g = capMesh.geometry;
  const pos = g.attributes.position, idx = g.index;
  g.computeBoundingBox();
  const center = g.boundingBox.getCenter(new THREE.Vector3());
  center.y -= 0.03;                                   // centro del cráneo, algo por debajo del casquete

  // Triángulos de la cara exterior, con su área para repartir los puntos.
  const tris = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const count = idx ? idx.count / 3 : pos.count / 3;
  for (let i = 0; i < count; i++) {
    const [ia, ib, ic] = idx ? [idx.getX(3 * i), idx.getX(3 * i + 1), idx.getX(3 * i + 2)] : [3 * i, 3 * i + 1, 3 * i + 2];
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    const area = n.length() / 2;
    n.normalize();
    const mid = a.clone().add(b).add(c).divideScalar(3);
    const out = mid.clone().sub(center).normalize();
    if (n.dot(out) < 0) n.negate();                   // la malla tiene dos caras: nos quedamos con la de fuera
    if (n.dot(out) < 0.35 || n.y < -0.4) continue;
    tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), n: n.clone(), area });
    total += area;
  }

  // Puntos repartidos sin amontonarse (dardos con distancia mínima).
  const pts = [];
  const minD = 0.0125;
  for (let tries = 0; tries < 14000 && pts.length < 460; tries++) {
    let r = rnd() * total, t = tris[0];
    for (const tr of tris) { r -= tr.area; if (r <= 0) { t = tr; break; } }
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = t.a.clone().addScaledVector(t.b.clone().sub(t.a), u).addScaledVector(t.c.clone().sub(t.a), v);
    if (pts.some(q => q.p.distanceToSquared(p) < minD * minD)) continue;
    pts.push({ p, n: t.n });
  }

  // Dos tallas de bucle: anilla en espiral abierta y botón redondeado.
  const ring = new THREE.TorusGeometry(1, 0.6, 6, 14, Math.PI * 1.45);
  const knob = new THREE.SphereGeometry(1, 10, 8);
  knob.scale(1, 1, 0.62);
  const Zf = new THREE.Vector3(0, 0, 1);
  const parts = pts.map(({ p, n: nn }) => {
    const big = 0.0075 + rnd() * 0.0045;
    const geo = (rnd() < 0.55 ? ring : knob).clone();
    geo.scale(big, big, big * 0.9);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7, rnd() * Math.PI * 2));
    const q = new THREE.Quaternion().setFromUnitVectors(Zf, nn).multiply(tilt);
    geo.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(nn, 0.0035), q, new THREE.Vector3(1, 1, 1)));
    return geo;
  });
  const merged = mergeGeometries(parts.map(g2 => g2.toNonIndexed()));
  merged.computeVertexNormals();
  const curls = new THREE.Mesh(merged, capMesh.material);
  curls.castShadow = true; curls.receiveShadow = true;
  return curls;
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
  if (shorts) fitShorts(name);
}

// ── Pantalones cortos ────────────────────────────────────
// Se sacan del propio cuerpo: los triángulos entre la cintura y medio muslo,
// separados de la piel y algo más en el bajo para que caiga como tela. Llevan
// los mismos pesos de hueso que la piel, así que se mueven con ella.
// Cintura al ombligo y bajo a un palmo de la rodilla.
const WAIST_Y = 1.1, HEM_Y = 0.63;
let shorts = null;

function makeShorts(body) {
  const g = body.geometry;
  const pos = g.attributes.position, idx = g.index;
  const y = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) y[i] = v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld).y;
  const keep = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    // Basta con que el triángulo toque la franja: el borde exacto lo recorta el sombreador.
    const lo = Math.min(y[a], y[b], y[c]), hi = Math.max(y[a], y[b], y[c]);
    if (hi > HEM_Y && lo < WAIST_Y) keep.push(a, b, c);
  }
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) geo.setAttribute(name, g.attributes[name].clone());
  geo.setIndex(keep);
  geo.setAttribute('restY', new THREE.BufferAttribute(y, 1));
  const mesh = new THREE.SkinnedMesh(geo, clothMats.marble);
  mesh.userData.cloth = true;
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.bind(body.skeleton, body.bindMatrix);
  body.parent.add(mesh);
  shorts = { mesh, body, y };
  // La piel bajo los pantalones no se pinta: al flexionar la cadera, la malla
  // se abulta más que la holgura de la tela y asomaría a través de ella.
  body.geometry.setAttribute('restY', new THREE.BufferAttribute(y, 1));
  fitShorts('classic');
}

/** Coloca la tela sobre la piel del cuerpo elegido (clásico o culturista). */
function fitShorts(build) {
  const { mesh, body, y } = shorts;
  const src = proportions.find(p => p.attr === body.geometry.attributes.position);
  const skin = build === 'classic' ? src.classic : src.athletic;
  const nrm = body.geometry.attributes.normal;
  const out = mesh.geometry.attributes.position;
  for (let i = 0; i < out.count; i++) {
    // Holgura: 7 mm en la cadera, hasta 2 cm en el bajo.
    const flare = THREE.MathUtils.clamp((HEM_Y + 0.12 - y[i]) / 0.12, 0, 1);
    const off = 0.007 + 0.013 * flare * flare;
    out.setXYZ(i, skin[i * 3] + nrm.getX(i) * off, skin[i * 3 + 1] + nrm.getY(i) * off, skin[i * 3 + 2] + nrm.getZ(i) * off);
  }
  out.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

/**
 * Tela: gris tinta mate, sin el relieve muscular de la piel. El bajo y la
 * cintura se recortan en el sombreador por la altura en reposo de cada punto:
 * el corte sale recto aunque la malla tenga los triángulos en diagonal.
 */
function clothMaterial(params) {
  const m = new THREE.MeshStandardMaterial({ ...params, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float restY;\nvarying float vRestY;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestY = restY;');
    sh.fragmentShader = 'varying float vRestY;\n' + sh.fragmentShader
      .replace('void main() {', `void main() {\n  if (vRestY < ${HEM_Y.toFixed(3)} || vRestY > ${WAIST_Y.toFixed(3)}) discard;`);
  };
  return m;
}
const clothMats = {
  marble: clothMaterial({ color: 0x34302d, roughness: 0.92, metalness: 0 }),
  bronze: clothMaterial({ color: 0x241e1a, roughness: 0.8, metalness: 0.1 }),
};

// ── Acabados ─────────────────────────────────────────────
function setFinish(name) {
  if (!model) return;
  model.traverse(o => { if (o.isMesh) o.material = o.userData.cloth ? clothMats[name] : finishMats[name]; });
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
  const caps = [];
  hair.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; caps.push(o); } });
  for (const cap of caps) {
    // El casquete se encoge un poco hacia el cráneo: los rizos dan el volumen.
    cap.add(sculptCurls(cap));
  }
  B.Head.add(hair);

  let body = null;
  model.traverse(o => { if (o.isSkinnedMesh && o.material.name.includes('Superhero')) { sculptClassic(o); body = o; } });
  makeShorts(body);
  setBuild('classic');

  for (const [k, make] of Object.entries(FINISHES)) finishMats[k] = hideUnderShorts(make(normalMap));
  setFinish('marble');
  makeFist('l');
  makeFist('r');
  M.gripOff = fist.l.center.length();
  fillTrail();
  loaded = true;
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
  ready: () => loaded,
  pause: () => { playing = false; },
  setTime: x => { t = x; },
  setEx, setCam, setFinish, setBuild,
  bench: n => { const t0 = performance.now(); for (let i = 0; i < n; i++) applyPose(ex, ex.pose((i % 20) / 20)); return (performance.now() - t0) / n; },
  fistInfo: () => {
    const p = ex.pose(sAt(t).s);
    applyPose(ex, p);
    const k = 'r', side = 1;
    const grip = V(p.bar, side * ex.grip);
    const sh = wp('upperarm_' + k);
    const { wrist } = fistQuat(k, p, grip);
    return { center: fist[k].center.toArray().map(v => +v.toFixed(3)), axis: fist[k].axis.toArray().map(v => +v.toFixed(2)), knuckles: fist[k].knuckles.toArray().map(v => +v.toFixed(2)),
      bar: [p.bar.x, p.bar.y].map(v => +v.toFixed(3)), wristT: wrist.toArray().map(v => +v.toFixed(3)), wristReal: wp('hand_' + k).toArray().map(v => +v.toFixed(3)), sh: sh.toArray().map(v => +v.toFixed(3)),
      dist: +sh.distanceTo(wrist).toFixed(3), armLen: M.upper + M.fore, gripOff: +M.gripOff.toFixed(3) };
  },
  gripInfo: () => {
    const p = ex.pose(sAt(t).s);
    applyPose(ex, p);
    return ['l', 'r'].map(k => {
      const hand = B['hand_' + k];
      const c = fist[k].center.clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())).add(wp('hand_' + k));
      const tips = FINGERS.map(f => { const q = wp(`${f}_04_leaf_${k}`); return +Math.hypot(q.x - p.bar.x, q.y - p.bar.y).toFixed(3); });
      return { k, hueco: +Math.hypot(c.x - p.bar.x, c.y - p.bar.y).toFixed(3), tips };
    });
  },
  closeUp: (pos, target = [-0.07, 1.62, 0]) => { camera.position.set(...pos); controls.target.set(...target); controls.update(); },
  buildInfo: () => proportions.map(p => { let m = 0; for (let i = 0; i < p.classic.length; i++) m = Math.max(m, Math.abs(p.classic[i] - p.athletic[i])); return { n: p.classic.length / 3, maxMove: m }; }),
  debug: () => {
    const p = ex.pose(sAt(t).s);
    const w = n => { const v = B[n].getWorldPosition(new THREE.Vector3()); return [v.x, v.y, v.z]; };
    return { s: sAt(t).s, K: p.K, H: p.H, bar: p.bar, tr: p.tr, bones: { thigh: w('thigh_r'), calf: w('calf_r'), foot: w('foot_r'), upperarm: w('upperarm_r'), hand: w('hand_r') } };
  },
};
