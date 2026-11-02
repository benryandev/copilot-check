#!/usr/bin/env node
// Writes the committed site pages from the world's data: ecosystem/stops/index.html, sitemap.xml and
// docs/stops-review.md (the markdown Ben reads before a sheet goes live; copied to the Strike repo's
// docs/ECOSYSTEM-SHEETS.md), plus tools/lib/site-pages-state.json, which remembers each page's content
// hash and the date it last changed, so a sitemap <lastmod> moves only when the page does.
//   node tools/site-pages.mjs          write the files
//   node tools/site-pages.mjs --check  write nothing; exit 1 if any committed file differs
// qa/site-pages-unit.mjs runs the same comparison in the test suite, so a stale page fails the build.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOPS, DISTRICTS } from '../ecosystem/js/content.js';
import { LABELS } from '../ecosystem/js/data.js';
import { ORDER, renderReview, renderSitemap, renderStopsPage } from './lib/site-render.mjs';
import { guidePath, renderGuidePage, renderGuidesIndex, renderGuidesModule, renderStillsCss } from './lib/guide-render.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://strike.benryan.com.au';
const STATE_PATH = 'tools/lib/site-pages-state.json';
const GUIDES_PATH = 'tools/lib/guides.json';
const DATE_MARK = '__LASTMOD__';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// Every file under a path (sorted) concatenated, so a page backed by a directory hashes all of it
// Generated files are never hashed as inputs (writing one would move its page's date on the next run)
const GENERATED = new Set(['ecosystem/js/guides.js']);
function hashFiles(paths) {
  const h = createHash('sha256');
  const walk = (p) => {
    if (GENERATED.has(p)) return;
    const abs = join(ROOT, p);
    if (statSync(abs).isDirectory()) { for (const f of readdirSync(abs).sort()) walk(join(p, f)); return; }
    h.update(p).update('\0').update(readFileSync(abs));
  };
  for (const p of paths) walk(p);
  return h.digest('hex').slice(0, 16);
}

// Pages in the sitemap. Static ones hash their backing files; rendered ones (the stops page, the guides) hash their
// own render. The guides come from tools/lib/guides.json (tools/guide-build.mjs), one page each plus the index.
const PAGES = [
  { path: '/', files: ['index.html', 'src', 'css'] },
  { path: '/ecosystem/', files: ['ecosystem/index.html', 'ecosystem/js', 'ecosystem/ecosystem.css', GUIDES_PATH] }, // the world's sheets link the guides
  { path: '/ecosystem/stops/', render: 'stops' },
  { path: '/ecosystem/submit/', files: ['ecosystem/submit'] },
  { path: '/ecosystem/guides/', render: 'guides-index' },
];

export function readState() {
  try { return JSON.parse(readFileSync(join(ROOT, STATE_PATH), 'utf8')); } catch { return {}; }
}
export function readGuides() {
  try { return JSON.parse(readFileSync(join(ROOT, GUIDES_PATH), 'utf8')); } catch { return { generated: '', guides: {} }; }
}
// The calendar day in Brisbane (UTC+10, no DST): a build at 08:30 on 3 Nov must not date pages 2 Nov
export const localToday = (ms = Date.now()) => new Date(ms + 10 * 3600 * 1000).toISOString().slice(0, 10);
const isoToday = localToday;

export function buildAll({ state = readState(), today = isoToday(), guidesFile = readGuides() } = {}) {
  const guides = guidesFile.guides || {};
  const base = { stops: STOPS, districts: DISTRICTS, order: ORDER, labels: LABELS, guides };
  const renders = {
    stops: () => renderStopsPage({ ...base, generated: DATE_MARK }),
    'guides-index': () => renderGuidesIndex(guidesFile, base),
  };
  for (const g of Object.values(guides)) renders[g.slug] = () => renderGuidePage(g, base);
  const pages = [...PAGES, ...Object.values(guides).map((g) => ({ path: guidePath(g.slug), render: g.slug }))];
  const next = {};
  const entries = pages.map((p) => {
    const hash = p.render ? sha(renders[p.render]()) : hashFiles(p.files);
    const prev = state[p.path];
    const lastmod = prev && prev.hash === hash ? prev.lastmod : today;
    next[p.path] = { hash, lastmod };
    return { loc: SITE + p.path, lastmod };
  });
  const generated = next['/ecosystem/stops/'].lastmod;
  const ctx = { ...base, generated };
  return [
    { path: 'ecosystem/stops/index.html', content: renderStopsPage(ctx) },
    { path: 'ecosystem/guides/index.html', content: renderGuidesIndex(guidesFile, base) },
    ...Object.values(guides).map((g) => ({ path: `ecosystem/guides/${g.slug}/index.html`, content: renderGuidePage(g, base) })),
    { path: 'ecosystem/guides/stills.css', content: renderStillsCss(guidesFile) },
    { path: 'ecosystem/js/guides.js', content: renderGuidesModule(guidesFile) },
    { path: 'sitemap.xml', content: renderSitemap(entries) },
    { path: 'docs/stops-review.md', content: renderReview(ctx) },
    { path: STATE_PATH, content: JSON.stringify(next, null, 2) + '\n' },
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const { path, content } of buildAll()) {
    const abs = join(ROOT, path);
    let current = null;
    try { current = readFileSync(abs, 'utf8'); } catch {}
    if (current === content) { console.log(`${path}: up to date`); continue; }
    if (check) { console.log(`${path}: STALE`); stale++; continue; }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    console.log(`${path}: written`);
  }
  if (check && stale) { console.error(`${stale} stale file(s): run node tools/site-pages.mjs`); process.exit(1); }
}
