// Strike ecosystem world: scene assembly, input, camera, sheets and the frame loop.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS, STOPS, SPAWN, MULTIPLAYER } from "./content.js";
import { fetchLive, LABELS } from "./data.js";
import { buildGround, buildRoads, buildJumps, buildPlazas, groundHeight, roadInfo, roads, jumps, WORLD, inRaceway, trackDistance, raceGates } from "./terrain.js";
import { createGrass, createDust, createFireworks } from "./effects.js";
import { createSky } from "./sky.js";
import {
  M, animated, pads, crates, boards, colliders, districtGroups,
  buildStops, buildBoard, buildRoadSigns, addCrates, addProps, recolourMaterials, setTicker, modelsReady,
} from "./build.js";
import { createCar, stepCar, pushOut, keepInWorld, CAR_R, brakeLights } from "./car.js";
import { tint } from "./colours.js";
import { buildRaceway, formatTime } from "./raceway.js";
import { celebrateOnce } from "./race-post.js";
import { initRace, raceTick, raceHud, raceCancel, raceRefresh, fetchTop, raceBoard, onBoard, topList, toStart, ghostPreview, refreshGhost } from "./race.js";
import { buildYard, flowTick, yardValues, onYardStats, injectFills } from "./flow.js";
import { initPeers, sendPose, peersTick, peersState, onPeers, setPeerName, injectPeers, movePeer } from "./peers.js";
import { loader, paint, wantsArrival, startArrival } from "./arrive.js";
import { createPost, toGlow } from "./post.js";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;

// ── Palettes ──────────────────────────────────────────────────────────
const PALETTE = {
  light: {
    sky: 0xcfe0ec, grassA: 0x93bb6c, grassB: 0x75a056, grassBase: 0x4f7d3b, grassTip: 0xaed383,
    dirt: 0xf6ead6, dirtTop: 0xc9a97e, dirtSide: 0xa9896a, dust: 0xd9c5a3, plaza: 0xeef1f4, cobbleA: 0xded6c8, cobbleB: 0xcbc1b0, mortar: 0xb3a894,
    build: 0xf5f6f8, trim: 0x0d0d0d, wood: 0x8a6a48,
    panel: "#ffffff", text: "#0d0d0d", sub: "#4b5563", signBoard: "#f3e9d8", signInk: "#2b2118",
  },
  dark: {
    sky: 0x0b1016, grassA: 0x2d4b2a, grassB: 0x223a20, grassBase: 0x182a16, grassTip: 0x406c37,
    dirt: 0x9b8770, dirtTop: 0x6e5a43, dirtSide: 0x56462f, dust: 0x7a6a56, plaza: 0x181c21, cobbleA: 0x2b3139, cobbleB: 0x222730, mortar: 0x15181d,
    build: 0x252a31, trim: 0xf9fafb, wood: 0x5e4631,
    panel: "#15191e", text: "#f9fafb", sub: "#9ca3af", signBoard: "#2a241c", signInk: "#f3e9d8",
  },
};
let dark = root.classList.contains("dark");
const pal = () => (dark ? PALETTE.dark : PALETTE.light);

// ── Quality tiers ─────────────────────────────────────────────────────
const TIERS = {
  high: { ratio: 2, shadow: 2048, grass: 14000, ground: 200, dust: 420, bloom: { strength: 0.28, radius: 0.22 } },
  medium: { ratio: 1.5, shadow: 1024, grass: 7000, ground: 150, dust: 280, bloom: { strength: 0.25, radius: 0.2 } },
  low: { ratio: 1, shadow: 0, grass: 2500, ground: 110, dust: 140, bloom: false },
};
const ORDER = ["high", "medium", "low"];
let qualityPref = (() => { try { return localStorage.getItem("eco-quality") || "auto"; } catch { return "auto"; } })();
let tierName = qualityPref !== "auto" ? qualityPref : coarse ? "medium" : "high";
const tier = () => TIERS[tierName];

// ── Renderer, scene, camera, lights ───────────────────────────────────
const canvas = $("world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 320);
const post = createPost(renderer, scene, camera);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8892a0, 1.1);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);

// ── World ─────────────────────────────────────────────────────────────
// Built in steps with a painted frame between them, so the loader reports real progress
const load = loader(5);
await load.step("Laying the roads");
// Ground segments grow with the world (it reached past Partners for the raceway), same density
let ground = buildGround(Math.round((tier().ground * WORLD.radius) / 280), pal());
const roadMesh = buildRoads(pal());
const jumpMesh = buildJumps(pal());
const plazaMesh = buildPlazas(pal());
scene.add(ground, roadMesh, jumpMesh, plazaMesh);
const sky = createSky({ reduceMotion });
scene.add(sky);
await load.step("Raising the districts");
buildStops(scene);
buildRoadSigns(scene);
addProps(scene);
await load.step("Marking out the raceway");
buildRaceway(scene);
buildYard();

let live = null;
const getLive = () => live;
Object.keys(DISTRICTS).forEach((k) => buildBoard(scene, k, getLive));

