// The real stepCar in node (tools/lapsim/car-node.mjs) on the hub terrain: dirt unchanged, the graze rule at a wall,
// and the surface the step reports. The start straight (s 10 to 60) is flat, straight dirt.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadStepCar } from '../tools/lapsim/car-node.mjs';
import { resolvePhysics } from '../ecosystem/js/car-math.js';
import * as T from '../ecosystem/js/terrain.js';

const { stepCar, colliders, CAR_R } = await loadStepCar();
const DT = 1 / 60;
const keys = { up: true };
const fakeCar = (s) => ({ s, group: { position: { set() {} }, rotation: {} }, tilt: { rotation: {}, scale: { set() {} } }, wheels: [] });
const state = (x, z, heading, speed = 0) => ({ x, y: T.groundHeight(x, z), z, heading, speed, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false });
/** A car at rest at trackAt(s) on the start straight, facing along the track; no colliders but the test's own. */
function mk(s) {
  colliders.length = 0;
  const p = T.trackAt(s);
  const car = fakeCar(state(p.x, p.z, Math.atan2(-p.fx, -p.fz)));
  car.start = p;
  return car;
}
/** Steps at 1/60 s for `secs`; the min, max and last speed, the smallest |speed| and the last step's info. */
function run(car, k, secs, physics) {
  let min = Infinity, max = -Infinity, minAbs = Infinity, info = null;
  for (let i = 0; i < Math.round(secs / DT); i++) {
    info = physics === undefined ? stepCar(car, k, DT) : stepCar(car, k, DT, physics);
    const v = car.s.speed;
    min = Math.min(min, v); max = Math.max(max, v); minAbs = Math.min(minAbs, Math.abs(v));
  }
  return { min, max, minAbs, last: car.s.speed, info };
}
/** A thin wall parallel to the straight at lateral (TRACK_HALF + 3) * side (+ = right of travel), `len` m long centred on s;
 * side 0 is a box across the road at s, `len` m deep. */
function wallAt(s, side, len) {
  const p = T.trackAt(s), off = (T.TRACK_HALF + 3) * side, yaw = Math.atan2(p.fx, p.fz); // the box's local z runs along the track
  const [hx, hz] = side === 0 ? [T.TRACK_HALF + 3, len / 2] : [0.5, len / 2];
  const cx = p.x + p.rx * off, cz = p.z + p.rz * off, c = Math.cos(yaw), sn = Math.sin(yaw);
  const ex = Math.abs(hx * c) + Math.abs(hz * sn), ez = Math.abs(hx * sn) + Math.abs(hz * c);
  colliders.push({ cx, cz, hx, hz, c, s: sn, minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez });
}
const along = (car) => (car.s.x - car.start.x) * car.start.fx + (car.s.z - car.start.z) * car.start.fz;
const forward = (car) => [-Math.sin(car.s.heading), -Math.cos(car.s.heading)];

test('dirt is unchanged: full throttle from rest reaches 24, never above; {} and no physics match to the metre', async () => {
  const a = mk(10), b = mk(10), c = mk(10);
  const ra = run(a, keys, 4), rb = run(b, keys, 4, {}), rc = run(c, keys, 4, resolvePhysics({ tarmac: { top: 28 } }));
  assert.ok(Math.abs(ra.last - 24) < 0.05 && ra.max <= 24 + 1e-9, `last ${ra.last}, max ${ra.max}`);
  assert.equal(rb.last, ra.last); assert.equal(rc.last, ra.last);
  assert.deepEqual([a.s.x, a.s.z, a.s.speed], [b.s.x, b.s.z, b.s.speed]);
  assert.deepEqual([a.s.x, a.s.z, a.s.speed], [c.s.x, c.s.z, c.s.speed], 'a tarmac override cannot touch dirt');
});

test('a 15° graze at 24 m/s loses no more than 25% and continues along the wall', async () => {
  const car = mk(20); wallAt(40, 1, 60); car.s.speed = 24; car.s.heading -= 15 * Math.PI / 180; // 15° toward the right-hand wall
  const r = { min: Infinity }; let touched = false;
  for (let i = 0; i < 90; i++) { stepCar(car, keys, DT); touched ||= car.s.wall === true; r.min = Math.min(r.min, car.s.speed); } // through the contact and a second beyond
  assert.ok(touched, 'a contact frame sets the wall flag to true');
  assert.ok(r.min >= 18, `min speed ${r.min.toFixed(1)} should keep 75% of 24`);
  // The car touches the wall on some frame and has separated by the end (the grass track beside the wall pulls it off)
  assert.equal(car.s.wall, false, 'separated from the wall by the end: the contact flag is cleared');
  // The wall stands 3 m beyond the road's edge, so the car runs along it on grass: at grass's top (0.8 of 24), not above
  assert.ok(car.s.speed >= 24 * 0.8 - 0.05 && along(car) > 25, `still travelling the way the wall runs (speed ${car.s.speed.toFixed(1)}, along ${along(car).toFixed(1)})`);
  assert.ok(Math.abs(Math.sin(car.s.heading - Math.atan2(-car.start.fx, -car.start.fz))) < Math.sin(5 * Math.PI / 180), 'turned parallel to the wall');
  assert.ok(Math.abs(T.roadInfo(car.s.x, car.s.z).d) < T.TRACK_HALF + 3, 'inside the wall, not through it');
});

