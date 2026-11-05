// Ground: rolling hills that flatten under plazas and roads, dirt road ribbons, and jump kickers.
// groundHeight(x, z) is the single source of truth for both the meshes and the car.

import * as THREE from "../vendor/three.module.min.js";
import { createCobbles, metreUVs } from "./cobbles.js";
import { DISTRICTS, ROADS, JUMPS, STOPS, TRACK, RIVER as HUB_RIVER, WATERS } from "./content.js";
import { tint } from "./colours.js";
import { ridgeProfile } from "./ridge-math.js";
import { KERB, kerbGaps, inGap } from "./furniture-math.js";
import { surfaceAt } from "./track-math.js";

export const ROAD_HALF = 3.6;
// Everything per world below is filled by configureTerrain(cfg), in place: other modules hold these objects from import.
export const WORLD = { cx: 0, cz: 0, radius: 0 }; // the hub: 395 (280 before the raceway went in beyond Partners)

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ── Roads as sampled polylines ─────────────────────────────────────────
// A closed road (the raceway) loops back on itself; its last sample repeats the first.
// A curve through `points`, sampled about 2 m apart, with cumulative distances
function sampled(r) {
  const curve = new THREE.CatmullRomCurve3(r.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), !!r.closed, "centripetal");
  const n = Math.max(160, Math.ceil(curve.getLength() / 2)); // about 2 m apart on long roads
  const half = r.half || ROAD_HALF;
  const pts = curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
  let len = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(len);
  }
  return { ...r, curve, pts, cum, len, half };
}
export const roads = [];

// Segments bucketed on a grid, so lookups only check nearby segments
const CELL = 12;
const cellKey = (i, j) => i * 100003 + j;
function bucket(list) {
  const grid = new Map();
  list.forEach((r, ri) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const seg = { ax, az, bx, bz, ri, cum: r.cum[i] };
      const i0 = Math.floor(Math.min(ax, bx) / CELL), i1 = Math.floor(Math.max(ax, bx) / CELL);
      const j0 = Math.floor(Math.min(az, bz) / CELL), j1 = Math.floor(Math.max(az, bz) / CELL);
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
        const k = cellKey(a, b);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(seg);
      }
    }
  });
  return grid;
}
let grid = new Map();

// Nearest point on any road within maxD: distance, road index, t (0–1), unit tangent.
// Beyond maxD, d is Infinity.
// The nearest road is the one whose EDGE is nearest, not its centreline: the flattening around a road is a function of
// (distance - half), so choosing by edge keeps the ground continuous where a wide road's blend meets a narrow one's.
// (Choosing by centreline put a 0.36 m step in the grass beside the Raceway, which the car took for a wall.)
export function roadInfo(x, z, maxD = 26) {
  let best = { d: Infinity, road: -1, t: 0, tx: 0, tz: 1, half: ROAD_HALF }, bestEdge = Infinity;
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), n = Math.ceil(maxD / CELL);
  for (let a = ci - n; a <= ci + n; a++) for (let b = cj - n; b <= cj + n; b++) {
    const list = grid.get(cellKey(a, b));
    if (!list) continue;
    for (const g of list) {
      const vx = g.bx - g.ax, vz = g.bz - g.az;
      const l2 = vx * vx + vz * vz;
      const u = Math.max(0, Math.min(1, ((x - g.ax) * vx + (z - g.az) * vz) / l2));
      const d = Math.hypot(x - (g.ax + vx * u), z - (g.az + vz * u));
      const r = roads[g.ri], edge = d - r.half;
      if (edge < bestEdge && d <= maxD) {
        const l = Math.sqrt(l2);
        bestEdge = edge;
        best = { d, road: g.ri, t: (g.cum + l * u) / r.len, tx: vx / l, tz: vz / l, half: r.half };
      }
    }
  }
  return best;
}

