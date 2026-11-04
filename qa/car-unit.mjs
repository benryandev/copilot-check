// The car's surface rule (no three.js): node --test qa/car-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { topShare, accelShare, easeRate, EASE_NET, SURFACES, GRAZE, resolvePhysics, DEFAULT_PHYSICS, turnRate, hitSpeedShare, slideShare, grazeNudge, blocksClimb, MAX_CLIMB, CLIMB_PROBE, OFF_ROAD, WATER_SHARE, WATER_ACCEL, WATER_DRAG } from '../ecosystem/js/car-math.js';

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
  assert.equal(easeRate(16, false), 17, 'leaving the road or a boost ending: today\'s half brake');
  assert.equal(easeRate(16, true), 68, 'water: twice the brake, so a flat-out entry is felt within a few metres');
});

test('blocksClimb: judged over a half-metre probe, a wall is a wall at any speed and a bump never is', () => {
  assert.equal(MAX_CLIMB, 0.9); assert.equal(CLIMB_PROBE, 0.5);
  assert.equal(blocksClimb(0.95, 0.5), true, 'a wall face: 1.9 per metre over the probe');
  assert.equal(blocksClimb(0.5, 0.5), true, 'a 1:1 face');
  assert.equal(blocksClimb(0.3, 0.5), false, 'a 0.6 slope is drivable');
  assert.equal(blocksClimb(0.2, 0.5), false, 'a 20 cm rise is a bump, whatever its slope');
  assert.equal(blocksClimb(-0.5, 0.5), false, 'downhill');
  assert.equal(blocksClimb(0.5, 0), false, 'no step, no rule');
  assert.equal(blocksClimb(1.0, 0.8), true, 'a fast frame probes its own longer step');
});

test('surfaces: dirt keeps every number the Raceway runs on; tarmac is the spec starting point', () => {
  assert.deepEqual(SURFACES.dirt, { top: 24, pull: 16, turn: 2.2 });
  assert.equal(SURFACES.tarmac.top, 30); assert.equal(SURFACES.tarmac.pull, 20);
  assert.deepEqual(GRAZE, { min: 0.8, headOn: 0.35, nudge: 0.2 });
});
test('resolvePhysics: a partial override keeps every other default; {} is the defaults', () => {
  const P = resolvePhysics({ tarmac: { top: 28 } });
  assert.equal(P.tarmac.top, 28); assert.equal(P.tarmac.pull, 20); assert.equal(P.dirt.top, 24); assert.equal(P.graze.min, 0.8); assert.equal(P.resolved, true);
  assert.deepEqual(resolvePhysics({}), DEFAULT_PHYSICS); assert.notEqual(resolvePhysics({}), DEFAULT_PHYSICS, 'a fresh object');
  assert.equal(SURFACES.tarmac.top, 30, 'the defaults were not mutated');
});
test('turnRate: dirt 2.2 at any speed; tarmac falls from 2.2 at 20 m/s to 1.0 at 30 and holds', () => {
  for (const v of [0, 8, 24, 36]) assert.equal(turnRate('dirt', v), 2.2);
  assert.equal(turnRate('tarmac', 10), 2.2); assert.equal(turnRate('tarmac', 20), 2.2);
  assert.ok(Math.abs(turnRate('tarmac', 25) - 1.6) < 1e-9); assert.ok(Math.abs(turnRate('tarmac', 30) - 1.0) < 1e-9); assert.ok(Math.abs(turnRate('tarmac', 36) - 1.0) < 1e-9);
  assert.equal(turnRate('tarmac', 30, resolvePhysics({ tarmac: { turnHigh: 1.4 } })), 1.4);
});
test('easeRate: the net bleed above top is 1 m/s² on any surface with the throttle held; water drags at 68', () => {
  assert.equal(EASE_NET, 1);
  assert.equal(easeRate(16, false), 17, 'dirt: today\'s BRAKE × 0.5 exactly');
  assert.equal(easeRate(20, false), 21, 'tarmac: pull + 1, so the throttle never creeps past top');
  assert.equal(easeRate(16, true), 68); assert.equal(easeRate(20, true), 68);
});
test('the graze shares: 0.8 at a graze, 0.35 head-on, no more than 25% lost at 15°', () => {
  assert.equal(hitSpeedShare(0), 0.8); assert.equal(hitSpeedShare(1), 0.35);
  const k15 = Math.sin(15 * Math.PI / 180);
  assert.ok(hitSpeedShare(k15) >= 0.75, `15°: ${hitSpeedShare(k15)}`);
  assert.equal(slideShare(1), 0.35); assert.ok(slideShare(Math.sin(10 * Math.PI / 180)) > 0.98);
  assert.equal(grazeNudge(0), 0.2); assert.equal(grazeNudge(1), 0);
});
