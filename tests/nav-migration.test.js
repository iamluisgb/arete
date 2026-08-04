// Fuerza y Running dejan de ser secciones y pasan a ser un modo dentro de
// "Entrenar". Quien tuviera la app abierta en una de ellas la reabría en una
// sección que ya no existe y se quedaba en blanco.
import { describe, it, expect, beforeEach, vi } from 'vitest';

async function cargar() {
  vi.resetModules();
  return import('../js/ui/nav.js');
}

beforeEach(() => { localStorage.clear(); });

describe('migrateLastTab', () => {
  it('secStrength pasa a Entrenar en modo fuerza', async () => {
    localStorage.setItem('areteLastTab', 'secStrength');
    const { migrateLastTab, getTrainMode } = await cargar();
    migrateLastTab();
    expect(localStorage.getItem('areteLastTab')).toBe('secTrain');
    expect(getTrainMode()).toBe('str');
  });

  it('secRunning pasa a Entrenar en modo carrera', async () => {
    localStorage.setItem('areteLastTab', 'secRunning');
    const { migrateLastTab, getTrainMode } = await cargar();
    migrateLastTab();
    expect(localStorage.getItem('areteLastTab')).toBe('secTrain');
    expect(getTrainMode()).toBe('run');
  });

  it('no toca las pestañas que siguen existiendo', async () => {
    localStorage.setItem('areteLastTab', 'secBody');
    const { migrateLastTab } = await cargar();
    migrateLastTab();
    expect(localStorage.getItem('areteLastTab')).toBe('secBody');
  });

  it('sin pestaña guardada no inventa ninguna', async () => {
    const { migrateLastTab } = await cargar();
    migrateLastTab();
    expect(localStorage.getItem('areteLastTab')).toBeNull();
  });

  it('es idempotente: migrar dos veces no cambia el modo ya elegido', async () => {
    localStorage.setItem('areteLastTab', 'secRunning');
    const { migrateLastTab, getTrainMode } = await cargar();
    migrateLastTab();
    localStorage.setItem('areteTrainMode', 'str');   // el usuario cambia a fuerza
    migrateLastTab();
    expect(getTrainMode()).toBe('str');
  });
});

describe('getTrainMode', () => {
  it('por defecto arranca en fuerza', async () => {
    const { getTrainMode } = await cargar();
    expect(getTrainMode()).toBe('str');
  });

  it('un valor corrupto cae a fuerza en vez de romper la sección', async () => {
    localStorage.setItem('areteTrainMode', 'basura');
    const { getTrainMode } = await cargar();
    expect(getTrainMode()).toBe('str');
  });
});
