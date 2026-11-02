#!/usr/bin/env node
// The gate a guide draft must pass before tools/guide-build.mjs will build it (workstream C of the content spec;
// the rules trimmed from Ben's seo-validator skill). checkGuide() returns one line per failure, empty when the draft
// passes. CLI: node tools/guide-check.mjs <draft.md> <claim-positions.json>   (exit 1 on any failure)
// Unit tests: qa/guide-check-unit.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAIM_RE, parseDraft, sectionsOf } from './lib/guide-parse.mjs';

// The sheets' list (qa/stops-unit.mjs) plus the price form
export const BANNED = [/recommend/i, /\bAPR\b/, /loss cover/i, /you should/i, /best setting/i, /STRIKE (token )?price/, /\$[0-9.]+ per STRIKE/i];
export const AMERICAN = ['color', 'favorite', 'realize', 'realized', 'organize', 'behavior', 'center', 'catalog', 'defense', 'analyze', 'fulfill', 'traveling'];
export const DISCLOSURE = '*Not affiliated with Strike. Not financial advice.*';
export const FOOTER = '*Not financial advice.*';
export const FAQ_TITLE = 'Questions people ask';
export const REFERRAL = 'https://app.strikefinance.org/trade/BTC?referralCode=BenRyan';
export const REFERRAL_NOTE = '(my referral link, 5% off fees)';
const WORDS = { 'start-here': [500, 700], feature: [700, 1000] };
const STALE_DAYS = 30;
const MINUTE = ['**What it is:**', "**Who it's for:**", '**The one thing to know:**'];
// Template order after In one minute (prefix match, case-insensitive); How I use it is optional
const ORDER = [/^what/i, /^who/i, /^how to/i, /worked example/i, /^things worth knowing/i, new RegExp(`^${FAQ_TITLE}$`), /^how i use it/i, /^next$/i];

