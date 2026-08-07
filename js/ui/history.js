import { saveDB, markDeleted } from '../data.js';
import { ROMAN, MESES } from '../constants.js';
import { formatDate, esc, confirmDanger } from '../utils.js';
import { getActiveProgram, getProgramById } from '../programs.js';
import { renderCalendar } from './calendar.js';
import { toast } from './toast.js';
import { openShareEditor } from './share-editor.js';
// 15 y no 50. Con 50, tres meses de plan (39 sesiones) caben enteros y la lista
// mide 7.400px: diez pantallas de scroll donde nada dice que has cruzado de
// agosto a julio. El histórico completo lo quiere una minoría de visitas; el
// resto viene a ver las dos últimas semanas, que son ~6 sesiones. 15 cubre un
// mes largo y deja el corte a un clic.
const PAGE_SIZE = 15;
let detailWorkoutId = null;
let historyPage = 0;
let _currentDb = null;
let _lastWorkoutCount = -1;

function planName(id) {
  const pid = id || 'arete';
  return getProgramById(pid)?._meta?.name || pid;
}

/** Una fila por ejercicio, nombre a la izquierda y series a la derecha.
 *  El resumen corrido —"Sentadilla: 100×5, 100×5 · Press: 77.5×2, …"— obligaba a
 *  leer el párrafo entero para encontrar un levantamiento, y hacía imposible
 *  comparar dos sesiones: los mismos ejercicios caían en columnas distintas
 *  según lo largo que fuera el nombre del anterior. */
function summaryRows(w) {
  const rows = w.exercises.map(e => {
    const loaded = e.sets.some(s => s.kg);
    if (loaded) {
      return { name: e.name, detail: e.sets.map(s => `${esc(s.kg) || '—'}×${esc(s.reps) || '—'}`).join(' · ') };
    }
    if (e.sets[0]?.reps) return { name: e.name, detail: esc(e.sets[0].reps) };
    return null;
  }).filter(Boolean);
  if (!rows.length) return '';
  return `<div class="hi-rows">${rows.map(r =>
    `<div class="hi-row"><span class="hi-ex">${esc(r.name)}</span><span class="hi-sets">${r.detail}</span></div>`
  ).join('')}</div>`;
}

/** 'agosto 2026' a partir de 'YYYY-MM-DD', sin construir un Date con zona. */
function monthLabel(date) {
  const [y, m] = date.split('-');
  return `${MESES[parseInt(m) - 1]} ${y}`;
}

/**
 * Las tarjetas con una cabecera por mes delante. Sin ellas la lista es un chorro
 * plano de fechas sueltas: nada marca dónde acaba un mes y empieza el otro, y a
 * la tercera pantalla de scroll ya no sabes por dónde vas. La cabecera se queda
 * pegada arriba al recorrer (CSS), así que el mes que estás mirando siempre está
 * escrito en pantalla.
 */
function renderItems(items) {
  let mesActual = null;
  return items.map(w => {
    const mes = monthLabel(w.date);
    const head = mes !== mesActual ? `<h4 class="hi-month">${esc(mes)}</h4>` : '';
    mesActual = mes;
    return head + renderItem(w);
  }).join('');
}

function renderItem(w) {
  const summary = summaryRows(w);
  const hasPR = w.prs && w.prs.length > 0;
  const prBadge = hasPR ? '<span class="hi-pr">🏆 PR</span>' : '';
  const plan = `<span class="hi-plan">${esc(planName(w.program))}</span>`;
  // Una suelta no pertenece a la fase en la que estaba el atleta ese día: decirlo
  // sería inventar una relación con su plan que no existe.
  const origen = w.sessionId ? 'Tu sesión' : `Fase ${ROMAN[w.phase - 1] || w.phase}`;
  return `<div class="history-item" data-id="${w.id}"><div class="hi-date">${formatDate(w.date)}</div><div class="hi-session">${origen} · ${w.session}${prBadge} ${plan}</div><div class="hi-summary">${summary || '—'}</div></div>`;
}

// Por defecto el historial muestra el plan ACTIVO (vista limpia de siempre).
// "Todos los planes" es la salida para que ninguna sesión quede nunca oculta.
// Una vez el usuario toca el filtro, su elección manda durante la sesión.
let _planFilterTouched = false;
let _dateFilter = null;

