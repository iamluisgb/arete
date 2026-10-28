// El sistema de diseño, ejecutable.
//
// DESIGN_SYSTEM.md son 900 líneas de doctrina. Una doctrina que no se puede
// comprobar se incumple sola: en un año esta hoja acumuló 48 versalitas, 36
// tamaños de letra fuera de escala y tres tokens inexistentes (`--radius`,
// `--color-border`, `--color-text`) que dejaban bordes transparentes y radios
// cuadrados sin que fallara nada.
//
// Estas reglas convierten el documento en tests. **Si un test te frena, no lo
// relajes**: crea el token o usa el patrón. Los techos ("solo puede bajar")
// existen porque arreglar 36 tamaños de golpe no es un cambio, es un rediseño:
// se congelan los que hay y se impide que entren nuevos.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(process.cwd(), 'app.css'), 'utf-8');
// Fuera comentarios: llevan ejemplos de código que romperían todos los conteos.
const SIN_COMENTARIOS = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Todas las declaraciones `propiedad: valor` del fichero, con algo de contexto. */
function declaraciones(prop) {
  return [...SIN_COMENTARIOS.matchAll(new RegExp(`${prop}\\s*:\\s*([^;}]+)`, 'g'))]
    .map(m => m[1].trim());
}

describe('design system: tokens', () => {
  it('toda var(--x) sin fallback está definida', () => {
    // Un var() sin definir no da error: resuelve a "sin valor". Un fondo se
    // queda transparente y un borde desaparece, en silencio.
    const definidas = new Set(
      [...SIN_COMENTARIOS.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1])
    );
    const usadas = [...SIN_COMENTARIOS.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/gi)];
    const sinDefinir = [...new Set(
      usadas.filter(m => !m[2] && !definidas.has(m[1])).map(m => m[1])
    )].sort();
    expect(sinDefinir, `tokens usados y no definidos: ${sinDefinir.join(', ')}`).toEqual([]);
  });
});

describe('design system: escala tipográfica', () => {
  // Literales que quedan hoy y su porqué. Solo pueden BAJAR: si arreglas uno,
  // quítalo de aquí. Si añades uno nuevo, el test falla — y esa es la idea.
  const TOLERADOS = new Set([
    '16px',       // html{font-size}: la raíz del rem, no es texto
    '.6875rem',   // nav a 320px (max-width:359): 11px para que quepan 6 pestañas
    '.6rem',      // .hi-plan: chip de plan en el historial
    '.68rem',     // .q-code: monoespaciado del chat
    // Cifras del entrenador de series: se leen a un metro, en movimiento, y su
    // tamaño forma parte del diseño de esa pantalla, no del texto de la app.
    '3.4rem',     // .sr-time: el cronómetro
    '4rem',       // .sr-in (peso y reps) y .hiit-prep-count (cuenta atrás)
    // Glifos de 7-8px dentro de las celdas del calendario, donde un icono de
    // 14 no cabe. No son iconos de interfaz: son marcas de densidad.
    '8px', '7px',
  ]);

  it('font-size solo con --fs-*, --type-* o --icon-*', () => {
    const fuera = declaraciones('font-size').filter(v =>
      !/^var\(--(fs|type|icon)-/.test(v) && !TOLERADOS.has(v)
    );
    expect(fuera, `tamaños fuera de escala: ${[...new Set(fuera)].join(', ')}`).toEqual([]);
  });
});

describe('design system: forma', () => {
  it('border-radius solo con --radius-*, 0 o 50%', () => {
    const fuera = declaraciones('border-radius').filter(v =>
      // `inherit` es legítimo: la barra de una píldora hereda su radio.
      !/var\(--radius-/.test(v) && !/^(0|50%|0!important|50%!important|inherit)$/.test(v)
    );
    expect(fuera, `radios a mano: ${[...new Set(fuera)].join(', ')}`).toEqual([]);
  });
});

describe('design system: capas', () => {
  it('z-index solo con --z-* (enteros ≤ 10 dentro de un componente)', () => {
    const fuera = declaraciones('z-index').filter(v => {
      if (/var\(--z-/.test(v)) return false;
      const n = parseInt(v, 10);
      return !(Number.isFinite(n) && n <= 10);
    });
    expect(fuera, `z-index sueltos: ${[...new Set(fuera)].join(', ')}`).toEqual([]);
  });
});

describe('design system: breakpoints', () => {
  // Los de §4.1 del documento más los ajustes finos por debajo de 640, que
  // existen para 320–430px. Cualquier ancho nuevo obliga a justificarlo aquí.
  const ANCHOS = new Set([359, 399, 433, 639, 640, 700, 1024, 1440]);

  it('solo se usan los breakpoints del sistema', () => {
    const anchos = [...SIN_COMENTARIOS.matchAll(/@media[^{]*?\((?:min|max)-width\s*:\s*([\d.]+)px\)/g)]
      .map(m => Math.round(parseFloat(m[1])));
    const fuera = [...new Set(anchos.filter(a => !ANCHOS.has(a)))];
    expect(fuera, `breakpoints fuera del sistema: ${fuera.join(', ')}`).toEqual([]);
  });
});

describe('design system: color', () => {
  // Techo de colores sueltos en el CSS. Solo puede bajar. Los tokens viven en
  // @layer tokens; un hex fuera de ahí es un color que ningún tema puede cambiar.
  const TECHO_HEX = 43;

  it('no crecen los colores hex sueltos', () => {
    const hex = [...SIN_COMENTARIOS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length;
    expect(hex, `hex sueltos: ${hex} (techo ${TECHO_HEX})`).toBeLessThanOrEqual(TECHO_HEX);
  });
});
