// Guide drafts (~/Dev/Strike/docs/articles/G-*.md) as data: front matter, body, the Fact sources section, the
// {{claim:id}} references, and the heading outline. No HTML here; see md.mjs and guide-render.mjs.
// Unit tests: qa/guide-check-unit.mjs.

export const CLAIM_RE = /\{\{claim:([a-z0-9-]+)\}\}/g;

// Front matter between the first two `---` lines as key: value (quotes stripped); sources from `## Fact sources` on
export function parseDraft(text) {
  const src = text.replace(/\r\n/g, '\n');
  const m = src.match(/^---\n([^]*?)\n---\n/);
  if (!m) throw new Error('draft has no front matter');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  const rest = src.slice(m[0].length);
  const at = rest.search(/^## Fact sources/m);
  const body = (at === -1 ? rest : rest.slice(0, at)).trim();
  const sources = at === -1 ? '' : rest.slice(at).trim();
  return { meta, body, sources };
}

export function fillClaims(body, registry) {
  const used = [];
  const text = body.replace(CLAIM_RE, (_, id) => {
    if (!registry[id]) throw new Error(`unknown claim: ${id}`);
    if (!used.includes(id)) used.push(id);
    return registry[id].value;
  });
  return { text, used };
}

// H2 and H3 sections in order; an H2's text runs to the next H2 (its H3s included), an H3's to the next heading
export function sectionsOf(body) {
  const lines = body.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const h = line.match(/^(##|###)\s+(.*)$/);
    if (!h) return;
    const level = h[1].length;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const n = lines[j].match(/^(##|###)\s/);
      if (n && (level === 3 || n[1].length === 2)) { end = j; break; }
    }
    out.push({ level, title: h[2].trim(), text: lines.slice(i + 1, end).join('\n').trim(), line: i });
  });
  return out;
}