/** Filtro de plan efectivo (fuente única para historial Y calendario).
 *  '' = todos los planes; si no, id de programa. Por defecto, el plan activo. */
export function currentPlanFilter() {
  const sel = document.getElementById('historyProgFilter');
  if (!sel) return getActiveProgram();
  if (_planFilterTouched) return sel.value;        // el usuario mandó (incl. "Todos")
  return sel.value || getActiveProgram();          // por defecto, plan activo
}

/** Repuebla el selector de plan. Pre-selecciona el plan activo hasta que el usuario elige. */
function populatePlanFilter(db) {
  const sel = document.getElementById('historyProgFilter');
  if (!sel) return;
  const prev = sel.value;
  const ids = [...new Set(db.workouts.map(w => w.program || 'arete'))];
  const opts = ['<option value="">Todos los planes</option>']
    .concat(ids.map(id => `<option value="${esc(id)}">${esc(planName(id))}</option>`));
  sel.innerHTML = opts.join('');
  if (_planFilterTouched) {
    sel.value = ids.includes(prev) ? prev : '';   // respeta la elección (incl. "Todos")
  } else {
    const active = getActiveProgram();
    sel.value = ids.includes(active) ? active : '';
  }
}

/** Refleja en pantalla si hay un día seleccionado, y ofrece la salida.
 *  Sin esto, pulsar un día del calendario dejaba la lista reducida a una fecha
 *  sin decir por qué ni cómo volver. */
function renderDateFilterBar(dateFilter) {
  const bar = document.getElementById('historyDateFilter');
  if (!bar) return;
  bar.hidden = !dateFilter;
  if (dateFilter) {
    document.getElementById('historyDateFilterText').textContent = `Sesiones del ${formatDate(dateFilter)}`;
  }
}

/** Los entrenos que pasan los tres filtros, del más reciente al más antiguo. */
function itemsFiltrados(db) {
  const filter = document.getElementById('historyFilter').value;
  const progFilter = currentPlanFilter();
  let items = [...db.workouts].reverse();
  if (progFilter) items = items.filter(w => (w.program || 'arete') === progFilter);
  if (filter) items = items.filter(w => w.session === filter);
  if (_dateFilter) items = items.filter(w => w.date === _dateFilter);
  return items;
}

/** Render paginated workout history list */
export function renderHistory(db, dateFilter) {
  _currentDb = db;
  historyPage = 0;
  _dateFilter = dateFilter || null;
  populatePlanFilter(db);
  renderDateFilterBar(_dateFilter);
  const items = itemsFiltrados(db);

  const list = document.getElementById('historyList');
  if (items.length === 0) {
    // Un estado vacío sin salida es un callejón: si el filtro no es el culpable,
    // lo que hace falta es la acción que lo llena.
    // "Filtrado" es que haya entrenos y ninguno pase, no que haya un filtro
    // puesto: el de plan viene con el programa activo por defecto, así que
    // mirar los filtros daría "ningún entreno con este filtro" a un usuario
    // nuevo que no ha filtrado nada.
    const filtered = db.workouts.length > 0;
    list.innerHTML = filtered
      ? `<div class="empty-state">
           <p>Ningún entreno con este filtro.</p>
           <button class="btn btn-outline btn-sm" data-empty-action="clear-filters">Quitar filtros</button>
         </div>`
      : `<div class="empty-state">
           <p><b>Aún no has registrado ningún entreno.</b></p>
           <p class="empty-state-sub">Los que completes aparecerán aquí, con sus series y sus PRs.</p>
           <button class="btn btn-sm" data-empty-action="train">Empezar una sesión</button>
         </div>`;
    return;
  }

  pintarLista(items);
}

/** Pinta la página actual de la lista con su botón de "cargar más".
 *  Es el único sitio que escribe en #historyList: renderHistory y loadMore
 *  duplicaban el corte y el botón, y la agrupación por mes habría hecho falta
 *  escribirla dos veces. */
function pintarLista(items) {
  const end = (historyPage + 1) * PAGE_SIZE;
  const list = document.getElementById('historyList');
  list.innerHTML = renderItems(items.slice(0, end));
  const restantes = items.length - end;
  if (restantes > 0) {
    list.innerHTML += `<button class="load-more-btn" data-total="${items.length}">Ver ${restantes} anteriores</button>`;
  }
}

