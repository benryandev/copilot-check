// qa/track-ramp-unit.mjs: a track's ramps sit at the track's own arc length, not the road's parameter from points[0]
import test from 'node:test'; import assert from 'node:assert/strict';
import * as T from '../ecosystem/js/terrain.js';
import { resolveTrack } from '../ecosystem/js/track-math.js';
const hub = T.terrainConfig();
test('a ramp on a track whose start is away from points[0] has its footprint at track.at(s)', () => {
  const points = [[-60, -30], [60, -30], [60, 30], [-60, 30]];
  const ramp = { s: 100, side: 1, length: 8, height: 1.5, width: 5.4 };
  const track = resolveTrack({ id: 'ramp', half: 6, points, start: [60, 30], gates: [{ s: 150 }], ramps: [ramp] });
  T.configureTerrain({ world: { cx: 0, cz: 0, radius: 200 }, roads: [{ kind: 'track', from: 'x', to: 'x', closed: true, half: 6, points }], jumps: [], waters: [], districts: {}, stops: [], track });
  try {
    assert.equal(T.jumps.length, 1, 'the ramp is configured from the track');
    const m = track.at(ramp.s + ramp.length / 2), off = ramp.side * (6 - ramp.width / 2 - 0.2);
    assert.ok(T.jumpAt(m.x + m.rx * off, m.z + m.rz * off), 'the ramp is where the track says');
    const w = T.roads[0].curve.getPointAt((ramp.s + ramp.length / 2) / T.roads[0].len);
    assert.ok(Math.hypot(w.x - m.x, w.z - m.z) > 20, 'sanity: the road parameter is somewhere else');
    assert.equal(T.jumpAt(w.x, w.z), null, 'nothing at the road-parameter position');
  } finally { T.configureTerrain(hub); }
});
