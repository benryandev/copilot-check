// The portal between the hub and a venue (no DOM, no three.js): where the arch's crossing line stands, whether a step of the
// car went through it the right way, the camera's flight up and away, and the hand-off record the next page reads once.
export const PORTAL_KEY = "eco-portal";
export const RISE = 60; // m the flight climbs

const ease = (t) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
const lerp = (a, b, k) => a + (b - a) * k;

/** The crossing segment across the road's end at the arch: half length = the arch's half width, f = the road's forward there. */
export function archLine(road, arch) {
  const p = road.pts;
  const [x0, z0] = p[p.length - 2], [x1, z1] = p[p.length - 1];
  const len = Math.hypot(x1 - x0, z1 - z0) || 1;
  const fx = (x1 - x0) / len, fz = (z1 - z0) / len;
  const nx = -fz, nz = fx;
  return { ax: arch.x - nx * arch.half, az: arch.z - nz * arch.half, bx: arch.x + nx * arch.half, bz: arch.z + nz * arch.half, fx, fz };
}

/** True only when prev→cur crosses the line within its length and travels forward (positive along f). */
export function crossed(prev, cur, line) {
  const dx = cur[0] - prev[0], dz = cur[1] - prev[1];
  if (dx * line.fx + dz * line.fz <= 0) return false;
  const ex = line.bx - line.ax, ez = line.bz - line.az;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-12) return false; // parallel
  const wx = line.ax - prev[0], wz = line.az - prev[1];
  const t = (wx * ez - wz * ex) / den; // along prev→cur
  const s = (wx * dz - wz * dx) / den; // along the line
  return t >= 0 && t <= 1 && s >= 0 && s <= 1;
}

/** The camera at t in 0..1 (smoothstep): the chase pose `from` { pos, look } to RISE m up over `to` { x, z } looking down the road. */
export function flightPath(t, from, to) {
  const e = ease(t);
  const lookTo = [to.x + (to.fx || 0) * 30, 0, to.z + (to.fz || 0) * 30];
  return {
    pos: [lerp(from.pos[0], to.x, e), from.pos[1] + RISE * e, lerp(from.pos[2], to.z, e)],
    look: [lerp(from.look[0], lookTo[0], e), lerp(from.look[1], lookTo[1], e), lerp(from.look[2], lookTo[2], e)],
  };
}

/** The hand-off the next page reads (Task 5c, R5/R6): the last frame's camera and look as offsets from the car ([dx, dy, dz],
 * y from the car's own height) with the car's heading, so the next page can put the same pose over its own landing spot;
 * `preview` when the departing hub page had ?venues=1, so the round trip comes back to a hub that still has the venue roads. */
export const portalRecord = ({ from, to, camOff, lookOff, heading, preview = false, now }) => ({ from, to, camOff, lookOff, heading, preview: !!preview, at: now });

/** Where the hand-off offsets are measured from (review I2): the car for a crossing (it is at the arch), but for the Map
 * view's "Drive in" the car is far away, so the arch itself (`to` { x, z, fx, fz }, `y` the ground there) with the road's
 * heading, the way a car at the arch would face (the car faces (-sin h, -cos h)). */
export function handoffBase(via, car, to, y = 0) {
  if (via !== "go" || !to || !Number.isFinite(to.fx) || !Number.isFinite(to.fz)) return { pos: [car.x, car.y, car.z], heading: car.heading };
  return { pos: [to.x, y, to.z], heading: Math.atan2(-to.fx, -to.fz) };
}

/** The landing's first camera (R5): the record's offsets turned by the change of heading (the record's heading to the
 * spot's) and applied at the spot, `y` being the car's height there. The car faces (-sin h, -cos h); turning by d about y
 * maps that to the facing at h + d. A record without usable offsets gives null (the landing then starts at the chase pose). */
export function landingStart(record, spot, y = 0) {
  const ok = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  if (!ok(record?.camOff) || !ok(record?.lookOff)) return null;
  const d = spot.heading - (Number.isFinite(record.heading) ? record.heading : spot.heading);
  const c = Math.cos(d), s = Math.sin(d);
  const at = ([dx, dy, dz]) => [spot.x + dx * c + dz * s, y + dy, spot.z - dx * s + dz * c];
  return { cam: at(record.camOff), look: at(record.lookOff) };
}

/** The record when it is for `to` and fresh, else null; the key is always removed (consumed once); garbage reads as null. */
export function readPortal(store, { to, now, maxAge = 30_000 }) {
  const raw = store.getItem(PORTAL_KEY);
  store.removeItem(PORTAL_KEY);
  if (raw == null) return null;
  let rec;
  try { rec = JSON.parse(raw); } catch { return null; }
  if (!rec || typeof rec !== "object" || rec.to !== to || typeof rec.at !== "number" || now - rec.at > maxAge) return null;
  return rec;
}

