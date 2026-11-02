// The committed site pages must match a fresh render: node --test qa/site-pages-unit.mjs
// Stale? Run: node tools/site-pages.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAll } from '../tools/site-pages.mjs';

test('committed site pages match a fresh render (run: node tools/site-pages.mjs)', () => {
  const files = buildAll();
  assert.deepEqual(files.map((f) => f.path).sort(), ['docs/stops-review.md', 'ecosystem/stops/index.html', 'sitemap.xml', 'tools/lib/site-pages-state.json']);
  for (const { path, content } of files) {
    const onDisk = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.equal(onDisk, content, `${path} is stale: run node tools/site-pages.mjs`);
  }
});

test('sitemap lists only public pages', () => {
  const xml = buildAll().find((f) => f.path === 'sitemap.xml').content;
  for (const bad of ['/test/', '/tools/', '/qa/', '/scripts/', '/paper/']) assert.ok(!xml.includes(bad), bad);
  for (const good of ['<loc>https://strike.benryan.com.au/</loc>', '/ecosystem/</loc>', '/ecosystem/stops/</loc>', '/ecosystem/submit/</loc>']) assert.ok(xml.includes(good), good);
  assert.ok(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(xml), 'lastmod is a date');
});

test('a fresh render is stable: running twice gives the same bytes', () => {
  const a = buildAll(), b = buildAll();
  assert.deepEqual(a, b);
});

test('lastmod moves only when a page\'s content changes (state file, not git dates)', () => {
  const today = '2031-01-01';
  const fresh = buildAll({ state: {}, today });
  const sitemap = fresh.find((f) => f.path === 'sitemap.xml').content;
  assert.equal((sitemap.match(/<lastmod>2031-01-01<\/lastmod>/g) || []).length, 4, 'unknown pages date to today');
  const state = JSON.parse(fresh.find((f) => f.path === 'tools/lib/site-pages-state.json').content);
  assert.ok(state['/ecosystem/stops/'].hash && state['/ecosystem/stops/'].lastmod === today);
  const again = buildAll({ state, today: '2031-06-30' });
  assert.equal(again.find((f) => f.path === 'sitemap.xml').content, sitemap, 'same content, same dates on a later day');
  const bumped = { ...state, '/ecosystem/stops/': { hash: 'stale', lastmod: '2030-01-01' } };
  const changed = buildAll({ state: bumped, today: '2031-06-30' }).find((f) => f.path === 'sitemap.xml').content;
  assert.ok(changed.includes('<loc>https://strike.benryan.com.au/ecosystem/stops/</loc>\n    <lastmod>2031-06-30</lastmod>'), 'a changed page dates to today');
  assert.ok(changed.includes('<loc>https://strike.benryan.com.au/</loc>\n    <lastmod>2031-01-01</lastmod>'), 'an unchanged page keeps its date');
});
