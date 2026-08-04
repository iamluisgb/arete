// Presupuesto de contexto por turno (js/ai/context.js). Lo que se prueba aquí es
// que la conversación que VIAJA al modelo no crezca sin techo: es un fallo que no
// se ve —solo se paga— y por eso conviene tenerlo clavado con tests.
import { describe, it, expect } from 'vitest';
import { windowConversation, toApiMessages, estimateTokens, HISTORY_MSGS } from '../js/ai/context.js';

const u = (c) => ({ role: 'user', content: c });
const a = (c) => ({ role: 'assistant', content: c });
const d = (c) => ({ role: 'data', content: c });

describe('windowConversation', () => {
  it('descarta los volcados de herramientas de turnos anteriores', () => {
    const convo = [u('p1'), d('volcado viejo'), a('r1'), u('p2')];
    const out = windowConversation(convo);
    expect(out.some(m => m.role === 'data')).toBe(false);
    expect(out.map(m => m.content)).toEqual(['p1', 'r1', 'p2']);
  });

  it('conserva los datos del turno en curso', () => {
    const convo = [u('p1'), a('r1'), u('p2'), d('volcado fresco')];
    const out = windowConversation(convo);
    expect(out.at(-1)).toEqual(d('volcado fresco'));
  });

  it('limita la ventana a los últimos N mensajes', () => {
    const convo = [];
    for (let i = 0; i < 20; i++) convo.push(u('p' + i), a('r' + i));
    const out = windowConversation(convo);
    expect(out).toHaveLength(HISTORY_MSGS);
    expect(out.at(-1).content).toBe('r19');
  });

  it('respeta un tamaño de ventana explícito', () => {
    const convo = [u('p1'), a('r1'), u('p2'), a('r2')];
    expect(windowConversation(convo, { maxMsgs: 2 }).map(m => m.content)).toEqual(['p2', 'r2']);
  });

  it('no rompe con una conversación vacía', () => {
    expect(windowConversation([])).toEqual([]);
  });

  it('con solo datos y sin pregunta previa, no los da por frescos', () => {
    // lastUser = -1 → todos los índices son > -1, así que los datos sobreviven:
    // es el caso del informe, que adjunta su blob antes de preguntar nada.
    expect(windowConversation([d('informe')])).toHaveLength(1);
  });
});

describe('toApiMessages', () => {
  it('convierte data en user con prefijo (nan solo admite system en el índice 0)', () => {
    const [msg] = toApiMessages([d('volcado')]);
    expect(msg.role).toBe('user');
    expect(msg.content).toContain('DATOS DEL HISTÓRICO');
    expect(msg.content).toContain('volcado');
  });

  it('deja user y assistant intactos y sin campos extra', () => {
    const out = toApiMessages([{ role: 'user', content: 'hola', label: 'etiqueta', proposals: [1] }]);
    expect(out).toEqual([{ role: 'user', content: 'hola' }]);
  });
});

describe('estimateTokens', () => {
  it('estima ~4 caracteres por token', () => {
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });
  it('tolera vacío y nulo', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
  });
});