export function pngDims(buf) {
  if (!buf || buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const strip = (s) => s.replace(CLAIM_RE, '$1').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_>#|`]/g, ' ').replace(/^\s*(\d+\.|-)\s+/gm, '');
const words = (s) => strip(s).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
const sentences = (s) => strip(s).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"(*])/).map((x) => x.trim()).filter((x) => words(x).length >= 3);

// Prose blocks: paragraphs, list items and blockquote lines, not headings or table rows
function proseBlocks(body) {
  const blocks = [];
  let buf = [];
  const end = () => { if (buf.length) { blocks.push(buf.join(' ')); buf = []; } };
  for (const raw of body.split('\n')) {
    const t = raw.trim();
    if (t === '' || /^#{1,6}\s/.test(t) || t.startsWith('|') || t === '---' || /^!\[/.test(t)) { end(); continue; }
    if (/^(-|\d+\.)\s+/.test(t)) { end(); blocks.push(t.replace(/^(-|\d+\.)\s+/, '')); continue; }
    buf.push(t.replace(/^>\s?/, ''));
  }
  end();
  return blocks;
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function checkGuide({ meta, body, sources }, { stopKeys, registry, imageDims, today }) {
  const f = [];
  const len = (k, lo, hi) => { const n = (meta[k] || '').length; if (n < lo || n > hi) f.push(`front matter: ${k} must be ${lo} to ${hi} characters (got ${n})`); };
  if (!/^[a-z0-9-]+$/.test(meta.slug || '')) f.push('front matter: slug must be lower-case letters, digits and dashes');
  len('title', 50, 60); len('subtitle', 150, 160);
  if (!meta.cover) f.push('front matter: cover missing');
  if (!WORDS[meta.series]) f.push('front matter: series must be start-here or feature');
  if (!/^\d+$/.test(meta.order || '')) f.push('front matter: order must be an integer');
  if (!stopKeys.includes(meta.stop)) f.push(`front matter: stop "${meta.stop}" is not a stop key in the world`);
  for (const k of ['published', 'checked']) if (!/^\d{4}-\d{2}-\d{2}$/.test(meta[k] || '')) f.push(`front matter: ${k} must be YYYY-MM-DD`);
  if (meta.next && !/^[a-z0-9-]+$/.test(meta.next)) f.push('front matter: next must be a slug or empty');

  const lines = body.split('\n');
  if (lines[0].trim() !== DISCLOSURE) f.push(`disclosure: the first body line must be ${DISCLOSURE}`);
  if (lines.at(-1).trim() !== FOOTER) f.push(`footer: the last body line must be ${FOOTER}`);
  if (lines.some((l) => /^#\s/.test(l))) f.push('H1 found in the body: headings start at ##');

  const secs = sectionsOf(body);
  const h2 = secs.filter((s) => s.level === 2);
  const titles = h2.map((s) => s.title);
  if (titles[0] !== 'In one minute') f.push('structure: "In one minute" must be the first H2');
  if (titles.at(-1) !== 'Next') f.push('structure: "Next" must be the last H2');
  if (!titles.includes(FAQ_TITLE)) f.push(`structure: a "${FAQ_TITLE}" section is required`);
  let pos = 0;
  for (const t of titles.slice(1)) {
    const at = ORDER.findIndex((re, i) => i >= pos && re.test(t));
    if (at === -1) f.push(`structure: "${t}" is out of the template order (or not a template section)`);
    else pos = at;
  }
  for (const re of [/^what/i, /^who/i, /^how to/i, /worked example/i, /^things worth knowing/i]) if (!titles.some((t) => re.test(t))) f.push(`structure: no section matching ${re}`);
  // H3s belong to the FAQ or the What section only
  for (const s of secs) {
    if (s.level !== 3) continue;
    const parent = [...h2].reverse().find((p) => p.line < s.line);
    if (!parent || !(parent.title === FAQ_TITLE || /^what/i.test(parent.title))) f.push(`structure: H3 "${s.title}" outside the What and FAQ sections`);
  }

  const minute = h2.find((s) => s.title === 'In one minute');
  if (minute) {
    const bullets = minute.text.split('\n').filter((l) => l.startsWith('- '));
    if (bullets.length !== 3 || !bullets.every((b, i) => b.startsWith(`- ${MINUTE[i]}`))) f.push(`In one minute: exactly 3 bullets starting ${MINUTE.join(', ')}`);
    if (minute.text.includes(REFERRAL)) f.push('referral link inside In one minute');
  }

  const faq = h2.find((s) => s.title === FAQ_TITLE);
  if (faq) {
    const qs = secs.filter((s) => s.level === 3 && s.line > faq.line && (!h2[h2.indexOf(faq) + 1] || s.line < h2[h2.indexOf(faq) + 1].line));
    if (qs.length < 3 || qs.length > 5) f.push(`FAQ: 3 to 5 questions (got ${qs.length})`);
    for (const q of qs) {
      if (!q.title.endsWith('?')) f.push(`FAQ: "${q.title}" must end in a question mark`);
      const paras = q.text.split(/\n\s*\n/).filter(Boolean);
      const n = sentences(q.text).length;
      if (paras.length !== 1 || n < 1 || n > 2) f.push(`FAQ: "${q.title}" needs one paragraph of 1 to 2 sentences (got ${paras.length} paragraph(s), ${n} sentence(s))`);
    }
  }

  const howTo = h2.find((s) => /^how to/i.test(s.title));
  if (howTo) {
    const steps = howTo.text.split('\n').filter((l) => /^\d+\.\s/.test(l)).length;
    if (steps < 3 || steps > 6) f.push(`How to: 3 to 6 numbered steps (got ${steps})`);
  }
  if (!/^\|.*\|\s*$/m.test(body) && !/^\d+\.\s/m.test(body)) f.push('body needs at least one table or ordered list');

  const range = WORDS[meta.series];
  if (range) {
    const before = faq ? lines.slice(0, faq.line).join('\n') : body;
    const n = words(before.replace(DISCLOSURE, '')).length;
    if (n < range[0] || n > range[1]) f.push(`words: ${range[0]} to ${range[1]} before the FAQ (got ${n})`);
  }

  const all = [];
  for (const block of proseBlocks(body)) {
    const ss = sentences(block);
    if (ss.length > 4) f.push(`paragraph of ${ss.length} sentences (at most 4): "${block.slice(0, 50)}…"`);
    for (const s of ss) { const w = words(s).length; all.push(w); if (w > 32) f.push(`sentence over 32 words (${w}): "${s.slice(0, 60)}…"`); }
  }
  const mean = all.reduce((a, b) => a + b, 0) / (all.length || 1);
  if (mean > 20) f.push(`sentences: mean length ${mean.toFixed(1)} words (at most 20)`);

  for (const m of body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    const [, alt, src] = m;
    if (!alt.trim()) f.push(`image ${src} has no alt text`);
    const d = imageDims(src);
    if (!d) f.push(`image ${src}: file not found or not a PNG`);
    else if (d.width > 1600) f.push(`image ${src}: ${d.width} px wide, at most 1600`);
  }

  for (const re of BANNED) { const m = body.match(re); if (m) f.push(`banned word in body: "${m[0]}"`); }
  for (const w of AMERICAN) if (new RegExp(`\\b${w}\\b`, 'i').test(body)) f.push(`American spelling: ${w}`);

  const refs = body.split(REFERRAL).length - 1;
  const next = h2.find((s) => s.title === 'Next');
  if (refs > 1) f.push(`referral link appears ${refs} times (at most once, in Next)`);
  else if (refs === 1) {
    const inNext = next && next.text.includes(REFERRAL);
    const noted = inNext && next.text.includes(`${REFERRAL}) ${REFERRAL_NOTE}`);
    if (!inNext) f.push('referral link outside the Next section');
    else if (!noted) f.push(`referral link must be followed by ${REFERRAL_NOTE}`);
  }

  if (sources.split('\n').filter((l) => l.startsWith('- ')).length < 3) f.push('Fact sources: the draft needs the section with at least 3 bullet lines');

  for (const m of body.matchAll(CLAIM_RE)) {
    const c = registry[m[1]];
    if (!c) { f.push(`unknown claim: ${m[1]}`); continue; }
    const age = daysBetween(c.checked, today);
    if (!(age <= STALE_DAYS)) f.push(`claim ${m[1]} is stale: checked ${c.checked}, ${age} days before ${today} (limit ${STALE_DAYS})`);
  }
  return [...new Set(f)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [draftPath, claimsPath] = process.argv.slice(2);
  if (!draftPath || !claimsPath) { console.error('usage: node tools/guide-check.mjs <draft.md> <claim-positions.json>'); process.exit(2); }
  const { STOPS } = await import('../ecosystem/js/content.js');
  const draft = parseDraft(readFileSync(draftPath, 'utf8'));
  const registry = JSON.parse(readFileSync(claimsPath, 'utf8'));
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  // Images live in this repo under ecosystem/guides/img/<slug>/; a fixture may keep them beside the draft
  const imageDims = (src) => {
    for (const p of [join(ROOT, 'ecosystem/guides/img', draft.meta.slug || '', basename(src)), join(dirname(draftPath), src)]) if (existsSync(p)) return pngDims(readFileSync(p));
    return null;
  };
  const failures = checkGuide(draft, { stopKeys: STOPS.map((s) => s.key), registry, imageDims, today: new Date().toISOString().slice(0, 10) });
  for (const l of failures) console.log(l);
  process.exit(failures.length ? 1 : 0);
}
