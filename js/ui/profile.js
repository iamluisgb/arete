// ── Perfil: los 7 dominios, dentro de la app ─────────────
//
// El radar existía en `dashboard-prototype.html` con datos a mano y en el blog
// como argumento. Aquí se dibuja con los datos reales del atleta.
//
// La pantalla dice tres cosas, en este orden: qué nivel tienes, qué te está
// limitando, y qué medir a continuación. Un radar sin lo tercero es decoración.

import { esc } from '../utils.js';
import {
  DOMAINS, ROMAN, LEVEL_NAMES, CALIBRATION_NOTE,
  computeProfile, nextTest, formatMetric, bodyweight,
} from '../domains.js';
import { openTest } from './domain-test.js';

let $level, $levelName, $limited, $radar, $next, $domains, $note;
let _expanded = null;   // id del dominio desplegado, uno cada vez

function cacheSelectors() {
  $level = document.getElementById('profLevel');
  $levelName = document.getElementById('profLevelName');
  $limited = document.getElementById('profLimited');
  $radar = document.getElementById('profRadar');
  $next = document.getElementById('profNext');
  $domains = document.getElementById('profDomains');
  $note = document.getElementById('profNote');
}

// ── Radar ────────────────────────────────────────────────

const CX = 150, CY = 150, R = 92, N = 7;
const STEP = 2 * Math.PI / N, START = -Math.PI / 2;

