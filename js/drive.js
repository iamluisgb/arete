import { saveDBRaw } from './data.js';
import { getAllRunRoutes, splitAndStoreRoutes } from './run-store.js';
import { createSyncEngine, SYNC_FILE_FORMAT, SYNC_FORMAT_VERSION } from './sync/engine.js';
import { getQuironSyncHooks } from './sync/quiron.js';
import { connect, disconnect, isConnected, getAccessToken } from './drive-auth.js';

// Google Drive sync sobre la REST API. La autorización (auth-code + PKCE,
// refresh silencioso vía Worker) vive en drive-auth.js; el ciclo
// pull → merge → push vive en sync/engine.js. Este módulo es el transporte:
// lee y escribe arete-backup.json (la db) y arete-quiron.json (la conversación
// de Quirón, fichero propio desde U3) en appDataFolder, y expone los
// disparadores que usa app.js. Nada aquí sube a ciegas: toda escritura
// automática pasa por el motor, que antes fusiona lo que hay en Drive.

const BACKUP_FILENAME = 'arete-backup.json';
const QUIRON_FILENAME = 'arete-quiron.json';
const DEVICE_KEY = 'areteDeviceId';
const SYNC_TS_KEY = 'areteLastSync';

export { connect, isConnected };

// Para acciones nacidas de un clic: abre el popup de Google solo si todavía no
// hay permiso guardado. El sync automático NO llama aquí — nunca debe abrir un
// popup por su cuenta.
export async function connectIfNeeded() {
  if (!isConnected()) await connect();
}

/** Olvida el permiso de Drive: hay que volver a pasar por Google para reconectar. */
export function clearStoredToken() {
  disconnect();
}

/** ¿Se puede sincronizar sin molestar al usuario? */
export function hasValidToken() {
  return isConnected();
}

/** Id estable de este dispositivo: viaja en el wrapper del backup. */
function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function ensureAuth() {
  return getAccessToken();
}

// Llama a la API con un access token fresco. Un 401 con permiso permanente
// guardado no es "vuelve a loguearte": es un token que caducó antes de lo que
// creíamos (reloj desajustado, token revocado en otra sesión). Se renueva y se
// reintenta UNA vez; solo si el segundo intento vuelve 401 se pide reconectar.
async function driveFetch(request, context) {
  let token = await ensureAuth();
  let res = await request(token);
  if (res.status === 401) {
    token = await getAccessToken(true);
    res = await request(token);
  }
  if (res.ok) return res;
  if (res.status === 401) {
    disconnect();
    throw new Error('reconnect');
  }
  throw new Error(`${context}: ${res.status}`);
}

async function findDriveFile(filename) {
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime)',
    q: `name='${filename}'`,
    pageSize: '1',
  });
  const res = await driveFetch(
    (token) => fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }),
    'Error al buscar backup'
  );
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

async function uploadDriveFile(filename, content, existingFileId) {
  const metadata = existingFileId
    ? { name: filename }
    : { name: filename, parents: ['appDataFolder'] };

  const boundary = '---arete_boundary';
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await driveFetch((token) => fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  }), 'Error al subir backup');
  return res.json();
}

async function findBackupFile() {
  return findDriveFile(BACKUP_FILENAME);
}

async function uploadFile(content, existingFileId) {
  return uploadDriveFile(BACKUP_FILENAME, content, existingFileId);
}

// Quirón transport (U3): same primitives as the db transport, own file. The
// conversation has no legacy format — whatever is not our wrapper is garbage
// and the engine rejects it without overwriting.
function createQuironTransport() {
  return {
    async pull() {
      const file = await findDriveFile(QUIRON_FILENAME);
      if (!file) return null;
      const content = await downloadFile(file.id);
      let data;
      try { data = JSON.parse(content); } catch { throw new Error('Fichero de Quirón corrupto (JSON inválido)'); }
      return { rev: file.modifiedTime, data };
    },
    async readMeta() {
      const file = await findDriveFile(QUIRON_FILENAME);
      return file ? { rev: file.modifiedTime } : null;
    },
    async push(wrapper) {
      const existing = await findDriveFile(QUIRON_FILENAME);
      const res = await uploadDriveFile(QUIRON_FILENAME, JSON.stringify(wrapper), existing ? existing.id : null);
      return { rev: res.modifiedTime || new Date().toISOString() };
    },
  };
}

async function downloadFile(fileId) {
  const res = await driveFetch(
    (token) => fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    ),
    'Error al descargar backup'
  );
  return res.text();
}

// === Manual backup / restore (user-initiated, Ajustes) ===

/** Upload db to Google Drive appData folder (manual backup, with full routes from IDB) */
export async function backupToDrive(db) {
  // Reconstruct full running logs with heavy fields from IndexedDB: la copia
  // manual es el backup de verdad y lleva las rutas GPS.
  let fullDB = db;
  if (db.runningLogs?.length) {
    const routes = await getAllRunRoutes();
    if (routes.size > 0) {
      const fullLogs = db.runningLogs.map(l => {
        const heavy = routes.get(l.id);
        return heavy ? { ...l, ...heavy } : l;
      });
      fullDB = { ...db, runningLogs: fullLogs };
    }
  }
  const content = JSON.stringify({
    format: SYNC_FILE_FORMAT,
    formatVersion: SYNC_FORMAT_VERSION,
    savedAt: Date.now(),
    device: deviceId(),
    db: fullDB,
  });
  const existing = await findBackupFile();
  await uploadFile(content, existing ? existing.id : null);
  return { success: true, updated: !!existing };
}

