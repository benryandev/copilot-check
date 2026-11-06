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
  // R31 and R32 (fix wave G, H): the Map sheet's lede and the footer are the venue's too
  const same = (h) => h.replace(/<script type="module" src="[^"]+"><\/script>/, '').replace(/<dialog id="intro"[\s\S]*?<\/dialog>/, '').replace(/<p class="arrive-title">[^<]*<\/p>/, '')
    .replace(/<footer class="hud hud-foot">[\s\S]*?<\/footer>/, '').replace(/(<dialog id="map"[\s\S]*?<h2 id="map-title">Where to\?<\/h2>\s*)<p class="muted">[^<]*<\/p>/, '$1')
    .replace(/\s*<fieldset class="quality map-theme">[\s\S]*?<\/fieldset>/, '')
    .replace('<dialog id="map" class="sheet sheet--venue"', '<dialog id="map" class="sheet"').replace(/\s*<div class="map-rows">([\s\S]*?)<\/div>(\s*<div class="sheet-actions">)/, '$1$2').replace(/\s+/g, ' ');
  assert.equal(same(body(venue)), same(body(hub).replace(/\s+/g, ' ')), 'the body differs only in its entry script, its opening title, its intro, its Map lede, its Map theme row, its Map rows wrapper and its footer');
});

