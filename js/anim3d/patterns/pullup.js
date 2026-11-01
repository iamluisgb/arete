// Dominadas: colgado de una barra fija, de brazos estirados a la barbilla por
// encima de la barra. s = 0 colgado; s = 1 arriba.
//
//   · rango completo: abajo los codos casi bloqueados (colgado activo, sin
//     soltar los hombros); arriba la barbilla pasa la barra;
//   · las manos no se mueven: el cuerpo sube bajo ellas y el pecho va hacia la
//     barra, con el tronco un poco echado atrás y la cabeza que la deja pasar;
//   · los codos bajan hacia las costillas, por debajo de la barra;
//   · piernas juntas y casi rectas, un poco por delante (cuerpo en «hollow»),
//     sin balanceo: la barra queda sobre el centro de masas.

import * as THREE from 'three';
import { M, ZAX, rad, lerp, clamp, v2, add2, polar, rot2, V3, rod } from '../poses.js';

const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/**
 * Barra de dominadas: travesaño a `y` de altura en x = 0. Los postes van
 * detrás del atleta, con un brazo hasta la barra: si fueran a los extremos de
 * la barra, de lado uno taparía el cuerpo.
 */
export const PULLUP_BAR = { y: 2.28, half: 0.6, back: -0.5 };
const pullupRig = (y = PULLUP_BAR.y, h = PULLUP_BAR.half, bx = PULLUP_BAR.back) => [
  rod(new THREE.Vector3(0, y, -h), new THREE.Vector3(0, y, h)),
  ...[-1, 1].flatMap(side => [
    rod(new THREE.Vector3(bx, 0, side * h), new THREE.Vector3(bx, y + 0.02, side * h), 0.024),
    rod(new THREE.Vector3(bx, y, side * h), new THREE.Vector3(0.02, y, side * h), 0.02),
  ]),
];

/**
 * @param {object} o
 *   grip: 'prone' (palmas al frente) | 'supine' (palmas hacia ti) · gripZ: medio ancho de agarre
 *   hang: hombros bajo la barra colgado · top: hombros bajo la barra arriba · lean: tronco atrás arriba (grados)
 */
export function pullup(o = {}) {
  const supine = o.grip === 'supine';
  const gripZ = o.gripZ ?? (supine ? 0.24 : 0.36);
  const by = o.barY ?? PULLUP_BAR.y;
  const props = pullupRig(by);
  const dz = Math.abs(gripZ - M.shoulderZ);
  const hang = Math.sqrt((M.upper + M.fore + M.gripOff - 0.035) ** 2 - dz * dz);
  return s => {
    const p = sm(s);
    // El cuerpo se echa atrás antes de que la cara llegue a la barra.
    const q = sm(s / 0.7);
    // Hombros: colgados bajo la barra → arriba, detrás de ella y a la altura del pecho.
    const S = v2(lerp(o.hangX ?? -0.03, o.topX ?? -0.13, q), by - lerp(hang + (o.hangDrop ?? (supine ? 0.025 : 0)), o.top ?? (supine ? 0.1 : 0.09), p));
    const tr = -rad(lerp(o.lean0 ?? 4, o.lean ?? 20, q));
    const H = add2(S, polar(-M.torsoLen, tr + M.torsoOff));
    // Piernas casi rectas por delante del tronco; los pies en punta.
    const legAng = tr + rad(o.legs ?? 14);                // + delante
    const d1 = v2(Math.sin(legAng), -Math.cos(legAng));
    const K = add2(H, v2(d1.x * M.thigh, d1.y * M.thigh));
    const d2 = rot2(d1, -rad(o.knee ?? 12));              // la tibia, un poco atrás: rodilla algo doblada
    const A = add2(K, v2(d2.x * M.shank, d2.y * M.shank));
    const toe = add2(A, add2(v2(d2.x * 0.12, d2.y * 0.12), rot2(v2(d2.x * 0.05, d2.y * 0.05), rad(90))));
    const fz = 0.07;
    const legs = {
      l: { A: V3(A, -fz), K: V3(K, -fz - 0.01), toe: V3(toe, -fz) },
      r: { A: V3(A, fz), K: V3(K, fz + 0.01), toe: V3(toe, fz) },
    };
    const pose = {
      H, tr, legs, overhead: true, props, track: V3(S),
      neck: rad(o.neck ?? 14) * q,                         // arriba la cabeza se echa atrás: la barbilla pasa la barra
      headFollow: 0.3,
    };
    pose.arms = {};
    for (const [k, side] of [['l', -1], ['r', 1]]) {
      const sh = V3(S, side * M.shoulderZ);
      // El codo, debajo de la mano (antebrazo vertical) y algo por fuera; más
      // un empuje fijo abajo, adelante y afuera para que no salte de lado con
      // el brazo estirado.
      const push = o.elbowPush ?? (supine ? [0.3, -0.1, 0.05] : [0.15, -0.1, 0.2]);
      const pole = new THREE.Vector3(0.03, by - M.fore, side * (gripZ + 0.05)).sub(sh).add(new THREE.Vector3(push[0], push[1], side * push[2]));
      pose.arms[k] = {
        grip: { point: new THREE.Vector3(0, by, side * gripZ), axis: ZAX, forearm: new THREE.Vector3(0, -1, 0),
          back: new THREE.Vector3(...(o.knuckles ?? (supine ? [1, 0.7, 0] : [-1, -0.1, 0]))) },
        pole,
      };
    }
    return pose;
  };
}
