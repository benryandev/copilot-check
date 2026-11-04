// qa/track-lift-unit.mjs: the crest follows the track's own arc length, not the road's parameter from points[0]
import test from 'node:test'; import assert from 'node:assert/strict';
import * as T from '../ecosystem/js/terrain.js';
import { resolveTrack } from '../ecosystem/js/track-math.js';
const hub = T.terrainConfig();
test('a lift on a track whose start is away from points[0] lifts the ground at track.at(mid)', () => {
  const points = [[-60, -30], [60, -30], [60, 30], [-60, 30]];
  const track = resolveTrack({ id: 'lift', half: 6, points, start: [60, 30], gates: [{ s: 100 }], lifts: [{ from: 40, to: 80, height: 3 }] });
  T.configureTerrain({ world: { cx: 0, cz: 0, radius: 200 }, roads: [{ kind: 'track', from: 'x', to: 'x', closed: true, half: 6, points }], jumps: [], waters: [], districts: {}, stops: [], track });
  try {
    const m = track.at(60);
    assert.ok(T.terrainHeight(m.x, m.z) > 2.5, 'the crest is where the track says');
    const naive = T.trackAt(0); // sanity: same road parameter measured from points[0] is s = 60 on a track rooted at points[0]
    const wrong = T.roads[0].curve.getPointAt(60 / T.roads[0].len);
    assert.ok(T.terrainHeight(wrong.x, wrong.z) < 0.5 + 1.5, 'the road-parameter position is not lifted');
    assert.ok(naive);
  } finally { T.configureTerrain(hub); }
});
