// Patrón de apoyo en el suelo: flexiones (y sus variantes) y plancha. El
// cuerpo es una tabla rígida que gira sobre su apoyo de atrás (la bola de los
// pies, o las rodillas): talones, cadera y hombros siempre en línea.
//
//   · el atleta mira a +x tumbado boca abajo (tr cerca de 90°): la cabeza, en
//     línea con el tronco, sin colgar ni levantar la barbilla;
//   · en las flexiones las manos no se mueven: palma plana, dedos al frente y
//     un poco abiertos, a la altura del pecho al bajar;
//   · los codos salen a ~45° del tronco, no en cruz (hombro) ni pegados;
//   · s = 0 arriba, con los codos casi bloqueados; s = 1 abajo, con el pecho a
//     un puño del suelo.

import * as THREE from 'three';
import { M, rad, lerp, clamp, solve, v2, shoulderFrom, V3, bench, BENCH } from '../poses.js';

const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/**
 * Tabla sobre la punta de los pies. `phi`: ángulo de las piernas con el suelo.
 * La bola del pie queda en `ball`; el pie, con los dedos metidos.
 */
function plankOnToes(ball, phi, feetZ) {
  const u = v2(Math.cos(phi), Math.sin(phi));            // de los pies a la cabeza
  const f = v2(Math.sin(phi), -Math.cos(phi));           // hacia donde mira el pecho (el suelo)
  // Del tobillo a la bola, en el marco de la pierna: como de pie (bola por
  // delante y por debajo del tobillo), con el tobillo un poco más estirado.
  const ext = rad(18);
  const fx = M.toe.dx * Math.cos(ext) - M.toe.dy * Math.sin(ext), fy = M.toe.dx * Math.sin(ext) + M.toe.dy * Math.cos(ext);
  const A = v2(ball.x - fx * f.x - fy * u.x, ball.y - fx * f.y - fy * u.y);
  const K = v2(A.x + M.shank * u.x, A.y + M.shank * u.y);
  const H = v2(K.x + M.thigh * u.x, K.y + M.thigh * u.y);
  const tr = Math.PI / 2 - phi;
  const legs = {
    l: { A: V3(A, -feetZ), K: V3(K, -feetZ), toe: V3(ball, -feetZ) },
    r: { A: V3(A, feetZ), K: V3(K, feetZ), toe: V3(ball, feetZ) },
  };
  return { H, tr, legs, S: shoulderFrom(H, tr) };
}

/**
 * Tabla sobre las rodillas: la rodilla apoyada en `knee`, las tibias en el
 * suelo levantadas `shin` grados y los pies sueltos detrás.
 */
function plankOnKnees(knee, phi, feetZ, shin = rad(25)) {
  const u = v2(Math.cos(phi), Math.sin(phi));
  const H = v2(knee.x + M.thigh * u.x, knee.y + M.thigh * u.y);
  const A = v2(knee.x - M.shank * Math.cos(shin), knee.y + M.shank * Math.sin(shin));
  // Pie en punta, estirado detrás de la tibia.
  const d = v2(-Math.cos(shin), Math.sin(shin));
  const toe = v2(A.x + d.x * M.toe.dx * 0.9 - d.y * 0.03, A.y + d.y * M.toe.dx * 0.9 - 0.03);
  const tr = Math.PI / 2 - phi;
  const legs = {
    l: { A: V3(A, -feetZ), K: V3(knee, -feetZ), toe: V3(toe, -feetZ) },
    r: { A: V3(A, feetZ), K: V3(knee, feetZ), toe: V3(toe, feetZ) },
  };
  return { H, tr, legs, S: shoulderFrom(H, tr) };
}

/**
 * Flexiones.
 * @param {object} o
 *   knees: sobre las rodillas · hands: { z, x (respecto al hombro arriba) }
 *   incline: las manos en el borde de un banco de esta altura (flexiones inclinadas)
 *   top, bottom: altura de los hombros sobre las manos arriba y abajo
 *   elbow: apertura de los codos (0 pegados, 1 en cruz) · fingersOut: dedos hacia fuera (− hacia dentro)
 */
export function pushup(o = {}) {
  const hz = o.hands?.z ?? 0.25, hy = o.incline ?? 0, hx = o.hands?.x ?? 0.01;
  const feetZ = o.feetZ ?? 0.07;
  const top = (o.top ?? 0.51) + hy, bottom = (o.bottom ?? 0.19) + hy;
  const body = phi => (o.knees ? plankOnKnees(v2(-0.3, 0.055), phi, feetZ) : plankOnToes(v2(-0.8, 0.02), phi, feetZ));
  const phiAt = y => solve(ph => body(ph).S.y, y, rad(-5), rad(80));
  // Las manos se fijan bajo los hombros arriba: al bajar, el cuerpo gira sobre
  // los pies y los hombros avanzan, así que abajo quedan junto al pecho.
  const St = body(phiAt(top)).S;
  const hand = v2(St.x + hx, hy);
  // El banco, por delante de las manos: ellas en su borde, el cuerpo fuera.
  const props = o.incline ? [bench(hand.x + BENCH.len / 2 - 0.06, 0, { h: o.incline })] : [];
  return s => {
    const b = body(phiAt(lerp(top, bottom, sm(s))));
    const pose = {
      H: b.H, tr: b.tr, legs: b.legs, headFollow: 0, neck: rad(o.neck ?? 8),
      // Palma plana en el suelo con el antebrazo casi vertical: la muñeca se
      // extiende ~90°, que es lo que pide el ejercicio.
      wristMax: 100,
      props, track: V3(b.S),
    };
    pose.arms = {};
    for (const [k, side] of [['l', -1], ['r', 1]]) {
      // El codo apunta atrás y afuera: `elbow` reparte entre pegado (atrás) y en cruz (afuera).
      const e = o.elbow ?? 0.45;
      const pole = new THREE.Vector3(-(1 - e), 0, side * e).normalize().add(new THREE.Vector3(0, 0.15, 0));
      pose.arms[k] = {
        palm: { point: V3(hand, side * hz), down: new THREE.Vector3(0, -1, 0), fingers: new THREE.Vector3(1, 0, side * (o.fingersOut ?? 0.3)).normalize() },
        pole,
      };
    }
    return pose;
  };
}

/** Plancha sobre los antebrazos: codos bajo los hombros, el cuerpo en tabla. Quieta. */
export function plank(o = {}) {
  const feetZ = o.feetZ ?? 0.09;
  const elbowY = 0.07;                                   // el codo, apoyado: su radio sobre el suelo
  return s => {
    const phi = solve(ph => plankOnToes(v2(-0.8, 0.02), ph, feetZ).S.y, M.upper + elbowY + (o.lift ?? 0.0), rad(-5), rad(60));
    const b = plankOnToes(v2(-0.8, 0.02), phi, feetZ);
    const pose = { H: b.H, tr: b.tr, legs: b.legs, headFollow: 0, neck: rad(o.neck ?? 8), props: [], track: V3(b.S) };
    pose.arms = {};
    for (const [k, side] of [['l', -1], ['r', 1]]) {
      const ez = side * (M.shoulderZ - 0.01), wz = side * (o.wristZ ?? 0.13);
      const elbow = new THREE.Vector3(b.S.x, elbowY, ez);
      const wrist = new THREE.Vector3(b.S.x + Math.sqrt(M.fore ** 2 - (ez - wz) ** 2 - 0.0004), 0.058, wz);
      pose.arms[k] = { wrist, pole: elbow.clone().sub(V3(b.S, side * M.shoulderZ)), rests: true };
    }
    return pose;
  };
}
