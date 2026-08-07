// La LÓGICA de las comprobaciones deterministas, pura y sin I/O, para que tenga tests
// propios (`tests/evals-checks.test.js`). Un comprobador sin comprobar es un comprobador
// que dice "todo bien": si el regex de cifras no casa nunca, el check pasa siempre y
// parece que el agente es perfecto. Los tests le dan de comer respuestas fabricadas a
// mano y exigen que las cace.
//
// `check.mjs` es el CLI que carga el fixture, llama aquí y escribe el informe.

// ── Texto: bloques de código vs prosa ───────────────────────────────────────
const FENCE = /```[^\n]*\n([\s\S]*?)```/g;
export const fences = (s) => [...String(s).matchAll(FENCE)].map(m => m[1]);
export const prose = (s) => String(s).replace(FENCE, ' ');
export const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ── Cifras con unidad ───────────────────────────────────────────────────────
// Se comparan por UNIDAD, no como números sueltos. Es la diferencia entre un check que
// sirve y uno que no: en un histórico de 94 sesiones casi cualquier entero aparece en
// algún sitio, así que "18" siempre estaría "respaldado". "18 km" no.
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const UNIT_RE = new RegExp(String.raw`(${NUM})\s*(kg|km|ppm|%)\b`, 'gi');
// Hasta 30 caracteres entre "ratio" y su cifra: cabe la forma del snapshot ("ratio de
// carga aguda/crónica: 1.45") y la que escribe el modelo ("tu ratio de carga está en
// 0.92"). Con un margen corto la segunda no casaba y el check no miraba nada — lo cazó
// un test, que para eso están.
// La cifra tiene que llevar DECIMAL: loadRatio() siempre devuelve dos decimales, así que
// un entero a esa distancia es otra cosa ("el ratio alto y la acumulación de 4 sesiones"
// no habla de un ratio de 4). Con la ventana ancha y sin este filtro, ese "4" se
// denunciaba como cifra inventada.
const RATIO_RE = new RegExp(String.raw`ratio[^\d\n]{0,30}(\d+[.,]\d+)`, 'gi');
const LOAD_PAIR_RE = new RegExp(String.raw`(${NUM})\s*[×x]\s*\d+`, 'gi');
const n = (s) => parseFloat(String(s).replace(',', '.'));

// El modelo separa los millares de las dos formas que se usan en español: con espacio
// ("40 958 kg") y con punto ("13.682 kg"). Sin unir esos grupos, el extractor lee "958 kg"
// o "13.682" como un decimal y denuncia una cifra que nadie escribió.
//
// El punto es ambiguo —también es el separador decimal— así que solo se une cuando la
// forma es inequívoca como millar: 1-3 dígitos, punto, exactamente 3 dígitos y nada más
// detrás. "1.45" (dos decimales) no casa; "13.682" sí. Los casos que siguen siendo
// ambiguos ("1.450") los cubre `supported`, que prueba las dos lecturas.
export const joinThousands = (s) => String(s)
  .replace(/(\d)[\s\u202f\u00a0](\d{3})(?!\d)/g, '$1$2')
  .replace(/\b(\d{1,3})\.(\d{3})\b(?![.,]?\d)/g, '$1$2');

/** Todas las cifras con unidad de un texto, agrupadas por unidad. */
export function numbersOf(raw) {
  const text = joinThousands(raw);
  const out = { kg: [], km: [], ppm: [], '%': [], ratio: [] };
  for (const m of String(text).matchAll(UNIT_RE)) out[m[2].toLowerCase()].push(n(m[1]));
  for (const m of String(text).matchAll(RATIO_RE)) out.ratio.push(n(m[1]));
  // "110×5" en los volcados es carga×reps. Por debajo de 20 casi siempre es series×reps
  // ("3×5"), que no es una carga: se descarta para no meter ruido en el soporte.
  for (const m of String(text).matchAll(LOAD_PAIR_RE)) { const v = n(m[1]); if (v >= 20) out.kg.push(v); }
  return out;
}

