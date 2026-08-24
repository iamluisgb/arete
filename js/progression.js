// ── Progresión: qué peso toca hoy ────────────────────────
//
// Hasta ahora el prefill copiaba la última sesión tal cual: mismo peso, mismas
// reps, indefinidamente. Eso no es una progresión, es un pegado — y deja la
// decisión de subir en la cabeza del atleta justo cuando está mirando el móvil
// entre series.
//
// Todo lo de aquí es función pura del historial. **Nada se escribe de vuelta en
// un entreno terminado**: el log es lo que pasó, y la prescripción se DERIVA cada
// vez que hace falta. Corregir una serie mal tecleada arregla el objetivo
// siguiente al instante, y cambiar el plan no obliga a migrar nada, porque no hay
// contadores guardados que se puedan desincronizar.
//
// Leer la sesión con honestidad es todo el juego:
//   · serie con al menos las reps objetivo  → cumplida
//   · serie con menos reps                  → fallada (se registró lo que salió)
//   · serie sin rellenar                    → fallada (no se hizo)
//   · menos series registradas de las que pedía el plan → fallada
// Una sesión que se cayó a la mitad no puede subir el peso como si hubiera ido
// bien. Y el objetivo siempre viene con su `por qué`: una sugerencia que no se
// puede auditar es una que se deja de creer.
//
// Lo que NO hace, a propósito: no toca los modos que no son series (`rounds`,
// `amrap`, `emom`, `tabata`…). Ahí el resultado es un tiempo o un total, no un
// peso, y una regla inventada sobre eso sería ruido.

/** Sesiones falladas seguidas antes de bajar el peso. */
export const DELOAD_AFTER = 3;
const DELOAD_FACTOR = 0.9;

/** La escala real de pesas rusas. Un swing no sube de 2,5 en 2,5. */
export const BELLS = [8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48];

/** ¿Este peso está en la escala de pesas, o es una barra disfrazada? */
function onBellLadder(kg) {
  return kg > 0 && kg <= BELLS[BELLS.length - 1] && BELLS.some(b => Math.abs(b - kg) < 2);
}

// Ejercicios que se cargan con pesa rusa. El plan de Areté no dice con qué se
// hace cada movimiento, así que se deduce del nombre — y del programa, porque en
// `kettlebell.json` los nombres son genéricos ("Squat", "Swing") y solo el
// programa delata la herramienta.
const KB_PATTERN = /kettlebell|pesa\s*rusa|\bkb\b|swing|turco|turkish|get[-\s]?up|goblet|snatch|dead\s*clean|thruster|molino|windmill/i;

// Movimientos donde 5 kg es un salto normal y no una barbaridad: cadena
// posterior y tren inferior con barra.
const HEAVY_PATTERN = /sentadilla|squat|peso\s*muerto|deadlift|hip\s*thrust|prensa|zancada|lunge|remo\s*con\s*barra|good\s*morning|puente/i;

/**
 * Con qué se carga un ejercicio, que es lo que decide el salto.
 *
 * `kg` es la carga que el atleta tiene registrada, y **manda sobre el nombre**.
 * "Squat" dentro del programa de kettlebell se clasifica como pesa, pero quien
 * registra 100 kg está usando una barra: sin esta comprobación el salto sería de
 * 4 kg y la descarga lo mandaría de 100 kg a 48. Lo que hay en el log sabe más
 * del gimnasio que un patrón de nombres.
 *
 * @returns {'kb'|'heavy'|'standard'}
 */
export function loadKind(name, program, kg) {
  const porNombre = program === 'kettlebell' || KB_PATTERN.test(name || '');
  if (porNombre && (kg === undefined || onBellLadder(kg))) return 'kb';
  if (HEAVY_PATTERN.test(name || '')) return 'heavy';
  return 'standard';
}

/** El salto de carga que le toca a un ejercicio, en kg. */
export function incrementFor(name, program, kg) {
  const kind = loadKind(name, program, kg);
  return kind === 'kb' ? 4 : kind === 'heavy' ? 5 : 2.5;
}

const round1 = v => Math.round(v * 10) / 10;

/** Sube a la siguiente pesa de la escala; fuera de escala, +4 kg. */
function nextBell(kg) {
  for (const b of BELLS) if (b > kg) return b;
  return round1(kg + 4);
}
function prevBell(kg) {
  for (let i = BELLS.length - 1; i >= 0; i--) if (BELLS[i] < kg) return BELLS[i];
  return BELLS[0];
}

/** Redondea a un múltiplo cargable del salto. */
function snap(v, step) {
  if (!(step > 0)) return round1(v);
  return round1(Math.round(v / step) * step);
}

/**
 * Baja un 10 %, cayendo en algo que se pueda cargar de verdad. En pesos
 * pequeños el múltiplo más cercano puede ser el peso de partida, así que una
 * descarga que no descarga nada baja un salto entero. Nunca por debajo de uno.
 */