let grass = null, dust = null;
const fireworks = reduceMotion ? null : createFireworks(); // a new #1 on the Raceway
if (fireworks) scene.add(fireworks);
function applyTier() {
  const t = tier();
  renderer.setPixelRatio(Math.min(devicePixelRatio, t.ratio));
  sky.userData.setScale(Math.min(devicePixelRatio, t.ratio));
  renderer.shadowMap.enabled = t.shadow > 0;
  sun.castShadow = t.shadow > 0;
  if (t.shadow) {
    sun.shadow.mapSize.set(t.shadow, t.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  if (grass) { scene.remove(grass); grass.geometry.dispose(); grass.material.dispose(); }
  grass = createGrass(t.grass, pal(), !reduceMotion);
  scene.add(grass);
  if (dust) { scene.remove(dust); dust.geometry.dispose(); dust.material.dispose(); }
  dust = createDust(t.dust, pal());
  scene.add(dust);
  post.enable(t.bloom);
  resize();
  document.querySelectorAll("[data-quality]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.quality === qualityPref)));
}

// ── Car ───────────────────────────────────────────────────────────────
const car = createCar(DISTRICTS.hub.colour);
scene.add(car.group);
Object.assign(car.s, { x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading, y: groundHeight(SPAWN.x, SPAWN.z) });

// ── Theme ─────────────────────────────────────────────────────────────
function applyTheme() {
  const p = pal();
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  $("theme").textContent = dark ? "Light" : "Dark";
  $("theme").setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
  scene.background = new THREE.Color(p.sky);
  scene.fog = new THREE.Fog(p.sky, 90, 240);
  hemi.intensity = dark ? 0.55 : 1.1;
  sun.intensity = dark ? 0.9 : 1.6;
  recolourMaterials(p, dark, post.on);
  sky.userData.setNight(dark);
  // With bloom on, every pad ring is pushed to the same glow luminance whatever its district colour; without it they stay as tinted
  if (post.on) pads.forEach((pd) => toGlow(pd.ring.material.color));
  [ground, roadMesh, jumpMesh, plazaMesh, grass, dust].forEach((o) => o?.userData.recolour?.(p));
}
$("theme").addEventListener("click", () => {
  dark = !dark;
  try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  applyTheme();
});

// ── Input ─────────────────────────────────────────────────────────────
const keys = { up: false, down: false, left: false, right: false };
const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
let paused = true;
addEventListener("keydown", (e) => {
  // M toggles Map view (asked for on the forum); not while typing, and not over another sheet
  if (e.code === "KeyM" && !e.metaKey && !e.ctrlKey && !e.altKey && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) {
    const map = $("map");
    if (map.open) { e.preventDefault(); map.close(); return; }
    if (!anyOpen() || $("intro").open) { e.preventDefault(); openMap(); return; }
  }
  if (anyOpen()) return;
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
  if ((e.code === "Enter" || e.code === "Space") && activePad) { e.preventDefault(); openStop(activePad.stop); }
});
addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener("blur", releaseKeys);

if (coarse || "ontouchstart" in window) $("touch").hidden = false;
// iOS: a second tap within 300 ms anywhere is a double-tap zoom, and there is no gesture back from it. The CSS hint
// (touch-action) should stop it; this is the belt to those braces. Only the second tap is swallowed, so single taps,
// clicks and links still work. Pinch is refused too.
let lastTap = 0;
document.addEventListener("touchend", (e) => {
  const now = performance.now();
  if (now - lastTap < 300 && e.touches.length === 0) e.preventDefault();
  lastTap = now;
}, { passive: false, capture: true });
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.querySelectorAll(".pad-btn").forEach((btn) => {
  const k = btn.dataset.key;
  const on = (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); keys[k] = true; btn.classList.add("is-down"); };
  const off = () => { keys[k] = false; btn.classList.remove("is-down"); };
  btn.addEventListener("pointerdown", on);
  btn.addEventListener("pointerup", off);
  btn.addEventListener("pointercancel", off);
  btn.addEventListener("lostpointercapture", off);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
});
function releaseKeys() {
  Object.keys(keys).forEach((k) => (keys[k] = false));
  document.querySelectorAll(".pad-btn").forEach((b) => b.classList.remove("is-down"));
}

// ── Crates ────────────────────────────────────────────────────────────
// Crates: a 2D slide for the knock-about, plus real falling. A crate's floor is the ground or the top of whatever
// it overlaps enough, so they land on each other; knock the one underneath away and the rest drop; land on an edge
// and it slides off, which is what makes a heap rather than a tower. In the air it tumbles; at rest it settles onto
// a face.
const CRATE_G = 22, CRATE_BOUNCE = 0.28, QUARTER = Math.PI / 2;
const faceSnap = (a, dt) => { const t = Math.round(a / QUARTER) * QUARTER; return t + (a - t) * Math.exp(-dt * 10); };
function crateFloor(c) {
  const p = c.m.position;
  let floor = groundHeight(p.x, p.z), on = null, off = 0;
  const bottom = p.y - c.h;
  for (const o of crates) {
    if (o === c || o.dying != null) continue;
    const q = o.m.position, top = q.y + o.h;
    if (top > bottom + 0.3) continue; // beside us, not under us
    const span = (c.r + o.r) * 0.62; // the square-ish footprints overlap
    const dx = Math.abs(p.x - q.x), dz = Math.abs(p.z - q.z);
    if (dx > span || dz > span) continue;
    if (top > floor) { floor = top; on = o; off = Math.max(dx, dz) / span; }
  }
  return { floor, on, off };
}
function stepCrates(dt) {
  const s = car.s;
  const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  for (const c of crates) {
    const p = c.m.position;
    if (c.vy === undefined) { c.vy = 0; c.air = false; c.ang = new THREE.Vector3(); }
    const dx = p.x - s.x, dz = p.z - s.z;
    const d = Math.hypot(dx, dz);
    const minD = CAR_R + c.r;
    if (d < minD && d > 0 && s.y < p.y + c.h + 1.2 && p.y - c.h < s.y + 1.4) {
      c.hit = true;
      const nx = dx / d, nz = dz / d;
      p.x = s.x + nx * minD;
      p.z = s.z + nz * minD;
      const along = Math.max(0, (fx * nx + fz * nz) * s.speed);
      c.v.x += nx * (along * 1.3 + 1);
      c.v.y += nz * (along * 1.3 + 1);
      c.spin += (Math.random() - 0.5) * along * 1.2;
      if (along > 5) { // a proper hit tosses it
        c.vy = Math.max(c.vy, 1.5 + along * 0.18);
        c.air = true;
        c.ang.set((Math.random() - 0.5) * along * 0.6, 0, (Math.random() - 0.5) * along * 0.6);
      }
      s.speed *= 0.92;
    }
    for (const o of crates) {
      if (o === c || Math.abs(p.y - o.m.position.y) >= c.h + o.h - 0.08) continue; // one on top of the other: not a sideways touch
      const ox = p.x - o.m.position.x, oz = p.z - o.m.position.z;
      const od = Math.hypot(ox, oz), md = c.r + o.r;
      if (od < md && od > 0) {
        const push = (md - od) / 2, nx = ox / od, nz = oz / od;
        p.x += nx * push; p.z += nz * push;
        o.m.position.x -= nx * push; o.m.position.z -= nz * push;
        const rel = (c.v.x - o.v.x) * nx + (c.v.y - o.v.y) * nz;
        if (rel < 0) {
          c.v.x -= rel * nx * 0.5; c.v.y -= rel * nz * 0.5;
          o.v.x += rel * nx * 0.5; o.v.y += rel * nz * 0.5;
        }
      }
    }
    p.x += c.v.x * dt;
    p.z += c.v.y * dt;
    const hit = pushOut(p.x, p.z, c.r);
    if (hit) {
      p.x = hit.x; p.z = hit.z;
      const vn = c.v.x * hit.nx + c.v.y * hit.nz;
      if (vn < 0) { c.v.x -= 1.6 * vn * hit.nx; c.v.y -= 1.6 * vn * hit.nz; }
    }
    const o = { x: p.x, z: p.z };
    if (keepInWorld(o, c.r)) { p.x = o.x; p.z = o.z; c.v.multiplyScalar(-0.4); }
    const damp = Math.exp(-dt * (c.air ? 0.4 : 2.2));
    c.v.multiplyScalar(damp);
    c.spin *= damp;
    c.m.rotation.y += c.spin * dt;
    // Up and down
    const { floor, on, off } = crateFloor(c);
    if (c.air || p.y - c.h > floor + 0.02) {
      c.air = true;
      c.vy -= CRATE_G * dt;
      p.y += c.vy * dt;
      c.m.rotation.x += c.ang.x * dt;
      c.m.rotation.z += c.ang.z * dt;
      if (p.y - c.h <= floor) {
        p.y = floor + c.h;
        if (c.vy < -3) { c.vy = -c.vy * CRATE_BOUNCE; c.ang.multiplyScalar(0.5); }
        else {
          c.vy = 0; c.air = false; c.ang.set(0, 0, 0);
          if (on && off > 0.55) { // caught the edge of the one below: slide off it
            const ex = p.x - on.m.position.x, ez = p.z - on.m.position.z, ed = Math.hypot(ex, ez) || 1;
            c.v.x += (ex / ed) * 1.8; c.v.y += (ez / ed) * 1.8;
          }
        }
      }
    } else {
      p.y = floor + c.h;
      c.m.rotation.x = faceSnap(c.m.rotation.x, dt);
      c.m.rotation.z = faceSnap(c.m.rotation.z, dt);
    }
  }
}

// ── Dust ──────────────────────────────────────────────────────────────
let dustCarry = 0;
function emitDust(dt, info) {
  if (reduceMotion || !dust) return;
  const s = car.s;
  const { fx, fz } = info;
  const rx = -fz, rz = fx;
  if (info.event?.landed > 4) {
    const n = Math.min(40, Math.round(info.event.landed * 3.5));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      dust.userData.emit(s.x, s.y + 0.3, s.z, Math.cos(a) * sp, 0.6 + Math.random(), Math.sin(a) * sp, 1.6 + Math.random(), 1 + Math.random() * 0.6);
    }
  }
  if (s.air || !info.dirt) return;
  const v = Math.abs(s.speed);
  if (v < 3) return;
  dustCarry += dt * (v * 2 + Math.abs(s.steer) * v * 2.2);
  while (dustCarry >= 1) {
    dustCarry -= 1;
    for (const side of [-1, 1]) {
      const wx = s.x - fx * 1.5 + rx * 1.1 * side, wz = s.z - fz * 1.5 + rz * 1.1 * side;
      dust.userData.emit(
        wx, s.y + 0.25, wz,
        -fx * v * 0.12 + (Math.random() - 0.5) * 1.5 + rx * side * 0.6,
        0.5 + Math.random() * 0.8,
        -fz * v * 0.12 + (Math.random() - 0.5) * 1.5 + rz * side * 0.6,
        1.2 + Math.random() * 0.9,
        0.9 + Math.random() * 0.8,
      );
    }
  }
}

// ── Camera ────────────────────────────────────────────────────────────
// How far along the sightline from (x, y, z) to `to` (0–1) the first building taller than the line
// starts. Only colliders with a height count: signposts and tyre walls sit below the camera.
function cameraBlock(x, y, z, to) {
  let best = 1;
  const minX = Math.min(x, to.x), maxX = Math.max(x, to.x), minZ = Math.min(z, to.z), maxZ = Math.max(z, to.z);
  for (const k of colliders) {
    if (k.top === undefined || k.maxX < minX || k.minX > maxX || k.maxZ < minZ || k.minZ > maxZ) continue;
    // Into the box's own frame, then a slab test on the segment
    const ax = x - k.cx, az = z - k.cz, bx = to.x - k.cx, bz = to.z - k.cz;
    const p = [ax * k.c - az * k.s, ax * k.s + az * k.c], q = [bx * k.c - bz * k.s, bx * k.s + bz * k.c];
    const h = [k.hx + 0.5, k.hz + 0.5];
    if (Math.abs(p[0]) <= h[0] && Math.abs(p[1]) <= h[1]) continue; // parked against it: not in the way
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 2 && t0 <= t1; i++) {
      const d = q[i] - p[i];
      if (Math.abs(d) < 1e-9) { if (Math.abs(p[i]) > h[i]) t0 = 2; continue; }
      let ta = (-h[i] - p[i]) / d, tb = (h[i] - p[i]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 > t1 || t0 >= best) continue;
    if (y + (to.y - y) * t0 < k.top) best = t0; // the line passes under the roof there
  }
  return best;
}
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function placeCamera(dt, snap = false) {
  const s = car.s;
  const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  const back = 11 + Math.max(0, s.speed) * 0.12;
  const want = new THREE.Vector3(s.x - fx * back, s.y + 6.5, s.z - fz * back);
  // Never dip under a hill behind the car
  want.y = Math.max(want.y, groundHeight(want.x, want.z) + 2);
  // Reversing up to a building: pull in to this side of it rather than sit inside it
  const t = cameraBlock(s.x, s.y + 2.2, s.z, want);
  if (t < 1) {
    // With the car's back to the wall there's no room behind: rise over the car instead
    const keep = Math.max(t - 0.8 / back, 0.05);
    want.x = s.x + (want.x - s.x) * keep;
    want.z = s.z + (want.z - s.z) * keep;
    want.y += (1 - keep) * 6;
  }
  // Portrait: aim nearer and lower so the car sits above the driving buttons, not under them
  // While fireworks are up the camera looks up a little to take them in (the look target eases, so it tilts gently)
  const ahead = camera.aspect < 1 ? 1 : 4, lift = (camera.aspect < 1 ? 0.6 : 2.2) + (fireworks?.userData.active() ? 3.5 : 0);
  const look = new THREE.Vector3(s.x + fx * ahead, s.y + lift, s.z + fz * ahead);
  camPos.lerp(want, snap ? 1 : 1 - Math.exp(-dt * (t < 1 ? 20 : 5)));
  camLook.lerp(look, snap ? 1 : 1 - Math.exp(-dt * 8));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sun.position.set(s.x + 30, s.y + 55, s.z + 20);
  sun.target.position.set(s.x, s.y, s.z);
}

// ── Skip drawing districts out of sight (beyond the fog) ──────────────
function cullDistricts() {
  for (const [key, g] of Object.entries(districtGroups)) {
    const d = DISTRICTS[key];
    // The raceway is long and thin: measure to the track itself
    g.visible = key === "raceway"
      ? trackDistance(camera.position.x, camera.position.z) < 250
      : Math.hypot(camera.position.x - d.centre[0], camera.position.z - d.centre[1]) < 250 + d.radius;
  }
}

// ── Where am I ────────────────────────────────────────────────────────
let whereText = "";
function updateWhere() {
  const s = car.s;
  let text = null;
  for (const d of Object.values(DISTRICTS)) {
    if (d.plaza === false) continue;
    if (Math.hypot(s.x - d.centre[0], s.z - d.centre[1]) < d.radius + 3) text = d.name;
  }
  if (!text && inRaceway(s.x, s.z)) text = DISTRICTS.raceway.name;
  if (!text) {
    const info = roadInfo(s.x, s.z);
    if (info.d < 12) {
      const r = roads[info.road];
      const ahead = Math.cos(s.heading) * -info.tz + Math.sin(s.heading) * -info.tx > 0;
      text = `Road to ${DISTRICTS[ahead ? r.to : r.from].name}`;
    } else text = "Off the road";
  }
  if (text !== whereText) { whereText = text; $("where").textContent = text; }
}

// ── Pads and sheets ───────────────────────────────────────────────────
let activePad = null;
function checkPads() {
  let found = null;
  for (const p of pads) if (Math.hypot(car.s.x - p.pos.x, car.s.z - p.pos.z) < 3) found = p;
  if (found !== activePad) {
    activePad = found;
    $("prompt").hidden = !found;
    if (found) {
      const d = DISTRICTS[found.stop.district];
      $("prompt-label").textContent = `Open ${found.stop.name}`;
      $("prompt-district").textContent = d.name;
      $("prompt-btn").style.setProperty("--prompt-colour", "#" + new THREE.Color(tint(d.colour)).getHexString());
      $("prompt-hint").hidden = coarse;
    }
  }
}
$("prompt-btn").addEventListener("click", () => activePad && openStop(activePad.stop));

const dialogs = ["intro", "stop", "map", "race", "peers"].map($);
const anyOpen = () => dialogs.some((d) => d.open);
dialogs.forEach((d) => {
  d.addEventListener("close", () => {
    paused = anyOpen();
    if (celebrationPending && !paused) { const c = celebrationPending; celebrationPending = null; showCelebration(c); }
  });
  d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close()));
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
});
function show(d) {
  dialogs.forEach((o) => o !== d && o.open && o.close());
  releaseKeys();
  paused = true;
  d.showModal();
}

