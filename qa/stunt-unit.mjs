// The epic jump over the river and its side-on camera: node --test qa/stunt-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { jumps, jumpAt, riverInfo, groundHeight, terrainHeight, onWater } from '../ecosystem/js/terrain.js';
import { GRAVITY } from '../ecosystem/js/car-math.js';
import { stuntBlend, stuntCamera, stuntTakeoff, stuntEase, STUNT_IN, STUNT_OUT, STUNT_BACK, STUNT_UP } from '../ecosystem/js/stunt-math.js';

const stunt = () => jumps.filter((j) => j.stunt);
const lip = (j) => ({ x: j.ox + j.fx * j.length, z: j.oz + j.fz * j.length });

test('the river jump: two ramps face each other across the straight stretch, lips dry and 6 m off the water, same height', () => {
  const [a, b] = stunt();
  assert.ok(a && b && stunt().length === 2, 'two stunt ramps');
  assert.ok(Math.abs(a.fx + b.fx) < 0.01 && Math.abs(a.fz + b.fz) < 0.01, 'they face each other');
  for (const j of [a, b]) {
    const l = lip(j), base = { x: j.ox, z: j.oz };
    assert.ok(riverInfo(l.x, l.z).d >= 5.0 && riverInfo(l.x, l.z).d <= 6.0, `${j.fx < 0 ? 'east' : 'west'} lip ${riverInfo(l.x, l.z).d.toFixed(1)} m from the water centreline (1.5 to 2.5 m of bank)`);
    assert.ok(!onWater(l.x, l.z) && !onWater(base.x, base.z), 'lip and base are dry');
    assert.ok(groundHeight(base.x - j.fx, base.z - j.fz) >= -0.01, 'the run-up is dry ground');
    assert.ok(jumpAt(l.x - j.fx * 0.5, l.z - j.fz * 0.5)?.stunt, 'jumpAt finds the ramp just behind its lip');
  }
  const gap = Math.hypot(lip(a).x - lip(b).x, lip(a).z - lip(b).z);
  assert.ok(gap > 10 && gap < 12, `lip to lip ${gap.toFixed(1)} m`);
  const ya = terrainHeight(lip(a).x, lip(a).z), yb = terrainHeight(lip(b).x, lip(b).z);
  assert.ok(Math.abs(ya - yb) < 0.1, `the ground under the lips matches (${ya.toFixed(2)} vs ${yb.toFixed(2)}): the footprints are flattened`);
  assert.equal(a.height, b.height); assert.equal(a.length, b.length);
});

// The car's flight, stepped the way car.js steps it (60 Hz, take-off with the previous frame's vertical speed, gravity
// from car-math, a landing when the car comes down onto the ground). Ground along the line: this ramp, the channel, the
// far ramp. Both lips are at the same height (flattened pads), so heights are relative to that.
function flight(j, far, v) {
  const dt = 1 / 60, G = GRAVITY, gap = Math.hypot(lip(j).x - lip(far).x, lip(j).z - lip(far).z);
  const groundAt = (u) => { // u from this ramp's lip, positive towards the far ramp
    if (u <= 0) { const uu = j.length + u; return uu < 0 ? 0 : j.height * Math.pow(uu / j.length, 1.35); }
    if (u >= gap) { const w = u - gap; return w > far.length ? 0 : far.height * Math.pow((far.length - w) / far.length, 1.35); }
    return -0.45; // the channel
  };
  let u = -j.length - 2, y = 0, vy = 0, air = false, clearance = null;
  for (let i = 0; i < 900; i++) {
    u += v * dt;
    const g = groundAt(u);
    if (air) {
      vy -= G * dt; y += vy * dt;
      if (clearance == null && u >= gap) clearance = y - far.height; // how far over (or under) the far lip it arrives
      if (y <= g) {
        if (u >= gap && g - y > 0.35) return { gap, clearance, face: true, landU: u - gap };
        return { gap, clearance, face: false, landU: u - gap, onRamp: u >= gap && u - gap <= far.length, inWater: u > 0 && u < gap };
      }
    } else if (y - g > G * dt * dt * 2 && vy > 2) { air = true; y += vy * dt; }
    else { vy = (g - y) / dt; y = g; }
  }
  return { gap, clearance, face: false, landU: null };
}

