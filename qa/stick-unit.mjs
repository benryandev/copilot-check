// The steering stick's maths (no three.js): node --test qa/stick-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { STICK, stickValue, knobOffset, steerInput } from '../ecosystem/js/stick-math.js';

test('stickValue: dead zone round the landing point, linear to full lock at travel, left is positive', () => {
  assert.deepEqual(STICK, { travel: 40, dead: 5 });
  assert.equal(stickValue(0), 0); assert.equal(stickValue(4), 0); assert.equal(stickValue(-4), 0);
  assert.equal(stickValue(-40), 1, 'thumb 40 px left: full left');
  assert.equal(stickValue(40), -1, 'thumb 40 px right: full right');
  assert.equal(Math.round(stickValue(-22.5) * 100) / 100, 0.5, 'half way between the dead edge and travel');
  assert.equal(stickValue(-12, { travel: 20, dead: 2 }), 10 / 18, 'custom travel and dead zone');
});
test('stickValue clamps beyond travel', () => { assert.equal(stickValue(-200), 1); assert.equal(stickValue(200), -1); });
test('knobOffset moves the knob the way the thumb went', () => { assert.equal(knobOffset(1, 24), -24); assert.equal(knobOffset(-0.5, 24), 12); assert.equal(knobOffset(0, 24), 0); });
test('steerInput: the stick wins while held, the keys otherwise', () => {
  assert.equal(steerInput({ left: true }), 1); assert.equal(steerInput({ right: true }), -1); assert.equal(steerInput({ left: true, right: true }), 0);
  assert.equal(steerInput({ steer: 0.3, right: true }), 0.3, 'a held stick overrides the keys');
  assert.equal(steerInput({ steer: 2 }), 1, 'clamped'); assert.equal(steerInput({ steer: null, left: true }), 1); assert.equal(steerInput({ steer: false }), 0);
});
