// The committed site pages must match a fresh render: node --test qa/site-pages-unit.mjs
// Stale? Run: node tools/site-pages.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAll } from '../tools/site-pages.mjs';

test('committed site pages match a fresh render (run: node tools/site-pages.mjs)', () => {
  const files = buildAll();
  assert.deepEqual(files.map((f) => f.path).sort(), ['docs/stops-review.md', 'ecosystem/stops/index.html', 'sitemap.xml']);
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
