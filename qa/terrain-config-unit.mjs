// qa/terrain-config-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as T from '../ecosystem/js/terrain.js';
import { resolveTrack } from '../ecosystem/js/track-math.js';
const hub = T.terrainConfig();
const tiny = () => ({
  world: { cx: 0, cz: 0, radius: 120 }, roads: [{ kind: 'track', from: 'x', to: 'x', closed: true, half: 6, points: [[-40, -20], [40, -20], [40, 20], [-40, 20]] }],
  jumps: [], waters: [], districts: {}, stops: [], track: resolveTrack({ id: 'tiny-v1', half: 6, points: [[-40, -20], [40, -20], [40, 20], [-40, 20]], gates: [{ s: 60 }, { s: 120 }] }),
});
test('the hub is configured at load: the Raceway gates and the river are there', () => {
  assert.equal(T.raceGates.length, 6); assert.ok(T.trackLen > 642 && T.trackLen < 643); assert.equal(T.WORLD.radius, 395);
});
test('reconfigure rebuilds the grid and clears caches, in place, and the hub comes back exactly', () => {
  const roadsRef = T.roads, gatesRef = T.raceGates, worldRef = T.WORLD;
  const on = T.trackAt(100); assert.equal(T.onDirt(on.x, on.z), true);
  T.configureTerrain(tiny());
  assert.equal(T.roads, roadsRef); assert.equal(T.raceGates, gatesRef); assert.equal(T.WORLD, worldRef, 'same objects, new contents');
  assert.equal(T.roads.length, 1); assert.equal(T.raceGates.length, 3); assert.equal(T.WORLD.radius, 120);
  assert.equal(T.onDirt(on.x, on.z), false, 'the old Raceway is gone from roadInfo (grid rebuilt)');
  assert.equal(T.onDirt(-40, -20), true, 'the tiny track is a road'); // a control point: the curve bows out to z -28 between corners
  assert.equal(T.onWater(-68, -114), false, 'no river in the tiny world');
  T.configureTerrain(hub);
  assert.equal(T.raceGates.length, 6); assert.equal(T.onDirt(on.x, on.z), true); assert.equal(T.onWater(-68, -114), true);
});
test('no module aliases a per-world terrain binding at module scope', () => {
  // `const x = trackLen` at top level would go stale on reconfigure; reading through the import keeps it live
  const names = ['trackLen', 'TRACK_HALF', 'GATE_HALF', 'trackPts', 'trackCum'];
  for (const f of readdirSync('ecosystem/js').filter((n) => n.endsWith('.js') && n !== 'terrain.js')) {
    const src = readFileSync(`ecosystem/js/${f}`, 'utf8');
    for (const n of names) assert.ok(!new RegExp(`^(const|let) [^=\\n]*=\\s*${n}\\b`, 'm').test(src), `${f} aliases ${n} at module scope`);
  }
});
test('a per-gate half override reaches raceGates', () => {
  const cfg = tiny();
  cfg.track = resolveTrack({ id: 'gate-half', half: 6, points: cfg.roads[0].points, gates: [{ s: 120, half: 6.5 }, { s: 200 }] });
  T.configureTerrain(cfg);
  try {
    assert.equal(T.raceGates[1].w, 6.5); assert.equal(T.raceGates[2].w, 7.5);
    assert.deepEqual(T.raceGates.map((g) => g.s), [0, ...cfg.track.checkpoints]);
  } finally { T.configureTerrain(hub); }
});

const tinyTarmac = () => {
  const points = [[-100, -30], [100, -30], [100, 30], [-100, 30]];
  return {
    world: { cx: 0, cz: 0, radius: 200 }, roads: [{ kind: 'track', from: 'x', to: 'x', closed: true, half: 6, points }],
    jumps: [], waters: [], districts: {}, stops: [],
    track: resolveTrack({ id: 'tiny-tarmac', half: 6, points, gates: [{ s: 150 }, { s: 300 }], surface: [{ from: 0, to: 100, kind: 'tarmac' }] }),
  };
};
test('onTarmac reads the track surface list; the hub has none', () => {
  T.configureTerrain(tinyTarmac());
  try {
    const on = T.trackAt(50), off = T.trackAt(150);
    assert.equal(T.onTarmac(on.x, on.z), true); assert.equal(T.onDirt(on.x, on.z), true, 'tarmac is road');
    assert.equal(T.onTarmac(off.x, off.z), false);
    assert.equal(T.onTarmac(on.x + on.rx * 9, on.z + on.rz * 9), false, 'beside the ribbon is grass');
    assert.deepEqual(T.surfaceStretches(), [{ from: 0, to: 100, kind: 'tarmac' }]);
  } finally { T.configureTerrain(hub); }
  assert.deepEqual(T.surfaceStretches(), []);
  for (let s = 0; s < T.trackLen; s += 10) { const p = T.trackAt(s); assert.equal(T.onTarmac(p.x, p.z), false); }
});
test('a wrapped stretch comes out as two road stretches', () => {
  const cfg = tinyTarmac(); cfg.track = resolveTrack({ ...cfg.track, surface: [{ from: cfg.track.len - 20, to: 20, kind: 'tarmac' }] });
  T.configureTerrain(cfg);
  try {
    const st = T.surfaceStretches();
    assert.equal(st.length, 2); assert.equal(st[0].from, 0); assert.equal(st[0].to, 20); assert.ok(Math.abs(st[1].to - cfg.track.len) < 1e-6);
  } finally { T.configureTerrain(hub); }
});
