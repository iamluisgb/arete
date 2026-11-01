// Fondos en paralelas: apoyado en las manos entre dos barras, de brazos
// estirados a los hombros a la altura de los codos. s = 0 arriba; s = 1 abajo.
//
//   · las manos no se mueven, con agarre neutro y la muñeca recta sobre el
//     antebrazo;
//   · los codos van atrás, no se abren hacia los lados; abajo el brazo queda
//     paralelo al suelo (hombro a la altura del codo, sin pasarse);
//   · el tronco se inclina adelante al bajar y los hombros avanzan por delante
//     de las manos: así el centro de masas sigue sobre ellas;
//   · rodillas dobladas y pies detrás, juntos, sin tocar el suelo.

import * as THREE from 'three';
import { M, XAX, rad, lerp, clamp, v2, add2, polar, rot2, V3, rod } from '../poses.js';

const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Paralelas: dos barras a lo largo de x, a `y` de altura y `z` del centro, con sus postes. */
export const DIP_BARS = { y: 1.3, z: 0.25, len: 0.45 };
const dipRig = ({ y, z, len } = DIP_BARS) => [-1, 1].flatMap(side => [
  rod(new THREE.Vector3(-len, y, side * z), new THREE.Vector3(len, y, side * z)),
  rod(new THREE.Vector3(-len + 0.05, 0, side * z), new THREE.Vector3(-len + 0.05, y, side * z), 0.022),
  rod(new THREE.Vector3(len - 0.05, 0, side * z), new THREE.Vector3(len - 0.05, y, side * z), 0.022),
]);

/**
 * @param {object} o
 *   lean: inclinación del tronco abajo (grados) · fwd: hombros por delante de las manos abajo
 *   depth: hombros bajo la barra abajo
 */
export function dip(o = {}) {
  const bars = { ...DIP_BARS, ...(o.bars || {}) };
  const props = dipRig(bars);
  const hx = 0;                                             // las manos, en x = 0
  // La muñeca, sobre la barra: en apoyo la barra queda en la base de la palma.
  const W = v2(hx, bars.y + (o.wristUp ?? 0.09));
  return s => {
    const p = sm(s);
    // El antebrazo sube de la mano al codo y se inclina un poco atrás; el
    // brazo pasa de vertical a paralelo al suelo (el hombro, a la altura del
    // codo). Interpolar el hombro en línea recta acortaba la distancia a la
    // mano a mitad de camino y el codo se cerraba del todo.
    const a = rad(lerp(0, o.foreBack ?? 15, p)), g = rad(lerp(o.arm0 ?? 3, o.arm ?? 95, p));
    const E = add2(W, v2(-M.fore * Math.sin(a), M.fore * Math.cos(a)));
    const S = add2(E, v2(M.upper * Math.sin(g), M.upper * Math.cos(g)));
    const tr = rad(lerp(o.lean0 ?? 6, o.lean ?? 28, p));
    const H = add2(S, polar(-M.torsoLen, tr + M.torsoOff));
    // Muslos casi verticales (la cadera se dobla al inclinarse el tronco),
    // tibias hacia atrás y los pies en punta.
    const th = rad(o.thigh ?? 8);
    const d1 = v2(Math.sin(th), -Math.cos(th));
    const K = add2(H, v2(d1.x * M.thigh, d1.y * M.thigh));
    const d2 = rot2(d1, -rad(o.knee ?? 95));
    const A = add2(K, v2(d2.x * M.shank, d2.y * M.shank));
    const toe = add2(A, add2(v2(d2.x * 0.12, d2.y * 0.12), rot2(v2(d2.x * 0.05, d2.y * 0.05), rad(90))));
    const fz = 0.075;
    const legs = {
      l: { A: V3(A, -fz), K: V3(K, -fz - 0.005), toe: V3(toe, -fz) },
      r: { A: V3(A, fz), K: V3(K, fz + 0.005), toe: V3(toe, fz) },
    };
    const pose = { H, tr, legs, props, track: V3(S), headFollow: 0.6 };
    pose.arms = {};
    for (const [k, side] of [['l', -1], ['r', 1]]) {
      // Codos atrás: el codo, detrás de la mano y un poco por fuera.
      const pole = new THREE.Vector3(-1, 0, side * (o.flare ?? 0.15));
      pose.arms[k] = {
        grip: { point: new THREE.Vector3(hx, bars.y, side * bars.z), axis: XAX, forearm: new THREE.Vector3(0, 1, 0),
          back: new THREE.Vector3(...(o.knuckles ?? [0, -0.3, 1])).multiply(new THREE.Vector3(1, 1, side)) },
        pole,
      };
    }
    return pose;
  };
}
