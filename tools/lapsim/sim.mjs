// Lap simulator: the real stepCar on the real terrain, a pursuit controller following a lateral-offset path,
// gate timing copied from race.js raceTick. Works on any resolved Track (default: the configured one).
import { trackDef } from "../../ecosystem/js/terrain.js";
import { wallSpots, wallBoxes } from "../../ecosystem/js/walls-math.js";
import { loadStepCar } from "./car-node.mjs";

const STEP = 0.25;
function orientedBox(cx, cz, hx, hz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const ex = Math.abs(hx * c) + Math.abs(hz * s), ez = Math.abs(hx * s) + Math.abs(hz * c);
  return { cx, cz, hx, hz, c, s, minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez };
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fakeCar = (s) => ({ s, group: { position: { set() {} }, rotation: {} }, tilt: { rotation: {}, scale: { set() {} } }, wheels: [] });

// Soft props (knockable): crates r 0.8, cones r 0.4, bales r 0.7; hit when d < CAR_R + r, speed x 0.92, airHit.
// This is the Raceway's list (raceway.js): crate stacks at the line and the chicane, cones before them, bales at the hairpins.
function racewayProps(track) {
  const props = [];
  const at = (kind, s, v, r) => { const p = track.at(s); props.push({ kind, s, v, r, x: p.x + p.rx * v, z: p.z + p.rz * v }); };
  const stack = (s, v) => { for (const k of [-0.65, 0, 0.65]) at("crate", s, v + k, 0.8); };
  for (const v of [-(track.half + 4), track.half + 4]) stack(8, v);
  [[352, -3.2], [374, 3.2], [396, -3.2]].forEach(([s, v]) => { stack(s, v); for (const k of [6, 10]) at("cone", s - k, v * 1.25, 0.4); });
  for (const s of [205, 213, 221, 544, 552, 560]) {
    const a = track.at(s - 4), b = track.at(s + 4), p = track.at(s);
    const inner = (b.fx - a.fx) * p.rx + (b.fz - a.fz) * p.rz > 0 ? 1 : -1;
    at("bale", s, inner * (track.half + 1.6), 0.7);
  }
  return props;
}

/** props: "cleared" (none, the floor's convention) or "placed" (the Raceway's bales, crates and cones).
 * physics: reserved for per-track overrides (plan 2); handed to nothing here. */
export async function makeSim({ track = trackDef(), props = "cleared", physics = {} } = {}) {
  if (!track) throw new Error("makeSim: no track (the terrain is configured without one)");
  const { stepCar, colliders, CAR_R } = await loadStepCar();
  const LEN = track.len, half = track.half;
  // As terrain.js builds raceGates: each gate at its rounded s, with its own half-width
  const gates = track.gates.map((g) => { const s = Math.round(g.s); return { i: g.i, s, ...track.at(s), w: g.w }; });
  const N = track.checkpoints.length;
  const tab = [];
  for (let s = 0; s < LEN; s += STEP) tab.push({ s, ...track.at(s) });

  colliders.length = 0;
  for (const b of wallBoxes(wallSpots(track))) colliders.push(orientedBox(b.cx, b.cz, b.hx, b.hz, b.yaw));
  { // gantry posts at the start line, 1.2 m square
    const g0 = gates[0], gh = half + 2.2, yaw = Math.atan2(-g0.fx, -g0.fz);
    for (const v of [-gh, gh]) colliders.push(orientedBox(g0.x + g0.rx * v, g0.z + g0.rz * v, 0.6, 0.6, yaw));
  }
  const propList = props === "placed" ? racewayProps(track) : [];

  function project(x, z, hint = -1) {
    let bi = 0, bd = Infinity;
    if (hint >= 0) {
      for (let k = -120; k <= 120; k++) { const i = (hint + k + tab.length * 2) % tab.length; const d = (x - tab[i].x) ** 2 + (z - tab[i].z) ** 2; if (d < bd) { bd = d; bi = i; } }
    } else for (let i = 0; i < tab.length; i++) { const d = (x - tab[i].x) ** 2 + (z - tab[i].z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const p = tab[bi];
    return { i: bi, s: p.s, lat: (x - p.x) * p.rx + (z - p.z) * p.rz, d: Math.sqrt(bd) };
  }

  /** Run one flying lap. latFn(s) is the lateral offset (+ = right of travel) of the path at s (periodic).
   * Starts `startBack` m before the line at `startSpeed`, full throttle, pursuit steering with `look` m lookahead.
   * Returns { ms, valid, reason, path: [[t,s,lat,speed,dirt,air,boost,x,z]], crossings, hits, missed } */
  function runLap(latFn, { dt = 1 / 60, look = 9, startBack = 40, startSpeed = 24, maxT = 40, log = false, steerGain = 1 } = {}) {
    const s0 = ((LEN - startBack) % LEN + LEN) % LEN;
    const p0 = track.at(s0), l0 = latFn(s0);
    const car = fakeCar({ x: p0.x + p0.rx * l0, y: 0, z: p0.z + p0.rz * l0, heading: Math.atan2(-p0.fx, -p0.fz), speed: startSpeed, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false });
    const S = car.s;
    let clock = 0, hint = Math.round(s0 / STEP), sCar = s0;
    const lap = { running: false, start: 0, next: 1 };
    let ms = null, valid = false, reason = "";
    const crossings = [], hits = [], path = [], hitProps = new Set();
    while (clock < maxT) {
      const pr = project(S.x, S.z, hint); hint = pr.i;
      let ds = pr.s - (sCar % LEN); if (ds < -LEN / 2) ds += LEN; if (ds > LEN / 2) ds -= LEN; sCar += ds;
      const st = sCar + Math.max(5, look * Math.max(0.6, S.speed / 24));
      const tp = track.at(st), tl = latFn(((st % LEN) + LEN) % LEN);
      const tx = tp.x + tp.rx * tl, tz = tp.z + tp.rz * tl;
      const dx = tx - S.x, dz = tz - S.z, L = Math.hypot(dx, dz);
      const hd = Math.atan2(-dx, -dz), err = wrap(hd - S.heading);
      const omega = 2 * Math.max(S.speed, 1) * Math.sin(err) / Math.max(L, 1); // pure pursuit
      const steer = Math.max(-1, Math.min(1, steerGain * omega / 2.2));
      const px = S.x, pz = S.z, t0 = clock;
      const info = stepCar(car, { up: true, steer }, dt, physics);
      clock += dt;
      for (const q of propList) {
        if (hitProps.has(q)) continue;
        const d = Math.hypot(q.x - S.x, q.z - S.z);
        if (d < CAR_R + q.r && S.y < 1.2 + 0.6) { hitProps.add(q); S.speed *= 0.92; if (S.air) S.airHit = true; hits.push({ t: clock, kind: q.kind, s: q.s }); }
      }
      if (px !== S.x || pz !== S.z) { // gates (raceTick verbatim)
        for (const g of gates) {
          const a = (px - g.x) * g.fx + (pz - g.z) * g.fz, b = (S.x - g.x) * g.fx + (S.z - g.z) * g.fz;
          if (a < 0 === b < 0) continue;
          const u = a / (a - b);
          const mx = px + (S.x - px) * u, mz = pz + (S.z - pz) * u;
          if (Math.abs((mx - g.x) * g.rx + (mz - g.z) * g.rz) > g.w) continue;
          const fwd = b > a, t = t0 + dt * u;
          crossings.push({ i: g.i, fwd, t, lat: (mx - g.x) * g.rx + (mz - g.z) * g.rz });
          if (g.i === 0) {
            if (!fwd) { reason = "start backwards"; lap.running = false; }
            else if (lap.running && lap.next > N) { ms = Math.round((t - lap.start) * 1000); valid = true; }
            else if (lap.running) { reason = `missed checkpoint ${lap.next}`; }
            if (!valid) { lap.running = true; lap.start = t; lap.next = 1; }
          } else if (lap.running && fwd && g.i === lap.next) lap.next++;
          else if (lap.running && !fwd && g.i === lap.next - 1) lap.next--;
        }
      }
      if (log && lap.running) path.push([Math.round((clock - lap.start) * 1000), Math.round(sCar % LEN), +pr.lat.toFixed(2), +S.speed.toFixed(2), info.dirt ? 1 : 0, S.air ? 1 : 0, +S.boost.toFixed(2), S.x, S.z]);
      if (valid) break;
      if (lap.running && clock - lap.start > 35) { reason = reason || "too slow"; break; }
    }
    if (!valid && !reason) reason = "no finish";
    return { ms, valid, reason, path, crossings, hits, missed: !valid ? lap.next : 0 };
  }

  /** Periodic lateral profile from control points every DS metres (Catmull-Rom). */
  function pathFrom(ctrl, DS) {
    const n = ctrl.length;
    return (s) => {
      const u = (((s / DS) % n) + n) % n, i = Math.floor(u), f = u - i;
      const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i % n], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    };
  }

  /** A recorded lap's lateral profile vs s, as a lookup. trace: [[t, x, z], ...]. */
  function ghostPath(trace) {
    const pts = trace.map(([, x, z]) => { const p = project(x, z); return [p.s, p.lat]; }).sort((a, b) => a[0] - b[0]);
    return (s) => {
      s = ((s % LEN) + LEN) % LEN;
      let i = 0; while (i < pts.length - 1 && pts[i + 1][0] < s) i++;
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const span = ((b[0] - a[0]) + LEN) % LEN || 1, f = Math.max(0, Math.min(1, (((s - a[0]) + LEN) % LEN) / span));
      return a[1] + (b[1] - a[1]) * f;
    };
  }

  return { runLap, pathFrom, ghostPath, project, track, gates, LEN, N, props: propList, colliders, physics };
}

/** The CLIs take --track <id>. Only the configured track (the hub's Raceway, id "realfi-v1", named "realfi" here) is available until the terrain can be re-configured per track. */
export function trackForCli(id = "realfi") {
  const t = trackDef();
  if (!t || !(t.id === id || t.id.startsWith(id + "-"))) throw new Error(`unknown track "${id}" (the configured track is "${t?.id ?? "none"}")`);
  return t;
}
