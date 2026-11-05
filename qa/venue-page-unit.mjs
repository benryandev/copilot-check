// qa/venue-page-unit.mjs: the venue page (ecosystem/tracks/lagoon/index.html) is the hub's page with its own meta and entry
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { venueSlug } from '../ecosystem/js/deeplink-math.js';

const hub = readFileSync('ecosystem/index.html', 'utf8'), venue = readFileSync('ecosystem/tracks/lagoon/index.html', 'utf8');
const body = (h) => h.slice(h.indexOf('<body'), h.indexOf('</body>'));
const ids = (h) => new Set([...body(h).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const head = (h) => h.slice(0, h.indexOf('</head>'));
// The ids the runner and the HUD reach for; a venue page without one would throw at load
const REQUIRED = ['world', 'loader', 'intro', 'start', 'theme', 'touch', 'stop', 'stop-eyebrow', 'prompt-label', 'prompt-btn', 'sound-chip'];

test('the venue page shares the hub\'s HUD and sheets', () => {
  assert.deepEqual([...ids(venue)].sort(), [...ids(hub)].sort());
  for (const id of REQUIRED) assert.ok(ids(venue).has(id), id);
  // The venue's own copy: the opening card's title and the intro dialog (plan 5 Task 5); everything else is the hub's
  const same = (h) => h.replace(/<script type="module" src="[^"]+"><\/script>/, '').replace(/<dialog id="intro"[\s\S]*?<\/dialog>/, '').replace(/<p class="arrive-title">[^<]*<\/p>/, '');
  assert.equal(same(body(venue)), same(body(hub)), 'the body differs only in its entry script, its opening title and its intro');
});

const intro = (h) => /<dialog id="intro"[\s\S]*?<\/dialog>/.exec(h)[0];
test('the venue intro is the Lagoon\'s own, with the hub\'s buttons and keys', () => {
  const v = intro(venue), hb = intro(hub);
  assert.match(v, /<h1>The Lagoon<\/h1>/);
  assert.match(v, /tarmac/); assert.match(v, /dirt/);
  // lagoon.js `surface`: tarmac from the last corner across the line to the water, so the lap ends on tarmac (review I1)
  assert.doesNotMatch(venue, /ends on dirt/); assert.match(v, /back onto tarmac for the last corner/); assert.match(v, /hairpin/); assert.match(v, /tyre walls/); assert.match(v, /esses/); assert.match(v, /board/);
  const ids = (h) => [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids(v), ids(hb), 'the same ids (start, intro-race, intro-map), which the runner wires');
  assert.equal(/<ul class="keys">[\s\S]*?<\/ul>/.exec(v)[0], /<ul class="keys">[\s\S]*?<\/ul>/.exec(hb)[0], 'the same keys');
  assert.match(venue, /<p class="arrive-title">The Lagoon<\/p>/, 'the opening card names the venue');
});

test('the venue page has its own meta, is indexed now the Lagoon is on, and the venue entry', () => {
  const h = head(venue);
  assert.match(h, /<title>[^<]*The Lagoon[^<]*<\/title>/);
  assert.doesNotMatch(h, /name="robots"/, 'no robots noindex');
  for (const k of ['name="description"', 'property="og:description"', 'name="twitter:description"']) assert.match(h, new RegExp(`<meta ${k} content="[^"]{60,}">`), k);
  assert.match(h, /<meta property="og:image:alt" content="[^"]*Drive around Strike[^"]*">/, 'the alt describes the hub\'s og.png honestly');
  assert.match(h, /<link rel="canonical" href="https:\/\/strike\.benryan\.com\.au\/ecosystem\/tracks\/lagoon\/">/);
  assert.match(h, /<meta property="og:url" content="https:\/\/strike\.benryan\.com\.au\/ecosystem\/tracks\/lagoon\/">/);
  assert.match(h, /<meta property="og:image:alt" content="[^"]*Lagoon[^"]*">/);
  assert.match(h, /<meta name="description" content="[^"]*Lagoon[^"]*">/);
  assert.match(venue, /<script type="module" src="\/ecosystem\/js\/venue\.js"><\/script>/);
  assert.doesNotMatch(venue, /js\/main\.js/);
  assert.doesNotMatch(head(hub), /noindex/, 'the hub stays indexed');
});

test('venue.js takes its slug from its own path and runs the venue entry', () => {
  assert.equal(venueSlug('/ecosystem/tracks/lagoon/'), 'lagoon');
  assert.equal(venueSlug('/ecosystem/tracks/lagoon/index.html'), 'lagoon');
  assert.equal(venueSlug('/ecosystem/tracks/lagoon'), 'lagoon');
  for (const bad of ['/ecosystem/', '/ecosystem/tracks/', '/ecosystem/tracks/La..goon/', '/ecosystem/tracks/../x/', '/other/tracks/lagoon/']) assert.equal(venueSlug(bad), null, bad);
  const src = readFileSync('ecosystem/js/venue.js', 'utf8');
  assert.match(src, /venueSlug\(location\.pathname\)/); assert.match(src, /import\(`\.\.\/tracks\/\$\{slug\}\.js`\)/);
  assert.match(src, /runWorld\(venueEntry\(mod\.default, \{ slug \}\)\)/);
});

test('vercel.json\'s site-wide CSP and security headers cover the venue path', () => {
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const csp = v.headers.find((h) => h.headers.some((x) => x.key === 'Content-Security-Policy') && !h.source.includes('arcade/('));
  assert.ok(new RegExp(`^${csp.source}$`).test('/ecosystem/tracks/lagoon/'), csp.source);
  assert.ok(new RegExp(`^${csp.source}$`).test('/ecosystem/tracks/lagoon.js'), 'the track module too');
});

test('the view-transition opt-in is on the world pages only (review I1)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  assert.doesNotMatch(readFileSync(new URL('../ecosystem/ecosystem.css', import.meta.url), 'utf8'), /@view-transition/);
  assert.match(readFileSync(new URL('../ecosystem/portal.css', import.meta.url), 'utf8'), /@view-transition\s*\{\s*navigation:\s*auto/);
  assert.match(head(hub), /\/ecosystem\/portal\.css/); assert.match(head(venue), /\/ecosystem\/portal\.css/);
  const dir = new URL('../ecosystem/', import.meta.url);
  const pages = [];
  const walk = (u) => { for (const d of readdirSync(u, { withFileTypes: true })) { if (d.isDirectory() && !['vendor', 'models', 'img', 'js'].includes(d.name)) walk(new URL(d.name + '/', u)); else if (d.name === 'index.html') pages.push(new URL(d.name, u)); } };
  walk(dir);
  for (const u of pages) {
    const h = head(readFileSync(u, 'utf8'));
    if (/\/ecosystem\/portal\.css/.test(h)) assert.ok(/ecosystem\/index\.html$|tracks\/lagoon\/index\.html$/.test(u.pathname), `${u.pathname} loads portal.css`);
  }
});