// ── Water ──────────────────────────────────────────────────────────────
// A list of bodies, each sampled like a road: { ...body, pts, cum, len, half, depth, level, bridges }. waterInfo gives the
// nearest body (by its edge, like roads), the distance to its centreline, how far along (s, and t as a share), the unit
// tangent and that body's half and depth, so every channel term reads the body it belongs to. A world without water has
// an empty list: waterInfo finds nothing and every water term is zero.
export const waters = [];
const NO_RIVER = { half: 0, depth: 0, level: 0, fords: [], points: [], pts: [], cum: [], len: 0 };
export let river = NO_RIVER; // waters[0], kept for water.js's callers and the tools
let waterGrid = new Map();
let waterReach = 20; // how far from a centreline any body still shapes the ground (its half + 10, at least 20)
let waterMaxHalf = 0;
export let WATER_LEVEL = 0;
export function waterInfo(x, z, maxD = 20) {
  let best = { body: -1, d: Infinity, s: 0, t: 0, tx: 0, tz: 1, half: 0, depth: 0 }, bestEdge = Infinity;
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), n = Math.ceil(maxD / CELL);
  for (let a = ci - n; a <= ci + n; a++) for (let b = cj - n; b <= cj + n; b++) {
    const list = waterGrid.get(cellKey(a, b));
    if (!list) continue;
    for (const g of list) {
      const vx = g.bx - g.ax, vz = g.bz - g.az, l2 = vx * vx + vz * vz;
      const u = Math.max(0, Math.min(1, ((x - g.ax) * vx + (z - g.az) * vz) / l2));
      const d = Math.hypot(x - (g.ax + vx * u), z - (g.az + vz * u));
      const w = waters[g.ri], edge = d - w.half;
      if (edge < bestEdge && d <= maxD) {
        const l = Math.sqrt(l2), s = g.cum + l * u;
        bestEdge = edge;
        best = { body: g.ri, d, s, t: s / w.len, tx: vx / l, tz: vz / l, half: w.half, depth: w.depth };
      }
    }
  }
  return best;
}
export const riverInfo = waterInfo;
// The channel: a parabola `depth` deep at the centre, back to ground level at `half`
const riverChannel = (d, half, depth) => (d >= half ? 0 : depth * (1 - (d / half) ** 2));
// Hills flatten towards the water like they do towards a road, and the rim opens where it leaves
const riverFlat = (d, half) => smooth(half + 2, half + 10, d);
const rimOpen = (d, half) => smooth(half + 1, half + 8, d);

// A track's inlet: a straight body across the track at `s`, from 60 m on the inside (the side of the track's right
// vector that points at the centroid of its points) to 14 m on the outside. It never bridges: the track runs through it.
function inletBody(trk, w, like) {
  const p = trk.at(w.s), pts = trk.worldPoints;
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  const sg = (cx - p.x) * p.rx + (cz - p.z) * p.rz >= 0 ? 1 : -1;
  return { points: [[p.x + p.rx * sg * 60, p.z + p.rz * sg * 60], [p.x - p.rx * sg * 14, p.z - p.rz * sg * 14]], half: w.halfW, depth: like.depth, level: like.level, flow: like.flow, bridges: false };
}

// Where roads cross a bridged body of water: one entry per crossing, with the road's heading there (local +z along the road,
// so fx = sin(yaw), fz = cos(yaw)), the crossing angle, and whether it gets a bridge or a ford.
export const DECK_Y = 0.18; // deck top
export const DECK_RAMP = 0.8; // metres of ramp past each deck end (0.18 over 0.8: slope 0.23, well under the car's climb limit)
export const crossings = [];
function findCrossings() {
  const out = [];
  waters.forEach((W, wi) => {
    if (W.bridges === false) return;
    roads.forEach((r, ri) => {
      if (ri === trackRoad) return;
      for (let i = 0; i < W.pts.length - 1; i++) for (let j = 0; j < r.pts.length - 1; j++) {
        const [ax, az] = W.pts[i], [bx, bz] = W.pts[i + 1], [cx, cz] = r.pts[j], [dx, dz] = r.pts[j + 1];
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (Math.abs(den) < 1e-9) continue;
        const u = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, v = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const tx = dx - cx, tz = dz - cz, l = Math.hypot(tx, tz), rx = bx - ax, rz = bz - az, rl = Math.hypot(rx, rz);
        const angle = (Math.acos(Math.min(1, Math.abs((tx * rx + tz * rz) / (l * rl)))) * 180) / Math.PI;
        const bridge = !W.fords.includes(r.to);
        const halfLen = (W.half + 2) / Math.sin((angle * Math.PI) / 180) + 0.5; // the deck covers the channel and both banks
        out.push({ body: wi, road: ri, x: ax + (bx - ax) * u, z: az + (bz - az) * u, yaw: Math.atan2(tx / l, tz / l), angle, bridge, half: r.half, halfLen, halfW: r.half + 0.5, s0: r.cum[j] + v * l });
      }
    });
  });
  return out;
}
// Height of a bridge deck at a point: DECK_Y on the deck, a ramp past each end, -Infinity off every bridge. The deck
// follows its road (distance along the road from the crossing, distance from the centreline), so a road that bends
// just past the river keeps the deck under it; the Chains spoke does exactly that.
export function bridgeHeight(x, z, info = roadInfo(x, z)) {
  let h = -Infinity;
  if (info.road < 0) return h;
  for (const c of crossings) {
    if (!c.bridge || c.road !== info.road || info.d > c.halfW) continue;
    const u = Math.abs(info.t * roads[c.road].len - c.s0);
    if (u > c.halfLen + DECK_RAMP) continue;
    h = Math.max(h, u <= c.halfLen ? DECK_Y : DECK_Y * (1 - (u - c.halfLen) / DECK_RAMP));
  }
  return h;
}
export const onBridge = (x, z) => bridgeHeight(x, z) > -Infinity;
export const onWater = (x, z) => {
  const w = waterInfo(x, z, waterMaxHalf);
  return w.d < w.half - 0.3 && !onBridge(x, z);
};

