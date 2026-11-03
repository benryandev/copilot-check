// Where the pads land: node --test qa/layout-unit.mjs
// layoutStops (content.js) places every stop without a fixed pos round the far side of its plaza; the hand-placed ones
// must keep off the roads and clear of their neighbours; nothing in the hub may open a sheet as the car lands.
import test from 'node:test'; import assert from 'node:assert/strict';
import { isMonument, STOPS, DISTRICTS, ROADS, SPAWN, layoutStops, LAYOUT, HEIGHT, radiusFor } from '../ecosystem/js/content.js';
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

test('nine or more: tallest stops outer on 95 to 265, the rest inner in alternate gaps, 6 degrees clear of every outer angle', () => {
  const shapes = ['tower', 'kiosk', 'twin', 'antenna', 'pillar', 'flag', 'terminal', 'dome', 'grid', 'coins'];
  const nine = fake('nine', 9, 54, shapes); // the outer row takes as many as fit at 13.5 m (ten at 54 m), so all nine stand outer
  const p9 = layoutStops(nine.s, nine.d);
  for (const s of nine.s) assert.ok(Math.abs(dist(p9.get(s.key), nine.d.nine.centre) - 42) < 0.01, 'nine fit the outer row');
  for (const s of nine.s) assert.ok(Math.abs(degFromHQ(nine.d.nine, p9.get(s.key)) - 180) >= LAYOUT.keepOff180, `${s.key} stands behind the centre`);
  // Perpetuals with one more stop: five inner pads spread over the gaps, still 13.5 m apart, none at 180
  const more = STOPS.filter((s) => s.district === 'perps' && !s.pos && !s.row).concat([{ key: 'extra', district: 'perps', shape: 'kiosk', name: 'Extra stop' }]);
  const d15 = { perps: { ...DISTRICTS.perps, radius: radiusFor(more.length) } }; // 64 m: the radius rule grows with the count
  assert.equal(d15.perps.radius, 64);
  const p15 = layoutStops(more, d15), pts15 = more.map((s) => p15.get(s.key));
  for (let i = 0; i < pts15.length; i++) for (let j = i + 1; j < pts15.length; j++) assert.ok(dist(pts15[i], pts15[j]) >= 13.5, `fifteen: ${more[i].key} and ${more[j].key} ${dist(pts15[i], pts15[j]).toFixed(1)} m`);
  for (const s of more) assert.ok(Math.abs(degFromHQ(DISTRICTS.perps, p15.get(s.key)) - 180) >= LAYOUT.keepOff180, `fifteen: ${s.key} behind the centre`);
  const perps = DISTRICTS.perps, placed = layoutStops();
  const auto = STOPS.filter((s) => s.district === 'perps' && !s.pos && !s.row);
  const outer = auto.filter((s) => Math.abs(dist(placed.get(s.key), perps.centre) - 42) < 0.01);
  const inner = auto.filter((s) => Math.abs(dist(placed.get(s.key), perps.centre) - 26) < 0.01);
  assert.equal(outer.length, 10); assert.equal(inner.length, 4);
  assert.ok(Math.min(...outer.map((s) => HEIGHT[s.shape])) >= Math.max(...inner.map((s) => HEIGHT[s.shape])), 'inner row is the shorter models');
  for (const i of inner) for (const o of outer) {
    const da = Math.abs(degFromHQ(perps, placed.get(i.key)) - degFromHQ(perps, placed.get(o.key)));
    assert.ok(Math.min(da, 360 - da) >= 6, `${i.key} lines up with ${o.key}`);
  }
  for (const s of auto) assert.ok(Math.abs(degFromHQ(perps, placed.get(s.key)) - 180) >= LAYOUT.keepOff180, s.key);
});

test('from the HQ mouth no two buildings share a bearing: 3 degrees in one row, 1.5 across Perpetuals rows', () => {
  const placed = layoutStops();
  for (const d of Object.values(DISTRICTS)) {
    if (!d.hubDir) continue;
    const mouth = [d.centre[0] + d.hubDir[0] * d.radius, d.centre[1] + d.hubDir[1] * d.radius];
    const rows = STOPS.filter((s) => s.district === d.key && placed.has(s.key)).map((s) => { const p = placed.get(s.key); return { key: s.key, h: HEIGHT[s.shape], b: (Math.atan2(p[1] - mouth[1], p[0] - mouth[0]) * 180) / Math.PI }; }).sort((a, b) => a.b - b.b);
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i].b - rows[i - 1].b;
      // Labels are guarded by the two-dimensional test below; this keeps the buildings themselves apart from the entrance:
      // 3° in a single row, LAYOUT.minBearing (1.5°) in Perpetuals' two rows, where an inner model stands in front of a
      // taller outer one (3 Nov 2026 ruling)
      assert.ok(gap >= (d.key === 'perps' ? LAYOUT.minBearing : 3), `${d.key}: ${rows[i - 1].key} and ${rows[i].key} ${gap.toFixed(1)} degrees apart from the mouth`);
    }
  }
});

