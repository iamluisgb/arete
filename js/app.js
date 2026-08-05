import { loadDB, saveDB, setOnSave, setOnQuotaError, setOnExternalChange, exportData, importData, clearAllData } from './data.js';
import { splitAndStoreRoutes } from './run-store.js';
import { loadPrograms, setActiveProgram, getActiveProgram, getPrograms, getProgramList, isBuiltinProgram, validateProgram, importCustomProgram, deleteCustomProgram, getCustomPrograms } from './programs.js';
import { formatPace, parseRunDuration, formatRunDuration, getPaceZones, getHRZones, ZONE_COLORS } from './ui/running-helpers.js';
import { today, mergeDB, esc, trapFocus } from './utils.js';
import { DEBOUNCE_BACKUP_MS, SYNC_INDICATOR_MS, DEFAULT_HEIGHT, DEFAULT_AGE, LOCALE, REVISION_PREVIEW_LIMIT, APP_VERSION } from './constants.js';
import { initTimer } from './ui/timer.js';
import { initNav, switchTab, switchStrTab, switchTrainMode, updatePhaseUI, updatePhaseDisplay, refreshActiveSection, restoreLastTab } from './ui/nav.js';
import { initTraining, populateSessions, startEdit, cancelEdit, requestStartSession, getLiveDraft } from './ui/training.js';
import { isRunnerOpen } from './ui/set-runner.js';
import { initCalendar } from './ui/calendar.js';
import { initHistory } from './ui/history.js';
import { initBody } from './ui/body.js';
import { connectIfNeeded, isConnected, backupToDrive, silentBackup, syncOnLoad, onSyncStatus, onReconnectNeeded, isSyncing, clearStoredToken } from './drive.js';
import { initDriveUI } from './ui/drive-ui.js';
import { initToast, toast } from './ui/toast.js';
import { initRunning } from './ui/running.js';
import { renderDashboard } from './ui/dashboard.js';
import { initProfile } from './ui/profile.js';
import { initQuiron } from './ui/quiron.js';
import { initShortcuts, toggleShortcutSheet } from './ui/shortcuts.js';

const db = loadDB();
const AUTOSYNC_KEY = 'areteAutoSync';
const THEME_KEY = 'areteTheme';

// --- Theme ---
function applyTheme(theme) {
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme:dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark ? '#131313' : '#f4f2f0';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  applyTheme(saved);
  // Listen for system changes when in auto mode
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => {
    if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') applyTheme('auto');
  });
  // Selector buttons
  document.querySelectorAll('#themeOptions .theme-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === saved);
    btn.addEventListener('click', () => {
      const t = btn.dataset.theme;
      localStorage.setItem(THEME_KEY, t);
      applyTheme(t);
      document.querySelectorAll('#themeOptions .theme-opt').forEach(b => b.classList.toggle('active', b.dataset.theme === t));
    });
  });
}

// Apply theme immediately to prevent flash
applyTheme(localStorage.getItem(THEME_KEY) || 'auto');

function debounce(fn, ms) {
  let t, lastArgs;
  const d = (...args) => { clearTimeout(t); lastArgs = args; t = setTimeout(() => { lastArgs = null; fn(...args); }, ms); };
  d.flush = () => { if (lastArgs) { clearTimeout(t); const a = lastArgs; lastArgs = null; fn(...a); } };
  return d;
}

function isAutoSync() { return localStorage.getItem(AUTOSYNC_KEY) === '1'; }

function updateSyncUI() {
  const btn = document.getElementById('autoSyncBtn');
  const desc = document.getElementById('autoSyncDesc');
  if (isAutoSync()) {
    btn.classList.add('active');
    // Sin permiso guardado la sincronización está activada pero no sincroniza:
    // decirlo evita el silencio de creer que hay copia y no haberla.
    desc.textContent = isConnected() ? 'Activada' : 'Activada — falta reconectar con Google';
  } else {
    btn.classList.remove('active');
    desc.textContent = 'Desactivada';
  }
}

