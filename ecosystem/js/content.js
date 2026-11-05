// The world's layout: districts on a ring around Strike HQ, dirt roads (a spoke from HQ to each
// district and a ring road between neighbours), jumps and the spawn. Colours follow the community
// ecosystem map. Sheet text lives in stops.js.

import { STOPS } from "./stops.js";
import { resolveTrack } from "./track-math.js";
import realfi from "../tracks/realfi.js";
export { STOPS };

// Height of every building shape in metres: the glTF models measured from their files (tools/model-heights.mjs,
// pinned by qa/model-heights-unit.mjs) and the primitives from their SHAPES in build.js. The layout sorts the taller
// models to a plaza's outer row (3 Nov 2026), so this must be read before any model loads.
export const HEIGHT = {
  tower: 14.1, twin: 12.9, pillar: 14.0, terminal: 17.2, grid: 11.4, townhall: 14.9, slpvault: 12.7, rotunda: 12.8,
  gatehouse: 11.7, bridgegate: 11.6, exchange: 10.4, hq: 14.4, cluster: 9.0, cliff: 8.8, shop: 8.7, coinstack: 8.2,
  dome: 7.9, arch: 7.5, vault: 7.1, observatory: 6.0, coins: 5.7, antenna: 5.5, kiosk: 5.3, plot: 3.2,
  clock: 11, flag: 11, cabinet: 2.2, depot: 5, pitbox: 6.3,
  slpengine: 8.0, stake: 7.8, // the monuments (Part B1): capped at 8 m by the design; read with node translations (7.95 and 7.85)
  plinth: 7.1, stacks: 7.6, beacon: 7.9, // the monuments (Part B2): read with node translations (7.05, 7.55 and 7.85)
  obelisk: 7.8, pylons: 7.6, orrery: 7.9, // the monuments (Part B3): read with node translations; capped at 8 m by the design
};
export const heightOf = (shape) => HEIGHT[shape] ?? 8; // a shape missing from the table counts as a middling 8 m
// A monument (Part B1, 3 Nov 2026): a stop placed by hand at its plaza's centre; never counted by the radius rule, never laid out,
// no floating label (an 8 m monument's label overlapped "Protocol Vaults" from Earn's rim by 1.0° under the label model below)
export const isMonument = (s) => s.key.startsWith("monument-");

const RING = 190; // distance from HQ to each district's centre

// Clockwise from north. Neighbours share themes: Earn next to Collateral (Borrow and Earn spans
// both), Partners next to Developers, Chains next to Perpetuals.
const ORDER = [
  ["perps", "Perpetuals & Trading", 0x22c55e, ["volume24h", "openInterest", "markets", "maxLeverage", "users", "liquidated"]],
  ["earn", "Earn & Vaults", 0x22d3ee, ["slpEquity", "slpDepositors", "userVaults", "copyAllocated"]],
  ["collateral", "Collateral & Stablecoins", 0xfacc15, ["creditLines"]],
  ["partners", "Partners & Integrations", 0xec4899, null],
  ["developers", "Developers", 0x3b82f6, null],
  ["analytics", "Analytics & Discovery", 0xf97316, null],
  ["community", "Community & Channels", 0xcbd5e1, ["referralCodes", "referredVolume", "activeTraders"]],
  ["token", "Token & Governance", 0xa78bfa, null],
  ["chains", "Chains & Security", 0x94a3b8, null],
];

// Strike HQ's green: the hub district's colour and the car's wherever no sponsor gives one (entries.js)
export const HUB_COLOUR = 0x22c55e;
export const DISTRICTS = {
  hub: { key: "hub", name: "Strike HQ", colour: HUB_COLOUR, centre: [0, 0], radius: 24, board: ["users", "totalVolume", "volume24h", "markets"], ring: -1 },
};
// A plaza's radius follows how many stops it lays out (3 Nov 2026 audit: four stops in a 54 m plaza read as a car park).
// Monuments and hand-placed stops are not counted; roads, kerbs, cobbles and furniture all derive from this number.
export const radiusFor = (n) => (n >= 15 ? 64 : n >= 9 ? 54 : n >= 6 ? 48 : 42); // 15 or more: twelve outer and the rest in alternate gaps need 64 m to keep 13.5 m and the back open
ORDER.forEach(([key, name, colour, board], i) => {
  const a = (i / ORDER.length) * Math.PI * 2;
  const auto = STOPS.filter((s) => s.district === key && !s.pos && !s.row).length;
  DISTRICTS[key] = { key, name, colour, board, ring: i, angle: a, centre: [Math.sin(a) * RING, -Math.cos(a) * RING], radius: radiusFor(auto) };
});
export const RING_KEYS = ORDER.map((o) => o[0]);

