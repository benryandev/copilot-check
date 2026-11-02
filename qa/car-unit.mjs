// The car's surface rule (no three.js): node --test qa/car-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { topShare, accelShare, slowShare, OFF_ROAD, WATER_SHARE, WATER_ACCEL, WATER_DRAG } from '../ecosystem/js/car-math.js';

test('topShare: grass only costs top speed at the raceway; dirt is always full speed', () => {
  assert.equal(OFF_ROAD, 0.8);
  assert.equal(topShare(true, 1), 1, 'dirt on the raceway');
  assert.equal(topShare(true, 0), 1, 'dirt in open country');
  assert.equal(topShare(false, 1), 0.8, 'grass at the raceway: the old penalty');
  assert.equal(topShare(false, 0), 1, 'grass in open country: full speed, the fast commute');
  assert.equal(Math.round(topShare(false, 0.5) * 100) / 100, 0.9, 'half way across the fade band');
});

test('in water the car wades: half top speed whatever the ground, slower pull', () => {
  assert.equal(WATER_SHARE, 0.5); assert.equal(WATER_ACCEL, 0.6);
  assert.equal(topShare(true, 1, true), 0.5, 'the ford is dirt, still half');
  assert.equal(topShare(false, 0, true), 0.5, 'open grass under water');
  assert.equal(Math.round(topShare(false, 1, true) * 100) / 100, 0.4, 'raceway grass under water stacks');
  assert.equal(topShare(true, 1), 1, 'dry dirt unchanged');
  assert.equal(accelShare(true), 0.6); assert.equal(accelShare(false), 1);
});

test('over the top speed the car eases down gently on land and is dragged down hard in water', () => {
  assert.equal(WATER_DRAG, 2);
  assert.equal(slowShare(false), 0.5, 'leaving the road or a boost ending: half the brake');
  assert.equal(slowShare(true), 2, 'water: twice the brake, so a flat-out entry is felt within a few metres');
});
