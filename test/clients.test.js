import test from 'node:test'; import assert from 'node:assert/strict';
import * as strike from '../core/strike.js'; import * as hl from '../core/hl.js';
import { fake } from './fake-fetch.js';

test('copy fill tag parsed', async () => {
  const f = await strike.fills('acc-1', { fetch: fake({ '/v2/history/fill': 'strike-fills.json' }) });
  assert.equal(f[0].copySubId, 'sub-aaa'); assert.equal(f[1].copySubId, null); assert.equal(f[2].autoClose, 'liquidation'); assert.equal(f[1].autoClose, null);
});
test('copy positions from the copy route', async () => {
  const p = await strike.copyPositions('acc-1', { fetch: fake({ '/v2/copy/positions': 'strike-copy-positions.json' }) });
  assert.equal(p[0].subId, 'sub-aaa'); assert.equal(p[0].leadId, '0xlead000000000000000000000000000000000001'); assert.equal(p[0].liq, 76000);
});
test('copy positions falls back on 401', async () => {
  const p = await strike.copyPositions('acc-1', { fetch: fake({ '/v2/copy/positions': 401, '/v2/positions': 'strike-positions.json', '/price/v2/premiumIndex': 'strike-premium.json' }) });
  assert.equal(p.length, 1); assert.equal(p[0].subId, null); assert.equal(p[0].mark, 84000); assert.equal(p[0].liq, 76000); assert.equal(p[0].side, 'long');
});
test('copy positions null when Strike is unreachable', async () => {
  assert.equal(await strike.copyPositions('acc-1', { fetch: fake({ '/v2/copy/positions': 401, '/v2/positions': 500 }) }), null);
});
test('accounts: main with subs, sub, nickname not found', async () => {
  const m = await strike.accountByAddress('addr1qtest', { fetch: fake({ '/v2/account': 'strike-account-main.json' }) });
  assert.deepEqual(m.subs.map(s => s.id), ['acc-sub1', 'acc-sub2']);
  const s = await strike.accountById('acc-sub1', { fetch: fake({ '/v2/account': 'strike-account-sub.json' }) });
  assert.equal(s.isSub, true); assert.equal(s.name, 'Sub1'); assert.equal(s.parentId, 'acc-main');
  assert.equal(await strike.accountByNickname('@nobody', { fetch: fake({}) }), null);
});
test('leaderboard rows normalised', async () => {
  const r = await strike.leaderboard({ fetch: fake({ '/v2/copy/leaderboard': 'strike-leaderboard.json' }) });
  assert.equal(r[0].leadId, '0xlead000000000000000000000000000000000001'); assert.equal(r[0].mode, 'fixed margin'); assert.equal(r[0].amount, 10);
  assert.equal(r[1].mode, 'fixed ratio'); assert.equal(r[1].amount, 500);
});
test('fills paging stops under 2000 and dedupes', async () => {
  const page1 = Array.from({ length: 2000 }, (_, i) => ({ tid: i, oid: i, time: 1000 + i, coin: 'BTC' }));
  const page2 = [{ tid: 1999, oid: 1999, time: 2999, coin: 'BTC' }, { tid: 2000, oid: 2000, time: 3000, coin: 'BTC' }, { tid: 2001, oid: 2001, time: 3001, coin: 'BTC' }];
  let n = 0; const f = await hl.fillsByTime('0xabc', 0, 9999, { pause: 0, fetch: fake({ userFillsByTime: () => JSON.stringify(n++ ? page2 : page1) }) });
  assert.equal(f.length, 2002); assert.equal(f.truncated, false); assert.equal(f.at(-1).tid, 2001);
});
test('fills paging marks truncation at maxPages', async () => {
  const page = s => Array.from({ length: 2000 }, (_, i) => ({ tid: s + i, oid: s + i, time: s + i, coin: 'BTC' }));
  let n = 0; const f = await hl.fillsByTime('0xabc', 0, 1e9, { maxPages: 2, pause: 0, fetch: fake({ userFillsByTime: () => JSON.stringify(page(2000 * n++)) }) });
  assert.equal(f.length, 4000); assert.equal(f.truncated, true);
});
test('clearinghouse reads both dexes', async () => {
  const c = await hl.clearinghouse('0xabc', { fetch: fake({ clearinghouseState: 'hl-ch-main.json', 'clearinghouseState:xyz': 'hl-ch-xyz.json' }) });
  assert.equal(c.main.positions[0].coin, 'BTC'); assert.equal(c.main.accountValue, 10000);
  assert.equal(c.xyz.positions[0].coin, 'xyz:GOLD'); assert.equal(c.xyz.marginUsed, 2900); assert.equal(c.xyz.positions[0].liqPx, null);
});
