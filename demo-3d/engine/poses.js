// Poses: cada patrón de movimiento es una función de la profundidad s (0 = una
// punta de la repetición, 1 = la otra) que devuelve dónde va cada articulación,
// cada mano y cada implemento. No hay fotogramas hechos a mano: hay reglas.
//
//   · los pies no se mueven (salvo el de la pierna libre);
//   · lo que se carga va sobre el mediopié (o donde lo pida el ejercicio);
//   · la barra no atraviesa tibias, rodillas, muslos ni pantalones;
//   · la espalda se mueve en bloque: neutra, sin doblarse;
//   · cada mano agarra el implemento con el hueco del puño y el antebrazo en
//     la dirección que toca.
//
// Ejes: x hacia donde mira el atleta, y arriba, z a su derecha.
// Lado: 'l' = -1 (z negativa), 'r' = +1.

import * as THREE from 'three';

export const rad = d => d * Math.PI / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
const clamp = THREE.MathUtils.clamp;

// ── Medidas del modelo (m), sacadas de su esqueleto en reposo ─
export const M = {
  ankleH: 0.086,
  shank: 0.459, thigh: 0.429,
  // Del centro de las caderas al centro de los hombros: 0,484 arriba y 0,029 atrás.
  torsoLen: Math.hypot(0.484, 0.029), torsoOff: Math.atan2(-0.029, 0.484),
  upper: 0.251, fore: 0.243,
  shoulderZ: 0.212,
  toe: { dx: 0.143, dy: -0.071 },          // del tobillo a la bola del pie
  shinR: 0.04, kneeR: 0.055, thighR: [0.06, 0.075],
  shorts: 0.02,                             // holgura de los pantalones en el muslo
  gripOff: 0.115,                           // muñeca → hueco del puño; la figura lo mide al cerrar la mano
};
export const ANKLE_X = -0.085;              // así el mediopié queda en x = 0
export const MID_X = 0;
export const PLATE_R = 0.225;               // disco de 20 kg
export const BAR_R = 0.014;
// Pesa rusa (24 kg): bola de 10 cm de radio, asa a 16,8 cm de su centro.
export const KB = { r: 0.1, handle: 0.168, horn: { y: 0.12, z: 0.082 } };
const KB_FLOOR = KB.r + KB.handle;          // altura del asa con la pesa en el suelo

const reach = () => M.upper + M.fore + M.gripOff - 0.035;   // codo nunca del todo bloqueado

// ── Geometría plana (plano sagital) ──────────────────────
export const v2 = (x, y) => ({ x, y });
const add2 = (a, b) => v2(a.x + b.x, a.y + b.y);
/** Vector de longitud len a un ángulo desde la vertical, + hacia delante. */
const polar = (len, ang) => v2(len * Math.sin(ang), len * Math.cos(ang));
/** Hombros a partir de la cadera y la inclinación del tronco. */
const shoulderFrom = (H, tr) => add2(H, polar(M.torsoLen, tr + M.torsoOff));
/** Punto del tronco: `fwd` delante del pecho y `up` por encima del hombro, en el marco del tronco. */
const torsoPoint = (S, tr, fwd, up) => v2(S.x + fwd * Math.cos(tr) + up * Math.sin(tr), S.y - fwd * Math.sin(tr) + up * Math.cos(tr));
const rot2 = (p, a) => v2(p.x * Math.cos(a) - p.y * Math.sin(a), p.x * Math.sin(a) + p.y * Math.cos(a));   // giro antihorario
const V3 = (p, z = 0) => new THREE.Vector3(p.x, p.y, z);

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

