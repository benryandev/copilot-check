// A track definition resolved into its centreline, arc-length lookups, gates and frame.
// Pure maths: no scene objects, no DOM.

import * as THREE from "../vendor/three.module.min.js";

// Local (x along the straight, y outward) to world [x, z], for a frame { origin: [ox, oz], angle }
export function frameToWorld(frame) {
  const [ox, oz] = frame.origin, s = Math.sin(frame.angle), c = Math.cos(frame.angle);
  const rOut = [s, -c], rAlong = [c, s];
  return (x, y) => [ox + rOut[0] * y + rAlong[0] * x, oz + rOut[1] * y + rAlong[1] * x];
}

const wrap = (v, m) => ((v % m) + m) % m;

// Is `s` (wrapped to a lap of `len`) inside [from, to]? Inclusive at both ends; from > to means the range crosses the line.
export const inStretch = (s, from, to, len) => {
  const w = wrap(s, len);
  return from <= to ? w >= from && w <= to : w >= from || w <= to;
};
// "tarmac" inside any tarmac stretch of the track's surface list, "dirt" everywhere else (and with no list)
export function surfaceAt(track, s) {
  return (track.surface ?? []).some((r) => r.kind === "tarmac" && inStretch(s, r.from, r.to, track.len)) ? "tarmac" : "dirt";
}

export function resolveTrack(def) {
  const half = def.half ?? 6;
  const toWorld = def.frame ? frameToWorld(def.frame) : (x, y) => [x, y];
  const worldPoints = def.points.map(([x, y]) => toWorld(x, y));

  // Sampling as terrain.js sampled(): closed centripetal Catmull-Rom, about 2 m apart
  const curve = new THREE.CatmullRomCurve3(worldPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal");
  const n = Math.max(160, Math.ceil(curve.getLength() / 2));
  let pts = curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
  let len = 0;
  let cum = [0];
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(len);
  }

  // Nearest of the n distinct samples (the last one repeats the first)
  const nearest = (list, [x, z]) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < list.length - 1; i++) {
      const d = (list[i][0] - x) ** 2 + (list[i][1] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  // Re-root s so the sample nearest `start` is s = 0
  let t0 = 0;
  if (def.start) {
    const k = nearest(pts, toWorld(def.start[0], def.start[1]));
    t0 = cum[k] / len;
    const distinct = pts.slice(0, -1);
    pts = [...distinct.slice(k), ...distinct.slice(0, k)];
    pts.push(pts[0]);
    cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    len = cum[cum.length - 1];
  }

  const at = (s) => {
    const u = wrap(s / len + t0, 1);
    const p = curve.getPointAt(u), f = curve.getTangentAt(u);
    return { x: p.x, z: p.z, fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
  };
  const sOf = (p) => cum[nearest(pts, p)];

  // The start line goes in first, so the stable sort keeps it ahead of any gate that also sits at s = 0
  const gateDefs = [{ s: 0, w: half + 1.5 }, ...(def.gates ?? []).map((g) => {
    const s = g.s !== undefined ? wrap(g.s, len) : wrap(sOf(toWorld(g.at[0], g.at[1])) + (g.shift || 0), len);
    return { s, w: g.half ?? half + 1.5 };
  })].sort((a, b) => a.s - b.s);
  const gates = gateDefs.map((g, i) => ({ i, s: g.s, ...at(g.s), w: g.w }));
  const checkpoints = gates.slice(1).map((g) => Math.round(g.s));

  return { ...def, half, toWorld, worldPoints, curve, pts, cum, len, at, sOf, gates, checkpoints };
}
