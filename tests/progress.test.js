// Progreso: la pantalla que responde "¿estoy mejorando?".
//
// Lo que se comprueba aquí es que la sesión se lee tal como se hizo. El fallo
// que motivó estos tests era silencioso: la tabla resumía cada sesión en tres
// números sueltos (peso máx, reps máx, volumen) y una serie de 100×5 junto a
// otra de 95×6 se mostraba como "100 kg · 6 reps", un dato que no existió.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');

function setupDOM() {
  const doc = new JSDOM(HTML).window.document;
  const sec = doc.getElementById('strProgress');
  document.body.innerHTML = '';
  document.body.appendChild(sec.cloneNode(true));
}

const freshDB = (over = {}) => ({
  workouts: [], bodyLogs: [], runningLogs: [], domainTests: [],
  customSessions: [], customPrograms: [], deletedIds: [],
  settings: {}, program: 'arete', phase: 1, ...over,
});

const w = (date, sets, name = 'Sentadilla') => ({
  id: date, date, session: 'A', program: 'arete', phase: 1,
  exercises: [{ name, sets }],
});

async function cargar(db, ejercicio) {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  localStorage.setItem('areteProgressEx', ejercicio);
  const mod = await import('../js/ui/progress.js');
  mod.initProgress(db);
  mod.renderProgressChart(db);
  return mod;
}

describe('Progreso: la tabla no resume, cuenta lo que pasó', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('enseña todas las series, no el máximo de cada columna', async () => {
    const db = freshDB({
      workouts: [w('2026-03-02', [
        { kg: '100', reps: '5' }, { kg: '100', reps: '5' }, { kg: '95', reps: '6' },
      ])],
    });
    await cargar(db, 'Sentadilla');
    const fila = document.querySelector('#progressHistory tbody tr');
    expect(fila.querySelector('.ph-ladder').textContent.trim()).toMatch(/^100×5 · 100×5 · 95×6/);
    // Tres series, dieciséis repeticiones y 1.570 kg de volumen. El "6 reps" de
    // antes era el máximo de una serie, no lo que se hizo.
    expect([...fila.querySelectorAll('.ph-num')].map(td => td.textContent.trim()))
      .toEqual(['3', '16', '1.6 t', '117 kg']);
  });

  it('los huecos sin rellenar no cuentan como series hechas', async () => {
    const db = freshDB({
      workouts: [w('2026-03-02', [
        { kg: '80', reps: '8' }, { kg: '', reps: '' }, { kg: '', reps: '' },
      ])],
    });
    await cargar(db, 'Sentadilla');
    const fila = document.querySelector('#progressHistory tbody tr');
    expect(fila.querySelector('.ph-ladder').textContent.trim()).toMatch(/^80×8/);
    expect(fila.querySelectorAll('.ph-num')[0].textContent.trim()).toBe('1');
  });

  it('un aguante cronometrado no entra como serie de 3 reps', async () => {
    const db = freshDB({
      workouts: [
        w('2026-03-02', [{ kg: '', reps: '2min' }], 'Plancha'),
        w('2026-03-09', [{ kg: '', reps: '2:30' }], 'Plancha'),
      ],
    });
    await cargar(db, 'Plancha');
    expect(document.getElementById('progressChart').textContent).toContain('se registra por tiempo');
    const filas = [...document.querySelectorAll('#progressHistory tbody tr')]
      .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
    // Más reciente arriba, y el registro se enseña tal cual se escribió.
    expect(filas[0][1]).toBe('2:30');
    expect(filas[1][1]).toBe('2min');
    // Reps del cronómetro: no hay, y no se inventa un total.
    expect(filas[0][3]).toBe('—');
  });
});

describe('Progreso: el peso se mide con el mismo e1RM que el perfil', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('la carga es Epley con tope de 12 reps', async () => {
    // 80×10 → 106,7 · 100×5 → 116,7. La serie corta pesa más que la larga.
    const db = freshDB({
      workouts: [
        w('2026-03-02', [{ kg: '80', reps: '10' }]),
        w('2026-03-09', [{ kg: '100', reps: '5' }]),
      ],
    });
    await cargar(db, 'Sentadilla');
    const filas = [...document.querySelectorAll('#progressHistory tbody tr')];
    // Más reciente arriba.
    expect(filas[0].querySelectorAll('.ph-num')[3].textContent.trim()).toBe('117 kg');
    expect(filas[1].querySelectorAll('.ph-num')[3].textContent.trim()).toBe('107 kg');
  });

  it('por encima de 12 reps no estima: deja el hueco, no un número inflado', async () => {
    const db = freshDB({
      workouts: [
        w('2026-03-02', [{ kg: '45', reps: '20' }]),
        w('2026-03-09', [{ kg: '50', reps: '8' }]),
      ],
    });
    await cargar(db, 'Press militar');
    const filas = [...document.querySelectorAll('#progressHistory tbody tr')];
    expect(filas[0].querySelectorAll('.ph-num')[3].textContent.trim()).toBe('63 kg');
    expect(filas[1].querySelectorAll('.ph-num')[3].textContent.trim()).toBe('—');
  });

  it('un ejercicio a peso corporal no inventa columnas de kilos', async () => {
    const db = freshDB({
      workouts: [
        w('2026-03-02', [{ kg: '', reps: '10' }, { kg: '', reps: '9' }, { kg: '', reps: '7' }], 'Dominadas'),
      ],
    });
    await cargar(db, 'Dominadas');
    const cabeceras = [...document.querySelectorAll('#progressHistory th')].map(th => th.textContent.trim());
    expect(cabeceras).toEqual(['Fecha', 'Series (reps)', 'Nº', 'Reps']);
    expect(document.querySelector('#progressHistory .ph-ladder').textContent.trim()).toMatch(/^10 · 9 · 7/);
  });
});