function deloadTo(kg, step, kind) {
  if (kind === 'kb') return prevBell(kg);
  let next = snap(kg * DELOAD_FACTOR, step);
  if (next >= kg) next = snap(kg - step, step);
  return Math.max(step, next);
}

/**
 * Sube un salto, respetando la escala de la herramienta.
 *
 * La subida NO se redondea a un múltiplo del salto: el atleta ya estaba en un
 * peso que pudo cargar, así que sumarle un incremento estándar sigue siendo
 * cargable. Cuadrarlo a la rejilla convertía 42,5 + 5 en 50 — un salto de 7,5 kg
 * disfrazado de progresión lineal. El redondeo solo hace falta en la descarga,
 * donde el 10 % cae en cualquier sitio.
 */
function increaseTo(kg, step, kind) {
  return kind === 'kb' ? nextBell(kg) : round1(kg + step);
}

/**
 * El objetivo de reps que declara el plan. Los planes lo escriben de nueve
 * formas distintas y solo tres significan "un número que se puede superar":
 *   '5' → fijo · '8-12' → rango · '5/lado' → fijo, contado por lado
 *   'F' → al fallo · 'Tiempo', 'Práctica', 'Total reps', vacío → sin objetivo
 * @returns {{kind:'fixed'|'range'|'amrap'|'none', min:number, max:number}}
 */
export function parseReps(spec) {
  const s = String(spec ?? '').trim();
  if (!s) return { kind: 'none', min: 0, max: 0 };
  if (/^f$/i.test(s) || /fallo/i.test(s)) return { kind: 'amrap', min: 0, max: 0 };
  // Un aguante cronometrado se cuela en el mismo campo: '2min', '1min/lado',
  // '30s'. Sin esto una plancha de 2 minutos se lee como "2 repeticiones", se
  // cumple siempre, y la app le sube el peso a un ejercicio que no lleva peso.
  if (/^\d+\s*(min|mins|m|s|seg|segs|"|'|:)/i.test(s)) return { kind: 'none', min: 0, max: 0 };
  const rango = s.match(/^(\d+)\s*[-–]\s*(\d+)/);
  if (rango) return { kind: 'range', min: +rango[1], max: +rango[2] };
  const fijo = s.match(/^(\d+)/);
  // "5/lado" y "10/pierna" siguen siendo un objetivo fijo: el número es el mismo
  // que el atleta escribe al registrar, así que la comparación es homogénea.
  if (fijo) return { kind: 'fixed', min: +fijo[1], max: +fijo[1] };
  return { kind: 'none', min: 0, max: 0 };
}

/** Las reps de una serie registrada. Acepta "8", "8/lado" y el hueco vacío. */
function repsOf(set) {
  const m = String(set?.reps ?? '').trim().match(/^(\d+)/);
  return m ? +m[1] : 0;
}
const kgOf = set => parseFloat(set?.kg) || 0;

/**
 * Reduce un ejercicio ya registrado a lo que una política necesita para juzgarlo.
 * Areté no guarda la prescripción con el entreno, así que el objetivo con el que
 * se compara es el del plan **de hoy** — que es exactamente contra lo que el
 * atleta comparaba a ojo mirando la fila "Anterior".
 */
export function readSession(exercise, target) {
  const objetivo = parseReps(target?.reps);
  const planned = target?.sets || (exercise?.sets || []).length;
  const sets = exercise?.sets || [];
  const reps = sets.map(repsOf);
  const kg = Math.max(0, ...sets.map(kgOf));
  const meta = objetivo.kind === 'range' ? objetivo.max : objetivo.min;
  return {
    kg,
    reps,
    count: reps.length,
    low: reps.length ? Math.min(...reps) : 0,
    amrap: reps.length ? reps[reps.length - 1] : 0,
    // Suficientes series, todas con sus reps. Sin objetivo numérico no hay nada
    // que declarar cumplido: `ok` en falso deja la política en 'hold', que es no
    // tocar nada — no en 'deload', que castigaría por un dato que no existe.
    ok: meta > 0 && reps.length >= planned && reps.length > 0 && reps.every(r => r >= meta),
  };
}

/**
 * Sesiones pasadas de un ejercicio, de la más vieja a la más nueva.
 *
 * Empareja por NOMBRE y por objetivo de reps, no por sesión: una sentadilla es
 * la misma sentadilla salga en la Sesión A o en la B, pero 3×5 y 3×10 son dos
 * hilos de progresión distintos y mezclarlos haría subir el peso del pesado con
 * lo que se cumplió en el ligero.
 */
export function sessionsFor(db, name, target) {
  const clave = String(target?.reps ?? '').trim();
  const out = [];
  for (const w of (db?.workouts || [])) {
    for (const ex of (w.exercises || [])) {
      if (ex.name !== name) continue;
      // Un entreno de una sesión suelta guarda su especificación (`w.spec`): si
      // la tiene, el objetivo real de aquel día manda sobre el del plan de hoy.
      const spec = (w.spec || []).find(e => e.name === name);
      if (spec && String(spec.reps ?? '').trim() !== clave) continue;
      const s = readSession(ex, target);
      if (s.count && (s.kg > 0 || s.reps.some(r => r > 0))) out.push({ date: w.date, ...s });
    }
  }
  return out;
}

/**
 * Cuántas sesiones seguidas se atascaron, contando desde la última.
 *
 * Atascarse es fallar **al mismo peso**, no fallar sin más. La diferencia
 * importa porque Areté no guarda la prescripción con el entreno: el historial se
 * juzga contra el objetivo del plan de HOY, así que si el plan cambió de 3×5 a
 * 3×10, todas las sesiones viejas pasan a leerse como falladas de golpe y el
 * atleta abriría la app con un "18 sesiones seguidas sin cerrar — descarga".
 * Exigir que el peso no se haya movido corta ese falso positivo: quien ha estado
 * subiendo carga cada semana está progresando, diga lo que diga el objetivo
 * nuevo. Es además la definición clásica de un estancamiento lineal.
 */
export function stallCount(sessions) {
  const last = sessions[sessions.length - 1];
  if (!last || last.ok) return 0;
  let n = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].ok || sessions[i].kg !== last.kg) break;
    n++;
  }
  return n;
}

