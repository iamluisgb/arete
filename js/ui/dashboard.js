import { esc } from '../utils.js';

const CIRCUMFERENCE = 2 * Math.PI * 34; // ~213.6 for r=34

const QUOTES = [
  { text: 'La disciplina es el puente entre las metas y los logros.', author: 'Jim Rohn' },
  { text: 'No se trata de ser el mejor. Se trata de ser mejor que ayer.', author: null },
  { text: 'La constancia no es glamurosa, pero es lo que funciona.', author: null },
  { text: 'Enamórate del proceso y los resultados llegarán.', author: 'Eric Thomas' },
  { text: 'Cada repetición cuenta, aunque no la sientas.', author: null },
  { text: 'La fuerza no viene de lo que puedes hacer. Viene de superar lo que creías que no podías.', author: 'Rikki Rogers' },
  { text: 'El cuerpo logra lo que la mente cree.', author: null },
  { text: 'No cuentes los días, haz que los días cuenten.', author: 'Muhammad Ali' },
  { text: 'El dolor que sientes hoy será la fuerza que sentirás mañana.', author: null },
  { text: 'La diferencia entre querer y lograr es la disciplina.', author: null },
  { text: 'Entrena porque tu cuerpo lo merece, no como castigo por lo que comiste.', author: null },
  { text: 'El éxito no se regala. Se entrena.', author: null },
  { text: 'Hoy es un buen día para ser mejor que ayer.', author: null },
  { text: 'Los límites solo existen si los aceptas.', author: null },
  { text: 'No busques inspiración. Sé la inspiración.', author: null },
  { text: 'El talento te pone en el juego. El esfuerzo te hace ganar.', author: null },
  { text: 'Sufre la disciplina o sufre el arrepentimiento.', author: 'Jim Rohn' },
  { text: 'Tu yo del futuro te lo va a agradecer.', author: null },
  { text: 'Cada día es una nueva oportunidad para mejorar.', author: null },
  { text: 'La motivación te pone en marcha. El hábito te mantiene.', author: null },
  { text: 'El progreso, no la perfección, es lo que importa.', author: null },
  { text: 'Lo que hoy parece imposible, mañana será tu calentamiento.', author: null },
  { text: 'La mente se rinde antes que el cuerpo. No la dejes.', author: null },
  { text: 'Pequeños pasos cada día llevan a grandes resultados.', author: null },
  { text: 'Si fuera fácil, todo el mundo lo haría.', author: null },
  { text: 'Estar incómodo es el precio del crecimiento.', author: null },
  { text: 'No esperes a estar motivado. Actúa y la motivación vendrá.', author: null },
  { text: 'La mejor versión de ti se construye día a día.', author: null },
  { text: 'El hierro no miente. Siempre te da lo que mereces.', author: 'Henry Rollins' },
  { text: 'Más fuerte que ayer, más listo que mañana.', author: null },
];

function getDailyQuote() {
  const today = new Date().toISOString().slice(0, 10);
  const saved = localStorage.getItem('blQuoteDate');
  let idx;
  if (saved === today) {
    idx = parseInt(localStorage.getItem('blQuoteIdx')) || 0;
  } else {
    idx = Math.floor(Math.random() * QUOTES.length);
    localStorage.setItem('blQuoteDate', today);
    localStorage.setItem('blQuoteIdx', idx);
  }
  return QUOTES[idx];
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7) return `Hace ${diff} días`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function setRing(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const clamped = Math.min(Math.max(pct, 0), 1);
  el.setAttribute('stroke-dashoffset', CIRCUMFERENCE * (1 - clamped));
}

function calcStreak(workouts) {
  if (!workouts.length) return 0;
  const dates = [...new Set(workouts.map(w => w.date))].sort().reverse();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let check = new Date(today);

  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((check - d) / 86400000);
    if (diff <= 1) {
      streak++;
      check = d;
    } else {
      break;
    }
  }
  return streak;
}

export function renderDashboard(db) {
  const weekStart = getWeekStart();
  const weekWorkouts = db.workouts.filter(w => new Date(w.date + 'T12:00:00') >= weekStart);

  // Volume: total kg lifted this week
  let totalKg = 0;
  for (const w of weekWorkouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        const kg = parseFloat(s.kg) || 0;
        const reps = parseInt(s.reps) || 0;
        totalKg += kg * reps;
      }
    }
  }

  const volumeGoal = 50000; // 50 tons weekly goal
  const volumeEl = document.getElementById('dashVolumeValue');
  if (volumeEl) volumeEl.textContent = totalKg >= 1000 ? `${(totalKg / 1000).toFixed(1)}t` : `${Math.round(totalKg)} kg`;
  setRing('dashVolumeRing', totalKg / volumeGoal);

  // Sessions this week
  const sessionCount = weekWorkouts.length;
  const sessionGoal = 4;
  const sessionsEl = document.getElementById('dashSessionsValue');
  if (sessionsEl) sessionsEl.textContent = `${sessionCount}/${sessionGoal}`;
  setRing('dashSessionsRing', sessionCount / sessionGoal);

  // Streak
  const streak = calcStreak(db.workouts);
  const streakEl = document.getElementById('dashStreakValue');
  const streakSub = document.getElementById('dashStreakSub');
  if (streakEl) streakEl.textContent = `${streak} ${streak === 1 ? 'día' : 'días'}`;
  if (streakSub) streakSub.textContent = streak === 0 ? 'Empieza hoy' : streak >= 7 ? 'Imparable' : 'Sigue así';

  // Greeting based on time
  const hour = new Date().getHours();
  const greetEl = document.getElementById('dashGreeting');
  if (greetEl) {
    const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    greetEl.textContent = greeting;
  }

  // Daily quote
  const quoteEl = document.getElementById('dashQuote');
  if (quoteEl) {
    const q = getDailyQuote();
    quoteEl.textContent = q.author ? `"${q.text}" — ${q.author}` : `"${q.text}"`;
  }

  // Recent activity (last 5 workouts)
  const recent = [...db.workouts].reverse().slice(0, 5);
  const listEl = document.getElementById('dashActivityList');
  if (!listEl) return;

  if (!recent.length) {
    listEl.innerHTML = '<div class="dash-empty">Sin actividad aún</div>';
    return;
  }

  listEl.innerHTML = recent.map(w => {
    const hasPR = w.prs && w.prs.length > 0;
    const topExercises = w.exercises.slice(0, 2).map(e => esc(e.name)).join(', ');
    const totalSets = w.exercises.reduce((sum, e) => sum + e.sets.length, 0);
    return `<div class="dash-act-card${hasPR ? ' has-pr' : ''}">
      <div class="dash-act-name">${esc(w.session)}</div>
      <div class="dash-act-detail">${topExercises}</div>
      <div class="dash-act-detail">${totalSets} series</div>
      <div class="dash-act-time">${formatDate(w.date)}</div>
    </div>`;
  }).join('');
}
