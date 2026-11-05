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

// ── The Lagoon's lake and its inlet channel (plan 5 Task 1a) ──
import { venueEntry } from '../ecosystem/js/entries.js';
import { loadStepCar } from '../tools/lapsim/car-node.mjs';
import { resolvePhysics, topShare } from '../ecosystem/js/car-math.js';
import lagoon from '../ecosystem/tracks/lagoon.js';
const entry = venueEntry(lagoon, { slug: 'lagoon' }), trk = entry.track;
const LAKE = lagoon.water.find((w) => w.kind === 'lake'), INLET = lagoon.water[0];
// The lake in world coordinates, from the definition alone: centre, unit long axis a, unit short axis b
const C = trk.toWorld(...LAKE.centre), A1 = trk.toWorld(LAKE.centre[0] + 1, LAKE.centre[1]);
const ax = A1[0] - C[0], az = A1[1] - C[1], bx = -az, bz = ax;
const local = (lx, ly) => [C[0] + ax * lx + bx * ly, C[1] + az * lx + bz * ly];
/** The shore at parameter t: the point and its outward unit normal */
function shore(t) {
  const [x, z] = local(LAKE.rx * Math.cos(t), LAKE.ry * Math.sin(t));
  const nlx = Math.cos(t) / LAKE.rx, nly = Math.sin(t) / LAKE.ry, l = Math.hypot(nlx, nly);
  return { x, z, nx: (ax * nlx + bx * nly) / l, nz: (az * nlx + bz * nly) / l };
}
const SHORE = Array.from({ length: 20000 }, (_, i) => shore((i / 20000) * Math.PI * 2));
/** Brute-force signed distance to the shore: negative inside */
function sdf(x, z) {
  const dx = x - C[0], dz = z - C[1], lx = dx * ax + dz * az, ly = dx * bx + dz * bz;
  const d = Math.min(...SHORE.map((p) => Math.hypot(p.x - x, p.z - z)));
  return (lx / LAKE.rx) ** 2 + (ly / LAKE.ry) ** 2 < 1 ? -d : d;
}
const segDist = (pts, x, z) => {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [px, pz] = pts[i], [qx, qz] = pts[i + 1], vx = qx - px, vz = qz - pz, l2 = vx * vx + vz * vz || 1;
    const u = Math.max(0, Math.min(1, ((x - px) * vx + (z - pz) * vz) / l2));
    best = Math.min(best, Math.hypot(x - px - vx * u, z - pz - vz * u));
  }
  return best;
};
const withLagoon = (fn, terrain = entry.terrain) => { T.configureTerrain(terrain); try { return fn(); } finally { T.configureTerrain(hub); } };
const channelPts = () => T.waters[0].pts;
// Is the point within `pad` m of the channel's bank (the mouth, where the two bodies meet)?
const nearChannel = (x, z, pad) => segDist(channelPts(), x, z) < INLET.halfW + pad;

test('the Lagoon\'s lake: a body of kind lake after the inlet, never waters[0]; the hub has none', () => withLagoon(() => {
  assert.equal(LAKE.depth, 1.2); assert.ok(LAKE.rx * 2 > 170 && LAKE.rx * 2 < 210 && LAKE.ry * 2 > 45 && LAKE.ry * 2 < 60, 'about 190 by 52');
  assert.equal(T.waters.length, 2); assert.notEqual(T.waters[0].kind, 'lake'); assert.equal(T.waters[1].kind, 'lake');
  assert.notEqual(T.river.kind, 'lake'); assert.equal(T.WATER_LEVEL, T.waters[0].level);
  T.configureTerrain(hub); assert.ok(T.waters.every((w) => w.kind !== 'lake'), 'the hub has no lake');
}));