/**
 * El objetivo para hoy de un ejercicio del plan.
 *
 * @param {Object} db
 * @param {Object} ex   Ejercicio del plan: { name, sets, reps, type, mode }
 * @param {string} [program] Programa activo, para deducir la herramienta.
 * @returns {{kind:string, kg?:number, reps?:number, why:string}} `kind` es uno de
 *   first | up | hold | deload | off. Un campo sobre el que la política no opina
 *   vuelve `undefined` y quien llama se queda con lo que dijera el plan.
 */
export function nextPrescription(db, ex, program) {
  const modo = ex?.mode || (ex?.type === 'hiit' || ex?.type === 'density' ? 'result' : 'sets');
  const objetivo = parseReps(ex?.reps);
  if (modo !== 'sets' || objetivo.kind === 'none') {
    return { kind: 'off', why: '' };
  }

  const sessions = sessionsFor(db, ex.name, ex);
  const last = sessions[sessions.length - 1];
  if (!last) return { kind: 'first', why: 'Primera vez: lo que registres hoy marca el punto de partida.' };

  const kind = loadKind(ex.name, program, last.kg);
  const step = incrementFor(ex.name, program, last.kg);
  const stalls = stallCount(sessions);

  // Sin carga externa no hay nada que añadir ni que quitar — "descarga tus
  // dominadas a 2,5 kg" no es un consejo. Se progresa en repeticiones. El
  // disparador es el peso REGISTRADO, no el nombre: una dominada con lastre sí
  // tiene carga que subir, y una barra registrada a 0 no.
  if (last.kg <= 0) {
    if (objetivo.kind === 'amrap') {
      const best = Math.max(...sessions.map(s => Math.max(...s.reps, 0)), 0);
      return { kind: 'hold', why: `Al fallo — tu mejor serie son ${best} reps. Supérala.` };
    }
    const meta = objetivo.kind === 'range' ? objetivo.max : objetivo.min;
    if (!last.ok) return { kind: 'hold', reps: meta, why: 'Peso corporal — el mismo objetivo hasta que salgan todas limpias.' };
    return { kind: 'up', reps: meta + 1, why: `Peso corporal — todas las reps la última vez, así que ve a por ${meta + 1}.` };
  }

  if (objetivo.kind === 'amrap') {
    return { kind: 'hold', kg: last.kg, why: `Al fallo — la última vez fueron ${last.amrap} reps con ${last.kg} kg.` };
  }

  if (last.ok) {
    const kg = increaseTo(last.kg, step, kind);
    const salto = kind === 'kb' ? `sube a ${kg} kg` : `${round1(kg - last.kg)} kg más`;
    const base = objetivo.kind === 'range'
      ? { reps: objetivo.min, why: `Llegaste a ${objetivo.max} reps en todas las series — sube a ${kg} kg y vuelve a ${objetivo.min}.` }
      : { why: `Todas las reps la última vez — ${salto}.` };
    return { kind: 'up', kg, ...base };
  }

  if (stalls >= DELOAD_AFTER) {
    const kg = deloadTo(last.kg, step, kind);
    return {
      kind: 'deload', kg,
      reps: objetivo.kind === 'range' ? objetivo.min : undefined,
      why: `${stalls} sesiones seguidas atascado en ${last.kg} kg — baja a ${kg} kg y vuelve a subir desde ahí.`,
    };
  }

  if (objetivo.kind === 'range') {
    const aim = Math.min(objetivo.max, Math.max(objetivo.min, last.low + 1));
    return { kind: 'hold', kg: last.kg, reps: aim, why: `Mismo peso — apunta a ${aim} reps esta vez.` };
  }
  const quedan = DELOAD_AFTER - stalls;
  return {
    kind: 'hold', kg: last.kg,
    why: `Faltaron reps la última vez — mismo peso otra vez (${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`} antes de descargar).`,
  };
}