// Lagoon v2 Task 5: on 375 wide the Music row sat under the sticky Keep driving bar until the sheet was scrolled. The venue's
// four settings sit in .map-rows, a two-column grid at 480 and under (Graphics across both); the hub's sheet is as it was.
test('the venue Map wraps its four settings in .map-rows under .sheet--venue; the hub has neither', () => {
  const map = /<dialog id="map"[\s\S]*?<\/dialog>/.exec(venue)[0];
  assert.match(map, /^<dialog id="map" class="sheet sheet--venue"/);
  const rows = /<div class="map-rows">([\s\S]*?)<\/div>\s*<div class="sheet-actions">/.exec(map);
  assert.ok(rows, 'a .map-rows holds the settings and ends before the action bar');
  assert.equal((rows[1].match(/<fieldset class="quality/g) || []).length, 4);
  assert.deepEqual([...rows[1].matchAll(/<legend>([^<]*)<\/legend>/g)].map((m) => m[1]), ['Theme', 'Graphics', 'Sound', 'Music']);
  assert.doesNotMatch(hub, /sheet--venue|map-rows/);
  const css = readFileSync('ecosystem/ecosystem.css', 'utf8');
  assert.match(css, /@media \(max-width: 480px\) \{[^}]*\.sheet--venue \.map-rows \{ display: grid; grid-template-columns: 1fr 1fr;/);
  assert.match(css, /\.sheet--venue \.map-rows fieldset:nth-child\(-n\+2\) \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.sheet--venue > p\.muted \{ display: none; \}/);
});

// The blind read (6 Nov 2026): a phone on a venue had no theme control, because the timer panel hides the HUD's theme
// chip at 600 px and under and a venue's timer panel never leaves. The venue's Map sheet carries a Theme row there.
test('the venue Map has a Theme row for phones (Light, Dark), shown only while the timer panel hides the HUD chip; the hub has none', () => {
  const row = /<fieldset class="quality map-theme">\s*<legend>Theme<\/legend>\s*<button type="button" class="chip" data-scheme="light">Light<\/button>\s*<button type="button" class="chip" data-scheme="dark">Dark<\/button>\s*<\/fieldset>/;
  assert.match(venue, row);
  const map = /<dialog id="map"[\s\S]*?<\/dialog>/.exec(venue)[0];
  // First of the settings, so a phone sees it without scrolling the sheet (at 375 by 812 the sticky Keep driving covers the last row)
  assert.ok(map.indexOf('map-groups') < map.indexOf('map-theme') && map.indexOf('map-theme') < map.indexOf('data-quality="auto"'), 'in the Map sheet, after the rows, before Graphics');
  assert.doesNotMatch(hub, /map-theme|data-scheme/);
  const css = readFileSync('ecosystem/ecosystem.css', 'utf8');
  assert.match(css, /\n\.map-theme \{ display: none; \}/);
  const phone = css.slice(css.indexOf('@media (max-width: 600px) {', css.indexOf('/* Phones (portrait')));
  assert.match(phone.slice(0, phone.indexOf('\n}')), /body:has\(#race-hud:not\(\[hidden\]\)\) :is\(#theme, #sound-chip\) \{ display: none; \}[^\n]*\n\s*body:has\(#race-hud:not\(\[hidden\]\)\) \.map-theme \{ display: flex; \}/);
  const src = readFileSync('ecosystem/js/runner.js', 'utf8');
  assert.match(src, /querySelectorAll\("\[data-scheme\]"\)\.forEach\(\(b\) => b\.setAttribute\("aria-pressed", String\(\(b\.dataset\.scheme === "dark"\) === dark\)\)\)/, 'applyTheme marks the chosen one');
  assert.match(src, /dark = b\.dataset\.scheme === "dark";\n\s*try \{ localStorage\.setItem\("theme", dark \? "dark" : "light"\); \} catch \{\}\n\s*applyTheme\(\);/, 'a click sets, saves and applies it');
});

const foot = (h) => /<footer class="hud hud-foot">[\s\S]*?<\/footer>/.exec(h)[0];
const mapLede = (h) => /<h2 id="map-title">Where to\?<\/h2>\s*<p class="muted">([^<]*)<\/p>/.exec(h)[1];
test('the venue footer: no live-data note or stops link, the credit and disclosure kept, a link home (R32)', () => {
  const v = foot(venue);
  assert.doesNotMatch(v, /Live data/); assert.doesNotMatch(v, /Every stop/); assert.doesNotMatch(v, /\/ecosystem\/stops\//);
  assert.match(v, /Made with <a href="https:\/\/threejs\.org"[^>]*>three\.js<\/a>/);
  assert.match(v, /Independent, not affiliated with Strike/); assert.match(v, /Not affiliated with Strike/);
  assert.match(v, /<a href="https:\/\/benryan\.com\.au">Built by Ben Ryan<\/a>/);
  assert.match(v, /<a class="foot-home" href="\/ecosystem\/">Back to the World<\/a>/);
  // The hub's footer is as it was
  assert.equal(foot(hub), `<footer class="hud hud-foot">
    <span class="foot-live">Live data: Strike public API ·</span>
    <span class="foot-credit">Made with <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a></span>
    <span><span class="foot-long">Independent, not affiliated with Strike</span><span class="foot-short">Not affiliated with Strike</span></span>
    <a href="/ecosystem/stops/">Every stop</a>
    <a href="https://benryan.com.au">Built by Ben Ryan</a>
  </footer>`);
  assert.match(readFileSync('ecosystem/ecosystem.css', 'utf8'), /\.hud-foot \.foot-home \{ display: none; \}/, 'hidden on phones, as the stops link is');
});
test('the venue Map sheet\'s lede names its two ways out (R31); the hub\'s is as it was', () => {
  assert.equal(mapLede(venue), 'Drive back to the world, or go to the start line.');
  assert.equal(mapLede(hub), 'Pick a feature to drive straight to it, or read about it here.');
});

const intro = (h) => /<dialog id="intro"[\s\S]*?<\/dialog>/.exec(h)[0];
test('the venue intro is the Lagoon\'s own, with the hub\'s buttons and keys', () => {
  const v = intro(venue), hb = intro(hub);
  assert.match(v, /<h1>The Lagoon<\/h1>/);
  assert.match(v, /tarmac/); assert.match(v, /dirt/);
  // lagoon.js `surface`: tarmac from the last corner across the line to the water, so the lap ends on tarmac (review I1)
  assert.doesNotMatch(venue, /ends on dirt/); assert.match(v, /A timed lap on tarmac and dirt, with a board of best times\./); assert.match(v, /Line up the ramp out of the hairpin to jump the water, or you wade through it\./, 'the run-up from the hairpin\'s exit clears; a car off the ramp wades (fix wave A)');
  assert.doesNotMatch(venue, /committed/, 'a stopped car at the hairpin\'s exit still clears, so the page claims no committed exit'); assert.match(v, /[Tt]yre walls/); assert.match(v, /esses/); assert.match(v, /board/);
  const ids = (h) => [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids(v), ids(hb), 'the same ids (start, intro-race, intro-map), which the runner wires');
  // The hub's keys without the pad line: Enter opens a pad (runner.js) and a venue has none (fix wave B)
  const keys = (h) => /<ul class="keys">[\s\S]*?<\/ul>/.exec(h)[0];
  assert.doesNotMatch(keys(v), /a pad/);
  assert.equal(keys(v), keys(hb).replace(/\n\s*<li><span class="key">Enter<\/span> open a pad<\/li>/, ''), 'the hub\'s keys less the pad line');
  assert.match(venue, /<p class="arrive-title">The Lagoon<\/p>/, 'the opening card names the venue');
  // The phone intro fits a 375 by 667 screen with its buttons and no scroll (the blind read, 6 Nov 2026: at 812 the buttons sat at
  // the bottom, and at 667 the sheet scrolled 109 px and #start's autofocus pushed the title off the top). Measured with the shoot's
  // browser after the trim: no scroll at 375 by 667. The venue's own sentences are held to that length.
  const lede = /<h1>The Lagoon<\/h1>\s*<p>([^<]+)<\/p>/.exec(v)[1], home = /<\/span>([^<]+)<span class="intro-more">/.exec(v)[1];
  assert.ok(lede.length <= 170, `the lede is ${lede.length} characters`);
  assert.equal(home, 'Map view or the arch takes you home to Strike HQ. ');
});

test('the venue page has its own meta, is indexed now the Lagoon is on, and the venue entry', () => {
  const h = head(venue);
  assert.match(h, /<title>[^<]*The Lagoon[^<]*<\/title>/);
  assert.doesNotMatch(h, /name="robots"/, 'no robots noindex');
  for (const k of ['name="description"', 'property="og:description"', 'name="twitter:description"']) assert.match(h, new RegExp(`<meta ${k} content="[^"]{60,}">`), k);
  // R28: the venue's own share card (tools/og-lagoon.mjs), referenced by both cards, with an alt that describes it
  const IMG = 'https://strike.benryan.com.au/ecosystem/tracks/lagoon/og.png';
  assert.match(h, new RegExp(`<meta property="og:image" content="${IMG}">`)); assert.match(h, new RegExp(`<meta name="twitter:image" content="${IMG}">`));
  assert.doesNotMatch(h, /ecosystem\/img\/og\.png/, 'not the hub\'s card');
  const png = readFileSync('ecosystem/tracks/lagoon/og.png');
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length < 300 * 1024, `${png.length} bytes`);
  assert.match(h, /<meta property="og:image:alt" content="An aerial view of the Lagoon[^"]*Race the Lagoon\.">/, 'the alt describes the venue card');
  assert.match(h, /<link rel="canonical" href="https:\/\/strike\.benryan\.com\.au\/ecosystem\/tracks\/lagoon\/">/);
  assert.match(h, /<meta property="og:url" content="https:\/\/strike\.benryan\.com\.au\/ecosystem\/tracks\/lagoon\/">/);
  assert.match(h, /<meta property="og:image:alt" content="[^"]*Lagoon[^"]*">/);
  assert.match(h, /<meta name="description" content="[^"]*Lagoon[^"]*">/);
  const desc = /<meta name="description" content="([^"]+)">/.exec(h)[1];
  assert.ok(desc.length <= 160, `the description fits a search result: ${desc.length} characters`);
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
