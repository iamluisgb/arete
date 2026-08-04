// ── Importar carreras desde el reloj ─────────────────────
//
// Areté deja de competir en tracking GPS contra Strava y Garmin —una batalla que
// una PWA no puede ganar, porque el navegador no le deja seguir midiendo con la
// pantalla apagada— y pasa a ser el sistema que INTERPRETA tus carreras.
//
// Todo lo que hay alrededor (plan, calendario, historial, progreso, PRs, zonas)
// ya funcionaba sobre `db.runningLogs`, no sobre el tracker: por eso importar es
// suficiente para que nada de eso se pierda.
//
// GPX y TCX son XML y se parsean con el DOMParser del navegador, sin
// dependencias. El .FIT de Garmin es binario y necesita un parser aparte; hasta
// entonces, Garmin Connect y Strava exportan GPX de cualquier actividad.

import { haversine } from './running-helpers.js';

/** Un punto de la traza, ya normalizado venga de donde venga. */
// { lat, lon, ele, t (ms), hr }

const NS = {
  gpxtpx: 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1',
  tcx: 'http://www.garmin.com/xmlschemas/ActivityExtension/v2',
};

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function ms(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Primer descendiente con ese nombre local, ignorando el namespace. */
function first(el, local) {
  for (const n of el.getElementsByTagName('*')) if (n.localName === local) return n;
  return null;
}

function textOf(el, local) {
  const n = el && first(el, local);
  return n ? n.textContent.trim() : null;
}

// ── Parseo ───────────────────────────────────────────────

function parseGpx(doc) {
  const pts = [];
  for (const trkpt of doc.getElementsByTagName('*')) {
    if (trkpt.localName !== 'trkpt') continue;
    const lat = num(trkpt.getAttribute('lat'));
    const lon = num(trkpt.getAttribute('lon'));
    if (lat == null || lon == null) continue;
    let hr = null;
    for (const n of trkpt.getElementsByTagName('*')) {
      if (n.localName === 'hr' || n.localName === 'heartrate') { hr = num(n.textContent); break; }
    }
    pts.push({ lat, lon, ele: num(textOf(trkpt, 'ele')), t: ms(textOf(trkpt, 'time')), hr });
  }
  const nombre = textOf(doc.documentElement, 'name');
  return { points: pts, name: nombre };
}

function parseTcx(doc) {
  const pts = [];
  let distanciaDeclarada = null, duracionDeclarada = null;
  for (const el of doc.getElementsByTagName('*')) {
    if (el.localName === 'Lap') {
      const d = num(textOf(el, 'DistanceMeters'));
      const s = num(textOf(el, 'TotalTimeSeconds'));
      if (d != null) distanciaDeclarada = (distanciaDeclarada || 0) + d;
      if (s != null) duracionDeclarada = (duracionDeclarada || 0) + s;
      continue;
    }
    if (el.localName !== 'Trackpoint') continue;
    const pos = first(el, 'Position');
    const lat = pos ? num(textOf(pos, 'LatitudeDegrees')) : null;
    const lon = pos ? num(textOf(pos, 'LongitudeDegrees')) : null;
    const hrEl = first(el, 'HeartRateBpm');
    pts.push({
      lat, lon,
      ele: num(textOf(el, 'AltitudeMeters')),
      t: ms(textOf(el, 'Time')),
      hr: hrEl ? num(textOf(hrEl, 'Value')) : null,
      dist: num(textOf(el, 'DistanceMeters')),
    });
  }
  return { points: pts, distanciaDeclarada, duracionDeclarada };
}

// ── Métricas ─────────────────────────────────────────────

/**
 * Los relojes registran puntos también parados (en un semáforo, atándose el
 * cordón). Un hueco largo entre dos puntos no es tiempo corriendo: se descuenta
 * del total, igual que hace la auto-pausa del tracker.
 */
const GAP_MAX_S = 60;

function metrics(points, declarada) {
  const conPos = points.filter(p => p.lat != null && p.lon != null);
  const conTiempo = points.filter(p => p.t != null);

  let metros = 0;
  const coords = [];
  const splits = [];
  let ultimoSplitDist = 0, ultimoSplitT = null;

  const t0 = conTiempo.length ? conTiempo[0].t : null;
  let movidoMs = 0, prevT = null;

  for (let i = 0; i < conPos.length; i++) {
    const p = conPos[i];
    if (i > 0) {
      const q = conPos[i - 1];
      metros += haversine(q.lat, q.lon, p.lat, p.lon);
    }
    coords.push([
      Math.round(p.lat * 1e6) / 1e6,
      Math.round(p.lon * 1e6) / 1e6,
      Math.round((p.ele || 0) * 10) / 10,
      p.t != null && t0 != null ? p.t - t0 : 0,
    ]);

    if (p.t != null) {
      if (prevT != null) {
        const dt = (p.t - prevT) / 1000;
        if (dt > 0 && dt <= GAP_MAX_S) movidoMs += dt * 1000;
      }
      prevT = p.t;
      if (ultimoSplitT == null) ultimoSplitT = p.t;
      // Un split por kilómetro completado.
      while (metros - ultimoSplitDist >= 1000) {
        ultimoSplitDist += 1000;
        const seg = Math.round((p.t - ultimoSplitT) / 1000);
        splits.push({ km: splits.length + 1, time: seg, pace: seg });
        ultimoSplitT = p.t;
      }
    }
  }

  // La distancia del fichero manda si viene declarada: el reloj la mide con
  // acelerómetro además de GPS y suele ser más fiel que sumar segmentos.
  const km = declarada?.distancia != null
    ? declarada.distancia / 1000
    : metros / 1000;

  const duracion = declarada?.duracion != null
    ? Math.round(declarada.duracion)
    : Math.round(movidoMs / 1000);

  const hrs = points.map(p => p.hr).filter(h => Number.isFinite(h) && h > 0);
  const eleGain = (() => {
    let g = 0;
    const conEle = points.filter(p => Number.isFinite(p.ele));
    for (let i = 1; i < conEle.length; i++) {
      const d = conEle[i].ele - conEle[i - 1].ele;
      if (d > 0) g += d;
    }
    return Math.round(g);
  })();

  return {
    distance: Math.round(km * 1000) / 1000,
    duration: duracion,
    pace: km > 0 ? Math.round(duracion / km) : 0,
    splits,
    route: coords.length ? { coords } : null,
    elevation: eleGain || null,
    hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    hrMax: hrs.length ? Math.max(...hrs) : null,
    date: t0 != null ? new Date(t0).toISOString().slice(0, 10) : null,
    points: points.length,
  };
}

// ── API ──────────────────────────────────────────────────

export class ImportError extends Error {}

/**
 * Convierte el contenido de un GPX/TCX en un resultado listo para guardar.
 * No toca la db: quien llama decide qué hacer con esto.
 */
export function parseActivity(text, filename = '') {
  if (!text || !text.trim()) throw new ImportError('El fichero está vacío');

  // Antes del parseo: un .FIT es binario y moriría con "no es un XML válido",
  // que no le dice al atleta qué hacer a continuación.
  if (/\.fit$/i.test(filename)) {
    throw new ImportError('Los .FIT todavía no. Exporta la actividad como GPX desde Garmin Connect o Strava.');
  }

  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new ImportError('El fichero no es un XML válido');
  }

  const raiz = doc.documentElement?.localName;
  let parsed, declarada = null;
  if (raiz === 'gpx') {
    parsed = parseGpx(doc);
  } else if (raiz === 'TrainingCenterDatabase') {
    parsed = parseTcx(doc);
    declarada = { distancia: parsed.distanciaDeclarada, duracion: parsed.duracionDeclarada };
  } else {
    throw new ImportError('Formato no reconocido. Se admiten GPX y TCX.');
  }

  if (!parsed.points.length) throw new ImportError('El fichero no contiene puntos de actividad');

  const m = metrics(parsed.points, declarada);
  if (!m.distance && !m.duration) throw new ImportError('El fichero no tiene ni distancia ni tiempo');

  return { ...m, name: parsed.name || null, source: raiz === 'gpx' ? 'gpx' : 'tcx' };
}

/** ¿Ya está importada esta carrera? Misma fecha y distancia casi igual. */
export function findDuplicate(db, act) {
  return (db.runningLogs || []).find(r =>
    r.date === act.date && Math.abs((r.distance || 0) - act.distance) < 0.05
  ) || null;
}

/** Lee un File como texto. */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new ImportError('No se pudo leer el fichero'));
    fr.readAsText(file);
  });
}