// ── RealFi Raceway: a time-trial track out past Partners & Integrations ──
// Not on the ring: placed by hand in a local frame beyond the Partners district, x along the ring
// (clockwise), y outwards from HQ. It has no plaza; "inside" is the track and its infield (terrain.js).
const RACE_R = 303; // HQ to the middle of the track
const raceA = DISTRICTS.partners.angle;
const rOut = [Math.sin(raceA), -Math.cos(raceA)];
// The track is a data module (tracks/realfi.js) resolved in the frame that starts at the middle of the track;
// raceLocal is that frame, so the board, race control and the scenery keep placing things in it.
export const TRACK = resolveTrack(realfi({ origin: [rOut[0] * RACE_R, rOut[1] * RACE_R], angle: raceA }));
export const raceLocal = TRACK.toWorld;
// RealFi's accent green (realfi.co's green-400); the logo itself is their brand green, 0x032327
DISTRICTS.raceway = { key: "raceway", name: "RealFi Raceway", colour: 0x0fb89c, board: null, ring: -1, centre: raceLocal(0, 0), radius: 150, plaza: false };

// ── Fill Yard: a small plaza off the road to Perpetuals, with a short drive in from the spoke ──
// Strike's app green; the shed and its conveyor are placed below once the roads exist.
DISTRICTS.yard = { key: "yard", name: "Fill Yard", colour: 0x26fab0, board: null, ring: -1, centre: [-40, -98], radius: 24 };

// Unit vector from a district's centre towards a point
const towards = (d, x, z) => {
  const dx = x - d.centre[0], dz = z - d.centre[1], l = Math.hypot(dx, dz);
  return [dx / l, dz / l];
};

// ── Roads ──────────────────────────────────────────────────────────────
export const ROADS = [];
RING_KEYS.forEach((key, i) => {
  const d = DISTRICTS[key];
  // Spoke: HQ's edge to the district's edge, wiggling gently
  const ux = Math.sin(d.angle), uz = -Math.cos(d.angle); // outwards
  const px = -uz, pz = ux; // sideways
  const wig = i % 2 ? 1 : -1;
  const end = RING - d.radius + 2;
  const at = (r, side) => [ux * r + px * side, uz * r + pz * side];
  // The Chains spoke runs straight for its last 40 m (Ben, 2 Nov 2026): the river's bridge sits on that stretch, and a
  // bridge on a bend looked wrong. The other spokes keep their wiggles all the way in.
  const tail = key === "chains" ? [at(98, 0), at(116, 0)] : [at(102, 5 * wig), at(126, -4 * wig), at(end - 8, wig)];
  ROADS.push({
    kind: "spoke", from: "hub", to: key,
    points: [at(20, 0), at(42, 6 * wig), at(72, -7 * wig), ...tail, at(end, 0)],
  });
  // Ring road to the next district: the chord between the two plazas, bowed slightly outwards
  const n = DISTRICTS[RING_KEYS[(i + 1) % RING_KEYS.length]];
  const [cx, cz] = towards(d, n.centre[0], n.centre[1]);
  const a = [d.centre[0] + cx * (d.radius - 2), d.centre[1] + cz * (d.radius - 2)];
  const b = [n.centre[0] - cx * (n.radius - 2), n.centre[1] - cz * (n.radius - 2)];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ml = Math.hypot(...mid);
  const out = (p, k) => [p[0] + (mid[0] / ml) * k, p[1] + (mid[1] / ml) * k];
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  ROADS.push({ kind: "ring", from: key, to: n.key, points: [a, out(lerp(a, b, 0.25), 3.5), out(mid, 5), out(lerp(a, b, 0.75), 3.5), b] });
});