test('flat out clears the far lip with margin and lands on the far ramp (a boost); a slow approach does not make it', () => {
  const [a, b] = stunt();
  for (const [j, far] of [[a, b], [b, a]]) {
    const fast = flight(j, far, 24);
    assert.ok(fast.clearance > 0.5, `24 m/s clears the far lip by ${fast.clearance?.toFixed(2)} m`);
    assert.ok(!fast.face && fast.onRamp && fast.landU > 1 && fast.landU < far.length, `24 m/s lands ${fast.landU?.toFixed(1)} m past the far lip, on the ramp (${JSON.stringify(fast)})`);
    const edge = flight(j, far, 18);
    assert.ok(edge.face || edge.inWater, `18 m/s meets the far face or the water (${JSON.stringify(edge)})`);
    for (const v of [19, 20, 21, 22, 23]) { const r = flight(j, far, v); if (!r.face && !r.inWater) assert.ok(r.clearance > -0.35, `${v} m/s: a landing that is not a hit never pops the car up more than 0.35 m (${r.clearance?.toFixed(2)})`); }
    const slow = flight(j, far, 16);
    assert.ok(slow.inWater || slow.face, `16 m/s ends in the river (${JSON.stringify(slow)})`);
  }
});

test('the side-on camera eases in while airborne and back after landing, from a point down the river at bank height', () => {
  assert.equal(STUNT_IN, 0.25); assert.equal(STUNT_OUT, 0.6); assert.equal(STUNT_BACK, 22); assert.equal(STUNT_UP, 4);
  let k = 0;
  for (let i = 0; i < 15; i++) k = stuntBlend(k, 1 / 60, true);
  assert.ok(Math.abs(k - 1) < 1e-9, `fully in after 0.25 s of air (${k})`);
  for (let i = 0; i < 36; i++) k = stuntBlend(k, 1 / 60, false);
  assert.ok(Math.abs(k) < 1e-9, `fully out 0.6 s after landing (${k})`);
  const cam = stuntCamera({ x: -100, z: 18 }, { tx: 0, tz: 1 }, -0.06);
  assert.deepEqual([cam.x, +cam.y.toFixed(2), cam.z], [-100, 3.94, 40]);
});

test('the camera only cuts on the frame the car leaves a stunt ramp', () => {
  const ramp = { stunt: true, fx: -1, fz: 0 }, kicker = { stunt: false, fx: -1, fz: 0 };
  const along = [-1, 0], skew = [-Math.cos(0.4), Math.sin(0.4)], side = [0, 1];
  assert.equal(stuntTakeoff(false, true, ramp, ...along), true, 'took off this frame from a stunt ramp, heading up it');
  assert.equal(stuntTakeoff(false, true, ramp, ...skew), true, '23° off the ramp line still counts');
  assert.equal(stuntTakeoff(false, true, ramp, ...side), false, 'a sideways hop off the ramp edge does not');
  assert.equal(stuntTakeoff(false, true, kicker, ...along), false, 'a road kicker');
  assert.equal(stuntTakeoff(false, true, null, ...along), false, 'a hill');
  assert.equal(stuntTakeoff(true, true, ramp, ...along), false, 'already in the air');
  assert.equal(stuntTakeoff(false, false, ramp, ...along), false, 'still on the ramp');
});

test('the blend is eased, so the camera starts and stops gently', () => {
  assert.equal(stuntEase(0), 0); assert.equal(stuntEase(1), 1); assert.equal(stuntEase(0.5), 0.5);
  assert.ok(stuntEase(0.1) < 0.05 && stuntEase(0.9) > 0.95, 'flat at both ends');
});