test('head-on stops as today: 0.35 on the entering frame and again while held against the wall', async () => {
  const car = mk(20); wallAt(40, 0, 1); // a box across the road ahead
  car.s.speed = 24; const r = run(car, keys, 1.0);
  assert.ok(r.min <= 24 * 0.35 + 0.1, `min ${r.min}`); assert.ok(Math.abs(car.s.speed) < 2, `held against the wall, it stays stopped (${car.s.speed})`);
});

test('reversing into a wall is the same hit', async () => {
  const car = mk(60); wallAt(40, 0, 1); // the box behind the car
  car.s.speed = -9; const r = run(car, { down: true }, 2.0);
  assert.ok(r.minAbs <= 9 * 0.35 + 0.1, `min |speed| ${r.minAbs}`);
  assert.ok(along(car) > -20 + 0.5 + 1.6 - 0.2, 'pushed out on the near side of the box');
});

test('the nudge turns the car away from the wall', async () => {
  const car = mk(20); wallAt(40, 1, 60); car.s.speed = 24; car.s.heading -= 15 * Math.PI / 180;
  const p = car.start, n = [-p.rx, -p.rz]; // the wall's normal, from the wall toward the car (left of travel)
  const dot = (f) => f[0] * n[0] + f[1] * n[1];
  let before = null, after = null;
  for (let i = 0; i < 120 && after === null; i++) {
    const f0 = forward(car), h0 = car.s.heading;
    stepCar(car, keys, DT);
    if (car.s.wall) { before = dot(f0); after = dot(forward(car)); assert.notEqual(car.s.heading, h0); }
  }
  assert.ok(after !== null, 'the car reached the wall');
  assert.ok(after > before + 0.05, `dot(forward, n) ${before.toFixed(3)} -> ${after.toFixed(3)} should rise: turned away from the wall`);
});

test('the step reports the surface, and wading on any surface is 12 m/s', async () => {
  // On the straight: dirt; off it, beside the Raceway: grass at 0.8 of the dirt top
  const d = mk(20); assert.equal(run(d, keys, 0.1).info.surface, 'dirt');
  const p = T.trackAt(30), g = fakeCar(state(p.x + p.rx * (T.TRACK_HALF + 10), p.z + p.rz * (T.TRACK_HALF + 10), Math.atan2(-p.fx, -p.fz)));
  colliders.length = 0;
  const rg = run(g, keys, 0.1); assert.equal(rg.info.surface, 'grass');
  // The Token ford: the river crossing without a bridge. From rest a few metres back on the road, full throttle through it.
  const ford = T.crossings.find((c) => !c.bridge);
  assert.ok(ford, 'the hub has a ford');
  const fx = Math.sin(ford.yaw), fz = Math.cos(ford.yaw); // the road's direction through the crossing
  const back = T.river.half + 4;
  const car = fakeCar(state(ford.x - fx * back, ford.z - fz * back, Math.atan2(-fx, -fz)));
  let wetMax = 0, wetFrames = 0;
  for (let i = 0; i < 120; i++) {
    const info = stepCar(car, keys, DT);
    if (info.wet) { wetFrames++; wetMax = Math.max(wetMax, car.s.speed); assert.equal(info.surface, 'dirt', 'wet is dirt'); }
  }
  assert.ok(wetFrames > 30, `in the water for ${wetFrames} frames`);
  assert.ok(wetMax <= 12 + 0.05 && wetMax > 11, `wading top ${wetMax.toFixed(2)} should be 12`);
});

