// Terrain sampling (node can import it): node --test qa/terrain-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { groundHeight, roadInfo } from '../ecosystem/js/terrain.js';

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
