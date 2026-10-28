// La figura: modelo Universal Base Characters de Quaternius (CC0) convertido
// en estatua de mármol (o bronce) con proporciones clásicas, rizos tallados,
// pantalones cortos y manos en puño. `apply(pose)` coloca el esqueleto en una
// pose de poses.js.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, rad, BAR_R, PLATE_R, KB } from './poses.js';

const Z = new THREE.Vector3(0, 0, 1);
const V = (p, z = 0) => new THREE.Vector3(p.x, p.y, z);

// ── Materiales ───────────────────────────────────────────
/** Mármol envejecido: marfil cálido con grano fino y manchas muy suaves. */
function marbleTexture() {
  const N = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#e4d6bf';
  g.fillRect(0, 0, N, N);
  const rnd = seeded(3);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * N, y = rnd() * N, r = 40 + rnd() * 160;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rnd() < 0.55 ? 'rgba(190,160,120,.10)' : 'rgba(250,242,228,.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.flipY = false;
  return t;
}

/** Generador pseudoaleatorio con semilla: la misma estatua en cada carga. */
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// Pantalones: cintura al ombligo y bajo a un palmo de la rodilla (altura en reposo).
const WAIST_Y = 1.1, HEM_Y = 0.63;

/** La piel no se pinta bajo los pantalones: al flexionar la cadera asomaría a través de la tela. */
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

