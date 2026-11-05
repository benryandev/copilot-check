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

/** The hand-off the next page reads. */
export const portalRecord = ({ from, to, cam, look, heading, now }) => ({ from, to, cam, look, heading, at: now });

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