function fillStats(dl, ks) {
  dl.replaceChildren(
    ...ks.map((k) => {
      const div = document.createElement("div");
      div.append(
        Object.assign(document.createElement("dt"), { textContent: LABELS[k] }),
        Object.assign(document.createElement("dd"), { textContent: yardValues()[k] ?? (live ? live.values[k] ?? "Not available" : "Loading") }),
      );
      return div;
    }),
  );
}

let openKey = null;
function openStop(stop) {
  openKey = stop.key;
  $("stop-eyebrow").textContent = DISTRICTS[stop.district].name;
  $("stop-title").textContent = stop.name;
  $("stop-summary").textContent = stop.summary;
  $("stop-points").replaceChildren(...stop.points.map((t) => Object.assign(document.createElement("li"), { textContent: t })));
  $("stop-live").hidden = !stop.live;
  if (stop.live) fillStats($("stop-live"), stop.live);
  $("stop-docs").href = stop.docs;
  // Strike's own docs read "Docs: …"; a third-party page just names itself
  const own = stop.docs.startsWith("https://docs.strikefinance.org");
  $("stop-docs").querySelector(".br-button-label").textContent = own ? `Docs: ${stop.docsLabel}` : stop.docsLabel;
  const site = stop.site && stop.site !== stop.docs ? stop.site : null;
  $("stop-site").hidden = !site;
  if (site) {
    $("stop-site").href = site;
    $("stop-site").querySelector(".br-button-label").textContent = stop.siteLabel || `Visit ${stop.name}`;
  }
  show($("stop"));
}

