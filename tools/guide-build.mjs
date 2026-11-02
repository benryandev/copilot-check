#!/usr/bin/env node
// Builds the guides' data file from the markdown drafts in the Strike repo (workstream C of the content spec):
//   node tools/guide-build.mjs ~/Dev/Strike/docs/articles [--check]
// Reads <dir>/G-*.md and <dir>/claim-positions.json, refuses any draft that fails tools/guide-check.mjs, fills the
// {{claim:id}} references, converts the markdown, and writes tools/lib/guides.json (metadata, body HTML, FAQ,
// dates). tools/site-pages.mjs renders the pages from that file, so the site's drift test never needs the other
// repo. Each guide's `modified` date moves only when its rendered text changes (content hash), like the sitemap's
// lastmod. The registry's `guides` lists (which guides cite each claim) are derived and rewritten in place.
// --check writes nothing and exits 1 if either output would change. Unit tests: qa/guide-build-unit.mjs.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdToHtml } from './lib/md.mjs';
import { fillClaims, parseDraft, sectionsOf } from './lib/guide-parse.mjs';
import { checkGuide, DISCLOSURE, FAQ_TITLE, FOOTER, pngDims, wordCount } from './guide-check.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const GUIDES_PATH = 'tools/lib/guides.json';
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (md) => md.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

// Cut a section (its heading and text, up to the next H2) out of the body
function cutSection(body, title) {
  const re = new RegExp(`^## ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([^]*?)(?=^## |$(?![\\r\\n]))`, 'm');
  const m = body.match(re);
  if (!m) return { body, text: '' };
  return { body: body.replace(m[0], '').trim(), text: m[1].trim() };
}

export function buildGuides({ drafts, registry, images, previous = { guides: {} }, today, stopKeys }) {
  const guides = {};
  const errors = [];
  const cites = {};
  for (const { path, text } of drafts) {
    const draft = parseDraft(text);
    const { meta } = draft;
    if (/^hold\b/.test(meta.status || '')) continue; // a draft parked with status: hold
    const failures = checkGuide(draft, { stopKeys, registry, imageDims: (src) => images(meta.slug, src), today });
    if (failures.length) { errors.push(`${path}:\n  ${failures.join('\n  ')}`); continue; }
    if (guides[meta.slug]) { errors.push(`${path}: slug "${meta.slug}" used twice`); continue; }
    const { text: filled, used } = fillClaims(draft.body, registry);
    let body = filled.split('\n').slice(1).join('\n').trim(); // the disclosure line
    if (body.endsWith(FOOTER)) body = body.slice(0, -FOOTER.length).trim();
    const minute = cutSection(body, 'In one minute'); body = minute.body;
    const faqSec = cutSection(body, FAQ_TITLE); body = faqSec.body;
    const faq = sectionsOf(`## x\n${faqSec.text}`).filter((s) => s.level === 3).map((s) => ({ q: s.title, a: plain(s.text) }));
    const image = (src, alt) => {
      const d = images(meta.slug, src);
      const href = `/ecosystem/guides/img/${meta.slug}/${basename(src)}`;
      return `<figure><img src="${href}" alt="${esc(alt)}" width="${d.width}" height="${d.height}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>`;
    };
    const html = mdToHtml(body, { image });
    const inOneMinute = mdToHtml(minute.text);
    const h2s = sectionsOf(draft.body).filter((s) => s.level === 2).map((s) => ({ id: s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), title: s.title }));
    const hash = sha(meta.title + meta.subtitle + inOneMinute + html + JSON.stringify(faq));
    const prev = previous.guides?.[meta.slug];
    guides[meta.slug] = {
      slug: meta.slug, title: meta.title, subtitle: meta.subtitle, series: meta.series, order: Number(meta.order), stop: meta.stop, next: meta.next || '',
      cover: meta.cover, published: meta.published, checked: meta.checked, modified: [prev && prev.hash === hash ? prev.modified : today, meta.published].sort().at(-1), hash, // never before published
      words: wordCount(draft.body.split(`## ${FAQ_TITLE}`)[0].replace(DISCLOSURE, '')), claims: used, faq, toc: h2s, html, inOneMinute,
    };
    for (const id of used) (cites[id] ||= []).push(meta.slug);
  }
  if (errors.length) throw new Error(`guide build refused:\n${errors.join('\n')}`);
  const registryOut = Object.fromEntries(Object.entries(registry).map(([id, c]) => [id, { ...c, guides: (cites[id] || []).sort() }]));
  const dates = Object.values(guides).map((g) => g.modified).sort();
  return { generated: dates.at(-1) || today, guides, registryOut };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const check = process.argv.includes('--check');
  if (!dir) { console.error('usage: node tools/guide-build.mjs <drafts-dir> [--check]'); process.exit(2); }
  const { STOPS } = await import('../ecosystem/js/content.js');
  const registryPath = join(dir, 'claim-positions.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const drafts = readdirSync(dir).filter((f) => /^G-.*\.md$/.test(f)).sort().map((f) => ({ path: f, text: readFileSync(join(dir, f), 'utf8') }));
  const images = (slug, src) => {
    for (const p of [join(ROOT, 'ecosystem/guides/img', slug, basename(src)), join(dir, src)]) if (existsSync(p)) return pngDims(readFileSync(p));
    return null;
  };
  let previous = { guides: {} };
  try { previous = JSON.parse(readFileSync(join(ROOT, GUIDES_PATH), 'utf8')); } catch {}
  const { localToday } = await import('./site-pages.mjs');
  const { generated, guides, registryOut } = buildGuides({ drafts, registry, images, previous, today: localToday(), stopKeys: STOPS.map((s) => s.key) });
  const outputs = [
    { path: join(ROOT, GUIDES_PATH), content: JSON.stringify({ generated, guides }, null, 2) + '\n' },
    { path: registryPath, content: JSON.stringify(registryOut, null, 2) + '\n' },
  ];
  let stale = 0;
  for (const { path, content } of outputs) {
    let current = null;
    try { current = readFileSync(path, 'utf8'); } catch {}
    if (current === content) { console.log(`${path}: up to date`); continue; }
    if (check) { console.log(`${path}: STALE`); stale++; continue; }
    writeFileSync(path, content);
    console.log(`${path}: written`);
  }
  console.log(`${Object.keys(guides).length} guide(s)`);
  if (check && stale) process.exit(1);
}
