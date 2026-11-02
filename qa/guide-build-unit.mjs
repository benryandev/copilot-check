// The guide build (tools/guide-build.mjs): drafts + the claim registry → tools/lib/guides.json. node --test qa/guide-build-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGuides } from '../tools/guide-build.mjs';

const text = readFileSync(new URL('./fixtures/guides/good.md', import.meta.url), 'utf8');
const registry = JSON.parse(readFileSync(new URL('./fixtures/guides/claim-positions.json', import.meta.url), 'utf8'));
const base = { drafts: [{ path: 'G-S0-what-is-strike.md', text }], registry, images: () => ({ width: 1200, height: 700 }), previous: { guides: {} }, today: '2026-11-10', stopKeys: ['strike', 'perpetuals'] };

test('a good draft builds: fields, separated blocks, filled claim, image path and dimensions', () => {
  const { guides, registryOut, generated } = buildGuides(base);
  const g = guides['what-is-strike'];
  assert.equal(g.stop, 'strike'); assert.equal(g.order, 0); assert.equal(g.modified, '2026-11-10'); assert.equal(generated, '2026-11-10');
  assert.equal(g.title, 'What is Strike? A plain-English guide to the exchange'); assert.equal(g.next, 'what-is-a-perp'); assert.equal(g.series, 'start-here');
  assert.ok(g.html.includes('31 markets') && !g.html.includes('{{claim'));
  assert.ok(!g.html.includes('In one minute') && g.inOneMinute.startsWith('<ul>') && g.inOneMinute.includes('<strong>What it is:</strong>'));
  assert.equal(g.faq.length, 3); assert.ok(g.faq[0].q.endsWith('?')); assert.equal(g.faq[0].a, 'No. An Ethereum or Solana wallet works too, and deposits can be made by card.');
  assert.ok(!g.html.includes('Questions people ask') && !g.html.includes('Fact sources') && !g.html.includes('Not affiliated') && !g.html.endsWith('Not financial advice.</em></p>'));
  assert.ok(g.html.includes('<img src="/ecosystem/guides/img/what-is-strike/trade.png" alt="The trade page" width="1200" height="700" loading="lazy">'));
  assert.ok(g.html.includes('<figcaption>The trade page</figcaption>'));
  assert.ok(g.html.startsWith('<h2 id="what-is-strike">') && g.html.includes('<h2 id="next">Next</h2>'));
  assert.deepEqual(g.claims, ['markets-count']); assert.deepEqual(registryOut['markets-count'].guides, ['what-is-strike']);
  assert.ok(g.toc.some((t) => t.id === 'questions-people-ask') && g.toc[0].id === 'in-one-minute' && g.toc.at(-1).id === 'next');
  assert.ok(g.words >= 500 && g.words <= 700); assert.match(g.hash, /^[0-9a-f]{16}$/);
});
test('modified moves only when the text changes; a changed claim value moves it', () => {
  const first = buildGuides(base);
  const again = buildGuides({ ...base, previous: first, today: '2026-12-01' });
  assert.equal(again.guides['what-is-strike'].modified, '2026-11-10'); assert.equal(again.generated, '2026-11-10');
  const bumped = buildGuides({ ...base, previous: first, today: '2026-12-01', registry: { 'markets-count': { ...registry['markets-count'], value: '32', checked: '2026-11-30' } } });
  assert.equal(bumped.guides['what-is-strike'].modified, '2026-12-01'); assert.ok(bumped.guides['what-is-strike'].html.includes('32 markets'));
});
test('a failing draft stops the build and names the file and the rule', () => {
  assert.throws(() => buildGuides({ ...base, drafts: [{ path: 'G-S9-bad.md', text: text.replace('stop: strike', 'stop: nowhere') }] }), /G-S9-bad\.md[^]*stop.*nowhere/);
  assert.throws(() => buildGuides({ ...base, images: () => null }), /image/);
});
test('a held draft is skipped; two drafts with one slug collide', () => {
  const { guides } = buildGuides({ ...base, drafts: [{ path: 'G-S0.md', text: text.replace('slug:', 'status: hold\nslug:') }] });
  assert.deepEqual(Object.keys(guides), []);
  assert.throws(() => buildGuides({ ...base, drafts: [{ path: 'a.md', text }, { path: 'b.md', text }] }), /slug.*twice|duplicate/i);
});