function vertex(i, r) {
  const a = START + i * STEP;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

/**
 * El polígono pasa SOLO por los dominios medidos.
 *
 * Llevarlo hasta el centro en los que faltan dibujaba dos pinchos hundidos y se
 * leía como "estás fatal en glicolítico" cuando el dato no existe. Un eje sin
 * medir se marca con su radio punteado y la etiqueta apagada: un hueco tiene
 * que verse como un hueco, no como un cero.
 */
function renderRadar(profile) {
  if (!$radar) return;
  const ds = profile.domains;
  let h = '';

  for (let l = 1; l <= 5; l++) {
    const pts = [];
    for (let i = 0; i < N; i++) pts.push(vertex(i, (l / 5) * R).join(','));
    h += `<polygon points="${pts.join(' ')}" fill="none" stroke="var(--ghost-border)" stroke-width="1"/>`;
  }
  ds.forEach((d, i) => {
    const [x, y] = vertex(i, R);
    const sinMedir = d.level === 0;
    h += `<line x1="${CX}" y1="${CY}" x2="${x}" y2="${y}" stroke="var(--ghost-border)" `
      + `stroke-width="${sinMedir ? 1.5 : 0.5}"${sinMedir ? ' stroke-dasharray="3 4"' : ''}/>`;
  });

  const medidos = ds.map((d, i) => ({ d, i })).filter(({ d }) => d.level > 0);
  if (medidos.length >= 3) {
    const pts = medidos.map(({ d, i }) => vertex(i, (d.level / 5) * R).join(','));
    h += `<polygon points="${pts.join(' ')}" fill="var(--accent-glow)" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
  } else if (medidos.length === 2) {
    // Con dos puntos no hay polígono: una línea entre ellos es lo honesto.
    const [a, b] = medidos.map(({ d, i }) => vertex(i, (d.level / 5) * R));
    h += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--accent)" stroke-width="2"/>`;
  }

  medidos.forEach(({ d, i }) => {
    const [x, y] = vertex(i, (d.level / 5) * R);
    const esLimite = profile.limitedBy?.id === d.id;
    h += `<circle cx="${x}" cy="${y}" r="${esLimite ? 6 : 4}" fill="${d.color}"${esLimite ? ' class="radar-worst"' : ''}/>`;
  });

  ds.forEach((d, i) => {
    const [x, y] = vertex(i, R + 20);
    const cos = Math.cos(START + i * STEP);
    const anchor = cos > 0.15 ? 'start' : cos < -0.15 ? 'end' : 'middle';
    const esLimite = profile.limitedBy?.id === d.id;
    const color = esLimite ? 'var(--accent)' : d.level === 0 ? 'var(--text3)' : 'var(--text2)';
    h += `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" `
      + `fill="${color}" font-size="10.5" font-weight="${esLimite ? '800' : '600'}" `
      + `font-family="var(--font)">${esc(d.short)}</text>`;
  });

  $radar.innerHTML = `<title id="profRadarTitle">Radar de los 7 dominios</title>${h}`;
}

// ── Cabecera ─────────────────────────────────────────────

function renderHead(profile) {
  $level.textContent = profile.level ? ROMAN[profile.level] : '—';
  $levelName.textContent = profile.level ? LEVEL_NAMES[profile.level] : 'Sin medir';

  if (!profile.measured) {
    $limited.innerHTML = 'Mide un dominio y el radar empieza a dibujarse.';
    return;
  }
  const lim = profile.limitedBy;
  const provisional = profile.provisional
    ? `<span class="prof-provisional">Provisional · ${profile.measured} de ${profile.total} dominios medidos</span>`
    : '';
  $limited.innerHTML = `Limitado por <b>${esc(lim.name.toLowerCase())}</b>${provisional}`;
}

// ── Siguiente test ───────────────────────────────────────

const RAZON = {
  nunca: 'Sin medir todavía',
  caducado: 'Toca repetirlo',
  limitante: 'Es tu limitante',
};

function renderNext(profile) {
  const n = nextTest(profile);
  if (!n) { $next.innerHTML = ''; return; }
  const d = n.domain;
  const detalle = n.reason === 'caducado' && d.oldest != null
    ? `Hace ${d.oldest} días`
    : RAZON[n.reason];
  $next.innerHTML = `
    <div class="prof-next-card">
      <div class="prof-next-label">Siguiente test</div>
      <div class="prof-next-row">
        <div>
          <div class="prof-next-name">${esc(d.name)}</div>
          <div class="prof-next-why">${esc(detalle)}</div>
        </div>
        <button class="btn prof-next-btn" data-test="${esc(d.id)}">Medir</button>
      </div>
    </div>`;
}

// ── Lista de dominios ────────────────────────────────────

function metricRow(m) {
  const cls = m.source === 'none' ? ' prof-metric-none' : '';
  const origen = m.source === 'derived' ? 'De tus entrenos'
    : m.source === 'test' ? (m.days != null ? `Hace ${m.days} d` : 'Medido')
    : 'Sin medir';
  return `<div class="prof-metric${cls}">
    <span class="prof-metric-name">${esc(m.label)}</span>
    <span class="prof-metric-src">${esc(origen)}</span>
    <span class="prof-metric-val">${esc(formatMetric(m))}</span>
    <span class="prof-metric-lvl">${ROMAN[m.level]}</span>
  </div>`;
}

function domainRow(d, profile) {
  const esLimite = profile.limitedBy?.id === d.id;
  const abierto = _expanded === d.id;
  const pct = (d.level / 5) * 100;

  const chips = [];
  if (esLimite) chips.push('<span class="prof-chip prof-chip-lim">Tu limitante</span>');
  if (d.stale) chips.push('<span class="prof-chip prof-chip-stale">Caducado</span>');
  if (d.level === 0) chips.push('<span class="prof-chip prof-chip-none">Sin medir</span>');

  return `<div class="prof-domain${abierto ? ' open' : ''}" data-domain="${esc(d.id)}">
    <button class="prof-domain-head" aria-expanded="${abierto}">
      <span class="prof-domain-icon material-symbols-outlined" style="color:${d.color}">${d.icon}</span>
      <span class="prof-domain-main">
        <span class="prof-domain-name">${esc(d.name)}${chips.join('')}</span>
        <span class="prof-domain-bar"><span class="fill" style="width:${pct}%;background:${d.color}"></span></span>
      </span>
      <span class="prof-domain-lvl" style="color:${d.level ? d.color : 'var(--text3)'}">${ROMAN[d.level]}</span>
    </button>
    <div class="prof-domain-body">
      <div class="prof-domain-why">${esc(d.why)}</div>
      ${d.metrics.map(metricRow).join('')}
      ${d.level > 0 && d.weakest && d.metrics.length > 1
        ? `<div class="prof-domain-rule">El dominio vale su métrica más baja: <b>${esc(d.weakest.label)}</b>.</div>`
        : ''}
      ${d.protocol ? `<div class="prof-domain-proto">${esc(d.protocol)}</div>` : ''}
      ${d.protocol ? `<button class="btn btn-outline btn-sm" data-test="${esc(d.id)}">${d.level ? 'Volver a medir' : 'Medir ahora'}</button>` : ''}
    </div>
  </div>`;
}

// ── Render y eventos ─────────────────────────────────────

export function renderProfile(db) {
  cacheSelectors();
  if (!$radar) return;
  const profile = computeProfile(db);

  renderHead(profile);
  renderRadar(profile);
  renderNext(profile);
  $domains.innerHTML = profile.domains.map(d => domainRow(d, profile)).join('');

  // Sin peso corporal los cuatro básicos no tienen ratio y el dominio de fuerza
  // se queda vacío sin que se entienda por qué. Decirlo, con la salida a mano.
  const sinPeso = bodyweight(db) == null;
  $note.innerHTML = `
    ${sinPeso ? '<div class="prof-warn">Los ratios de fuerza necesitan tu peso corporal. Registra una medida en <b>Cuerpo</b> y aparecen solos.</div>' : ''}
    <div class="prof-calib">${esc(CALIBRATION_NOTE)}</div>`;
}

export function initProfile(db) {
  cacheSelectors();
  if (!$domains) return;

  const abrirTest = (id) => {
    const d = DOMAINS.find(x => x.id === id);
    if (d?.protocol) openTest(db, d, () => renderProfile(db));
  };

  $domains.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-test]');
    if (btn) { abrirTest(btn.dataset.test); return; }
    const head = e.target.closest('.prof-domain-head');
    if (!head) return;
    const id = head.closest('.prof-domain').dataset.domain;
    _expanded = _expanded === id ? null : id;   // uno abierto cada vez
    renderProfile(db);
  });

  $next.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-test]');
    if (btn) abrirTest(btn.dataset.test);
  });
}
