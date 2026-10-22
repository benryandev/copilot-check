// Funding in the replay: Strike's hourly rates, settled on the copy at each hourly mark (+ rate: longs pay, shorts receive).
import test from 'node:test'; import assert from 'node:assert/strict';
import { replay, fmSize, fetchLead } from '../core/replay.js';
import { fundingHistory } from '../core/strike.js';
import { fake } from './fake-fetch.js';

const T = Date.UTC(2026, 9, 1), H = 3600e3;
const mk = { 'X-USD': { base: 'X', hl: 'X', minNotional: 10, tiers: [[1e18, 10, 0.025, 0]] } };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const ord = (t, q, px, sp) => ({ c: 'X-USD', t, q, n: Math.abs(q) * px, sp });
const marks = n => Array.from({ length: n }, (_, i) => [T + (i + 1) * H, 'X-USD', 100, 100, 100]);
const rates = (n, r) => Array.from({ length: n }, (_, i) => [T + (i + 1) * H - 1, r]);
const run = (orders, o = {}) => replay({ orders, marks: marks(3), start: 1000, size: fmSize(50, 5), lev: 5, fee: 0, mk, ...o });

test('a long pays a positive rate on size x mark each hour; a short receives it', () => {
  const funding = { 'X-USD': rates(3, 0.001) };  // 2.5 units x $100 x 0.1% = $0.25 an hour
  const long = run([ord(T, 1, 100, 0)], { funding }), short = run([ord(T, -1, 100, 0)], { funding });
  close(long.funding, -0.75); close(long.net, -0.75); close(long.realised, -0.75);
  close(short.funding, 0.75); close(short.net, 0.75);
});

test('no funding argument, or a market without history, leaves results unchanged', () => {
  const a = run([ord(T, 1, 100, 0)]), b = run([ord(T, 1, 100, 0)], { funding: { 'Y-USD': rates(3, 0.01) } });
  assert.equal(a.funding, 0); assert.deepEqual(a, b);
});

test('hours before the copy opened are not charged', () => {
  const r = run([ord(T + 2 * H + 1, 1, 100, 0)], { funding: { 'X-USD': rates(3, 0.001) } });  // open after the 2nd mark
  close(r.funding, -0.25);
});

test('isolated funding comes out of the margin, so a copy can be liquidated by funding alone', () => {
  // 10x, $50 margin on $500: maintenance 2.5% = $12.50. 4% an hour takes $20, $20, then the third mark liquidates it.
  const r = replay({ orders: [ord(T, 1, 100, 0)], marks: marks(3), start: 1000, size: fmSize(50, 10), lev: 10, fee: 0, mk, funding: { 'X-USD': rates(3, 0.04) } });
  assert.equal(r.liquidations, 1);
  close(r.net, -50);  // funding paid plus the margin that was left: the posted $50 in all
});

test('fundingHistory parses Strike\'s {columns, data} table, sorted; [] on a missing market', async () => {
  const f = fake({ '/stat/v1/stats/coin/history/funding': u => (String(u).includes('X-USD')
    ? { columns: ['ts', 'funding_rate'], data: [[T + H, '0.0002'], [T, -0.0001]] } : 404) });
  assert.deepEqual(await fundingHistory('X-USD', { fetch: f }), [[T, -0.0001], [T + H, 0.0002]]);
  assert.deepEqual(await fundingHistory('Y-USD', { fetch: f }), []);
});

test('fetchLead reads funding for the marked markets once each, shares a cache, and can skip it', async () => {
  const fills = [{ coin: 'X', px: '100', sz: '1', side: 'B', time: T, startPosition: '0', oid: 1, tid: 1 }];
  const routes = { userFillsByTime: fills, candleSnapshot: [{ T: T + H, t: T, c: '100', l: '100', h: '100' }],
    portfolio: [['allTime', { accountValueHistory: [[T, '1000']], pnlHistory: [] }]],
    '/stat/v1/stats/coin/history/funding': { columns: ['ts', 'funding_rate'], data: [[T - 200 * H, 0.1], [T + H - 1, 0.001]] } };
  const calls = [], cache = new Map();
  const a = await fetchLead('0xab', 1, mk, { fetch: fake(routes, calls), now: T + 2 * H, pause: 0, fundingCache: cache });
  await fetchLead('0xab', 1, mk, { fetch: fake(routes, calls), now: T + 2 * H, pause: 0, fundingCache: cache });
  assert.equal(calls.filter(c => c.url.includes('/history/funding')).length, 1);
  assert.deepEqual(a.funding, { 'X-USD': [[T + H - 1, 0.001]] });  // rows older than the window are dropped
  const b = await fetchLead('0xab', 1, mk, { fetch: fake(routes), now: T + 2 * H, pause: 0, funding: false });
  assert.deepEqual(b.funding, {});
});
