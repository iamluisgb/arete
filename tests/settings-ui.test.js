// Ajustes dejó de ser una lista plana para ser un índice con subpáginas. Lo que
// se comprueba aquí es el contrato de esa pantalla, y se comprueba contra el
// app.html de verdad, no contra un DOM de mentira: si alguien mueve una fila de
// subpágina o le cambia el id, el fallo sale aquí y no en producción.
//
// Los dos riesgos que cubre:
//  1. El índice miente sobre el estado (dice "Sin configurar" con clave puesta).
//  2. Una subpágina pierde un id y el JS que lo tenía cogido deja de encontrarlo.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

// Bajo el entorno jsdom, import.meta.url no es un file:// resoluble: la raíz del
// repo es el cwd con el que vitest arranca.
const HTML = readFileSync(resolve(process.cwd(), 'app.html'), 'utf-8');

/** Inyecta el #secSettings real de app.html, más el #strProgress donde se
 *  mudaron los 1RM. Nada de plantillas paralelas: el fichero es la fuente. */
function setupDOM() {
  // jsdom declara window.scrollTo pero lanza al llamarlo; abrir subpágina lo usa.
  window.scrollTo = () => {};
  const doc = new JSDOM(HTML).window.document;
  const settings = doc.getElementById('secSettings');
  const progress = doc.getElementById('strProgress');
  document.body.innerHTML = '<nav><button data-sec="secSettings"></button></nav>';
  document.body.appendChild(settings.cloneNode(true));
  document.body.appendChild(progress.cloneNode(true));
  document.getElementById('secSettings').classList.add('active');
}

const freshDB = (over = {}) => ({
  workouts: [], bodyLogs: [], runningLogs: [], domainTests: [],
  customSessions: [], customPrograms: [], deletedIds: [],
  settings: {}, program: 'arete', phase: 1, ...over,
});

async function cargar() {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  return import('../js/ui/settings.js');
}

const idsDe = (sel) => [...document.querySelectorAll(`${sel} [id]`)].map(e => e.id);

describe('Ajustes: índice y subpáginas', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('arranca en el índice, con las subpáginas ocultas', async () => {
    const { initSettingsNav } = await cargar();
    initSettingsNav(freshDB());
    expect(document.getElementById('setIndex').classList.contains('active')).toBe(true);
    for (const id of ['setZones', 'setPlans', 'setQuiron', 'setBackup']) {
      expect(document.getElementById(id).classList.contains('active')).toBe(false);
    }
  });

  it('una fila del índice abre su subpágina y solo la suya', async () => {
    const { initSettingsNav } = await cargar();
    initSettingsNav(freshDB());
    document.querySelector('[data-setpage="setBackup"]').click();
    const activas = [...document.querySelectorAll('.set-page.active')].map(p => p.id);
    expect(activas).toEqual(['setBackup']);
  });

  it('volver desde una subpágina devuelve al índice', async () => {
    const { initSettingsNav } = await cargar();
    initSettingsNav(freshDB());
    document.querySelector('[data-setpage="setZones"]').click();
    document.querySelector('#setZones .set-back').click();
    expect(document.getElementById('setIndex').classList.contains('active')).toBe(true);
  });

  it('Escape sale de la subpágina', async () => {
    const { initSettingsNav } = await cargar();
    initSettingsNav(freshDB());
    document.querySelector('[data-setpage="setQuiron"]').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('setIndex').classList.contains('active')).toBe(true);
  });

  it('Escape no roba el evento cuando hay un modal abierto encima', async () => {
    const { initSettingsNav } = await cargar();
    initSettingsNav(freshDB());
    document.querySelector('[data-setpage="setQuiron"]').click();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    document.body.appendChild(modal);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('setQuiron').classList.contains('active')).toBe(true);
  });
});