function renderCustomProgramsList() {
  const list = document.getElementById('customProgramsList');
  const customs = getCustomPrograms(db);
  if (customs.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = customs.map(p => {
    const name = esc(p._meta?.name || 'Sin nombre');
    const desc = esc(p._meta?.desc || '');
    return `<div class="custom-prog-item">
      <div style="flex:1"><div class="custom-prog-name">${name}</div>${desc ? `<div class="custom-prog-desc">${desc}</div>` : ''}</div>
      <span class="custom-prog-badge">Custom</span>
      <button class="custom-prog-del" data-prog-id="${esc(p._customId)}">Eliminar</button>
    </div>`;
  }).join('');
}

function renderProgramSelector() {
  const progList = getProgramList();
  const active = db.program || 'arete';
  const activeProg = progList.find(p => p.id === active);
  document.getElementById('activeProgramName').textContent = activeProg?.name || active;

  const modal = document.getElementById('programModal');
  const options = document.getElementById('programOptions');
  options.innerHTML = progList.map(p => {
    const isCustom = !isBuiltinProgram(p.id);
    const badge = isCustom ? '<span class="custom-prog-badge" style="margin-left:6px">Custom</span>' : '';
    return `<div class="prog-modal-item${p.id === active ? ' active' : ''}" data-prog="${esc(p.id)}">
      <div style="flex:1"><div class="prog-modal-name">${esc(p.name)}${badge}</div><div class="prog-modal-desc">${esc(p.desc)}</div></div>
    </div>`;
  }).join('');
}

// === INIT ===
async function init() {
  initToast();
  initTheme();

  // Migrate custom programs from old localStorage key to db
  const oldCustom = localStorage.getItem('customPrograms');
  if (oldCustom) {
    try {
      const programs = JSON.parse(oldCustom);
      if (Array.isArray(programs) && programs.length > 0) {
        db.customPrograms = programs;
        saveDB(db);
      }
    } catch { /* ignore corrupt data */ }
    localStorage.removeItem('customPrograms');
  }

  // One-shot migration: move heavy route data from localStorage to IndexedDB
  if (db.runningLogs?.some(l => l.route?.coords)) {
    db.runningLogs = await splitAndStoreRoutes(db.runningLogs);
    saveDB(db);
  }

  await loadPrograms(db);

  // Set active program from saved state + render selector
  setActiveProgram(db.program || 'arete');
  renderProgramSelector();

  document.getElementById('trainDate').value = today();
  document.getElementById('bodyDate').value = today();
  updatePhaseUI(db);
  document.getElementById('calcHeight').value = db.settings?.height || DEFAULT_HEIGHT;
  document.getElementById('calcAge').value = db.settings?.age || DEFAULT_AGE;

  // Race 5K input for personalized pace zones
  const $race5k = document.getElementById('settingsRace5k');
  const $zonesPreview = document.getElementById('settingsZonesPreview');
  if (db.settings.race5k > 0) $race5k.value = formatRunDuration(db.settings.race5k);
  function updateZonesPreview() {
    const sec = parseRunDuration($race5k.value);
    if (sec > 0) {
      db.settings.race5k = sec;
      saveDB(db);
      const zones = getPaceZones(db);
      $zonesPreview.innerHTML = zones.map(z => {
        const color = ZONE_COLORS[z.zone];
        const pace = z.max === Infinity ? '∞' : formatPace(z.max);
        return `<span class="zp-chip" style="background:${color}">${z.zone} &lt;${pace}</span>`;
      }).join('');
    } else {
      db.settings.race5k = 0;
      saveDB(db);
      $zonesPreview.innerHTML = '<span class="zp-hint">Sin marca → zonas por defecto</span>';
    }
  }
  $race5k.addEventListener('input', updateZonesPreview);
  updateZonesPreview();

  // Max HR input for HR zones
  const $maxHR = document.getElementById('settingsMaxHR');
  const $hrZonesPreview = document.getElementById('settingsHRZonesPreview');
  const effectiveMaxHR = () => db.settings.maxHR || (db.settings.age ? 220 - db.settings.age : 190);
  if (db.settings.maxHR > 0) $maxHR.value = db.settings.maxHR;
  function updateHRZonesPreview() {
    const val = parseInt($maxHR.value) || 0;
    db.settings.maxHR = val;
    saveDB(db);
    const zones = getHRZones(db);
    const max = effectiveMaxHR();
    $hrZonesPreview.innerHTML = zones.map(z => {
      const color = ZONE_COLORS[z.zone];
      return `<span class="zp-chip" style="background:${color}">${z.zone} ${z.min}-${z.max}</span>`;
    }).join('') + `<span class="zp-hint">FC max: ${max} bpm</span>`;
  }
  $maxHR.addEventListener('change', updateHRZonesPreview);
  updateHRZonesPreview();

  // Onboarding for first-time users
  if (!localStorage.getItem('areteOnboarded')) {
    const $ob = document.getElementById('onboarding');
    const $btn = document.getElementById('onboardingBtn');
    let step = 0;
    $ob.classList.add('visible');
    $btn.addEventListener('click', () => {
      step++;
      if (step >= 3) {
        $ob.classList.remove('visible');
        localStorage.setItem('areteOnboarded', '1');
        return;
      }
      $ob.querySelectorAll('.onboarding-step').forEach((s, i) => s.classList.toggle('active', i === step));
      $ob.querySelectorAll('.onboarding-dot').forEach((d, i) => d.classList.toggle('active', i === step));
      if (step === 2) $btn.textContent = 'Empezar';
    });
  }

  document.getElementById('timerBar').classList.add('active');
  initTimer();
  renderDashboard(db);
  populateSessions(db);

  // Dashboard CTAs
  const goEntrenar = (mode) => {
    const btn = document.querySelector('nav button[data-sec="secTrain"]');
    if (!btn) return;
    switchTrainMode(mode, db);
    switchTab(btn, db);
  };
  document.getElementById('dashLevel')?.addEventListener('click', () => {
    const btn = document.querySelector('nav button[data-sec="secProfile"]');
    if (btn) switchTab(btn, db);
  });
  document.getElementById('dashStartBtn')?.addEventListener('click', () => goEntrenar('str'));
  document.getElementById('dashStartRunBtn')?.addEventListener('click', () => goEntrenar('run'));
  document.getElementById('appVersion').textContent = `Areté v${APP_VERSION}`;
  bindEvents();

  // Sync indicator
  const syncEl = document.getElementById('syncIndicator');
  onSyncStatus(status => {
    syncEl.className = 'sync-indicator visible ' + status;
    syncEl.textContent = status === 'syncing' ? '' : status === 'ok' ? '✓' : '✗';
    if (status !== 'syncing') setTimeout(() => syncEl.classList.remove('visible'), SYNC_INDICATOR_MS);
  });

  // Auto-sync: debounced backup on every saveDB
  const debouncedBackup = debounce((d) => silentBackup(d), DEBOUNCE_BACKUP_MS);
  setOnSave((d) => { if (isAutoSync() && !isSyncing()) debouncedBackup(d); });
  setOnQuotaError(() => {
    toast('Almacenamiento lleno. Exporta tus datos para no perder información.', 'error');
  });
  setOnExternalChange(() => {
    toast('Datos actualizados en otra pestaña. Recargando...', 'info');
    setTimeout(() => location.reload(), 1500);
  });

  updateSyncUI();

  // El permiso de Drive vive en localStorage y se renueva solo: no hay librería
  // externa que esperar, se puede sincronizar desde el primer instante.
  onReconnectNeeded(() => {
    updateSyncUI();
    toast('Google retiró el permiso de Drive. Vuelve a activar la sincronización en Ajustes.', 'error');
  });
  if (isAutoSync()) syncOnLoad(db, saveDB);

  // Flush pending backup when leaving, re-sync when returning
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isAutoSync()) {
      debouncedBackup.flush();
    } else if (document.visibilityState === 'visible' && isAutoSync() && !isSyncing()) {
      syncOnLoad(db, saveDB);
    }
  });

  // Offline indicator
  const offlineBanner = document.getElementById('offlineBanner');
  const updateOnline = () => { offlineBanner.classList.toggle('visible', !navigator.onLine); };
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();
}

