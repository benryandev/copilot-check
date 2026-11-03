// Where the pads land: node --test qa/layout-unit.mjs
// layoutStops (content.js) places every stop without a fixed pos round the far side of its plaza; the hand-placed ones
// must keep off the roads and clear of their neighbours; nothing in the hub may open a sheet as the car lands.
import test from 'node:test'; import assert from 'node:assert/strict';
import { STOPS, DISTRICTS, ROADS, SPAWN, layoutStops, LAYOUT, HEIGHT, radiusFor } from '../ecosystem/js/content.js';
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const base = (d) => Math.atan2(d.hubDir[1], d.hubDir[0]);
const degFromHQ = (d, p) => { let a = ((Math.atan2(p[1] - d.centre[1], p[0] - d.centre[0]) - base(d)) * 180) / Math.PI; return ((a % 360) + 360) % 360; };
const fake = (key, n, radius, shapes = []) => ({ // a synthetic district at Earn's spot with n auto stops
  d: { [key]: { ...DISTRICTS.earn, key, radius } },
  s: Array.from({ length: n }, (_, i) => ({ key: `${key}-${i}`, district: key, shape: shapes[i] || 'kiosk' })),
});

test('auto-laid pads in one plaza stand at least 14 m apart (13.5 m in Perpetuals) and inside the plaza', () => {
  const placed = layoutStops();
  for (const d of Object.values(DISTRICTS)) {
    const pts = STOPS.filter((s) => s.district === d.key && placed.has(s.key)).map((s) => placed.get(s.key));
    for (let i = 0; i < pts.length; i++) {
      assert.ok(dist(pts[i], d.centre) <= d.radius - 8, `${d.key}: inside`);
      for (let j = i + 1; j < pts.length; j++) assert.ok(dist(pts[i], pts[j]) >= (d.key === 'perps' ? 13.5 : 14), `${d.key}: ${dist(pts[i], pts[j]).toFixed(1)} m`);
    }
  }
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

test('one row up to eight stops: every pad on 100 to 260 at r-12, none within 5 degrees of 180', () => {
  for (const d of Object.values(DISTRICTS)) {
    if (!d.hubDir) continue;
    const auto = STOPS.filter((s) => s.district === d.key && !s.pos && !s.row);
    if (auto.length > LAYOUT.oneRowMax) continue;
    for (const s of auto) {
      const p = layoutStops().get(s.key), a = degFromHQ(d, p);
      assert.ok(a >= 99.9 && a <= 260.1, `${s.key} at ${a.toFixed(1)} deg`);
      assert.ok(Math.abs(a - 180) >= LAYOUT.keepOff180, `${s.key} stands behind the centre`);
      assert.ok(Math.abs(dist(p, d.centre) - (d.radius - LAYOUT.outerInset)) < 0.01, `${s.key} radius`);
    }
  }
});

test('odd counts leave the slot nearest 180 empty; even counts are symmetric', () => {
  const five = fake('five', 5, 42), seven = fake('seven', 7, 48), eight = fake('eight', 8, 48);
  const angles = (f) => f.s.map((s) => degFromHQ(f.d[f.s[0].district], layoutStops(f.s, f.d).get(s.key))).sort((a, b) => a - b);
  assert.deepEqual(angles(five).map(Math.round), [100, 132, 164, 228, 260]);
  assert.deepEqual(angles(seven).map(Math.round), [100, 123, 146, 169, 214, 237, 260]); // 8 slots; 169 and 191 tie for 180, the larger goes
  assert.deepEqual(angles(eight).map(Math.round), [100, 123, 146, 169, 191, 214, 237, 260]);
});

test('nine or more: tallest stops outer on 95 to 265, the rest inner at alternate midpoints, 9 degrees clear', () => {
  const shapes = ['tower', 'kiosk', 'twin', 'antenna', 'pillar', 'flag', 'terminal', 'dome', 'grid', 'coins'];
  const nine = fake('nine', 9, 54, shapes); // the outer row takes as many as fit at 13.5 m (ten at 54 m), so all nine stand outer
  const p9 = layoutStops(nine.s, nine.d);
  for (const s of nine.s) assert.ok(Math.abs(dist(p9.get(s.key), nine.d.nine.centre) - 42) < 0.01, 'nine fit the outer row');
  const perps = DISTRICTS.perps, placed = layoutStops();
  const auto = STOPS.filter((s) => s.district === 'perps' && !s.pos && !s.row);
  const outer = auto.filter((s) => Math.abs(dist(placed.get(s.key), perps.centre) - 42) < 0.01);
  const inner = auto.filter((s) => Math.abs(dist(placed.get(s.key), perps.centre) - 26) < 0.01);
  assert.equal(outer.length, 10); assert.equal(inner.length, 4);
  assert.ok(Math.min(...outer.map((s) => HEIGHT[s.shape])) >= Math.max(...inner.map((s) => HEIGHT[s.shape])), 'inner row is the shorter models');
  for (const i of inner) for (const o of outer) {
    const da = Math.abs(degFromHQ(perps, placed.get(i.key)) - degFromHQ(perps, placed.get(o.key)));
    assert.ok(Math.min(da, 360 - da) >= 9, `${i.key} lines up with ${o.key}`);
  }
  for (const s of auto) assert.ok(Math.abs(degFromHQ(perps, placed.get(s.key)) - 180) >= LAYOUT.keepOff180, s.key);
});

test('from the HQ mouth no two pads share a bearing (within 3 degrees), so no label stacks', () => {
  const placed = layoutStops();
  for (const d of Object.values(DISTRICTS)) {
    if (!d.hubDir) continue;
    const mouth = [d.centre[0] + d.hubDir[0] * d.radius, d.centre[1] + d.hubDir[1] * d.radius];
    const rows = STOPS.filter((s) => s.district === d.key && placed.has(s.key)).map((s) => { const p = placed.get(s.key); return { key: s.key, h: HEIGHT[s.shape], b: (Math.atan2(p[1] - mouth[1], p[0] - mouth[0]) * 180) / Math.PI }; }).sort((a, b) => a.b - b.b);
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i].b - rows[i - 1].b;
      if (gap >= 3) continue;
      // Perpetuals' two rows cannot keep 3° from the entrance without lining buildings up radially from the centre
      // (3 Nov 2026 ruling): a pair under 3° is allowed only across rows, and only when the inner model is at least
      // 3 m shorter, which keeps its label below the outer one on screen. Single-row plazas keep the 3° rule.
      assert.ok(d.key === 'perps' && gap >= 1.5, `${d.key}: ${rows[i - 1].key} and ${rows[i].key} ${gap.toFixed(1)} degrees apart from the mouth`);
      assert.ok(Math.abs(rows[i].h - rows[i - 1].h) >= 3, `${d.key}: ${rows[i - 1].key} and ${rows[i].key} ${gap.toFixed(1)} degrees apart and within 3 m in height`);
    }
  }
});

