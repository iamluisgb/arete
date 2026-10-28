// Brazos y hombros de pie con barra. Piernas y tronco quietos: solo se mueven
// los brazos (curl) o los hombros (encogimientos).

import * as THREE from 'three';
import {
  M, ANKLE_X, rad, lerp, v2, add2, shoulderFrom, plantedLeg, V3, barbell, both, reach,
} from '../poses.js';

/** Cuerpo erguido y quieto: pies planos, tronco casi vertical. */
function standing(tr = 0.02) {
  const A = v2(ANKLE_X, M.ankleH);
  const K = add2(A, v2(0, M.shank));
  const H = add2(K, v2(0, M.thigh));
  const S = shoulderFrom(H, tr);
  const stance = { foot: 0.12, toeOut: 8 };
  return { A, K, H, S, tr, legs: both((k, side) => plantedLeg(A, K, side, stance)) };
}

/**
 * Curl con barra de pie. El codo no se mueve: es el pivote. El antebrazo gira
 * en el plano de perfil y la barra dibuja un arco.
 * @param {object} o
 *   grip: 'supine' (palmas arriba) | 'prone' (curl invertido, dorso arriba)
 *   from, to: flexión del codo (grados) abajo y arriba; 0 = antebrazo colgando
 *   elbowBack: cuánto queda el codo por detrás de la vertical del hombro (m)
 *   gripZ: separación de cada mano al centro de la barra (m)
 */
export function barbellCurl(o = {}) {
  const prone = o.grip === 'prone';
  const from = rad(o.from ?? 22), to = rad(o.to ?? 124);
  const gripZ = o.gripZ ?? (prone ? 0.15 : 0.22);
  const body = standing();
  const { S, H, tr } = body;
  const E = v2(S.x - (o.elbowBack ?? -0.03), S.y - M.upper);      // el codo, quieto
  const len = M.fore + M.gripOff - 0.016;
  return s => {
    const phi = lerp(from, to, s);
    const f = v2(Math.sin(phi), -Math.cos(phi));                   // hacia dónde mira el antebrazo
    const G = v2(E.x + len * f.x, E.y + len * f.y);
    // El dorso de la mano gira con el antebrazo: atrás abajo, abajo arriba. En prono, al revés.
    const sign = prone ? -1 : 1;
    const back = new THREE.Vector3(-Math.cos(phi) * sign, -Math.sin(phi) * sign, 0);
    return {
      H, tr, legs: body.legs, props: [barbell(G)], track: V3(G),
      arms: both((k, side) => ({
        grip: { point: V3(G, side * gripZ), axis: new THREE.Vector3(0, 0, 1), forearm: new THREE.Vector3(-f.x, -f.y, 0), back },
        pole: new THREE.Vector3(-1, -0.4, side * 0.15),
      })),
    };
  };
}

/**
 * Encogimientos: la barra cuelga delante de los muslos con los brazos
 * estirados y solo suben los hombros.
 * @param {object} o  rise: cuánto suben (m); fwd: delantero de la barra respecto al hombro
 */
export function shrug(o = {}) {
  const rise = o.rise ?? 0.07;
  const gripZ = o.gripZ ?? 0.22;
  const body = standing();
  const { H, tr } = body;
  return s => {
    const S0 = body.S;
    const lift = rise * s;
    const dz = Math.abs(M.shoulderZ - gripZ);
    const fwd = o.fwd ?? 0.16;
    const r = Math.sqrt((reach() + 0.012) ** 2 - dz * dz - fwd * fwd);
    const g = v2(S0.x + fwd, S0.y + lift - r);
    return {
      H, tr, legs: body.legs, shrug: lift, props: [barbell(g)], track: V3(g),
      arms: both((k, side) => ({
        grip: { point: V3(g, side * gripZ), axis: new THREE.Vector3(0, 0, 1), forearm: new THREE.Vector3(0, 1, 0), back: new THREE.Vector3(1, 0, 0) },
        pole: new THREE.Vector3(-1, 0, side * 0.3),
      })),
    };
  };
}
