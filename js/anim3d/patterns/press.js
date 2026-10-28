// Patrón de press por encima de la cabeza: press militar, push press y
// thruster con una pesa rusa. La profundidad s va de 0 (rack, o fondo de la
// sentadilla en el thruster) a 1 (bloqueo arriba).
//
//   · la barra sale de las clavículas, sube vertical por delante de la cara
//     (la cabeza se retira) y acaba sobre el mediopié, con los bíceps junto a
//     las orejas;
//   · los pies no se mueven; el tronco va en bloque y se inclina hacia atrás
//     solo lo justo para dejar pasar la barra.

import * as THREE from 'three';
import {
  M, ANKLE_X, MID_X, KB, ZAX, rad, lerp, clamp, solve,
  v2, add2, polar, shoulderFrom, torsoPoint, plantedLeg, barbell, kettlebell, both, V3,
} from '../poses.js';

const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const bump = t => Math.sin(Math.PI * clamp(t, 0, 1));
const mixV = (a, b, t) => a.clone().lerp(b, t).normalize();

/**
 * Press de barra de pie.
 * @param {object} o
 *   push: push press (dip de rodillas e impulso antes de que suba la barra)
 *   stance, rackFwd, rackUp, lean, neck, gripZ: ajustes finos
 */
export function overheadPress(o = {}) {
  const stance = o.stance || { foot: 0.1, toeOut: 8 };
  const gripZ = o.gripZ ?? 0.31;
  return s => {
    const A = v2(ANKLE_X, M.ankleH);
    // Dip del push press: ~13° de rodilla, en el primer tercio.
    const d = o.push ? bump(s / 0.3) : 0;
    const p = o.push ? sm((s - 0.17) / 0.83) : sm(s);
    const th = rad(o.dipThigh ?? 5) * d, sh = rad(o.dipShank ?? 8) * d;
    const K = add2(A, polar(M.shank, sh));
    const H = add2(K, v2(-M.thigh * Math.sin(th), M.thigh * Math.cos(th)));

    // El tronco se inclina hacia atrás mientras la barra pasa por delante de la cara.
    const tr = -rad(o.lean ?? 5) * bump(p * 1.1) - rad(o.leanLock ?? 1) * p;
    const S = shoulderFrom(H, tr);

    // Barra: del rack (clavículas) al bloqueo (sobre el mediopié), vertical.
    const R = torsoPoint(S, tr, o.rackFwd ?? 0.13, o.rackUp ?? 0.05);
    const lockX = o.lockX ?? MID_X - 0.03;
    const dz = Math.abs(M.shoulderZ - gripZ);
    const lockY = S.y + Math.sqrt(Math.max((M.upper + M.fore + M.gripOff - 0.035) ** 2 - (lockX - S.x) ** 2 - dz * dz, 0));
    const y = lerp(R.y, lockY, p);
    const x = lerp(R.x, lockX, sm((p - (o.pass ?? 0.42)) / 0.35)) + (o.bulge ?? 0.03) * bump(p / 0.5);   // pasa por delante de la cara
    const bar = v2(x, y);

    const legs = both((k, side) => plantedLeg(A, K, side, stance));
    const pose = { H, tr, legs, props: [barbell(bar)], track: V3(bar), overhead: p > 0.3,
      neck: rad(o.neck ?? 12) * bump(p * 1.1) };
    const U = (a, b) => mixV(new THREE.Vector3(...a), new THREE.Vector3(...b), p);
    pose.arms = both((k, side) => ({
      grip: { point: V3(bar, side * gripZ), axis: ZAX,
        forearm: U([...(o.fa || [0.5, -0.85]), 0], [0, -1, 0]), back: U([-0.4, -0.9, 0], [-1, -0.1, 0]) },
      pole: U([1, -0.5, side * 0.35], [-0.2, 0, side * 1]),
    }));
    return pose;
  };
}

/**
 * Thruster con una pesa rusa en la mano derecha: sentadilla con la pesa en
 * rack y, al subir, press por encima de la cabeza en un solo movimiento. El
 * otro brazo va a un lado, de contrapeso. s = 0: fondo de la sentadilla.
 */
export function kbThruster(o = {}) {
  const stance = o.stance || { foot: 0.22, toeOut: 18 };
  const rk = o.rack || { fwd: 0.14, up: 0.02, z: 0.1, twist: 0.5, down: [0, -0.3, 1], elbow: -0.2 };
  return s => {
    const depth = 1 - sm(s / 0.6);                       // 1 abajo → 0 de pie
    const p = sm((s - 0.4) / 0.6);                       // el press empieza cuando las caderas ya suben
    const A = v2(ANKLE_X, M.ankleH);
    const K = add2(A, polar(M.shank, rad(o.shank ?? 35) * depth));
    const th = rad(o.thigh ?? 100) * depth;
    const H = add2(K, v2(-M.thigh * Math.sin(th), M.thigh * Math.cos(th)));
    const x0 = shoulderFrom(add2(A, v2(0, M.shank + M.thigh)), 0).x;
    const tr = solve(t2 => shoulderFrom(H, t2).x, x0 + (MID_X + 0.03 - x0) * depth, rad(-5), rad(75)) - rad(o.lean ?? 3) * bump(p);
    const S = shoulderFrom(H, tr);
    const legs = both((k, side) => plantedLeg(A, K, side, stance));

    // Pesa: del rack al bloqueo sobre el hombro derecho, con la bola detrás del antebrazo.
    const rack = torsoPoint(S, tr, rk.fwd, rk.up);
    const lock = v2(S.x - 0.01, S.y + Math.sqrt((M.upper + M.fore + M.gripOff - 0.035) ** 2 - 0.0016) - 0.02);
    const hx = lerp(rack.x, lock.x, sm((p - 0.2) / 0.6)), hy = lerp(rack.y, lock.y, p);
    const hz = lerp(rk.z, M.shoulderZ - 0.02, p);
    const handle = V3(v2(hx, hy), hz);
    const axis = mixV(new THREE.Vector3(1, 0.2, -rk.twist), new THREE.Vector3(0.25, 0, 1), p);
    const down = mixV(new THREE.Vector3(rk.down[0], rk.down[1], rk.down[2]), new THREE.Vector3(-0.85, -0.5, 0.1), sm((p - (o.swing ?? 0.2)) / 0.5));
    const forearm = mixV(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), p);
    const back = mixV(new THREE.Vector3(0.2, 0, 1), new THREE.Vector3(-1, 0, 0.3), p);
    const pole = mixV(new THREE.Vector3(0.3, -1, rk.elbow), new THREE.Vector3(-0.2, 0, 1), p);
    return {
      H, tr, legs, props: [kettlebell(handle, axis, down)], track: handle, overhead: p > 0.3,
      neck: rad(o.neck ?? 6) * bump(p * 1.1),
      arms: {
        r: { grip: { point: handle, axis, forearm, back }, pole },
        l: { wrist: new THREE.Vector3(S.x + 0.2, S.y - 0.14, -0.36), pole: new THREE.Vector3(0, -1, -0.4) },
      },
    };
  };
}
