// The venue's bowl (plan 5 Task 1a, controller ruling R2): the ground rises about 6 m into the tree belt (radius − 60 to
// radius) and never touches the track: node --test qa/venue-bowl-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import * as T from '../ecosystem/js/terrain.js';
import { venueEntry } from '../ecosystem/js/entries.js';
import lagoon from '../ecosystem/tracks/lagoon.js';

const hub = T.terrainConfig();
const entry = venueEntry(lagoon, { slug: 'lagoon' }), trk = entry.track, R = entry.terrain.world.radius;
const extent = Math.max(...trk.pts.map(([x, z]) => Math.hypot(x, z)));
const flat = { ...entry.terrain, bowl: null }; // the same venue with no bowl
const heights = (terrain, pts) => { T.configureTerrain(terrain); try { return pts.map(([x, z]) => T.groundHeight(x, z)); } finally { T.configureTerrain(hub); } };
const ring = (r, n = 72) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);
const rise = (pts) => { const a = heights(entry.terrain, pts), b = heights(flat, pts); return a.map((h, i) => h - b[i]); };
/** The points of `pts` farther than `pad` m from the channel's bank (waters[0], the inlet run out to the edge) */
const offChannel = (pts, pad) => { T.configureTerrain(entry.terrain); try { return pts.filter(([x, z]) => { const w = T.waterInfo(x, z, 60); return !(w.body === 0 && w.d < w.half + pad); }); } finally { T.configureTerrain(hub); } };

test('the venue has a bowl; the hub has none', () => {
  assert.ok(entry.terrain.bowl && entry.terrain.bowl.height > 0, 'the venue');
  assert.ok(!hub.bowl, 'the hub');
});

test('the bowl never reaches the track: the ground along the whole centreline and 10 m either side is identical without it', () => {
  const pts = [];
  for (let i = 0; i < trk.len; i += 1) { const p = trk.at(i); for (let v = -10; v <= 10; v += 1) pts.push([p.x + p.rx * v, p.z + p.rz * v]); }
  const a = heights(entry.terrain, pts), b = heights(flat, pts);
  for (let i = 0; i < pts.length; i++) assert.equal(a[i], b[i], `ground at ${pts[i][0].toFixed(1)}, ${pts[i][1].toFixed(1)}`);
});

test('the rise begins outside the track\'s outermost point + 20 m', () => {
  assert.equal(R - 60, extent + 20, 'the belt starts there too');
  assert.ok(rise(ring(extent + 19.5, 360)).every((h) => h === 0), 'flat inside extent + 20');
  assert.ok(rise(ring(extent + 25, 360)).some((h) => h > 0), 'rising past it');
});

test('the rim stands about 6 m above the track in the belt, except where the channel runs out through it', () => {
  for (const r of [R - 25, R - 10, R - 1]) {
    const pts = offChannel(ring(r), 30), h = rise(pts);
    assert.ok(pts.length > 60, `${pts.length} points at ${r.toFixed(0)}`);
    for (let i = 0; i < h.length; i++) assert.ok(h[i] > 5.5 && h[i] < 6.5, `${h[i].toFixed(2)} m at r ${r.toFixed(0)}`);
  }
});

test('the channel runs out through the rim at the water: its centreline is under the water level from the track to the radius', () => {
  T.configureTerrain(entry.terrain);
  try {
    const ch = T.waters[0].pts, out = ch.filter(([x, z]) => Math.hypot(x, z) > extent && Math.hypot(x, z) < R - 1);
    assert.ok(out.length > 20, `${out.length} samples in the belt`);
    for (const [x, z] of out) { assert.ok(T.groundHeight(x, z) < T.WATER_LEVEL, `${T.groundHeight(x, z).toFixed(2)} at r ${Math.hypot(x, z).toFixed(0)}`); assert.ok(T.onWater(x, z)); }
  } finally { T.configureTerrain(hub); }
});

// Plan 5 Task 1b (Task 1a review minor 1): the road home runs out into the belt, so the bowl opens for it as it does for the
// water: the drive to the arch stays level (the road's ribbon never climbs the rim)
test('the bowl opens for the road home: level along it and across its width, out to its end in the belt', () => {
  const home = entry.terrain.roads.find((r) => r.to === 'home');
  T.configureTerrain(entry.terrain);
  let pts;
  try { const r = T.roads.find((x) => x.to === 'home'); pts = []; for (let i = 0; i < r.pts.length; i++) { const [x, z] = r.pts[i], t = r.curve.getTangentAt(Math.min(1, r.cum[i] / r.len)); for (const v of [-r.half, 0, r.half]) pts.push([x - t.z * v, z + t.x * v]); } } finally { T.configureTerrain(hub); }
  const end = home.points.at(-1);
  assert.ok(Math.hypot(...end) > extent + 20, 'the road reaches past where the rise begins');
  const h = rise(pts);
  for (let i = 0; i < h.length; i++) assert.ok(Math.abs(h[i]) < 0.05, `${h[i].toFixed(3)} m of bowl on the road at r ${Math.hypot(...pts[i]).toFixed(1)}`);
  // and the rim is still there off the road: 6 m at R − 10 on the far side of the world from the road
  const [ex, ez] = end, far = [-ex / Math.hypot(ex, ez) * (R - 10), -ez / Math.hypot(ex, ez) * (R - 10)];
  assert.ok(rise([far])[0] > 5.5);
});