test('plaza radius follows the auto stop count, monuments never counted', () => {
  assert.deepEqual([radiusFor(4), radiusFor(5), radiusFor(6), radiusFor(8), radiusFor(9), radiusFor(14), radiusFor(15)], [42, 42, 48, 48, 54, 54, 64]);
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

test('from the mouth and from the car\'s camera just inside it, no two labels overlap: clear sideways (the drawn panel) or vertically', () => {
  const placed = layoutStops();
  for (const d of Object.values(DISTRICTS)) {
    if (!d.hubDir) continue;
    const mouth = [d.centre[0] + d.hubDir[0] * d.radius, d.centre[1] + d.hubDir[1] * d.radius];
    for (const [name, inset, eye] of [['rim', 0, 1.6], ['camera', 13, 6.5]]) { // on foot at the mouth; the chase camera with the car 24 m in
      const view = [d.centre[0] + d.hubDir[0] * (d.radius - inset), d.centre[1] + d.hubDir[1] * (d.radius - inset)];
      const rows = STOPS.filter((s) => s.district === d.key && placed.has(s.key)).map((s) => {
        const p = placed.get(s.key), dist = Math.hypot(p[0] - view[0], p[1] - view[1]), r2d = 180 / Math.PI;
        return { key: s.key, b: Math.atan2(p[1] - view[1], p[0] - view[0]) * r2d, w: ((LAYOUT.charWidth * s.name.length + LAYOUT.labelPad) / dist) * r2d, e: Math.atan((HEIGHT[s.shape] + 2.2 - eye) / dist) * r2d, h: (LAYOUT.labelHeight / dist) * r2d };
      });
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const clear = Math.max(Math.abs(a.b - b.b) - (a.w + b.w) / 2, Math.abs(a.e - b.e) - (a.h + b.h) / 2);
        assert.ok(clear >= 0.3, `${d.key}: "${a.key}" and "${b.key}" labels overlap by ${(-clear).toFixed(1)} degrees from the ${name}`);
      }
    }
  }
});

test('no pad stands in front of any road that meets the plaza, the Chart Ridge and the Raceway link included', () => {
  const placed = layoutStops();
  for (const d of Object.values(DISTRICTS)) {
    if (!d.hubDir) continue;
    for (const r of ROADS) for (const [end, next] of [[r.points[0], r.points[1]], [r.points[r.points.length - 1], r.points[r.points.length - 2]]]) {
      const dm = dist(end, d.centre);
      if (dm > d.radius + 6 || dm < d.radius - 6) continue; // not a mouth of this plaza
      const dir = [next[0] - end[0], next[1] - end[1]], l = Math.hypot(...dir), inward = [(d.centre[0] - end[0]) / dm, (d.centre[1] - end[1]) / dm];
      if (Math.abs((dir[0] * inward[0] + dir[1] * inward[1]) / l) < 0.5) continue; // along the rim, like the Raceway link: not in anyone's way
      const mouth = degFromHQ(d, end);
      for (const s of STOPS.filter((x) => x.district === d.key && placed.has(x.key))) {
        const a = degFromHQ(d, placed.get(s.key)), da = Math.abs(((a - mouth + 540) % 360) - 180);
        assert.ok(da >= LAYOUT.mouthClear, `${d.key}: ${s.key} is ${da.toFixed(0)} degrees from the ${r.kind} mouth at ${mouth.toFixed(0)}`);
      }
    }
  }
});

test('a monument stands at its plaza\'s centre, faces the HQ mouth, and is never counted or laid out', () => {
  const placed = layoutStops();
  for (const s of STOPS.filter(isMonument)) {
    const d = DISTRICTS[s.district];
    assert.ok(dist(s.pos, d.centre) < 0.05, `${s.key} at the centre`);
    assert.ok(dist(s.face, [d.centre[0] + d.hubDir[0] * d.radius, d.centre[1] + d.hubDir[1] * d.radius]) < 0.05, `${s.key} faces the mouth`);
    assert.ok(!placed.has(s.key), `${s.key} is not auto-laid`);
    assert.ok(HEIGHT[s.shape] <= 8, `${s.key} under 8 m`);
  }
  assert.equal(DISTRICTS.earn.radius, 48); assert.equal(DISTRICTS.token.radius, 42); // the count rule ignores them
  assert.equal(DISTRICTS.analytics.radius, 42); assert.equal(DISTRICTS.collateral.radius, 48); assert.equal(DISTRICTS.community.radius, 48);
  assert.equal(DISTRICTS.developers.radius, 42); assert.equal(DISTRICTS.chains.radius, 42); assert.equal(DISTRICTS.partners.radius, 48);
});
