// The markdown subset the guide drafts may use, to HTML. Deliberately small: H2/H3, paragraphs, bold, italics,
// links, one-level lists, pipe tables, blockquotes (an opening **Title** line becomes the callout title), `---`,
// and images on their own line through a hook. Anything else throws, so a draft cannot sneak in raw HTML, code
// fences or an H1. Text is escaped. Unit tests: qa/md-unit.mjs.

export const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SITE_HOST = 'strike.benryan.com.au';
const unsupported = (line) => new Error(`unsupported markdown: ${line.slice(0, 40)}`);

// Inline marks on already-escaped text: links, then bold, then italics (links first so URLs keep their characters)
export function inline(raw) {
  if (/<[a-zA-Z/!]/.test(raw) || raw.includes('`')) throw unsupported(raw);
  let s = esc(raw);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const external = /^https?:\/\//.test(url) && !url.startsWith(`https://${SITE_HOST}`);
    return `<a href="${url}"${external ? ' rel="noopener"' : ''}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s;
}

export function mdToHtml(src, { image = (s, a) => `<img src="${esc(s)}" alt="${esc(a)}" loading="lazy">` } = {}) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') { flush(); i++; continue; }
    if (/^#{1,6}\s/.test(t) || /^#+$/.test(t)) {
      const m = t.match(/^(##|###)\s+(.*)$/);
      if (!m) throw unsupported(t);
      flush();
      out.push(`<h${m[1].length} id="${slugify(m[2])}">${inline(m[2])}</h${m[1].length}>`);
      i++; continue;
    }
    if (t === '---') { flush(); out.push('<hr>'); i++; continue; }
    if (t.startsWith('```') || t.startsWith('<')) throw unsupported(t);
    const img = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (img) { flush(); out.push(image(img[2], img[1])); i++; continue; }
    if (/^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
      flush();
      const ordered = /^\d+\.\s+/.test(t);
      const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i].trim())) {
        if (/^\s+[-*\d]/.test(lines[i]) && lines[i] !== lines[i].trimStart() && items.length) throw unsupported(lines[i]); // nested list
        items.push(`<li>${inline(lines[i].trim().replace(re, ''))}</li>`); i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>\n${items.join('\n')}\n</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (t.startsWith('|')) {
      flush();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (rows.length < 2 || !/^\|?\s*:?-{3,}/.test(rows[1])) throw unsupported(rows[0]);
      const head = cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('');
      const body = rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n');
      out.push(`<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`);
      continue;
    }
    if (t.startsWith('>')) {
      flush();
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      const parts = [];
      const title = q[0].match(/^\*\*([^*]+)\*\*$/);
      if (title) { parts.push(`<p class="callout-title">${inline(title[1])}</p>`); q.shift(); }
      let buf = [];
      const end = () => { if (buf.length) { parts.push(`<p>${inline(buf.join(' '))}</p>`); buf = []; } };
      for (const l of q) { if (l.trim() === '') end(); else buf.push(l); }
      end();
      out.push(`<blockquote>\n${parts.join('\n')}\n</blockquote>`);
      continue;
    }
    para.push(t); i++;
  }
  flush();
  return out.join('\n');
}