// The raceway: a closed loop from tracks/realfi.js. It starts on the start line (a long straight nearest Partners),
// round a hairpin, back along an S-bend and a sweeping curve, and round a second hairpin.
// Wider than the other roads. A short link road runs from Partners' far edge to just before the start line.
ROADS.push({ kind: "track", from: "raceway", to: "raceway", closed: true, half: TRACK.half, points: TRACK.worldPoints });
ROADS.push({
  kind: "link", from: "partners", to: "raceway",
  points: [[0, -61], [-25, -60], [-55, -55], [-76, -48], [-86, -36]].map(([x, y]) => raceLocal(x, y)),
});
// The Fill Yard's drive: off the Perpetuals spoke (through one of its control points, so it meets
// the road) and into the yard's plaza
ROADS.push({ kind: "drive", from: "perps", to: "yard", points: [[-5, -102], [-10, -101.5], [-16, -100.7], [-21, -99.8]] });
// Chart Ridge (2 Nov 2026, Ben): a dirt road between the south edges of Analytics & Discovery and Developers whose
// height follows the last 24 hourly BTC candles (terrain.js setRidgeSeries, ridge-math.js). It leaves each plaza due
// south and bows to about z 320; an optional, longer way between the two plazas, never on anyone's route.
{
  const a = DISTRICTS.analytics, d = DISTRICTS.developers;
  const p0 = [a.centre[0], a.centre[1] + a.radius], p3 = [d.centre[0], d.centre[1] + d.radius];
  const p1 = [p0[0], 350], p2 = [p3[0], 350];
  const bez = (t) => [0, 1].map((k) => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * p1[k] + 3 * (1 - t) * t * t * p2[k] + t ** 3 * p3[k]);
  ROADS.push({ kind: "ridge", from: "analytics", to: "developers", points: Array.from({ length: 7 }, (_, i) => bez(i / 6)) });
}
// ── Venues: tracks on their own pages (/ecosystem/tracks/<slug>/), each reached by a 40 m road off the ring ending at an
// arch. The Lagoon is on (plan 5 Task 5): the hub builds its road, arch, belt and Map group, and the site lists it with its
// `line` (tools/site-pages.mjs). ROADS is the pre-venue list plus one road per venue (qa/content-unit.mjs).
export const VENUES = [
  { key: "lagoon", name: "The Lagoon", track: "lagoon-v1", url: "/ecosystem/tracks/lagoon/", off: "partners", colour: 0x2fa7c9,
    line: "A timed lap on tarmac and dirt with a jump over the water, on its own page off the ring road by Partners & Integrations." },
];
// Kept for QA and the portal record's flag (?venues=1): the same list with or without it now the Lagoon is on
export function venuesPreview() {
  return VENUES;
}
export const VENUE_ROAD = 40;
// The road leaves the `off` district's ring exit farther from the Raceway's link road, and runs straight for 40 m
// half way between the ring road's direction and straight out from HQ (clear of both the ring and the plaza).
export function venueRoads(list, districts, link = null) {
  return list.map((venue) => {
    const d = districts[venue.off];
    const far = (e) => (link ? Math.hypot(e.at[0] - link[0], e.at[1] - link[1]) : 0);
    const exit = [...d.exits].sort((a, b) => far(b) - far(a))[0];
    const ol = Math.hypot(...d.centre), out = [d.centre[0] / ol, d.centre[1] / ol];
    const dx = exit.dir[0] + out[0], dz = exit.dir[1] + out[1], l = Math.hypot(dx, dz);
    const u = [dx / l, dz / l], [x0, z0] = exit.at;
    const points = [0, 0.25, 0.5, 0.75, 1].map((k) => [x0 + u[0] * VENUE_ROAD * k, z0 + u[1] * VENUE_ROAD * k]);
    return { kind: "venue", from: venue.off, to: venue.key, venue, points, exit: exit.to };
  });
}
export const TRACK_ROAD = ROADS.findIndex((r) => r.kind === "track");
// Race control sits in the infield by the start straight, facing it
const raceControl = STOPS.find((s) => s.key === "raceway");
if (raceControl) Object.assign(raceControl, { pos: raceLocal(5, -14), face: raceLocal(5, -36) });
// The Fill Yard's shed sits on the HQ side of its plaza facing the middle, so its belt (out of the
// shed's side) runs across the yard and the pile lands inside the ring
const fillYard = STOPS.find((s) => s.key === "fillyard");
if (fillYard) Object.assign(fillYard, { pos: [-30, -84], face: [-30, -100] });

