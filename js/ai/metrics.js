// Métricas de entrenamiento para Quirón — funciones puras sobre la db.
// Filosofía: las matemáticas las hace JS (exactas, baratas); el LLM interpreta.
// Nota: los workouts no registran RPE, así que la señal de fatiga se calcula como
// ratio de carga aguda/crónica (7 días vs media de 28), no por RPE.

/** 1RM estimado — fórmula de Epley: kg × (1 + reps/30). null si datos inválidos. */
export function epley(kg, reps) {
  const k = parseFloat(kg), r = parseInt(reps);
  if (!Number.isFinite(k) || k <= 0 || !Number.isFinite(r) || r < 1) return null;
  if (r === 1) return k;
  return k * (1 + r / 30);
}

/** Días entre 'YYYY-MM-DD' y hoy (ref opcional para tests) */
export function daysAgo(dateStr, ref = new Date()) {
  const d = new Date(dateStr + 'T12:00:00');
  return Math.floor((ref - d) / 86400000);
}

/** Tonelaje de un workout: Σ kg × reps (solo sets con ambos numéricos) */
export function workoutTonnage(w) {
  let t = 0;
  for (const ex of (w.exercises || [])) {
    for (const s of (ex.sets || [])) {
      const kg = parseFloat(s.kg), reps = parseInt(s.reps);
      if (Number.isFinite(kg) && kg > 0 && Number.isFinite(reps) && reps > 0) t += kg * reps;
    }
  }
  return Math.round(t);
}

/**
 * Mejor e1RM por ejercicio, con mejor histórico y mejor reciente (últimos 30 días)
 * para poder hablar de tendencia.
 * @returns {Object} { [nombre]: { best: {rm,kg,reps,date}, recent: {...}|null, sessions } }
 */
export function e1rmByExercise(workouts, ref = new Date()) {
  const out = {};
  for (const w of (workouts || [])) {
    for (const ex of (w.exercises || [])) {
      let bestSet = null;
      for (const s of (ex.sets || [])) {
        const rm = epley(s.kg, s.reps);
        if (rm != null && (!bestSet || rm > bestSet.rm)) {
          bestSet = { rm, kg: parseFloat(s.kg), reps: parseInt(s.reps), date: w.date };
        }
      }
      if (!bestSet) continue;
      const rec = out[ex.name] || (out[ex.name] = { best: null, recent: null, sessions: 0 });
      rec.sessions++;
      if (!rec.best || bestSet.rm > rec.best.rm) rec.best = bestSet;
      if (daysAgo(w.date, ref) <= 30 && (!rec.recent || bestSet.rm > rec.recent.rm)) rec.recent = bestSet;
    }
  }
  return out;
}

/** Lunes de la semana de una fecha, como 'YYYY-MM-DD' */
export function weekStartOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Series semanales de las últimas `weeks` semanas (más antigua primero, incluye semanas vacías).
 * Fuerza: sesiones + tonelaje. Running: sesiones + km + tiempo.
 */
export function weeklySeries(db, weeks = 8, ref = new Date()) {
  const refStr = ref.getFullYear() + '-' + String(ref.getMonth() + 1).padStart(2, '0') + '-' + String(ref.getDate()).padStart(2, '0');
  const thisMonday = weekStartOf(refStr);
  const starts = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday + 'T12:00:00');
    d.setDate(d.getDate() - i * 7);
    starts.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  const byWeek = Object.fromEntries(starts.map(s => [s, { weekStart: s, strengthSessions: 0, tonnage: 0, runSessions: 0, km: 0, runTime: 0 }]));
  for (const w of (db.workouts || [])) {
    const wk = byWeek[weekStartOf(w.date)];
    if (wk) { wk.strengthSessions++; wk.tonnage += workoutTonnage(w); }
  }
  for (const r of (db.runningLogs || [])) {
    const wk = byWeek[weekStartOf(r.date)];
    if (wk) { wk.runSessions++; wk.km += (r.distance || 0); wk.runTime += (r.duration || 0); }
  }
  for (const wk of Object.values(byWeek)) wk.km = Math.round(wk.km * 10) / 10;
  return starts.map(s => byWeek[s]);
}

/**
 * Señal de fatiga por carga aguda/crónica: carga de los últimos 7 días vs media
 * semanal de los últimos 28. Carga = tonelaje (fuerza) + minutos de carrera × 100
 * (equivalencia gruesa para sumar modalidades en una sola señal).
 * ratio > ~1.3 = pico de carga (precaución); < 0.8 = semana suave/descarga.
 */
export function loadRatio(db, ref = new Date()) {
  let acute = 0, chronic = 0;
  const load = (t, mins) => t + mins * 100;
  for (const w of (db.workouts || [])) {
    const d = daysAgo(w.date, ref);
    if (d < 0 || d >= 28) continue;
    const l = load(workoutTonnage(w), 0);
    chronic += l;
    if (d < 7) acute += l;
  }
  for (const r of (db.runningLogs || [])) {
    const d = daysAgo(r.date, ref);
    if (d < 0 || d >= 28) continue;
    const l = load(0, (r.duration || 0) / 60);
    chronic += l;
    if (d < 7) acute += l;
  }
  const chronicWeekly = chronic / 4;
  if (chronicWeekly <= 0) return { acute: Math.round(acute), chronicWeekly: 0, ratio: null };
  return { acute: Math.round(acute), chronicWeekly: Math.round(chronicWeekly), ratio: Math.round((acute / chronicWeekly) * 100) / 100 };
}

