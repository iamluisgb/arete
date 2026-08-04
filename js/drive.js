import { mergeDB } from './utils.js';
import { getAllRunRoutes, splitAndStoreRoutes } from './run-store.js';
import { connect, disconnect, isConnected, getAccessToken } from './drive-auth.js';

// Google Drive backup/restore sobre la REST API. La autorización (auth-code +
// PKCE, refresh silencioso vía Worker) vive en drive-auth.js.

const BACKUP_FILENAME = 'arete-backup.json';

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

async function findBackupFile() {
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime)',
    q: `name='${BACKUP_FILENAME}'`,
    pageSize: '1',
  });
  const res = await driveFetch(
    (token) => fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }),
    'Error al buscar backup'
  );
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

async function uploadFile(content, existingFileId) {
  const metadata = existingFileId
    ? { name: BACKUP_FILENAME }
    : { name: BACKUP_FILENAME, parents: ['appDataFolder'] };

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

/** Upload db to Google Drive appData folder (reconstructs full running logs from IDB) */
export async function backupToDrive(db) {
  // Reconstruct full running logs with heavy fields from IndexedDB
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
  const content = JSON.stringify(fullDB, null, 2);
  const existing = await findBackupFile();
  await uploadFile(content, existing ? existing.id : null);
  return { success: true, updated: !!existing };
}

/** Download and parse backup from Drive */
export async function restoreFromDrive() {
  const file = await findBackupFile();
  if (!file) return { success: false, reason: 'no_backup' };
  const content = await downloadFile(file.id);
  let data;
  try { data = JSON.parse(content); } catch { throw new Error('Backup corrupto (JSON inválido)'); }
  if (!data.workouts) throw new Error('Formato de backup no valido');
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

// === Auto-sync ===

const SYNC_TS_KEY = 'areteLastSync';

function getLocalSyncTime() {
  return parseInt(localStorage.getItem(SYNC_TS_KEY)) || 0;
}

function setLocalSyncTime() {
  localStorage.setItem(SYNC_TS_KEY, Date.now().toString());
}

let _syncing = false;
export function isSyncing() { return _syncing; }

/** Auto-backup to Drive without user interaction */
export async function silentBackup(db) {
  if (_syncing || !hasValidToken()) return;
  try {
    _syncing = true;
    await backupToDrive(db);
    setLocalSyncTime();
    setSyncStatus('ok');
  } catch (e) {
    reportSyncError(e, 'silentBackup');
  } finally {
    _syncing = false;
  }
}

/** Sync local db with Drive on app load (merge if remote is newer) */
export async function syncOnLoad(db, saveFn) {
  if (!hasValidToken()) return;
  try {
    _syncing = true;
    setSyncStatus('syncing');
    const file = await findBackupFile();
    if (!file) {
      _syncing = false;
      await silentBackup(db);
      return;
    }
    const driveTime = new Date(file.modifiedTime).getTime();
    const localTime = getLocalSyncTime();
    if (driveTime > localTime) {
      const content = await downloadFile(file.id);
      let data;
      try { data = JSON.parse(content); } catch { console.warn('syncOnLoad: corrupt JSON from Drive'); _syncing = false; return; }
      if (data.workouts) {
        const merged = mergeDB(db, data);
        Object.assign(db, merged);
        // Split heavy route data from synced running logs to IndexedDB
        if (db.runningLogs?.length) {
          db.runningLogs = await splitAndStoreRoutes(db.runningLogs);
        }
        saveFn(db);
        setLocalSyncTime();
        setSyncStatus('ok');
        _syncing = false;
        await silentBackup(db);
        location.reload();
        return;
      }
    }
    _syncing = false;
    await silentBackup(db);
  } catch (e) {
    reportSyncError(e, 'syncOnLoad');
    _syncing = false;
  }
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
