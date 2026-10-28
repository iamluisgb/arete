// Remo inclinado con barra. Postura de bisagra fija (la de poses.hinge, pero
// con el tronco quieto): solo se mueven los brazos. s = 0 es la barra colgando
// con los brazos estirados, s = 1 es la barra tocando el abdomen alto.

import * as THREE from 'three';
import {
  M, ANKLE_X, MID_X, rad, lerp, clamp, v2, add2, polar, shoulderFrom, torsoPoint, solve,
  reach, barClear, plantedLeg, barbell, both, V3, ZAX,
} from '../poses.js';

/**
 * @param {object} o
 *   trunk: inclinación del tronco desde la vertical (grados; 50 = 40° sobre la horizontal)
 *   knee: tibia máxima (grados)
 *   gripZ: mitad de la separación de las manos
 *   hangX: x de la barra colgando (mediopié = 0)
 *   topFwd, topUp: dónde toca la barra, en el marco del tronco desde los hombros
 *   stance: { foot, toeOut }
 */
export function row(o = {}) {
  const stance = o.stance || { foot: 0.12, toeOut: 5 };
  const gripZ = o.gripZ ?? 0.3;
  const tr = rad(o.trunk ?? 50);
  const dz = Math.abs(M.shoulderZ - gripZ);
  const r = Math.sqrt(reach() ** 2 - dz * dz);
  const A = v2(ANKLE_X, M.ankleH);

  // Postura fija: la tibia más flexionada que deje pasar la barra por delante.
  const fixed = (() => {
    for (let a = rad(o.knee ?? 16); a >= rad(-4); a -= rad(0.25)) {
      const K = add2(A, polar(M.shank, a));
      const hipOf = p => add2(K, v2(-M.thigh * Math.sin(p), M.thigh * Math.cos(p)));
      // Muslo con el que los hombros quedan donde pide el brazo colgando.
      const phi = solve(p => -shoulderFrom(hipOf(p), tr).x, -(MID_X + (o.hangX ?? 0.02) + (o.lean ?? 0.02)), rad(-10), rad(80));
      const H = hipOf(phi);
      const S = shoulderFrom(H, tr);
      const bottom = v2(S.x - (o.lean ?? 0.02), S.y - Math.sqrt(Math.max(r * r - (o.lean ?? 0.02) ** 2, 0)));
      const top = torsoPoint(S, tr, o.topFwd ?? 0.165, o.topUp ?? -0.2);
      let ok = true;
      for (let i = 0; i <= 20 && ok; i++) ok = barClear(A, K, H, path(bottom, top, i / 20));
      if (ok) return { K, H, S, bottom, top };
    }
    throw new Error('row: no hay postura sin choque');
  })();

  function path(bottom, top, s) {
    // La barra sube casi vertical y se mete al abdomen al final.
    const e = s ** (o.curve ?? 2);
    return v2(lerp(bottom.x, top.x, e), lerp(bottom.y, top.y, s));
  }

  return s => {
    const { K, H, S, bottom, top } = fixed;
    const bar = path(bottom, top, s);
    const legs = both((k, side) => plantedLeg(A, K, side, stance));
    const pole = side => new THREE.Vector3(-1, 0.1 * s, side * lerp(0.3, 0.5, s));
    return {
      H, tr, legs, props: [barbell(bar)], track: V3(bar),
      arms: both((k, side) => ({
        grip: { point: V3(bar, side * gripZ), axis: ZAX, forearm: new THREE.Vector3(-0.1 * s, 1, 0), back: new THREE.Vector3(1, -0.1, 0) },
        pole: pole(side),
      })),
    };
  };
}
