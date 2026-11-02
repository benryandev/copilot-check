// Funding windsocks: the row's math (ecosystem/js/windsock-math.js) and the poles' places against the real terrain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WINDSOCKS, normaliseFunding, sockState, fmtRate, sockLabel, polePositions, segmentAngles, pollDue } from '../ecosystem/js/windsock-math.js';
import { roads, roadInfo, groundHeight, jumpAt } from '../ecosystem/js/terrain.js';
import { DISTRICTS } from '../ecosystem/js/content.js';

const RAW = { data: [
  { symbol: 'ADA-USD', strike: { rate: '0.00085672', timestamp: 1 }, bybit: { rate: '-0.00002496', timestamp: 1 }, binance: { rate: '0.00005096', timestamp: 1 }, hyperliquid: { rate: '0.0000556', timestamp: 1 } },
  { symbol: 'XAU-USD', strike: { rate: '0', timestamp: 1 }, bybit: { rate: '0.00007696', timestamp: 1 }, binance: { rate: 'x', timestamp: 1 } },
  { symbol: 'BTC-USD', strike: { rate: '0.0001', timestamp: 1 }, bybit: { rate: '0.0001', timestamp: 1 }, binance: { rate: '0.00008944', timestamp: 1 }, hyperliquid: { rate: '0.0001', timestamp: 1 } },
] };
test('normaliseFunding: bare symbols, numeric rates, null where a venue is missing or not a number', () => {
  const m = normaliseFunding(RAW);
  assert.deepEqual(m.get('ADA'), { strike: 0.00085672, bybit: -0.00002496, binance: 0.00005096, hyperliquid: 0.0000556 });
  assert.deepEqual(m.get('XAU'), { strike: 0, bybit: 0.00007696, binance: null, hyperliquid: null });
  for (const bad of [null, {}, { data: [] }, { data: 'x' }, [1]]) assert.equal(normaliseFunding(bad), null);
});
test('normaliseFunding: a null, empty, blank or missing rate is no data, never a zero', () => {
  const m = normaliseFunding({ data: [{ symbol: 'ZEC-USD', strike: { rate: null }, bybit: { rate: '' }, binance: { rate: ' ' }, hyperliquid: {} }, { symbol: 'SUI-USD', strike: { rate: false }, bybit: null }] });
  assert.deepEqual(m.get('ZEC'), { strike: null, bybit: null, binance: null, hyperliquid: null });
  assert.deepEqual(m.get('SUI'), { strike: null, bybit: null, binance: null, hyperliquid: null });
  assert.equal(normaliseFunding({ data: [{ symbol: 'XAU-USD', strike: { rate: '0' } }] }).get('XAU').strike, 0, 'a real zero is still data');
});
test('pollDue: five minutes after a good fetch, thirty seconds after a failed one, at once with none yet', () => {
  const M = 60_000;
  assert.equal(pollDue(1000 * M, 0, false), true, 'never fetched');
  assert.equal(pollDue(10 * M + 1, 10 * M, true), false); assert.equal(pollDue(14 * M, 10 * M, true), false); assert.equal(pollDue(15 * M, 10 * M, true), true);
  assert.equal(pollDue(10 * M + 20_000, 10 * M, false), false); assert.equal(pollDue(10 * M + 30_000, 10 * M, false), true, 'a failed fetch retries after 30 s');
});
test('sockState: fill scales to 0.0005, zero is data, null is none', () => {
  assert.deepEqual(sockState(null), { fill: 0, dir: 0, tone: 'none' });
  assert.deepEqual(sockState(0), { fill: 0, dir: 1, tone: 'up' });
  assert.deepEqual(sockState(0.0001), { fill: 0.2, dir: 1, tone: 'up' });
  assert.deepEqual(sockState(-0.00025), { fill: 0.5, dir: -1, tone: 'down' });
  assert.deepEqual(sockState(0.004), { fill: 1, dir: 1, tone: 'up' });
});
test('fmtRate and sockLabel: per-8h percent, three decimals, sign always, a dash for nothing', () => {
  assert.equal(fmtRate(0.00085672), '+0.086%'); assert.equal(fmtRate(-0.00239184), '-0.239%'); assert.equal(fmtRate(0), '+0.000%'); assert.equal(fmtRate(null), '—');
  assert.equal(sockLabel('ADA', 0.00085672), 'ADA  +0.086%'); assert.equal(sockLabel('ADA', null), 'ADA  —');
});
test('polePositions: nine Strike socks, 27 CEX socks in order, a board before the first; all off the road, on flat ground, not on the jump or a plaza', () => {
  const spoke = roads.find((r) => r.kind === 'spoke' && r.to === 'perps');
  const p = polePositions(spoke.len);
  assert.equal(p.strike.length, 9); assert.equal(p.cex.length, 27); assert.equal(p.strike[0].s, 71); assert.equal(p.strike[8].s, 71 + 5.5 * 8);
  assert.deepEqual(p.cex.slice(0, 3).map((c) => [c.venue, +(c.s - 71).toFixed(1)]), [['bybit', -1.6], ['binance', 0], ['hyperliquid', 1.6]]);
  assert.equal(p.board.s, 67);
  const at = ({ s, v }) => { const u = s / spoke.len, q = spoke.curve.getPointAt(u), t = spoke.curve.getTangentAt(u); const l = Math.hypot(t.x, t.z); return { x: q.x + (-t.z / l) * (spoke.half + v), z: q.z + (t.x / l) * (spoke.half + v) }; };
  for (const pole of [...p.strike, ...p.cex, p.board]) {
    const q = at(pole), info = roadInfo(q.x, q.z);
    assert.ok(info.d >= spoke.half + 1.2, `pole at s ${pole.s} is ${info.d.toFixed(2)} m from a centreline`);
    assert.ok(Math.abs(groundHeight(q.x, q.z)) < 0.4, `ground ${groundHeight(q.x, q.z).toFixed(2)} at s ${pole.s}`);
    assert.equal(jumpAt(q.x, q.z), null, `on the jump at s ${pole.s}`);
    assert.ok(Math.hypot(q.x - DISTRICTS.perps.centre[0], q.z - DISTRICTS.perps.centre[1]) > DISTRICTS.perps.radius + 1, `in the plaza at s ${pole.s}`);
  }
});
test('segmentAngles: over a flutter cycle a limp sock averages 80° at the tip, a full one horizontal; a full sock flutters more', () => {
  const cycle = (fill, k) => { const v = []; for (let i = 0; i < 120; i++) v.push(segmentAngles(fill, (i / 120) * (2 * Math.PI / 6))[k]); return v; };
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length, swing = (v) => Math.max(...v) - Math.min(...v);
  assert.equal(segmentAngles(0, 0).length, WINDSOCKS.segments);
  assert.ok(Math.abs(mean(cycle(0, 5)) - (80 * Math.PI) / 180) < 1e-6, 'limp tip hangs 80° on average');
  assert.ok(Math.abs(mean(cycle(0, 0)) - (80 / 6) * (Math.PI / 180)) < 1e-6, 'limp first segment 13.3°');
  assert.ok(Math.abs(mean(cycle(1, 5))) < 1e-6, 'a full sock is horizontal on average');
  assert.ok(swing(cycle(1, 0)) > swing(cycle(0, 0)) * 2.5, 'a full sock flutters more (8° against 2°)');
});