test('plaza radius follows the auto stop count, monuments never counted', () => {
  assert.deepEqual([radiusFor(4), radiusFor(5), radiusFor(6), radiusFor(8), radiusFor(9), radiusFor(15)], [42, 42, 48, 48, 54, 54]);
  const want = { perps: 54, earn: 48, collateral: 48, partners: 48, developers: 42, analytics: 42, community: 48, token: 42, chains: 42 };
  for (const [k, r] of Object.entries(want)) assert.equal(DISTRICTS[k].radius, r, k);
  assert.equal(DISTRICTS.hub.radius, 24); assert.equal(DISTRICTS.yard.radius, 24);
});

test('things placed by hand stay clear of the shrunk rims', () => {
  const chains = DISTRICTS.chains, yard = DISTRICTS.yard;
  assert.ok(dist(chains.centre, yard.centre) - chains.radius - yard.radius >= 10, 'Chains to the Fill Yard');
  const ridge = ROADS.find((r) => r.kind === 'ridge');
  assert.ok(Math.abs(dist(ridge.points[0], DISTRICTS.analytics.centre) - DISTRICTS.analytics.radius) < 0.01, 'the ridge leaves the Analytics rim');
  assert.ok(Math.abs(dist(ridge.points[6], DISTRICTS.developers.centre) - DISTRICTS.developers.radius) < 0.01, 'and reaches the Developers rim');
  const flag = STOPS.find((s) => s.key === 'funding-rates');
  assert.ok(dist(flag.pos, DISTRICTS.perps.centre) <= DISTRICTS.perps.radius - 8, 'Funding rates inside Perpetuals');
});