// Time trials: metres along the track's centreline from the start line to each checkpoint gate,
// and the lap length. The leaderboard worker (copilot-watch) checks posted splits against these
// numbers at 30 m/s, so they come from the track module (tracks/realfi.js) and are measured from it here.
// qa/track-realfi-unit.mjs pins them to the published values. Change the track and give it a new id.
// Measured 30 Oct 2026 (642.2 m a lap; 21.4 s is the fastest lap the worker accepts).
export const RACE_TRACK = { id: TRACK.id, checkpoints: TRACK.checkpoints, length: TRACK.len };

// Directions out of each district (to HQ and along the ring), kept clear of buildings
for (const key of RING_KEYS) {
  const d = DISTRICTS[key];
  d.hubDir = towards(d, 0, 0);
  d.exits = ROADS.filter((r) => r.kind === "ring" && (r.from === key || r.to === key)).map((r) => {
    const p = r.from === key ? r.points[0] : r.points.at(-1);
    const other = r.from === key ? r.to : r.from;
    return { to: other, dir: towards(d, p[0], p[1]), at: p };
  });
}
// The venue roads go after every other road, so the indices above (TRACK_ROAD, the jumps' spokes) are unchanged
ROADS.push(...venueRoads(venuesPreview(), DISTRICTS, ROADS.find((r) => r.kind === "link" && r.from === "partners")?.points[0]));

// Jumps: a kicker on one half of a spoke, so the other half is always a flat way past.
// `t` is how far along the road (0–1), `side` +1 right / −1 left of the direction of travel.
const spoke = (key) => ROADS.findIndex((r) => r.kind === "spoke" && r.to === key);
export const JUMPS = [
  { road: spoke("perps"), t: 0.28, side: 1, length: 8, height: 1.9, width: 3.4 }, // 0.42 until 2 Nov 2026: a car off that lip landed on the funding windsocks (Ben); from 0.28 it is down 10 m before the board
  { road: spoke("collateral"), t: 0.5, side: -1, length: 8, height: 1.9, width: 3.4 },
  // (The Developers spoke had a 10 m ramp at t 0.28 until 3 Nov 2026: it sat beside Builders' Row and its Jump sign overlapped the Row's. Ben: remove it.)
  { road: spoke("community"), t: 0.5, side: -1, length: 8, height: 1.9, width: 3.4 },
  { road: spoke("token"), t: 0.45, side: 1, length: 7, height: 1.5, width: 3.4 },
  // (The raceway's ramps are not listed here: terrain.js configures them from TRACK.ramps, which are in track s.)
  // The epic jump (2 Nov 2026, Ben): two ramps facing each other across the river's straight stretch south of the Token
  // ford. Free-standing (no road): `x, z` is the ramp's low end, `dir` the way up it. Flat out clears the gap and lands
  // on the far ramp's slope (a boost); anything under about 22 m/s meets the far face and the river. `stunt` turns the
  // side-on camera on for the flight.
  { x: -82.9, z: 18, dir: [-1, 0], length: 12, height: 3.6, width: 5, stunt: true }, // lip 5.4 m east of the water's centreline
  { x: -117.7, z: 18, dir: [1, 0], length: 12, height: 3.6, width: 5, stunt: true }, // lip 5.4 m west of it: 10.8 m lip to lip
];

