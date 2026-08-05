// El perfil dentro de la app: el radar, la hoja de test y la migración de la
// navegación vieja. Lo que se comprueba aquí no es el cálculo (eso es
// domains.test.js) sino que la pantalla no miente sobre lo que hay medido.
import { describe, it, expect, beforeEach, vi } from 'vitest';

function setupDOM() {
  document.body.innerHTML = `
    <nav>
      <button data-sec="secDashboard"></button>
      <button data-sec="secTrain"></button>
      <button data-sec="secProfile"></button>
    </nav>
    <div class="section" id="secProfile">
      <div id="profLevel"></div><div id="profLevelName"></div><div id="profLimited"></div>
      <svg id="profRadar"></svg>
      <div id="profNext"></div>
      <div id="profDomains"></div>
      <div id="profNote"></div>
    </div>
    <div id="toastContainer"></div>
  `;
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
  (await import('../js/ui/toast.js')).initToast();
  return {
    profile: await import('../js/ui/profile.js'),
    test: await import('../js/ui/domain-test.js'),
    domains: await import('../js/domains.js'),
  };
}

beforeEach(() => { localStorage.clear(); });

describe('radar', () => {
  it('sin dominios medidos no dibuja polígono, pero sí los 7 ejes', async () => {
    const { profile } = await cargar();
    profile.renderProfile(freshDB());
    const svg = document.getElementById('profRadar');
    expect(svg.querySelectorAll('polygon[fill="var(--color-accent-glow)"]')).toHaveLength(0);
    expect(svg.querySelectorAll('line')).toHaveLength(7);
    expect(svg.querySelectorAll('text')).toHaveLength(7);
  });

  // Llevar el polígono al centro en los dominios que faltan se leía como
  // "estás fatal", no como "no hay dato".
  it('el polígono pasa solo por los dominios medidos', async () => {
    const { profile } = await cargar();
    const db = freshDB({
      domainTests: [
        { id: 1, metric: 'ake', value: 16, date: '2026-08-01' },
        { id: 2, metric: 'run400', value: 62, date: '2026-08-01' },
        { id: 3, metric: 'sns', value: 32, date: '2026-08-01' },
      ],
    });
    profile.renderProfile(db);
    const poly = document.querySelector('#profRadar polygon[fill="var(--color-accent-glow)"]');
    expect(poly.getAttribute('points').split(' ')).toHaveLength(3);
    // y solo hay un punto por dominio medido
    expect(document.querySelectorAll('#profRadar circle')).toHaveLength(3);
  });

  it('los ejes sin medir van punteados', async () => {
    const { profile } = await cargar();
    profile.renderProfile(freshDB({
      domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-08-01' }],
    }));
    const punteados = [...document.querySelectorAll('#profRadar line')]
      .filter(l => l.getAttribute('stroke-dasharray'));
    // 6 dominios sin medir (movilidad tiene AKE, así que cuenta como medido)
    expect(punteados).toHaveLength(6);
  });
});

describe('cabecera', () => {
  it('nombra el dominio limitante', async () => {
    const { profile } = await cargar();
    profile.renderProfile(freshDB({
      domainTests: [
        { id: 1, metric: 'ake', value: -10, date: '2026-08-01' },   // movilidad I
        { id: 2, metric: 'run400', value: 55, date: '2026-08-01' }, // glicolítico V
      ],
    }));
    expect(document.getElementById('profLevel').textContent).toBe('I');
    expect(document.getElementById('profLimited').textContent).toContain('movilidad funcional');
  });

  it('avisa de que el nivel es provisional mientras falten dominios', async () => {
    const { profile } = await cargar();
    profile.renderProfile(freshDB({
      domainTests: [{ id: 1, metric: 'ake', value: 16, date: '2026-08-01' }],
    }));
    expect(document.getElementById('profLimited').textContent).toContain('Provisional');
  });

  it('sin peso corporal explica por qué no hay ratios de fuerza', async () => {
    const { profile } = await cargar();
    profile.renderProfile(freshDB({
      workouts: [{ id: 1, date: '2026-07-01', exercises: [{ name: 'Sentadilla', sets: [{ kg: '100', reps: '5' }] }] }],
    }));
    expect(document.getElementById('profNote').textContent).toContain('peso corporal');
  });

  it('la calibración se declara en la pantalla, no solo en el blog', async () => {
    const { profile } = await cargar();
    profile.renderProfile(freshDB());
    expect(document.getElementById('profNote').textContent).toContain('75 kg');
  });
});

