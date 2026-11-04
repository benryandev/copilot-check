// The water jump: the pure flight model (jump-math.js) and the same jump through the real stepCar on a configured world
// (the 1200 by 80 m rectangle from tarmac-unit.mjs with an inlet across its straight at s 600 and the ramp in front of it).
// The hub is restored after every reconfiguring test.
import test from 'node:test'; import assert from 'node:assert/strict';
import { RAMP, RAMP_POW, LAND_MARGIN, LIP_SETBACK, takeoffVy, flightRange, inletHalfFor, inletGap } from '../ecosystem/js/jump-math.js';
import { loadStepCar } from '../tools/lapsim/car-node.mjs';
import { resolvePhysics, GRAVITY } from '../ecosystem/js/car-math.js';
import { resolveTrack } from '../ecosystem/js/track-math.js';
import * as T from '../ecosystem/js/terrain.js';

const { stepCar, colliders } = await loadStepCar();
const hub = T.terrainConfig();
const DT = 1 / 60;
const keys = { up: true };
/** A within-the-tolerance check that prints the measured figure next to the expected one on failure. */
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got} vs ${want} ± ${tol}`);

test('the ramp is the Raceway ramp and its face is terrain.js profile', () => {
  assert.deepEqual(RAMP, { length: 8, height: 1.9, width: 5.4 });
  assert.equal(RAMP_POW, 1.35); assert.equal(LAND_MARGIN, 0.8);
});

test('flight from the Raceway ramp: 16.4 to 16.9 m at 24 m/s (the Raceway analysis measured 16.4), 19.9 to 20.5 at 27', () => {
  assert.ok(flightRange(24) > 16.4 && flightRange(24) < 16.9, `24 m/s: ${flightRange(24)}`);
  assert.ok(flightRange(27) > 19.9 && flightRange(27) < 20.5, `27 m/s: ${flightRange(27)}`);
  assert.ok(Math.abs(takeoffVy(24) - 24 * 1.35 * 1.9 / 8) < 1e-9);
  // the closed form: back at bank height, h below the lip, under the car's own gravity
  const vy = takeoffVy(24), t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * RAMP.height)) / GRAVITY;
  assert.ok(Math.abs(flightRange(24) - 24 * t) < 1e-9);
});

test('the inlet for a 30 m/s surface needs about 90% of top: halfW 9.5, a 19.5 m gap', () => {
  assert.equal(LIP_SETBACK, 0.5); assert.equal(inletGap(9.5), 19.5);
  assert.equal(inletHalfFor(30), 9.5);
  assert.equal(inletHalfFor(30, 0.85), 8.5); // the ruling asked for 9; with the setback counted the formula gives 8.54 (see the task 5 report)
  const dry = inletGap(inletHalfFor(30)) - 0.3; // onWater's dry edge
  assert.ok(flightRange(0.9 * 30) >= dry + 0.5, `clears the dry edge with half a metre at 90% (${flightRange(0.9 * 30)} vs ${dry})`);
  assert.ok(flightRange(0.85 * 30) < dry - 0.3, `short of the dry edge by 0.3 at 85% (${flightRange(0.85 * 30)} vs ${dry})`);
});

// The inlet world: the inlet at s W across the straight, half width inletHalfFor(30) = 9.5, and the ramp placed as plan 5
// will place it (`s: W - halfW - ramp.length - LIP_SETBACK` = W - 18): the far bank is inletGap(9.5) = 19.5 m past the lip
// and onWater ends 0.3 m inside it, at 19.2. The tarmac runs from well back, up the ramp, across the inlet and on past the
// landing (`to`). That matters: in the air the step still eases the speed down to the top of the surface under the car
// (car.js), so the pure model's constant speed in flight holds only where that top is at least the approach speed.
const W = 600, HALF_W = inletHalfFor(30), RAMP_S = W - HALF_W - RAMP.length - LIP_SETBACK, LIP = RAMP_S + RAMP.length, FAR = inletGap(HALF_W);
const inletWorld = (to = W + HALF_W + 60) => {
  const points = [[-600, -40], [600, -40], [600, 40], [-600, 40]];
  return {
    world: { cx: 0, cz: 0, radius: 800 }, roads: [{ kind: 'track', from: 'x', to: 'x', closed: true, half: 6, points }],
    jumps: [], waters: [], districts: {}, stops: [],
    track: resolveTrack({ id: 'tiny-inlet', half: 6, points, gates: [{ s: 150 }, { s: 300 }], surface: [{ from: 300, to, kind: 'tarmac' }],
      water: [{ s: W, halfW: HALF_W }], ramps: [{ s: RAMP_S, side: 0, ...RAMP }] }),
  };
};
const fakeCar = (s) => ({ s, group: { position: { set() {} }, rotation: {} }, tilt: { rotation: {}, scale: { set() {} } }, wheels: [] });
const state = (x, z, heading, speed = 0) => ({ x, y: T.groundHeight(x, z), z, heading, speed, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false });
function mk(s, speed = 0) {
  colliders.length = 0;
  const p = T.trackAt(s);
  return fakeCar(state(p.x, p.z, Math.atan2(-p.fx, -p.fz), speed));
}
/** Metres past the lip along the track's direction there (the straight's heading drifts under 0.02 rad). */
const pastLip = (car) => { const p = T.trackAt(LIP); return (car.s.x - p.x) * p.fx + (car.s.z - p.z) * p.fz; };

/** Approach at exactly v (tarmac top pinned at v, throttle held) from 60 m before the inlet; follow a second past the landing. */
function jump(v) {
  const phys = resolvePhysics({ tarmac: { top: v } });
  const car = mk(W - 60, v);
  let landed = null, splash = null, takeoff = null, n = 0;
  const after = [];
  for (let i = 0; i < Math.round(4 / DT); i++) {
    const info = stepCar(car, keys, DT, phys); n++;
    if (takeoff === null && car.s.air) takeoff = { speed: car.s.speed, vy: car.s.vy, at: pastLip(car) };
    if (info.event?.splash && splash === null) splash = { speed: info.event.splash, at: pastLip(car) };
    if (info.event?.landed !== undefined && landed === null) {
      landed = { at: pastLip(car), speed: car.s.speed, boost: info.event.boost ?? 0, wet: T.onWater(car.s.x, car.s.z), airTime: info.event.airTime, n };
      continue;
    }
    if (landed && n - landed.n <= 60) after.push({ t: (n - landed.n) * DT, speed: car.s.speed, wet: info.wet });
  }
  return { landed, splash, takeoff, after };
}

test('a committed entry (exactly 90% of 30) clears the inlet dry with a boost, where the pure model says', () => {
  T.configureTerrain(inletWorld());
  try {
    assert.ok(T.onWater(T.trackAt(W).x, T.trackAt(W).z), 'the inlet is water at its centreline');
    assert.ok(!T.onWater(T.trackAt(LIP).x, T.trackAt(LIP).z), 'the lip is dry');
    assert.equal(HALF_W, 9.5); assert.equal(RAMP_S, W - 18);
    const r = jump(27);
    assert.ok(r.takeoff, 'took off'); assert.ok(r.landed, 'landed');
    near(r.landed.at, flightRange(27), 0.5, 'landing past the lip, real vs pure');
    assert.ok(r.landed.at > FAR, `past the far bank (${r.landed.at})`);
    assert.equal(r.landed.speed, 27, 'the horizontal speed held through the flight');
    assert.equal(r.landed.wet, false); assert.ok(r.landed.boost > 0, 'a boost on landing');
    assert.equal(r.splash, null, 'no splash');
  } finally { T.configureTerrain(hub); }
});

test('a short entry (85% of 30) splashes down in the water, no boost, and the water drags it', () => {
  T.configureTerrain(inletWorld());
  try {
    const r = jump(25.5);
    assert.ok(r.landed, 'landed');
    assert.ok(r.landed.at < FAR - 0.3, `short of the far bank's dry edge (${r.landed.at})`);
    assert.equal(r.landed.wet, true, 'lands in the water'); assert.equal(r.landed.boost, 0, 'no boost');
    assert.ok(r.splash, 'a splash');
    // It lands short of the dry edge but close to it, so it is out again within a frame or two; the drag shows there
    const wet = [{ speed: r.landed.speed }, ...r.after.filter((f) => f.wet)]; // from the landing speed on
    assert.ok(wet.length >= 2, `a wet frame after the landing (${wet.length - 1})`);
    for (let i = 1; i < wet.length; i++) assert.ok(wet[i].speed < wet[i - 1].speed - 0.5, `the water drags (${wet[i - 1].speed} to ${wet[i].speed})`);
  } finally { T.configureTerrain(hub); }
});