// === EVENT BINDING ===
function bindEvents() {
  // Delegate to UI modules
  initNav(db);
  initTraining(db, { onCancelEdit: () => cancelEdit(db) });
  initCalendar(db);
  initHistory(db, {
    onEdit: (workout) => {
      const trainBtn = document.querySelector('nav button[data-sec="secTrain"]');
      if (trainBtn) switchTab(trainBtn, db);
      switchStrTab('strTrain', db);
      startEdit(workout, db);
    }
  });
  initBody(db);
  initRunning(db);
  initProfile(db);
  initShortcuts(db, { switchTab });
  document.getElementById('shortcutsBtn')?.addEventListener('click', toggleShortcutSheet);
  // Quirón puede crear/editar planes: al aplicar o deshacer, refrescar la UI que
  // depende del programa activo (selector, fase, sesiones, sección visible, lista custom).
  initQuiron(db, {
    onProgramsChanged: () => {
      updatePhaseUI(db);
      renderProgramSelector();
      renderCustomProgramsList();
      // Repoblar el desplegable re-renderiza el formulario y cierra el runner. Con
      // sesiones sueltas el caso normal es pedirle algo a Quirón EN MITAD del
      // entreno: si hay runner abierto o borrador vivo, no se toca lo que hay.
      if (!isRunnerOpen() && !getLiveDraft(db)) {
        populateSessions(db);
        refreshActiveSection(db);
      }
    },
    // Empezar una sesión propuesta: misma puerta que el botón del Plan (avisa si
    // hay un entreno a medias) y salto a Fuerza → Actividad.
    onStartSession: (ref) => {
      const trainBtn = document.querySelector('nav button[data-sec="secTrain"]');
      requestStartSession(db, ref, null, {
        onStarted: () => {
          if (trainBtn) switchTab(trainBtn, db);
          switchStrTab('strTrain', db);
        },
      });
    },
  });
  restoreLastTab(db);

  // Program selector modal
  document.getElementById('programContext').addEventListener('click', () => {
    renderProgramSelector();
    document.getElementById('programModal').classList.add('open');
  });
  document.getElementById('programModalClose').addEventListener('click', () => {
    document.getElementById('programModal').classList.remove('open');
  });
  document.getElementById('programModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('programModal'))
      document.getElementById('programModal').classList.remove('open');
  });
  document.getElementById('programOptions').addEventListener('click', (e) => {
    const item = e.target.closest('.prog-modal-item');
    if (!item) return;
    const prog = item.dataset.prog;
    if (prog === getActiveProgram()) { document.getElementById('programModal').classList.remove('open'); return; }
    setActiveProgram(prog);
    db.program = prog;
    db.phase = parseInt(Object.keys(getPrograms())[0]) || 1;
    saveDB(db);
    updatePhaseUI(db);
    populateSessions(db);
    renderProgramSelector();
    document.getElementById('historyFilter').value = '';
    refreshActiveSection(db);
    document.getElementById('programModal').classList.remove('open');
  });

  // Auto-sync toggle
  document.getElementById('autoSyncBtn').addEventListener('click', async () => {
    if (isAutoSync()) {
      localStorage.removeItem(AUTOSYNC_KEY);
      clearStoredToken();
      updateSyncUI();
      document.getElementById('driveStatus').textContent = '';
      return;
    }
    const btn = document.getElementById('autoSyncBtn');
    const desc = document.getElementById('autoSyncDesc');
    const status = document.getElementById('driveStatus');
    btn.disabled = true;
    desc.textContent = 'Activando...';
    try {
      status.textContent = 'Conectando con Google...';
      status.className = 'drive-status';
      await connectIfNeeded();
      await backupToDrive(db);
      localStorage.setItem(AUTOSYNC_KEY, '1');
      updateSyncUI();
      status.textContent = 'Sincronización activada';
      status.className = 'drive-status drive-success';
    } catch (e) {
      status.textContent = e.message === 'popup_closed_by_user'
        ? 'Inicio de sesión cancelado'
        : `Error: ${e.message}`;
      status.className = 'drive-status drive-error';
      desc.textContent = 'Desactivada';
    } finally {
      btn.disabled = false;
    }
  });

  // Google Drive UI
  initDriveUI(db);

  // Custom programs
  renderCustomProgramsList();
  document.getElementById('importProgramBtn').addEventListener('click', () => document.getElementById('importProgramFile').click());
  document.getElementById('importProgramFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const err = validateProgram(data);
        if (err) { alert('Plan no válido: ' + err); return; }
        importCustomProgram(db, data);
        renderCustomProgramsList();
        renderProgramSelector();
        toast('Plan importado: ' + (data._meta?.name || 'Sin nombre'));
      } catch { alert('Error al leer el archivo JSON'); }
    };
    r.readAsText(f);
    e.target.value = '';
  });
  document.getElementById('customProgramsList').addEventListener('click', (e) => {
    const btn = e.target.closest('.custom-prog-del');
    if (!btn) return;
    const id = btn.dataset.progId;
    if (!confirm('¿Eliminar este plan?')) return;
    deleteCustomProgram(db, id);
    if (db.program === id) {
      db.program = 'arete';
      setActiveProgram('arete');
      db.phase = parseInt(Object.keys(getPrograms())[0]) || 1;
      saveDB(db);
      updatePhaseUI(db);
      populateSessions(db);
    }
    renderCustomProgramsList();
    renderProgramSelector();
    toast('Plan eliminado', 'info');
  });

  // Settings section
  document.getElementById('exportBtn').addEventListener('click', () => exportData(db));
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (e) => importData(e, db));
  document.querySelector('#secSettings .sc-row-danger').addEventListener('click', () => clearAllData());
}