// ── Jumps, placed in each road's local frame ───────────────────────────
// A jump may give `s` (metres along the road) instead of `t`.
export const jumps = [];
function placeJump(jump) {
  if (jump.road == null) { // free-standing: placed by its low end and direction
    const l = Math.hypot(jump.dir[0], jump.dir[1]), fx = jump.dir[0] / l, fz = jump.dir[1] / l;
    return { ...jump, ox: jump.x, oz: jump.z, fx, fz, rx: -fz, rz: fx };
  }
  const r = roads[jump.road];
  const j = jump.s != null ? { ...jump, t: jump.s / r.len } : jump;
  const start = r.curve.getPointAt(j.t);
  const tan = r.curve.getTangentAt(j.t);
  const tx = tan.x, tz = tan.z;
  const l = Math.hypot(tx, tz);
  // Right of travel, looking down the road (heading towards -z means right is -x... use cross product)
  const rx = -tz / l, rz = tx / l;
  const off = j.side * (r.half - j.width / 2 - 0.2);
  return { ...j, ox: start.x + rx * off, oz: start.z + rz * off, fx: tx / l, fz: tz / l, rx, rz };
}

/** The jump whose footprint holds the point, or null. */
export function jumpAt(x, z) {
  for (const j of jumps) {
    const dx = x - j.ox, dz = z - j.oz;
    const u = dx * j.fx + dz * j.fz;
    const v = dx * j.rx + dz * j.rz;
    if (u >= 0 && u <= j.length && Math.abs(v) <= j.width / 2) return j;
  }
  return null;
}
function jumpHeight(x, z) {
  const j = jumpAt(x, z);
  if (!j) return 0;
  const u = (x - j.ox) * j.fx + (z - j.oz) * j.fz;
  return j.height * Math.pow(u / j.length, 1.35);
}
// Free-standing ramps stand on flattened ground (like plazas), so both lips of a pair sit at the same height
const freeJumpPads = [];
const freeJumpPad = (j) => ({ x: j.ox + j.fx * j.length / 2, z: j.oz + j.fz * j.length / 2, r: j.length / 2 + 3 });

// ── Builders' Row: shop plots along the last stretch of the road into Developers ──
// The first slot 8 m back from the road's end (so about 6 m outside the rim, whatever the plaza's radius; 3 Nov 2026,
// when Developers shrank to 42 m a fraction of the road left a 20 m gap), then alternate sides every 13 m, facing the
// road; each slot is flattened.
export const builderSlots = [];
function placeBuilderSlots(stops) {
  const r = roads.find((x) => x.kind === "spoke" && x.to === "developers");
  if (!r) return [];
  return stops.filter((s) => s.row === "builders").map((stop, i) => {
    const t = 1 - (8 + i * 13) / r.len;
    const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
    const side = i % 2 ? 1 : -1;
    const nx = -tan.z * side, nz = tan.x * side; // away from the road
    const off = ROAD_HALF + 9;
    return { key: stop.key, x: p.x + nx * off, z: p.z + nz * off, face: [p.x, p.z] };
  });
}

