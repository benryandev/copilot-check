// The stops page, sitemap and review markdown renderers (no DOM): node --test qa/site-render-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { STOPS, DISTRICTS, RING_KEYS } from '../ecosystem/js/content.js';
import { LABELS } from '../ecosystem/js/data.js';
import { renderStopsPage, renderSitemap, renderReview, publicStops, stopHref, ORDER } from '../tools/lib/site-render.mjs';

const ctx = { stops: STOPS, districts: DISTRICTS, order: ORDER, labels: LABELS, generated: '2026-11-03' };

test('ORDER is the hub, the ring, then the raceway and the yard', () => {
  assert.deepEqual(ORDER, ['hub', ...RING_KEYS, 'raceway', 'yard']);
});

test('publicStops drops placeholder plots and arcade cabinets, keeps projects', () => {
  const keys = publicStops(STOPS).map(s => s.key);
  assert.ok(!keys.includes('arcade-flappy-coin'), 'arcade cabinet is not a place to read about');
  assert.ok(STOPS.some(s => s.name === 'Your project here'), 'fixture: the placeholder plots exist');
  assert.ok(!publicStops(STOPS).some(s => s.name === 'Your project here'), 'placeholder plots dropped');
  assert.ok(keys.includes('project-tamtam'), 'a listed project stays');
  assert.ok(keys.includes('slp') && keys.includes('raceway') && keys.includes('fillyard'));
});

test('stops page: every public stop by name, a Drive there link per stop, district sections in ORDER, no banned words', () => {
  const html = renderStopsPage(ctx);
  for (const s of publicStops(STOPS)) {
    assert.ok(html.includes(`>${esc(s.name)}<`), s.name);
    assert.ok(html.includes(`href="${stopHref(s.key)}"`), s.key);
  }
  const idx = ORDER.map(k => html.indexOf(`id="district-${k}"`));
  assert.ok(idx.every((v, i) => v > -1 && (i === 0 || v > idx[i - 1])), 'district sections in page order');
  assert.ok(html.includes('Live on the pad: Markets trading'), 'live labels named, not valued');
  assert.ok(/<article class="[^"]*\bdistrict-perps\b/.test(html), 'articles carry their district class');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<link rel="canonical" href="https://strike.benryan.com.au/ecosystem/stops/">'));
  for (const w of ['recommend', 'you should', 'best setting', ' score']) assert.ok(!html.toLowerCase().includes(w), `banned: ${w}`);
  assert.ok(!/<script/.test(html.replace(/<script src="\/src\/[a-z-]+\.js"><\/script>/g, '')), 'no inline script');
  assert.ok(html.includes('id="theme-toggle"') && html.includes('/src/theme-toggle.js'), 'the site theme toggle is on the page');
  assert.ok(!/ style="/.test(html), 'no inline style');
});

test('sitemap: only the given entries, xml shape', () => {
  const xml = renderSitemap([
    { loc: 'https://strike.benryan.com.au/', lastmod: '2026-11-03' },
    { loc: 'https://strike.benryan.com.au/ecosystem/stops/', lastmod: '2026-11-03' },
  ]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.equal((xml.match(/<url>/g) || []).length, 2);
  assert.ok(xml.includes('<loc>https://strike.benryan.com.au/ecosystem/stops/</loc>'));
  assert.ok(xml.includes('<lastmod>2026-11-03</lastmod>'));
});

test('review markdown: one ### per public stop, grouped by district', () => {
  const md = renderReview(ctx);
  assert.equal((md.match(/^### /gm) || []).length, publicStops(STOPS).length);
  assert.ok(md.startsWith('# Ecosystem world: every sheet for review (generated 2026-11-03)'));
  assert.ok(md.includes('## Strike HQ'));
});

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