/**
 * Agregados de un periodo de `days` días vs el periodo anterior de igual duración.
 * Para el informe: tonelaje, sesiones de fuerza, sesiones de running, km y minutos,
 * con el delta % de tonelaje y km respecto al periodo previo.
 */
export function periodStats(db, days = 7, ref = new Date()) {
  const bucket = (from, to) => {
    const s = { tonnage: 0, strengthSessions: 0, runSessions: 0, km: 0, runMin: 0 };
    for (const w of (db.workouts || [])) {
      const d = daysAgo(w.date, ref);
      if (d >= from && d < to) { s.strengthSessions++; s.tonnage += workoutTonnage(w); }
    }
    for (const r of (db.runningLogs || [])) {
      const d = daysAgo(r.date, ref);
      if (d >= from && d < to) { s.runSessions++; s.km += (r.distance || 0); s.runMin += (r.duration || 0) / 60; }
    }
    s.km = Math.round(s.km * 10) / 10;
    s.runMin = Math.round(s.runMin);
    return s;
  };
  const cur = bucket(0, days);
  const prev = bucket(days, days * 2);
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  return { current: cur, previous: prev, tonnageDeltaPct: pct(cur.tonnage, prev.tonnage), kmDeltaPct: pct(cur.km, prev.km) };
}

// Clasificación de tipo de carrera en fácil (Z1-Z2) vs calidad (Z3+) para el 80/20.
// libre/rodaje = fácil; intervalos/tempo/cuestas/fartlek/competicion = calidad.
const QUALITY_RUN_TYPES = new Set(['intervalos', 'tempo', 'cuestas', 'fartlek', 'competicion']);

/** Reparto de intensidad de carrera (80/20) en los últimos `days` días, por km */
export function runIntensitySplit(runningLogs, days = 28, ref = new Date()) {
  let easyKm = 0, qualityKm = 0, easyN = 0, qualityN = 0;
  for (const r of (runningLogs || [])) {
    const d = daysAgo(r.date, ref);
    if (d < 0 || d >= days) continue;
    const km = r.distance || 0;
    if (QUALITY_RUN_TYPES.has(r.type)) { qualityKm += km; qualityN++; }
    else { easyKm += km; easyN++; }
  }
  const total = easyKm + qualityKm;
  return {
    easyKm: Math.round(easyKm * 10) / 10,
    qualityKm: Math.round(qualityKm * 10) / 10,
    easyN, qualityN,
    easyPct: total > 0 ? Math.round((easyKm / total) * 100) : null,
  };
}

/** PRs de e1RM logrados en los últimos `days` días (mejor set reciente ≥ mejor histórico) */
export function recentPRs(workouts, days = 30, ref = new Date()) {
  const byEx = e1rmByExercise(workouts, ref);
  const prs = [];
  for (const [name, rec] of Object.entries(byEx)) {
    if (rec.recent && rec.best && rec.recent.rm >= rec.best.rm && daysAgo(rec.best.date, ref) <= days) {
      prs.push({ name, ...rec.best, rm: Math.round(rec.best.rm * 10) / 10 });
    }
  }
  return prs.sort((a, b) => b.rm - a.rm);
}

/** Tendencia de peso corporal: último registro y delta vs ~30 días atrás.
 *  El campo real de la app es 'peso' (ver bodyMeasures en programs.json). */
const logWeight = (l) => l.peso ?? l.weight ?? 0;
export function bodyTrend(bodyLogs, ref = new Date()) {
  const withWeight = (bodyLogs || []).filter(l => logWeight(l) > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!withWeight.length) return null;
  const latest = withWeight[withWeight.length - 1];
  // Registro más cercano a 30 días antes del último (no de hoy: el usuario puede llevar sin pesarse)
  let past = null;
  for (const l of withWeight) {
    const gap = daysAgo(l.date, new Date(latest.date + 'T12:00:00'));
    if (gap >= 20 && (!past || gap < daysAgo(past.date, new Date(latest.date + 'T12:00:00')))) past = l;
  }
  return {
    weight: logWeight(latest), date: latest.date,
    delta30: past ? Math.round((logWeight(latest) - logWeight(past)) * 10) / 10 : null,
  };
}

/** Últimas n sesiones de fuerza, compactadas a texto (para el snapshot del LLM) */
export function lastStrengthSessions(workouts, n = 8) {
  return [...(workouts || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n)
    .map(w => {
      const exs = (w.exercises || []).map(ex => {
        const sets = (ex.sets || []).filter(s => s.kg || s.reps)
          .map(s => (s.kg ? `${s.kg}×${s.reps || '?'}` : String(s.reps || ''))).join(' ');
        return `${ex.name}: ${sets}`;
      }).join(' · ');
      return `${w.date} [${w.session || 'sesión'}]${w.notes ? ` (${w.notes})` : ''} — ${exs}`;
    });
}

/** Últimas n carreras, compactadas a texto */
export function lastRuns(runningLogs, n = 8) {
  const fmtDur = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
  };
  const fmtPace = (p) => p ? `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')}/km` : '';
  return [...(runningLogs || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n)
    .map(r => {
      const bits = [`${r.distance || 0} km`, fmtDur(r.duration || 0), fmtPace(r.pace)];
      if (r.hr) bits.push(`${r.hr} ppm`);
      if (r.elevation) bits.push(`${r.elevation} m+`);
      return `${r.date} [${r.type || 'libre'}]${r.notes ? ` (${r.notes})` : ''} — ${bits.filter(Boolean).join(' · ')}`;
    });
}