// ── RealFi Raceway: gates and the infield ──────────────────────────────
// The configured, resolved Track (track-math.js), or null in a world with no timed track; trackRoad is its road's index
let track = null, trackRoad = -1, trackRoadS0 = 0; // trackRoadS0: the track's s at the road's first point (0 unless `start` is elsewhere)
let hasTarmac = false; // some stretch of the track's surface list is tarmac: false on the hub, so onTarmac costs nothing there
export const trackDef = () => track;
// A point `s` metres along the track: position, unit forward and right (right of travel). No track: the origin, facing -z.
export function trackAt(s) {
  if (!track) return { x: 0, z: 0, fx: 0, fz: -1, rx: 1, rz: 0 };
  return track.at(s);
}
// The centreline polyline sampled at even spacing (s = 0 is the start line)
export let trackPts = [], trackCum = [], trackLen = 0, TRACK_HALF = 0;
// Gate 0 is the start/finish line, then each checkpoint in order. A gate is a segment across the
// track, a little wider than it, so cutting across grass beside it doesn't count. GATE_HALF is the default
// half-width; a gate's own `w` (from a per-gate `half` in the track definition) is what counts.
export let GATE_HALF = 0;
export const raceGates = [];
// Inside the raceway: on or near the track, or anywhere in its infield
let trackPoly = [];
export function inRaceway(x, z) {
  if (!track || trackRoad < 0) return false;
  let inside = false;
  for (let i = 0, j = trackPoly.length - 1; i < trackPoly.length; j = i++) {
    const [xi, zi] = trackPoly[i], [xj, zj] = trackPoly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (inside) return true;
  const info = roadInfo(x, z, 30);
  return info.road === trackRoad && info.d < 30;
}
// How much a point counts as raceway for the car's grass rule: 1 on or inside it, 0 in open country, and a
// 10 m fade past the 30 m margin so the top speed changes on a slope rather than at an invisible line.
export const RACEWAY_FADE = 10;
export function racewayWeight(x, z) {
  if (!track || trackRoad < 0) return 0;
  if (inRaceway(x, z)) return 1;
  const info = roadInfo(x, z, 30 + RACEWAY_FADE);
  if (info.road !== trackRoad) return 0;
  return Math.max(0, Math.min(1, (30 + RACEWAY_FADE - info.d) / RACEWAY_FADE));
}
// Distance to the nearest point of the track (for skipping it when far away)
export function trackDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < trackPoly.length; i += 4) best = Math.min(best, Math.hypot(x - trackPoly[i][0], z - trackPoly[i][1]));
  return best;
}
// A gentle crest along the far side of the track: metres of lift at `s` along it
// The track's first lift (the hub: { from: 330, to: 425, height: 2.2 }, over the S-bend), or none
let CREST = { height: 0 };
const crest = (s) => (s <= CREST.from || s >= CREST.to ? 0 : CREST.height * 0.5 * (1 - Math.cos(((s - CREST.from) / (CREST.to - CREST.from)) * Math.PI * 2)));
// The track road's parameter runs from its points[0]; the track's own arc length runs from its `start`.
// These two convert between them (metres, wrapped to a lap); trackRoadS0 is the offset, 0 on the hub.
const wrapLap = (s) => (s >= 0 && s < track.len ? s : ((s % track.len) + track.len) % track.len); // in range: untouched, so the hub's s stay exact
const trackS = (roadS) => wrapLap(trackRoadS0 + roadS);
const roadS = (sT) => wrapLap(sT - trackRoadS0);
function trackLift(info) {
  if (info.road !== trackRoad || trackRoad < 0 || !CREST.height) return 0;
  // The road's t runs from points[0]; the crest is placed in the track's own arc length, which starts at its `start`
  return crest(trackS(info.t * roads[trackRoad].len)) * (1 - smooth(track.half + 3, 22, info.d));
}

// ── Height field ───────────────────────────────────────────────────────
const plazas = [];
function flatMask(x, z, d, half = ROAD_HALF) {
  let m = smooth(half + 2, half + 16, d);
  for (const p of plazas) {
    const dp = Math.hypot(x - p.centre[0], z - p.centre[1]) - p.radius;
    m *= smooth(1, 14, dp);
  }
  for (const b of builderSlots) m *= smooth(7, 16, Math.hypot(x - b.x, z - b.z));
  for (const j of freeJumpPads) m *= smooth(j.r, j.r + 8, Math.hypot(x - j.x, z - j.z));
  return m;
}
function hills(x, z) {
  return (
    1.6 +
    2.0 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038) +
    1.1 * Math.sin((x + z) * 0.07) +
    0.5 * Math.sin(x * 0.13 - z * 0.11)
  );
}
function edgeRise(x, z) {
  const d = Math.hypot(x - WORLD.cx, z - WORLD.cz);
  return Math.max(0, d - (WORLD.radius - 25)) * 0.55;
}

// ── Chart Ridge ────────────────────────────────────────────────────────
// The ridge road's lift comes from the last 24 hourly closes (ridge-math.js); it is part of the one height function,
// like the Raceway's crest, so cars, ghosts and remote cars ride it for free. Flat until a series is set.
export let RIDGE_ROAD = -1;
export const RIDGE_FADE = 22; // metres from the road's edge over which the lift fades to the ground
let ridgeState = { closes: [], profile: null };
export function setRidgeSeries(closes) {
  const list = Array.isArray(closes) ? closes.map(Number).filter(Number.isFinite) : [];
  ridgeState = { closes: list, profile: list.length >= 2 && RIDGE_ROAD >= 0 ? ridgeProfile(list, roads[RIDGE_ROAD].len) : null };
}
export const ridgeSeries = () => ridgeState;
function ridgeLift(info) {
  if (info.road !== RIDGE_ROAD || !ridgeState.profile) return 0;
  return ridgeState.profile.h(info.t * roads[RIDGE_ROAD].len) * (1 - smooth(info.half + 3, info.half + RIDGE_FADE, info.d));
}
/** On the ridge road or within its fade (the band whose ground moves when a new series lands). */
export const onRidge = (x, z) => { const info = roadInfo(x, z); return info.road === RIDGE_ROAD && info.d < info.half + RIDGE_FADE; };

