import test from 'node:test'; import assert from 'node:assert/strict';
import { replay, hlToOrders, equityFn, fmSize, frSize, fetchLead, SLIP } from '../core/replay.js';
import { fake } from './fake-fetch.js';

const T = Date.UTC(2026, 9, 1);
const mkt = (hl, minNotional = 10) => ({ base: hl, hl, minNotional, tiers: [[1e18, 10, 0.025, 0]] });
const mk = { 'X-USD': mkt('X') };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const run = (orders, marks = [], o = {}) => replay({ orders, marks, start: 1000, size: fmSize(50, 5), lev: 5, fee: 0, mk, ...o });

// ---------- fetchLead budget ----------
const fill = (i, coin = 'X', t = T + i) => ({ coin, px: '100', sz: '1', side: 'B', time: t, startPosition: String(i), oid: i, tid: i });
const portfolio = [['allTime', { accountValueHistory: [[T, '1000']], pnlHistory: [] }]];

test('fetchLead with maxPages = 1 on a full 2,000-fill page is truncated', async () => {
  const f = fake({ userFillsByTime: Array.from({ length: 2000 }, (_, i) => fill(i)), candleSnapshot: [], portfolio });
  const r = await fetchLead('0xAB', 90, mk, { fetch: f, maxPages: 1, now: T + 1e7, pause: 0 });
  assert.equal(r.truncated, true); assert.equal(r.nfills, 2000); assert.equal(r.orders.length, 2000);
});