/** Bisección sobre una función creciente: el x en [lo, hi] con f(x) = target. */
function solve(f, target, lo, hi) {
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

function xAt(a, b, y) {
  if (y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) return null;
  return lerp(a.x, b.x, (y - a.y) / (b.y - a.y || 1e-9));
}

/** ¿La barra pasa por delante de tibia, rodilla y muslo (con pantalones), sin tocarlos? */
function barClear(A, K, H, bar) {
  const gap = BAR_R + 0.002;
  const xs = xAt(A, K, bar.y);
  if (xs != null && xs + M.shinR + gap > bar.x) return false;
  if (Math.abs(bar.y - K.y) < M.kneeR && K.x + M.kneeR + gap > bar.x) return false;
  const xt = xAt(K, H, bar.y);
  if (xt != null) {
    const r = lerp(M.thighR[0], M.thighR[1], (bar.y - K.y) / (H.y - K.y || 1e-9)) + M.shorts;
    if (xt + r + gap > bar.x) return false;
  }
  return true;
}

// ── Piezas comunes ───────────────────────────────────────
/** Pierna apoyada: tobillo en el suelo, rodilla y punta del pie. */
function plantedLeg(A, K, side, stance) {
  const out = rad(stance.toeOut || 0) * side;
  const toe = new THREE.Vector3(M.toe.dx * Math.cos(out), M.toe.dy, M.toe.dx * Math.sin(out));
  const ankle = V3(A, side * stance.foot);
  return { A: ankle, K: V3(K, side * (stance.knee ?? stance.foot)), toe: ankle.clone().add(toe) };
}

/** Pierna libre y recta desde la cadera, a un ángulo desde la vertical (+ delante). */
function freeLeg(H, ang, side, z) {
  const d = v2(Math.sin(ang), -Math.cos(ang));
  const K = add2(H, v2(d.x * M.thigh, d.y * M.thigh));
  const A = add2(K, v2(d.x * M.shank, d.y * M.shank));
  const toe = add2(A, rot2(v2(M.toe.dx, M.toe.dy), ang));
  return { A: V3(A, side * z), K: V3(K, side * z), toe: V3(toe, side * z) };
}

const both = f => ({ l: f('l', -1), r: f('r', 1) });

/** Brazo colgando a un lado, relajado. */
const hang = (S, side, tr = 0) => ({
  wrist: new THREE.Vector3(S.x + 0.03 + 0.1 * Math.sin(tr), S.y - reach() + M.gripOff - 0.02, side * (M.shoulderZ + 0.05)),
  pole: new THREE.Vector3(-1, 0, side * 0.3),
});

/** Brazos al frente, a la altura del hombro (contrapeso). */
const armsForward = (S, side) => ({
  wrist: new THREE.Vector3(S.x + M.upper + M.fore - 0.02, S.y - 0.02, side * 0.17),
  pole: new THREE.Vector3(0, -1, side * 0.4),
});

const barbell = (p, x = 0) => ({ kind: 'barbell', pos: V3(p, x) });
/** Pesa rusa por su asa: centro del asa, dirección del asa y hacia dónde cuelga la bola. */
const kettlebell = (handle, axis, down) => ({ kind: 'kettlebell', handle, axis: axis.clone().normalize(), down: down.clone().normalize() });
const Y = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), ZAX = new THREE.Vector3(0, 0, 1), XAX = new THREE.Vector3(1, 0, 0);

/** Agarre de barra: el puño sobre la barra a `z` del centro. */
const barGrip = (bar, side, z, forearm, back, pole) => ({
  grip: { point: V3(bar, side * z), axis: ZAX, forearm, back }, pole,
});

// ── Sentadillas ──────────────────────────────────────────
/**
 * @param {object} o
 *   load: 'back' | 'front' | 'goblet' | 'rack' | 'none'
 *   shank, thigh: ángulos máximos (grados) de tibia y muslo
 *   stance: { foot, knee, toeOut }
 */