// ── Plaza kerb ─────────────────────────────────────────────────────────
// A 12 cm lip round each plaza's rim (furniture-math.js KERB), open where roads come in: in the height function so the
// car feels a bump leaving the cobbles (under its 25 cm allowance, never a wall). The coarse ground mesh is built
// without it (its cells are metres wide); the stone ring (furniture.js) is what you see.
const kerbGapCache = new Map();
export const kerbGapsOf = (plaza) => { let g = kerbGapCache.get(plaza.key); if (!g) { g = kerbGaps(plaza, roads); kerbGapCache.set(plaza.key, g); } return g; };
export function kerbLift(x, z, info = roadInfo(x, z)) {
  if (info.d < info.half + KERB.mouth) return 0; // on or beside a road: the mouth is open
  for (const p of plazas) {
    const dx = x - p.centre[0], dz = z - p.centre[1];
    const u = Math.abs(Math.hypot(dx, dz) - (p.radius - KERB.inset));
    if (u >= KERB.band / 2) continue;
    if (inGap(kerbGapsOf(p), Math.atan2(dz, dx))) return 0;
    return KERB.height * (1 - smooth(0, KERB.band / 2, u));
  }
  return 0;
}

export function terrainHeight(x, z, info = roadInfo(x, z), lift = true) {
  const w = waterInfo(x, z, waterReach), rd = w.d;
  return Math.max(0, hills(x, z)) * flatMask(x, z, info.d, info.half) * riverFlat(rd, w.half) + trackLift(info) + edgeRise(x, z) * rimOpen(rd, w.half) - riverChannel(rd, w.half, w.depth) + (lift ? ridgeLift(info) + kerbLift(x, z, info) : 0);
}
// The one truth for where the ground is: terrain and jumps, or a bridge deck where one spans the river
export function groundHeight(x, z) {
  const info = roadInfo(x, z);
  return Math.max(terrainHeight(x, z, info) + jumpHeight(x, z), bridgeHeight(x, z, info));
}
// Grass grows where the ground isn't road, plaza or river
export function grassWeight(x, z) {
  const info = roadInfo(x, z);
  const w = waterInfo(x, z, 8);
  return flatMask(x, z, info.d, info.half) * smooth(w.half + 0.5, w.half + 3, w.d);
}
export const onDirt = (x, z) => { const info = roadInfo(x, z); return info.d < info.half + 0.3 || jumpHeight(x, z) > 0; };
// Is the point on the track's own road, on a tarmac stretch of its surface list? (False on a track with none, as the hub's.)
export function onTarmac(x, z) {
  if (!hasTarmac || trackRoad < 0) return false;
  const info = roadInfo(x, z);
  if (info.road !== trackRoad || info.d >= info.half + 0.3) return false;
  return surfaceAt(track, trackS(info.t * roads[trackRoad].len)) === "tarmac";
}
// The tarmac stretches in the track road's own arc length (what the road mesh is built in), sorted by `from`;
// a stretch that crosses the road's start is split in two.
export function surfaceStretches() {
  if (!track) return [];
  const out = [];
  for (const r of track.surface ?? []) {
    if (r.kind !== "tarmac") continue;
    // The span is kept in track metres so a stretch that wraps in the track's s, or only in the road's s, splits correctly
    const span = r.from <= r.to ? r.to - r.from : track.len - r.from + r.to, from = roadS(r.from), end = from + span;
    if (end <= track.len) out.push({ from, to: end, kind: r.kind });
    else out.push({ from: 0, to: end - track.len, kind: r.kind }, { from, to: track.len, kind: r.kind });
  }
  return out.sort((a, b) => a.from - b.from);
}

// ── Meshes ─────────────────────────────────────────────────────────────
// The grass's 0..1 colour variation at a point (the ground mesh and the riverbed patch share it)
export const groundShade = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.13);
/** What the coarse ground mesh writes at a vertex. Along the river it sits 15 cm under the analytic surface (the fine
 * riverbed patch draws the channel; this keeps the mesh from poking through between vertices). Under the ridge it is
 * built without the lift and 30 cm low: the fine ridge patch (ridge.js) draws the surface there and is rebuilt when a
 * new series lands, which this mesh never is. */
