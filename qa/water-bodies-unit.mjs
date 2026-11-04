// Water as a list of bodies: node --test qa/water-bodies-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import * as T from '../ecosystem/js/terrain.js';
import { resolveTrack } from '../ecosystem/js/track-math.js';
const hub = T.terrainConfig();
test('the hub has one body, the river, and riverInfo still answers', () => {
  assert.equal(T.waters.length, 1); assert.equal(T.onWater(-68, -114), true); assert.equal(T.waterInfo(-68, -114).body, 0);
});
test('a track inlet becomes a second body across the track; the nearer body wins and the gap between two is dry', () => {
  const trk = resolveTrack({ id: 'w-v1', half: 6, points: [[0, 0], [120, 0], [120, 60], [0, 60]], gates: [{ s: 60 }], water: [{ s: 60, halfW: 7.5 }] });
  const cfg = { ...hub, waters: [...hub.waters, { points: [[50, -30], [50, 30]], half: 3.5, depth: 0.45, level: -0.06, bridges: false }], track: trk };
  T.configureTerrain(cfg);
  assert.equal(T.waters.length, 3, 'river, the extra body, the inlet');
  const p = trk.at(60);
  assert.equal(T.onWater(p.x, p.z), true, 'the inlet is water on the track');
  assert.equal(T.onWater(p.x + p.fx * 9, p.z + p.fz * 9), false, 'past the far bank is dry');
  assert.equal(T.waterInfo(50, 0).body, 1); assert.equal(T.waterInfo(p.x, p.z).body, 2);
  assert.equal(T.onWater(85, 0), false, 'between two bodies is dry');
  T.configureTerrain(hub);
});
