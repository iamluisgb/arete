// U2: tarjeta de primeros pasos y CTA de actividad vacía en "Hoy".
// No comprueba el cálculo del perfil (eso es domains.test.js) sino las reglas
// de visibilidad de la tarjeta y que el CTA aparezca solo cuando toca.
import { describe, it, expect, beforeEach, vi } from 'vitest';

function setupDOM() {
  document.body.innerHTML = `
    <nav>
      <button data-sec="secDashboard"></button>
      <button data-sec="secTrain"></button>
      <button data-sec="secProfile"></button>
      <button data-sec="secBody"></button>
    </nav>
    <div class="section active" id="secDashboard">
      <button class="dash-level" id="dashLevel" type="button"></button>
      <div id="dashStarter"></div>
      <div id="dashActivityList"></div>
    </div>
  `;
}

const freshDB = (over = {}) => ({
  workouts: [], bodyLogs: [], runningLogs: [], domainTests: [],
  ...over,
});

const workout = (date = '2026-01-01') => ({
  date, session: 'Sesión A',
  exercises: [{ name: 'Squat', sets: [{ kg: 100, reps: 5 }] }],
});

async function cargar() {
  vi.resetModules();
  setupDOM();
  localStorage.clear();
  return await import('../js/ui/dashboard.js');
}

beforeEach(() => { localStorage.clear(); });

describe('tarjeta de primeros pasos', () => {
  it('un atleta nuevo la ve, con título y los 3 pasos', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB());
    const card = document.querySelector('#dashStarter .dash-starter');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Empieza por aquí');
    const steps = card.querySelectorAll('[data-starter-tab]');
    expect(steps).toHaveLength(3);
    expect(card.textContent).toContain('Registra tu peso corporal');
    expect(card.textContent).toContain('Haz tu primer test');
    expect(card.textContent).toContain('Registra tu primera sesión');
    expect(card.querySelector('[data-starter-dismiss]')).toBeTruthy();
  });

  it('un veterano con sesiones de fuerza no la ve, aunque el perfil siga provisional', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB({ workouts: [workout()] }));
    expect(document.querySelector('#dashStarter .dash-starter')).toBeNull();
  });

  it('quien importa carreras tampoco la ve', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB({ runningLogs: [{ date: '2026-01-01', distance: 5 }] }));
    expect(document.querySelector('#dashStarter .dash-starter')).toBeNull();
  });

  it('un perfil completo (no provisional) no la ve', async () => {
    const dash = await cargar();
    // Los 7 dominios medidos por test: perfil completo sin sesiones ni peso.
    const metricas = ['squat', 'deadlift', 'bench', 'ohp', 'pullups', 'run400', 'run5k',
      'sns', 'mcgillFlexor', 'mcgillExtensor', 'mcgillSide', 'ake', 'dorsiflexion'];
    const db = freshDB({
      domainTests: metricas.map((m, i) => ({ id: i + 1, metric: m, value: 100000, date: '2026-01-01' })),
    });
    const { computeProfile } = await import('../js/domains.js');
    expect(computeProfile(db).provisional).toBe(false);
    dash.renderDashboard(db);
    expect(document.querySelector('#dashStarter .dash-starter')).toBeNull();
  });

  it('la omisión persiste: tras Ocultar no vuelve a aparecer', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB());
    expect(document.querySelector('#dashStarter .dash-starter')).toBeTruthy();
    dash.dismissStarter();
    expect(dash.isStarterDismissed()).toBe(true);
    // La clave se guarda como JSON plano.
    expect(JSON.parse(localStorage.getItem('areteStarterDismissed'))).toBe(true);
    dash.renderDashboard(freshDB());
    expect(document.querySelector('#dashStarter .dash-starter')).toBeNull();
  });

  it('los pasos marcan done con el dato correspondiente', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB({
      bodyLogs: [{ date: '2026-01-01', weight: 75 }],
      domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-01-01' }],
    }));
    const card = document.querySelector('#dashStarter .dash-starter');
    const done = [...card.querySelectorAll('[data-starter-tab]')]
      .filter(b => b.closest('li').classList.contains('done'));
    expect(done).toHaveLength(2);
    // La sesión (tercer paso) sigue pendiente: sin ella la tarjeta no se va.
    const pending = [...card.querySelectorAll('[data-starter-tab]')]
      .filter(b => !b.closest('li').classList.contains('done'));
    expect(pending).toHaveLength(1);
    expect(pending[0].dataset.starterTab).toBe('secTrain');
  });
});

describe('CTA de actividad vacía', () => {
  it('sin actividad muestra el texto y el botón Empezar una sesión', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB());
    const empty = document.querySelector('#dashActivityList .dash-empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('Sin actividad aún');
    expect(document.querySelector('#dashEmptyStart')?.textContent).toContain('Empezar una sesión');
  });

  it('con actividad no hay CTA', async () => {
    const dash = await cargar();
    dash.renderDashboard(freshDB({ workouts: [workout()] }));
    expect(document.querySelector('#dashEmptyStart')).toBeNull();
  });
});