export function groundVertexHeight(x, z) {
  const info = roadInfo(x, z);
  if (info.road === RIDGE_ROAD && info.d < info.half + RIDGE_FADE && info.t > 0 && info.t < 1) return terrainHeight(x, z, info, false) - 0.3; // along the road only: past its ends roadInfo clamps t and the patch stops
  const w = waterInfo(x, z, waterReach), nearRiver = w.d < w.half + 3;
  return terrainHeight(x, z, info) - kerbLift(x, z, info) - (nearRiver ? 0.15 : 0); // no kerb in the coarse mesh: its cells are metres wide and would alias the lip
}
export function buildGround(segments, palette) {
  const size = WORLD.radius * 2 + 40;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD.cx, 0, WORLD.cz);
  const pos = geo.attributes.position;
  const shade = new Float32Array(pos.count); // 0..1 variation, coloured per theme
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // Along the river the coarse mesh sits 15 cm under the analytic surface: the fine riverbed patch (water.js) draws
    // the channel there, and this keeps the mesh from poking through it between vertices
    pos.setY(i, groundVertexHeight(x, z));
    shade[i] = groundShade(x, z);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.recolour = (p) => {
    const a = new THREE.Color(p.grassA), b = new THREE.Color(p.grassB), c = new THREE.Color();
    const col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      c.copy(a).lerp(b, shade[i]);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  };
  mesh.userData.recolour(palette);
  return mesh;
}

// Dirt texture: speckles, two wheel ruts, soft worn edges
function dirtTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const u = x / (c.width - 1);
      const edge = Math.min(1, Math.min(u, 1 - u) * 7);
      const rut = Math.exp(-((u - 0.3) ** 2) / 0.002) + Math.exp(-((u - 0.7) ** 2) / 0.002);
      const n = Math.random();
      const v = 200 + n * 40 - rut * 30;
      const i = (y * c.width + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v * 0.86;
      img.data[i + 2] = v * 0.68;
      // ragged edge
      img.data[i + 3] = 255 * Math.min(1, edge * (0.75 + n * 0.5));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** One road's ribbon geometry, sat on the ground. `colourAt(s)` (metres along the road → [r, g, b]) adds a vertex
 * colour per sample pair, for a road whose dirt is tinted along its length (the ridge). */
export function roadRibbon(r, colourAt = null) {
  {
    const n = r.pts.length;
    const cols = colourAt ? new Float32Array(n * 2 * 3) : null;
    const verts = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const idx = [];
    const w = r.half + 0.6;
    for (let i = 0; i < n; i++) {
      const [x, z] = r.pts[i];
      // A closed road's ends meet, so its neighbours wrap round (the last sample repeats the first)
      const [ax, az] = r.pts[i > 0 ? i - 1 : r.closed ? n - 2 : 0];
      const [bx, bz] = r.pts[i < n - 1 ? i + 1 : r.closed ? 1 : n - 1];
      const tx = bx - ax, tz = bz - az, l = Math.hypot(tx, tz);
      const nx = -tz / l, nz = tx / l;
      // Roads sit on the ground: flat almost everywhere, over the raceway's crest where it rises
      const lx = x + nx * w, lz = z + nz * w, qx = x - nx * w, qz = z - nz * w;
      verts.set([lx, terrainHeight(lx, lz) + 0.14, lz, qx, terrainHeight(qx, qz) + 0.14, qz], i * 6);
      const v = r.cum[i] / 8;
      uvs.set([0, v, 1, v], i * 4);
      if (cols) { const c = colourAt(r.cum[i]); cols.set([c[0], c[1], c[2], c[0], c[1], c[2]], i * 6); }
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    if (cols) geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
}
export function dirtMaterial(extra = {}) {
  return new THREE.MeshLambertMaterial({ map: dirtTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, ...extra });
}

export function buildRoads(palette) {
  const mat = dirtMaterial();
  const group = new THREE.Group();
  for (const r of roads) {
    if (r.kind === "ridge") continue; // the ridge draws its own ribbon, tinted per candle (ridge.js)
    const geo = roadRibbon(r);
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    group.add(m);
  }
  // Tarmac stretches on the track road: a dark ribbon and two edge lines. Nothing is made where there are none (the hub).
  const tarmacMats = [];
  const stretches = surfaceStretches();
  if (stretches.length && trackRoad >= 0) {
    const road = roads[trackRoad];
    const mk = (factor, order) => {
      const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: factor });
      m.userData.order = order; tarmacMats.push(m); return m;
    };
    const ribbonMat = mk(-3, 2), lineMat = mk(-4, 3);
    ribbonMat.userData.key = "tarmac"; lineMat.userData.key = "tarmacLine";
    for (const st of stretches) {
      const sub = sliceRoad(road, st.from, st.to);
      if (sub.pts.length < 2) continue;
      const parts = [[sub, ribbonMat, 2], [offsetRoad(sub, road.half + 0.15), lineMat, 3], [offsetRoad(sub, -(road.half + 0.15)), lineMat, 3]];
      for (const [r, m, order] of parts) {
        const mesh = new THREE.Mesh(roadRibbon(r), m);
        mesh.receiveShadow = true;
        mesh.renderOrder = order;
        group.add(mesh);
      }
    }
  }
  group.userData.recolour = (p) => { mat.color.set(p.dirt); for (const m of tarmacMats) m.color.set(p[m.userData.key]); };
  group.userData.recolour(palette);
  return group;
}

// The part of a road between two arc lengths, as a road of its own (end points interpolated)
function sliceRoad(r, from, to) {
  const pts = [], cum = [];
  const at = (i, s) => { const k = (s - r.cum[i]) / (r.cum[i + 1] - r.cum[i] || 1); return [r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * k, r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * k]; };
  for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.cum[i], b = r.cum[i + 1];
    if (b <= from || a >= to) continue;
    if (!pts.length) { pts.push(at(i, Math.max(a, from))); cum.push(Math.max(a, from)); }
    if (b < to) { pts.push(r.pts[i + 1]); cum.push(b); } else { pts.push(at(i, to)); cum.push(to); }
  }
  return { pts, cum, half: r.half, closed: false };
}
// A road's samples shifted sideways by `d` metres (left of travel positive), as a 0.3 m line
function offsetRoad(r, d) {
  const n = r.pts.length;
  const pts = r.pts.map(([x, z], i) => {
    const [ax, az] = r.pts[Math.max(0, i - 1)], [bx, bz] = r.pts[Math.min(n - 1, i + 1)];
    const tx = bx - ax, tz = bz - az, l = Math.hypot(tx, tz) || 1;
    return [x - (tz / l) * d, z + (tx / l) * d];
  });
  return { pts, cum: r.cum, half: -0.45, closed: false };
}

