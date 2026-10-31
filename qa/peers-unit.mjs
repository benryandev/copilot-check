// Pure parts of the multiplayer client (no three.js, no DOM): node --test qa/peers-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { nextSendDelay, interp, pickDrawn, backoff, poseAt, SEND_MS, IDLE_MS, DELAY_MS } from '../ecosystem/js/peers-math.js';

test('nextSendDelay: 100 ms moving, 1000 ms still', () => {
  assert.equal(SEND_MS, 100); assert.equal(IDLE_MS, 1000); assert.equal(DELAY_MS, 150);
  assert.equal(nextSendDelay(0.3), 100); assert.equal(nextSendDelay(-2), 100); assert.equal(nextSendDelay(0), 1000); assert.equal(nextSendDelay(0.04), 1000);
});

test('interp: positions blend linearly and heading takes the short way round', () => {
  const m = interp({ x: 0, z: 0, h: 3.1 }, { x: 10, z: -4, h: -3.1 }, 0.5);
  assert.equal(m.x, 5); assert.equal(m.z, -2);
  assert.ok(Math.abs(m.h) > 3.1, `heading went the long way: ${m.h}`);
  assert.equal(interp({ x: 0, z: 0, h: 0 }, { x: 1, z: 1, h: 1 }, 0).h, 0);
  assert.equal(interp({ x: 0, z: 0, h: 0 }, { x: 1, z: 1, h: 1 }, 1).x, 1);
});

test('pickDrawn: the nearest `cap` to the camera, in a stable order', () => {
  const peers = [{ id: 'far', x: 300, z: 0 }, { id: 'near', x: 1, z: 1 }, { id: 'mid', x: 40, z: 0 }, { id: 'mid2', x: 0, z: 41 }];
  assert.deepEqual(pickDrawn(peers, { x: 0, z: 0 }, 2).map(p => p.id), ['near', 'mid']);
  assert.deepEqual(pickDrawn(peers, { x: 0, z: 0 }, 10).map(p => p.id), ['near', 'mid', 'mid2', 'far']);
  assert.deepEqual(pickDrawn([], { x: 0, z: 0 }, 3), []);
});

test('backoff: 1, 2, 4, …, capped at 30 s', () => {
  assert.deepEqual([0, 1, 2, 5, 9].map(backoff), [1000, 2000, 4000, 30000, 30000]);
});

test('poseAt: holds before the first sample, blends between two, holds after the last', () => {
  const s = [{ at: 1000, x: 0, z: 0, h: 0 }, { at: 1100, x: 10, z: 0, h: 1 }, { at: 1200, x: 10, z: 10, h: 1 }];
  assert.deepEqual(poseAt(s, 900), { x: 0, z: 0, h: 0 });
  assert.deepEqual(poseAt(s, 1050), { x: 5, z: 0, h: 0.5 });
  assert.deepEqual(poseAt(s, 1150), { x: 10, z: 5, h: 1 });
  assert.deepEqual(poseAt(s, 1500), { x: 10, z: 10, h: 1 });
  assert.equal(poseAt([], 0), null);
});

test('flyY: a car whose ground drops away at a ramp end flies on under gravity and lands', async () => {
  const { flyY, FLY_G } = await import('../ecosystem/js/peers-math.js');
  const st = { y: 0, vy: 0, air: false }, dt = 1 / 60;
  // Up a ramp: ground rises 2 m over 8 m at 20 m/s (0.4 s)
  let g = 0;
  for (let t = 0; t < 0.4; t += dt) { g = 2 * (t / 0.4); flyY(st, g, dt); }
  assert.ok(!st.air && st.vy > 4, `on the ramp: vy ${st.vy.toFixed(2)} air ${st.air}`);
  // Off the end: the ground is suddenly 2 m below. The car must not snap down.
  const y1 = flyY(st, 0, dt);
  assert.ok(st.air, 'should be airborne');
  assert.ok(y1 > 1.9, `snapped down to ${y1.toFixed(2)}`);
  // It rises first, then comes down and lands on the ground, staying there
  let peak = y1, landed = -1;
  for (let i = 0; i < 200; i++) { const y = flyY(st, 0, dt); peak = Math.max(peak, y); if (!st.air && landed < 0) landed = i; }
  assert.ok(peak > 2.2, `peak ${peak.toFixed(2)}`);
  assert.ok(landed > 10 && landed < 120, `landed at step ${landed}`);
  assert.equal(st.y, 0); assert.equal(st.air, false);
  assert.equal(FLY_G, 30);
});

test('flyY: driving down a slope or standing still keeps the car on the ground', async () => {
  const { flyY } = await import('../ecosystem/js/peers-math.js');
  const st = { y: 3, vy: 0, air: false }, dt = 1 / 60;
  for (let i = 0; i < 60; i++) { const g = 3 - i * 0.02; assert.equal(flyY(st, g, dt), g); assert.equal(st.air, false); }
  // A ground step down with no upward speed (a kerb): straight onto it
  assert.equal(flyY(st, 0, dt), 0);
  // dt 0 (a paused frame) just holds the ground
  assert.equal(flyY(st, 1, 0), 1);
});