init();

// Register Service Worker + prompt update
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newSW);
        }
      });
    });
  }).catch(e => console.log('SW failed', e));

  // Reload when new SW takes over
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; location.reload(); }
  });
}

// ── Foco y Escape en diálogos ────────────────────────────
// El trap anterior solo observaba los .modal-overlay presentes al cargar, así
// que los overlays creados en runtime —el .set-runner, que sí declara
// aria-modal— nunca lo recibían: con el runner abierto, un Tab llevaba el foco
// a los botones de la pantalla de detrás. Ahora se observa el árbol entero y el
// criterio es el rol, no la clase: cualquier [role=dialog][aria-modal=true] que
// se vuelva visible queda encerrado, incluidos los que aún no existen.
const DIALOG_SEL = '[role="dialog"][aria-modal="true"]';
const _focusTraps = new Map();

// position:fixed deja offsetParent a null, así que la visibilidad se mide con
// los rects: cubre display:none, visibility:hidden y el runner sin .up.
const isDialogVisible = el => el.getClientRects().length > 0 &&
  getComputedStyle(el).visibility !== 'hidden';

function syncDialogTraps() {
  for (const el of document.querySelectorAll(DIALOG_SEL)) {
    const open = isDialogVisible(el);
    if (open && !_focusTraps.has(el)) _focusTraps.set(el, trapFocus(el));
    else if (!open && _focusTraps.has(el)) { _focusTraps.get(el)(); _focusTraps.delete(el); }
  }
  for (const [el, cleanup] of _focusTraps) {
    if (!el.isConnected) { cleanup(); _focusTraps.delete(el); }
  }
}

