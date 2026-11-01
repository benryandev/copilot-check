// The river in the height field (node can import terrain.js): node --test qa/river-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { groundHeight, grassWeight, river, riverInfo, crossings, bridgeHeight, onWater, onBridge, WATER_LEVEL, DECK_Y, roads } from '../ecosystem/js/terrain.js';
import { RIVER } from '../ecosystem/js/content.js';

// A point s metres down the river, with its unit tangent and left normal
function at(s) {
  const i = Math.max(1, river.cum.findIndex((c) => c >= s));
  const [x, z] = river.pts[i], [px, pz] = river.pts[i - 1];
  const l = Math.hypot(x - px, z - pz), tx = (x - px) / l, tz = (z - pz) / l;
  return { x, z, tx, tz, nx: -tz, nz: tx };
}
// Worst rise per 0.1 m along a straight line
function worstStep(x0, z0, dx, dz, len) {
  let prev = groundHeight(x0, z0), worst = 0;
  for (let d = 0.1; d <= len; d += 0.1) { const g = groundHeight(x0 + dx * d, z0 + dz * d); worst = Math.max(worst, g - prev); prev = g; }
  return worst;
}

test('the river is carved: bed at the centre, banks back at ground level, grass off the water', () => {
  const p = at(120);
  assert.ok(riverInfo(p.x, p.z).d < 0.5, 'riverInfo finds its own centreline');
  const bed = groundHeight(p.x, p.z);
  assert.ok(Math.abs(bed + RIVER.depth) < 0.03, `bed ${bed.toFixed(2)} should be about ${-RIVER.depth}`);
  assert.ok(bed < WATER_LEVEL, 'the bed is under the water');
  for (const side of [-1, 1]) {
    const g = groundHeight(p.x + p.nx * side * RIVER.half, p.z + p.nz * side * RIVER.half);
    assert.ok(g >= -0.02, `bank ${side} at ${g.toFixed(2)} should be back at ground level`);
  }
  assert.equal(grassWeight(p.x, p.z), 0, 'no grass in the channel');
  assert.ok(grassWeight(p.x + p.nx * 6, p.z + p.nz * 6) > 0.5, 'grass 6 m out');
});

test('five crossings: bridges on both ring roads and the Chains and Community spokes, a ford on the Token spoke', () => {
  assert.equal(crossings.length, 5);
  const by = (k) => crossings.filter((c) => roads[c.road].kind === k);
  assert.equal(by('ring').length, 2); assert.equal(by('spoke').length, 3);
  assert.deepEqual(by('spoke').map((c) => roads[c.road].to).sort(), ['chains', 'community', 'token']);
  for (const c of crossings) {
    assert.equal(c.bridge, roads[c.road].to !== 'token', `${roads[c.road].to}: bridge flag`);
    assert.ok(c.angle >= 55, `${roads[c.road].to} crosses at ${c.angle}°`);
  }
});

test('a bridge deck carries the road over the channel: 0.18 m on the deck, nothing under 0 along a bridged road', () => {
  assert.equal(DECK_Y, 0.18);
  for (const c of crossings.filter((c) => c.bridge)) {
    assert.ok(Math.abs(groundHeight(c.x, c.z) - DECK_Y) < 1e-6, `deck height at ${roads[c.road].to}`);
    assert.ok(onBridge(c.x, c.z) && !onWater(c.x, c.z), `on the ${roads[c.road].to} deck: bridge, not water`);
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); // local +z along the road
    let min = Infinity, worst = 0, prev = groundHeight(c.x - fx * 12, c.z - fz * 12);
    for (let d = -12; d <= 12; d += 0.1) { const g = groundHeight(c.x + fx * d, c.z + fz * d); min = Math.min(min, g); worst = Math.max(worst, Math.abs(g - prev)); prev = g; }
    assert.ok(min >= 0, `${roads[c.road].to}: road dips to ${min.toFixed(2)} through the bridge`);
    assert.ok(worst < 0.03, `${roads[c.road].to}: ${worst.toFixed(3)} m step per 0.1 m on the approach`);
  }
});

test('the ford dips: the Token spoke reaches the bed and onWater is true there, false on every deck', () => {
  const ford = crossings.find((c) => roads[c.road].to === 'token');
  assert.ok(ford && !ford.bridge);
  assert.ok(groundHeight(ford.x, ford.z) < -0.3, 'the road goes under the water at the ford');
  assert.ok(onWater(ford.x, ford.z) && !onBridge(ford.x, ford.z));
  assert.equal(bridgeHeight(ford.x, ford.z), -Infinity);
  assert.ok(!onWater(0, 0) && !onBridge(0, 0), 'HQ is dry');
});

test('the car never meets a wall at the river: rise per 0.1 m across a bank and up a deck ramp under 0.09', () => {
  const p = at(300);
  assert.ok(worstStep(p.x + p.nx * 6, p.z + p.nz * 6, -p.nx, -p.nz, 12) < 0.09, 'across the channel');
  for (const c of crossings.filter((c) => c.bridge)) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    assert.ok(worstStep(c.x - fx * 14, c.z - fz * 14, fx, fz, 28) < 0.09, `up the ${roads[c.road].to} ramp`);
  }
});

test('the rim has a notch where the river leaves', () => {
  const [mx, mz] = RIVER.points[RIVER.points.length - 1];
  assert.ok(groundHeight(mx, mz) < 0.5, `mouth at ${groundHeight(mx, mz).toFixed(2)}`);
});