describe('Ajustes: el índice dice el estado de cada fila', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('sin nada configurado, cada fila lo dice y se marca como ausente', async () => {
    const { renderSettingsIndex } = await cargar();
    renderSettingsIndex(freshDB());
    const zonas = document.getElementById('setZonesStatus');
    expect(zonas.textContent).toBe('Por defecto');
    expect(zonas.classList.contains('listrow-status--off')).toBe(true);
    expect(document.getElementById('setQuironStatus').textContent).toBe('Sin configurar');
    expect(document.getElementById('setPlansStatus').textContent).toBe('Solo los incluidos');
    expect(document.getElementById('setBackupStatus').textContent).toBe('Sin copia');
  });

  it('con marca y FC, la fila de zonas enseña las dos', async () => {
    const { renderSettingsIndex } = await cargar();
    renderSettingsIndex(freshDB({ settings: { race5k: 1360, maxHR: 188 } }));
    const zonas = document.getElementById('setZonesStatus');
    expect(zonas.textContent).toBe('5K 22:40 · FC máx 188');
    expect(zonas.classList.contains('listrow-status--off')).toBe(false);
  });

  it('con solo una de las dos, no inventa la que falta', async () => {
    const { renderSettingsIndex } = await cargar();
    renderSettingsIndex(freshDB({ settings: { race5k: 1360 } }));
    expect(document.getElementById('setZonesStatus').textContent).toBe('5K 22:40');
  });

  it('cuenta los planes propios', async () => {
    const { renderSettingsIndex } = await cargar();
    renderSettingsIndex(freshDB({ customPrograms: [{ _customId: 'a' }, { _customId: 'b' }] }));
    expect(document.getElementById('setPlansStatus').textContent).toBe('2 propios');
  });

  it('con clave puesta, Quirón enseña proveedor y modelo', async () => {
    const { renderSettingsIndex } = await cargar();
    localStorage.setItem('areteAiKey', 'sk-loquesea');
    renderSettingsIndex(freshDB());
    const txt = document.getElementById('setQuironStatus').textContent;
    expect(txt).not.toBe('Sin configurar');
    expect(txt).toContain('·');
  });

  it('auto-sync activado sin permiso vivo avisa de que falta reconectar', async () => {
    const { renderSettingsIndex } = await cargar();
    localStorage.setItem('areteAutoSync', '1');   // sin refresh_token: no conectado
    renderSettingsIndex(freshDB());
    const copia = document.getElementById('setBackupStatus');
    expect(copia.textContent).toBe('Falta reconectar');
    expect(copia.classList.contains('listrow-status--off')).toBe(true);
  });
});

describe('Ajustes: los ids que el resto del JS tiene cogidos siguen ahí', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  // La reorganización movió estos elementos de sitio. Moverlos está bien;
  // perderlos rompe app.js, drive-ui.js o quiron.js en silencio.
  it('cada subpágina conserva sus controles', async () => {
    await cargar();
    expect(idsDe('#setZones')).toEqual(expect.arrayContaining(
      ['settingsRace5k', 'settingsZonesPreview', 'settingsMaxHR', 'settingsHRZonesPreview']));
    expect(idsDe('#setPlans')).toEqual(expect.arrayContaining(
      ['customProgramsList', 'importProgramBtn', 'importProgramFile']));
    expect(idsDe('#setQuiron')).toEqual(expect.arrayContaining(
      ['quironProvider', 'quironBaseUrl', 'quironKey', 'quironModel',
       'quironModelList', 'quironVisionModel', 'quironTestBtn', 'quironAiStatus']));
    expect(idsDe('#setBackup')).toEqual(expect.arrayContaining(
      ['autoSyncBtn', 'autoSyncDesc', 'driveStatus', 'driveBackupBtn',
       'driveRestoreBtn', 'driveRevisionsBtn', 'exportBtn', 'importBtn', 'importFile']));
    expect(idsDe('#setIndex')).toEqual(expect.arrayContaining(
      ['themeOptions', 'clearDataBtn', 'shortcutsBtn', 'appVersion']));
  });

  it('los 1RM viven en Progreso, no en Ajustes', async () => {
    await cargar();
    expect(document.querySelector('#strProgress #rmPanel')).not.toBeNull();
    expect(document.querySelector('#secSettings #rmPanel')).toBeNull();
  });

  it('Base URL y el modelo de visión quedan detrás de "Opciones avanzadas"', async () => {
    await cargar();
    for (const id of ['quironBaseUrl', 'quironVisionModel']) {
      expect(document.getElementById(id).closest('details.set-advanced')).not.toBeNull();
    }
    // La clave y el modelo, no: son los dos campos que sí hay que rellenar.
    for (const id of ['quironKey', 'quironModel']) {
      expect(document.getElementById(id).closest('details.set-advanced')).toBeNull();
    }
    expect(document.querySelector('details.set-advanced').open).toBe(false);
  });
});