export function squat(o) {
  const stance = o.stance || { foot: 0.16, knee: 0.19 };
  return s => {
    const A = v2(ANKLE_X, M.ankleH);
    const K = add2(A, polar(M.shank, rad(o.shank ?? 34) * s));
    const th = rad(o.thigh ?? 112) * s;
    const H = add2(K, v2(-M.thigh * Math.sin(th), M.thigh * Math.cos(th)));

    // Qué punto del tronco se lleva al mediopié: la barra, la pesa o los hombros.
    let pointOf, target;
    if (o.load === 'back') {
      pointOf = tr => torsoPoint(shoulderFrom(H, tr), tr, -0.075, 0.05);
      target = MID_X - 0.07 * (1 - s);
    } else if (o.load === 'front') {
      pointOf = tr => torsoPoint(shoulderFrom(H, tr), tr, o.barFwd ?? 0.1, o.barUp ?? 0.02);
      target = MID_X;
    } else {
      pointOf = tr => shoulderFrom(H, tr);
      target = MID_X + (o.load === 'none' ? 0.1 * s : 0.03);
    }
    const tr = solve(tr2 => pointOf(tr2).x, target, rad(-5), rad(75));
    const S = shoulderFrom(H, tr);
    const legs = both((k, side) => plantedLeg(A, K, side, stance));
    const pose = { H, tr, legs, props: [] };

    if (o.load === 'back') {
      const bar = pointOf(tr);
      pose.props.push(barbell(bar));
      pose.track = V3(bar);
      pose.arms = both((k, side) => barGrip(bar, side, 0.42,
        new THREE.Vector3(0.15, -1, 0), new THREE.Vector3(-0.6, 0.8, 0), new THREE.Vector3(-0.4, -1, side * 0.2)));
    } else if (o.load === 'front') {
      // Brazos cruzados: la barra sobre los deltoides, cada mano sobre el hombro
      // contrario y los codos al frente. El rack con agarre de halterofilia pide
      // la mano abierta y la muñeca doblada casi 90°: con un puño no cabe en los
      // límites de la muñeca.
      const bar = pointOf(tr);
      pose.props.push(barbell(bar));
      pose.track = V3(bar);
      // Un antebrazo por encima del otro, para que no se crucen por dentro; la
      // colocación (c) se eligió probando hasta que nada atravesara.
      const c = o.cross || {};
      pose.arms = both((k, side) => ({
        wrist: V3(torsoPoint(S, tr, side < 0 ? c.fl ?? 0.16 : c.fr ?? 0.12, side < 0 ? c.ul ?? 0.09 : c.ur ?? 0.04), -side * (c.z ?? 0.12)),
        pole: new THREE.Vector3(1, side < 0 ? c.pl ?? 0.15 : c.pr ?? -0.05, 0),
        rests: true,                                         // la mano apoyada en la barra: tocarla no es atravesar
      }));
    } else if (o.load === 'goblet') {
      // La pesa al pecho, cogida por los cuernos, bola abajo.
      const h = torsoPoint(S, tr, 0.25, 0.0);                // asa a la altura del hombro: la bola, contra el pecho
      const handle = V3(h);
      pose.props.push(kettlebell(handle, ZAX, DOWN));
      pose.track = handle;
      pose.arms = both((k, side) => ({
        grip: { point: handle.clone().add(new THREE.Vector3(0, KB.horn.y - KB.handle, side * KB.horn.z)), axis: Y,
          forearm: new THREE.Vector3(-0.2, -1, side * 0.25), back: new THREE.Vector3(0, 0, side) },
        pole: new THREE.Vector3(-0.2, -1, side * 0.4),
      }));
    } else if (o.load === 'rack') {
      // Dos pesas en rack: el asa en la mano delante del pecho, antebrazo
      // vertical y la bola apoyada por fuera del antebrazo. La colocación
      // exacta (r) se eligió probando posiciones hasta que nada atravesara.
      const r = o.rack || {};
      pose.arms = {};
      for (const [k, side] of [['l', -1], ['r', 1]]) {
        const handle = V3(torsoPoint(S, tr, r.fwd ?? 0.16, r.up ?? -0.1), side * (r.z ?? 0.11));
        const axis = new THREE.Vector3(1, 0.2, -side * (r.twist ?? 0.4));
        const down = new THREE.Vector3(r.down?.[0] ?? -0.3, r.down?.[1] ?? -0.5, side * (r.down?.[2] ?? 0.8));
        pose.props.push(kettlebell(handle, axis, down));
        pose.arms[k] = {
          grip: { point: handle, axis, forearm: new THREE.Vector3(0, -1, 0), back: new THREE.Vector3(0.2, 0, side) },
          pole: new THREE.Vector3(0.3, -1, side * (r.elbow ?? 0.3)),
        };
        if (side === 1) pose.track = handle;
      }
    } else {
      pose.arms = both((k, side) => armsForward(S, side));
      pose.track = V3(H);
    }
    return pose;
  };
}