let jumped = false; // the car was put down somewhere else this frame: tell the room so others see a snap, not a slide
function teleport(stop) {
  raceCancel("Lap cancelled: you jumped elsewhere");
  jumped = true;
  const pad = pads.find((p) => p.stop === stop);
  const dx = stop.pos[0] - pad.pos.x, dz = stop.pos[1] - pad.pos.z;
  Object.assign(car.s, { x: pad.pos.x, z: pad.pos.z, y: groundHeight(pad.pos.x, pad.pos.z), heading: Math.atan2(-dx, -dz), speed: 0, steer: 0, vy: 0, air: false });
  dialogs.forEach((d) => d.open && d.close());
  stepCar(car, keys, 0);
  placeCamera(0, true);
  checkPads();
  updateWhere();
}

// Drop the car on the road just outside a district's arch, facing in
function teleportDistrict(key) {
  if (key === "raceway") return toStart();
  raceCancel("Lap cancelled: you jumped elsewhere");
  jumped = true;
  const r = roads.find((x) => (x.kind === "spoke" || x.kind === "drive") && x.to === key);
  const t = Math.max(0, 1 - 16 / r.len);
  const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
  Object.assign(car.s, { x: p.x, z: p.z, y: groundHeight(p.x, p.z), heading: Math.atan2(-tan.x, -tan.z), speed: 0, steer: 0, vy: 0, air: false });
  dialogs.forEach((d) => d.open && d.close());
  stepCar(car, keys, 0);
  placeCamera(0, true);
  checkPads();
  updateWhere();
}

