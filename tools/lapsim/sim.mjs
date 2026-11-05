// Lap simulator: the real stepCar on the real terrain, a pursuit controller following a lateral-offset path,
// gate timing copied from race.js raceTick. Works on any resolved Track (default: the configured one).
import { existsSync } from "node:fs";
import { trackDef, configureTerrain, onWater } from "../../ecosystem/js/terrain.js";
import { venueEntry } from "../../ecosystem/js/entries.js";
import { wallSpots, wallBoxes } from "../../ecosystem/js/walls-math.js";
import { loadStepCar } from "./car-node.mjs";
import { resolvePhysics } from "../../ecosystem/js/car-math.js";

const STEP = 0.25;
function orientedBox(cx, cz, hx, hz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const ex = Math.abs(hx * c) + Math.abs(hz * s), ez = Math.abs(hx * s) + Math.abs(hz * c);
  return { cx, cz, hx, hz, c, s, minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez };
}
const FULL = () => 1; // full throttle everywhere: every line recorded before the throttle channel (5 Nov 2026)
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
 * physics: overrides for the car's feel ({ dirt, tarmac, graze }, any subset), resolved once here and handed to every step. */
export async function makeSim({ track = trackDef(), props = "cleared", physics = {} } = {}) {
  if (!track) throw new Error("makeSim: no track (the terrain is configured without one)");
  // The floor is measured on the height field, so the terrain must be configured for this very track
  if (track !== trackDef()) throw new Error(`makeSim: the terrain is configured for ${trackDef()?.id ?? "no track"}, not ${track.id}; call configureTerrain first`);
  const { stepCar, colliders, CAR_R } = await loadStepCar();
  physics = resolvePhysics(physics); // once, so stepCar never allocates per frame
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
  const propList = props === "placed" && track.id.startsWith("realfi-") ? racewayProps(track) : []; // only the Raceway has props

  function project(x, z, hint = -1) {
    let bi = 0, bd = Infinity;
    if (hint >= 0) {
      for (let k = -120; k <= 120; k++) { const i = (hint + k + tab.length * 2) % tab.length; const d = (x - tab[i].x) ** 2 + (z - tab[i].z) ** 2; if (d < bd) { bd = d; bi = i; } }
    } else for (let i = 0; i < tab.length; i++) { const d = (x - tab[i].x) ** 2 + (z - tab[i].z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const p = tab[bi];
    return { i: bi, s: p.s, lat: (x - p.x) * p.rx + (z - p.z) * p.rz, d: Math.sqrt(bd) };
  }

  /** Run one flying lap. latFn(s) is the lateral offset (+ = right of travel) of the path at s (periodic); thrFn(s) is the
   * throttle there (on when >= 0.5; off is a lift, a coast at ROLL: there is no brake channel). Full throttle by default.
   * Starts `startBack` m before the line at `startSpeed`, pursuit steering with `look` m lookahead.
   * Returns { ms, valid, reason, path: [[t,s,lat,speed,dirt,air,boost,x,z,up]], crossings, hits, wallHits, missed };
   * wallHits counts the frames the car first meets a wall (the graze rule's hit frame), a clean lap has none. */
  function runLap(latFn, { thrFn = FULL, dt = 1 / 60, look = 9, startBack = 40, startSpeed = 24, maxT = 40, log = false, steerGain = 1 } = {}) {
    const s0 = ((LEN - startBack) % LEN + LEN) % LEN;
    const p0 = track.at(s0), l0 = latFn(s0);
    const car = fakeCar({ x: p0.x + p0.rx * l0, y: 0, z: p0.z + p0.rz * l0, heading: Math.atan2(-p0.fx, -p0.fz), speed: startSpeed, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false });
    const S = car.s;
    let clock = 0, hint = Math.round(s0 / STEP), sCar = s0;
    const lap = { running: false, start: 0, next: 1 };
    let ms = null, valid = false, reason = "";
    const crossings = [], hits = [], path = [], hitProps = new Set();
    let wallHits = 0;
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
      const px = S.x, pz = S.z, t0 = clock, wasWall = !!S.wall;
      const up = thrFn(((sCar % LEN) + LEN) % LEN) >= 0.5;
      const info = stepCar(car, { up, steer }, dt, physics);
      if (S.wall && !wasWall && lap.running) wallHits++;
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
      if (log && lap.running) path.push([Math.round((clock - lap.start) * 1000), Math.round(sCar % LEN), +pr.lat.toFixed(2), +S.speed.toFixed(2), info.dirt ? 1 : 0, S.air ? 1 : 0, +S.boost.toFixed(2), S.x, S.z, up ? 1 : 0]);
      if (valid) break;
      if (lap.running && clock - lap.start > 35) { reason = reason || "too slow"; break; }
    }
    if (!valid && !reason) reason = "no finish";
    return { ms, valid, reason, path, crossings, hits, wallHits, missed: !valid ? lap.next : 0 };
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

  /** Throttle from control values every DS metres: each value holds for DS m centred on its point (a step, not a curve). */
  function throttleFrom(thr, DS) {
    const n = thr.length;
    return (s) => thr[((Math.round(s / DS) % n) + n) % n];
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

  /** The inlet check: a straight committed approach on the centreline at exactly `speed` (the tarmac and dirt tops pinned
   * there, the throttle held, so the entry is the speed asked for) from `back` m before the ramp of water `wi`, at step dt.
   * `back` defaults to the run-up from the first walls' end (the Lagoon's hairpin exit) to the ramp's foot, so the approach
   * never starts inside a walled corner; a track without walls keeps the old 30 m.
   * Returns { speed, dt, takeoff, past, wet, boost }: past is metres from the lip to the landing along the track, wet
   * whether the landing frame is in the water. takeoff is null when the car never left the ground. */
  function inletJump(speed, { wi = 0, dt = 1 / 60, back } = {}) {
    const w = track.water?.[wi];
    if (!w) throw new Error(`inletJump: ${track.id} has no water ${wi}`);
    const ramp = (track.ramps ?? []).reduce((b, r) => (Math.abs(r.s + r.length - w.s) < Math.abs((b?.s ?? Infinity) + (b?.length ?? 0) - w.s) ? r : b), null);
    const lipS = ramp.s + ramp.length;
    back ??= Array.isArray(track.walls) && track.walls.length ? ramp.s - track.walls[0].to : 30;
    const P = resolvePhysics({ ...physics, dirt: { ...physics.dirt, top: speed }, tarmac: { ...physics.tarmac, top: speed } });
    const sStart = ramp.s - back, p0 = track.at(sStart);
    const car = fakeCar({ x: p0.x, y: 0, z: p0.z, heading: Math.atan2(-p0.fx, -p0.fz), speed, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false });
    const S = car.s, lip = track.at(lipS);
    const walls = colliders.splice(0); // a check of the flight alone: no walls on the straight approach; put back after
    try {
      let takeoff = null;
      for (let t = 0, hint = Math.round(sStart / STEP); t < 6; t += dt) {
        const pr = project(S.x, S.z, hint); hint = pr.i;
        const tp = track.at(pr.s + 9), dx = tp.x - S.x, dz = tp.z - S.z, L = Math.hypot(dx, dz);
        const err = wrap(Math.atan2(-dx, -dz) - S.heading), steer = Math.max(-1, Math.min(1, 2 * Math.max(S.speed, 1) * Math.sin(err) / Math.max(L, 1) / 2.2));
        const info = stepCar(car, { up: true, steer }, dt, P);
        if (!takeoff && S.air) takeoff = S.speed;
        if (info.event?.landed !== undefined && takeoff) {
          const past = (S.x - lip.x) * lip.fx + (S.z - lip.z) * lip.fz;
          return { speed, dt, takeoff: +takeoff.toFixed(2), past: +past.toFixed(2), wet: onWater(S.x, S.z), boost: (info.event.boost ?? 0) > 0 };
        }
      }
      return { speed, dt, takeoff: null, past: null, wet: true, boost: false };
    } finally { colliders.push(...walls); }
  }

  /** The exit check (lagoon-v2): the car on the centreline at the end of the first walls (the hairpin's exit), heading along
   * the track at `v0`, full throttle on the car's own physics, stepped to the landing or 6 s. Returns { lip, past, wet, boost }:
   * lip is the speed on the take-off frame (null when the car never left the ground), past metres from the ramp's lip to the
   * landing along the track, wet and boost as inletJump's. The ramp is the one whose lip sits nearest the inlet's near bank. */
  function exitJump(v0, { dt = 1 / 60 } = {}) {
    const w = track.water?.[0], from = track.walls?.[0]?.to;
    if (!w) throw new Error(`exitJump: ${track.id} has no inlet`);
    if (from == null) throw new Error(`exitJump: ${track.id} has no walls`);
    const ramp = (track.ramps ?? []).reduce((b, r) => (Math.abs(r.s + r.length - w.s) < Math.abs((b?.s ?? Infinity) + (b?.length ?? 0) - w.s) ? r : b), null);
    const p0 = track.at(from), lip = track.at(ramp.s + ramp.length);
    const car = fakeCar({ x: p0.x, y: 0, z: p0.z, heading: Math.atan2(-p0.fx, -p0.fz), speed: v0, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false });
    const S = car.s;
    const walls = colliders.splice(0); // as inletJump: the flight alone, the walls put back after
    try {
      let takeoff = null;
      for (let t = 0, hint = Math.round(from / STEP); t < 6; t += dt) {
        const pr = project(S.x, S.z, hint); hint = pr.i;
        const tp = track.at(pr.s + 9), dx = tp.x - S.x, dz = tp.z - S.z, L = Math.hypot(dx, dz);
        const err = wrap(Math.atan2(-dx, -dz) - S.heading), steer = Math.max(-1, Math.min(1, 2 * Math.max(S.speed, 1) * Math.sin(err) / Math.max(L, 1) / 2.2));
        const info = stepCar(car, { up: true, steer }, dt, physics);
        if (takeoff === null && S.air) takeoff = S.speed;
        if (info.event?.landed !== undefined && takeoff !== null) {
          const past = (S.x - lip.x) * lip.fx + (S.z - lip.z) * lip.fz;
          return { lip: +takeoff.toFixed(2), past: +past.toFixed(2), wet: onWater(S.x, S.z), boost: (info.event.boost ?? 0) > 0 };
        }
      }
      return { lip: takeoff === null ? null : +takeoff.toFixed(2), past: null, wet: true, boost: false };
    } finally { colliders.push(...walls); }
  }

  return { runLap, pathFrom, throttleFrom, inletJump, exitJump, ghostPath, project, track, gates, LEN, N, props: propList, colliders, physics };
}

/** The CLIs take --track <id>. "realfi" is the terrain's configured track (the hub's Raceway, id "realfi-v1"). Any other
 * name is a track module, ecosystem/tracks/<id>.js: its venue entry is built as the venue page builds it (entries.js
 * venueEntry) and the terrain is configured for it, so the floor is measured on the venue's own height field. */
export async function trackForCli(id = "realfi") {
  const t = trackDef();
  if (t && (t.id === id || t.id.startsWith(id + "-"))) return t;
  const file = new URL(`../../ecosystem/tracks/${id}.js`, import.meta.url);
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(file)) throw new Error(`unknown track "${id}" (the configured track is "${t?.id ?? "none"}" and there is no ecosystem/tracks/${id}.js)`);
  const entry = venueEntry((await import(file.href)).default, { slug: id });
  configureTerrain(entry.terrain);
  return entry.track;
}