function loadMore() {
  if (!_currentDb) return;
  historyPage++;
  pintarLista(itemsFiltrados(_currentDb));
}

/** Marca en la lista cuál es la sesión que está abierta en el panel. Sin esto
 *  el maestro-detalle no se lee como tal: el detalle aparece al lado sin decir
 *  de cuál de las veinte filas ha salido. */
function markSelected(id) {
  document.querySelectorAll('#historyList .history-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.id) === id);
  });
}

/**
 * En escritorio el detalle es un panel acoplado, no un diálogo modal: el
 * calendario y la lista siguen a la vista y siguen siendo utilizables. Decirlo
 * en `aria-modal` no es cosmética — el trap de foco de `app.js` se aplica por
 * ese atributo, y encerrar el foco en un panel no modal deja al usuario sin
 * poder volver a la lista con el teclado.
 */
export function setDialogModality(el) {
  const acoplado = matchMedia('(min-width:1024px)').matches;
  el.setAttribute('aria-modal', acoplado ? 'false' : 'true');
}

/** Open the workout detail modal for a given workout ID */
export function showDetail(id, db) {
  detailWorkoutId = id;
  const w = db.workouts.find(x => x.id === id);
  if (!w) return;
  const totalItems = w.exercises.reduce((a, e) => a + 1 + e.sets.length, 0);
  let scale = totalItems <= 12 ? 1 : totalItems <= 18 ? .85 : totalItems <= 24 ? .72 : .62;
  const fs = (base) => (base * scale).toFixed(2) + 'rem';
  const gap = (base) => Math.round(base * scale) + 'px';

  document.getElementById('detailDate').style.fontSize = fs(.82);
  document.getElementById('detailSession').style.fontSize = fs(1.7);
  document.getElementById('detailPhase').style.fontSize = fs(.68);
  document.getElementById('detailDate').textContent = formatDate(w.date);
  document.getElementById('detailSession').textContent = w.session;
  document.getElementById('detailPhase').textContent = w.sessionId ? 'Tu sesión' : 'Fase ' + (ROMAN[w.phase - 1] || w.phase);

  let totalVol = 0, totalSets = 0, maxKg = 0;
  const prNames = new Set((w.prs || []).map(p => p.exercise));
  const exHtml = w.exercises.map(e => {
    const isPR = prNames.has(e.name);
    const prTag = isPR ? `<span class="detail-pr-tag" style="font-size:${fs(.55)}">🏆 PR</span>` : '';
    const hasKg = e.sets.some(s => parseFloat(s.kg) > 0);
    const setsHtml = hasKg ? e.sets.map((s, i) => {
      const kg = parseFloat(s.kg) || 0, reps = parseInt(s.reps) || 0;
      totalVol += kg * reps; totalSets++; if (kg > maxKg) maxKg = kg;
      return `<div class="detail-set-row" style="font-size:${fs(.9)}"><span class="detail-set-num">S${i + 1}</span><span class="detail-set-kg">${s.kg || '—'} kg</span><span class="detail-set-reps">× ${s.reps || '—'}</span></div>`;
    }).join('') : `<div class="detail-set-single" style="font-size:${fs(.85)}">${e.sets[0]?.reps || '—'}</div>`;
    return `<div><div class="detail-ex-name" style="font-size:${fs(.88)}"><span class="detail-ex-accent"></span>${esc(e.name)}${prTag}</div><div class="detail-sets">${setsHtml}</div></div>`;
  }).join('');
  const exContainer = document.getElementById('detailExercises');
  exContainer.innerHTML = exHtml;

  const notesEl = document.getElementById('detailNotes');
  if (w.notes) { notesEl.textContent = '💬 ' + w.notes; notesEl.style.display = 'block'; notesEl.style.fontSize = fs(.75); }
  else { notesEl.style.display = 'none'; }

  const statsHtml = totalVol > 0 ? [
    { label: 'Volumen', value: totalVol > 1000 ? (totalVol / 1000).toFixed(1) + 't' : Math.round(totalVol) + 'kg' },
    { label: 'Series', value: totalSets },
    { label: 'Máx peso', value: maxKg + 'kg' }
  ].map(s => `<div class="detail-stat"><div class="detail-stat-value" style="font-size:${fs(1.4)}">${s.value}</div><div class="detail-stat-label" style="font-size:${fs(.65)}">${s.label}</div></div>`).join('') : `<div class="detail-stat"><div class="detail-stat-value" style="font-size:${fs(1.4)}">${w.exercises.length}</div><div class="detail-stat-label" style="font-size:${fs(.65)}">Ejercicios</div></div>`;
  document.getElementById('detailStats').innerHTML = statsHtml;

  document.querySelectorAll('.card-brand,.card-url').forEach(el => el.style.fontSize = fs(.68));

  const modal = document.getElementById('detailModal');
  setDialogModality(modal);
  modal.classList.add('open');
  markSelected(id);
  const bb = document.getElementById('detailBtnBar'); bb.style.display = 'flex';
  const dbtn = document.getElementById('deleteBtn');
  dbtn.dataset.confirm = 'false'; dbtn.textContent = 'Borrar'; dbtn.style.width = '70px';
}

