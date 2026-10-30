// The world's layout: districts on a ring around Strike HQ, dirt roads (a spoke from HQ to each
// district and a ring road between neighbours), jumps and the spawn. Colours follow the community
// ecosystem map. Sheet text lives in stops.js.

import { STOPS } from "./stops.js";
export { STOPS };

const RING = 165; // distance from HQ to each district's centre

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

export const DISTRICTS = {
  hub: { key: "hub", name: "Strike HQ", colour: 0x22c55e, centre: [0, 0], radius: 24, board: ["users", "totalVolume", "volume24h", "markets"], ring: -1 },
};
ORDER.forEach(([key, name, colour, board], i) => {
  const a = (i / ORDER.length) * Math.PI * 2;
  DISTRICTS[key] = { key, name, colour, board, ring: i, angle: a, centre: [Math.sin(a) * RING, -Math.cos(a) * RING], radius: 46 };
});
export const RING_KEYS = ORDER.map((o) => o[0]);

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
  ROADS.push({
    kind: "spoke", from: "hub", to: key,
    points: [at(20, 0), at(40, 6 * wig), at(70, -7 * wig), at(100, 5 * wig), at(end - 8, wig), at(end, 0)],
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

// Jumps: a kicker on one half of a spoke, so the other half is always a flat way past.
// `t` is how far along the road (0–1), `side` +1 right / −1 left of the direction of travel.
const spoke = (key) => ROADS.findIndex((r) => r.kind === "spoke" && r.to === key);
export const JUMPS = [
  { road: spoke("perps"), t: 0.42, side: 1, length: 8, height: 1.9, width: 3.4 },
  { road: spoke("collateral"), t: 0.5, side: -1, length: 8, height: 1.9, width: 3.4 },
  { road: spoke("developers"), t: 0.45, side: 1, length: 10, height: 2.4, width: 3.4 },
  { road: spoke("community"), t: 0.5, side: -1, length: 8, height: 1.9, width: 3.4 },
  { road: spoke("token"), t: 0.45, side: 1, length: 7, height: 1.5, width: 3.4 },
];

export const SPAWN = { x: 0, z: 14, heading: 0 };

// ── Stop layout ────────────────────────────────────────────────────────
// Stops without a fixed `pos` go round the far side of their district in two rows, which keeps
// the HQ entrance and both ring-road entrances clear.
export function layoutStops() {
  const out = new Map();
  for (const d of Object.values(DISTRICTS)) {
    if (!d.hubDir) continue;
    const stops = STOPS.filter((s) => s.district === d.key && !s.pos);
    if (!stops.length) continue;
    const base = Math.atan2(d.hubDir[1], d.hubDir[0]); // pointing at HQ
    const outer = Math.ceil(stops.length * 0.6);
    const rows = [
      { n: outer, r: d.radius - 11, from: 105, to: 255 },
      { n: stops.length - outer, r: d.radius - 27, from: 130, to: 230 },
    ];
    let k = 0;
    for (const row of rows) {
      for (let j = 0; j < row.n; j++) {
        const f = row.n === 1 ? 0.5 : j / (row.n - 1);
        const a = base + ((row.from + (row.to - row.from) * f) * Math.PI) / 180;
        out.set(stops[k++].key, [d.centre[0] + Math.cos(a) * row.r, d.centre[1] + Math.sin(a) * row.r]);
      }
    }
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
