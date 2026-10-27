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
  const prBadge = hasPR ? '<span class="badge badge--accent">Récord</span>' : '';
  const plan = `<span class="hi-plan">${esc(planName(w.program))}</span>`;
  // Una suelta no pertenece a la fase en la que estaba el atleta ese día: decirlo
  // sería inventar una relación con su plan que no existe.
  const origen = w.sessionId ? 'Tu sesión' : `Fase ${ROMAN[w.phase - 1] || w.phase}`;
  const series = w.exercises.reduce((n, e) => n + (e.sets?.length || 0), 0);
  // La fecha en su propia columna, como un sello: día de la semana, número y mes.
  // Es lo que se escanea al recorrer la lista, y en una columna fija las
  // sesiones quedan alineadas entre sí. La fecha completa va para el lector.
  return `<div class="history-item" data-id="${w.id}">
      <div class="hi-when" aria-label="${formatDate(w.date)}"><span>${diaSemana(w.date)}</span><b>${parseInt(w.date.slice(8, 10))}</b><span>${MESES[parseInt(w.date.slice(5, 7)) - 1].slice(0, 3).toLowerCase()}</span></div>
      <div class="hi-body">
        <div class="hi-head"><span class="hi-name">${esc(w.session)}</span>${prBadge}<span class="hi-meta">${w.exercises.length} ejercicios · ${series} series</span></div>
        <div class="hi-session">${origen} ${plan}</div>
        <div class="hi-summary">${summary || '—'}</div>
      </div>
    </div>`;
}

/** 'lun', 'mar'… de una fecha 'YYYY-MM-DD', sin que la zona horaria la mueva de día. */
function diaSemana(date) {
  const [y, m, d] = date.split('-').map(Number);
  return ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(y, m - 1, d).getDay()];
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

// ── Detalle de una sesión de fuerza ─────────────────────
//
// Antes era una copia en HTML de la tarjeta de compartir: todo centrado, en
// rojo, con burbujas, el pie de marca y la letra encogida para que cupiera en
// una pantalla. Desde que compartir dibuja su propia tarjeta (session-card.js),
// esto ya no se fotografía: es para leer. Así que se lee de arriba abajo, el
// rojo vuelve a ser solo récord, cada ejercicio cabe en una línea y dice cómo
// fue respecto a la vez anterior, que es lo que se viene a mirar aquí.

const kgOf = s => parseFloat(String(s?.kg ?? '').replace(',', '.')) || 0;
const fmtKg = n => String(Math.round(n * 100) / 100).replace('.', ',');

/** Series hechas de un ejercicio, sin los huecos que deja el formulario. */
const doneSets = ex => (ex.sets || []).filter(s => kgOf(s) > 0 || String(s.reps ?? '').trim());

/**
 * Agrupa series iguales y consecutivas: tres de 110 × 3 son «3×3 · 110 kg».
 * Una serie distinta abre otro grupo, así que la sesión se lee tal como se hizo.
 */
export function groupSets(sets) {
  const groups = [];
  for (const s of sets) {
    const kg = kgOf(s);
    const reps = String(s.reps ?? '').trim() || '—';
    const last = groups[groups.length - 1];
    if (last && last.kg === kg && last.reps === reps) last.count++;
    else groups.push({ kg, reps, count: 1 });
  }
  return groups.map(g => `${g.count}×${g.reps}${g.kg > 0 ? ` · ${fmtKg(g.kg)} kg` : ''}`);
}

/** La carga más alta del ejercicio en la última sesión anterior a `w` que lo tenga. */
export function previousTop(db, w, name) {
  const before = (db.workouts || [])
    .filter(x => x.id !== w.id && (x.date < w.date || (x.date === w.date && x.id < w.id)))
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.id - a.id));
  for (const x of before) {
    const ex = (x.exercises || []).find(e => e.name === name);
    const top = ex ? Math.max(0, ...doneSets(ex).map(kgOf)) : 0;
    if (top > 0) return { kg: top, date: x.date };
  }
  return null;
}

function detailDateLabel(date) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return formatDate(date);
  const txt = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '');
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function exerciseRow(db, w, ex, isPR) {
  const sets = doneSets(ex);
  const top = Math.max(0, ...sets.map(kgOf));
  let cmp = '';
  if (isPR) cmp = '<span class="detail-ex-pr">Récord</span>';
  else if (top > 0) {
    const prev = previousTop(db, w, ex.name);
    if (prev) {
      const diff = top - prev.kg;
      const when = formatDate(prev.date).slice(0, 5);
      const txt = diff > 0 ? `+${fmtKg(diff)} kg` : diff < 0 ? `−${fmtKg(-diff)} kg` : 'Igual';
      cmp = `<span class="detail-ex-cmp" title="Respecto al ${when}">${txt} <span class="detail-ex-when">vs ${when}</span></span>`;
    }
  }
  const groups = sets.length ? groupSets(sets) : ['—'];
  return `<li class="detail-ex">
    <div class="detail-ex-head"><span class="detail-ex-name">${esc(ex.name)}</span>${cmp}</div>
    <div class="detail-ex-sets">${groups.map(g => `<span>${esc(g)}</span>`).join('<span class="detail-ex-sep" aria-hidden="true">·</span>')}</div>
  </li>`;
}

/** Open the workout detail modal for a given workout ID */
export function showDetail(id, db) {
  detailWorkoutId = id;
  const w = db.workouts.find(x => x.id === id);
  if (!w) return;

  const planName = getProgramById(w.program || 'arete')?._meta?.name || '';
  const phase = w.sessionId ? 'Tu sesión' : `Fase ${ROMAN[w.phase - 1] || w.phase}`;
  document.getElementById('detailSession').textContent = w.session || 'Entrenamiento';
  document.getElementById('detailMeta').textContent = [detailDateLabel(w.date), planName, phase].filter(Boolean).join(' · ');

  const prNames = new Set((w.prs || []).map(p => p.exercise));
  const exercises = (w.exercises || []).filter(e => doneSets(e).length);
  const totalSets = exercises.reduce((a, e) => a + doneSets(e).length, 0);
  const prCount = exercises.filter(e => prNames.has(e.name)).length;

  const stats = [
    { label: 'Ejercicios', value: exercises.length },
    { label: 'Series', value: totalSets },
    { label: prCount === 1 ? 'Récord' : 'Récords', value: prCount, hot: prCount > 0 },
  ];
  document.getElementById('detailStats').innerHTML = stats.map(s =>
    `<div class="detail-stat${s.hot ? ' is-hot' : ''}"><span class="detail-stat-value">${s.value}</span><span class="detail-stat-label">${s.label}</span></div>`
  ).join('');

  document.getElementById('detailExercises').innerHTML =
    exercises.map(e => exerciseRow(db, w, e, prNames.has(e.name))).join('');

  const notesEl = document.getElementById('detailNotes');
  notesEl.textContent = w.notes || '';
  notesEl.hidden = !w.notes;

  const modal = document.getElementById('detailModal');
  setDialogModality(modal);
  modal.classList.add('open');
  modal.querySelector('.detail-view').scrollTop = 0;
  markSelected(id);
  const bb = document.getElementById('detailBtnBar'); bb.style.display = 'flex';
  const dbtn = document.getElementById('deleteBtn');
  dbtn.dataset.confirm = 'false'; dbtn.textContent = 'Borrar';
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
    markDeleted(db, detailWorkoutId, 'workouts');
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