// Tolerancia SEGÚN LA PRECISIÓN DECLARADA. El modelo redondea (151.7 → 152, 1.45 → 1.4)
// y eso no es inventar; pero una tolerancia fija en kilos daba por bueno un ratio de 0.92
// donde el real era 1.45, porque medio kilo y media unidad de ratio no son lo mismo.
// Así que el margen es media unidad del último decimal que el modelo escribió, o un 2%
// del dato real, lo que sea mayor: quien dice "1.4" pide que se le compare con una
// décima; quien dice "0.92", con una centésima.
export const supported = (value, pool = []) => {
  const text = String(value);
  const decimals = (text.split('.')[1] || '').length;
  const step = 0.5 * 10 ** -decimals;
  const v = parseFloat(text);
  // El epsilon es por el binario: |1.4 - 1.45| sale 0.050000000000000044.
  return pool.some(m => Math.abs(v - m) <= Math.max(step, Math.abs(m) * 0.02) + 1e-9);
};

// Cifras que NO afirman nada sobre el pasado: prescripciones, deltas y rangos
// ("+2.5 kg", "sube a 75 kg", "empieza con 4-5 km"). Por definición no pueden estar en
// los datos, así que exigirles respaldo convertiría el check en ruido — y un check
// ruidoso se acaba ignorando, que es peor que no tenerlo. El sesgo es deliberado: este
// check persigue el INFORME fabricado ("has corrido 18 km"), no la recomendación.
const PRESCRIPTIVE = new RegExp([
  'sub[ei]r?', 'baja', 'bajar', 'anad', 'increment', 'reduc', 'proxim', 'proxim', 'siguiente',
  'objetivo', 'prueba', 'haz', 'pasa a', 'sumar', 'empieza', 'empezar', 'comienza', 'arranca',
  'introduc', 'reintroduc', 'retoma', 'recomiend', 'propong', 'propuest', 'sugier', 'ajusta',
  'limita', 'planifica', 'toca', 'respeta', 'progresion de', 'no fuerces',
  'no pases de', 'maximo', 'maximo', 'descarga a', 'prioriz', 'mant[ée]n', 'consolida',
  'mete', 'no menos de', String.raw`al \d+ ?%`,
].join('|'), 'i');

// El alcance es la FRASE, no una ventana de caracteres. Una recomendación encadena varias
// cifras — "baja sentadilla a 85 kg, peso muerto a 105 kg, banca a 60 kg, militar a 35 kg"—
// y con una ventana corta el verbo queda fuera para las últimas: se denunciaban como
// inventadas tres cargas de la misma frase prescriptiva. Ensanchar la ventana a ciegas
// arrastraba texto de la frase anterior; cortar por la frase es lo que corresponde.
// Distancias canónicas de carrera. "no lo sostienes 21 km" habla de la media maratón, no
// de lo que el atleta corrió: es conocimiento general, no una afirmación sobre sus datos.
const RACE_KM = [5, 10, 21, 21.1, 42, 42.2, 100];

const BULLET = /^\s*(?:[-*·•]|\d+[.)])\s/;

/**
 * Índice del último fin de frase real. Un punto SOLO cierra frase si le sigue un espacio
 * o el final: en este dominio casi todo lleva decimales ("58.3", "2.5 kg") y tomar ese
 * punto como frontera dejaba fuera el verbo que gobierna la cifra. Era la causa de fondo
 * de varios falsos positivos de `cifras`, no un caso raro: cualquier recomendación con un
 * decimal delante perdía su contexto.
 */
