#!/usr/bin/env node
// Writes the committed site pages from the world's data: ecosystem/stops/index.html, sitemap.xml and
// docs/stops-review.md (the markdown Ben reads before a sheet goes live; copied to the Strike repo's
// docs/ECOSYSTEM-SHEETS.md).
//   node tools/site-pages.mjs          write the files
//   node tools/site-pages.mjs --check  write nothing; exit 1 if any committed file differs
// qa/site-pages-unit.mjs runs the same comparison in the test suite, so a stale page fails the build.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOPS, DISTRICTS } from '../ecosystem/js/content.js';
import { LABELS } from '../ecosystem/js/data.js';
import { ORDER, renderReview, renderSitemap, renderStopsPage } from './lib/site-render.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://strike.benryan.com.au';

// Last commit date (YYYY-MM-DD) touching any of the files; today if none is committed yet
function lastmod(...files) {
  const dates = files.map((f) => {
    try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', f], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
  }).filter(Boolean);
  return dates.length ? dates.sort().at(-1) : new Date().toISOString().slice(0, 10);
}

// Pages in the sitemap and the files whose history dates them. Workstream C adds the guides here.
const PAGES = [
  { path: '/', files: ['index.html', 'src', 'css'] },
  { path: '/ecosystem/', files: ['ecosystem/index.html', 'ecosystem/js'] },
  { path: '/ecosystem/stops/', files: ['ecosystem/js/stops.js', 'ecosystem/js/content.js', 'tools/lib/site-render.mjs', 'ecosystem/stops/stops.css'] },
  { path: '/ecosystem/submit/', files: ['ecosystem/submit'] },
];

export function buildAll() {
  const entries = PAGES.map((p) => ({ loc: SITE + p.path, lastmod: lastmod(...p.files) }));
  const generated = entries.find((e) => e.loc.endsWith('/ecosystem/stops/')).lastmod;
  const ctx = { stops: STOPS, districts: DISTRICTS, order: ORDER, labels: LABELS, generated };
  return [
    { path: 'ecosystem/stops/index.html', content: renderStopsPage(ctx) },
    { path: 'sitemap.xml', content: renderSitemap(entries) },
    { path: 'docs/stops-review.md', content: renderReview(ctx) },
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const { path, content } of buildAll()) {
    const abs = ROOT + path;
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
