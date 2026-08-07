import { MESES } from '../constants.js';
import { showDetail } from './history.js';
import { renderHistory, currentPlanFilter } from './history.js';

let calViewDate = new Date();
let _calLanded = false;

/** El mes al que abrir: el más reciente CON sesiones, no el de hoy.
 *  Un calendario cuyo único estado interactivo son los días con entreno, abierto
 *  en un mes vacío, es un objeto inerte: no hay nada que pulsar y nada que leer
 *  salvo un cero. El atleta que vuelve en agosto tras parar en julio aterrizaba
 *  ahí. Solo manda la primera vez que se abre la pantalla: a partir de ahí el
 *  mes lo decide quien navega. */
function landOnMonthWithData(db) {
  if (_calLanded) return;
  _calLanded = true;
  const pf = currentPlanFilter();
  const dates = db.workouts
    .filter(w => !pf || (w.program || 'arete') === pf)
    .map(w => w.date)
    .sort();
  const last = dates[dates.length - 1];
  if (!last) return;                       // sin historial, hoy es tan buen mes como otro
  const [y, m] = last.split('-').map(Number);
  const now = new Date();
  if (y === now.getFullYear() && m === now.getMonth() + 1) return;
  calViewDate = new Date(y, m - 1, 1);
}

export function calNav(d, db) {
  _calLanded = true;
  if (d === 0) calViewDate = new Date();
  else calViewDate.setMonth(calViewDate.getMonth() + d);
  renderCalendar(db);
}

// A partir de 1440 el calendario tiene columna propia al lado de la lista: ahí
// estar plegado solo esconde. Por debajo comparte columna con ella y su mes
// entero se comía la primera pantalla, así que arranca cerrado.
const DOS_COLUMNAS = '(min-width:1440px)';

let _foldInit = false;

/** Abre o cierra los plegables del calendario según haya columna para ellos.
 *  Solo en dos momentos: la primera vez que se pinta y al cruzar el umbral. Si
 *  se aplicara en cada render, cambiar un filtro cerraría de golpe el calendario
 *  que el usuario acaba de abrir. */
export function syncCalendarFold() {
  const abierto = matchMedia(DOS_COLUMNAS).matches;
  for (const id of ['calFold', 'runCalFold']) {
    const el = document.getElementById(id);
    if (el) el.open = abierto;
  }
}
if (typeof matchMedia !== 'undefined') {
  matchMedia(DOS_COLUMNAS).addEventListener('change', syncCalendarFold);
}

/** Render the monthly calendar grid with workout indicators */
export function renderCalendar(db) {
  const panel = document.getElementById('calendarPanel');
  if (!_foldInit) { _foldInit = true; syncCalendarFold(); }
  landOnMonthWithData(db);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const pf = currentPlanFilter();
  const filtered = pf ? db.workouts.filter(w => (w.program || 'arete') === pf) : db.workouts;
  const wd = {};
  filtered.forEach(w => { if (!wd[w.date]) wd[w.date] = []; wd[w.date].push(w.session); });
  const vm = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), 1);
  let html = '';
  const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const y = vm.getFullYear(), m = vm.getMonth(), dim = new Date(y, m + 1, 0).getDate();
  let fd = new Date(y, m, 1).getDay();
  fd = fd === 0 ? 6 : fd - 1;
  let mc = 0;
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (wd[ds]) mc++;
  }
  html += `<div class="cal-container"><div class="cal-header"><div class="cal-title">${MESES[m]} ${y}</div><div class="cal-count">Sesiones<span>${mc}</span></div></div><div class="cal-grid">`;
  DOW.forEach(d => { html += `<div class="cal-dow">${d}</div>`; });
  for (let e = 0; e < fd; e++) html += '<div class="cal-day empty">·</div>';
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hw = wd[ds], it = ds === todayStr;
    let c = 'cal-day';
    if (hw) c += ' has-workout';
    if (it) c += ' today';
    const dataAttr = hw ? ` data-date="${ds}"` : '';
    html += `<div class="${c}"${dataAttr}>${d}</div>`;
  }
  html += '</div></div>';
  panel.innerHTML = html;
}

/** Initialize calendar: navigation buttons and day click events */
export function initCalendar(db) {
  document.querySelector('.cal-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('cal-nav-today')) calNav(0, db);
    else if (btn.previousElementSibling === null) calNav(-1, db);
    else calNav(1, db);
  });
  document.getElementById('calendarPanel').addEventListener('click', (e) => {
    const day = e.target.closest('.cal-day[data-date]');
    if (day) calDayClick(day.dataset.date, db);
  });
}

/** Un día del calendario filtra la lista. Siempre, haya una sesión o cinco.
 *  Antes, un día con una sola sesión abría el modal y uno con varias filtraba:
 *  el mismo gesto hacía dos cosas distintas según un dato que no está a la
 *  vista, así que no se podía aprender qué iba a pasar al pulsar. */
export function calDayClick(ds, db) {
  document.getElementById('historyFilter').value = '';
  renderHistory(db, ds);
}