test('the lake is water inside and dry 1 m outside; its bed under the water level, never below −depth; the bank at grass level', () => withLagoon(() => {
  let inside = 0;
  for (let lx = -LAKE.rx; lx <= LAKE.rx; lx += 2.5) for (let ly = -LAKE.ry; ly <= LAKE.ry; ly += 1.5) {
    const [x, z] = local(lx, ly), d = sdf(x, z);
    if (d > -0.35 || nearChannel(x, z, 2)) continue;
    inside++;
    assert.equal(T.onWater(x, z), true, `water at ${x.toFixed(1)}, ${z.toFixed(1)} (${d.toFixed(2)} m from the shore)`);
    const g = T.groundHeight(x, z);
    assert.ok(g < T.WATER_LEVEL, `bed ${g} under the water level at ${d.toFixed(2)} m`); assert.ok(g >= -LAKE.depth - 1e-9, `bed ${g} not below −depth`);
  }
  assert.ok(inside > 1500, `${inside} points inside`);
  for (const p of SHORE.filter((_, i) => i % 25 === 0)) {
    const x = p.x + p.nx, z = p.z + p.nz;
    if (nearChannel(x, z, 3)) continue;
    assert.equal(T.onWater(x, z), false, `dry 1 m outside at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    const g = T.groundHeight(x, z); assert.ok(g >= 0 && g < 0.01, `grass level 1 m outside, ${g}`);
    const w = p.x - p.nx * 0.35, v = p.z - p.nz * 0.35; // just inside onWater's 0.3 m edge
    assert.equal(T.onWater(w, v), true, '0.35 m inside is water'); assert.ok(T.groundHeight(w, v) < T.WATER_LEVEL, '0.35 m inside is under the water level');
  }
}));

test('waterInfo on the lake: d − half is the signed distance to the shore (to 5 cm)', () => withLagoon(() => {
  const lake = T.waters.findIndex((w) => w.kind === 'lake');
  for (const p of SHORE.filter((_, i) => i % 400 === 0)) for (const k of [-20, -6, -1, -0.2, 0.2, 1, 4, 9]) {
    const x = p.x + p.nx * k, z = p.z + p.nz * k;
    if (nearChannel(x, z, 12)) continue;
    const w = T.waterInfo(x, z, 20);
    assert.equal(w.body, lake, `the lake at ${k} m`);
    assert.ok(Math.abs(w.d - w.half - sdf(x, z)) < 0.05, `at ${k} m: ${(w.d - w.half).toFixed(3)} vs ${sdf(x, z).toFixed(3)}`);
  }
}));

test('the lake sits in the infield: inside the track, 10 m of grass or more to its inner edge, clear of the road home', () => withLagoon(() => {
  const home = entry.terrain.roads.find((r) => r.to === 'home').points;
  let edge = Infinity, road = Infinity;
  for (const p of SHORE.filter((_, i) => i % 10 === 0)) {
    assert.ok(T.inRaceway(p.x, p.z), 'in the infield');
    edge = Math.min(edge, segDist(trk.pts, p.x, p.z) - trk.half); road = Math.min(road, segDist(home, p.x, p.z) - 3.6);
  }
  assert.ok(edge >= 10, `${edge.toFixed(2)} m to the track's edge`); assert.ok(road >= 8, `${road.toFixed(2)} m to the road home`);
}));

test('the inlet is a channel from the lake, across the track once, out past the venue radius, clear of the rest of the track', () => withLagoon(() => {
  const ch = channelPts(), [x0, z0] = ch[0], [x1, z1] = ch[ch.length - 1];
  assert.ok(sdf(x0, z0) < -2, 'it starts inside the lake'); assert.ok(Math.hypot(x1, z1) >= entry.terrain.world.radius, 'it ends past the venue radius');
  const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
  let n = 0;
  for (let i = 0; i < ch.length - 1; i++) for (let j = 0; j < trk.pts.length - 1; j++) if (cross(ch[i], ch[i + 1], trk.pts[j], trk.pts[j + 1])) n++;
  assert.equal(n, 1, 'one crossing');
  const p = trk.at(INLET.s);
  for (const [x, z] of ch) {
    if (Math.hypot(x - p.x, z - p.z) < 30) continue;
    const gap = segDist(trk.pts, x, z) - trk.half - INLET.halfW;
    assert.ok(gap >= 5, `${gap.toFixed(1)} m of grass from the channel at ${x.toFixed(0)}, ${z.toFixed(0)} to the track`);
  }
}));

// Across the track and 8 m of run-off each side (out to the straight inlet's old outer end, 14 m from the centreline)
test('at the track the channel is the straight inlet it replaced: ground and water unchanged within 30 m of the crossing', () => {
  const straight = venueEntry({ ...lagoon, water: [{ s: INLET.s, halfW: INLET.halfW }] }, { slug: 'lagoon' });
  const p = trk.at(INLET.s), grid = [];
  for (let u = -30; u <= 30; u += 0.5) for (let v = -14; v <= 14; v += 0.5) grid.push([p.x + p.fx * u + p.rx * v, p.z + p.fz * u + p.rz * v]);
  const read = () => grid.map(([x, z]) => [T.groundHeight(x, z), T.onWater(x, z)]);
  const before = withLagoon(read, straight.terrain), after = withLagoon(read);
  for (let i = 0; i < grid.length; i++) {
    assert.equal(after[i][1], before[i][1], `water at ${grid[i]}`);
    assert.ok(Math.abs(after[i][0] - before[i][0]) < 1e-6, `ground at ${grid[i]}: ${after[i][0]} vs ${before[i][0]}`);
  }
});

test('no wall in the water: rise per 0.1 m under 0.09 across the shore and from the lake out along the channel', () => withLagoon(() => {
  const worst = (x, z, dx, dz, len) => { let w = 0, h = T.groundHeight(x, z); for (let k = 0.1; k <= len; k += 0.1) { const g = T.groundHeight(x + dx * k, z + dz * k); w = Math.max(w, Math.abs(g - h)); h = g; } return w; };
  for (const p of SHORE.filter((_, i) => i % 500 === 0)) assert.ok(worst(p.x - p.nx * 12, p.z - p.nz * 12, p.nx, p.nz, 20) < 0.09, `across the shore at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
  const ch = channelPts();
  for (let i = 0; i < 30; i++) { const [x, z] = ch[i], [nx, nz] = ch[i + 1], l = Math.hypot(nx - x, nz - z); assert.ok(worst(x, z, (nx - x) / l, (nz - z) / l, l) < 0.09, `along the channel at sample ${i}`); }
}));

// The lake is raceway grass, so its wading top is the water share of grass's (car-math.js topShare): 9.6 m/s, where the
// river's ford, on a road, wades at 12
test('a car leaving the track into the lake wades at half the infield grass\'s top and climbs out the far side', async () => {
  const { stepCar, colliders } = await loadStepCar();
  T.configureTerrain(entry.terrain);
  try {
    colliders.length = 0;
    // From the track nearest the lake's short axis, straight across the lake along it (−b or +b, toward the centre)
    const n1 = local(0, LAKE.ry), n2 = local(0, -LAKE.ry), d1 = segDist(trk.pts, ...n1), d2 = segDist(trk.pts, ...n2);
    const [sx, sz] = d1 < d2 ? n1 : n2, dir = d1 < d2 ? [-bx, -bz] : [bx, bz];
    let best = null; for (const q of trk.pts) { const d = Math.hypot(q[0] - sx, q[1] - sz); if (!best || d < best.d) best = { d, q }; }
    const [x, z] = best.q, heading = Math.atan2(-dir[0], -dir[1]);
    const car = { s: { x, y: T.groundHeight(x, z), z, heading, speed: 0, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false }, group: { position: { set() {} }, rotation: {} }, tilt: { rotation: {}, scale: { set() {} } }, wheels: [] };
    const deep = [], DT = 1 / 60;
    let wetFrames = 0, out = false, minY = Infinity;
    for (let i = 0; i < 60 * 14; i++) {
      const info = stepCar(car, { up: true }, DT);
      assert.ok(car.s.speed > 0, `never stopped (frame ${i})`);
      minY = Math.min(minY, car.s.y);
      if (info.wet) { wetFrames++; if (sdf(car.s.x, car.s.z) < -12) deep.push(car.s.speed); }
      if (wetFrames > 60 && !info.wet && sdf(car.s.x, car.s.z) > 3) { out = true; break; }
    }
    assert.ok(wetFrames > 120, `in the lake for ${wetFrames} frames`);
    const settled = deep.slice(Math.floor(deep.length / 2)), wade = resolvePhysics({}).dirt.top * topShare(false, 1, true);
    assert.ok(Math.abs(wade - 9.6) < 1e-9, `the wading top on raceway grass ${wade}`);
    assert.ok(settled.length > 20 && settled.every((v) => Math.abs(v - wade) < 0.05), `wading at ${settled[0]?.toFixed(2)} to ${settled.at(-1)?.toFixed(2)}`);
    assert.ok(out, 'climbed out the far side'); assert.ok(minY >= -LAKE.depth - 0.01, `never under the bed (${minY.toFixed(2)})`);
  } finally { T.configureTerrain(hub); }
});
