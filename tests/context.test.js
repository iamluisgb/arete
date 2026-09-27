// W3 — sección MEMORIA DEL ATLETA del snapshot (js/ai/context.js) e instrucción
// en el SOUL (js/ai/soul.js): sin la sección, los ids [Mn] que usa el modelo para
// remember/forget no existen; sin la instrucción, el modelo no sabe cuándo
// conservar algo y cuándo no.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSnapshot, buildMemoriaSection } from '../js/ai/context.js';
import { SOUL } from '../js/ai/soul.js';
import { upsertMemoria, saveMemorias, listMemorias, loadMemorias, MAX_MEMORIAS } from '../js/quiron-memory.js';
import { MEMORY_TOOL_NAMES } from '../js/ai/tools.js';

// Mediodía local: la fecha que pinta la sección es dd/mm del ts, y un mediodía
// cae en el mismo día en cualquier huso razonable.
const MEDIODIA = new Date(2026, 8, 12, 12, 0).getTime();
const REF = new Date(2026, 8, 27, 12, 0);
const DB = { settings: {}, workouts: [], runningLogs: [], bodyLogs: [] };

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(MEDIODIA);
});
afterEach(() => { vi.useRealTimers(); });

// Dos memorias activas con ts distintos y una borrada, persistidas tal como las
// deja la app (upsert + save en la clave propia).
function sembrar() {
  const arr = [];
  vi.setSystemTime(new Date(2026, 8, 12, 12, 0).getTime());
  upsertMemoria(arr, { categoria: 'horario', texto: 'entreno por la mañana' });
  vi.setSystemTime(new Date(2026, 8, 20, 12, 0).getTime());
  upsertMemoria(arr, { categoria: 'dolor', texto: 'tendinitis en el talón de Aquiles' });
  vi.setSystemTime(new Date(2026, 8, 25, 12, 0).getTime());
  const odiada = upsertMemoria(arr, { categoria: 'preferencia', texto: 'odia el remo' });
  odiada.deleted = true; // borrado blando: no debe verse
  saveMemorias(arr);
}

describe('buildMemoriaSection — sección del snapshot', () => {
  it('sin memorias no devuelve nada (la sección se omite entera, sin encabezado vacío)', () => {
    expect(buildMemoriaSection()).toEqual([]);
    expect(buildSnapshot(DB, {}, REF)).not.toContain('MEMORIA DEL ATLETA');
  });

  it('con solo memorias borradas también se omite', () => {
    const arr = [];
    const e = upsertMemoria(arr, { texto: 'ya no vale' });
    e.deleted = true;
    saveMemorias(arr);
    expect(buildMemoriaSection()).toEqual([]);
  });

  it('renderiza [Mn] categoría · texto (fecha), ordenado por ts asc y filtrando borradas', () => {
    sembrar();
    expect(buildMemoriaSection()).toEqual([
      'MEMORIA DEL ATLETA (lo duradero que me contaste antes — [Mn] es su id para actualizar o borrar):',
      '  [M1] horario · entreno por la mañana (12/09)',
      '  [M2] dolor · tendinitis en el talón de Aquiles (20/09)',
    ]);
  });

  it('los [Mn] del snapshot coinciden con listMemorias(loadMemorias()): el id que ve el modelo resuelve igual en forget', () => {
    // Contrato compartido con las tools (W2): misma fuente, mismo orden.
    sembrar();
    const seccion = buildMemoriaSection().slice(1);
    const lista = listMemorias(loadMemorias());
    expect(seccion).toHaveLength(lista.length);
    for (const [i, linea] of seccion.entries()) {
      expect(linea).toContain(`[${lista[i].shortId}]`);
    }
  });

  it('al tope de 50 activas lista las 50 (los [Mn] son referencia para editar/borrar)', () => {
    const arr = [];
    for (let i = 0; i < MAX_MEMORIAS; i++) {
      vi.advanceTimersByTime(1);
      upsertMemoria(arr, { texto: 'm' + i });
    }
    saveMemorias(arr);
    const seccion = buildMemoriaSection();
    expect(seccion).toHaveLength(MAX_MEMORIAS + 1); // encabezado + 50 líneas
    expect(seccion[1]).toContain('[M1]');
    expect(seccion[MAX_MEMORIAS]).toContain('[M50]');
  });

  it('buildSnapshot integra la sección tras el perfil', () => {
    sembrar();
    const snap = buildSnapshot(DB, {}, REF);
    const idxPerfil = snap.indexOf('PERFIL');
    const idxMemoria = snap.indexOf('MEMORIA DEL ATLETA');
    const idxZonas = snap.indexOf('ZONAS');
    expect(idxMemoria).toBeGreaterThan(idxPerfil);
    expect(idxMemoria).toBeLessThan(idxZonas);
  });
});

describe('SOUL — instrucción de memoria (D5)', () => {
  it('nombra las herramientas de memoria y la sección (contrato de fuente, como toolLabel)', () => {
    expect(SOUL).toContain('MEMORIA DEL ATLETA');
    for (const name of MEMORY_TOOL_NAMES) expect(SOUL).toContain(name);
  });

  it('dice CUÁNDO guardar (lo duradero), CUÁNDO NO (lo ya en el snapshot) y cómo editar ([Mn])', () => {
    expect(SOUL).toMatch(/NO guardes lo que ya vive en el snapshot/i);
    expect(SOUL).toMatch(/\[Mn\]/);
    expect(SOUL).toMatch(/remember.*id \[Mn\]/is);
  });
});