// Put the car down somewhere, stopped (the raceway's start)
function placeCar(x, z, heading) {
  jumped = true;
  Object.assign(car.s, { x, z, y: groundHeight(x, z), heading, speed: 0, steer: 0, vy: 0, air: false });
  dialogs.forEach((d) => d.open && d.close());
  stepCar(car, keys, 0);
  placeCamera(0, true);
  checkPads();
  updateWhere();
}
initRace({ show, place: placeCar, car, scene, record: (rec) => celebrate(rec, { self: true }) });

// ── A new #1 on the Raceway: fireworks for everyone here, a note, the board and ghost refreshed ──
// The setter hears it from their own post (while the finish sheet is up, so it waits for the sheet to close); everyone
// else hears it from the room. celebrateOnce keeps the two from doubling up.
let celebrated = null, celebrationPending = null;
function launchFireworks() {
  if (!fireworks) return;
  const s = car.s, fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  fireworks.userData.launch(s.x + fx * 70, s.y, s.z + fz * 70, { rx: -fz, rz: fx }); // in the sky ahead, whichever way you face
}
function showCelebration({ rec, self }) {
  peersNote(self ? `You're #1 on the Raceway with ${formatTime(rec.ms)}` : `${rec.name} just took #1 on the Raceway with ${formatTime(rec.ms)}`, 6000);
  launchFireworks();
}
function celebrate(rec, { self = false } = {}) {
  if (!rec || !Number.isFinite(rec.ms)) return;
  const r = celebrateOnce(celebrated, rec, Date.now());
  celebrated = r.seen;
  if (!r.fire) return;
  if (!self) { fetchTop(); refreshGhost(); }
  if (anyOpen()) celebrationPending = { rec, self };
  else showCelebration({ rec, self });
}

