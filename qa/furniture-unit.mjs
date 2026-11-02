// Plaza furniture: where the kerb opens and where the lamps, bollards, benches and planters stand
// (ecosystem/js/furniture-math.js), against the real districts and roads with synthetic pads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KERB, LAMP, BOLLARD, BENCH, kerbGaps, inGap, lampSpot, bollardSpots, benchSpots } from '../ecosystem/js/furniture-math.js';
import { roads } from '../ecosystem/js/terrain.js';
import { DISTRICTS } from '../ecosystem/js/content.js';

const perps = DISTRICTS.perps, yard = DISTRICTS.yard, hub = DISTRICTS.hub;
const ang = (p, x, z) => Math.atan2(z - p.centre[1], x - p.centre[0]);
test('kerbGaps: Perps has a spoke and two ring roads: three gaps, each wide enough for the road plus the mouth margin', () => {
  const gaps = kerbGaps(perps, roads);
  assert.equal(gaps.length, 3);
  for (const g of gaps) assert.ok(g.a1 - g.a0 >= (2 * (3.6 + KERB.mouth)) / perps.radius - 1e-9, 'road width plus margins');
  const spoke = roads.find((r) => r.kind === 'spoke' && r.to === 'perps'), end = spoke.pts[spoke.pts.length - 1];
  assert.ok(inGap(gaps, ang(perps, end[0], end[1])), 'the spoke mouth is open');
  assert.ok(!inGap(gaps, ang(perps, perps.centre[0], perps.centre[1] - perps.radius)), 'the north rim is kerbed');
});
test('kerbGaps: two endpoints close together merge into one gap; the Fill Yard has exactly one; HQ one per spoke', () => {
  const fake = { centre: [0, 0], radius: 20 };
  const two = [{ pts: [[12, 0], [19, 0], [30, 0]], half: 3.6 }, { pts: [[19.5, 1.5], [30, 30]], half: 3.6 }]; // one road out east, a second leaving beside it
  assert.equal(kerbGaps(fake, two).length, 1);
  assert.equal(kerbGaps(yard, roads).length, 1);
  assert.equal(kerbGaps(hub, roads).length, 9, 'HQ: one per spoke');
});
test('lampSpot: right side first, left when the right is blocked, none when both are', () => {
  const pad = { x: 0, z: -40, dx: 0, dz: -1 }; // a pad facing −z
  const plaza = { centre: [0, -40], radius: 54 };
  const open = lampSpot(pad, plaza, { pads: [], clearance: () => 10 });
  assert.deepEqual([Math.round(open.x * 10) / 10, Math.round(open.z * 10) / 10], [3.4, -40], 'right of a pad facing −z (north) is +x (east)');
  const left = lampSpot(pad, plaza, { pads: [], clearance: (x) => (x > 0 ? 0.5 : 10) });
  assert.deepEqual([Math.round(left.x * 10) / 10, Math.round(left.z * 10) / 10], [-3.4, -40], 'the left when the right is blocked');
  assert.equal(lampSpot(pad, plaza, { pads: [], clearance: () => 0.5 }), null);
  assert.equal(lampSpot(pad, plaza, { pads: [{ x: -3.4, z: -41 }, { x: 3.4, z: -39 }], clearance: () => 10 }), null, 'other pads too close on both sides');
  assert.equal(lampSpot({ x: 0, z: -40 - 53, dx: 0, dz: -1 }, plaza, { pads: [], clearance: () => 10 }), null, 'outside the rim');
  assert.equal(LAMP.beside, 3.4);
});
test('bollardSpots: four posts per gap, all 0.8 m inside the rim and just outside the mouth', () => {
  const gaps = kerbGaps(perps, roads), spots = bollardSpots(perps, gaps);
  assert.equal(spots.length, gaps.length * 4);
  for (const s of spots) {
    const d = Math.hypot(s.x - perps.centre[0], s.z - perps.centre[1]);
    assert.ok(Math.abs(d - (perps.radius - BOLLARD.inset)) < 1e-6);
    assert.ok(!inGap(gaps, ang(perps, s.x, s.z)), 'just outside the gap, never in the mouth');
  }
});
test('benchSpots: three benches spread round between pads, planters either side, none near a mouth or a pad', () => {
  const pads = [0, 1.2, 2.5, 4.0, 5.3].map((a) => ({ x: perps.centre[0] + Math.cos(a) * 40, z: perps.centre[1] + Math.sin(a) * 40 }));
  const gaps = kerbGaps(perps, roads);
  const { benches, planters } = benchSpots(perps, pads, gaps, () => 10);
  assert.equal(benches.length, BENCH.perPlaza); assert.equal(planters.length, BENCH.perPlaza * 2);
  for (const b of benches) {
    assert.ok(Math.abs(Math.hypot(b.x - perps.centre[0], b.z - perps.centre[1]) - BENCH.at * perps.radius) < 1e-6);
    for (const p of pads) assert.ok(Math.hypot(b.x - p.x, b.z - p.z) >= BENCH.padGap, 'clear of pads');
    for (const g of gaps) for (const a of [ang(perps, b.x, b.z), ang(perps, b.x, b.z) + 2 * Math.PI]) assert.ok(a < g.a0 - BENCH.mouthGap / perps.radius || a > g.a1 + BENCH.mouthGap / perps.radius, 'clear of a mouth');
    assert.ok(Math.abs(b.yaw - Math.atan2(perps.centre[0] - b.x, perps.centre[1] - b.z)) < 1e-9, 'faces the centre');
  }
  const angles = benches.map((b) => ang(perps, b.x, b.z)).sort((p, q) => p - q);
  assert.ok(angles[2] - angles[0] > 1.5, 'spread round, not bunched');
  assert.equal(benchSpots(perps, pads, gaps, () => 10, { planters: false }).planters.length, 0);
  const one = benchSpots(yard, [{ x: yard.centre[0] + 10, z: yard.centre[1] }], kerbGaps(yard, roads), () => 10);
  assert.equal(one.benches.length, BENCH.perPlaza, 'one pad still gives three benches');
  const oa = one.benches.map((b) => ang(yard, b.x, b.z)).sort((p, q) => p - q);
  assert.ok(oa[2] - oa[0] > 1.5, 'spread round the yard');
});

// From the review (2 Nov): the Raceway link leaves Partners almost along the rim, so endpoint-only gaps drew the kerb
// across 17 m of road with two bollards in it. Gaps now come from the road geometry: for every plaza, no kerbed angle
// and no bollard may lie within a road's half-width plus margin of any road polyline.
const distToRoads = (x, z) => { let best = Infinity; for (const r of roads) { const half = r.half ?? 3.6; for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - half); } } return best; };
test('kerbGaps follow the roads, not only their endpoints: no kerb and no bollard on any road, every plaza', () => {
  for (const p of Object.values(DISTRICTS)) {
    if (p.plaza === false) continue;
    const gaps = kerbGaps(p, roads), r = p.radius - KERB.inset;
    for (let a = -Math.PI; a < Math.PI; a += 0.005) {
      if (inGap(gaps, a)) continue;
      const x = p.centre[0] + Math.cos(a) * r, z = p.centre[1] + Math.sin(a) * r;
      assert.ok(distToRoads(x, z) >= KERB.mouth - 0.3, `${p.key}: kerb on a road at angle ${a.toFixed(2)} (${distToRoads(x, z).toFixed(2)} m past the edge)`);
    }
    for (const s of bollardSpots(p, gaps)) assert.ok(distToRoads(s.x, s.z) >= 0.8, `${p.key}: a bollard ${distToRoads(s.x, s.z).toFixed(2)} m from a road's edge`);
  }
});
