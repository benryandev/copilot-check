// The car: arcade driving on a height field. It follows the ground, leaves it when the ground
// falls away faster than gravity (the jump), and squashes a little on landing.

import * as THREE from "../vendor/three.module.min.js";
import { M, paint, box, mesh, colliders } from "./build.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { groundHeight, onDirt, WORLD } from "./terrain.js";

import { glowIntensity } from "./post.js";
import { boostFor, boostedTop } from "./boost-math.js";

export const CAR_R = 1.6;
const MAX_F = 24, MAX_R = 9, ACCEL = 16, BRAKE = 34, ROLL = 5, TURN = 2.2, GRAVITY = 30;
const OFF_ROAD = 0.8; // top speed share on grass
const MAX_CLIMB = 0.9; // steepest slope (rise per unit) the car can drive up

export function createCar(colour) {
  const car = new THREE.Group();
  const tilt = new THREE.Group(); // pitch, roll and squash live here
  car.add(tilt);
  const A = paint(colour);
  const body = box(2.2, 0.8, 4, A, 0, 0.45, 0);
  const cabin = box(1.8, 0.75, 2, M.glass, 0, 1.25, 0.3);
  tilt.add(body, cabin, box(2.25, 0.12, 4.05, M.trim, 0, 1.2, 0));
  const wheels = [];
  for (const [x, z] of [[-1.15, -1.3], [1.15, -1.3], [-1.15, 1.3], [1.15, 1.3]]) {
    const hub = new THREE.Group();
    hub.position.set(x, 0.45, z);
    const w = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 18), M.tyre);
    w.rotation.z = Math.PI / 2;
    hub.add(w);
    tilt.add(hub);
    wheels.push({ hub, w, front: z < 0 });
  }
  const s = { x: 0, y: 0, z: 0, heading: 0, speed: 0, steer: 0, vy: 0, air: false, squash: 0, pitch: 0, roll: 0, airTime: 0, boost: 0, airHit: false };
  const out = { group: car, tilt, body, wheels, s };
  out.ready = upgradeCar(out, colour);
  return out;
}

// Swap the box car for the Blender model once it loads (models/car.glb, made in Blender).
// Its "Accent" material takes the theme-aware accent; wheels keep steering and spinning.
async function upgradeCar(car, colour) {
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync("/ecosystem/models/car.glb");
  } catch (err) {
    console.warn("[eco] car model", err);
    return;
  }
  const model = gltf.scene;
  const wheels = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const name = o.material?.name;
    if (name === "Accent") o.material = paint(colour);
    else if (name === "Tyre") o.material = M.tyre;
    else if (name === "Tail") { // brake lights: lit by brakeLights() while the brake is on
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(TAIL);
      o.material.emissiveIntensity = 0;
      car.tail = o.material;
    }
  });
  for (const node of [...model.children]) {
    if (!node.name.startsWith("wheel_")) continue;
    // Pivot: steer the pivot about y, spin the wheel inside it about x
    const hub = new THREE.Group();
    hub.position.copy(node.position);
    node.position.set(0, 0, 0);
    hub.add(node);
    model.add(hub);
    wheels.push({ hub, w: node, front: node.name.endsWith("FL") || node.name.endsWith("FR") });
  }
  car.tilt.clear();
  car.tilt.add(model);
  car.wheels = wheels;
}

// Tail lamps on while braking (and off again), eased over a few frames; through the bloom at night they glow
const TAIL = 0xff3b30;
const BOOST_FLAME = 0xffa23a;
export function brakeLights(car, on, glow, boosting = false) {
  const m = car.tail;
  if (!m) return;
  const colour = boosting ? BOOST_FLAME : TAIL;
  if (m.emissive.getHex() !== colour) m.emissive.setHex(colour);
  const want = boosting ? (glow ? glowIntensity(m.emissive) * 1.3 : 2) : on ? (glow ? glowIntensity(m.emissive) : 1.4) : 0;
  m.emissiveIntensity += (want - m.emissiveIntensity) * 0.5;
}

function pushOut(px, pz, r) {
  for (const k of colliders) {
    if (px < k.minX - r || px > k.maxX + r || pz < k.minZ - r || pz > k.maxZ + r) continue;
    // Into the box's own frame
    const dx = px - k.cx, dz = pz - k.cz;
    const lx = dx * k.c - dz * k.s, lz = dx * k.s + dz * k.c;
    const nx = Math.max(-k.hx, Math.min(lx, k.hx)), nz = Math.max(-k.hz, Math.min(lz, k.hz));
    const ex = lx - nx, ez = lz - nz, d2 = ex * ex + ez * ez;
    if (d2 >= r * r) continue;
    let ux, uz, qx, qz;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      ux = ex / d; uz = ez / d; qx = nx + ux * r; qz = nz + uz * r;
    } else if (k.hx - Math.abs(lx) < k.hz - Math.abs(lz)) {
      // Centre inside the box: out through the nearer side
      ux = Math.sign(lx) || 1; uz = 0; qx = ux * (k.hx + r); qz = lz;
    } else {
      ux = 0; uz = Math.sign(lz) || 1; qx = lx; qz = uz * (k.hz + r);
    }
    return {
      x: k.cx + qx * k.c + qz * k.s, z: k.cz - qx * k.s + qz * k.c,
      nx: ux * k.c + uz * k.s, nz: -ux * k.s + uz * k.c,
    };
  }
  return null;
}
export { pushOut };