// ── Other visitors ────────────────────────────────────────────────────
initPeers({ scene, car, tierName: () => tierName, enabled: MULTIPLAYER && new URLSearchParams(location.search).get("mp") !== "0" });
const peerItem = (p) => {
  const li = document.createElement("li");
  li.className = "peers-item";
  const dot = document.createElement("i");
  dot.className = "peers-dot";
  dot.style.setProperty("--c", p.colour);
  li.append(dot, Object.assign(document.createElement("strong"), { textContent: p.name }), Object.assign(document.createElement("span"), { textContent: p.district }));
  return li;
};
let noteTimer = null;
function peersNote(text, ms = 2200) {
  if (anyOpen()) return;
  const el = $("peers-note");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function drawPeers(state) {
  const chip = $("peers-chip"), n = state.peers.length;
  chip.dataset.status = state.status;
  const label = (long, short) => { chip.querySelector(".chip-long").textContent = long; chip.querySelector(".chip-short").textContent = short; };
  if (state.status === "on") { chip.hidden = false; label(n ? `${n + 1} driving` : "Just you", String(n + 1)); }
  else if (state.status === "offline") { chip.hidden = false; label("Offline", "Off"); }
  else chip.hidden = true;
  chip.setAttribute("aria-label", state.status === "on" ? `${n + 1} driving now, open the list` : "Who's driving now");
  if ($("peers").open) fillPeersSheet(state);
  if ($("map").open) fillMapPeers(state);
}
function fillPeersSheet(state) {
  const list = $("peers-list"), st = $("peers-status");
  list.replaceChildren(...[...(state.me ? [{ ...state.me, district: `you · ${whereText}` }] : []), ...state.peers].map(peerItem));
  st.textContent = state.status === "on" ? (state.peers.length ? "" : "Nobody else right now. Send a friend the link.") : state.status === "offline" ? "The room is away. Reconnecting." : "Multiplayer is off for this session.";
  if (document.activeElement !== $("peers-name")) $("peers-name").value = state.me?.name || "";
}
function fillMapPeers(state) {
  const old = $("map-peers");
  if (old) old.remove();
  if (!state.peers.length) return;
  const wrap = document.createElement("div");
  wrap.id = "map-peers";
  const ul = document.createElement("ul");
  ul.className = "peers-list";
  ul.append(...state.peers.map(peerItem));
  wrap.append(Object.assign(document.createElement("p"), { className: "map-group", textContent: `Driving now: ${state.peers.length + 1}` }), ul);
  $("map-live").after(wrap);
}
onPeers((state, event) => {
  drawPeers(state);
  if (event?.type === "join" && event.name) peersNote(`${event.name} just arrived`);
  if (event?.type === "record") celebrate(event);
  if (event?.type === "named") {
    const why = { reserved: `"${event.asked}" is reserved here, so you're ${event.name}.`, rude: `That name won't do here, so you're ${event.name}.`,
      bad: `That name won't work (1 to 20 ordinary characters), so you're ${event.name}.`, taken: `Someone here is already ${event.asked}, so you're ${event.name}.` };
    $("peers-status").textContent = why[event.reason] || `You're ${event.name} on the road.`;
  }
  if (event?.type === "err" && event.error === "rate") $("peers-status").textContent = "One name change every 10 seconds.";
});
$("peers-chip").addEventListener("click", () => { fillPeersSheet(peersState()); show($("peers")); });
$("peers-form").addEventListener("submit", (e) => {
  e.preventDefault();
  setPeerName($("peers-name").value);
  $("peers-status").textContent = "Saving…";
});

function openMap() {
  raceCancel("Lap cancelled: Map view");
  if (Date.now() - raceBoard().at > 60_000) fetchTop();
  fillStats($("map-live"), ["volume24h", "openInterest", "markets", "maxLeverage"]);
  const groups = Object.entries(DISTRICTS).flatMap(([key, d]) => {
    if (!STOPS.some((s) => s.district === key)) return [];
    const h = document.createElement("div");
    h.className = "map-group-row";
    const label = Object.assign(document.createElement("p"), { className: "map-group", textContent: d.name });
    h.append(label);
    if (key !== "hub") {
      const race = key === "raceway";
      const go = Object.assign(document.createElement("button"), { type: "button", className: "map-read", textContent: race ? "Go to start" : "Drive in" });
      go.setAttribute("aria-label", race ? `Go to the ${d.name} start line` : `Go to the ${d.name} entrance`);
      go.addEventListener("click", () => teleportDistrict(key));
      h.append(go);
    }
    const ul = document.createElement("ul");
    ul.className = "map-list";
    ul.append(
      ...STOPS.filter((s) => s.district === key).map((s) => {
        const li = document.createElement("li");
        li.className = "map-item";
        const go = document.createElement("button");
        go.type = "button";
        go.className = "map-go";
        go.setAttribute("aria-label", `Go to ${s.name}`);
        go.append(Object.assign(document.createElement("strong"), { textContent: s.name }), Object.assign(document.createElement("span"), { textContent: s.summary }));
        // The raceway's card goes to the start line, as "Go to start" and "Race again" do; Read still opens its sheet
        go.addEventListener("click", () => (s.key === "raceway" ? toStart() : teleport(s)));
        const read = document.createElement("button");
        read.type = "button";
        read.className = "map-read";
        read.textContent = "Read";
        read.setAttribute("aria-label", `Read about ${s.name}`);
        read.addEventListener("click", () => openStop(s));
        li.append(go, read);
        return li;
      }),
    );
    if (key !== "raceway") return [h, ul];
    // The raceway's top 10, kept fresh while Map view is open
    const top = document.createElement("div");
    top.id = "map-race-top";
    top.append(Object.assign(document.createElement("p"), { className: "map-group", textContent: "Top 10 laps" }), topList());
    return [h, ul, top];
  });
  $("map-groups").replaceChildren(...groups);
  show($("map"));
  fillMapPeers(peersState());
}
$("open-map").addEventListener("click", openMap);
// The Fill Yard's figures tick every second while its sheet is open
onYardStats(() => { if ($("stop").open && openKey === "fillyard") fillStats($("stop-live"), ["fillsPerMin", "usd10m", "busiest"]); });
onBoard(() => {
  const el = $("map-race-top");
  if (el) el.replaceChildren(el.firstChild, topList());
});
$("intro-map").addEventListener("click", openMap);
$("start").addEventListener("click", () => $("intro").close());
$("intro-race").addEventListener("click", () => { $("intro").close(); toStart(); });
document.querySelectorAll("[data-quality]").forEach((b) =>
  b.addEventListener("click", () => {
    qualityPref = b.dataset.quality;
    try { localStorage.setItem("eco-quality", qualityPref); } catch {}
    tierName = qualityPref === "auto" ? tierName : qualityPref;
    applyTier();
    applyTheme();
  }),
);

// ── Live data ─────────────────────────────────────────────────────────
let cratesAdded = false;
async function refresh() {
  try {
    live = await fetchLive();
    if (!cratesAdded) {
      cratesAdded = true;
      const c = DISTRICTS.perps.centre;
      addCrates(scene, live.tickers, c[0], c[1], DISTRICTS.perps.colour);
      crates.forEach((cr) => cr.redraw(pal()));
    }
    boards.forEach((b) => b(pal()));
    setTicker(live.quotes, live.values);
    if ($("stop").open && openKey) {
      const s = STOPS.find((x) => x.key === openKey);
      if (s.live) fillStats($("stop-live"), s.live);
    }
    if ($("map").open) fillStats($("map-live"), ["volume24h", "openInterest", "markets", "maxLeverage"]);
  } catch (err) {
    console.warn("[eco] live data", err);
  }
}

// ── Auto quality: drop a tier if frames run slow while driving ────────
let slowAcc = 0, slowN = 0, lastDrop = 0;
function watchFrames(dt, t) {
  if (qualityPref !== "auto" || paused) return;
  slowAcc += dt; slowN++;
  if (slowN >= 120) {
    const avg = slowAcc / slowN;
    slowAcc = 0; slowN = 0;
    const i = ORDER.indexOf(tierName);
    if (avg > 1 / 38 && i < ORDER.length - 1 && t - lastDrop > 4) {
      tierName = ORDER[i + 1];
      lastDrop = t;
      applyTier();
      applyTheme();
      console.info(`[eco] quality → ${tierName} (avg ${(avg * 1000).toFixed(1)} ms)`);
    }
  }
}

// ── Loop ──────────────────────────────────────────────────────────────
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h, renderer.getPixelRatio());
  camera.aspect = w / h;
  camera.fov = w < h ? 68 : 55;
  camera.updateProjectionMatrix();
  dust?.userData.setScale(h * renderer.getPixelRatio());
  fireworks?.userData.setScale(h * renderer.getPixelRatio());
}
addEventListener("resize", resize);

