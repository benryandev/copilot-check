// The in-world guide sheet's logic (ecosystem/js/guide-sheet.js), no DOM: node --test qa/guide-sheet-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { isInWorldPath, extractMain, mountGuide, closeGuide, onPopState, classifyLink, guideShortTitle, guideLinkText } from '../ecosystem/js/guide-sheet.js';

const page = '<!doctype html><html><head><title>What is Strike? · Strike guides</title></head><body><main id="main"><article><h1>What is Strike?</h1></article></main></body></html>';
const fakeParse = (html) => ({ querySelector: (sel) => sel === 'title' ? { textContent: html.match(/<title>(.*?)<\/title>/)[1] } : sel === 'main' && html.includes('<main') ? { outerHTML: html.match(/<main[^]*<\/main>/)[0], id: 'main' } : null });
const hist = () => { const h = { state: null, entries: [], pushState(s, _t, u) { h.state = s; h.entries.push(['push', u]); }, replaceState(s, _t, u) { h.state = s; h.entries.push(['replace', u]); }, back() { h.entries.push(['back']); } }; return h; };

test('isInWorldPath: guides, the index, the stops page; nothing else', () => {
  for (const p of ['/ecosystem/guides/', '/ecosystem/guides/what-is-strike/', '/ecosystem/stops/']) assert.ok(isInWorldPath(p), p);
  for (const p of ['/', '/ecosystem/', '/ecosystem/submit/', '/paper/x', 'https://docs.strikefinance.org/x', '/ecosystem/guides/img/x/cover.png']) assert.ok(!isInWorldPath(p), p);
});
test('extractMain: title before the separator and the main element; null without a main', () => {
  const r = extractMain(page, fakeParse);
  assert.equal(r.title, 'What is Strike?'); assert.equal(r.main.id, 'main');
  assert.equal(extractMain('<html><title>x</title><body>no main</body></html>', fakeParse), null);
});
test('mountGuide pushes once, replaces on a second guide, navigates on failure', async () => {
  const h = hist(); const mounted = [];
  const ok = { ok: true, text: async () => page };
  const r1 = await mountGuide('/ecosystem/guides/what-is-strike/', { fetch: async () => ok, parse: fakeParse, mount: (t) => mounted.push(t), history: h, worldUrl: '/ecosystem/?stop=strike' });
  assert.deepEqual(r1, { ok: true }); assert.deepEqual(h.entries, [['push', '/ecosystem/guides/what-is-strike/']]); assert.deepEqual(mounted, ['What is Strike?']);
  assert.deepEqual(h.state, { guide: '/ecosystem/guides/what-is-strike/', worldUrl: '/ecosystem/?stop=strike' });
  await mountGuide('/ecosystem/guides/what-is-a-perp/', { fetch: async () => ok, parse: fakeParse, mount: () => {}, history: h, worldUrl: '/ecosystem/?stop=strike' });
  assert.deepEqual(h.entries.at(-1), ['replace', '/ecosystem/guides/what-is-a-perp/']);
  const r3 = await mountGuide('/ecosystem/guides/missing/', { fetch: async () => ({ ok: false, status: 404, text: async () => 'nope' }), parse: fakeParse, mount: () => assert.fail('mounted a 404'), history: hist(), worldUrl: '/ecosystem/' });
  assert.deepEqual(r3, { navigate: '/ecosystem/guides/missing/' });
  const r4 = await mountGuide('/ecosystem/guides/x/', { fetch: async () => { throw new Error('offline'); }, parse: fakeParse, mount: () => {}, history: hist(), worldUrl: '/ecosystem/' });
  assert.deepEqual(r4, { navigate: '/ecosystem/guides/x/' });
  const r5 = await mountGuide('/ecosystem/guides/y/', { fetch: async () => ({ ok: true, text: async () => '<html><title>y</title><body>nothing</body></html>' }), parse: fakeParse, mount: () => {}, history: hist(), worldUrl: '/ecosystem/' });
  assert.deepEqual(r5, { navigate: '/ecosystem/guides/y/' }, 'a page without a main is opened as a page');
});
test('closeGuide goes back only when a guide entry is on top; popstate without a guide closes the sheet', () => {
  const h = hist(); closeGuide({ history: h }); assert.deepEqual(h.entries, []);
  h.state = { guide: '/ecosystem/guides/x/' }; closeGuide({ history: h }); assert.deepEqual(h.entries, [['back']]);
  let closed = 0, restored = 0;
  onPopState(null, { isOpen: () => true, close: () => closed++, restoreTitle: () => restored++ }); assert.equal(closed, 1); assert.equal(restored, 1);
  onPopState({ guide: '/x' }, { isOpen: () => true, close: () => closed++, restoreTitle: () => {} }); assert.equal(closed, 1, 'a guide state does not close');
  onPopState(null, { isOpen: () => false, close: () => closed++, restoreTitle: () => {} }); assert.equal(closed, 1, 'nothing to close');
});

test('Forward after Back reopens the guide the state names, without a new history entry', async () => {
  const opened = [];
  onPopState({ guide: '/ecosystem/guides/what-is-strike/' }, { isOpen: () => false, close: () => assert.fail('closed'), restoreTitle: () => {}, open: (u) => opened.push(u) });
  assert.deepEqual(opened, ['/ecosystem/guides/what-is-strike/']);
  const h = hist(); h.state = { guide: '/ecosystem/guides/what-is-strike/' };
  const r = await mountGuide('/ecosystem/guides/what-is-strike/', { fetch: async () => ({ ok: true, text: async () => page }), parse: fakeParse, mount: () => {}, history: h, worldUrl: '/ecosystem/', pushHistory: false });
  assert.deepEqual(r, { ok: true }); assert.deepEqual(h.entries, [], 'a popstate re-mount touches no history');
});
test('classifyLink: in-world pages, same-page fragments, external, plain', () => {
  const at = 'https://strike.benryan.com.au/ecosystem/guides/what-is-strike/';
  assert.equal(classifyLink('/ecosystem/guides/what-is-a-perp/', at), 'guide');
  assert.equal(classifyLink('/ecosystem/stops/', at), 'guide');
  assert.equal(classifyLink('#next', at), 'anchor');
  assert.equal(classifyLink('/ecosystem/guides/what-is-strike/#next', at), 'anchor');
  assert.equal(classifyLink('https://docs.strikefinance.org/x', at), 'external');
  assert.equal(classifyLink('/ecosystem/?stop=strike', at), 'drive');
  assert.equal(classifyLink('/ecosystem/?district=perps', at), 'drive');
  assert.equal(classifyLink('/ecosystem/', at), 'plain');
  assert.equal(classifyLink('/ecosystem/stops/#district-perps', 'https://strike.benryan.com.au/ecosystem/stops/'), 'anchor');
});
test('guide pills: one guide reads "Read the guide"; several carry their short titles', () => {
  const perp = { title: 'What is a perp? Perpetual futures explained in plain English' }, lev = { title: 'Long, short and leverage: what 2x, 10x and 20x really mean' };
  assert.equal(guideLinkText([perp], perp), 'Read the guide');
  assert.equal(guideLinkText([perp, lev], perp), 'Guide: What is a perp?');
  assert.equal(guideLinkText([perp, lev], lev), 'Guide: Long, short and leverage');
  assert.equal(guideShortTitle('Liquidation, and how to avoid it: a plain-English guide'), 'Liquidation, and how to avoid it');
  assert.equal(guideShortTitle('No separator in this one'), 'No separator in this one');
});