// ── The river (2 Nov 2026, Ben) ────────────────────────────────────────
// One polyline from the north-west hills to the south-west rim, kept between HQ and the ring plazas on the
// west side. It crosses five roads (terrain.js finds them): wooden bridges on all but the Token spoke, which
// fords it. `half` is the channel's half-width, `depth` the bed under the banks at the centre, `level` the
// water surface (under every road and plaza, which never go below 0), `flow` the texture's speed in m/s.
export const RIVER = {
  // Between the Chains plaza and the Fill Yard the gap is 16.5 m at its narrowest; the river passes through its exact
  // centre (-68, -114) along the gap's own axis, 8 m from each, and crosses the Chains spoke at its mouth at about 72°.
  points: [[-150, -360], [-110, -290], [-75, -225], [-58, -172], [-55, -148], [-61, -128], [-68, -114], [-76, -100], [-86, -86], [-94, -68], [-101, -48], [-108, -25], [-100, 20], [-100, 95], [-118, 138], [-138, 195], [-170, 260], [-215, 330]],
  half: 3.5, depth: 0.45, level: -0.06, flow: 0.7,
  fords: ["token"], // roads (by their `to`) that cross without a bridge
};
// Every body of water in the hub, as terrain.js configures them (bodies[0] is the river)
export const WATERS = [RIVER];

export const SPAWN = { x: 0, z: 14, heading: 0 };
// Other visitors as cars (peers.js). Off here, or with ?mp=0, the world is single-player as before.
export const MULTIPLAYER = true;