const clock = new THREE.Clock();
let frameNo = 0;
let debugCam = false; // test hook: hold the camera still for overview shots
let cineCam = null; // test hook (clips): called after the chase camera each frame to place the camera itself
let arrival = null; // the opening flight owns the camera until it lands
function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 1 / 30);
  const t = clock.elapsedTime;
  if (!paused) {
    const px = car.s.x, pz = car.s.z;
    const info = stepCar(car, keys, dt);
    brakeLights(car, keys.down && car.s.speed > 0.3 && !car.s.air, post.on);
    raceTick(px, pz, car.s.x, car.s.z, car.s.heading, dt);
    sendPose(car.s, jumped, performance.now());
    jumped = false;
    emitDust(dt, info);
    checkPads();
    updateWhere();
  }
  stepCrates(dt);
  flowTick(dt);
  peersTick(dt, camera.position);
  dust?.userData.step(dt);
  fireworks?.userData.step(dt);
  grass?.userData.tick(t);
  sky.userData.tick(t, dt, camera.position);
  if (arrival?.active) arrival.tick(dt);
  else if (!debugCam) { placeCamera(dt); cineCam?.(dt); }
  if ((frameNo++ & 15) === 0) {
    if (!debugCam) cullDistricts();
    const here = inRaceway(car.s.x, car.s.z);
    raceHud(here);
    raceRefresh(here);
  }
  animated.forEach((f) => f(t));
  if (!reduceMotion) {
    const pulse = 0.65 + Math.sin(t * 3) * 0.2;
    pads.forEach((p) => (p.ring.material.opacity = p === activePad ? 1 : pulse));
  }
  post.render();
  watchFrames(raw, t);
  requestAnimationFrame(frame);
}

