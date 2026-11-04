// qa/raceway-walls-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { wallSpots, wallBoxes } from '../ecosystem/js/walls-math.js';
import { resolveTrack } from '../ecosystem/js/track-math.js';
import { TRACK } from '../ecosystem/js/content.js';
test('auto walls on the Raceway are where they were (143 spots, the first run at s 184-194 on the outside)', () => {
  const spots = wallSpots(TRACK);
  assert.equal(spots.length, 143);
  assert.equal(spots[0].s, 184); assert.equal(spots[10].s, 194); assert.equal(spots[11].s, 205);
});
test('listed walls run both sides between from and to at half + 1.2', () => {
  const t = resolveTrack({ id: 'l', half: 6, points: [[0, 0], [100, 0], [100, 60], [0, 60]], gates: [{ s: 50 }], walls: [{ from: 20, to: 40 }] });
  const spots = wallSpots(t);
  assert.equal(spots.length, 42);
  const p = t.at(30), left = spots.find((w) => w.s === 30 && w.side === -1);
  assert.ok(Math.abs(Math.hypot(left.x - p.x, left.z - p.z) - 7.2) < 0.01);
});
test('wallBoxes groups four tyres per piece and falls back to one box per tyre', () => {
  const boxes = wallBoxes(wallSpots(TRACK));
  assert.ok(boxes.length > 0 && boxes.length < 143);
  for (const b of boxes) for (const k of ['cx', 'cz', 'hx', 'hz', 'yaw']) assert.ok(Number.isFinite(b[k]));
  const far = wallBoxes([{ s: 0, x: 0, z: 0 }, { s: 20, x: 20, z: 0 }]);
  assert.equal(far.length, 2); assert.equal(far[0].hx, 0.5);
});