test('a clear miss (20 m/s) lands mid-channel and wades at 12', () => {
  T.configureTerrain(inletWorld());
  try {
    const r = jump(20);
    assert.ok(r.landed?.wet, 'lands in the water'); assert.equal(r.landed.boost, 0);
    const wading = r.after.filter((f) => f.wet && f.t >= 0.25);
    assert.ok(wading.length >= 10, `wading frames once the drag settles (${wading.length})`);
    for (const f of r.after.filter((f) => f.wet)) assert.ok(f.t < 0.25 || f.speed <= 12 + 0.05, `wading at ${f.speed} at ${f.t.toFixed(2)} s`);
  } finally { T.configureTerrain(hub); }
});

test('with dirt past the lip the flight eases to dirt top and the same committed entry falls short', () => {
  T.configureTerrain(inletWorld(LIP)); // tarmac ends at the lip: the air over the inlet reads dirt (top 24)
  try {
    const r = jump(27);
    assert.ok(r.landed.speed < 24 + 1e-9, `eased in the air (${r.landed.speed})`);
    assert.ok(r.landed.at < FAR - 0.3 && r.landed.wet, `short and wet (${r.landed.at})`);
  } finally { T.configureTerrain(hub); }
});

test('the hub is restored after', () => {
  T.configureTerrain(hub);
  assert.equal(T.raceGates.length, 6);
});
