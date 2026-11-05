// The committed site pages must match a fresh render: node --test qa/site-pages-unit.mjs
// Stale? Run: node tools/site-pages.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAll, readGuides, localToday } from '../tools/site-pages.mjs';

const slugs = Object.keys(readGuides().guides);

test('committed site pages match a fresh render (run: node tools/site-pages.mjs)', () => {
  const files = buildAll();
  assert.deepEqual(files.map((f) => f.path).sort(), ['docs/stops-review.md', 'llms.txt', 'ecosystem/guides/index.html', ...slugs.map((s) => `ecosystem/guides/${s}/index.html`), 'ecosystem/guides/stills.css', 'ecosystem/js/guides.js', 'ecosystem/stops/index.html', 'sitemap.xml', 'tools/lib/site-pages-state.json'].sort());
  assert.ok(slugs.length >= 1, 'at least one guide is built');
  for (const { path, content } of files) {
    const onDisk = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.equal(onDisk, content, `${path} is stale: run node tools/site-pages.mjs`);
  }
});

test('sitemap lists only public pages', () => {
  const xml = buildAll().find((f) => f.path === 'sitemap.xml').content;
  for (const bad of ['/test/', '/tools/', '/qa/', '/scripts/', '/paper/']) assert.ok(!xml.includes(bad), bad);
  for (const good of ['<loc>https://strike.benryan.com.au/</loc>', '/ecosystem/</loc>', '/ecosystem/stops/</loc>', '/ecosystem/submit/</loc>', '/ecosystem/guides/</loc>', ...slugs.map((s) => `/ecosystem/guides/${s}/</loc>`)]) assert.ok(xml.includes(good), good);
  assert.ok(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(xml), 'lastmod is a date');
});

test('llms.txt lists the tools, the world, the stops page and every guide, one link and one line each', () => {
  const txt = buildAll().find((f) => f.path === 'llms.txt').content;
  assert.ok(txt.startsWith('# Copilot Check\n\n> '), 'H1 then a blockquote summary (llmstxt.org)');
  assert.ok(txt.includes('Not affiliated with Strike'), 'the disclosure');
  assert.deepEqual(txt.match(/^## .*$/gm), ['## Tools', '## The ecosystem world', '## Venues', '## Guides'], 'the Lagoon is listed');
  const entries = txt.split('\n').filter((l) => l.startsWith('- '));
  for (const l of entries) assert.match(l, /^- \[[^\]]+\]\(https:\/\/[^)\s]+\): \S[^\n]*[^\s.]\.$/, `entry is "- [name](url): one line." ${l}`);
  for (const l of entries) assert.ok(!l.includes('\n') && l.length < 400, 'one line each');
  const urls = entries.map((l) => l.match(/\((https:[^)]+)\)/)[1]);
  const site = 'https://strike.benryan.com.au';
  for (const u of [`${site}/`, `${site}/paper.html`, 'https://t.me/CopilotWatchBot', `${site}/ecosystem/`, `${site}/ecosystem/stops/`, `${site}/ecosystem/guides/`, ...slugs.map((s) => `${site}/ecosystem/guides/${s}/`)]) assert.ok(urls.includes(u), u);
  assert.equal(new Set(urls).size, urls.length, 'no url twice');
  for (const bad of ['/test/', '/tools/', '/qa/', '/scripts/', 'referralCode']) assert.ok(!txt.includes(bad), bad);
  const guideSection = txt.slice(txt.indexOf('## Guides'));
  for (const g of Object.values(readGuides().guides)) assert.ok(guideSection.includes(`[${g.title}](`), `guide title ${g.slug}`);
  const order = slugs.map((s) => guideSection.indexOf(`/guides/${s}/`));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'guides in series order');
  assert.ok(txt.endsWith('\n') && !txt.includes('\n\n\n'), 'tidy');
});

test('a fresh render is stable: running twice gives the same bytes', () => {
  const a = buildAll(), b = buildAll();
  assert.deepEqual(a, b);
});

test('lastmod moves only when a page\'s content changes (state file, not git dates)', () => {
  const today = '2031-01-01';
  const fresh = buildAll({ state: {}, today });
  const sitemap = fresh.find((f) => f.path === 'sitemap.xml').content;
  assert.equal((sitemap.match(/<lastmod>2031-01-01<\/lastmod>/g) || []).length, 5 + slugs.length + 1, 'unknown pages (five, the guides and the Lagoon) date to today');
  const state = JSON.parse(fresh.find((f) => f.path === 'tools/lib/site-pages-state.json').content);
  assert.ok(state['/ecosystem/stops/'].hash && state['/ecosystem/stops/'].lastmod === today);
  const again = buildAll({ state, today: '2031-06-30' });
  assert.equal(again.find((f) => f.path === 'sitemap.xml').content, sitemap, 'same content, same dates on a later day');
  const bumped = { ...state, '/ecosystem/stops/': { hash: 'stale', lastmod: '2030-01-01' } };
  const changed = buildAll({ state: bumped, today: '2031-06-30' }).find((f) => f.path === 'sitemap.xml').content;
  assert.ok(changed.includes('<loc>https://strike.benryan.com.au/ecosystem/stops/</loc>\n    <lastmod>2031-06-30</lastmod>'), 'a changed page dates to today');
  assert.ok(changed.includes('<loc>https://strike.benryan.com.au/</loc>\n    <lastmod>2031-01-01</lastmod>'), 'an unchanged page keeps its date');
  const gpath = `/ecosystem/guides/${slugs[0]}/`;
  const gbumped = { ...state, [gpath]: { hash: 'stale', lastmod: '2030-01-01' } };
  const gchanged = buildAll({ state: gbumped, today: '2031-06-30' }).find((f) => f.path === 'sitemap.xml').content;
  assert.ok(gchanged.includes(`<loc>https://strike.benryan.com.au${gpath}</loc>\n    <lastmod>2031-06-30</lastmod>`), 'a changed guide dates to today');
  assert.ok(gchanged.includes('<loc>https://strike.benryan.com.au/ecosystem/stops/</loc>\n    <lastmod>2031-01-01</lastmod>'), 'the stops page keeps its date');
});