/** Sentadilla a una pierna (pistol): la otra pierna recta al frente, brazos de contrapeso. */
export function pistol() {
  return s => {
    const A = v2(ANKLE_X, M.ankleH);
    const K = add2(A, polar(M.shank, rad(38) * s));
    const th = rad(122) * s;
    const H = add2(K, v2(-M.thigh * Math.sin(th), M.thigh * Math.cos(th)));
    const tr = solve(tr2 => shoulderFrom(H, tr2).x, MID_X + 0.14 * s, rad(-5), rad(70));
    const S = shoulderFrom(H, tr);
    // La pierna libre sube hasta donde deje el suelo: el pie, a 6 cm como mínimo.
    const L = M.thigh + M.shank;
    const ang = Math.max(rad(30), Math.acos(clamp((H.y - 0.08) / L, -1, 1)));
    return {
      H, tr, hipZ: -0.05,
      legs: { l: plantedLeg(A, K, -1, { foot: 0.1 }), r: freeLeg(H, ang, 1, 0.1) },
      arms: both((k, side) => armsForward(S, side)),
      props: [], track: V3(H, -0.05),
    };
  };
}

/** Elevación de talones: el pie gira sobre la bola, todo el cuerpo sube recto. */
export function calfRaise() {
  return s => {
    const ball = v2(ANKLE_X + M.toe.dx, M.ankleH + M.toe.dy);
    const lift = rad(32) * s;                               // giro del pie
    const A = add2(ball, rot2(v2(-M.toe.dx, -M.toe.dy), lift));
    const K = add2(A, v2(0, M.shank));
    const H = add2(K, v2(0, M.thigh));
    const S = shoulderFrom(H, 0.02);
    const stance = { foot: 0.12 };
    return {
      H, tr: 0.02,
      legs: both((k, side) => ({ A: V3(A, side * stance.foot), K: V3(K, side * stance.foot), toe: V3(ball, side * stance.foot) })),
      arms: both((k, side) => hang(S, side)),
      props: [], track: V3(A, 0.12),
    };
  };
}

// ── Bisagras de cadera ───────────────────────────────────
/**
 * Peso muerto y variantes con las dos piernas apoyadas.
 * @param {object} o
 *   implement: 'barbell' | 'kettlebell' | 'suitcase'
 *   floorY: altura del agarre abajo (null = la del implemento en el suelo)
 *   kneeMax: tibia máxima (grados); shoulderAhead: hombros por delante del agarre abajo
 *   stance: { foot, knee, toeOut }; romanian: rodilla fija y casi recta
 */
export function hinge(o) {
  const stance = o.stance || { foot: 0.12, knee: 0.12 };
  const kb = o.implement !== 'barbell';
  const gripZ = o.implement === 'barbell' ? 0.26 : o.implement === 'kettlebell' ? 0.045 : 0.3;
  return s => {
    const A = v2(ANKLE_X, M.ankleH);
    // Alcance del brazo en el plano de perfil: el agarre puede quedar más dentro o más fuera que el hombro.
    const dz = Math.abs(M.shoulderZ - gripZ);
    const r = Math.sqrt(reach() ** 2 - dz * dz);
    const stand = M.ankleH + M.shank + M.thigh + 0.484;
    const low = o.floorY ?? (kb ? KB_FLOOR : PLATE_R);
    const gy = lerp(stand - r + 0.012, low, s);
    // En el bloqueo la barra apoya en los muslos un poco por delante del mediopié.
    const gx = MID_X + (o.implement === 'kettlebell' ? 0.09 : o.implement === 'barbell' ? 0.04 : 0) * (1 - s);
    const grip = v2(gx, gy);
    const sx = gx + lerp(o.lockBack ?? -0.1, o.shoulderAhead ?? 0.05, s);
    const S = v2(sx, gy + Math.sqrt(Math.max(r * r - (sx - gx) ** 2, 0)));
    let K, H;
    const kMax = rad(o.kneeMax ?? 14) * (o.romanian ? Math.min(1, s * 4) : s);
    for (let a = kMax; a >= rad(-4); a -= rad(0.25)) {
      K = add2(A, polar(M.shank, a));
      H = circleCross(K, M.thigh, S, M.torsoLen);
      // La pesa va entre los pies, no delante de las piernas: no hay choque que evitar.
      if (o.implement !== 'barbell' || barClear(A, K, H, grip)) break;
    }
    const tr = Math.atan2(S.x - H.x, S.y - H.y) - M.torsoOff;
    const pose = { H, tr, legs: both((k, side) => plantedLeg(A, K, side, stance)), props: [] };
    const up = new THREE.Vector3(-0.1, 1, 0).normalize();

    if (o.implement === 'barbell') {
      pose.props.push(barbell(grip));
      pose.track = V3(grip);
      pose.arms = both((k, side) => barGrip(grip, side, gripZ, up, new THREE.Vector3(1, -0.1, 0), new THREE.Vector3(-1, 0, side * 0.6)));
    } else if (o.implement === 'kettlebell') {
      const handle = V3(grip);
      pose.props.push(kettlebell(handle, ZAX, DOWN));
      pose.track = handle;
      pose.arms = both((k, side) => ({
        grip: { point: handle.clone().add(new THREE.Vector3(0, 0, side * gripZ)), axis: ZAX, forearm: up, back: new THREE.Vector3(1, -0.1, 0) },
        pole: new THREE.Vector3(-1, 0, side * 0.4),
      }));
    } else {
      // Maleta: una pesa al lado del pie derecho, agarre neutro; el otro brazo cuelga.
      const handle = V3(grip, gripZ);
      pose.props.push(kettlebell(handle, XAX, DOWN));
      pose.track = handle;
      pose.arms = {
        r: { grip: { point: handle, axis: XAX, forearm: up, back: new THREE.Vector3(0, 0, 1) }, pole: new THREE.Vector3(-0.5, 0, 0.6) },
        l: hang(S, -1, tr),
      };
    }
    return pose;
  };
}

