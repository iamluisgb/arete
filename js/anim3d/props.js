// Material de gimnasio: barra con discos, pesas rusas y lo fijo (banco, barra
// de dominadas, paralelas). Cada fotograma se colocan los que pida la pose;
// los que no, se esconden.

import * as THREE from 'three';
import { BAR_R, PLATE_R, KB } from './poses.js';

const iron = new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.45, metalness: 0.85 });
const steel = new THREE.MeshStandardMaterial({ color: 0xc9c3bc, roughness: 0.28, metalness: 0.9 });
const castIron = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.55, metalness: 0.7 });

function makeBarbell() {
  // El lado de los discos que queda entre la cámara y el atleta se vuelve
  // transparente: en la vista de lado taparían el cuerpo.
  const plateMats = { 1: iron.clone(), [-1]: iron.clone() };
  for (const m of Object.values(plateMats)) m.transparent = true;
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, 2.0, 20), steel);
  shaft.rotation.x = Math.PI / 2; shaft.castShadow = true;
  g.add(shaft);
  for (const side of [-1, 1]) {
    for (const [z, r, w] of [[0.64, PLATE_R, 0.045], [0.695, PLATE_R, 0.045], [0.735, 0.05, 0.03]]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 64), r > 0.1 ? plateMats[side] : steel);
      plate.rotation.x = Math.PI / 2; plate.position.z = side * z; plate.castShadow = true;
      g.add(plate);
    }
  }
  g.userData.plateMats = plateMats;
  return g;
}

/** Pesa rusa con el centro de la bola en el origen y el asa arriba, a lo largo de z. */
function makeKettlebell() {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(new THREE.SphereGeometry(KB.r, 40, 28), castIron);
  bell.scale.y = 0.96;
  bell.castShadow = true; bell.receiveShadow = true;
  g.add(bell);
  const path = new THREE.CatmullRomCurve3([
    [0, 0.055, -0.07], [0, 0.12, -KB.horn.z], [0, 0.158, -0.055], [0, KB.handle, 0], [0, 0.158, 0.055], [0, 0.12, KB.horn.z], [0, 0.055, 0.07],
  ].map(p => new THREE.Vector3(...p)));
  const handle = new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.016, 12, false), castIron);
  handle.castShadow = true;
  g.add(handle);
  return g;
}

const pad = new THREE.MeshStandardMaterial({ color: 0x2a2421, roughness: 0.8, metalness: 0.05 });

/** Banco plano: caja de tapizado de 1×1×1 que se escala, sobre dos patas. */
function makeBench() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pad);
  top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  const legs = [-1, 1].map(() => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.28), steel);
    l.castShadow = true; g.add(l); return l;
  });
  g.userData = { top, legs };
  return g;
}

/** Tubo fijo entre dos puntos (barra de dominadas, paralelas). */
function makeRod() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), steel);
  m.castShadow = true;
  return m;
}

export function createProps(scene) {
  const barbell = makeBarbell();
  const bells = [makeKettlebell(), makeKettlebell()];
  const bench = makeBench();
  const rods = Array.from({ length: 6 }, makeRod);
  scene.add(barbell, ...bells, bench, ...rods);

  function place(list) {
    barbell.visible = false;
    bells.forEach(b => { b.visible = false; });
    bench.visible = false;
    rods.forEach(r => { r.visible = false; });
    let nb = 0, nr = 0;
    for (const p of list || []) {
      if (p.kind === 'bench') {
        // `top`: centro de la cara de arriba; largo a lo largo de x.
        const { top, legs } = bench.userData;
        bench.visible = true;
        top.scale.set(p.len, p.thick, p.width);
        top.position.set(p.top.x, p.top.y - p.thick / 2, p.top.z);
        const legH = p.top.y - p.thick;
        legs.forEach((l, i) => {
          l.scale.y = legH;
          l.position.set(p.top.x + (i ? 1 : -1) * (p.len / 2 - 0.12), legH / 2, p.top.z);
        });
        continue;
      }
      if (p.kind === 'rod' && nr < rods.length) {
        const r = rods[nr++];
        r.visible = true;
        const d = p.b.clone().sub(p.a);
        r.scale.set(p.r, d.length(), p.r);
        r.position.copy(p.a).addScaledVector(d, 0.5);
        r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        continue;
      }
      if (p.kind === 'barbell') {
        barbell.visible = true;
        barbell.position.copy(p.pos);
      } else if (p.kind === 'kettlebell' && nb < bells.length) {
        const b = bells[nb++];
        b.visible = true;
        // Ejes de la pesa: y hacia el asa (contrario a donde cuelga la bola), z a lo largo del asa.
        const y = p.down.clone().negate();
        const z = p.axis.clone().addScaledVector(y, -p.axis.dot(y)).normalize();
        const x = new THREE.Vector3().crossVectors(y, z);
        b.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        b.position.copy(p.handle).addScaledVector(y, -KB.handle);
      }
    }
  }

  /** Transparencia de los discos según desde dónde mire la cámara. */
  function update(camera) {
    const side = camera.position.z / Math.hypot(camera.position.x, camera.position.z);
    const m = barbell.userData.plateMats;
    m[1].opacity = 1 - 0.8 * Math.max(0, side - 0.3) / 0.7;
    m[-1].opacity = 1 - 0.8 * Math.max(0, -side - 0.3) / 0.7;
    for (const mm of Object.values(m)) mm.depthWrite = mm.opacity > 0.95;
  }

  function setFinish(name) {
    const metal = name === 'bronze' ? 0x241e1a : 0x3a2a1e;
    castIron.color.setHex(metal);
  }

  return { place, update, setFinish };
}
