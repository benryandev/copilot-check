// Draft parsing, claim filling and the guide checks (tools/lib/guide-parse.mjs, tools/guide-check.mjs): node --test qa/guide-check-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDraft, fillClaims, sectionsOf } from '../tools/lib/guide-parse.mjs';
import { checkGuide, BANNED } from '../tools/guide-check.mjs';

const good = readFileSync(new URL('./fixtures/guides/good.md', import.meta.url), 'utf8');
const registry = JSON.parse(readFileSync(new URL('./fixtures/guides/claim-positions.json', import.meta.url), 'utf8'));
const ctx = { stopKeys: ['strike', 'perpetuals'], registry, imageDims: () => ({ width: 1200, height: 700 }), today: '2026-11-10' };
const draft = () => parseDraft(good);

test('parseDraft splits front matter, body and sources', () => {
  const d = draft();
  assert.equal(d.meta.slug, 'what-is-strike'); assert.equal(d.meta.stop, 'strike');
  assert.equal(d.meta.title, 'What is Strike? A plain-English guide to the exchange', 'quotes stripped');
  assert.ok(d.body.startsWith('*Not affiliated with Strike. Not financial advice.*'));
  assert.ok(d.sources.startsWith('## Fact sources')); assert.ok(!d.body.includes('Fact sources'));
});
test('fillClaims substitutes and reports; unknown ids throw', () => {
  const r = fillClaims('Strike lists {{claim:markets-count}} markets.', { 'markets-count': { value: '31' } });
  assert.deepEqual(r, { text: 'Strike lists 31 markets.', used: ['markets-count'] });
  assert.throws(() => fillClaims('{{claim:nope}}', {}), /unknown claim: nope/);
});
test('sectionsOf lists H2 and H3 in order', () => {
  const t = sectionsOf(draft().body).filter((s) => s.level === 2).map((s) => s.title);
  assert.equal(t[0], 'In one minute'); assert.equal(t.at(-1), 'Next'); assert.ok(t.includes('Questions people ask'));
  const faq = sectionsOf(draft().body).filter((s) => s.level === 3 && s.title.endsWith('?'));
  assert.equal(faq.length, 5, 'two in What, three in the FAQ'); assert.ok(faq[2].text.includes('No.'));
});
test('the good draft passes', () => { assert.deepEqual(checkGuide(draft(), ctx), []); });
const broken = (edit) => { const d = draft(); edit(d); return checkGuide(d, ctx); };
test('each rule fails on its own', () => {
  assert.match(broken((d) => { d.meta.title = 'Short'; }).join('\n'), /title.*50/);
  assert.match(broken((d) => { d.meta.stop = 'nowhere'; }).join('\n'), /stop.*nowhere/);
  assert.match(broken((d) => { d.body = d.body.replace('## In one minute', '## Intro'); }).join('\n'), /In one minute/);
  assert.match(broken((d) => { d.body = d.body.replace(/\n## Questions people ask[^]*?(?=\n## )/, ''); }).join('\n'), /Questions people ask/);
  assert.match(broken((d) => { d.body += '\n\nWe recommend 10x.'; }).join('\n'), /banned/);
  assert.match(broken((d) => { d.body = d.body.replace('colour', 'color'); }).join('\n'), /American/);
  assert.match(broken((d) => { d.body = d.body.replace('![The trade page]', '![]'); }).join('\n'), /alt/);
  assert.match(broken((d) => { d.body = d.body.replace('{{claim:markets-count}}', '{{claim:gone}}'); }).join('\n'), /unknown claim: gone/);
  assert.match(checkGuide(draft(), { ...ctx, today: '2027-01-01' }).join('\n'), /stale/);
  assert.match(broken((d) => { d.body = d.body.replace('## In one minute\n', '## In one minute\n\nTry https://app.strikefinance.org/trade/BTC?referralCode=BenRyan now.\n'); }).join('\n'), /referral/);
  assert.match(broken((d) => { d.sources = ''; }).join('\n'), /Fact sources/);
  assert.match(broken((d) => { d.body = d.body.replace('*Not financial advice.*', ''); }).join('\n'), /footer/);
  assert.match(broken((d) => { d.body = d.body.replace('## Who', 'word '.repeat(400) + '\n\n## Who'); }).join('\n'), /words/);
  assert.match(broken((d) => { d.body = d.body.replace('## How to get started', '# How to get started'); }).join('\n'), /H1/);
  assert.match(broken((d) => { d.body = d.body.replace('3. **Deposit.**', '**Deposit.**').replace('4. **Look around', '**Look around'); }).join('\n'), /How to.*3 to 6/);
  assert.match(broken((d) => { d.body = d.body.replace(/\| Type[^]*?\n\n/, '').replace(/^\d+\. /gm, '- '); }).join('\n'), /table or ordered list/);
  assert.match(checkGuide(draft(), { ...ctx, imageDims: () => ({ width: 2400, height: 1400 }) }).join('\n'), /1600/);
  assert.match(checkGuide(draft(), { ...ctx, imageDims: () => null }).join('\n'), /image/);
  assert.match(broken((d) => { d.body = d.body.replace('Say you deposit $100', 'Say you deposit $100 and then you also decide to add another fifty dollars on top of that first deposit the next morning before the market opens'); }).join('\n'), /32 words/);
});
test('BANNED catches the sheet rules and the price form', () => {
  for (const s of ['recommended', 'APR', 'loss cover', 'you should', 'STRIKE price', 'STRIKE token price']) assert.ok(BANNED.some((re) => re.test(s)), s);
  assert.ok(!BANNED.some((re) => re.test('a strike price in options')), 'lower-case strike is not the token');
});