// ── Plan 5 Task 2: the Lagoon's water jump, seen from the grandstand's side ──────────────────────────────────────────
import * as T from '../ecosystem/js/terrain.js';
import { stuntPose, stuntStep, standSide, STAND_OFF, STAND_UP } from '../ecosystem/js/stunt-math.js';
import { venueEntry } from '../ecosystem/js/entries.js';
import lagoon from '../ecosystem/tracks/lagoon.js';
import { loadStepCar } from '../tools/lapsim/car-node.mjs';
const hubCfg = T.terrainConfig();
const lagoonCfg = () => venueEntry(lagoon, { slug: 'lagoon' }).terrain;

test('the hub\'s river cue is unchanged byte for byte for both river ramps (values from 5909425)', () => {
  const [a, b] = stunt();
  for (const j of [a, b]) {
    const c = stuntPose(j, jumps, riverInfo, T.WATER_LEVEL);
    assert.deepEqual(Object.keys(c), ['x', 'y', 'z']);
    assert.ok(Object.is(c.x, -97.63129696011403) && Object.is(c.y, 3.94) && Object.is(c.z, 39.83753704255366), JSON.stringify(c));
  }
  assert.deepEqual(stuntCamera({ x: -100, z: 18 }, { tx: 0, tz: 1 }, -0.06), stuntCamera({ x: -100, z: 18 }, { tx: 0, tz: 1 }, -0.06, undefined), 'no options: the river pose');
});

test('standSide: the stand nearest the ramp along the lap gives the side by its off sign; no stands falls back to the outside', () => {
  assert.equal(standSide(217.5, [{ s: 259, off: 16 }, { s: 0, off: 16 }], 844.5, -1), 1);
  assert.equal(standSide(217.5, [{ s: 259, off: 16 }, { s: 200, off: -16 }], 844.5, 1), -1, 'the nearer stand wins');
  assert.equal(standSide(10, [{ s: 830, off: -16 }, { s: 120, off: 16 }], 844.5, 1), -1, 'distance wraps the line');
  assert.equal(standSide(10, [], 844.5, -1), -1); assert.equal(standSide(10, undefined, 844.5, 1), 1);
});

test('the Lagoon\'s stand-side pose: on the stand\'s side, 12 m off the ramp lane, below 4 m, looking along the flight', () => {
  T.configureTerrain(lagoonCfg());
  try {
    assert.equal(STAND_OFF, 12); assert.equal(STAND_UP, 3);
    const j = T.jumps.find((o) => o.stunt), l = lip(j), trk = T.trackDef();
    const c = stuntPose(j, T.jumps, T.riverInfo, T.WATER_LEVEL);
    const lat = (p) => (p.x - l.x) * j.rx + (p.z - l.z) * j.rz, fwd = (p) => (p.x - l.x) * j.fx + (p.z - l.z) * j.fz;
    const st = trk.stands.find((s) => s.s === 259), sp = trk.at(st.s), stand = { x: sp.x + sp.rx * st.off, z: sp.z + sp.rz * st.off };
    assert.ok(lat(stand) > 0 && Math.abs(lat(c) - 12) < 1e-9, `the jump stand at ${lat(stand).toFixed(1)} m, the camera at ${lat(c).toFixed(2)} m: same side, 12 m off the lane`);
    assert.ok(Math.abs(fwd(c)) < 1e-9, `level with the lip (${fwd(c)})`);
    assert.ok(c.y - T.WATER_LEVEL < 4 && Math.abs(c.y - T.WATER_LEVEL - 3) < 1e-9, `3 m up (${c.y})`);
    assert.ok(c.y > T.groundHeight(c.x, c.z) + 1.5, 'clear of the ground under it');
    const far = { x: l.x + j.fx * j.bank, z: l.z + j.fz * j.bank }, mid = { x: l.x + j.fx * j.bank / 2, z: l.z + j.fz * j.bank / 2 };
    const look = (p) => { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz); return (dx * j.fx + dz * j.fz) / d; };
    assert.ok(look(far) > 0.8, `the far bank is ahead of the camera along the flight (cos ${look(far).toFixed(2)})`);
    assert.ok(look(mid) > 0.5, `so is the middle of the flight (cos ${look(mid).toFixed(2)})`);
    assert.equal(T.onWater(far.x - j.fx * 0.5, far.z - j.fz * 0.5), true, 'bank is where the water ends'); assert.equal(T.onWater(far.x + j.fx * 0.5, far.z + j.fz * 0.5), false);
  } finally { T.configureTerrain(hubCfg); }
});