/** Download and parse backup from Drive (v2 wrapper or legacy v1 payload) */
export async function restoreFromDrive() {
  const file = await findBackupFile();
  if (!file) return { success: false, reason: 'no_backup' };
  const content = await downloadFile(file.id);
  let raw;
  try { raw = JSON.parse(content); } catch { throw new Error('Backup corrupto (JSON inválido)'); }
  const data = raw && raw.format === SYNC_FILE_FORMAT ? raw.db : raw;
  if (!data || !data.workouts) throw new Error('Formato de backup no valido');
  return { success: true, data, modifiedTime: file.modifiedTime };
}

// === Revision history (recovery) ===

/** List all Drive file revisions for version recovery */
export async function listRevisions() {
  const file = await findBackupFile();
  if (!file) return { success: false, reason: 'no_backup' };
  const res = await driveFetch(
    (token) => fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}/revisions?fields=revisions(id,modifiedTime,size)`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    ),
    'Error al listar revisiones'
  );
  const data = await res.json();
  return { success: true, fileId: file.id, revisions: data.revisions || [] };
}

/** Download and parse a specific Drive file revision */
export async function downloadRevision(fileId, revisionId) {
  const res = await driveFetch(
    (token) => fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/revisions/${revisionId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    ),
    'Error al descargar revisión'
  );
  const content = await res.text();
  try { return JSON.parse(content); } catch { throw new Error('Revisión corrupta (JSON inválido)'); }
}

// === Auto-sync (sync v2) ===

// Transporte real sobre la Drive REST API. La versión (rev) es el modifiedTime
// del fichero: cambia en cada escritura, que es justo lo que el motor necesita
// para detectar que otro dispositivo escribió entre su pull y su push.
function createDriveTransport() {
  return {
    async pull() {
      const file = await findBackupFile();
      if (!file) return null;
      const content = await downloadFile(file.id);
      let data;
      try { data = JSON.parse(content); } catch { throw new Error('Backup corrupto (JSON inválido)'); }
      return { rev: file.modifiedTime, data };
    },
    async readMeta() {
      const file = await findBackupFile();
      return file ? { rev: file.modifiedTime } : null;
    },
    async push(wrapper) {
      const existing = await findBackupFile();
      const res = await uploadFile(JSON.stringify(wrapper), existing ? existing.id : null);
      return { rev: res.modifiedTime || new Date().toISOString() };
    },
  };
}

let engine = null;
let engineDb = null;

function ensureEngine(db) {
  if (engine && engineDb === db) return engine;
  engine = createSyncEngine({
    transport: createDriveTransport(),
    getDb: () => db,
    saveRaw: saveDBRaw,
    splitRoutes: splitAndStoreRoutes,
    device: deviceId(),
    // Quirón (U3): the hooks are read at cycle time, not at engine creation —
    // the chat UI may register them after the first sync of this session.
    quiron: {
      transport: createQuironTransport(),
      get: () => { const h = getQuironSyncHooks(); return h ? h.get() : undefined; },
      save: (data) => { const h = getQuironSyncHooks(); if (h) h.save(data); },
    },
    onStatus: (s) => {
      if (s === 'ok') localStorage.setItem(SYNC_TS_KEY, String(Date.now()));
      setSyncStatus(s);
    },
    onError: (e) => reportSyncError(e, 'sync'),
  });
  engineDb = db;
  return engine;
}

/**
 * Run one full sync cycle (pull → merge → push) for the app db.
 * Resolves 'ok' | 'error' | 'locked' | 'busy' | 'off'.
 */
export async function syncNow(db) {
  if (!hasValidToken()) return 'off';
  return ensureEngine(db).runCycle();
}

export function isSyncing() {
  return engine ? engine.isRunning() : false;
}

/** Diagnosis of the last cycles (degraded badge is a follow-up). */
export function getSyncDiag() {
  return engine ? engine.getDiag() : null;
}

let _syncStatusCb = null;
/** @param {Function} cb - Called with 'syncing' | 'ok' | 'error' */
export function onSyncStatus(cb) { _syncStatusCb = cb; }
function setSyncStatus(status) { if (_syncStatusCb) _syncStatusCb(status); }

let _reconnectCb = null;
/** Called when Google revoked the permission and the user must connect again. */
export function onReconnectNeeded(cb) { _reconnectCb = cb; }
// Un fallo de red es transitorio y no merece molestar a nadie; perder el
// permiso es lo único que el usuario tiene que arreglar a mano.
function reportSyncError(e, where) {
  console.warn(`${where} failed:`, e);
  setSyncStatus('error');
  if (e && e.message === 'reconnect' && _reconnectCb) _reconnectCb();
}
