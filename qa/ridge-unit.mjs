import test from 'node:test';
import assert from 'node:assert/strict';
import { RIDGE, ridgeLevels, ridgeProfile, candleIndex, candleDir } from '../ecosystem/js/ridge-math.js';

const LEN = 240;
const LIN = Array.from({ length: 24 }, (_, i) => 78000 + (i * 2000) / 23); // a steady climb: ends 8 m up, never scaled
const saw = Array.from({ length: 24 }, (_, i) => (i % 2 ? 80000 : 78000)); // the most volatile allowed day
test('ridgeLevels: range spans the height, 24 values, strings accepted', () => {
  const l = ridgeLevels(['78000', '79000', '80000']);
  assert.equal(l.length, 24);
  assert.equal(l[23], 8); assert.equal(l[22], 4); assert.equal(l[21], 0); assert.equal(l[0], 0); // padded at the front with the first
});
test('ridgeLevels: flat or missing data is a flat road', () => {
  assert.deepEqual(ridgeLevels([]), Array(24).fill(0));
  assert.deepEqual(ridgeLevels([80000]), Array(24).fill(0));
  assert.deepEqual(ridgeLevels(Array(24).fill(80000)), Array(24).fill(0));
  assert.deepEqual(ridgeLevels(['x', null, undefined]), Array(24).fill(0));
});
test('ridgeProfile: zero at both ends, plateau mid-candle, run-ins and segment length', () => {
  const p = ridgeProfile([78000, 80000, 79000, 78000], LEN);
  assert.equal(p.h(0), 0); assert.equal(p.h(LEN), 0); assert.equal(p.h(-5), 0); assert.equal(p.h(LEN + 5), 0);
  assert.equal(p.seg, (LEN - 2 * RIDGE.run) / 24);
  const mid = (i) => RIDGE.run + (i + 0.5) * p.seg;
  assert.ok(Math.abs(p.h(mid(21)) - 8 * p.scale) < 1e-6, 'candle 21 at the top');
  assert.ok(Math.abs(p.h(mid(23)) - 0) < 1e-6, 'last candle at the bottom');
});
test('ridgeProfile: the steepest allowed day keeps the average slope under maxSlope everywhere', () => {
  const p = ridgeProfile(saw, LEN);
  let worst = 0;
  for (let s = 0; s < LEN; s += 0.25) worst = Math.max(worst, Math.abs(p.h(s + 0.25) - p.h(s)) / 0.25);
  assert.ok(worst <= RIDGE.maxSlope * 1.5 + 1e-6, `peak slope ${worst}`); // smoothstep peaks at 1.5× the average
  assert.ok(p.scale < 1 && p.scale > 0, 'scaled down to fit');
});
test('ridgeProfile: a steady climb to 8 m is not scaled and crests at the last candle', () => {
  const p = ridgeProfile(LIN, LEN);
  assert.equal(p.scale, 1);
  assert.ok(Math.abs(p.h(RIDGE.run + 23.5 * p.seg) - 8) < 1e-6);
});
test('candleIndex and candleDir', () => {
  assert.equal(candleIndex(5, LEN), -1); assert.equal(candleIndex(RIDGE.run + 1, LEN), 0); assert.equal(candleIndex(LEN - RIDGE.run - 1, LEN), 23); assert.equal(candleIndex(LEN - 5, LEN), -1);
  assert.equal(candleDir(1, 2), 1); assert.equal(candleDir(2, 1), -1); assert.equal(candleDir(2, 2), 0);
});
test('the first and last 6 m stay level so the arches 5 m in stand on flat ground, whatever the first candle', () => {
  const p = ridgeProfile(Array.from({ length: 24 }, (_, i) => 80000 - i * 80), LEN); // starts at the top
  assert.equal(RIDGE.flat, 6);
  assert.equal(p.h(5), 0); assert.equal(p.h(6), 0); assert.equal(p.h(LEN - 5), 0);
  assert.ok(p.h(RIDGE.run) > 7.9, 'the run-in still reaches the first candle');
});
