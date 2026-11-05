// The chase camera's framing maths (no three.js): node --test qa/camera-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { chaseFrame, behindLine } from '../ecosystem/js/camera-math.js';

const today = (aspect, speed) => ({ back: 11 + Math.max(0, speed) * 0.12, ahead: aspect < 1 ? 1 : 4, lift: aspect < 1 ? 0.6 : 2.2 });

test('chaseFrame is today\'s framing whenever the car is not on the grid', () => {
  for (const aspect of [0.46, 0.56, 1.0, 1.6]) for (const speed of [0, 10, 30]) {
    assert.deepEqual(chaseFrame({ aspect, speed, grid: false }), today(aspect, speed), `aspect ${aspect}, ${speed} m/s`);
  }
});

test('on the grid landscape keeps today\'s framing', () => {
  assert.deepEqual(chaseFrame({ aspect: 1.6, speed: 0, grid: true }), today(1.6, 0));
});

test('on the grid portrait pulls back and looks higher', () => {
  const f = chaseFrame({ aspect: 0.56, speed: 0, grid: true });
  assert.ok(f.back > 11 && f.lift >= 0.6, JSON.stringify(f));
  assert.equal(f.ahead, 1);
});

// A line at the origin, the track running along -z (heading 0), right of travel = (-fz, fx) = (1, 0)
const line = { x: 0, z: 0, fx: 0, fz: -1 };
test('behindLine is true up to 24 m short of the line on the centreline', () => {
  assert.equal(behindLine({ x: 0, z: 14 }, line), true);
  assert.equal(behindLine({ x: 0, z: 23 }, line), true);
  assert.equal(behindLine({ x: 0, z: 26 }, line), false);
});
test('behindLine is false past the line or far off the centreline', () => {
  assert.equal(behindLine({ x: 0, z: -2 }, line), false);
  assert.equal(behindLine({ x: 9, z: 14 }, line), false);
  assert.equal(behindLine({ x: -5, z: 14 }, line), true);
});
