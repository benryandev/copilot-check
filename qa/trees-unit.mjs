// The tree belts (plan 5 Task 1b, trees.js; Ben's amendment 1): a ring of instanced trees round a venue's world between
// radius − 60 and radius, open where the road home and the inlet's channel cross it, thinned on the phone and low tiers; and on
// the hub, a short belt across each venue road at its arch with the road in its gap: node --test qa/trees-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.location = { search: '?venues=1' }; // the hub's venue road (on by default since plan 5 Task 5; ?venues=1 gives the same list)
const THREE = await import('../ecosystem/vendor/three.module.min.js');
const T = await import('../ecosystem/js/terrain.js');
const { venueEntry } = await import('../ecosystem/js/entries.js');
const { TIERS } = await import('../ecosystem/js/quality-math.js');
const { buildTreeBelt, buildArchTrees, treeDensity, TREES } = await import('../ecosystem/js/trees.js');
const lagoon = (await import('../ecosystem/tracks/lagoon.js')).default;

const hub = T.terrainConfig();
const entry = venueEntry(lagoon, { slug: 'lagoon' }), R = entry.terrain.world.radius;
const pal = { grassA: 0x93bb6c, grassB: 0x75a056, grassBase: 0x4f7d3b, wood: 0x8a6a48 };
const withLagoon = (fn) => { T.configureTerrain(entry.terrain); try { return fn(); } finally { T.configureTerrain(hub); } };
const trees = (mesh, n = mesh.count) => { const m = new THREE.Matrix4(), p = new THREE.Vector3(), out = []; for (let i = 0; i < n; i++) { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); out.push({ x: p.x, y: p.y, z: p.z }); } return out; };
const segDist = (pts, x, z) => { let b = Infinity; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz, u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)); b = Math.min(b, Math.hypot(x - ax - vx * u, z - az - vz * u)); } return b; };

test('the venue belt: a ring between radius − 60 and radius, one instanced draw, every tree on the ground', () => withLagoon(() => {
  const scene = new THREE.Scene(), belt = buildTreeBelt(scene, R, pal);
  assert.ok(belt.isInstancedMesh && belt.parent === scene);
  let n = 0; scene.traverse((o) => { if (o.isMesh) n++; }); assert.equal(n, 1, 'one mesh, one material');
  assert.ok(!Array.isArray(belt.material));
  const all = trees(belt, belt.userData.total);
  assert.ok(all.length > 1000, `${all.length} trees`);
  for (const t of all) {
    const r = Math.hypot(t.x, t.z);
    assert.ok(r >= R - TREES.band && r <= R, `a tree at r ${r.toFixed(1)}`);
    assert.ok(Math.abs(t.y - (T.groundHeight(t.x, t.z) - TREES.sink)) < 1e-4, `on the ground at ${t.x.toFixed(1)}, ${t.z.toFixed(1)}`);
  }
  assert.equal(TREES.band, 60);
  assert.equal(typeof belt.userData.recolour, 'function'); belt.userData.recolour(pal);
}));

test('the venue belt leaves a gap at the road home and at the channel: no tree on the road, in the water or on their banks', () => withLagoon(() => {
  const belt = buildTreeBelt(new THREE.Scene(), R, pal), all = trees(belt, belt.userData.total);
  const home = T.roads.find((r) => r.to === 'home');
  const end = home.pts.at(-1);
  assert.ok(Math.hypot(...end) > R - TREES.band, 'the road home reaches into the belt');
  for (const t of all) assert.ok(segDist(home.pts, t.x, t.z) > home.half + TREES.roadClear, `a tree ${segDist(home.pts, t.x, t.z).toFixed(1)} m from the road home`);
  const ch = T.waters[0];
  const inBelt = ch.pts.filter(([x, z]) => Math.hypot(x, z) > R - TREES.band && Math.hypot(x, z) < R);
  assert.ok(inBelt.length > 10, 'the channel runs out through the belt');
  for (const t of all) {
    assert.ok(!T.onWater(t.x, t.z), `a tree in the water at ${t.x.toFixed(1)}, ${t.z.toFixed(1)}`);
    assert.ok(segDist(ch.pts, t.x, t.z) > ch.half + TREES.waterClear, `a tree ${(segDist(ch.pts, t.x, t.z) - ch.half).toFixed(1)} m from the channel's bank`);
  }
  // and the belt is a belt either side of both gaps: trees within 25 m of each
  const near = (pts, pad) => all.some((t) => segDist(pts, t.x, t.z) < pad);
  assert.ok(near(home.pts, home.half + TREES.roadClear + 25), 'trees beside the road home');
  assert.ok(near(inBelt, ch.half + TREES.waterClear + 25), 'trees beside the channel');
}));

