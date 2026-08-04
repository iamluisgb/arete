// Importar carreras del reloj. Es lo que sostiene la decisión de retirar el
// tracker de la PWA: si esto no funciona, el atleta pierde sus carreras.
import { describe, it, expect } from 'vitest';
import { parseActivity, findDuplicate, ImportError } from '../js/ui/run-import.js';

/** GPX mínimo con puntos cada `stepS` segundos a lo largo de un meridiano. */
function gpx(points, { name = 'Carrera matinal' } = {}) {
  const trkpts = points.map(p =>
    `<trkpt lat="${p.lat}" lon="${p.lon}">
       ${p.ele != null ? `<ele>${p.ele}</ele>` : ''}
       <time>${p.time}</time>
       ${p.hr != null ? `<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><gpxtpx:hr>${p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : ''}
     </trkpt>`).join('');
  return `<?xml version="1.0"?>
<gpx version="1.1" creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${name}</name><trkseg>${trkpts}</trkseg></trk>
</gpx>`;
}

/** Una línea recta hacia el norte: 0.001° de latitud ≈ 111 m. */
function recta(n, { stepS = 30, stepLat = 0.001, start = '2026-07-20T08:00:00Z', hr = null, ele = null } = {}) {
  const t0 = Date.parse(start);
  return Array.from({ length: n }, (_, i) => ({
    lat: +(40 + i * stepLat).toFixed(6),
    lon: -3.7,
    time: new Date(t0 + i * stepS * 1000).toISOString(),
    hr: hr ? hr + (i % 5) : null,
    ele: ele != null ? ele + i : null,
  }));
}

describe('GPX', () => {
  it('extrae distancia, duración, ritmo y fecha', () => {
    const a = parseActivity(gpx(recta(11)));   // 10 tramos de ~111 m = ~1.11 km, 300 s
    expect(a.distance).toBeGreaterThan(1.0);
    expect(a.distance).toBeLessThan(1.2);
    expect(a.duration).toBe(300);
    expect(a.pace).toBeCloseTo(Math.round(300 / a.distance), 0);
    expect(a.date).toBe('2026-07-20');
    expect(a.source).toBe('gpx');
  });

  it('guarda la ruta con las coordenadas y el tiempo relativo al inicio', () => {
    const a = parseActivity(gpx(recta(3)));
    expect(a.route.coords).toHaveLength(3);
    expect(a.route.coords[0][3]).toBe(0);
    expect(a.route.coords[2][3]).toBe(60000);
  });

  it('promedia la frecuencia cardiaca y se queda con la máxima', () => {
    const a = parseActivity(gpx(recta(6, { hr: 150 })));
    expect(a.hr).toBeGreaterThanOrEqual(150);
    expect(a.hrMax).toBe(154);
  });

  it('acumula solo el desnivel positivo', () => {
    const pts = recta(4);
    pts[0].ele = 100; pts[1].ele = 110; pts[2].ele = 105; pts[3].ele = 115;
    const a = parseActivity(gpx(pts));
    expect(a.elevation).toBe(20);   // +10 y +10; la bajada no suma
  });

  it('emite un split por kilómetro completado', () => {
    const a = parseActivity(gpx(recta(30)));   // ~3.2 km
    expect(a.splits.length).toBeGreaterThanOrEqual(3);
    expect(a.splits[0].km).toBe(1);
  });

  it('conserva el nombre de la actividad', () => {
    expect(parseActivity(gpx(recta(3), { name: 'Tirada larga' })).name).toBe('Tirada larga');
  });

  // Los relojes siguen registrando parados en un semáforo. Contar ese hueco
  // como tiempo corriendo estropea el ritmo y, con él, el dominio aeróbico.
  it('descuenta las paradas largas del tiempo en movimiento', () => {
    const pts = recta(3);
    // 20 minutos parado entre el punto 2 y el 3
    pts[2].time = new Date(Date.parse(pts[1].time) + 20 * 60 * 1000).toISOString();
    const a = parseActivity(gpx(pts));
    expect(a.duration).toBe(30);   // solo el tramo de 30 s, no los 20 min
  });
});

describe('TCX', () => {
  const tcx = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
 <Activities><Activity Sport="Running">
  <Lap StartTime="2026-07-21T07:00:00Z">
   <TotalTimeSeconds>1500</TotalTimeSeconds>
   <DistanceMeters>5000</DistanceMeters>
   <Track>
    <Trackpoint><Time>2026-07-21T07:00:00Z</Time>
      <Position><LatitudeDegrees>40.0</LatitudeDegrees><LongitudeDegrees>-3.7</LongitudeDegrees></Position>
      <AltitudeMeters>600</AltitudeMeters><HeartRateBpm><Value>140</Value></HeartRateBpm></Trackpoint>
    <Trackpoint><Time>2026-07-21T07:12:30Z</Time>
      <Position><LatitudeDegrees>40.02</LatitudeDegrees><LongitudeDegrees>-3.7</LongitudeDegrees></Position>
      <AltitudeMeters>640</AltitudeMeters><HeartRateBpm><Value>160</Value></HeartRateBpm></Trackpoint>
   </Track>
  </Lap>
 </Activity></Activities>
</TrainingCenterDatabase>`;

  it('usa la distancia y el tiempo declarados por el reloj, no los calculados', () => {
    const a = parseActivity(tcx);
    expect(a.distance).toBe(5);        // 5000 m del Lap, no los ~2.2 km de los dos puntos
    expect(a.duration).toBe(1500);
    expect(a.pace).toBe(300);          // 5:00/km
    expect(a.source).toBe('tcx');
  });

  it('lee la FC y el desnivel de los trackpoints', () => {
    const a = parseActivity(tcx);
    expect(a.hr).toBe(150);
    expect(a.hrMax).toBe(160);
    expect(a.elevation).toBe(40);
  });
});

describe('errores, dichos con la salida a mano', () => {
  it('fichero vacío', () => {
    expect(() => parseActivity('')).toThrow(ImportError);
  });

  it('XML corrupto', () => {
    expect(() => parseActivity('<gpx><trk>')).toThrow(/XML válido/);
  });

  it('formato desconocido', () => {
    expect(() => parseActivity('<otracosa/>', 'x.xml')).toThrow(/no reconocido/);
  });

  it('un .FIT explica cómo exportarlo en GPX en vez de fallar en seco', () => {
    expect(() => parseActivity('binario', 'actividad.fit')).toThrow(/GPX/);
  });

  it('GPX sin puntos', () => {
    expect(() => parseActivity(gpx([]))).toThrow(/no contiene puntos/);
  });
});

describe('duplicados', () => {
  const db = { runningLogs: [{ id: 1, date: '2026-07-20', distance: 5.02 }] };

  it('detecta la misma carrera importada dos veces', () => {
    expect(findDuplicate(db, { date: '2026-07-20', distance: 5.04 })).toBeTruthy();
  });

  it('no confunde dos carreras distintas del mismo día', () => {
    expect(findDuplicate(db, { date: '2026-07-20', distance: 10.5 })).toBeNull();
  });

  it('ni la misma distancia en días distintos', () => {
    expect(findDuplicate(db, { date: '2026-07-21', distance: 5.02 })).toBeNull();
  });
});
