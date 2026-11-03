// Quality tiers and the auto rule: node --test qa/quality-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { TIERS, ORDER, startTier, nextTier, SLOW_MS, SLOW_SHARE, DROP_GAP_S } from '../ecosystem/js/quality-math.js';

test('phone keeps medium\'s resolution and grass without the glow pass and the shadow map; the order steps down to low', () => {
  assert.equal(TIERS.phone.ratio, TIERS.medium.ratio);
  assert.equal(TIERS.phone.grass, TIERS.medium.grass);
  assert.equal(TIERS.phone.bloom, false);
  assert.equal(TIERS.phone.shadow, 0);
  assert.ok(TIERS.phone.planters, 'the plaza benches and planters stay');
  assert.deepEqual(ORDER, ['high', 'medium', 'phone', 'low']);
  for (const name of ORDER) assert.ok(TIERS[name], name);
});

test('the start tier: the saved choice, else phone on a touch screen and high elsewhere; a saved name that is no tier is ignored', () => {
  assert.equal(startTier('auto', true), 'phone');
  assert.equal(startTier('auto', false), 'high');
  assert.equal(startTier('low', true), 'low');
  assert.equal(startTier('high', true), 'high');
  assert.equal(startTier('ultra', true), 'phone');
  assert.equal(startTier(null, false), 'high');
});

test('the drop rule: half the frames slow drops one step, not within four seconds of the last drop, never below low', () => {
  assert.equal(SLOW_MS, 28); assert.equal(SLOW_SHARE, 0.5); assert.equal(DROP_GAP_S, 4);
  assert.equal(nextTier(0.5, 'medium', 30, 0), 'phone');
  assert.equal(nextTier(0.6, 'high', 30, 0), 'medium');
  assert.equal(nextTier(0.35, 'phone', 30, 0), null, 'a third of frames doubled holds (a 44 fps phone stays crisp)');
  assert.equal(nextTier(0.49, 'medium', 30, 0), null, 'under half holds');
  assert.equal(nextTier(0.9, 'phone', 7, 4), null, 'too soon after the last drop');
  assert.equal(nextTier(0.9, 'phone', 9, 4), 'low');
  assert.equal(nextTier(1, 'low', 60, 0), null, 'nothing below low');
  assert.equal(nextTier(1, 'odd', 60, 0), null, 'an unknown tier holds');
});