// Kicker: sampled from jumpHeight so the mesh matches the physics exactly
export function buildJumps(palette) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial();
  const side = new THREE.MeshLambertMaterial();
  for (const j of jumps) {
    const steps = 16;
    const pos = [];
    const P = (u, v, y) => {
      const x = j.ox + j.fx * u + j.rx * v, z = j.oz + j.fz * u + j.rz * v;
      return [x, y + terrainHeight(x, z), z];
    };
    const hw = j.width / 2;
    const top = [];
    for (let s = 0; s <= steps; s++) {
      const u = (s / steps) * j.length;
      const y = j.height * Math.pow(u / j.length, 1.35) + 0.16;
      top.push([u, y]);
    }
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let s = 0; s < steps; s++) {
      const [u0, y0] = top[s], [u1, y1] = top[s + 1];
      // top surface
      tri(P(u0, -hw, y0), P(u1, -hw, y1), P(u1, hw, y1));
      tri(P(u0, -hw, y0), P(u1, hw, y1), P(u0, hw, y0));
    }
    const sidePos = [];
    const stri = (a, b, c) => sidePos.push(...a, ...b, ...c);
    for (let s = 0; s < steps; s++) {
      const [u0, y0] = top[s], [u1, y1] = top[s + 1];
      for (const v of [-hw, hw]) {
        stri(P(u0, v, 0), P(u1, v, 0), P(u1, v, y1));
        stri(P(u0, v, 0), P(u1, v, y1), P(u0, v, y0));
      }
    }
    // back face
    const L = j.length, H = j.height + 0.16;
    stri(P(L, -hw, 0), P(L, hw, 0), P(L, hw, H));
    stri(P(L, -hw, 0), P(L, hw, H), P(L, -hw, H));
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g1.computeVertexNormals();
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute("position", new THREE.Float32BufferAttribute(sidePos, 3));
    g2.computeVertexNormals();
    const m1 = new THREE.Mesh(g1, mat);
    const m2 = new THREE.Mesh(g2, side);
    m1.material.side = THREE.DoubleSide;
    m2.material.side = THREE.DoubleSide;
    for (const m of [m1, m2]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }
  group.userData.recolour = (p) => { mat.color.set(p.dirtTop); side.color.set(p.dirtSide); };
  group.userData.recolour(palette);
  return group;
}