describe('Progreso: la gráfica aguanta los extremos', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('una sola sesión no genera coordenadas imposibles', async () => {
    const db = freshDB({ workouts: [w('2026-03-02', [{ kg: '100', reps: '5' }])] });
    await cargar(db, 'Sentadilla');
    const svg = document.querySelector('#progressChart svg');
    expect(svg).toBeTruthy();
    expect(svg.outerHTML).not.toContain('NaN');
    expect(svg.querySelectorAll('rect').length).toBe(1);
  });

  it('un historial largo con sesiones seguidas sigue siendo dibujable', async () => {
    const workouts = [];
    for (let i = 0; i < 40; i++) {
      // Dos sesiones en días consecutivos dentro de un año: el caso que pega
      // las columnas si la X es puramente proporcional a la fecha.
      const d = new Date(Date.UTC(2026, 0, 2 + i * 9));
      workouts.push(w(d.toISOString().slice(0, 10), [
        { kg: String(60 + i), reps: '5' }, { kg: String(60 + i), reps: '5' }, { kg: String(55 + i), reps: '6' },
      ]));
      const d2 = new Date(Date.UTC(2026, 0, 3 + i * 9));
      workouts.push(w(d2.toISOString().slice(0, 10), [
        { kg: String(60 + i), reps: '5' }, { kg: String(60 + i), reps: '5' },
      ]));
    }
    await cargar(freshDB({ workouts }), 'Sentadilla');
    const svg = document.querySelector('#progressChart svg');
    expect(svg.outerHTML).not.toContain('NaN');
    // Con más sesiones que píxeles la gráfica dibuja las últimas que caben y lo
    // dice; el historial de abajo no pierde ni una.
    expect(svg.textContent).toContain('últimas');
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(0);
    expect(svg.querySelectorAll('rect').length).toBeLessThan(60);
    expect(document.querySelectorAll('#progressHistory tbody tr').length).toBe(80);
  });
});

describe('Progreso: dos variantes del plan no son una sola tendencia', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('cada sesión del plan tiene su línea, y la leyenda las nombra', async () => {
    // Sentadilla en A a 100 kg y en B a 80 kg: una sola línea dibujaría un
    // serrucho de 20 kg donde no hay ninguna tendencia.
    const base = { id: 1, program: 'arete', phase: 1 };
    const db = freshDB({
      workouts: [
        { ...base, id: 1, date: '2026-03-02', session: 'A', exercises: [{ name: 'Sentadilla', sets: [{ kg: '100', reps: '5' }] }] },
        { ...base, id: 2, date: '2026-03-04', session: 'B', exercises: [{ name: 'Sentadilla', sets: [{ kg: '80', reps: '8' }] }] },
        { ...base, id: 3, date: '2026-03-09', session: 'A', exercises: [{ name: 'Sentadilla', sets: [{ kg: '105', reps: '5' }] }] },
        { ...base, id: 4, date: '2026-03-11', session: 'B', exercises: [{ name: 'Sentadilla', sets: [{ kg: '85', reps: '8' }] }] },
      ],
    });
    await cargar(db, 'Sentadilla');
    const svg = document.querySelector('#progressChart svg');
    // Dos trazos de carga (uno por variante) más ninguno por las barras, que
    // son rects.
    expect(svg.querySelectorAll('path').length).toBe(2);
    expect(svg.textContent).toContain('A');
    expect(svg.textContent).toContain('B');
  });

  it('con una sola variante no aparece leyenda ni se parte la línea', async () => {
    const db = freshDB({
      workouts: [
        w('2026-03-02', [{ kg: '100', reps: '5' }]),
        w('2026-03-09', [{ kg: '105', reps: '5' }]),
      ],
    });
    await cargar(db, 'Sentadilla');
    expect(document.querySelectorAll('#progressChart path').length).toBe(1);
  });
});
