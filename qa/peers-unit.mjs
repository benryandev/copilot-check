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