function lastSentenceEnd(s) {
  let out = -1;
  for (let i = 0; i < s.length; i++) {
    if ('.!?'.includes(s[i]) && (i + 1 >= s.length || /[\s)"'»]/.test(s[i + 1]))) out = i;
  }
  return out;
}

export function isPrescriptive(text, index) {
  const upto = text.slice(0, index);
  const lines = upto.split('\n');

  // Las recomendaciones se escriben en lista ("**Propuesta:** semana suave. En números:"
  // y debajo las viñetas), así que el verbo se queda en la línea que las introduce. Si la
  // cifra va en una viñeta se sube hasta esa línea y se toma ENTERA: una línea que
  // encabeza una lista gobierna toda la lista. Sin esto, cada viñeta de una misma
  // recomendación se juzgaba como una afirmación suelta sobre el pasado — y en la primera
  // batería completa eso denunció tres cargas de una sola frase prescriptiva.
  let i = lines.length - 1;
  const enLista = BULLET.test(lines[i]);
  while (i > 0 && BULLET.test(lines[i])) i--;

  const head = lines[i];
  const cut = enLista ? 0 : Math.max(lastSentenceEnd(head), head.length - 220);
  const sentence = head.slice(Math.max(0, cut)) + '\n' + lines.slice(i + 1).join('\n');

  // `4-5 km`, `≤ 5 km`: la cifra es el extremo de un rango o de un tope, no un dato.
  // Sin acentos: "bájalas 2.5 kg" no casaba con `baja` y la carga se denunciaba como dato.
  return PRESCRIPTIVE.test(norm(sentence)) || /[+\-–≤≥<>~]\s*$/.test(upto);
}

// Líneas de prescripción del formato SESIÓN del SOUL: "[ejercicio] [sets]×[reps] a [kg]".
export const PRESCRIPTION_RE = new RegExp(
  String.raw`^\s*(?:(?:trabajo|accesorio|calentamiento)\s*:)?\s*(.+?)\s+\d+\s*[×x]\s*\S+\s+a\s+(${NUM})\s*kg`, 'i');

// Español vs inglés por stopwords: suficiente para el único fallo que importa aquí.
const ES = /\b(el|la|los|las|de|del|que|una?|es|por|para|con|se|su|tu|y)\b/gi;
const EN = /\b(the|of|and|to|is|in|that|for|with|as|its?|are|your)\b/gi;

/** Verdad del fixture contra la que se contrasta: e1RM, PRs y vocabulario. */
export function buildTruth({ rms = {}, prs = [], known = new Set() } = {}) {
  return {
    rms,
    prs,
    knownNorm: new Set([...known].map(norm)),
    /** e1RM del ejercicio cuyo nombre más se parece al prescrito (por inclusión). */
    e1rmFor(name) {
      const q = norm(name);
      if (!q) return null;
      let best = null;
      for (const [k, v] of Object.entries(rms)) {
        const kn = norm(k);
        if ((kn.includes(q) || q.includes(kn)) && v.best && (!best || v.best.rm > best.rm)) {
          best = { name: k, rm: v.best.rm };
        }
      }
      return best;
    },
  };
}

/**
 * Comprueba un escenario contra su resultado.
 * @param {Object} sc  escenario (evals/scenarios.mjs)
 * @param {Object} r   resultado del run: { answer, snapshot, calls, proposals, error }
 * @param {Object} truth  el de buildTruth()
 * @returns {{hard: Array, soft: Array}}  cada check: { name, ok, detail }
 */
export function checkScenario(sc, r, truth) {
  const hard = [], soft = [];
  const add = (list, name, ok, detail = '') => list.push({ name, ok, detail });
  const answer = r.answer || '';
  const names = (r.calls || []).map(c => c.name);
  const blocks = fences(answer);

  if (r.error) {
    add(hard, 'ejecución', false, r.error);
    return { hard, soft };
  }

  // ── ruteo ────────────────────────────────────────────────────────────────
  if (sc.expectTool) {
    add(hard, 'ruteo', names.includes(sc.expectTool),
      `esperaba ${sc.expectTool}, pidió ${names.join(', ') || 'nada'}`);
  }
  for (const t of (sc.banTool || [])) {
    if (names.includes(t)) add(hard, 'ruteo', false, `no debía pedir ${t}`);
  }
  if (sc.expectCall) {
    add(hard, 'herramienta', names.includes(sc.expectCall),
      `esperaba ${sc.expectCall}, pidió ${names.join(', ') || 'nada'}`);
  }

  // Un turno que acaba en propuesta acaba en la tarjeta de confirmación: no hay respuesta
  // que analizar, y el resto de checks no aplica. La condición es que HAYA propuesta, no
  // que el escenario la esperase: un escenario de lectura al que el modelo responde con
  // una propuesta también sale por aquí, y antes se le apuntaba "respuesta vacía", que
  // describe el síntoma y esconde la causa. Si esa deriva no debe ocurrir, se declara con
  // `banTool` — que es un fallo de ruteo, no de contenido.
  //
  // Lo que sí se exige es que la intención viaje con sustancia: una `goal` de cuatro
  // palabras produce un plan genérico por muy correcto que sea el ruteo.
  const proposals = r.proposals || [];
  if (sc.expectTool || proposals.length) {
    const p = proposals[0];
    const text = (p?.goal || p?.description || '').trim();
    add(hard, 'propuesta', !!p && text.length > 15,
      p ? `descripción demasiado corta: "${text.slice(0, 40)}"` : 'no se registró propuesta');
    return { hard, soft };
  }

  add(hard, 'no-vacía', answer.trim().length > 0, 'respuesta vacía');
  if (!answer.trim()) return { hard, soft };

  // ── idioma ───────────────────────────────────────────────────────────────
  const es = (answer.match(ES) || []).length, en = (answer.match(EN) || []).length;
  add(hard, 'idioma', es >= en, `parece inglés (es:${es} en:${en})`);

  // ── formato del bloque ───────────────────────────────────────────────────
  if (sc.expectBlock) {
    const want = sc.expectBlock === 'SESION' ? /^\s*SESI[ÓO]N/i : /^\s*RESUMEN/i;
    add(hard, 'formato', blocks.some(b => want.test(b)), `no emitió un bloque ${sc.expectBlock}`);
  }
  // Dentro del bloque solo va la tabla: ni markdown (no se renderiza) ni líneas largas
  // (se cortan en móvil). Es una regla explícita del SOUL que nadie estaba midiendo.
  const dirty = [];
  for (const b of blocks) {
    for (const line of b.split('\n')) {
      if (/\*\*/.test(line)) dirty.push(`markdown: "${line.trim().slice(0, 40)}"`);
      else if (/^\s*[-*]\s+\S/.test(line) && !/[─│]/.test(line)) dirty.push(`lista: "${line.trim().slice(0, 40)}"`);
      else if (line.length > 64) dirty.push(`línea de ${line.length} caracteres`);
    }
  }
  if (blocks.length) add(hard, 'bloque-limpio', dirty.length === 0, dirty.slice(0, 3).join(' · '));

  // ── cifras respaldadas ───────────────────────────────────────────────────
  if (sc.grounded) {
    const support = numbersOf(`${r.snapshot || ''}\n${(r.calls || []).map(c => c.result).join('\n')}`);
    const text = joinThousands(`${prose(answer)}\n${blocks.filter(b => /^\s*RESUMEN/i.test(b)).join('\n')}`);
    const bad = [];
    for (const m of text.matchAll(UNIT_RE)) {
      const u = m[2].toLowerCase();
      if (u === '%') continue;                        // los porcentajes son casi siempre derivados
      if (isPrescriptive(text, m.index)) continue;
      if (u === 'km' && RACE_KM.includes(n(m[1]))) continue;   // distancia de prueba, no dato suyo
      if (!supported(String(m[1]).replace(',', '.'), support[u])) bad.push(`${m[1]} ${u}`);
    }
    for (const m of text.matchAll(RATIO_RE)) {
      if (!supported(String(m[1]).replace(',', '.'), support.ratio)) bad.push(`ratio ${m[1]}`);
    }
    add(hard, 'cifras', bad.length === 0, `sin respaldo: ${[...new Set(bad)].slice(0, 5).join(', ')}`);
  }

  // ── cargas prescritas ────────────────────────────────────────────────────
  // El único check con consecuencia física: prescribir por encima del 1RM estimado no es
  // un fallo de estilo.
  const overload = [], unknownEx = [];
  for (const b of blocks) {
    for (const line of b.split('\n')) {
      const m = PRESCRIPTION_RE.exec(line);
      if (!m) continue;
      const exName = m[1].replace(/[─│|]/g, '').trim();
      const kg = n(m[2]);
      const rm = truth.e1rmFor(exName);
      if (rm && kg > rm.rm) overload.push(`${exName} ${kg} kg > e1RM ${rm.rm.toFixed(1)} kg`);
      if (exName && !truth.knownNorm.has(norm(exName))) unknownEx.push(exName);
    }
  }
  add(hard, 'carga', overload.length === 0, overload.slice(0, 3).join(' · '));
  if (unknownEx.length) {
    add(soft, 'vocabulario', false, `fuera del catálogo: ${[...new Set(unknownEx)].slice(0, 4).join(', ')}`);
  }

  // ── PR declarado vs PRs reales ───────────────────────────────────────────
  const prLine = /PR detectado\s*:\s*(.+)/i.exec(answer);
  if (prLine) {
    const claim = prLine[1].trim();
    const none = /ningun/i.test(claim);
    const ok = none ? truth.prs.length === 0 : truth.prs.some(p => norm(claim).includes(norm(p.name)));
    add(hard, 'pr', ok, `declara "${claim.slice(0, 40)}"; reales: ${truth.prs.map(p => p.name).join(', ') || 'ninguno'}`);
  }

  // ── expectativas blandas ─────────────────────────────────────────────────
  for (const re of (sc.ok || [])) add(soft, 'esperado', re.test(answer), String(re));
  for (const re of (sc.ban || [])) add(soft, 'prohibido', !re.test(answer), String(re));

  return { hard, soft };
}
