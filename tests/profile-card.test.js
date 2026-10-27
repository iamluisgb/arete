import { describe, it, expect, beforeEach } from 'vitest';
import { DOMAINS } from '../js/domains.js';
import {
  profileCardData, cardCopy, shareText, levelUpSince, markSeen, readSeen,
} from '../js/ui/profile-card.js';

// Un perfil con la forma de computeProfile, reducido a lo que usa la tarjeta.
const perfil = (levels) => ({
  domains: DOMAINS.map(d => ({ ...d, level: levels[d.id] ?? 0 })),
  total: DOMAINS.length,
});
const HIBRIDO = { strength: 4, pull: 3, glyco: 3, cardio: 4, kb: 3, core: 4, mobility: 2 };

describe('profileCardData', () => {
  it('el nivel global es el mínimo y el eslabón débil, ese dominio', () => {
    const { now } = profileCardData(perfil(HIBRIDO));
    expect(now.global).toBe(2);
    expect(now.weak.map(d => d.id)).toEqual(['mobility']);
    expect(now.provisional).toBe(false);
  });

  it('con empate enseña todos los eslabones débiles, no elige uno', () => {
    const { now } = profileCardData(perfil({ ...HIBRIDO, mobility: 3 }));
    expect(now.weak.map(d => d.id)).toEqual(['pull', 'glyco', 'kb', 'mobility']);
    expect(cardCopy({ now }).lineLabel).toBe('Mis eslabones débiles');
  });

  it('un dominio sin medir no cuenta como nivel 0: el perfil es provisional', () => {
    const { now } = profileCardData(perfil({ strength: 3, pull: 4, cardio: 3 }));
    expect(now.global).toBe(3);
    expect(now.measured).toBe(3);
    expect(cardCopy({ now }).note).toBe('Provisional · 3 de 7 dominios medidos');
  });

  it('la forma de antes solo difiere en el dominio que sube', () => {
    const p = perfil({ ...HIBRIDO, mobility: 3 });
    const card = profileCardData(p, { raised: p.domains.find(d => d.id === 'mobility'), from: 2 });
    expect(card.before.levels).toEqual({ ...card.now.levels, mobility: 2 });
    expect(card.before.global).toBe(2);
    expect(card.now.global).toBe(3);
  });
});

describe('cardCopy', () => {
  it('si la subida sube el nivel global, dice qué ha dejado de frenar', () => {
    const p = perfil({ ...HIBRIDO, mobility: 3 });
    const c = cardCopy(profileCardData(p, { raised: p.domains.find(d => d.id === 'mobility'), from: 2 }));
    expect(c.hero).toBe('III');
    expect(c.heroName).toBe('Intermedio');
    expect(c.lineLabel).toBe('Ya no me frena');
    expect(c.line).toBe('Movilidad funcional');
  });

  it('si sube un dominio que no limitaba, cuenta la subida del dominio', () => {
    const p = perfil({ ...HIBRIDO, cardio: 5 });
    const c = cardCopy(profileCardData(p, { raised: p.domains.find(d => d.id === 'cardio'), from: 4 }));
    expect(c.hero).toBe('V');
    expect(c.lineLabel).toBe('Sube');
    expect(c.line).toBe('IV → V');
  });

  it('el texto de compartir lleva el enlace con su origen', () => {
    expect(shareText(profileCardData(perfil(HIBRIDO))))
      .toBe('Mi eslabón débil: Movilidad funcional. ¿Cuál es el tuyo? https://arete.raiatech.com/?ref=perfil');
  });
});

describe('subidas de nivel', () => {
  beforeEach(() => localStorage.clear());

  it('sin nada visto no hay subida: la primera vez solo se apunta', () => {
    expect(levelUpSince(null, perfil(HIBRIDO))).toBeNull();
  });

  it('medir un dominio por primera vez no es una subida', () => {
    expect(levelUpSince({ ...HIBRIDO, mobility: 0 }, perfil(HIBRIDO))).toBeNull();
  });

  it('si suben varios, gana el que venía más abajo', () => {
    const up = levelUpSince(HIBRIDO, perfil({ ...HIBRIDO, mobility: 3, cardio: 5 }));
    expect(up.raised.id).toBe('mobility');
    expect(up.from).toBe(2);
  });

  it('lo visto guarda el máximo: bajar y volver no se celebra dos veces', () => {
    markSeen(perfil(HIBRIDO));
    markSeen(perfil({ ...HIBRIDO, strength: 3 }));   // sube el peso corporal, baja el ratio
    expect(readSeen().strength).toBe(4);
    expect(levelUpSince(readSeen(), perfil(HIBRIDO))).toBeNull();
  });
});

describe('eslabones empatados', () => {
  it('con tres o más usa los nombres cortos', () => {
    const { now } = profileCardData(perfil({ ...HIBRIDO, mobility: 3 }));
    expect(cardCopy({ now }).line).toBe('Tracción · Glicolítico · Res. fuerza · Movilidad');
  });
});