test('localToday is the Brisbane calendar day (UTC+10, no DST), not UTC', () => {
  assert.equal(localToday(Date.UTC(2026, 10, 2, 22, 30)), '2026-11-03', '08:30 Brisbane on 3 Nov is still 2 Nov in UTC');
  assert.equal(localToday(Date.UTC(2026, 10, 3, 13, 59)), '2026-11-03', '23:59 Brisbane');
  assert.equal(localToday(Date.UTC(2026, 10, 3, 14, 0)), '2026-11-04', 'midnight Brisbane');
});

// Venues: tracks on their own pages. The Lagoon is on (content.js VENUES, plan 5 Task 5), so the committed files list it
// (the drift test above, and the test after this one); a fixture list shows all four listings render a venue, an empty one nothing.
test('a venue renders in the stops page, the guides index, llms.txt and the sitemap; none listed renders nothing', () => {
  const venue = { key: 'lagoon', name: 'The Lagoon', url: '/ecosystem/tracks/lagoon/', line: 'A lap round a tarmac lagoon with a water jump.' };
  const find = (files, p) => files.find((f) => f.path === p).content;
  const none = buildAll({ venues: [] }), one = buildAll({ venues: [venue] });
  assert.notDeepEqual(none, buildAll(), 'the default is the Lagoon, not an empty list');
  const stops = find(one, 'ecosystem/stops/index.html');
  assert.ok(stops.includes('id="venues"') && stops.includes('The Lagoon') && stops.includes('A lap round a tarmac lagoon with a water jump.') && stops.includes('href="/ecosystem/tracks/lagoon/"'), 'stops page section');
  assert.ok(stops.indexOf('id="venues"') > stops.indexOf('id="district-yard"'), 'after the districts');
  const idx = find(one, 'ecosystem/guides/index.html');
  assert.ok(idx.includes('<a href="/ecosystem/tracks/lagoon/">The Lagoon</a>: A lap round a tarmac lagoon'), 'guides index line');
  const txt = find(one, 'llms.txt');
  assert.ok(txt.includes('- [The Lagoon](https://strike.benryan.com.au/ecosystem/tracks/lagoon/): A lap round a tarmac lagoon with a water jump.'), 'llms entry');
  assert.deepEqual(txt.match(/^## .*$/gm), ['## Tools', '## The ecosystem world', '## Venues', '## Guides']);
  for (const l of txt.split('\n').filter((l) => l.startsWith('- '))) assert.match(l, /^- \[[^\]]+\]\(https:\/\/[^)\s]+\): \S[^\n]*[^\s.]\.$/, l);
  assert.ok(find(one, 'sitemap.xml').includes('<loc>https://strike.benryan.com.au/ecosystem/tracks/lagoon/</loc>'), 'sitemap url');
  for (const f of ['ecosystem/stops/index.html', 'ecosystem/guides/index.html', 'llms.txt', 'sitemap.xml']) {
    assert.ok(!find(none, f).includes('tracks/lagoon') && !find(none, f).includes('id="venues"'), `${f} has no venue when none is listed`);
  }
});

test('the committed listings carry the Lagoon with its own line', async () => {
  const { VENUES } = await import('../ecosystem/js/content.js');
  const { line } = VENUES.find((v) => v.key === 'lagoon');
  const disk = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  assert.ok(disk('ecosystem/stops/index.html').includes(esc(line)) && disk('ecosystem/stops/index.html').includes('href="/ecosystem/tracks/lagoon/"'), 'the stops page');
  assert.ok(disk('ecosystem/guides/index.html').includes('<a href="/ecosystem/tracks/lagoon/">The Lagoon</a>'), 'the guides index');
  assert.ok(disk('llms.txt').includes(`- [The Lagoon](https://strike.benryan.com.au/ecosystem/tracks/lagoon/): ${line}`), 'llms.txt');
  assert.ok(disk('sitemap.xml').includes('<loc>https://strike.benryan.com.au/ecosystem/tracks/lagoon/</loc>'), 'the sitemap');
});