describe('siguiente test', () => {
  it('propone medir lo que nunca se midió y ofrece el botón', async () => {
    const { profile } = await cargar();
    profile.renderProfile(freshDB());
    const btn = document.querySelector('#profNext [data-test]');
    expect(btn).toBeTruthy();
    expect(document.getElementById('profNext').textContent).toContain('Sin medir todavía');
  });
});

describe('hoja de test', () => {
  it('guarda una métrica por fila con ids distintos', async () => {
    // Dos métricas guardadas en el mismo milisegundo con el mismo id se comerían
    // la una a la otra en el merge de Drive.
    const { test, domains } = await cargar();
    const db = freshDB();
    const core = domains.DOMAINS.find(d => d.id === 'core');
    test.openTest(db, core, () => {});

    const sheet = document.getElementById('domainTest');
    sheet.querySelector('input[data-metric="mcgillFlexor"]').value = '120';
    sheet.querySelector('input[data-metric="mcgillExtensor"]').value = '150';
    sheet.querySelector('input[data-metric="mcgillSide"]').value = '70';
    sheet.querySelector('[data-save]').click();

    expect(db.domainTests).toHaveLength(3);
    expect(new Set(db.domainTests.map(t => t.id)).size).toBe(3);
    expect(db.domainTests.every(t => t.domain === 'core')).toBe(true);
  });

  it('las métricas que se dejan en blanco no se guardan como cero', async () => {
    const { test, domains } = await cargar();
    const db = freshDB();
    test.openTest(db, domains.DOMAINS.find(d => d.id === 'core'), () => {});
    const sheet = document.getElementById('domainTest');
    sheet.querySelector('input[data-metric="mcgillFlexor"]').value = '120';
    sheet.querySelector('[data-save]').click();

    expect(db.domainTests).toHaveLength(1);
    expect(db.domainTests[0].metric).toBe('mcgillFlexor');
  });

  it('sin ninguna medida avisa y no guarda nada', async () => {
    const { test, domains } = await cargar();
    const db = freshDB();
    test.openTest(db, domains.DOMAINS.find(d => d.id === 'glyco'), () => {});
    document.getElementById('domainTest').querySelector('[data-save]').click();

    expect(db.domainTests).toHaveLength(0);
    expect(document.querySelector('#toastContainer .toast').textContent).toContain('al menos una medida');
  });

  it('tras guardar enseña el nivel resultante y cuándo repetirlo', async () => {
    const { test, domains } = await cargar();
    const db = freshDB();
    test.openTest(db, domains.DOMAINS.find(d => d.id === 'glyco'), () => {});
    const sheet = document.getElementById('domainTest');
    sheet.querySelector('input[data-metric="run400"]').value = '58';
    sheet.querySelector('[data-save]').click();

    expect(sheet.querySelector('.dtest-res-lvl').textContent).toBe('IV');
    expect(sheet.querySelector('.dtest-res-next').textContent).toContain('10 semanas');
  });

  it('avisa al usuario cuando el dominio baja de nivel', async () => {
    const { test, domains } = await cargar();
    const db = freshDB({
      domainTests: [{ id: 1, domain: 'glyco', metric: 'run400', value: 58, date: '2026-01-01' }],
    });
    test.openTest(db, domains.DOMAINS.find(d => d.id === 'glyco'), () => {});
    const sheet = document.getElementById('domainTest');
    sheet.querySelector('input[data-metric="run400"]').value = '72';
    sheet.querySelector('[data-save]').click();

    expect(sheet.querySelector('.dtest-res-delta.down')).toBeTruthy();
  });
});
