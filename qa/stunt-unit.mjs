// The epic jump over the river and its side-on camera: node --test qa/stunt-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { jumps, jumpAt, riverInfo, groundHeight, terrainHeight, onWater } from '../ecosystem/js/terrain.js';
import { GRAVITY } from '../ecosystem/js/car-math.js';
import { stuntBlend, stuntCamera, STUNT_IN, STUNT_OUT, STUNT_BACK, STUNT_UP } from '../ecosystem/js/stunt-math.js';

const stunt = () => jumps.filter((j) => j.stunt);
const lip = (j) => ({ x: j.ox + j.fx * j.length, z: j.oz + j.fz * j.length });

test('the river jump: two ramps face each other across the straight stretch, lips dry and 6 m off the water, same height', () => {
  const [a, b] = stunt();
  assert.ok(a && b && stunt().length === 2, 'two stunt ramps');
  assert.ok(Math.abs(a.fx + b.fx) < 0.01 && Math.abs(a.fz + b.fz) < 0.01, 'they face each other');
  for (const j of [a, b]) {
    const l = lip(j), base = { x: j.ox, z: j.oz };
    assert.ok(riverInfo(l.x, l.z).d >= 5.8 && riverInfo(l.x, l.z).d <= 7, `${j.fx < 0 ? 'east' : 'west'} lip ${riverInfo(l.x, l.z).d.toFixed(1)} m from the water`);
    assert.ok(!onWater(l.x, l.z) && !onWater(base.x, base.z), 'lip and base are dry');
    assert.ok(groundHeight(base.x - j.fx, base.z - j.fz) >= -0.01, 'the run-up is dry ground');
    assert.ok(jumpAt(l.x - j.fx * 0.5, l.z - j.fz * 0.5)?.stunt, 'jumpAt finds the ramp just behind its lip');
  }
  const gap = Math.hypot(lip(a).x - lip(b).x, lip(a).z - lip(b).z);
  assert.ok(gap > 11 && gap < 14, `lip to lip ${gap.toFixed(1)} m`);
  const ya = terrainHeight(lip(a).x, lip(a).z), yb = terrainHeight(lip(b).x, lip(b).z);
  assert.ok(Math.abs(ya - yb) < 0.1, `the ground under the lips matches (${ya.toFixed(2)} vs ${yb.toFixed(2)}): the footprints are flattened`);
  assert.equal(a.height, b.height); assert.equal(a.length, b.length);
});

// The car's flight: speed along the heading, vertical speed from the ramp's slope at the lip, gravity from car-math
function flight(j, far, v) {
  const slope = (1.35 * j.height) / j.length; // d/du of height*(u/length)^1.35 at u = length
  const vy = v * slope, gap = Math.hypot(lip(j).x - lip(far).x, lip(j).z - lip(far).z);
  const yAtFarLip = vy * (gap / v) - 0.5 * GRAVITY * (gap / v) ** 2; // relative to the lip height
  // where it comes down on the far ramp: its surface, u metres past the far lip, is height*((length-u)/length)^1.35 below the far lip... above the ground
  let landU = null;
  for (let t = gap / v; t < 3; t += 0.005) {
    const x = v * t - gap, y = vy * t - 0.5 * GRAVITY * t * t; // x past the far lip, y relative to the lips
    const surf = x <= far.length ? far.height * Math.pow((far.length - x) / far.length, 1.35) - far.height : -far.height;
    if (y <= surf) { landU = x; break; }
  }
  return { yAtFarLip, landU };
}

test('flat out clears the far lip with margin and lands on the far ramp (a boost); a slow approach does not make it', () => {
  const [a, b] = stunt();
  for (const [j, far] of [[a, b], [b, a]]) {
    const fast = flight(j, far, 24);
    assert.ok(fast.yAtFarLip > 0.5, `24 m/s clears the far lip by ${fast.yAtFarLip.toFixed(2)} m`);
    assert.ok(fast.landU != null && fast.landU > 1 && fast.landU < far.length, `24 m/s lands ${fast.landU?.toFixed(1)} m past the far lip, on the ramp`);
    const slow = flight(j, far, 16);
    assert.ok(slow.yAtFarLip < -0.5, `16 m/s arrives ${slow.yAtFarLip.toFixed(2)} m under the far lip: into the river`);
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