test('stuntStep hands the camera back on any landing and never comes back after a snap', () => {
  const st = { k: 0, on: true };
  for (let i = 0; i < 15; i++) stuntStep(st, 1 / 60, true);
  assert.ok(Math.abs(st.k - 1) < 1e-9 && st.on, 'in after 0.25 s of air');
  stuntStep(st, 1 / 60, false); // down: on the bank, in the inlet or into the ramp face (the car is not airborne in any of them)
  assert.equal(st.on, false, 'a landing ends it');
  for (let i = 0; i < 35; i++) stuntStep(st, 1 / 60, true); // a bounce back into the air does not bring it back
  assert.ok(Math.abs(st.k) < 1e-9 && !st.on, `fully back 0.6 s after the landing (${st.k})`);
  const snap = { k: 0.7, on: true };
  Object.assign(snap, { k: 0, on: false }); // placeCamera(dt, true): a teleport mid-flight
  for (let i = 0; i < 30; i++) stuntStep(snap, 1 / 60, true); // still airborne after the teleport
  assert.equal(snap.k, 0, 'a cancelled jump stays cancelled');
});

test('the Lagoon: a coasting take-off lands in the inlet, and the stand camera hands back on that wet landing; flat out clears it', async () => {
  const { stepCar, colliders } = await loadStepCar();
  T.configureTerrain(lagoonCfg());
  try {
    colliders.length = 0;
    const j = T.jumps.find((o) => o.stunt), DT = 1 / 60;
    const ride = (v, keys) => { // from 20 m before the ramp's foot, at v m/s, on the ramp's line
      const x = j.ox - j.fx * 20, z = j.oz - j.fz * 20;
      const s = { x, y: T.groundHeight(x, z), z, heading: Math.atan2(-j.fx, -j.fz), speed: v, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false };
      const car = { s, group: { position: { set() {} }, rotation: {} }, tilt: { rotation: {}, scale: { set() {} } }, wheels: [] };
      const cam = { k: 0, on: false }; let took = false, land = null, wet = false;
      for (let i = 0; i < 360 && !land; i++) {
        const wasAir = s.air, px = s.x, pz = s.z;
        stepCar(car, keys, DT);
        const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading), r = T.jumpAt(px, pz) || T.jumpAt(px - fx, pz - fz);
        if (stuntTakeoff(wasAir, s.air, r, fx, fz)) { took = true; cam.on = true; }
        if (cam.on || cam.k > 0) stuntStep(cam, DT, s.air);
        if (took && !s.air) { land = { x: s.x, z: s.z }; wet = T.onWater(s.x, s.z); }
      }
      let back = 0; while (cam.k > 0 && back < 120) { stuntStep(cam, DT, s.air); back++; }
      return { took, land, wet, back, cam };
    };
    const slow = ride(22, {});
    assert.ok(slow.took && slow.land && slow.wet, `coasting from 22 m/s takes off and lands in the inlet (${JSON.stringify(slow)})`);
    assert.ok(!slow.cam.on && slow.cam.k === 0 && slow.back <= 37, `and the camera is back within 0.6 s (${slow.back} frames)`);
    const fast = ride(14, { up: true });
    assert.ok(fast.took && fast.land && !fast.wet, `flat out on the tarmac run-up clears the inlet (${JSON.stringify(fast)})`);
    assert.ok(!fast.cam.on && fast.cam.k === 0 && fast.back <= 37, 'and hands back the same way on the far bank');
  } finally { T.configureTerrain(hubCfg); }
});
