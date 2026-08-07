// Escenarios de eval de Quirón. Viven aparte del runner (como las baterías de
// bookreader) porque son la especificación de lo que el agente debe hacer: se leen y se
// discuten sin tener que leer el código que los ejecuta.
//
// Campos:
//   prompt        lo que escribe el atleta
//   desc          el criterio en una frase (sale en el informe)
//   expectTool    herramienta que DEBE pedirse   ─┐ ruteo: fallo duro, es donde
//   banTool       herramientas que NO debe pedir ─┘ equivocarse escribe en el sitio que no toca
//   expectBlock   'RESUMEN' | 'SESION' — el formato del SOUL que debe emitir (fallo duro)
//   grounded      true → toda cifra con unidad de la respuesta debe estar respaldada por
//                 el snapshot o por un resultado de herramienta (fallo duro). Se marca
//                 solo en preguntas DESCRIPTIVAS: en una prescripción las cargas son
//                 nuevas por definición y no pueden estar en los datos.
//   ok / ban      expectativas blandas (regex). No capan la nota; señalan para revisión.
//
// Las señales que interrogan estos escenarios están PLANTADAS en el fixture sintético
// (evals/fixtures/synth.mjs) y verificadas allí: press de banca estancado desde la
// semana 20, pico de carga en la última semana, cero carrera en 28 días.

export const SCENARIOS = [
  // ── Lectura de datos ──────────────────────────────────────────────────────
  {
    id: 'hoy',
    prompt: '¿Qué toca hoy?',
    desc: 'Debe apoyarse en el programa activo (Areté, fase Fuerza, sesiones A y B), no improvisar un plan.',
    ok: [/Sesión A|Sesión B|Areté/i],
    grounded: true,
  },
  {
    id: 'semana',
    prompt: 'Analiza mis últimas 4 semanas y dame el resumen.',
    desc: 'Formato RESUMEN con el tonelaje y la carga reales del periodo.',
    expectBlock: 'RESUMEN',
    grounded: true,
  },
  {
    id: 'estancado',
    prompt: '¿En qué ejercicios estoy estancado? Mira el histórico antes de responder.',
    desc: 'El press de banca lleva 14 semanas sin mover el e1RM y fallando la última serie. Debe detectarlo y no confundirlo con la sentadilla, que sí progresa.',
    ok: [/[Pp]ress de [Bb]anca/],
    ban: [/[Ss]entadilla.{0,40}estanc/i],
    grounded: true,
  },
  {
    id: 'descarga',
    prompt: '¿Necesito una descarga esta semana?',
    desc: 'El ratio de carga aguda/crónica está en 1.45 (pico). Debe razonar con ese número, no con una impresión.',
    ok: [/1[.,]4|ratio/i],
    grounded: true,
  },
  {
    id: 'no-inventa',
    prompt: '¿Cuántos kilómetros he corrido esta semana?',
    desc: 'No hay ni una carrera en 33 días: debe decir que no hay registros, no estimar.',
    ok: [/\b(0|cero|ning|no has|sin registro)/i],
    ban: [/has corrido \d+([.,]\d+)? ?km/i],
    grounded: true,
  },
  {
    id: 'pr-reciente',
    prompt: '¿He hecho algún PR este mes?',
    desc: 'Hay PRs de Peso Muerto, Sentadilla, Clean y Press Militar en los últimos 30 días. Ninguno de Press de Banca.',
    ok: [/Peso Muerto|Sentadilla/],
    ban: [/PR.{0,30}[Pp]ress de [Bb]anca/],
    grounded: true,
  },

  // ── Ruteo de escritura ────────────────────────────────────────────────────
  // Tres frases casi iguales, tres destinos distintos. Equivocarse aquí no es un error
  // de formato: es escribir en el sitio que no toca.
  {
    id: 'ruteo-sesion',
    prompt: 'Prepárame una sesión de pierna para hoy, tengo 45 minutos.',
    desc: 'Una sesión para hacer hoy → propose_session (ni plan, ni registro).',
    expectTool: 'propose_session',
    banTool: ['propose_program', 'log_workout'],
  },
  {
    id: 'ruteo-sesion-sin-material',
    prompt: 'Hoy no puedo ir al gimnasio. Dame algo que pueda hacer en casa con una kettlebell.',
    desc: 'Petición implícita de UNA sesión, sin decir la palabra "sesión".',
    expectTool: 'propose_session',
    banTool: ['propose_program'],
  },
  {
    id: 'ruteo-plan',
    prompt: 'Hazme un plan de 8 semanas para subir la sentadilla, 3 días por semana.',
    desc: 'Varias semanas y progresión → propose_program.',
    expectTool: 'propose_program',
    banTool: ['propose_session'],
  },
  {
    id: 'ruteo-registro',
    prompt: 'Hoy he hecho sentadilla 5x5 a 100 y press banca 3x5 a 70.',
    desc: 'Entreno en pasado → log_workout, nunca una propuesta.',
    expectTool: 'log_workout',
    banTool: ['propose_session', 'propose_program'],
  },

  // ── Prescripción en la respuesta ──────────────────────────────────────────
  // Aquí NO se pide una tool de escritura: se pide que escriba la sesión en el chat, que
  // es donde aplican el formato del SOUL y la plausibilidad de las cargas.
  {
    id: 'prescribe',
    prompt: 'Escríbeme aquí mismo, sin guardar nada, la sesión de fuerza que me tocaría mañana con las cargas concretas.',
    desc: 'Formato SESIÓN, cargas calibradas con su e1RM (sentadilla 128 kg, press 85 kg) y sin prosa dentro del bloque.',
    expectBlock: 'SESION',
    banTool: ['propose_program'],
  },
  {
    id: 'plan-objetivo',
    prompt: 'Quiero preparar un ultra de 100K de montaña para dentro de 9 meses. ¿Cómo enfocarías mi plan viniendo de donde vengo?',
    desc: 'Debe ir a buscar el histórico de carrera con las tools (el snapshot reciente está vacío) y partir de ahí, no de un plan genérico.',
    ok: [/[Zz]2|rodaje|volumen|progres/],
    expectCall: 'get_runs',
  },
];

export const byId = (ids) => (ids?.length ? SCENARIOS.filter(s => ids.includes(s.id)) : SCENARIOS);
