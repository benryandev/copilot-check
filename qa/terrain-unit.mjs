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
