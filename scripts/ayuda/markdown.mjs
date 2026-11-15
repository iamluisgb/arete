// Render de Markdown del subconjunto que usa la ayuda de Areté.
//
// No es CommonMark ni pretende serlo: es el subconjunto cerrado que escriben los
// artículos —encabezados, párrafos, listas, tablas, citas, código, énfasis,
// enlaces, imágenes y bloques de HTML a mano (portada y avisos)—. Cerrar el
// subconjunto es lo que permite no meter una dependencia en un repo que se sirve
// tal cual, y que `tests/ayuda.test.js` pueda exigir que no quede sintaxis sin
// renderizar.
//
// Lo que NO se soporta, a propósito: listas anidadas, HTML inline mezclado con
// markdown en la misma línea, notas al pie y tablas dentro de listas.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s) => String(s).replace(/[&<>"]/g, c => ESC[c]);

/** Id de encabezado, igual que los anclajes que se escriben en los artículos. */
export const slug = (s) => String(s)
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s-]/g, '')
  .trim().replace(/\s+/g, '-');

/** En línea: código, imágenes, enlaces, negrita y cursiva. El texto ya viene escapado. */
export function inline(raw) {
  // El código se protege primero: dentro de un `code` no hay énfasis ni enlaces.
  const code = [];
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => {
    code.push(c);
    return `\u0000${code.length - 1}\u0000`;
  });
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => {
      const ext = /^https?:/i.test(href);
      const attrs = ext ? ' rel="noopener"' : '';
      return `<a href="${href}"${attrs}>${txt}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,:;)]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${code[Number(i)]}</code>`);
}

const isTableRow = (l) => /^\|.*\|$/.test(l.trim());
const isTableSep = (l) => /^\|[\s:|-]+\|$/.test(l.trim());
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

function aligned(sep) {
  return sep.split('|').filter(c => c.trim()).map(c => {
    const t = c.trim();
    if (/^:-+:$/.test(t)) return ' style="text-align:center"';
    if (/^-+:$/.test(t)) return ' style="text-align:right"';
    return '';
  });
}

/**
 * Render de un documento completo a HTML.
 * `{{clave}}` queda tal cual: lo sustituye el generador con bloques que salen del código.
 */
export function render(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
    buf.length = 0;
  };
  const para = [];

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // Línea en blanco
    if (!t) { flushParagraph(para); i++; continue; }

    // Bloque de código
    if (/^```/.test(t)) {
      flushParagraph(para);
      const lang = t.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      i++; // cierre
      const cls = lang ? ` class="language-${esc(lang)}"` : '';
      out.push(`<pre><code${cls}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Encabezados
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      flushParagraph(para);
      const lvl = h[1].length;
      // h1 es el título del artículo y ya lo pone la plantilla: en el cuerpo se degrada.
      const level = lvl === 1 ? 2 : lvl;
      out.push(`<h${level} id="${slug(h[2])}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Separador
    if (/^(-{3,}|\*{3,})$/.test(t)) { flushParagraph(para); out.push('<hr>'); i++; continue; }

    // Cita
    if (/^>\s?/.test(t)) {
      flushParagraph(para);
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inline(body.join(' '))}</blockquote>`);
      continue;
    }

    // Tabla
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushParagraph(para);
      const head = cells(line);
      const align = aligned(lines[i + 1]);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push('<div class="doc-table"><table><thead><tr>'
        + head.map((c, k) => `<th${align[k] || ''}>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map((c, k) => `<td${align[k] || ''}>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table></div>');
      continue;
    }

    // Listas (un solo nivel)
    const ul = /^[-*]\s+/.test(t);
    const ol = /^\d+[.)]\s+/.test(t);
    if (ul || ol) {
      flushParagraph(para);
      const items = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (ul ? /^[-*]\s+/.test(cur) : /^\d+[.)]\s+/.test(cur)) {
          items.push(cur.replace(ul ? /^[-*]\s+/ : /^\d+[.)]\s+/, ''));
          i++;
        } else if (cur && !/^[-*]\s|^\d+[.)]\s/.test(cur) && /^\s{2,}/.test(lines[i])) {
          // continuación indentada del mismo ítem
          items[items.length - 1] += ' ' + cur;
          i++;
        } else break;
      }
      const tag = ul ? 'ul' : 'ol';
      out.push(`<${tag}>${items.map(x => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // Bloque de HTML a mano: las líneas que empiezan por `<` se emiten tal cual,
    // hasta una línea en blanco. Así la portada y los avisos usan HTML semántico.
    if (/^</.test(t) && !/^<!--/.test(t)) {
      flushParagraph(para);
      const block = [];
      while (i < lines.length && lines[i].trim() !== '') block.push(lines[i++]);
      out.push(block.join('\n'));
      continue;
    }

    // Comentario suelto (directiva del generador)
    if (/^<!--/.test(t) && /-->/.test(t)) { flushParagraph(para); out.push(t); i++; continue; }

    para.push(t);
    i++;
  }
  flushParagraph(para);
  return out.join('\n');
}

/** Texto plano de un markdown, para el índice de búsqueda y la meta description. */
export function plain(md) {
  return String(md)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>|]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\{\{[^}]+\}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
