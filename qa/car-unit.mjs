// The car's surface rule (no three.js): node --test qa/car-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { topShare, OFF_ROAD } from '../ecosystem/js/car-math.js';

test('topShare: grass only costs top speed at the raceway; dirt is always full speed', () => {
  assert.equal(OFF_ROAD, 0.8);
  assert.equal(topShare(true, 1), 1, 'dirt on the raceway');
  assert.equal(topShare(true, 0), 1, 'dirt in open country');
  assert.equal(topShare(false, 1), 0.8, 'grass at the raceway: the old penalty');
  assert.equal(topShare(false, 0), 1, 'grass in open country: full speed, the fast commute');
  assert.equal(Math.round(topShare(false, 0.5) * 100) / 100, 0.9, 'half way across the fade band');
});
