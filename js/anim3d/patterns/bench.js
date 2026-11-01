// Press de banca: tumbado boca arriba en un banco plano, con los pies en el
// suelo. s = 0 con la barra bloqueada sobre los hombros; s = 1 con la barra
// tocando el pecho.
//
//   · escápulas juntas y abajo todo el recorrido (`retract`): el pecho alto y
//     los hombros pegados al banco, no despegados al empujar;
//   · la cabeza, los hombros y los glúteos apoyados; los pies planos en el
//     suelo, más abiertos que la cadera y un poco por detrás de las rodillas;
//   · la barra baja a la parte baja del pecho y sube en una J suave hasta
//     quedar sobre los hombros;
//   · antebrazos verticales vistos de lado y de frente: el codo debajo de la
//     barra, a unos 60° del tronco (ni pegado ni en cruz).
//
// Tumbado, el atleta tiene la cabeza hacia -x y el pecho mirando arriba
// (tr = -90°).

import * as THREE from 'three';
import {
  M, BAR_R, ZAX, rad, lerp, clamp, v2, shoulderFrom, barbell, bench, V3, both,
  bend3, flatFoot, HIP_Z,
} from '../poses.js';

const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/**
 * @param {object} o
 *   gripZ: medio ancho de agarre · touch: dónde toca la barra (m hacia los pies desde el hombro)
 *   back, hip: altura de hombros y cadera sobre el banco · chest: altura del pecho sobre el hombro
 */
export function benchPress(o = {}) {
  const B = bench(o.benchX ?? -0.12, 0);
  const top = B.top.y;
  const gripZ = o.gripZ ?? 0.4;
  // Tronco apoyado: cadera y hombros a la altura de la espalda sobre el tapizado.
  const H = v2(o.hipX ?? 0.24, top + (o.hip ?? 0.115));
  const tr = -rad(90) + rad(o.arch ?? 2);
  const S = shoulderFrom(H, tr);
  const legs = both((k, side) => {
    const hip = new THREE.Vector3(H.x, H.y, side * HIP_Z);
    const A = new THREE.Vector3(o.footX ?? 0.6, M.ankleH, side * (o.footZ ?? 0.27));
    const K = bend3(hip, A, M.thigh, M.shank, new THREE.Vector3(0.6, 1, side * 0.3));
    return { A, K, toe: flatFoot(A, side, o.toeOut ?? 25) };
  });
  const dz = gripZ - M.shoulderZ;
  return s => {
    const p = sm(s);
    // Bloqueo sobre los hombros (con las escápulas atrás, el hombro baja ~2 cm).
    const lock = v2(S.x + (o.lockX ?? 0.03), S.y - (o.lockDrop ?? 0.02) + Math.sqrt((M.upper + M.fore + M.gripOff - 0.04) ** 2 - dz * dz));
    const touch = v2(S.x + (o.touch ?? 0.14), S.y + (o.chest ?? 0.175) + BAR_R);
    // La J: la barra baja casi en vertical y se va hacia el pecho al final.
    const bar = v2(lerp(lock.x, touch.x, sm((p - 0.15) / 0.85)), lerp(lock.y, touch.y, p));
    return {
      H, tr, legs, headFollow: 0, retract: rad(o.retract ?? 14),
      props: [B, barbell(bar)], track: V3(bar),
      arms: both((k, side) => {
        const sh = V3(S, side * M.shoulderZ);
        // El codo, justo debajo de la barra (antebrazo vertical) y un poco por fuera del agarre.
        // Cerca del bloqueo esa dirección casi coincide con la del brazo y el
        // codo saltaría de lado: se le suma un empuje fijo hacia los pies,
        // abajo y afuera, que es adonde apunta el codo en la banca.
        const pole = new THREE.Vector3(bar.x + 0.02, bar.y - M.fore, side * (gripZ + (o.elbowOut ?? 0.02))).sub(sh)
          .add(new THREE.Vector3(0.15, -0.3, side * 0.15));
        return {
          grip: { point: V3(bar, side * gripZ), axis: ZAX, forearm: new THREE.Vector3(...(o.forearm ?? [0.3, -1, 0])), back: new THREE.Vector3(...(o.knuckles ?? [1, 1, 0])) },
          pole,
        };
      }),
    };
  };
}
