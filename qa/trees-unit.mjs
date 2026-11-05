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

// R25 (fix wave C): the hub's arch belt stands in open play space, so its drawn trunks are solid; the venue's rim belt is scenery
const { loadStepCar } = await import('../tools/lapsim/car-node.mjs');
const { TRUNK_HALF } = await import('../ecosystem/js/trees.js');
const car = await loadStepCar();
/** Drives the real stepCar full throttle at (x, z) from `back` m away; the closest the car's centre comes and how far past it ends. */
function driveAt(x, z, back = 14, secs = 3) {
  const a = 0.7, dx = Math.cos(a), dz = Math.sin(a); // a fixed approach direction
  const sx = x - dx * back, sz = z - dz * back;
  const s = { x: sx, y: T.groundHeight(sx, sz), z: sz, heading: Math.atan2(-dx, -dz), speed: 0, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false };
  const c = { s, group: { position: { set() {} }, rotation: {} }, tilt: { rotation: {}, scale: { set() {} } }, wheels: [] };
  let closest = Infinity, past = -Infinity;
  for (let i = 0; i < secs * 60; i++) {
    car.stepCar(c, { up: true, steer: 0 }, 1 / 60);
    closest = Math.min(closest, Math.hypot(c.s.x - x, c.s.z - z));
    past = Math.max(past, (c.s.x - x) * dx + (c.s.z - z) * dz);
  }
  return { closest, past };
}
test('the hub\'s arch belt is solid: a car driven at a drawn trunk stops at it, a tree the tier hides lets it through (R25)', () => {
  const road = T.roads.find((r) => r.kind === 'venue');
  const belt = buildArchTrees(new THREE.Scene(), road, pal), boxes = belt.userData.boxes;
  assert.equal(boxes.length, belt.userData.total, 'one box per tree');
  const all = trees(belt, belt.userData.total);
  boxes.forEach((b, i) => { assert.ok(Math.abs(b.cx - all[i].x) < 1e-3 && Math.abs(b.cz - all[i].z) < 1e-3, 'the box is on its trunk'); assert.ok(b.hx >= TRUNK_HALF * 0.8 - 1e-9 && b.hx <= TRUNK_HALF * 1.4 + 1e-9); assert.equal(b.top, undefined, 'no top: the camera and clearance() ignore it'); });
  const t = boxes[0];
  car.colliders.length = 0; car.colliders.push(t);
  const hit = driveAt(t.cx, t.cz);
  assert.ok(hit.closest >= car.CAR_R + t.hx - 0.05, `the car stops at the trunk (closest ${hit.closest.toFixed(2)} m)`);
  assert.ok(hit.past < 0, `and never passes it (${hit.past.toFixed(2)} m)`);
  car.colliders.length = 0; const free = driveAt(t.cx, t.cz);
  assert.ok(free.past > 5, `without the box the same drive runs through (${free.past.toFixed(1)} m past)`);
  // The phone and low tiers draw half: the hidden half's boxes are empty, so they stop nothing
  belt.userData.setDensity(0.5);
  const hidden = boxes[belt.count];
  assert.ok(hidden.minX > hidden.maxX, 'a hidden tree\'s box is empty');
  car.colliders.length = 0; car.colliders.push(hidden);
  assert.ok(driveAt(hidden.cx, hidden.cz).past > 5, 'a hidden tree lets the car through');
  belt.userData.setDensity(1); assert.ok(hidden.minX < hidden.maxX, 'and is solid again on high');
  car.colliders.length = 0;
});
test('the venue\'s rim belt has no colliders (R17 stands for it), and the runner adds the hub belt\'s boxes', () => withLagoon(() => {
  const belt = buildTreeBelt(new THREE.Scene(), R, pal);
  assert.equal(belt.userData.boxes, undefined);
  const src = readFileSync('ecosystem/js/runner.js', 'utf8');
  assert.match(src, /for \(const b of treeBelts\) if \(b\.userData\.boxes\) colliders\.push\(\.\.\.b\.userData\.boxes\);/);
  // placed before the venue's ring belt is built, so only arch belts are in treeBelts at that point either way
  assert.ok(src.indexOf('colliders.push(...b.userData.boxes)') < src.indexOf('buildTreeBelt(scene, WORLD.radius'));
}));
