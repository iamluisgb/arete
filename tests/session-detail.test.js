// Detalle de una sesión de fuerza: series agrupadas tal como se hicieron y la
// comparación con la vez anterior del mismo ejercicio.
import { describe, it, expect } from 'vitest';
import { groupSets, previousTop } from '../js/ui/history.js';

const S = (kg, reps) => ({ kg: String(kg), reps: String(reps) });

describe('groupSets', () => {
  it('junta series iguales y consecutivas', () => {
    expect(groupSets([S(110, 3), S(110, 3), S(110, 3)])).toEqual(['3×3 · 110 kg']);
  });
  it('una serie distinta abre otro grupo, en el orden en que se hizo', () => {
    expect(groupSets([S(60, 8), S(60, 8), S(55, 10), S(60, 8)]))
      .toEqual(['2×8 · 60 kg', '1×10 · 55 kg', '1×8 · 60 kg']);
  });
  it('sin peso queda solo la prescripción, también un aguante', () => {
    expect(groupSets([{ kg: '', reps: '2min' }, { kg: '', reps: '2min' }])).toEqual(['2×2min']);
  });
  it('decimales con coma', () => {
    expect(groupSets([S('2.5', 10)])).toEqual(['1×10 · 2,5 kg']);
  });
});

describe('previousTop', () => {
  const db = { workouts: [
    { id: 1, date: '2026-10-14', exercises: [{ name: 'Sentadilla', sets: [S(100, 5)] }] },
    { id: 2, date: '2026-10-21', exercises: [{ name: 'Sentadilla', sets: [S(105, 3), S(102.5, 3)] }, { name: 'Dominada', sets: [{ kg: '', reps: '8' }] }] },
    { id: 3, date: '2026-10-24', exercises: [{ name: 'Sentadilla', sets: [S(110, 3)] }, { name: 'Dominada', sets: [S(20, 3)] }] },
    { id: 4, date: '2026-10-28', exercises: [{ name: 'Sentadilla', sets: [S(120, 1)] }] },
  ] };
  const w = db.workouts[2];

  it('la carga más alta de la última sesión anterior con ese ejercicio', () => {
    expect(previousTop(db, w, 'Sentadilla')).toEqual({ kg: 105, date: '2026-10-21' });
  });
  it('salta las sesiones donde el ejercicio fue sin peso', () => {
    expect(previousTop(db, w, 'Dominada')).toBeNull();
  });
  it('nada si es la primera vez', () => {
    expect(previousTop(db, db.workouts[0], 'Sentadilla')).toBeNull();
  });
});
