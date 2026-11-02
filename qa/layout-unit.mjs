// Where the pads land: node --test qa/layout-unit.mjs
// layoutStops (content.js) places every stop without a fixed pos round the far side of its plaza; the hand-placed ones
// must keep off the roads and clear of their neighbours; nothing in the hub may open a sheet as the car lands.
import test from 'node:test'; import assert from 'node:assert/strict';
import { STOPS, DISTRICTS, ROADS, SPAWN, layoutStops } from '../ecosystem/js/content.js';
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('auto-laid pads in one plaza stand at least 12.5 m apart and inside the plaza', () => {
  const placed = layoutStops();
  for (const d of Object.values(DISTRICTS)) {
    const pts = STOPS.filter((s) => s.district === d.key && placed.has(s.key)).map((s) => placed.get(s.key));
    for (let i = 0; i < pts.length; i++) {
      assert.ok(dist(pts[i], d.centre) <= d.radius - 8, `${d.key}: inside`);
      for (let j = i + 1; j < pts.length; j++) assert.ok(dist(pts[i], pts[j]) >= 12.5, `${d.key}: ${dist(pts[i], pts[j]).toFixed(1)} m`);
    }
  }
});

test('a plaza with ten or fewer stops keeps its arcs (105 to 255, 128 to 232)', () => {
  const p = layoutStops().get('slp'); // earn, 8 stops: first outer slot at 105° from the HQ direction, r = 42
  const d = DISTRICTS.earn, a = Math.atan2(d.hubDir[1], d.hubDir[0]) + (105 * Math.PI) / 180;
  assert.ok(dist(p, [d.centre[0] + Math.cos(a) * 42, d.centre[1] + Math.sin(a) * 42]) < 0.01);
});

test('hand-placed stops keep off the roads and clear of their neighbours', () => {
  // The hub is exempt from the road rule: a 24 m plaza with nine mouths puts every building within 6 m of a road start
  // (HQ itself is 4.7 m from the Token spoke's first point); its stops are held by the spawn and neighbour rules instead.
  for (const s of STOPS.filter((x) => x.pos && DISTRICTS[x.district].plaza !== false && x.district !== 'yard')) {
    if (s.district !== 'hub') for (const r of ROADS) for (const p of r.points) assert.ok(dist(s.pos, p) >= 12, `${s.key} is ${dist(s.pos, p).toFixed(1)} m from a road point`);
    for (const o of STOPS) if (o !== s && o.pos && o.district === s.district) assert.ok(dist(s.pos, o.pos) >= 10, `${s.key} vs ${o.key}`);
  }
});

test('hub stops stand at least 14 m from the spawn, so landing opens no sheet', () => {
  for (const s of STOPS.filter((x) => x.district === 'hub')) assert.ok(dist(s.pos, [SPAWN.x, SPAWN.z]) >= 14, s.key);
});

test('a second hub building keeps clear of HQ (12 m square) and of every road mouth', () => {
  // The hub plaza is 24 m across with nine mouths at r = 20; a building of up to ~6.5 m needs 14 m from HQ's centre and
  // 7 m from each road's first point (review finding, 3 Nov 2026: the gatehouse at [-13, 7] sat on HQ and the Community mouth).
  const hq = STOPS.find((x) => x.key === 'strike').pos;
  for (const s of STOPS.filter((x) => x.district === 'hub' && x.key !== 'strike')) {
    assert.ok(dist(s.pos, hq) >= 14, `${s.key}: ${dist(s.pos, hq).toFixed(1)} m from HQ`);
    for (const r of ROADS) if (r.kind === 'spoke') assert.ok(dist(s.pos, r.points[0]) >= 7, `${s.key}: ${dist(s.pos, r.points[0]).toFixed(1)} m from the ${r.to} mouth`);
    assert.ok(dist(s.pos, [0, 0]) <= 20, `${s.key}: inside the plaza`);
  }
});