export function buildPlazas(palette) {
  const group = new THREE.Group();
  // Cobbled: one seamless sett tile repeated in world metres, with a relief map so the sun picks out the joints
  const cobbles = createCobbles(palette);
  const mat = new THREE.MeshStandardMaterial({ map: cobbles.map, bumpMap: cobbles.bump, bumpScale: 0.06, roughness: 0.95, metalness: 0 });
  for (const d of plazas) {
    const geo = new THREE.CircleGeometry(d.radius, 72);
    metreUVs(geo);
    const disc = new THREE.Mesh(geo, mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(d.centre[0], 0.08, d.centre[1]);
    disc.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(d.radius - 0.5, d.radius, 96),
      new THREE.MeshBasicMaterial({ color: tint(d.colour) }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(d.centre[0], 0.12, d.centre[1]);
    ring.userData.colour = d.colour;
    group.add(disc, ring);
  }
  group.userData.recolour = (p) => {
    cobbles.repaint(p);
    group.children.forEach((c) => c.userData.colour && c.material.color.set(tint(c.userData.colour)));
  };
  group.userData.recolour(palette);
  return group;
}

// ── Configuration ──────────────────────────────────────────────────────
// cfg = { world: { cx, cz, radius }, roads, jumps, waters: [river-shaped bodies], track: resolved Track | null, districts, stops }.
// Rebuilds every per-world value in place: objects and arrays keep their identity (importers hold them), scalars read
// by name are reassigned, and the caches are rebuilt or cleared so the old world never answers.
let config = null;
export const terrainConfig = () => config;
// The configured world's districts and stops, read at call time (a venue has none; the hub has content.js's)
export const districts = () => config.districts ?? {};
export const stops = () => config.stops ?? [];
export function configureTerrain(cfg) {
  config = cfg;
  Object.assign(WORLD, cfg.world);
  roads.splice(0, roads.length, ...cfg.roads.map(sampled));
  grid = bucket(roads);
  trackRoad = roads.findIndex((r) => r.kind === "track");
  RIDGE_ROAD = roads.findIndex((r) => r.kind === "ridge");

  const bodies = (cfg.waters || []).filter((b) => b.points?.length >= 2);
  const inlets = (cfg.track?.water || []).map((w) => inletBody(cfg.track, w, HUB_RIVER)); // an inlet is cut and levelled like the hub river
  waters.splice(0, waters.length, ...[...bodies, ...inlets].map((b) => ({ fords: [], bridges: true, ...sampled(b) })));
  river = waters[0] ?? NO_RIVER;
  waterGrid = bucket(waters);
  waterMaxHalf = waters.reduce((m, w) => Math.max(m, w.half), 0);
  waterReach = Math.max(20, waterMaxHalf + 10);
  WATER_LEVEL = waters[0]?.level ?? 0;
  crossings.splice(0, crossings.length, ...findCrossings());

  track = cfg.track ?? null;
  hasTarmac = !!track?.surface?.some((r) => r.kind === "tarmac");
  trackRoadS0 = track && trackRoad >= 0 ? track.sOf(roads[trackRoad].pts[0]) : 0;
  // The track's ramps are given in track s; placeJump measures road s from points[0]
  const ramps = track && trackRoad >= 0 ? (track.ramps || []).map(({ s, side, length, height, width }) => ({ road: trackRoad, s: roadS(s), side, length, height, width })) : [];
  jumps.splice(0, jumps.length, ...[...(cfg.jumps || []), ...ramps].map(placeJump));
  freeJumpPads.splice(0, freeJumpPads.length, ...jumps.filter((j) => j.road == null).map(freeJumpPad));
  builderSlots.splice(0, builderSlots.length, ...placeBuilderSlots(cfg.stops || []));
  plazas.splice(0, plazas.length, ...Object.values(cfg.districts || {}).filter((d) => d.plaza !== false));

  trackPts = track ? track.pts : [];
  trackCum = track ? track.cum : [];
  trackLen = track ? track.len : 0;
  TRACK_HALF = track ? track.half : 0;
  GATE_HALF = track ? track.half + 1.5 : 0;
  trackPoly = trackPts;
  // Each gate keeps its own half-width (a per-gate `half` in the definition); s is rounded as track.checkpoints has it
  raceGates.splice(0, raceGates.length, ...(track ? track.gates.map((g) => { const s = Math.round(g.s); return { i: g.i, s, ...trackAt(s), w: g.w }; }) : []));
  if (track && trackRoad >= 0) {
    const drift = Math.abs(roads[trackRoad].len - track.len);
    if (drift > 0.5) console.warn(`[eco] raceway: the road is ${roads[trackRoad].len.toFixed(1)} m but the track's lap is ${track.len.toFixed(1)} m`);
  }
  CREST = track?.lifts?.[0] ?? { height: 0 };

  kerbGapCache.clear();
  setRidgeSeries(ridgeState.closes); // the profile is scaled to the ridge road's length
}
// The hub, from content.js
const hubConfig = () => ({ world: { cx: 0, cz: 0, radius: 395 }, roads: ROADS, jumps: JUMPS, waters: WATERS, track: TRACK, districts: DISTRICTS, stops: STOPS });
configureTerrain(hubConfig());
