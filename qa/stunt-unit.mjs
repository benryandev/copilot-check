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