test('counts per tier: the belt halves on the phone and low tiers', () => withLagoon(() => {
  assert.deepEqual(Object.fromEntries(Object.keys(TIERS).map((k) => [k, treeDensity(k)])), { high: 1, medium: 1, phone: 0.5, low: 0.5 });
  const belt = buildTreeBelt(new THREE.Scene(), R, pal), N = belt.userData.total;
  assert.equal(belt.count, N, 'full by default');
  belt.userData.setDensity(treeDensity('phone'));
  assert.ok(Math.abs(belt.count - N / 2) <= N * 0.05, `phone ${belt.count} of ${N}`);
  const half = trees(belt);
  // the half that stays is spread round the whole ring, not one side of it
  const quadrants = [0, 0, 0, 0]; for (const t of half) quadrants[(Math.floor((Math.atan2(t.z, t.x) + Math.PI) / (Math.PI / 2))) % 4]++;
  for (const q of quadrants) assert.ok(q > half.length / 8, `quadrants ${quadrants}`);
  belt.userData.setDensity(treeDensity('high')); assert.equal(belt.count, N);
  const thin = buildTreeBelt(new THREE.Scene(), R, pal, { density: 0.5 });
  assert.equal(thin.userData.total, N, 'the same trees, fewer drawn');
  assert.ok(Math.abs(thin.count - N / 2) <= N * 0.05);
}));

test('the hub\'s arch belt (?venues=1): across the road at the arch, the road in its gap and trees behind the arch, clear of plazas, roads, the river and the Raceway', () => {
  const road = T.roads.find((r) => r.kind === 'venue');
  assert.ok(road, 'the preview has the Lagoon road');
  const scene = new THREE.Scene(), g = new THREE.Group(); scene.add(g);
  const belt = buildArchTrees(g, road, pal);
  assert.ok(belt.isInstancedMesh && belt.parent === g);
  const all = trees(belt, belt.userData.total);
  assert.ok(all.length >= 25, `${all.length} trees`);
  const p = road.pts, [x1, z1] = p.at(-1), [x0, z0] = p.at(-2), l = Math.hypot(x1 - x0, z1 - z0), f = [(x1 - x0) / l, (z1 - z0) / l];
  const arch = [x1 - f[0] * 5, z1 - f[1] * 5]; // buildVenueArch: 5 m back from the road's end
  let left = 0, right = 0, behind = 0;
  for (const t of all) {
    const along = (t.x - x1) * f[0] + (t.z - z1) * f[1], side = -(t.x - x1) * f[1] + (t.z - z1) * f[0]; // from the road's end, the belt's centre
    assert.ok(Math.abs(along) <= TREES.arch.depth / 2 && Math.abs(side) <= TREES.arch.width / 2, `a tree at ${along.toFixed(1)} along, ${side.toFixed(1)} across`);
    if (along > 0 && Math.abs(side) < 8) behind++;
    const fromArch = (t.x - arch[0]) * f[0] + (t.z - arch[1]) * f[1];
    assert.ok(Math.abs(fromArch) <= TREES.arch.depth / 2 + 5, 'about the arch');
    if (side > 0) left++; else right++;
    const info = T.roadInfo(t.x, t.z, 60);
    assert.ok(info.d - info.half > TREES.roadClear, `a tree ${(info.d - info.half).toFixed(1)} m from a ${T.roads[info.road].kind} road`);
    for (const d of Object.values(T.districts())) if (d.plaza !== false && d.centre && d.key !== 'raceway') assert.ok(Math.hypot(t.x - d.centre[0], t.z - d.centre[1]) > d.radius + TREES.plazaClear, `a tree on ${d.name}`);
    const w = T.waterInfo(t.x, t.z, 60); assert.ok(w.d - w.half > TREES.waterClear, 'a tree by the river');
    assert.ok(!T.inRaceway(t.x, t.z), 'a tree in the Raceway');
    assert.ok(Math.abs(t.y - (T.groundHeight(t.x, t.z) - TREES.sink)) < 1e-4, 'on the ground');
  }
  assert.ok(left > 5 && right > 5, `trees either side of the arch (${left} left, ${right} right)`);
  assert.ok(behind >= 2, `the trees close in behind the arch (${behind} within 8 m of the road's line past its end)`);
  assert.ok(TREES.arch.width >= 50 && TREES.arch.width <= 60 && TREES.arch.depth >= 25 && TREES.arch.depth <= 30, 'a modest belt');
  belt.userData.setDensity(0.5); assert.ok(belt.count < belt.userData.total && belt.count > 0);
});

test('the runner: the ring belt on a venue, the arch belt beside each arch from the same venue road list, density from the tier', () => {
  const src = readFileSync('ecosystem/js/runner.js', 'utf8');
  assert.match(src, /venueRoadList\.forEach\(\(r\) => \{ buildVenueArch\(scene, r\.venue, r\); if \(entry\.kind === "hub"\) treeBelts\.push\(buildArchTrees\(groupFor\(scene, r\.from\), r, pal\(\), \{ density: treeDensity\(tierName\) \}\)\); \}\)/);
  assert.match(src, /if \(entry\.kind === "venue"\) treeBelts\.push\(buildTreeBelt\(scene, WORLD\.radius, pal\(\), \{ density: treeDensity\(tierName\) \}\)\)/);
  assert.match(src, /treeBelts\.forEach\(\(b\) => b\.userData\.setDensity\(treeDensity\(tierName\)\)\)/);
});