await document.fonts.ready;
await load.step("Painting the grass");
applyTier();
applyTheme();
stepCar(car, keys, 0);
placeCamera(0, true);
updateWhere();
refresh();
setInterval(refresh, 30_000);
requestAnimationFrame(frame);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await load.step("Fetching the car and live figures");
await Promise.all([
  sleep(700), // long enough to read as a moment, not a flicker
  Promise.race([Promise.allSettled([modelsReady(), car.ready]), sleep(8000)]),
]);
load.done();
await paint();
await paint(); // a drawn frame behind it
// The flight starts under the loader, so the first frame anyone sees is already moving
if (wantsArrival()) {
  const fx = -Math.sin(car.s.heading), fz = -Math.cos(car.s.heading);
  arrival = startArrival({
    camera, scene, sky, car, hq: DISTRICTS.hub.centre, stepCar,
    chase: { pos: camera.position.clone(), look: camLook.clone() },
    settle: () => { placeCamera(0, true); checkPads(); updateWhere(); },
    landed: () => { car.s.squash = 0.32; emitDust(0, { event: { landed: 10 }, fx, fz, dirt: false }); },
    onDone: () => show($("intro")),
  });
} else show($("intro"));
$("loader").classList.add("is-done");
setTimeout(() => $("loader").remove(), 450);

// Test hook for automated checks (no effect on play)
window.__eco = { car, teleport: (key) => teleport(STOPS.find((s) => s.key === key)), keys, jumps, groundHeight, placeCamera, colliders,
  overview: (x, y, z, lx = 0, lz = 0) => { debugCam = true; camera.far = 2000; camera.updateProjectionMatrix(); scene.fog = null; camera.position.set(x, y, z); camera.lookAt(lx, 0, lz); Object.values(districtGroups).forEach((g) => (g.visible = true)); },
  info: () => renderer.info.render, arrival: () => arrival, post, raceGates, toStart, inRaceway, renderer, scene, camera, yardInject: injectFills, ghostPreview, peersInject: injectPeers, peersMove: movePeer, peersState,
  cine: (fn) => { cineCam = fn; }, celebrate: (rec = { name: 'Aveli', ms: 24650 }, skip = 0) => { celebrate(rec); fireworks?.userData.skip(skip); }, fireworks };
