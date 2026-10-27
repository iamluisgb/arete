import { describe, it, expect } from 'vitest';
import {
  sessionCardData, sessionPresets, sessionShareText, fmtNum, parseClock, fmtClock,
} from '../js/ui/session-card.js';

// Como se guardan en db.workouts: kg y reps son texto de los inputs.
const FUERZA = {
  date: '2026-10-27', session: 'Sesión A',
  exercises: [
    { name: 'Sentadilla', sets: [{ kg: '100', reps: '5' }, { kg: '102.5', reps: '5' }] },
    { name: 'Dominada Prono', sets: [{ kg: '', reps: '8' }, { kg: '', reps: '6' }] },
    { name: 'Plancha Abdominal', sets: [{ kg: '', reps: '2min' }, { kg: '', reps: '2min' }] },
    { name: 'Vacío', sets: [{ kg: '', reps: '' }] },
  ],
  prs: [{ exercise: 'Sentadilla', kg: 102.5, prevKg: 100 }],
};

const HIIT = {
  date: '2026-10-26', session: 'HIIT-1',
  exercises: [{
    name: 'HIIT-1', type: 'hiit', rounds: 3, rest: '90s', sets: [{ kg: '', reps: '14:32' }],
    exercises: [
      { name: 'Dominadas', reps: 10 },
      { name: 'Escaladores', reps: 20, perSide: true },
      { name: 'Burpees', duration: '1min' },
      { name: 'Descanso', duration: '1min', isRest: true },
    ],
  }],
};

describe('formato', () => {
  it('números en español: coma decimal y punto de miles', () => {
    expect(fmtNum(102.5)).toBe('102,5');
    expect(fmtNum(3332.5, 0)).toBe('3.333');
    expect(fmtNum(27540, 0)).toBe('27.540');
    expect(fmtNum(100)).toBe('100');
  });

  it('relojes de ida y vuelta', () => {
    expect(parseClock('14:32')).toBe(872);
    expect(parseClock('1:02:10')).toBe(3730);
    expect(parseClock('Tiempo')).toBeNull();
    expect(fmtClock(872)).toBe('14:32');
    expect(fmtClock(3730)).toBe('1:02:10');
  });
});

describe('sesión de fuerza', () => {
  const d = sessionCardData(FUERZA);

  it('el volumen solo cuenta series con peso', () => {
    expect(d.kind).toBe('strength');
    expect(d.volume).toBe(100 * 5 + 102.5 * 5);
  });

  it('un ejercicio sin nada escrito no sale en la tarjeta', () => {
    expect(d.exercises.map(e => e.name)).toEqual(['Sentadilla', 'Dominada Prono', 'Plancha Abdominal']);
  });

  it('la mejor serie y la serie del récord', () => {
    const sq = d.exercises[0];
    expect(sq.best).toBe('102,5 kg × 5');
    expect(sq.sets.map(s => s.record)).toEqual([false, true]);
  });

  it('peso corporal enseña reps; un aguante no es una serie de reps', () => {
    expect(d.exercises[1].best).toBe('8 reps');
    expect(d.exercises[2].timed).toBe(true);
    expect(d.exercises[2].best).toBe('2min × 2');
  });

  it('el estilo Récord solo existe si hay récord', () => {
    expect(Object.keys(sessionPresets(d))).toEqual(['minimal', 'record', 'statsPro']);
    expect(Object.keys(sessionPresets(sessionCardData({ ...FUERZA, prs: [] })))).toEqual(['minimal', 'statsPro']);
  });

  it('el texto compartido cuenta el récord y lleva el enlace', () => {
    expect(sessionShareText(d)).toBe('Récord en sentadilla: 102,5 kg. Entreno con Areté → https://arete.raiatech.com/?ref=sesion');
  });

  it('acepta números además de texto (lo que pueda traer una ingesta)', () => {
    const n = sessionCardData({ exercises: [{ name: 'Press', sets: [{ kg: 60, reps: 5 }] }] });
    expect(n.volume).toBe(300);
    expect(n.exercises[0].best).toBe('60 kg × 5');
  });
});

describe('sesión de HIIT', () => {
  const d = sessionCardData(HIIT);

  it('tiempo, rondas y ritmo por ronda', () => {
    expect(d.kind).toBe('hiit');
    expect(d.hiit.timeSec).toBe(872);
    expect(d.hiit.rounds).toBe(3);
    expect(fmtClock(d.hiit.perRound)).toBe('4:51');
  });

  it('las repeticiones totales cuentan los dos lados y no el descanso', () => {
    // (10 + 20×2) × 3 rondas
    expect(d.hiit.totalReps).toBe(150);
    expect(d.hiit.items.map(i => i.total)).toEqual(['30 en total', '60 por lado', '3:00 en total', '']);
  });

  it('sin descanso entre rondas no se dice nada', () => {
    const sin = sessionCardData({ ...HIIT, exercises: [{ ...HIIT.exercises[0], rest: '0s' }] });
    expect(sin.hiit.rest).toBe('');
  });

  it('el texto compartido lleva el tiempo', () => {
    expect(sessionShareText(d)).toBe('HIIT-1 en 14:32. Entreno con Areté → https://arete.raiatech.com/?ref=sesion');
  });
});