// ── Stop layout ────────────────────────────────────────────────────────
// Stops without a fixed `pos` (and not on Builders' Row) go round the far side of their district, which keeps the HQ
// entrance and both ring-road entrances clear. Angles are from the HQ direction: 0° points at HQ, the ring-road mouths
// are at ±70°. Rules from the 3 Nov 2026 district audit (docs/superpowers/specs/2026-11-03-ecosystem-districts-design.md):
//   - up to eight stops: one row at r−12 on 100°–260° (30° clear of the mouths), evenly spread; an odd count would put
//     a pad at 180°, straight behind the centre from the entrance, so odd counts use n+1 slots and leave the one nearest
//     180° empty (the larger of a tie), which also opens a view corridor behind the plaza's monument;
//   - nine or more (Perpetuals): the outer row at r−12 on 95°–265° takes the tallest stops, as many as fit 13.5 m apart
//     (ten at 54 m); the rest sit at r−28 in alternate gaps between outer slots, each slid within its gap so that its
//     bearing from the entrance is at least 3° from every other pad, so no inner pad lines up with an outer one and no
//     label stacks from the entrance.
export const LAYOUT = {
  oneRowMax: 8, arc: [100, 260], outerArc: [95, 265], outerInset: 12, innerInset: 28, innerClear: 6,
  minGap: 14, minGapWide: 13.5, keepOff180: 5,
  mouthClear: 22, // degrees either side of a road that arrives head-on (the Chart Ridge): no pad in front of it
  // The label as drawn (build.js makeLabel): 88 px text on a 1024 px canvas shown 10 m wide, so about 0.45 m a
  // character plus 96 px of padding (0.94 m); the panel is 132 of 192 px of a 1.875 m sprite, 1.29 m
  charWidth: 0.45, labelPad: 0.94, labelHeight: 1.29, minBearing: 1.0,
  // Where a visitor judges the entrance from: on foot at the rim, and the chase camera with the car 24 m in
  views: [{ inset: 0, eye: 1.6 }, { inset: 13, eye: 6.5 }],
};
export function layoutStops(stops = STOPS, districts = DISTRICTS, roads = ROADS) {
  const out = new Map();
  const deg = Math.PI / 180;
  const slots = (m, [from, to]) => Array.from({ length: m }, (_, i) => (m === 1 ? (from + to) / 2 : from + ((to - from) * i) / (m - 1)));
  const angDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  for (const d of Object.values(districts)) {
    if (!d.hubDir) continue;
    const auto = stops.filter((s) => s.district === d.key && !s.pos && !s.row);
    const n = auto.length;
    if (!n) continue;
    const base = Math.atan2(d.hubDir[1], d.hubDir[0]); // pointing at HQ
    const rel = (p) => ((((Math.atan2(p[1] - d.centre[1], p[0] - d.centre[0]) - base) / deg) % 360) + 360) % 360;
    const at = (a, r) => [d.centre[0] + Math.cos(base + a * deg) * r, d.centre[1] + Math.sin(base + a * deg) * r];
    // Roads that arrive at this plaza head-on (within 60° of radial): no pad within mouthClear of their mouth. The spoke and
    // the ring roads are already outside the arcs; this catches the Chart Ridge. The Raceway link leaves Partners along the
    // rim, so it is exempt.
    const mouths = [];
    for (const r of roads) for (const [end, next] of [[r.points[0], r.points[1]], [r.points[r.points.length - 1], r.points[r.points.length - 2]]]) {
      const dm = Math.hypot(end[0] - d.centre[0], end[1] - d.centre[1]);
      if (dm > d.radius + 6 || dm < d.radius - 6) continue;
      const dir = [next[0] - end[0], next[1] - end[1]], l = Math.hypot(...dir) || 1;
      const inward = [(d.centre[0] - end[0]) / dm, (d.centre[1] - end[1]) / dm];
      if (Math.abs((dir[0] * inward[0] + dir[1] * inward[1]) / l) >= 0.5) mouths.push(rel(end));
    }
    const clearOfMouths = (a) => mouths.every((m) => angDist(a, m) >= LAYOUT.mouthClear);
    // Pick `count` slots on an arc: even slots, more of them as needed, dropping any in front of a mouth and then those
    // nearest 180° (the larger of a tie) until `count` remain, so an odd count or a blocked slot leaves the back open.
    const pickSlots = (count, arc) => {
      for (let m = count; m < count + 24; m++) {
        let valid = slots(m, arc).filter(clearOfMouths);
        while (valid.length > count) { let worst = 0; valid.forEach((a, i) => { if (angDist(a, 180) <= angDist(valid[worst], 180)) worst = i; }); valid.splice(worst, 1); }
        if (valid.length === count && valid.every((a) => angDist(a, 180) >= LAYOUT.keepOff180)) return valid;
      }
      return slots(count, arc); // nothing fits the rules: even slots, as before
    };
    const put = (stop, a, r) => out.set(stop.key, at(a, r));
    if (n <= LAYOUT.oneRowMax) {
      const angles = pickSlots(n, LAYOUT.arc);
      auto.forEach((s, i) => put(s, angles[i], d.radius - LAYOUT.outerInset));
      continue;
    }
    const rOut = d.radius - LAYOUT.outerInset;
    const span = (LAYOUT.outerArc[1] - LAYOUT.outerArc[0]) * deg * rOut; // arc length of the outer row
    const kMax = Math.floor(span / LAYOUT.minGapWide) + 1; // slots that keep minGapWide on the outer arc
    const k = Math.min(n, kMax - (kMax % 2)); // an odd row would take k+1 slots (the one nearest 180° left open), so stay even
    const tallest = new Set(auto.slice().sort((a, b) => heightOf(b.shape) - heightOf(a.shape)).slice(0, k).map((s) => s.key));
    const outer = auto.filter((s) => tallest.has(s.key)), inner = auto.filter((s) => !tallest.has(s.key)); // STOPS order within each row
    const oa = pickSlots(k, LAYOUT.outerArc); // even slots, or k+1 with the one nearest 180° left open when k is odd
    outer.forEach((s, i) => put(s, oa[i], rOut));
    // Inner pads take gaps between outer slots: alternate gaps (1, 3, 5, …) when they suffice, otherwise gaps spread evenly.
    // Labels float over the buildings, so what must not collide from the entrance is label against label, seen from each of
    // LAYOUT.views: a label's drawn width and height at its distance, sideways or vertically. Every assignment of inner stops
    // to gaps is tried; within its gap each pad slides, innerClear° off both outer angles, to the angle that keeps the most
    // clearance from every pad already placed; the assignment with the best worst-case clearance wins. Exact midpoints in
    // stop order gave 2° at best and stacked two labels (3 Nov 2026).
    const rIn = d.radius - LAYOUT.innerInset;
    const views = LAYOUT.views.map((v) => ({ at: [d.centre[0] + d.hubDir[0] * (d.radius - v.inset), d.centre[1] + d.hubDir[1] * (d.radius - v.inset)], eye: v.eye }));
    const seen = (stop, p) => views.map((v) => {
      const dist = Math.hypot(p[0] - v.at[0], p[1] - v.at[1]);
      return { b: Math.atan2(p[1] - v.at[1], p[0] - v.at[0]) / deg, w: ((LAYOUT.charWidth * String(stop.name ?? stop.key).length + LAYOUT.labelPad) / dist) / deg, e: Math.atan((heightOf(stop.shape) + 2.2 - v.eye) / dist) / deg, h: (LAYOUT.labelHeight / dist) / deg };
    });
    // ... and the buildings themselves keep at least minBearing apart, so an inner one never stands square in front of an outer one
    const clearance = (xs, ys) => Math.min(...xs.map((x, i) => { const y = ys[i]; return Math.min(Math.max(Math.abs(x.b - y.b) - (x.w + y.w) / 2, Math.abs(x.e - y.e) - (x.h + y.h) / 2), Math.abs(x.b - y.b) - LAYOUT.minBearing); }));
    const outerSeen = outer.map((s) => ({ p: out.get(s.key), v: seen(s, out.get(s.key)) }));
    // Usable gaps: those with an angle innerClear° off both outer slots and keepOff180° off 180 (the back stays open for the
    // monument's corridor in the inner row too). Alternate gaps when they suffice, otherwise usable gaps spread evenly.
    const window = (g) => { const lo = oa[g] + LAYOUT.innerClear, hi = oa[g + 1] - LAYOUT.innerClear; return lo <= hi && (angDist(lo, 180) >= LAYOUT.keepOff180 || angDist(hi, 180) >= LAYOUT.keepOff180); };
    const usable = Array.from({ length: oa.length - 1 }, (_, i) => i).filter(window);
    const gapsAlt = usable.filter((_, i) => i % 2 === 1);
    const step = usable.length / inner.length;
    const gaps = gapsAlt.length >= inner.length ? gapsAlt : Array.from({ length: inner.length }, (_, i) => usable[Math.min(usable.length - 1, Math.floor(i * step + step / 2))]);
    const permutations = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((rest) => [x, ...rest])));
    const orders = inner.length <= 6 ? permutations(inner) : [inner];
    let bestRun = null;
    for (const order of orders) {
      const placed = outerSeen.slice(), spots = [];
      let worst = Infinity;
      order.forEach((stop, i) => {
        const g = gaps[i];
        let best = null;
        for (let a = oa[g] + LAYOUT.innerClear; a <= oa[g + 1] - LAYOUT.innerClear + 1e-9; a += 0.1) {
          if (angDist(a, 180) < LAYOUT.keepOff180) continue;
          const p = at(a, rIn);
          if (placed.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < LAYOUT.minGapWide)) continue;
          const v = seen(stop, p), c = Math.min(...placed.map((q) => clearance(q.v, v)));
          if (!best || c > best.c) best = { p, v, c };
        }
        if (!best) { // nothing in the gap keeps the spacing: the midpoint, and say so
          const p = at((oa[g] + oa[g + 1]) / 2, rIn);
          best = { p, v: seen(stop, p), c: -Infinity };
          if (typeof console !== "undefined") console.warn(`layoutStops: ${d.key}: no spot for ${stop.key} keeps ${LAYOUT.minGapWide} m; placed at the gap's midpoint`);
        }
        worst = Math.min(worst, best.c);
        placed.push({ p: best.p, v: best.v }); spots.push([stop, best.p]);
      });
      if (!bestRun || worst > bestRun.worst) bestRun = { worst, spots };
    }
    for (const [stop, p] of bestRun.spots) out.set(stop.key, p);
  }
  return out;
}

// Each district's live billboard: just inside the HQ entrance, to one side, facing the middle
export function boardSpot(d) {
  if (!d.hubDir) return { x: 19, z: 4, rotY: -1.2 }; // HQ's own, hand placed
  const a = Math.atan2(d.hubDir[1], d.hubDir[0]) + (40 * Math.PI) / 180;
  const r = d.radius - 13;
  const x = d.centre[0] + Math.cos(a) * r, z = d.centre[1] + Math.sin(a) * r;
  return { x, z, rotY: Math.atan2(d.centre[0] - x, d.centre[1] - z) };
}