// Coalescido a un frame: observar el árbol entero significa recibir también
// cada repintado de listas y cada clase que toca el timer.
let _syncPending = false;
const _dialogObserver = new MutationObserver(() => {
  if (_syncPending) return;
  _syncPending = true;
  requestAnimationFrame(() => { _syncPending = false; syncDialogTraps(); });
});
_dialogObserver.observe(document.body, {
  childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'],
});
syncDialogTraps();

// Escape cierra el diálogo de encima. Un único handler en document en lugar de
// uno por overlay montado sobre un nodo que puede no tener nunca el foco.
// No se duplica la lógica de cierre de cada modal: se dispara su propia ruta —
// primero el clic en el fondo, que es como se cierran hoy, y si ese modal no la
// tiene, su botón de cerrar. Así el detailModal sigue escondiendo su btn-bar.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const open = [...document.querySelectorAll('.modal-overlay.open')].filter(isDialogVisible);
  const el = open[open.length - 1];
  if (!el) return;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (el.classList.contains('open')) {
    el.querySelector('[data-close], .modal-close, [id$="CloseBtn"]')?.click();
  }
});

function showUpdateBanner(worker) {
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = 'Nueva versión disponible <button>Actualizar</button>';
  banner.querySelector('button').addEventListener('click', () => {
    worker.postMessage('skipWaiting');
    banner.remove();
  });
  document.body.appendChild(banner);
}
