// The Strike blimp (no three.js): node --test qa/blimp-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { BLIMP, blimpPose, blimpText } from '../ecosystem/js/blimp-math.js';

test('the blimp cruises a slow loop round HQ among the low clouds, shared by everyone because it runs on the clock', () => {
  assert.equal(BLIMP.radius, 140); assert.equal(BLIMP.height, 24, "under the cloud base"); assert.equal(BLIMP.period, 220);
  const a = blimpPose(0), b = blimpPose(BLIMP.period * 1000 / 4);
  assert.ok(Math.abs(Math.hypot(a.x, a.z) - BLIMP.radius) < 1e-6 && a.y === BLIMP.height, 'on the loop at the right height');
  assert.ok(Math.abs(Math.hypot(b.x, b.z) - BLIMP.radius) < 1e-6, 'still on the loop a quarter lap later');
  const quarter = Math.atan2(b.x, -b.z) - Math.atan2(a.x, -a.z);
  assert.ok(Math.abs(((quarter + Math.PI) % (2 * Math.PI)) - Math.PI - Math.PI / 2) < 1e-6 || Math.abs(Math.abs(quarter) - Math.PI / 2) < 1e-6, 'a quarter of the circle in a quarter period');
  // heading points along the loop: moving it a little forward in time moves it along its own heading
  const c = blimpPose(10), fx = -Math.sin(a.heading), fz = -Math.cos(a.heading);
  assert.ok((c.x - a.x) * fx + (c.z - a.z) * fz > 0, 'nose first');
  assert.equal(blimpPose(1234, 1.5).angle, 1.5, 'a fixed angle (for a shot) overrides the clock');
});

test('the banner reads the 24 h volume the boards show, and says so when the figure is not in yet', () => {
  assert.equal(blimpText({ volume24h: '$12.4M' }), '24H VOLUME  $12.4M');
  assert.equal(blimpText(null), '24H VOLUME  LOADING');
  assert.equal(blimpText({}), '24H VOLUME  LOADING');
});
