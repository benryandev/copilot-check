// Terrain sampling (node can import it): node --test qa/terrain-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { groundHeight, roadInfo, racewayWeight, inRaceway, trackAt } from '../ecosystem/js/terrain.js';

test('ground is continuous where a wide road\'s blend meets a narrow one\'s (Ben\'s invisible wall at 241, 95)', () => {
  const x0 = 240.95, z0 = 94.82, h = -5.416, fx = -Math.sin(h), fz = -Math.cos(h);
  let prev = groundHeight(x0 - fx, z0 - fz), worst = 0;
  for (let d = -0.9; d <= 3; d += 0.1) { const g = groundHeight(x0 + fx * d, z0 + fz * d); worst = Math.max(worst, Math.abs(g - prev)); prev = g; }
  assert.ok(worst < 0.08, `a ${worst.toFixed(2)} m step within 0.1 m: the car's climb rule stops like a wall`);
});

test('roadInfo picks the road whose edge is nearest, so a wide road wins over a narrow one at equal centreline distance', () => {
  const a = roadInfo(240.95, 94.82), b = roadInfo(240.8, 94.7);
  assert.equal(a.road, b.road, `nearest road flips between ${a.road} and ${b.road} across 20 cm`);
});

test('racewayWeight: 1 on the track and in its infield, fading to 0 across a band outside, so grass is only slow at the raceway', () => {
  const on = trackAt(100);
  assert.equal(racewayWeight(on.x, on.z), 1, 'on the track');
  // step out across the track's normal on the side that leaves the raceway
  const sign = inRaceway(on.x + on.rx * 60, on.z + on.rz * 60) ? -1 : 1;
  const at = (m) => racewayWeight(on.x + on.rx * m * sign, on.z + on.rz * m * sign);
  assert.equal(at(-20), 1, 'infield grass counts as raceway');
  assert.equal(at(25), 1, 'just outside the track, inside the 30 m raceway margin');
  const mid = at(35);
  assert.ok(mid > 0 && mid < 1, `35 m out should be mid-fade, got ${mid}`);
  assert.equal(at(50), 0, '50 m out is open country');
  assert.equal(racewayWeight(0, 0), 0, 'far away');
});

// ── Chart Ridge ──
import { roads, RIDGE_ROAD, RIDGE_FADE, setRidgeSeries, onRidge, terrainHeight } from '../ecosystem/js/terrain.js';
import { RIDGE } from '../ecosystem/js/ridge-math.js';
const ridge = roads[RIDGE_ROAD];
const LIN = Array.from({ length: 24 }, (_, i) => 78000 + (i * 2000) / 23);
const at = (s, side = 0) => { const u = s / ridge.len, p = ridge.curve.getPointAt(u), t = ridge.curve.getTangentAt(u); return { x: p.x - t.z * side, z: p.z + t.x * side }; };
test('the ridge road exists, leaves Analytics southward and is about 240 m', () => {
  assert.equal(ridge.kind, 'ridge'); assert.equal(ridge.from, 'analytics'); assert.equal(ridge.to, 'developers');
  assert.ok(ridge.len > 225 && ridge.len < 255, `len ${ridge.len}`);
  assert.ok(ridge.curve.getTangentAt(0).z > 0.9, 'heads south out of the plaza');
});
test('flat by default: the ridge adds nothing until a series is set', () => {
  setRidgeSeries(null);
  const p = at(ridge.len / 2);
  assert.ok(Math.abs(groundHeight(p.x, p.z) - terrainHeight(p.x, p.z, roadInfo(p.x, p.z), false)) < 1e-9);
});
test('a series lifts the road by its profile and nothing 30 m to the side', () => {
  setRidgeSeries(LIN); // a steady climb, scale 1: candle 23 sits 8 m up
  const s = RIDGE.run + 23.5 * ((ridge.len - 2 * RIDGE.run) / 24);
  const p = at(s), q = at(s, 30);
  assert.ok(Math.abs(groundHeight(p.x, p.z) - (terrainHeight(p.x, p.z, roadInfo(p.x, p.z), false) + 8)) < 0.05, 'on the crest');
  assert.ok(Math.abs(groundHeight(q.x, q.z) - terrainHeight(q.x, q.z, roadInfo(q.x, q.z), false)) < 1e-6, 'beside it');
  setRidgeSeries(null);
});
test('onRidge: on the road, within the fade, not beyond it, not at the plaza', () => {
  assert.equal(onRidge(at(100).x, at(100).z), true);
  assert.equal(onRidge(at(100, ridge.half + RIDGE_FADE - 1).x, at(100, ridge.half + RIDGE_FADE - 1).z), true);
  assert.equal(onRidge(at(100, ridge.half + RIDGE_FADE + 6).x, at(100, ridge.half + RIDGE_FADE + 6).z), false);
  assert.equal(onRidge(-65, 178), false);
});
test('the lateral fade of an 8 m lift stays under the climb limit', () => {
  setRidgeSeries(LIN);
  const s = RIDGE.run + 23.5 * ((ridge.len - 2 * RIDGE.run) / 24);
  let worst = 0;
  for (let d = 0; d < 30; d += 0.25) { const a = at(s, d), b = at(s, d + 0.25); worst = Math.max(worst, Math.abs(groundHeight(b.x, b.z) - groundHeight(a.x, a.z)) / 0.25); }
  assert.ok(worst < 0.8, `lateral slope ${worst}`);
  setRidgeSeries(null);
});

import { groundVertexHeight } from '../ecosystem/js/terrain.js';
test('the coarse ground is built without the ridge lift and 30 cm low under the corridor, unchanged elsewhere', () => {
  setRidgeSeries(LIN);
  const s = RIDGE.run + 23.5 * ((ridge.len - 2 * RIDGE.run) / 24), p = at(s), q = at(s, 40);
  assert.ok(Math.abs(groundVertexHeight(p.x, p.z) - (terrainHeight(p.x, p.z, roadInfo(p.x, p.z), false) - 0.3)) < 1e-9);
  assert.ok(Math.abs(groundVertexHeight(q.x, q.z) - terrainHeight(q.x, q.z)) < 1e-9);
  setRidgeSeries(null);
});
test('the coarse ground is lowered only along the ridge road itself, not in the crescents past its ends', () => {
  setRidgeSeries(LIN);
  const t0 = ridge.curve.getTangentAt(0), p0 = ridge.curve.getPointAt(0);
  const before = { x: p0.x - t0.x * 3, z: p0.z - t0.z * 3 }; // 3 m before the road starts, towards the plaza
  assert.ok(Math.abs(groundVertexHeight(before.x, before.z) - terrainHeight(before.x, before.z)) < 1e-9, 'before the start');
  const t1 = ridge.curve.getTangentAt(1), p1 = ridge.curve.getPointAt(1);
  const after = { x: p1.x + t1.x * 3, z: p1.z + t1.z * 3 };
  assert.ok(Math.abs(groundVertexHeight(after.x, after.z) - terrainHeight(after.x, after.z)) < 1e-9, 'past the end');
  setRidgeSeries(null);
});
