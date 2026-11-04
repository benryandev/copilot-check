// Tarmac through the real stepCar on a small configured world (a rectangle with tarmac from s 0 to 100):
// the top, the pull, the turn-rate curve and the carry-over onto dirt. The hub is restored after every test.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadStepCar } from '../tools/lapsim/car-node.mjs';
import { resolvePhysics } from '../ecosystem/js/car-math.js';
import { resolveTrack } from '../ecosystem/js/track-math.js';
import * as T from '../ecosystem/js/terrain.js';

const { stepCar, colliders } = await loadStepCar();
const hub = T.terrainConfig();
const DT = 1 / 60;
const keys = { up: true };
// A 1200 m by 80 m rectangle: the spline bows out, so the straightest part is around s 600 (heading drifts under 0.02 rad
// across s 400 to 700) and a car driven dead straight there stays on a 6 m ribbon for 150 m. Tarmac covers `from` to `to`.
const tarmacWorld = (from, to, half = 6) => {
  const points = [[-600, -40], [600, -40], [600, 40], [-600, 40]];
  return {
    world: { cx: 0, cz: 0, radius: 800 }, roads: [{ kind: 'track', from: 'x', to: 'x', closed: true, half, points }],
    jumps: [], waters: [], districts: {}, stops: [],
    track: resolveTrack({ id: 'tiny-tarmac', half, points, gates: [{ s: 150 }, { s: 300 }], surface: [{ from, to, kind: 'tarmac' }] }),
  };
};
const fakeCar = (s) => ({ s, group: { position: { set() {} }, rotation: {} }, tilt: { rotation: {}, scale: { set() {} } }, wheels: [] });
const state = (x, z, heading, speed = 0) => ({ x, y: T.groundHeight(x, z), z, heading, speed, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false });
/** A car on the track at s (or `lateral` m to the right of it), facing along the track at `speed`. */
function mk(s, speed = 0, lateral = 0) {
  colliders.length = 0;
  const p = T.trackAt(s);
  return fakeCar(state(p.x + p.rx * lateral, p.z + p.rz * lateral, Math.atan2(-p.fx, -p.fz), speed));
}
const arc = (car) => T.roadInfo(car.s.x, car.s.z).t * T.trackLen; // the one road's arc length
/** A within-the-tolerance check that prints the measured figure next to the expected one on failure. */
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got} vs ${want} ± ${tol}`);

test('on tarmac the car reaches 30 and pulls at 20', () => {
  T.configureTerrain(tarmacWorld(380, 520));
  try {
    const car = mk(400); let max = -Infinity, t10 = null, t20 = null, info;
    for (let i = 0; i < Math.round(3 / DT); i++) {
      info = stepCar(car, keys, DT);
      const v = car.s.speed, t = (i + 1) * DT; max = Math.max(max, v);
      if (t10 === null && v >= 10) t10 = t;
      if (t20 === null && v >= 20) t20 = t;
    }
    assert.equal(info.surface, 'tarmac');
    near(car.s.speed, 30, 0.05, 'speed after 3 s'); assert.ok(max <= 30 + 1e-9, `never above 30 (max ${max})`);
    near(t20 - t10, 0.5, 0.05, 'time from 10 to 20 m/s');
  } finally { T.configureTerrain(hub); }
});

test('steering at speed: 2.2 rad/s at 20 m/s on tarmac, 1.0 at 30', () => {
  for (const [top, rate] of [[20, 2.2], [30, 1.0]]) {
    T.configureTerrain(tarmacWorld(380, 520, 20)); // a wide ribbon so the turning car stays on tarmac for the whole window
    try {
      const phys = resolvePhysics({ tarmac: { top } }), k = { up: true, right: true };
      const car = mk(400, top);
      for (let i = 0; i < Math.round(0.5 / DT); i++) stepCar(car, k, DT, phys); // let the steer ease in
      const h0 = car.s.heading;
      for (let i = 0; i < Math.round(0.5 / DT); i++) car.s.speed = top, stepCar(car, k, DT, phys); // speed re-pinned each frame: the car drifts off the ribbon
      const dh = Math.abs(car.s.heading - h0);
      near(dh, rate * 0.5, rate * 0.5 * 0.08, `heading change over 0.5 s at ${top} m/s`);
    } finally { T.configureTerrain(hub); }
  }
});

test('carry-over: leaving tarmac at 30 onto dirt with the throttle held bleeds 1 m/s a second', () => {
  T.configureTerrain(tarmacWorld(380, 520));
  try {
    const car = mk(510, 30); let crossed = null, info, n = 0, dirtAtEnd = true;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      info = stepCar(car, keys, DT);
      if (crossed === null && arc(car) > 520) crossed = n;
      if (crossed !== null) {
        const since = (n - crossed) / 60;
        if (Math.abs(since - 2) < DT / 2) near(car.s.speed, 28, 0.3, '2 s after leaving tarmac');
        if (Math.abs(since - 6) < DT / 2) { near(car.s.speed, 24, 0.3, '6 s after leaving tarmac'); dirtAtEnd = info.surface === 'dirt'; }
      }
      n++;
    }
    assert.notEqual(crossed, null, 'the car passed the end of the tarmac');
    assert.ok(dirtAtEnd, 'still on dirt road at 6 s');
  } finally { T.configureTerrain(hub); }
});

test('grass beside tarmac is raceway grass: top 19.2', () => {
  T.configureTerrain(tarmacWorld(380, 520));
  try {
    const car = mk(440, 0, 9); let max = -Infinity, info;
    for (let i = 0; i < Math.round(4 / DT); i++) { info = stepCar(car, keys, DT); max = Math.max(max, car.s.speed); }
    assert.equal(info.surface, 'grass');
    assert.ok(max <= 19.2 + 0.05, `max ${max}`); assert.ok(max > 19.0, `reaches the grass top (${max})`);
  } finally { T.configureTerrain(hub); }
});

test('the hub is restored after', () => {
  T.configureTerrain(hub);
  assert.equal(T.raceGates.length, 6);
});