test('a reversing graze turns the direction of travel away from the wall too', async () => {
  // Reversing at 9 m/s with the tail 10° toward the right-hand wall, starting 5 m right of the centreline
  const car = mk(60); wallAt(40, 1, 60);
  const p = car.start, n = [-p.rx, -p.rz]; // the wall's normal, from the wall toward the car
  car.s.x += p.rx * 5; car.s.z += p.rz * 5; car.s.heading += 10 * Math.PI / 180; car.s.speed = -9;
  const travel = () => { const f = forward(car), d = Math.sign(car.s.speed) || 1; return f[0] * d * n[0] + f[1] * d * n[1]; };
  const lat = () => (car.s.x - p.x) * p.rx + (car.s.z - p.z) * p.rz;
  let before = null, after = null, contact = 0, minAbs = Infinity;
  for (let i = 0; i < 240; i++) {
    const t0 = travel();
    stepCar(car, { down: true }, DT);
    minAbs = Math.min(minAbs, Math.abs(car.s.speed));
    if (car.s.wall) { contact++; if (before === null) { before = t0; after = travel(); } }
  }
  assert.ok(before !== null, 'the car reached the wall');
  assert.ok(after > before + 0.05, `travel·n ${before.toFixed(3)} -> ${after.toFixed(3)} should rise: travel turned away from the wall`);
  assert.ok(contact < 15, `in contact for ${contact} frames: it should glance off, not pin`);
  assert.ok(!car.s.wall && lat() < T.TRACK_HALF + 3 - 0.5 - 1.6 - 0.1, `separated from the wall (lateral ${lat().toFixed(2)})`);
  assert.ok(minAbs >= 9 * 0.75 && Math.abs(car.s.speed) > 8.5, `kept most of its speed (min ${minAbs.toFixed(2)}, last ${Math.abs(car.s.speed).toFixed(2)})`);
});

// C1: a wall turns a car only as much as the car can steer itself. At rest it has no grip, so the wall must not swivel it.
test('a car at rest touching a wall keeps its heading over 5 s', async () => {
  // Exactly CAR_R from the wall's face, parallel to it (where a nudge is largest): rounding reads contact on every frame
  const car = mk(40); wallAt(40, 1, 200);
  const p = car.start, off = T.TRACK_HALF + 3 - 0.5 - CAR_R;
  car.s.x = p.x + p.rx * off; car.s.z = p.z + p.rz * off; car.s.y = T.groundHeight(car.s.x, car.s.z);
  const h0 = car.s.heading; let contact = 0;
  for (let i = 0; i < 300; i++) { stepCar(car, {}, DT); if (car.s.wall) contact++; }
  assert.ok(contact > 0, 'the step reads contact at CAR_R');
  assert.ok(Math.abs(car.s.heading - h0) < 1e-6, `heading drifted ${car.s.heading - h0} rad at rest (${contact} contact frames)`);
});
test('a car that drove into a wall and stopped keeps its heading once the keys are released', async () => {
  // 15 degrees into the wall at 24 m/s, throttle and steering held into it for 2 s: pinned (the throttle holds it near
  // 0.2 m/s, never under 0.1, so the hold is timed), then released for 1 s to settle, then 5 s with no keys
  const car = mk(20); wallAt(40, 1, 200);
  car.s.heading -= 15 * Math.PI / 180; car.s.speed = 24;
  let touched = false;
  for (let i = 0; i < 120; i++) { stepCar(car, { up: true, right: true }, DT); touched ||= car.s.wall; }
  assert.ok(touched && Math.abs(car.s.speed) < 0.5, `pinned against the wall (speed ${car.s.speed.toFixed(2)})`);
  for (let i = 0; i < 60; i++) stepCar(car, {}, DT);
  const h0 = car.s.heading; let contact = 0;
  for (let i = 0; i < 300; i++) { stepCar(car, {}, DT); if (car.s.wall) contact++; }
  assert.ok(contact > 0, 'still touching the wall at rest');
  assert.ok(Math.abs(car.s.heading - h0) < 1e-6, `heading drifted ${car.s.heading - h0} rad at rest against the wall (${contact} contact frames)`);
});
test('a dt-0 step that places the car inside a collider does not turn it', async () => {
  const car = mk(30); wallAt(30, 1, 60);
  const p = car.start, wallIn = T.TRACK_HALF + 3 - 0.5;
  car.s.x = p.x + p.rx * (wallIn - CAR_R / 2); car.s.z = p.z + p.rz * (wallIn - CAR_R / 2); // half-way into the push-out radius
  car.s.heading += 0.3; car.s.speed = 0;
  const h0 = car.s.heading;
  stepCar(car, {}, 0);
  assert.equal(car.s.wall, true, 'the placement read contact');
  assert.equal(car.s.heading, h0, 'no turn on a dt-0 placement');
  // and moving: a dt-0 step at speed is still a placement
  const c2 = mk(30); wallAt(30, 1, 60);
  c2.s.x = car.s.x; c2.s.z = car.s.z; c2.s.wall = false; c2.s.heading = h0; c2.s.speed = 20;
  stepCar(c2, {}, 0);
  assert.equal(c2.s.heading, h0, 'no turn on a dt-0 placement at speed');
});
