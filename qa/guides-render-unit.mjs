// The guide page, the guides index, stills.css and the world's guide list (tools/lib/guide-render.mjs): node --test qa/guides-render-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STOPS, DISTRICTS } from '../ecosystem/js/content.js';
import { renderGuidePage, renderGuidesIndex, renderStillsCss, renderGuidesModule, guidesForStop, guidePath, longDate } from '../tools/lib/guide-render.mjs';
import { buildGuides } from '../tools/guide-build.mjs';

const text = readFileSync(new URL('./fixtures/guides/G-S0-what-is-strike.md', import.meta.url), 'utf8');
const registry = JSON.parse(readFileSync(new URL('./fixtures/guides/claim-positions.json', import.meta.url), 'utf8'));
const two = text.replace('slug: what-is-strike', 'slug: what-is-a-perp').replace('order: 0', 'order: 1').replace('stop: strike', 'stop: perpetuals').replace('next: what-is-a-perp', 'next:');
const file = buildGuides({ drafts: [{ path: 'a.md', text }, { path: 'b.md', text: two }], registry, images: () => ({ width: 1200, height: 700 }), previous: { guides: {} }, today: '2026-11-10', stopKeys: STOPS.map((s) => s.key) });
const ctx = { guides: file.guides, stops: STOPS, districts: DISTRICTS };
const ld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1])['@graph'];

test('guide page: head, dates on the page, JSON-LD Article + FAQPage, buttons, no inline style or script, nothing unfilled', () => {
  const g = file.guides['what-is-strike'], html = renderGuidePage(g, ctx);
  assert.ok(html.startsWith('<!doctype html>') && html.includes('<link rel="canonical" href="https://strike.benryan.com.au/ecosystem/guides/what-is-strike/">'));
  assert.ok(html.includes(`<title>${g.title} · Strike guides</title>`));
  assert.ok(html.includes('Published 10 Nov 2026 · Facts checked 10 Nov 2026'));
  const types = ld(html).map((n) => n['@type']);
  assert.deepEqual(types, ['Article', 'FAQPage', 'BreadcrumbList']);
  const [a, f] = ld(html);
  assert.equal(a.datePublished, '2026-11-10'); assert.equal(a.dateModified, g.modified); assert.equal(a.author.name, 'Ben Ryan');
  assert.equal(f.mainEntity.length, 3); assert.ok(f.mainEntity[0].acceptedAnswer.text.length > 10);
  assert.equal(a.isAccessibleForFree, true, 'no paywall: the toolkit otherwise asks for the Subscription rich-result properties');
  assert.ok(html.includes('href="/ecosystem/?stop=strike"') && html.includes('Read next: ') && html.includes('href="/ecosystem/guides/"'));
  assert.ok(html.includes('<body class="guide-page" data-stop="strike">') && html.includes('class="hud hud-foot"') && html.includes('Strike HQ'));
  assert.ok(html.includes('<main id="main" class="sheet guide-sheet">') && html.includes('<article class="guide-article">') && html.includes('<h1 id="guide-title">'));
  assert.ok(!/ style="/.test(html) && !/<script(?! type="application\/ld\+json")(?! src="\/src\/theme(-toggle)?\.js")/.test(html));
  assert.ok(!html.includes('{{') && !html.includes('Fact sources'));
  assert.ok(html.includes('<meta property="og:image" content="https://strike.benryan.com.au/ecosystem/guides/img/what-is-strike/cover.png">'));
  assert.ok(html.includes('<div class="table"><table>'), 'tables are wrapped for horizontal scroll');
  assert.ok(!html.includes('guide-toc'), 'a short guide has no table of contents');
  assert.ok(html.includes('id="theme-toggle"') && html.includes('/src/theme-toggle.js'));
  const last = renderGuidePage(file.guides['what-is-a-perp'], ctx);
  assert.ok(!last.includes('Read next: '), 'the series end has no Read next');
  const faqAt = html.indexOf('id="questions-people-ask"'), howAt = html.indexOf('<h2 id="how-i-use-it">'), nextAt = html.indexOf('<h2 id="next">'), thingsAt = html.indexOf('<h2 id="things-worth-knowing">');
  assert.ok(thingsAt < faqAt && faqAt < howAt && howAt < nextAt, 'the FAQ sits after Things worth knowing and before How I use it and Next (template order)');
});
test('index page lists both guides in order with CollectionPage + ItemList', () => {
  const html = renderGuidesIndex(file, ctx);
  assert.ok(html.indexOf('/ecosystem/guides/what-is-strike/') < html.indexOf('/ecosystem/guides/what-is-a-perp/'));
  assert.deepEqual(ld(html).map((n) => n['@type']), ['CollectionPage', 'ItemList']);
  assert.equal(ld(html)[1].numberOfItems, 2);
  assert.ok(html.includes('<title>Strike guides: start here</title>') && html.includes('<h1 id="guide-title">Learn Strike from zero</h1>') && html.includes('data-stop="strike"'));
  assert.ok(html.includes('<main id="main" class="sheet guide-sheet">'));
});
test('stills.css: the 960 still by default, 1920 from 961 px, both themes, every guide stop and the hub', () => {
  const css = renderStillsCss(file);
  for (const k of ['strike', 'perpetuals']) {
    assert.ok(css.includes(`[data-stop="${k}"] .guide-back { background-image: url(/ecosystem/guides/img/stills/${k}-light-960.jpg); }`), k);
    assert.ok(css.includes(`:root.dark [data-stop="${k}"] .guide-back { background-image: url(/ecosystem/guides/img/stills/${k}-dark-960.jpg); }`), k);
    assert.ok(css.includes(`${k}-light-1920.jpg`) && css.includes(`${k}-dark-1920.jpg`));
  }
  assert.ok(css.indexOf('@media (min-width: 961px)') < css.indexOf('-1920.jpg'));
  assert.ok(renderStillsCss({ guides: {} }).includes('[data-stop="strike"]'), 'the hub is always there for the stops page');
});
test('guides.js module and guidesForStop', () => {
  const src = renderGuidesModule(file);
  assert.ok(src.startsWith('// Generated by tools/site-pages.mjs') && src.includes('export const GUIDES = [') && src.includes('export const guidesForStop'));
  assert.ok(!src.includes('"html"'), 'the module carries titles and paths, not the bodies');
  assert.deepEqual(guidesForStop('strike', file.guides).map((g) => g.slug), ['what-is-strike']);
  assert.deepEqual(guidesForStop('perpetuals', Object.values(file.guides)).map((g) => g.slug), ['what-is-a-perp']);
  assert.deepEqual(guidesForStop('nowhere', file.guides), []);
  assert.equal(guidePath('x'), '/ecosystem/guides/x/'); assert.equal(longDate('2026-11-10'), '10 Nov 2026'); assert.equal(longDate('2026-01-02'), '2 Jan 2026');
});
