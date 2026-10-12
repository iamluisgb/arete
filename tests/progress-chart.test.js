// La gráfica de progreso. Los dos defectos que se fijan aquí no eran estéticos:
// la pantalla que el producto usa para demostrar que el nivel sube estaba
// mintiendo de dos maneras a la vez.
//
//   AU-12 · La serie era «todos los entrenos del programa con ese ejercicio», y
//           un plan de dos variantes (A a 100 kg, B a 110 kg) entra en la misma
//           línea. El resultado es un serrucho de ±10 kg con más de 100 vértices
//           en el que la tendencia real —que sube— es invisible.
//   AU-13 · `isPR = p[metric] === pr`, igualdad en vez de «mayor que». Como el
//           plan alterna A y B, casi una fila de cada dos salía con insignia de
//           récord personal al MISMO peso: tres PR en nueve días por 110 kg.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../js/programs.js', async () => ({
  ...(await vi.importActual('../js/programs.js')),
  getActiveProgram: () => 'arete',
}));

function setupDOM() {
  document.body.innerHTML = `
    <select id="progressExercise"></select>
    <div id="progressExList"></div>
    <div id="progressChart"></div>
    <div id="progressStats"></div>
    <div id="progressHistory"></div>
  `;
}

/** Un entreno con una sola serie de sentadilla, para que maxKg sea el peso. */
const entreno = (date, session, kg, reps = '5') => ({
  id: date, date, session, program: 'arete', phase: 1,
  exercises: [{ name: 'Sentadilla', sets: [{ kg: String(kg), reps }] }],
});

const db = (workouts) => ({
  workouts, bodyLogs: [], runningLogs: [], domainTests: [],
  customSessions: [], customPrograms: [], deletedIds: [],
  settings: {}, program: 'arete', phase: 1,
});

async function cargar(workouts, ejercicio = 'Sentadilla') {
  vi.resetModules();
  setupDOM();
  const mod = await import('../js/ui/progress.js');
  document.getElementById('progressExercise').innerHTML =
    `<option value="${ejercicio}">${ejercicio}</option>`;
  document.getElementById('progressExercise').value = ejercicio;
  mod.renderProgressChart(db(workouts));
  return mod;
}

const chart = () => document.getElementById('progressChart');
const filas = () => [...document.querySelectorAll('#progressHistory tbody tr')];

/** Los cx de los puntos de una serie, en orden. */
const xs = (serie) =>
  [...document.querySelectorAll(`[data-serie="${serie}"] circle`)].map(c => parseFloat(c.getAttribute('cx')));

beforeEach(() => {
  localStorage.clear();
});

describe('AU-12 · una serie por variante del plan', () => {
  const plan = [
    entreno('2026-01-01', 'Sesión A', 100),
    entreno('2026-01-08', 'Sesión B', 90),
    entreno('2026-01-15', 'Sesión A', 105),
    entreno('2026-01-22', 'Sesión B', 95),
  ];

  it('dibuja una serie por sesión del plan, no una sola línea con todo', async () => {
    await cargar(plan);
    const series = [...chart().querySelectorAll('path[data-serie]')].map(p => p.getAttribute('data-serie'));
    expect(series).toEqual(['Sesión A', 'Sesión B']);
  });

  it('nombra las series en una leyenda: dos líneas sin nombre son decoración', async () => {
    await cargar(plan);
    const leyenda = chart().querySelector('.ph-legend');
    expect(leyenda).toBeTruthy();
    expect(leyenda.textContent).toContain('Sesión A');
    expect(leyenda.textContent).toContain('Sesión B');
  });

  it('las series comparten un eje de fechas: una no puede dibujarse más ancha que su tramo real', async () => {
    // A en los extremos del periodo, B en el medio. Con el eje compartido, el
    // tramo de B ocupa ~1/3 del ancho; escalando cada serie por su índice —que
    // era lo que hacía el código— las dos ocuparían el ancho completo y la
    // gráfica diría que B va en paralelo a A cuando va después.
    await cargar([
      entreno('2026-01-01', 'Sesión A', 100),
      entreno('2026-01-08', 'Sesión B', 90),
      entreno('2026-01-22', 'Sesión B', 95),
      entreno('2026-01-29', 'Sesión A', 105),
    ]);
    const a = xs('Sesión A'), b = xs('Sesión B');
    const tramo = (v) => Math.max(...v) - Math.min(...v);
    expect(b.length).toBe(2);
    expect(a.length).toBe(2);
    expect(tramo(b)).toBeLessThan(tramo(a) * 0.6);
    // Y cada serie arranca donde le toca, no en el borde izquierdo del lienzo.
    expect(Math.min(...b)).toBeGreaterThan(Math.min(...a));
    expect(Math.max(...b)).toBeLessThan(Math.max(...a));
  });

  it('la escala vertical se comparte entre las series: si no, comparar es imposible', async () => {
    await cargar(plan);
    const ys = (serie) => [...document.querySelectorAll(`[data-serie="${serie}"] circle`)]
      .map(c => parseFloat(c.getAttribute('cy')));
    // 105 es el máximo de todo el periodo y tiene que ser el punto más alto
    // (menor y) de su serie; 90 el mínimo global, el más bajo de la suya.
    expect(Math.min(...ys('Sesión A'))).toBeLessThan(Math.max(...ys('Sesión B')));
  });
});