export function shareCard(db) {
  const workout = getDetailWorkout(db);
  if (workout) openShareEditor(workout, { mode: 'strength' });
}

export function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  document.getElementById('detailBtnBar').style.display = 'none';
  markSelected(null);
}

export function getDetailWorkout(db) {
  return db.workouts.find(x => x.id === detailWorkoutId) || null;
}

/** Initialize history section: bind filter, list clicks, and detail modal */
export function initHistory(db, { onEdit }) {
  // Tocar cualquiera de los dos selectores suelta el día: son filtros del mismo
  // conjunto, y mantener la fecha puesta daría listas vacías sin explicación.
  document.getElementById('historyFilter').addEventListener('change', () => renderHistory(db));
  document.getElementById('historyProgFilter')?.addEventListener('change', () => { _planFilterTouched = true; renderCalendar(db); renderHistory(db); });
  document.getElementById('historyDateClear')?.addEventListener('click', () => renderHistory(db));
  document.getElementById('historyList').addEventListener('click', (e) => {
    if (e.target.closest('.load-more-btn')) { loadMore(); return; }
    const emptyAction = e.target.closest('[data-empty-action]')?.dataset.emptyAction;
    if (emptyAction === 'train') {
      document.querySelector('.str-tab[data-str="strTrain"]')?.click();
      return;
    }
    if (emptyAction === 'clear-filters') {
      document.getElementById('historyFilter').value = '';
      const $plan = document.getElementById('historyProgFilter');
      if ($plan) { $plan.value = ''; _planFilterTouched = true; }
      renderCalendar(db);
      renderHistory(db);
      return;
    }
    const item = e.target.closest('.history-item[data-id]');
    if (item) showDetail(parseInt(item.dataset.id), db);
  });
  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('detailModal')) closeDetailModal();
  });
  document.querySelector('.detail-close-btn').addEventListener('click', () => closeDetailModal());
  document.getElementById('editBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const workout = getDetailWorkout(db);
    if (!workout) return;
    closeDetailModal();
    onEdit(workout);
  });
  document.querySelector('.detail-share-btn').addEventListener('click', (e) => { e.stopPropagation(); shareCard(db); });
  document.getElementById('deleteBtn').addEventListener('click', (e) => { e.stopPropagation(); deleteWorkout(db); });
}

export function deleteWorkout(db) {
  confirmDanger(document.getElementById('deleteBtn'), () => {
    const deleted = db.workouts.find(w => w.id === detailWorkoutId);
    markDeleted(db, detailWorkoutId);
    db.workouts = db.workouts.filter(w => w.id !== detailWorkoutId);
    saveDB(db);
    closeDetailModal();
    renderHistory(db);
    renderCalendar(db);
    toast('Sesión eliminada', 'info', {
      action: 'Deshacer',
      onAction: () => {
        if (deleted) {
          db.workouts.push(deleted);
          db.deletedIds = (db.deletedIds || []).filter(id => id !== deleted.id);
          saveDB(db);
          renderHistory(db);
          renderCalendar(db);
          toast('Sesión restaurada');
        }
      }
    });
  });
}
