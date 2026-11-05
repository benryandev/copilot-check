// Portal math (no three.js): node --test qa/portal-math-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { archLine, crossed, flightPath, portalRecord, readPortal } from '../ecosystem/js/portal-math.js';

const road = { pts: [[0, 0], [0, -20], [0, -40]] }; // heads -z
const arch = { x: 0, z: -40, half: 6 };
const line = archLine(road, arch);
const store = () => { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('archLine: across the road at the arch, half the arch width each side, f down the road', () => {
  assert.equal(line.fx, 0); assert.equal(line.fz, -1);
  assert.equal(Math.hypot(line.bx - line.ax, line.bz - line.az), 12);
  assert.equal(line.az, -40); assert.equal(line.bz, -40);
});

test('crossed: forward true, backward false, parallel miss false, 3 m outside the width false', () => {
  assert.equal(crossed([0, -39], [0, -41], line), true);
  assert.equal(crossed([0, -41], [0, -39], line), false);
  assert.equal(crossed([7, -30], [7, -50], line), false);
  assert.equal(crossed([0, -39], [10, -39], line), false);
  assert.equal(crossed([9, -39], [9, -41], line), false);
  assert.equal(crossed([0, -30], [0, -39], line), false); // stops short
});

test('flightPath: starts at the chase pose, ends 60 m up over the arch looking down the road', () => {
  const from = { pos: [1, 3, 5], look: [1, 1, -4] }, to = { x: 10, z: -40, fx: 0, fz: -1 };
  const a = flightPath(0, from, to), b = flightPath(1, from, to);
  assert.deepEqual(a.pos, from.pos); assert.deepEqual(a.look, from.look);
  assert.ok(Math.abs(b.pos[1] - (from.pos[1] + 60)) < 1e-9);
  assert.deepEqual([b.pos[0], b.pos[2]], [10, -40]);
  assert.equal(b.look[1], 0); assert.equal(b.look[0], 10); assert.ok(b.look[2] < -40);
  const m = flightPath(0.5, from, to); assert.ok(Math.abs(m.pos[1] - (from.pos[1] + 30)) < 1e-9); // smoothstep midpoint
});

test('readPortal: the record once; null when stale, for another page, garbage, or read twice', () => {
  const rec = portalRecord({ from: 'hub', to: 'lagoon', camOff: [1, 2, 3], lookOff: [0, 0, 0], heading: 1.5, now: 1000 });
  assert.equal(rec.at, 1000); assert.equal(rec.preview, false); assert.deepEqual(rec.camOff, [1, 2, 3]);
  assert.equal(portalRecord({ from: 'hub', to: 'x', camOff: [0, 0, 0], lookOff: [0, 0, 0], heading: 0, preview: true, now: 1 }).preview, true);
  const s = store(); s.setItem('eco-portal', JSON.stringify(rec));
  assert.deepEqual(readPortal(s, { to: 'lagoon', now: 5000 }), rec);
  assert.equal(readPortal(s, { to: 'lagoon', now: 5000 }), null);
  s.setItem('eco-portal', JSON.stringify(rec)); assert.equal(readPortal(s, { to: 'lagoon', now: 31001 }), null);
  assert.equal(s.getItem('eco-portal'), null);
  s.setItem('eco-portal', JSON.stringify(rec)); assert.equal(readPortal(s, { to: 'hub', now: 2000 }), null);
  assert.equal(s.getItem('eco-portal'), null);
  s.setItem('eco-portal', '{nope'); assert.equal(readPortal(s, { to: 'lagoon', now: 2000 }), null);
  s.setItem('eco-portal', JSON.stringify(rec)); assert.deepEqual(readPortal(s, { to: 'lagoon', now: 31000 }), rec); // exactly 30 s is fresh
});

test('portalLines: one venue road → one line at its arch (5 m short of the far end) facing along the road; none → []', async () => {
  const { portalLines } = await import('../ecosystem/js/portal-math.js');
  const venue = { key: 'lagoon', url: '/ecosystem/tracks/lagoon/' };
  const roads = [{ kind: 'spoke', pts: [[0, 0], [50, 0]], half: 6 }, { kind: 'venue', venue, half: 6, pts: [[0, 0], [0, -20], [0, -40]] }];
  const ls = portalLines(roads, [venue]);
  assert.equal(ls.length, 1);
  const [l] = ls;
  assert.equal(l.fx, 0); assert.equal(l.fz, -1); assert.equal(l.x, 0); assert.equal(l.z, -35);
  assert.equal(l.az, -35); assert.equal(l.bz, -35); assert.ok(Math.abs(Math.hypot(l.bx - l.ax, l.bz - l.az) - 2 * 7.6) < 1e-9);
  assert.equal(l.target, venue);
  assert.equal(crossed([0, -34], [0, -36], l), true);
  assert.deepEqual(portalLines([roads[0]], [venue]), []);
  assert.deepEqual(portalLines([], []), []);
  assert.deepEqual(portalLines(roads, [{ key: 'other' }]), []);
});

// ── The landing (Task 5b) ──
import { venueArchRoad, landingSpot } from '../ecosystem/js/portal-math.js';
import { venueEntry, hubEntry } from '../ecosystem/js/entries.js';
import { venueRoads, VENUE_ROAD } from '../ecosystem/js/content.js';

const minGap = (pts, track) => Math.min(...pts.map(([x, z]) => Math.min(...track.pts.map(([tx, tz]) => Math.hypot(x - tx, z - tz)))));

test('venueArchRoad: 40 m straight off the grid, every point clear of the track by its half width plus 4 m (the Lagoon and RealFi)', async () => {
  for (const slug of ['lagoon', 'realfi']) {
    const mod = (await import(`../ecosystem/tracks/${slug}.js`)).default;
    const e = venueEntry(mod, { slug }), t = e.track, pts = venueArchRoad(t);
    assert.equal(pts.length, 5);
    const len = Math.hypot(pts[4][0] - pts[0][0], pts[4][1] - pts[0][1]);
    assert.ok(Math.abs(len - 40) < 1e-6, `${slug} length ${len}`);
    assert.ok(minGap(pts, t) >= t.half + 4, `${slug} gap ${minGap(pts, t)} < ${t.half + 4}`);
    // leaves the straight beside the grid: the start is level with the grid, square to the straight
    const g = t.at(t.len - 14), along = (pts[0][0] - g.x) * g.fx + (pts[0][1] - g.z) * g.fz;
    assert.ok(Math.abs(along) < 1e-6, `${slug} along ${along}`);
    assert.ok(Math.hypot(pts[4][0], pts[4][1]) < e.terrain.world.radius, `${slug} inside the world`);
    assert.deepEqual(e.terrain.roads[1].points, pts);
  }
});

test('landingSpot: a venue lands on its grid facing the straight', async () => {
  const lagoon = (await import('../ecosystem/tracks/lagoon.js')).default;
  const e = venueEntry(lagoon, { slug: 'lagoon' });
  const spot = landingSpot({ from: 'hub', to: e.url }, e);
  assert.deepEqual(spot, { x: e.spawn.x, z: e.spawn.z, heading: e.spawn.heading });
  const g = e.track.at(e.track.len - 14);
  assert.ok(Math.abs(-Math.sin(spot.heading) - g.fx) < 1e-9 && Math.abs(-Math.cos(spot.heading) - g.fz) < 1e-9);
});

test('landingSpot: the hub lands on the venue road 10 m short of the arch, facing the ring', () => {
  const venue = { key: 'lagoon', track: 'lagoon-v1', url: '/ecosystem/tracks/lagoon/', name: 'The Lagoon', off: 'partners' };
  const districts = { partners: { centre: [100, 0], exits: [{ at: [120, 0], dir: [1, 0], to: 'x' }] } };
  const [r] = venueRoads([venue], districts);
  const spot = landingSpot({ from: 'lagoon-v1', to: '/ecosystem/' }, hubEntry(), [r]);
  const end = r.points[r.points.length - 1], start = r.points[0];
  const ux = (end[0] - start[0]) / VENUE_ROAD, uz = (end[1] - start[1]) / VENUE_ROAD;
  // 15 m back from the far end (the arch is 5 m back), on the road's line
  assert.ok(Math.abs(spot.x - (end[0] - ux * 15)) < 1e-9 && Math.abs(spot.z - (end[1] - uz * 15)) < 1e-9, JSON.stringify(spot));
  // facing back toward the ring: the car's forward is minus the road's direction
  assert.ok(Math.abs(-Math.sin(spot.heading) + ux) < 1e-9 && Math.abs(-Math.cos(spot.heading) + uz) < 1e-9);
  // and the key or url match too; an unknown venue lands at the spawn
  assert.deepEqual(landingSpot({ from: 'lagoon' }, hubEntry(), [r]), spot);
  const h = hubEntry();
  assert.deepEqual(landingSpot({ from: 'nowhere' }, h, [r]), { x: h.spawn.x, z: h.spawn.z, heading: h.spawn.heading });
});

// ── The record as offsets (Task 5c, R5) ──
import { landingStart } from '../ecosystem/js/portal-math.js';
test('landingStart: the offsets land over the spot, turned by the change of heading; no offsets → null', () => {
  const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} vs ${b}`));
  const rec = { camOff: [0, 60, 8], lookOff: [0, -2, -30], heading: 0 }; // 60 m up, 8 m behind, looking 30 m ahead (facing -z)
  const same = landingStart(rec, { x: 100, z: -50, heading: 0 }, 3);
  near(same.cam, [100, 63, -42]); near(same.look, [100, 1, -80]);
  // a spot facing +x (heading -π/2: (-sin h, -cos h) = (1, 0)) turns "ahead" from -z to +x
  const turned = landingStart(rec, { x: 0, z: 0, heading: -Math.PI / 2 }, 0);
  near(turned.cam, [-8, 60, 0]); near(turned.look, [30, -2, 0]);
  assert.equal(landingStart({ cam: [1, 2, 3], look: [0, 0, 0] }, { x: 0, z: 0, heading: 0 }), null); // the old world-coordinate record
  assert.equal(landingStart(null, { x: 0, z: 0, heading: 0 }), null);
});