export function keepInWorld(o, r) {
  const dx = o.x - WORLD.cx, dz = o.z - WORLD.cz;
  const d = Math.hypot(dx, dz);
  const lim = WORLD.radius - 8 - r;
  if (d > lim) {
    o.x = WORLD.cx + (dx * lim) / d;
    o.z = WORLD.cz + (dz * lim) / d;
    return true;
  }
  return false;
}

// Returns events for effects: { landed: impact speed } or null
export function stepCar(car, keys, dt) {
  const s = car.s;
  const dirt = onDirt(s.x, s.z);
  // A jump boost (boost-math.js) raises the top speed for a moment and drives the car there; the brake ends it
  if (s.boost > 0 && keys.down) s.boost = 0;
  const boosting = s.boost > 0;
  let top = MAX_F * (dirt ? 1 : OFF_ROAD);
  if (boosting) top = boostedTop(top);
  const throttle = s.air ? 0 : (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  if (boosting && !s.air) s.speed = Math.min(top, s.speed + ACCEL * 1.6 * dt);
  if (throttle > 0) s.speed += (s.speed < 0 ? BRAKE : ACCEL) * dt;
  else if (throttle < 0) s.speed -= (s.speed > 0 ? BRAKE : ACCEL * 0.7) * dt;
  else if (!s.air) s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), ROLL * dt);
  if (s.speed > top) s.speed = Math.max(top, s.speed - BRAKE * 0.5 * dt); // ease down when leaving the road or as a boost ends (must out-pull ACCEL, or the throttle creeps past top)
  s.boost = Math.max(0, s.boost - dt);
  s.speed = Math.max(-MAX_R, s.speed);

  const steerIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  s.steer += (steerIn - s.steer) * Math.min(1, dt * 10);
  const grip = s.air ? 0.15 : Math.min(1, Math.abs(s.speed) / 8);
  s.heading += s.steer * TURN * grip * Math.sign(s.speed) * dt;

  const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  const nx = s.x + fx * s.speed * dt, nz = s.z + fz * s.speed * dt;

  let event = null;
  const gNew = groundHeight(nx, nz);
  const step = Math.hypot(nx - s.x, nz - s.z);
  // Too steep to drive up (the back of a kicker, the world's edge): stop like a wall
  if (!s.air && step > 1e-4 && (gNew - s.y) / step > MAX_CLIMB && gNew - s.y > 0.25) {
    s.speed *= -0.25;
  } else {
    s.x = nx;
    s.z = nz;
  }

  const hit = pushOut(s.x, s.z, CAR_R);
  if (hit) { s.x = hit.x; s.z = hit.z; s.speed *= 0.35; }
  if (keepInWorld(s, CAR_R)) s.speed *= 0.6;

  const g = groundHeight(s.x, s.z);
  if (s.air) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    s.airTime += dt;
    if (s.y <= g) {
      event = { landed: -s.vy, airTime: s.airTime };
      const b = boostFor(s.airTime, onDirt(s.x, s.z), s.airHit); // a clean jump pays on landing
      if (b > 0) { s.boost = b; event.boost = b; }
      s.airHit = false;
      s.squash = Math.min(0.35, -s.vy * 0.03);
      s.y = g;
      s.vy = 0;
      s.air = false;
    }
  } else {
    const vyGround = dt > 0 ? (g - s.y) / dt : 0;
    // Ground drops away faster than we'd fall in one frame: take off with the speed we had going up
    if (s.y - g > GRAVITY * dt * dt * 2 && s.vy > 2) {
      s.air = true;
      s.airTime = 0;
      s.airHit = false;
      s.y += s.vy * dt;
    } else {
      s.vy = vyGround;
      s.y = g;
    }
  }

  // Pitch and roll to the ground's slope; nose dips slowly in the air
  if (!s.air) {
    const ahead = groundHeight(s.x + fx * 1.6, s.z + fz * 1.6) - groundHeight(s.x - fx * 1.6, s.z - fz * 1.6);
    const rx = -fz, rz = fx;
    const side = groundHeight(s.x + rx, s.z + rz) - groundHeight(s.x - rx, s.z - rz);
    s.pitch += (Math.atan2(ahead, 3.2) - s.pitch) * Math.min(1, dt * 12);
    s.roll += (Math.atan2(side, 2) - s.roll) * Math.min(1, dt * 12);
  } else {
    s.pitch += (-0.25 - s.pitch) * Math.min(1, dt * 1.5);
  }
  s.squash *= Math.exp(-dt * 9);

  car.group.position.set(s.x, s.y, s.z);
  car.group.rotation.y = s.heading;
  car.tilt.rotation.x = s.pitch;
  car.tilt.rotation.z = s.roll - s.steer * grip * 0.04;
  car.tilt.scale.set(1 + s.squash * 0.5, 1 - s.squash, 1 + s.squash * 0.3);
  car.wheels.forEach(({ hub, w, front }) => {
    if (front) hub.rotation.y = s.steer * 0.45;
    w.rotation.x -= (s.speed * dt) / 0.45;
  });
  return { event, dirt, fx, fz, boost: s.boost };
}
