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

// Plan 5 Task 2 (R5): a track ramp whose line meets one of the track's own water inlets within 30 m of its lip is a stunt
// ramp; a lake never counts, and the hub's river is not a track inlet
const rect = [[-60, -30], [60, -30], [60, 30], [-60, 30]];
const rampAt = { s: 30, side: 0, length: 8, height: 1.9, width: 5.4 };
function withWater(water) {
  const track = resolveTrack({ id: 'wet', half: 6, points: rect, gates: [{ s: 150 }], ramps: [rampAt], water });
  T.configureTerrain({ world: { cx: 0, cz: 0, radius: 200 }, roads: [{ kind: 'track', from: 'x', to: 'x', closed: true, half: 6, points: track.worldPoints }], jumps: [], waters: [], districts: {}, stops: [], track });
  return track;
}
test('a ramp whose line crosses a track inlet within 30 m of its lip is a stunt ramp, with the lip-to-far-bank distance', () => {
  try {
    withWater([{ s: 43.5, halfW: 5 }]); // the near bank 0.5 m past the lip (s 38), the far bank at s 48.5
    assert.equal(T.jumps.length, 1);
    const j = T.jumps[0];
    assert.equal(j.stunt, true, 'the inlet makes it a stunt ramp');
    assert.ok(j.bank > 10 && j.bank < 11.5, `lip to far bank ${j.bank} m (about 10.5)`);
    assert.ok(j.standSide === 1 || j.standSide === -1, 'a side for the stand camera, from the outside when the track has no stands');
  } finally { T.configureTerrain(hub); }
});
test('a ramp near only a lake, or near no water, is not a stunt ramp', () => {
  try {
    const t = withWater([]);
    const p = t.at(50);
    withWater([{ kind: 'lake', centre: [p.x, p.z], rx: 12, ry: 12, depth: 1.2 }]); // a lake over the track 12 m past the lip
    assert.equal(T.jumps.length, 1);
    const q = t.at(44); // off the lake's centre (lakeDistance is degenerate at a circle's centre)
    assert.equal(T.onWater(q.x, q.z), true, 'sanity: the lake is under the ramp line, 6 m past the lip');
    assert.ok(!T.jumps[0].stunt, 'a lake does not make a stunt ramp');
    withWater([]);
    assert.ok(!T.jumps[0].stunt, 'no water, no stunt');
  } finally { T.configureTerrain(hub); }
});
test('the Lagoon\'s ramp is a stunt ramp from its inlet channel; the hub keeps exactly its two river ramps', async () => {
  const { venueEntry } = await import('../ecosystem/js/entries.js');
  const { default: lagoon } = await import('../ecosystem/tracks/lagoon.js');
  assert.deepEqual(T.jumps.filter((j) => j.stunt).map((j) => [j.ox, j.oz]), [[-82.9, 18], [-117.7, 18]], 'the hub: the river pair only');
  assert.ok(T.jumps.filter((j) => !j.stunt).every((j) => !('bank' in j) && !('standSide' in j)), 'the hub\'s other ramps gain no fields');
  try {
    T.configureTerrain(venueEntry(lagoon, { slug: 'lagoon' }).terrain);
    const st = T.jumps.filter((j) => j.stunt);
    assert.equal(st.length, 1, 'the one ramp');
    assert.ok(st[0].bank > 19 && st[0].bank < 20.5, `lip to far bank ${st[0].bank} m (the inlet is 19 m wide, 0.5 m past the lip)`);
    assert.equal(st[0].standSide, 1, 'the jump stand is outside (off +16)');
  } finally { T.configureTerrain(hub); }
});