/** The crossing lines of the venue roads (Task 5a): each at its arch, `back` m short of the road's far end (build.js
 * buildVenueArch), across the arch's width (road half + 1.6 m), facing along the road; `x, z` the arch, `target` its venue.
 * Only roads of kind "venue" whose venue is in `venues` (by key; all when `venues` is omitted). No venue roads → []. */
export function portalLines(roads, venues, { back = 5 } = {}) {
  const keys = venues ? new Set(venues.map((v) => v.key)) : null;
  return roads.filter((r) => r.kind === "venue" && r.venue && (!keys || keys.has(r.venue.key))).map((r) => {
    const p = r.pts ?? r.points;
    let left = back, i = p.length - 1, x = p[i][0], z = p[i][1];
    while (i > 0) { // walk back along the polyline
      const [ax, az] = p[i - 1], seg = Math.hypot(x - ax, z - az);
      if (seg >= left) { const k = left / seg; x += (ax - x) * k; z += (az - z) * k; break; }
      left -= seg; x = ax; z = az; i--;
    }
    const half = (r.half ?? 6) + 1.6;
    return { ...archLine({ pts: p }, { x, z, half }), x, z, half, target: r.venue };
  });
}

// ── The landing (Task 5b) ──────────────────────────────────────────────
/** A venue's road back to the hub: `length` m straight out sideways from the track beside the grid (the start straight at
 * track.at(len - grid)), on the side clearer of the rest of the track. Its centreline starts `clear` m plus its own half width
 * outside the track's edge and every point stays at least track.half + clear from the track's centreline. Points, 5 of them.
 * Options for a track that says where its road leaves (its `home`, entries.js): `s` the track's s to leave square from (the
 * grid's when omitted), `side` +1 the track's right or -1 its left (the clearer side when 0), and `to` a radius from the
 * venue's origin to run out to instead of `length` (the road then ends where it crosses that circle). */
export function venueArchRoad(track, { length = 40, clear = 4, half = 3.6, grid = 14, s = null, side = 0, to = null } = {}) {
  const g = track.at(s ?? track.len - grid);
  const rx = -g.fz, rz = g.fx; // the straight's right
  const d0 = track.half + clear + half;
  // out to the circle of radius `to`: the larger root of |g + sgn r d|² = to² (r is a unit vector)
  const reach = (sgn) => { if (to == null) return length; const b = sgn * (g.x * rx + g.z * rz), c = g.x * g.x + g.z * g.z - to * to; return -b + Math.sqrt(b * b - c) - d0; };
  const line = (sgn) => { const L = reach(sgn); return [0, 0.25, 0.5, 0.75, 1].map((k) => { const d = d0 + L * k; return [g.x + sgn * rx * d, g.z + sgn * rz * d]; }); };
  if (side) return line(Math.sign(side));
  const gap = (pts) => Math.min(...pts.map(([x, z]) => Math.min(...track.pts.map(([tx, tz]) => Math.hypot(x - tx, z - tz)))));
  const [a, b] = [line(1), line(-1)];
  return gap(a) >= gap(b) ? a : b;
}

/** Where a landing puts the car, stopped: a venue on its grid facing the straight (its spawn); the hub on the venue road the
 * record came from, `past` m back toward the ring from that road's arch (18: the chase camera, 11 m behind and 6.5 m up, then sits
 * 7 m clear of the arch's beam at 6.4 m rather than inside it, Task 5 review) (`back` m short of the road's end), facing the ring.
 * `roads` are the hub's venue roads ({ venue, points }); a record from no known road lands at the spawn. */
export function landingSpot(record, entry, roads = [], { back = 5, past = 18 } = {}) {
  const spawn = { x: entry.spawn.x, z: entry.spawn.z, heading: entry.spawn.heading };
  if (entry.kind === "venue") return spawn;
  const from = record?.from;
  const road = roads.find((r) => r.kind === "venue" && r.venue && [r.venue.key, r.venue.track, r.venue.url].includes(from));
  if (!road) return spawn;
  const p = road.pts ?? road.points;
  let left = back + past, i = p.length - 1, x = p[i][0], z = p[i][1], dx = 0, dz = 0;
  while (i > 0) {
    const [ax, az] = p[i - 1], seg = Math.hypot(ax - x, az - z);
    if (seg > 0) { dx = (ax - x) / seg; dz = (az - z) / seg; } // toward the ring
    if (seg >= left) { x += dx * left; z += dz * left; left = 0; break; }
    left -= seg; x = ax; z = az; i--;
  }
  return { x, z, heading: Math.atan2(-dx, -dz) }; // the car faces (-sin h, -cos h)
}