describe('AU-13 · el récord se supera, no se iguala', () => {
  it('marca PR solo cuando el peso supera el récord de SU variante', async () => {
    await cargar([
      entreno('2026-01-01', 'Sesión A', 100),
      entreno('2026-01-08', 'Sesión B', 90),
      entreno('2026-01-15', 'Sesión A', 100),   // iguala: no es récord
      entreno('2026-01-22', 'Sesión A', 105),   // supera: sí
    ]);
    const pr = document.querySelectorAll('#progressHistory .ph-pr');
    // 100(A), 90(B) y 105(A): el arranque de cada variante y el nuevo máximo.
    // La fila del 15/01, al mismo peso que el 01/01, ya no lleva insignia.
    expect(pr).toHaveLength(3);
    const pesosConPR = [...pr].map(e => e.closest('tr').querySelector('.ph-num b').textContent);
    expect(pesosConPR).toEqual(['105 kg', '90 kg', '100 kg']);
  });

  it('marca la igualdad con un distintivo propio, sin llamarla récord', async () => {
    await cargar([
      entreno('2026-01-01', 'Sesión A', 100),
      entreno('2026-01-08', 'Sesión A', 100),
    ]);
    const filasTxt = filas().map(tr => tr.textContent);
    expect(document.querySelectorAll('#progressHistory .ph-pr')).toHaveLength(1);
    expect(document.querySelectorAll('#progressHistory .ph-eq')).toHaveLength(1);
    // La fila de la igualdad no puede llevar además la insignia de récord.
    const eq = document.querySelector('#progressHistory .ph-eq').closest('tr');
    expect(eq.querySelector('.ph-pr')).toBeNull();
    expect(eq.textContent).toMatch(/=/);
  });

  it('el récord es por variante: 110 kg del día B no borra el récord del día A', async () => {
    await cargar([
      entreno('2026-01-01', 'Sesión A', 100),
      entreno('2026-01-08', 'Sesión B', 110),
      entreno('2026-01-15', 'Sesión A', 105),   // récord de A, aunque B tenga 110
    ]);
    const conPR = [...document.querySelectorAll('#progressHistory .ph-pr')]
      .map(e => e.closest('tr').querySelector('.ph-num b').textContent);
    expect(conPR).toContain('105 kg');
  });

  it('el peso de otra variante no se marca récord por el solo hecho de ser mayor', async () => {
    await cargar([
      entreno('2026-01-01', 'Sesión A', 100),
      entreno('2026-01-08', 'Sesión B', 110),
      entreno('2026-01-15', 'Sesión B', 105),   // por debajo del récord de B
    ]);
    const fila105 = filas().find(tr => tr.textContent.includes('105 kg'));
    expect(fila105.querySelector('.ph-pr')).toBeNull();
    expect(fila105.querySelector('.ph-eq')).toBeNull();
  });
});

describe('la tabla dice de qué variante es cada fila', () => {
  it('con dos variantes, añade la columna de sesión', async () => {
    await cargar([
      entreno('2026-01-01', 'Sesión A', 100),
      entreno('2026-01-08', 'Sesión B', 90),
    ]);
    const cabeceras = [...document.querySelectorAll('#progressHistory thead th')].map(th => th.textContent.trim());
    expect(cabeceras).toContain('Sesión');
    expect(filas()[0].textContent).toMatch(/Sesión [AB]/);
  });

  it('con una sola variante no añade ruido', async () => {
    await cargar([
      entreno('2026-01-01', 'Sesión A', 100),
      entreno('2026-01-08', 'Sesión A', 105),
    ]);
    const cabeceras = [...document.querySelectorAll('#progressHistory thead th')].map(th => th.textContent.trim());
    expect(cabeceras).not.toContain('Sesión');
  });
});

describe('el delta de progreso no compara peras con manzanas', () => {
  it('mide sobre la serie principal, no del primer entreno al último', async () => {
    // Cronológicamente va de 100 (A) a 95 (B): restar esos dos daría −5 kg, una
    // regresión que no existe. La sentadilla del día A subió de 100 a 105.
    await cargar([
      entreno('2026-01-01', 'Sesión A', 100),
      entreno('2026-01-08', 'Sesión B', 90),
      entreno('2026-01-15', 'Sesión A', 105),
      entreno('2026-01-22', 'Sesión B', 95),
    ]);
    const stats = document.getElementById('progressStats').textContent;
    expect(stats).toContain('+5kg');
    expect(stats).not.toContain('-5kg');
  });
});

describe('el color del distintivo de récord (AE-04, hallazgo del mismo pase)', () => {
  it('.ph-pr se rellena con la acción primaria y no con el acento tipográfico', async () => {
    // --color-accent-text es #ff5545 en oscuro y con texto blanco son 3,16:1:
    // falla el AA de texto, y es exactamente el fallo que el design system ya
    // documenta y arregló una vez para el botón primario (app.css:154-160). El
    // distintivo de un récord es lo último que debería ser ilegible en oscuro.
    const css = readFileSync(resolve(process.cwd(), 'app.css'), 'utf-8').replace(/\s+/g, '');
    expect(css).toContain('.ph-pr{font-size:var(--fs-2xs);background:var(--color-action-primary)');
  });
});
