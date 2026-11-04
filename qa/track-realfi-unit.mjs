// qa/track-realfi-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { TRACK, RACE_TRACK, ROADS, TRACK_ROAD, JUMPS, raceLocal } from '../ecosystem/js/content.js';
test('the migrated Raceway reproduces its published numbers', () => {
  assert.equal(RACE_TRACK.id, 'realfi-v1');
  assert.deepEqual(RACE_TRACK.checkpoints, [211, 300, 420, 500, 550]);
  assert.ok(Math.abs(RACE_TRACK.length - 642.2) < 0.3, `lap ${RACE_TRACK.length}`);
  assert.equal(TRACK.gates.length, 6); assert.equal(TRACK.gates[0].s, 0); assert.equal(TRACK.gates[1].w, 7.5);
});
test('the track road and the raceway ramps come from the definition', () => {
  const road = ROADS[TRACK_ROAD];
  assert.equal(road.kind, 'track'); assert.equal(road.points.length, 24); assert.equal(road.half, 6);
  const ramps = JUMPS.filter((j) => j.road === TRACK_ROAD).map((j) => [j.s, j.side]);
  assert.deepEqual(ramps, [[70, -1], [262, 1], [445, 1]]);
});
test('raceLocal is the track frame', () => {
  const [x, z] = raceLocal(-62, -36), p = TRACK.worldPoints[0];
  assert.ok(Math.hypot(x - p[0], z - p[1]) < 1e-9);
});
