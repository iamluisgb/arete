// ── Test de dominio ──────────────────────────────────────
//
// Un radar sin re-tests es un gráfico bonito: enseña un número viejo y no
// propone nada. Esta hoja es lo que lo convierte en motor de decisión.
//
// Tres partes, siempre en el mismo orden: el protocolo (cómo se hace, para que
// el número signifique lo mismo cada vez), la medida, y el resultado con el
// nivel que acaba de salir y cuándo toca repetirlo.

import { saveDB } from '../data.js';
import { esc, today, trapFocus } from '../utils.js';
import { toast } from './toast.js';
import { ROMAN, LEVEL_NAMES, levelFor, computeProfile, formatMetric } from '../domains.js';

let sheet = null;
let domain = null, db = null, onDone = null, releaseFocus = null;

function ensureSheet() {
  if (sheet?.isConnected) return sheet;
  sheet = document.createElement('div');
  sheet.className = 'dtest';
  sheet.id = 'domainTest';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  document.body.appendChild(sheet);
  sheet.addEventListener('click', onClick);
  sheet.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  return sheet;
}

/** Los valores previos, para que el atleta vea contra qué se compara. */
function previo(metricKey) {
  const anteriores = (db.domainTests || [])
    .filter(t => t.metric === metricKey)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return anteriores[0] || null;
}

function renderForm() {
  const hoy = today();
  sheet.innerHTML = `
    <div class="dtest-sheet">
      <div class="dtest-top">
        <span class="dtest-icon material-symbols-outlined" style="color:${domain.color}">${domain.icon}</span>
        <span class="dtest-title">${esc(domain.name)}</span>
        <button class="dtest-close" type="button" data-close aria-label="Cerrar">✕</button>
      </div>
      <div class="dtest-proto">
        <div class="dtest-proto-label">Protocolo</div>
        <p>${esc(domain.protocol)}</p>
      </div>
      <div class="dtest-fields">
        ${domain.metrics.map(m => {
          const p = previo(m.key);
          return `<label class="dtest-field">
            <span class="dtest-field-name">${esc(m.label)}</span>
            <span class="dtest-field-input">
              <input type="number" step="0.1" inputmode="decimal" data-metric="${esc(m.key)}"
                     aria-label="${esc(m.label)} en ${esc(m.unit)}">
              <span class="dtest-field-unit">${esc(m.unit)}</span>
            </span>
            <span class="dtest-field-prev">${p ? `Antes: ${esc(formatMetric({ ...m, value: parseFloat(p.value) }))} · ${esc(p.date)}` : 'Sin medida previa'}</span>
          </label>`;
        }).join('')}
        <label class="dtest-field dtest-field-date">
          <span class="dtest-field-name">Fecha</span>
          <span class="dtest-field-input"><input type="date" id="dtestDate" value="${hoy}" max="${hoy}"></span>
        </label>
      </div>
      <button class="btn btn--lg btn--block dtest-save" type="button" data-save>Guardar medida</button>
      <button class="dtest-sub" type="button" data-close>Cancelar</button>
    </div>`;
  sheet.querySelector('input[data-metric]')?.focus();
}

/**
 * El resultado. Enseña el nivel que sale, si el dominio ha cambiado y cuándo
 * repetirlo — sin eso, el atleta no sabe qué hacer con el número.
 */
function renderResult(guardados, antes) {
  const profile = computeProfile(db);
  const d = profile.domains.find(x => x.id === domain.id);
  const subio = antes > 0 && d.level > antes;
  const bajo = antes > 0 && d.level < antes;

  sheet.innerHTML = `
    <div class="dtest-sheet dtest-result">
      <div class="dtest-res-lvl" style="color:${domain.color}">${ROMAN[d.level]}</div>
      <div class="dtest-res-name">${esc(domain.name)} · ${esc(LEVEL_NAMES[d.level])}</div>
      ${subio ? `<div class="dtest-res-delta up">Has subido de ${ROMAN[antes]} a ${ROMAN[d.level]}</div>` : ''}
      ${bajo ? `<div class="dtest-res-delta down">Baja de ${ROMAN[antes]} a ${ROMAN[d.level]}. Es un dato, no un juicio.</div>` : ''}
      <div class="dtest-res-metrics">
        ${guardados.map(g => `<div class="dtest-res-metric">
          <span>${esc(g.label)}</span><b>${esc(formatMetric(g))}</b><span class="dtest-res-mlvl">${ROMAN[g.level]}</span>
        </div>`).join('')}
      </div>
      ${d.weakest && d.metrics.length > 1
        ? `<div class="dtest-res-note">El dominio lo define <b>${esc(d.weakest.label)}</b>, que es tu métrica más baja.</div>` : ''}
      ${profile.limitedBy?.id === d.id
        ? '<div class="dtest-res-note">Es tu dominio limitante: es lo que más te sube el nivel global.</div>' : ''}
      ${domain.retest ? `<div class="dtest-res-next">Repítelo en ${Math.round(domain.retest / 7)} semanas</div>` : ''}
      <button class="btn btn--lg btn--block dtest-save" type="button" data-close>Hecho</button>
    </div>`;
}

function save() {
  const fecha = sheet.querySelector('#dtestDate')?.value || today();
  const guardados = [];
  const antes = computeProfile(db).domains.find(x => x.id === domain.id).level;

  for (const m of domain.metrics) {
    const raw = sheet.querySelector(`input[data-metric="${m.key}"]`)?.value;
    if (raw === '' || raw == null) continue;
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) continue;
    guardados.push({ ...m, value, level: levelFor(m, value) });
  }

  if (!guardados.length) { toast('Introduce al menos una medida', 'error'); return; }

  // Ids distintos aunque se guarden en el mismo milisegundo: el merge de Drive
  // deduplica por id y dos métricas con el mismo id se comerían la una a la otra.
  const base = Date.now();
  guardados.forEach((g, i) => {
    db.domainTests.push({ id: base + i, domain: domain.id, metric: g.key, value: g.value, date: fecha });
  });
  saveDB(db);

  renderResult(guardados, antes);
  onDone?.();
}

function onClick(e) {
  if (e.target.closest('[data-save]')) { save(); return; }
  if (e.target.closest('[data-close]') || e.target === sheet) close();
}

export function close() {
  if (!sheet) return;
  sheet.classList.remove('open');
  // El observador global de app.js solo vigila los `.modal-overlay` que ya
  // están en el HTML; esta hoja nace en runtime y limpia su trampa a mano.
  releaseFocus?.();
  releaseFocus = null;
}

/** Abre el test de un dominio. `done` se llama tras guardar, para repintar. */
export function openTest(database, dom, done) {
  db = database;
  domain = dom;
  onDone = done;
  if (!Array.isArray(db.domainTests)) db.domainTests = [];
  ensureSheet();
  renderForm();
  sheet.classList.add('open');
  releaseFocus = trapFocus(sheet);
}
