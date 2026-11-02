// Plaza furniture: where everything goes, kept free of three.js so node can test it against the real districts and
// roads. The kerb opens where roads meet a plaza's rim; a lamp stands beside each pad; bollards flank each gap;
// benches sit between the pads, facing the centre, with a planter either side.
export const KERB = { height: 0.12, band: 0.6, inset: 0.3, mouth: 1.5 }; // a 12 cm lip (under the car's 25 cm bump allowance) 0.3 m inside the rim, open within half + mouth of a road
export const LAMP = { beside: 3.4, clear: 1.2, padGap: 3.2, inside: 1.5 };
export const BOLLARD = { inset: 0.8, step: 1.6, edge: 0.4 };
export const BENCH = { at: 0.62, padGap: 3, clear: 2.5, mouthGap: 4, planter: 1.6, perPlaza: 3 };

const TAU = Math.PI * 2;
const norm = (a) => { let r = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return r; }; // into [−π, π)
const angleOf = (plaza, x, z) => Math.atan2(z - plaza.centre[1], x - plaza.centre[0]);
const atAngle = (plaza, a, r) => ({ x: plaza.centre[0] + Math.cos(a) * r, z: plaza.centre[1] + Math.sin(a) * r });

/** The arcs of a plaza's rim where roads come in: merged, sorted, in radians; an arc crossing ±π is split in two. */
export function kerbGaps(plaza, roads) {
  const [cx, cz] = plaza.centre, R = plaza.radius;
  const arcs = [];
  for (const r of roads) {
    const half = r.half ?? 3.6;
    for (const [x, z] of [r.pts[0], r.pts[r.pts.length - 1]]) {
      if (Math.abs(Math.hypot(x - cx, z - cz) - R) > 6) continue;
      const a = angleOf(plaza, x, z), w = (half + KERB.mouth) / R;
      arcs.push({ a0: a - w, a1: a + w });
    }
  }
  // Sort by start (normalised to [−π, π)), merge overlaps; an arc across the ±π seam keeps a1 past π rather than
  // splitting, so a gap there stays one gap (its bollards stand at its real edges, not at the seam)
  const parts = arcs.map(({ a0, a1 }) => { const lo = norm(a0); return { a0: lo, a1: lo + (a1 - a0) }; }).sort((p, q) => p.a0 - q.a0);
  const out = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && p.a0 <= last.a1 + 1e-9) last.a1 = Math.max(last.a1, p.a1);
    else out.push({ ...p });
  }
  if (out.length > 1 && out[out.length - 1].a1 - TAU >= out[0].a0 - 1e-9) { // the last wraps into the first
    out[out.length - 1].a1 = Math.max(out[out.length - 1].a1, out[0].a1 + TAU);
    out.shift();
  }
  return out;
}
/** Is an angle inside any gap (gaps may run past π). */
export const inGap = (gaps, angle) => { const a = norm(angle); return gaps.some((g) => (a >= g.a0 && a <= g.a1) || (a + TAU >= g.a0 && a + TAU <= g.a1)); };

/** Beside a pad: 3.4 m along the pad's across-direction, right first, then left; null when neither is clear. */
export function lampSpot(pad, plaza, { pads = [], clearance = () => Infinity } = {}) {
  const [cx, cz] = plaza.centre;
  const l = Math.hypot(pad.dx, pad.dz) || 1, dx = pad.dx / l, dz = pad.dz / l;
  for (const side of [1, -1]) { // right of the facing direction is (−dz, dx) for a pad facing (dx, dz)... with z towards the viewer, right is (−dz, dx) × side
    const x = pad.x + -dz * LAMP.beside * side, z = pad.z + dx * LAMP.beside * side;
    if (Math.hypot(x - cx, z - cz) > plaza.radius - LAMP.inside) continue;
    if (clearance(x, z) < LAMP.clear) continue;
    if (pads.some((p) => Math.hypot(x - p.x, z - p.z) < LAMP.padGap)) continue;
    return { x, z };
  }
  return null;
}

/** Two posts per side of each gap: just outside its edge and a step further round, 0.8 m inside the rim. */
export function bollardSpots(plaza, gaps) {
  const R = plaza.radius, r = R - BOLLARD.inset, out = [];
  for (const g of gaps) {
    for (const [edge, sign] of [[g.a0, -1], [g.a1, 1]]) {
      out.push(atAngle(plaza, edge + (sign * BOLLARD.edge) / R, r));
      out.push(atAngle(plaza, edge + (sign * (BOLLARD.edge + BOLLARD.step)) / R, r));
    }
  }
  return out;
}

/** Benches between the pads at 0.62 r, facing the centre, the best-spread three that keep clear of pads, colliders
 * and mouths; a planter 1.6 m either side of each along its own line, under the same rules. */
export function benchSpots(plaza, pads, gaps, clearance = () => Infinity, { planters = true } = {}) {
  const [cx, cz] = plaza.centre, R = plaza.radius, r = BENCH.at * R;
  const padAngles = pads.map((p) => angleOf(plaza, p.x, p.z)).sort((a, b) => a - b);
  const candidates = [];
  if (padAngles.length >= 2) for (let i = 0; i < padAngles.length; i++) {
    const a = padAngles[i], b = i + 1 < padAngles.length ? padAngles[i + 1] : padAngles[0] + TAU;
    candidates.push(norm((a + b) / 2));
  }
  const n = BENCH.perPlaza + padAngles.length; // a sparse plaza still gets a spread
  for (let k = 0; k < n; k++) candidates.push(norm((padAngles[0] ?? 0) + (k * TAU) / n + Math.PI / n));
  const mouthMargin = BENCH.mouthGap / R;
  const clearOfMouth = (a) => gaps.every((g) => [norm(a), norm(a) + TAU].every((x) => x < g.a0 - mouthMargin || x > g.a1 + mouthMargin));
  const spotOf = (a) => atAngle(plaza, a, r);
  const padDist = (s) => Math.min(Infinity, ...pads.map((p) => Math.hypot(s.x - p.x, s.z - p.z)));
  const ok = (s, a) => clearOfMouth(a) && padDist(s) >= BENCH.padGap && clearance(s.x, s.z) >= BENCH.clear;
  const scored = candidates
    .map((a) => ({ a, s: spotOf(a) }))
    .filter(({ a, s }) => ok(s, a))
    .map((c) => ({ ...c, score: Math.min(padDist(c.s), clearance(c.s.x, c.s.z), ...gaps.map((g) => R * Math.min(Math.abs(norm(c.a - g.a0)), Math.abs(norm(c.a - g.a1))))) }))
    .sort((p, q) => q.score - p.score);
  const benches = [];
  for (const c of scored) {
    if (benches.length >= BENCH.perPlaza) break;
    if (benches.some((b) => Math.abs(norm(b.a - c.a)) < 1.2)) continue;
    benches.push({ ...c.s, a: c.a, yaw: Math.atan2(cx - c.s.x, cz - c.s.z) });
  }
  const pots = [];
  if (planters) for (const b of benches) {
    const tx = -Math.sin(b.a), tz = Math.cos(b.a); // along the rim's direction at the bench
    for (const side of [-1, 1]) {
      const s = { x: b.x + tx * BENCH.planter * side, z: b.z + tz * BENCH.planter * side };
      if (ok(s, angleOf(plaza, s.x, s.z))) pots.push(s);
    }
  }
  return { benches: benches.map(({ x, z, yaw }) => ({ x, z, yaw })), planters: pots };
}