test('fetchLead marks only the 12 most-traded of 13 coins and lists the rest as unmarked', async () => {
  const names = Array.from({ length: 13 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
  const m13 = Object.fromEntries(names.map(c => [`${c}-USD`, mkt(c)]));
  // C13 trades least (1 fill); every other coin trades 2.
  const fills = names.flatMap((c, i) => (c === 'C13' ? [0] : [0, 1]).map(j => ({ ...fill(i * 10 + j, c), oid: i * 10 + j })));
  const calls = [];
  const f = fake({ userFillsByTime: fills, candleSnapshot: b => [{ T: T + 3600e3, t: T, c: '1', l: '1', h: '1', s: b.req.coin }], portfolio }, calls);
  const r = await fetchLead('0xab', 90, m13, { fetch: f, now: T + 1e7, pause: 0 });
  const coins = calls.filter(c => c.init.body).map(c => JSON.parse(c.init.body)).filter(b => b.type === 'candleSnapshot').map(b => b.req.coin);
  assert.equal(coins.length, 12); assert.ok(!coins.includes('C13'));
  assert.deepEqual(r.unmarked, ['C13-USD']); assert.equal(r.marks.length, 12); assert.equal(r.truncated, false);
});

test('fetchLead on a wallet with zero fills returns empty orders and marks', async () => {
  const r = await fetchLead('0xab', 90, mk, { fetch: fake({ userFillsByTime: [] }), now: T, pause: 0 });
  assert.deepEqual(r.orders, []); assert.deepEqual(r.marks, []); assert.deepEqual(r.equityHistory, []); assert.equal(r.nfills, 0);
});

// ---------- orders and equity ----------
test('hlToOrders groups by (symbol, oid), keeps the first fill\'s startPosition, drops unlisted coins, sorts by time', () => {
  const fills = [
    { coin: 'X', px: '100', sz: '1', side: 'B', time: 20, startPosition: '0', oid: 7 },
    { coin: 'ZZZ', px: '5', sz: '1', side: 'B', time: 5, startPosition: '0', oid: 8 },
    { coin: 'X', px: '102', sz: '1', side: 'B', time: 30, startPosition: '1', oid: 7 },
    { coin: 'X', px: '101', sz: '0.5', side: 'A', time: 10, startPosition: '3', oid: 9 },
  ];
  const o = hlToOrders(fills, mk);
  assert.equal(o.length, 2);
  assert.deepEqual(o[0], { c: 'X-USD', t: 10, q: -0.5, n: 50.5, sp: 3 });
  assert.deepEqual(o[1], { c: 'X-USD', t: 20, q: 2, n: 202, sp: 0 });
});

test('equityFn: last value at or before t, else the first; 0 for no history', () => {
  const e = equityFn([[300, '30'], [100, '10'], [200, '20']]);
  assert.equal(e(50), 10); assert.equal(e(100), 10); assert.equal(e(250), 20); assert.equal(e(1e9), 30);
  assert.equal(equityFn([])(5), 0);
});

test('frSize caps at 100% of the lead order and raises small entries to minEntry', () => {
  const eq = () => 500;
  close(frSize(1000, eq)(2, 100, 0), 2);  // 1000/500 capped at 1
  close(frSize(100, eq)(2, 100, 0), 0.4);
  close(frSize(100, eq, 1, 50)(-2, 100, 0), -0.5);
  assert.equal(frSize(100, () => 0)(2, 100, 0), 0);
});

// ---------- replay semantics ----------
const ord = (t, q, px, sp) => ({ c: 'X-USD', t, q, n: Math.abs(q) * px, sp });

test('a close lands SLIP worse and realises the same fraction as the lead', () => {
  const r = run([ord(T, 1, 100, 0), ord(T + 1, -0.5, 110, 1), ord(T + 2, -0.5, 110, 0.5)]);
  const units = 50 * 5 / 100;  // 2.5
  close(r.net, units * (110 * (1 - SLIP) - 100), 1e-9); close(r.realised, r.net); assert.equal(r.taken, 1);
  assert.deepEqual(r.openNow, {});
});

test('a flip closes the copy, then opens the remainder as a new entry', () => {
  const r = run([ord(T, 1, 100, 0), ord(T + 1, -3, 100, 1)]);
  assert.equal(r.taken, 2); close(r.openNow['X-USD'], -250, 1);
});

test('isolated liquidation loses the posted margin and dd is negative', () => {
  const r = replay({ orders: [ord(T, 1, 100, 0)], marks: [[T + 3600e3, 'X-USD', 95, 90, 101]], start: 1000, size: fmSize(50, 10), lev: 10, fee: 0, mk });
  assert.equal(r.liquidations, 1); close(r.liqLoss, 50); close(r.net, -50); assert.ok(r.dd < 0); close(r.dd, -50);
  assert.deepEqual(r.liqList, [['X-USD', '2026-10-01', 50]]);
});

test('skip reasons are checked in order: excluded before tiny before no_margin', () => {
  const tiny = fmSize(1, 1);  // $1 notional, under the $10 minimum
  assert.deepEqual(run([ord(T, 1, 100, 0)], [], { size: tiny, excluded: new Set(['X-USD']) }).skipped, { excluded: 1 });
  assert.deepEqual(run([ord(T, 1, 100, 0)], [], { size: tiny }).skipped, { tiny: 1 });
  assert.deepEqual(run([ord(T, 1, 100, 0)], [], { size: fmSize(2000, 5) }).skipped, { no_margin: 1 });
});

test('wiped is the UTC date equity first reached zero, and the replay stops there', () => {
  const r = replay({ orders: [ord(T, 1, 100, 0), ord(T + 7200e3, 1, 100, 1)], marks: [[T + 3600e3, 'X-USD', 1, 1, 101]],
    start: 1000, size: fmSize(1000, 10), lev: 10, fee: 0, mk: { 'X-USD': { ...mkt('X'), tiers: [[1e18, 10, 0, 0]] } } });
  assert.equal(r.wiped, '2026-10-01'); assert.equal(r.taken, 1);
});

test('replay log records opens, skips and closes without changing results', async () => {
  const { replay, fmSize } = await import('../core/replay.js');
  const mk = { 'BTC-USD': { hl: 'BTC', minNotional: 10, tiers: [[1e18, 10, 0.025, 0]] } };
  const orders = [{ c: 'BTC-USD', t: 1, q: 1, n: 100, sp: 0 }, { c: 'BTC-USD', t: 2, q: 1, n: 100, sp: 1 }, { c: 'BTC-USD', t: 3, q: -2, n: 220, sp: 2 }];
  const args = { orders, marks: [], start: 100, size: fmSize(10, 5), lev: 5, fee: 0.0005, mk, cap: 15 };
  const log = []; const a = replay({ ...args, log }), b = replay(args);
  assert.deepEqual(a, b);
  assert.deepEqual(log.map(e => e.kind + (e.why ? ':' + e.why : '')), ['open', 'skip:capped', 'close']);
});
