// La ontología resuelve texto libre a nodos, y la decisión de F3 es operativa:
// los canónicos alimentan métricas, las variantes NO (ni con coeficiente), y lo
// desconocido no resuelve. Ver PLAN-ONTOLOGIA.md, sección F3.
import { describe, it, expect } from 'vitest';
import { resolveExercise, mediaKey, EXERCISE_ONTOLOGY } from '../js/exercise-ontology.js';
import { mediaKey as mediaKeyPict } from '../js/ui/exercise-pict.js';

const metric = name => resolveExercise(name)?.lift ?? null;

describe('resolveExercise', () => {
  it('resuelve los cinco canónicos en cómo los escriben los planes y los fixtures', () => {
    expect(metric('Sentadilla')).toBe('squat');
    expect(metric('Sentadillas')).toBe('squat');
    expect(metric('Sentadilla trasera')).toBe('squat');
    expect(metric('Peso Muerto')).toBe('deadlift');
    expect(metric('Press de Banca')).toBe('bench');
    expect(metric('Press Banca')).toBe('bench');
    expect(metric('Press Militar')).toBe('ohp');
    expect(metric('Press de Hombro')).toBe('ohp');
    expect(metric('OHP')).toBe('ohp');
    expect(metric('Dominada Prono')).toBe('pullups');
    expect(metric('Dominada Supino')).toBe('pullups');
    expect(metric('Pull-up')).toBe('pullups');
  });

  it('tolera tildes, plural, orden de palabras y paréntesis', () => {
    expect(metric('sentadilla trasera')).toBe('squat');
    expect(metric('Banca Press')).toBe('bench');
    expect(metric('Sentadilla (KB)')).toBe('squat');
  });

  it('las variantes resuelven a su nodo pero sin lift: no alimentan al básico', () => {
    for (const n of ['Sentadilla Frontal', 'Front Squat', 'Sentadilla Búlgara',
      'Sentadilla 1 Pierna', 'Squat con Salto', 'Squat en Rack',
      'PM Rumano', 'Deadlift High Pull', 'Push Press', 'Press en el Suelo']) {
      const r = resolveExercise(n);
      expect(r, n).toBeTruthy();
      expect(r.lift, n).toBeUndefined();
      expect(r.variantOf, n).toBeTruthy();
      expect(metric(n), n).toBeNull();
    }
  });

  it('lo desconocido no resuelve — sin substring, sin difuso, sin fallback', () => {
    expect(metric('Thruster')).toBeNull();
    expect(metric('Clean & Press')).toBeNull();
    expect(metric('Press Jabalina')).toBeNull();
    expect(metric('')).toBeNull();
    // el substring es lo que colaba variantes: un nombre que CONTIENE
    // "sentadilla" no es una sentadilla trasera
    expect(metric('Sentadilla búlgara con mancuernas')).toBeNull();
  });

  it('la ontología no tiene dos nodos con la misma firma', () => {
    // el índice se construye con throw si hay colisión; esto es el cinturón
    const claves = new Map();
    for (const e of EXERCISE_ONTOLOGY) {
      for (const alias of [e.name, ...e.aliases]) {
        const k = mediaKey(alias);
        expect(claves.has(k) && claves.get(k) !== e.id, `${k}: ${claves.get(k)} vs ${e.id}`).toBe(false);
        claves.set(k, e.id);
      }
    }
  });

  it('todo nodo declara patrón del vocabulario cerrado; lift y variantOf se excluyen', () => {
    const PATTERNS = new Set(['hinge', 'squat', 'lunge', 'push_h', 'push_v',
      'pull_h', 'pull_v', 'carry', 'core', 'loco']);
    for (const e of EXERCISE_ONTOLOGY) {
      expect(PATTERNS.has(e.pattern), e.id).toBe(true);
      expect(!(e.lift && e.variantOf), e.id).toBe(true);
    }
  });

  it('delta cero: solo los cinco canónicos de la semilla llevan lift', () => {
    // js/domains.js alimenta liftMetric() de .lift: un nodo nuevo con lift
    // cambiaría métricas sin registrar ningún entreno nuevo
    const lifts = EXERCISE_ONTOLOGY.filter(e => e.lift).map(e => e.id).sort();
    expect(lifts).toEqual(['bench', 'deadlift', 'ohp', 'pullup', 'squat']);
  });

  it('exercise-pict reutiliza la misma normalización — una sola fuente de verdad', () => {
    expect(mediaKeyPict).toBe(mediaKey);
    expect(mediaKeyPict('Swing (KB)')).toBe(mediaKey('swing'));
  });
});