/** Tela mate; el bajo y la cintura se recortan por la altura en reposo, así el corte sale recto. */
function clothMaterial(params) {
  const m = new THREE.MeshStandardMaterial({ ...params, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float restY;\nvarying float vRestY;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestY = restY;');
    sh.fragmentShader = 'varying float vRestY;\n' + sh.fragmentShader
      .replace('void main() {', `void main() {\n  if (vRestY < ${HEM_Y.toFixed(3)} || vRestY > ${WAIST_Y.toFixed(3)}) discard;`);
  };
  m.customProgramCacheKey = () => 'cloth';
  return m;
}

// ── Proporciones clásicas ────────────────────────────────
// El modelo viene con cuerpo de superhéroe. El canon clásico es más contenido:
// cada vértice se acerca al eje de sus huesos según cuánto sobra en esa zona.
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

// ── Manos ────────────────────────────────────────────────
// Un puño fijo con forma de agarre; se mide el hueco que deja y en cada
// fotograma la mano entera se coloca con ese hueco sobre el implemento.
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const FIST = { '01': 70, '02': 95, '03': 65 };

/** Base ortonormal (como matriz) a partir de un eje y una segunda dirección. */
function basis(a, u) {
  const e1 = a.clone().normalize();
  const e2 = u.clone().addScaledVector(e1, -u.dot(e1)).normalize();
  const e3 = new THREE.Vector3().crossVectors(e1, e2);
  return new THREE.Matrix4().makeBasis(e1, e2, e3);
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

export async function createFigure(scene, base = 'model/') {
  const B = {};
  const rest = new Map();
  const proportions = [];
  const fist = {};
  let shorts = null;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion();
  const wp = n => B[n].getWorldPosition(new THREE.Vector3());

  function rotateWorld(bone, delta) {
    bone.getWorldQuaternion(_q);
    bone.parent.getWorldQuaternion(_p);
    bone.quaternion.copy(_p.invert().multiply(delta.clone().multiply(_q)));
    bone.updateMatrixWorld(true);
  }
  function aim(bone, child, target) {
    bone.getWorldPosition(_v);
    child.getWorldPosition(_w);
    const cur = _w.sub(_v).normalize();
    const want = target.clone().sub(_v).normalize();
    rotateWorld(bone, new THREE.Quaternion().setFromUnitVectors(cur, want));
  }

  // ── Carga ──
  const gltf = await new GLTFLoader().loadAsync(base + 'hero.gltf');
  const model = gltf.scene;
  model.rotation.y = Math.PI / 2;                     // el modelo mira a +z; el atleta, a +x
  scene.add(model);
  let normalMap = null, body = null;
  model.traverse(o => {
    if (o.isBone) { B[o.name] = o; rest.set(o, { p: o.position.clone(), q: o.quaternion.clone() }); }
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      if (o.material.name.includes('Superhero')) { normalMap = o.material.normalMap; body = o; }
      if (o.material.name.includes('Hair')) o.visible = false;   // cejas pintadas: una estatua no las tiene
    }
  });
  model.updateMatrixWorld(true);

  // ── Rizos tallados sobre el casquete del peinado ──
  const hair = (await new GLTFLoader().loadAsync(base + 'hair.gltf')).scene;
  hair.applyMatrix4(new THREE.Matrix4().copy(B.Head.matrixWorld).invert().multiply(model.matrixWorld));
  const caps = [];
  hair.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; caps.push(o); } });
  for (const cap of caps) cap.add(sculptCurls(cap));
  B.Head.add(hair);

  // ── Proporciones ──
  sculptClassic(body);

  // ── Pantalones ──
  const marbleMap = marbleTexture();
  const clothMats = {
    marble: clothMaterial({ color: 0x34302d, roughness: 0.92, metalness: 0 }),
    bronze: clothMaterial({ color: 0x241e1a, roughness: 0.8, metalness: 0.1 }),
  };
  makeShorts();
  setBuild('classic');

  const finishMats = {
    marble: hideUnderShorts(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: marbleMap, normalMap, normalScale: new THREE.Vector2(1.25, 1.25),
      roughness: 0.66, metalness: 0, sheen: 0.35, sheenColor: new THREE.Color(0xfff0dc), sheenRoughness: 0.8,
    })),
    bronze: hideUnderShorts(new THREE.MeshPhysicalMaterial({
      color: 0x8a5a33, normalMap, normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.42, metalness: 0.9, clearcoat: 0.15, clearcoatRoughness: 0.6,
    })),
  };
  setFinish('marble');
  makeFist('l');
  makeFist('r');
  M.gripOff = fist.l.center.length();

  function sculptCurls(capMesh) {
    const rnd = seeded(7);
    const g = capMesh.geometry;
    const pos = g.attributes.position, idx = g.index;
    g.computeBoundingBox();
    const center = g.boundingBox.getCenter(new THREE.Vector3());
    center.y -= 0.03;
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
      const out = a.clone().add(b).add(c).divideScalar(3).sub(center).normalize();
      if (n.dot(out) < 0) n.negate();
      if (n.dot(out) < 0.35 || n.y < -0.4) continue;
      tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), n: n.clone(), area });
      total += area;
    }
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
    const ring = new THREE.TorusGeometry(1, 0.6, 6, 14, Math.PI * 1.45);
    const knob = new THREE.SphereGeometry(1, 10, 8);
    knob.scale(1, 1, 0.62);
    const parts = pts.map(({ p, n: nn }) => {
      const big = 0.0075 + rnd() * 0.0045;
      const geo = (rnd() < 0.55 ? ring : knob).clone();
      geo.scale(big, big, big * 0.9);
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7, rnd() * Math.PI * 2));
      const q = new THREE.Quaternion().setFromUnitVectors(Z, nn).multiply(tilt);
      geo.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(nn, 0.0035), q, new THREE.Vector3(1, 1, 1)));
      return geo.toNonIndexed();
    });
    const merged = mergeGeometries(parts);
    merged.computeVertexNormals();
    const curls = new THREE.Mesh(merged, capMesh.material);
    curls.castShadow = true; curls.receiveShadow = true;
    return curls;
  }

  function sculptClassic(mesh) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const toMesh = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const axis = mesh.skeleton.bones.map(b => {
      const baseName = b.name.replace(/_[lr]$/, '');
      const f = SLIM[baseName];
      if (!f) return null;
      const side = b.name.endsWith('_l') ? '_l' : b.name.endsWith('_r') ? '_r' : '';
      const child = B[SLIM_CHILD[baseName] + (['Head', 'neck_01', 'spine_02', 'spine_03'].includes(SLIM_CHILD[baseName]) ? '' : side)];
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
          const t = THREE.MathUtils.clamp(v.clone().sub(ax.a).dot(ax.d) / ax.d.lengthSq(), 0, 1);
          proj.copy(ax.a).addScaledVector(ax.d, t);
          acc.addScaledVector(proj.clone().lerp(v, ax.f), w);
        } else acc.addScaledVector(v, w);
        wsum += w;
      }
      if (wsum > 0) { acc.divideScalar(wsum); out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z; }
    }
    proportions.push({ attr: pos, athletic, classic: out });
  }

  function makeShorts() {
    const g = body.geometry;
    const pos = g.attributes.position, idx = g.index;
    const y = new Float32Array(pos.count);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) y[i] = v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld).y;
    const keep = [];
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
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
    body.geometry.setAttribute('restY', new THREE.BufferAttribute(y, 1));
    shorts = { mesh, y };
  }

  function fitShorts(build) {
    const { mesh, y } = shorts;
    const src = proportions[0];
    const skin = build === 'classic' ? src.classic : src.athletic;
    const nrm = body.geometry.attributes.normal;
    const out = mesh.geometry.attributes.position;
    for (let i = 0; i < out.count; i++) {
      const flare = THREE.MathUtils.clamp((HEM_Y + 0.12 - y[i]) / 0.12, 0, 1);
      const off = 0.007 + 0.013 * flare * flare;
      out.setXYZ(i, skin[i * 3] + nrm.getX(i) * off, skin[i * 3 + 1] + nrm.getY(i) * off, skin[i * 3 + 2] + nrm.getZ(i) * off);
    }
    out.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  function setBuild(name) {
    for (const p of proportions) { p.attr.array.set(name === 'classic' ? p.classic : p.athletic); p.attr.needsUpdate = true; }
    if (shorts) fitShorts(name);
  }

  function setFinish(name) {
    model.traverse(o => { if (o.isMesh) o.material = o.userData.cloth ? clothMats[name] : finishMats[name]; });
  }

  function knuckleAxis(k) { return wp('index_01_' + k).sub(wp('pinky_01_' + k)).normalize(); }

  function makeFist(k) {
    model.updateMatrixWorld(true);
    const hand = B['hand_' + k];
    const axis = knuckleAxis(k);
    const probe = B['middle_01_' + k];
    const q0 = probe.quaternion.clone();
    const before = wp('middle_04_leaf_' + k);
    rotateWorld(probe, new THREE.Quaternion().setFromAxisAngle(axis, rad(30)));
    if (wp('middle_04_leaf_' + k).y > before.y) axis.negate();
    probe.quaternion.copy(q0); probe.updateMatrixWorld(true);
    for (const f of FINGERS) for (const n of ['01', '02', '03']) {
      rotateWorld(B[`${f}_${n}_${k}`], new THREE.Quaternion().setFromAxisAngle(axis, rad(FIST[n])));
    }
    const tAxis = new THREE.Vector3().crossVectors(wp('thumb_02_' + k).sub(wp('thumb_01_' + k)).normalize(), new THREE.Vector3(0, -1, 0)).normalize();
    const tb = wp('thumb_04_leaf_' + k);
    const qt = B['thumb_02_' + k].quaternion.clone();
    rotateWorld(B['thumb_02_' + k], new THREE.Quaternion().setFromAxisAngle(tAxis, rad(30)));
    if (wp('thumb_04_leaf_' + k).distanceTo(wp('middle_02_' + k)) > tb.distanceTo(wp('middle_02_' + k))) tAxis.negate();
    B['thumb_02_' + k].quaternion.copy(qt); B['thumb_02_' + k].updateMatrixWorld(true);
    rotateWorld(B['thumb_01_' + k], new THREE.Quaternion().setFromAxisAngle(tAxis, rad(20)));
    rotateWorld(B['thumb_02_' + k], new THREE.Quaternion().setFromAxisAngle(tAxis, rad(35)));
    rotateWorld(B['thumb_03_' + k], new THREE.Quaternion().setFromAxisAngle(tAxis, rad(40)));
    for (const f of [...FINGERS, 'thumb']) for (const n of ['01', '02', '03']) {
      const b = B[`${f}_${n}_${k}`];
      rest.get(b).q.copy(b.quaternion);
    }
    const hq = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
    const hp = wp('hand_' + k);
    const loop = ['middle_01_', 'middle_02_', 'middle_03_', 'middle_04_leaf_'].map(n => wp(n + k));
    const center = loop.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(loop.length);
    fist[k] = {
      center: center.clone().sub(hp).applyQuaternion(hq),
      axis: knuckleAxis(k).applyQuaternion(hq),
      knuckles: wp('middle_01_' + k).sub(center).normalize().applyQuaternion(hq),
      dir: wp('middle_01_' + k).sub(hp).normalize().applyQuaternion(hq),   // de la muñeca a los nudillos
    };
  }

  /**
   * Orientación de la mano: el hueco del puño a lo largo del eje del agarre.
   * Para cada giro posible del puño se calcula también dónde acaba el codo, y
   * se elige el que deja muñeca y hombro dentro de lo que puede un cuerpo; a
   * igualdad, el que deja el antebrazo hacia `forearm` y el dorso hacia `back`.
   */
  function fistQuat(k, g, sh, pole, up, overhead) {
    const F = fist[k];
    const L = basis(F.axis, F.knuckles).transpose();
    const ax0 = g.axis.clone().normalize();
    const p1 = new THREE.Vector3().crossVectors(ax0, Math.abs(ax0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const p2 = new THREE.Vector3().crossVectors(ax0, p1);
    const fwd = g.forearm.clone().normalize();
    const reachMax = M.upper + M.fore - 0.005;
    let best = null;
    for (const sz of [1, -1]) {
      const ax = ax0.clone().multiplyScalar(sz);
      for (let a = 0; a < 360; a += 5) {
        const u = p1.clone().multiplyScalar(Math.cos(rad(a))).addScaledVector(p2, Math.sin(rad(a)));
        const q = new THREE.Quaternion().setFromRotationMatrix(basis(ax, u).multiply(L));
        const wrist = g.point.clone().sub(F.center.clone().applyQuaternion(q));
        const dir = wrist.clone().sub(g.point);
        dir.addScaledVector(ax0, -dir.dot(ax0)).normalize();
        const elbow = twoBone(sh, wrist, M.upper, M.fore, pole);
        const bend = elbow.clone().sub(wrist).negate().angleTo(F.dir.clone().applyQuaternion(q)) * 180 / Math.PI;
        const lift = elbow.clone().sub(sh).angleTo(up.clone().negate()) * 180 / Math.PI;
        const far = Math.max(0, wrist.distanceTo(sh) - reachMax);
        const score = (dir.dot(fwd) * 2 + u.dot(g.back)) * 10
          - Math.max(0, bend - 55) * 3
          - (overhead ? 0 : Math.max(0, lift - 140) * 3)
          - far * 2000;
        if (!best || score > best.score) best = { q, wrist, elbow, score };
      }
    }
    return best;
  }

  /** Coloca el esqueleto en una pose. Devuelve el error de cada agarre (m). */
  function apply(pose) {
    for (const [bone, r] of rest) { bone.position.copy(r.p); bone.quaternion.copy(r.q); }
    model.updateMatrixWorld(true);

    // Pelvis y tronco en bloque.
    rotateWorld(B.pelvis, new THREE.Quaternion().setFromAxisAngle(Z, -pose.tr));
    const hipMid = wp('thigh_l').add(wp('thigh_r')).multiplyScalar(0.5);
    const pelvisW = wp('pelvis');
    B.pelvis.position.copy(B.pelvis.parent.worldToLocal(V(pose.H, pose.hipZ || 0).add(pelvisW.sub(hipMid))));
    model.updateMatrixWorld(true);
    rotateWorld(B.neck_01, new THREE.Quaternion().setFromAxisAngle(Z, pose.tr * 0.45 + (pose.neck || 0)));   // pose.neck: la cabeza se echa atrás para dejar pasar la barra

    // Piernas.
    for (const k of ['l', 'r']) {
      const leg = pose.legs[k];
      aim(B['thigh_' + k], B['calf_' + k], leg.K);
      aim(B['calf_' + k], B['foot_' + k], leg.A);
      aim(B['foot_' + k], B['ball_' + k], leg.toe);
    }

    // Brazos: o agarran algo (el puño sobre el implemento) o van a una muñeca.
    const err = {};
    for (const k of ['l', 'r']) {
      const arm = pose.arms[k];
      const sh = wp('upperarm_' + k);
      let wrist = arm.wrist, q = null, elbow;
      if (arm.grip) {
        const up = wp('neck_01').sub(wp('pelvis')).normalize();
        ({ q, wrist, elbow } = fistQuat(k, arm.grip, sh, arm.pole, up, pose.overhead));
      } else elbow = twoBone(sh, wrist, M.upper, M.fore, arm.pole);
      aim(B['upperarm_' + k], B['lowerarm_' + k], elbow);
      aim(B['lowerarm_' + k], B['hand_' + k], wrist);
      if (q) {
        const hand = B['hand_' + k];
        hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
        hand.updateMatrixWorld(true);
        const c = fist[k].center.clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())).add(wp('hand_' + k));
        err[k] = c.distanceTo(arm.grip.point);
      }
    }
    return err;
  }

  // ── Choques ────────────────────────────────────────────
  // Cada punto de la piel, ya deformado por el esqueleto, contra el material
  // (barra, discos, pesas) y contra otras partes del cuerpo aproximadas como
  // cápsulas (segmento de hueso con su radio, medido en reposo). Las manos que
  // agarran no cuentan contra lo que agarran: tocarlo es lo que tienen que hacer.
  const SEGS = {
    torso: ['pelvis', 'neck_01'], head: ['Head', null],
    thigh_l: ['thigh_l', 'calf_l'], thigh_r: ['thigh_r', 'calf_r'],
    calf_l: ['calf_l', 'foot_l'], calf_r: ['calf_r', 'foot_r'],
    upper_l: ['upperarm_l', 'lowerarm_l'], upper_r: ['upperarm_r', 'lowerarm_r'],
    fore_l: ['lowerarm_l', 'hand_l'], fore_r: ['lowerarm_r', 'hand_r'],
  };
  const segOfBone = name => {
    if (/^(pelvis|spine_0[123]|clavicle_[lr])$/.test(name)) return 'torso';
    if (/^(neck_01|Head)$/.test(name)) return 'head';
    let m = name.match(/^(thigh|calf)_([lr])$/); if (m) return `${m[1]}_${m[2]}`;
    m = name.match(/^(foot|ball)_([lr])$/); if (m) return `foot_${m[2]}`;
    m = name.match(/^upperarm_([lr])$/); if (m) return `upper_${m[1]}`;
    m = name.match(/^lowerarm_([lr])$/); if (m) return `fore_${m[1]}`;
    m = name.match(/_([lr])$/); if (m) return `hand_${m[1]}`;
    return 'torso';
  };
  // Qué partes no pueden meterse en cuáles (las que se tocan de verdad, fuera:
  // el muslo con el vientre en la sentadilla, la pantorrilla con el muslo).
  const AGAINST = {
    upper_l: ['torso', 'thigh_l', 'thigh_r', 'head'], upper_r: ['torso', 'thigh_l', 'thigh_r', 'head'],
    fore_l: ['torso', 'thigh_l', 'thigh_r', 'head', 'calf_l', 'calf_r', 'fore_r'], fore_r: ['torso', 'thigh_l', 'thigh_r', 'head', 'calf_l', 'calf_r'],
    hand_l: ['torso', 'thigh_l', 'thigh_r', 'head', 'calf_l', 'calf_r'], hand_r: ['torso', 'thigh_l', 'thigh_r', 'head', 'calf_l', 'calf_r'],
    thigh_l: ['thigh_r'], calf_l: ['calf_r', 'thigh_r'], calf_r: ['thigh_l'], foot_l: ['calf_r'], foot_r: ['calf_l'],
  };
  const vSeg = new Array(body.geometry.attributes.position.count);
  {
    const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    for (let i = 0; i < vSeg.length; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > bw) { bw = sw.getComponent(i, k); best = si.getComponent(i, k); }
      vSeg[i] = segOfBone(body.skeleton.bones[best].name);
    }
  }
  const segLine = name => {
    const [a, b] = SEGS[name];
    const pa = wp(a);
    const pb = b ? wp(b) : pa.clone().add(new THREE.Vector3(0, 0.12, 0).applyQuaternion(B.Head.getWorldQuaternion(new THREE.Quaternion())));
    return [pa, pb];
  };
  const distSeg = (p, a, b) => {
    const d = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(d) / d.lengthSq(), 0, 1);
    return p.distanceTo(a.clone().addScaledVector(d, t));
  };
  const skinned = () => {
    body.updateMatrixWorld(true);
    const pos = body.geometry.attributes.position, out = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i);
      body.applyBoneTransform(i, v);
      out.push([i, v.clone().applyMatrix4(body.matrixWorld)]);
    }
    return out;
  };
  // Radios de las cápsulas: la mitad de la distancia típica de su piel al eje
  // (dentro de la carne; tocar la superficie no es atravesar).
  const radius = {};
  {
    for (const [bone, r] of rest) { bone.position.copy(r.p); bone.quaternion.copy(r.q); }
    model.updateMatrixWorld(true);
    const pts = skinned(), lines = {};
    for (const n of Object.keys(SEGS)) lines[n] = segLine(n);
    for (const n of Object.keys(SEGS)) {
      const ds = pts.filter(([i]) => vSeg[i] === n).map(([, p]) => distSeg(p, ...lines[n])).sort((a, b) => a - b);
      radius[n] = ds.length ? ds[Math.floor(ds.length * 0.5)] * 0.75 : 0;
    }
  }

  /** Mayor penetración (m) en la pose ya aplicada, y dónde. */
  function collisions(pose) {
    const pts = skinned();
    const lines = {};
    for (const n of Object.keys(SEGS)) lines[n] = segLine(n);
    const gripping = { l: !!(pose.arms.l.grip || pose.arms.l.rests), r: !!(pose.arms.r.grip || pose.arms.r.rests) };
    let worst = { depth: 0, where: '' };
    const hit = (depth, where) => { if (depth > worst.depth) worst = { depth, where }; };
    for (const [i, p] of pts) {
      const seg = vSeg[i];
      for (const other of AGAINST[seg] || []) {
        const d = radius[other] - distSeg(p, ...lines[other]);
        if (d > 0) hit(d, `${seg} dentro de ${other}`);
      }
      const isHand = seg.startsWith('hand_') && gripping[seg.slice(-1)];
      if (isHand) continue;
      for (const pr of pose.props || []) {
        if (pr.kind === 'barbell') {
          const c = pr.pos;
          const dx = Math.hypot(p.x - c.x, p.y - c.y);
          if (Math.abs(p.z - c.z) < 0.62) hit(BAR_R - dx, `${seg} en la barra`);
          else if (Math.abs(p.z - c.z) < 0.76) hit(PLATE_R - dx, `${seg} en un disco`);
        } else if (pr.kind === 'kettlebell') {
          const center = pr.handle.clone().addScaledVector(pr.down, KB.handle);
          hit(KB.r - p.distanceTo(center), `${seg} en la pesa`);
        }
      }
    }
    return worst;
  }

  // ── Límites de las articulaciones ──────────────────────
  // Lo que no atraviesa nada pero no puede hacer un cuerpo: el codo por encima
  // de la cabeza sin ser un ejercicio por encima de la cabeza, la muñeca doblada
  // en ángulo recto, el codo o la rodilla doblados al revés. Ángulos en grados.
  const deg = r => r * 180 / Math.PI;
  const angle = (a, b) => deg(a.angleTo(b));
  function joints(pose) {
    const up = wp('neck_01').sub(wp('pelvis')).normalize();          // eje del tronco
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(B.pelvis.getWorldQuaternion(new THREE.Quaternion()));
    const out = {};
    for (const k of ['l', 'r']) {
      const sh = wp('upperarm_' + k), el = wp('lowerarm_' + k), wr = wp('hand_' + k), kn = wp('middle_01_' + k);
      const upper = el.clone().sub(sh), fore = wr.clone().sub(el), hand = kn.clone().sub(wr);
      out['hombro_' + k] = angle(upper, up.clone().negate());       // 0 = brazo colgando, 180 = brazo arriba
      out['codo_' + k] = 180 - angle(upper.clone().negate(), fore); // 0 = recto
      out['muñeca_' + k] = angle(fore, hand);                       // 0 = recta
      const th = wp('calf_' + k).sub(wp('thigh_' + k)), sk = wp('foot_' + k).sub(wp('calf_' + k));
      out['rodilla_' + k] = angle(th, sk);
      // Rodilla doblada al revés: la rodilla queda por detrás de la línea cadera-tobillo.
      const h = wp('thigh_' + k), a = wp('foot_' + k), kn2 = wp('calf_' + k);
      const ha = a.clone().sub(h).normalize();
      const off = kn2.clone().sub(h); off.addScaledVector(ha, -off.dot(ha));
      out['rodilla_inv_' + k] = off.x < -0.015 ? 1 : 0;           // el atleta mira a +x
    }
    return out;
  }
  const LIMITS = { hombro: 150, codo: 150, 'muñeca': 70, rodilla: 160 };
  /** Peor violación de los límites en la pose ya aplicada: { exceso (grados), dónde }. */
  function jointCheck(pose) {
    const j = joints(pose);
    let worst = { excess: 0, where: '' };
    const overhead = pose.overhead;
    for (const [name, v] of Object.entries(j)) {
      const [kind, side] = name.split('_').length === 3 ? ['rodilla_inv', name.slice(-1)] : name.split('_');
      if (kind === 'rodilla_inv') { if (v) worst = { excess: 99, where: `rodilla ${side === 'l' ? 'izq.' : 'der.'} doblada al revés` }; continue; }
      if (kind === 'hombro' && overhead) continue;
      const ex = v - LIMITS[kind];
      if (ex > worst.excess) worst = { excess: ex, where: `${kind} ${side === 'l' ? 'izq.' : 'der.'} a ${Math.round(v)}° (máx. ${LIMITS[kind]}°)` };
    }
    return worst;
  }

  return { model, bones: B, apply, setFinish, setBuild, collisions, joints, jointCheck };
}