/**
 * Peso muerto a una pierna: se apoya la izquierda, la derecha sube detrás en
 * línea con el tronco. Lo que se carga cuelga bajo los hombros y queda sobre
 * el mediopié de la pierna de apoyo.
 * @param {object} o  implement: 'barbell' | 'kettlebell' (en la mano contraria a la pierna de apoyo)
 */
export function singleLegHinge(o) {
  const gripZ = o.implement === 'barbell' ? 0.24 : M.shoulderZ + 0.07;   // la pesa, por fuera del muslo de la pierna libre
  return s => {
    const A = v2(ANKLE_X, M.ankleH);
    const K = add2(A, polar(M.shank, rad(6)));
    const tr = rad(78) * s;
    // Muslo de apoyo: el ángulo que deja los hombros sobre el mediopié.
    const hipOf = phi => add2(K, v2(-M.thigh * Math.sin(phi), M.thigh * Math.cos(phi)));
    const phi = solve(p => -shoulderFrom(hipOf(p), tr).x, -(MID_X + 0.05), rad(-10), rad(80));
    const H = hipOf(phi);
    const S = shoulderFrom(H, tr);
    const dz = Math.abs(M.shoulderZ - gripZ);
    // Arriba la barra se separa un poco de los muslos: de pie, colgando, no los toca.
    const g = v2(S.x + 0.03 * (1 - s), S.y - Math.sqrt(reach() ** 2 - dz * dz));
    const up = new THREE.Vector3(0, 1, 0);
    const pose = {
      H, tr, hipZ: -0.04,
      legs: { l: plantedLeg(A, K, -1, { foot: 0.1 }), r: freeLeg(H, -(tr + rad(8)), 1, 0.1) },
      props: [],
    };
    if (o.implement === 'barbell') {
      pose.props.push(barbell(g, -0.04));
      pose.track = V3(g);
      pose.arms = both((k, side) => ({
        grip: { point: V3(g, side * gripZ - 0.04), axis: ZAX, forearm: up, back: new THREE.Vector3(1, 0, 0) },
        pole: new THREE.Vector3(-1, 0, side * 0.6),
      }));
    } else {
      const handle = V3(g, gripZ);
      pose.props.push(kettlebell(handle, XAX, DOWN));
      pose.track = handle;
      pose.arms = {
        r: { grip: { point: handle, axis: XAX, forearm: up, back: new THREE.Vector3(0, 0, 1) }, pole: new THREE.Vector3(-0.5, 0, 0.6) },
        l: hang(S, -1, tr),
      };
    }
    return pose;
  };
}
