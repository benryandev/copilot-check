// Strike ecosystem world: scene assembly, input, camera, sheets and the frame loop.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS, STOPS, SPAWN, MULTIPLAYER } from "./content.js";
import { parseDeepLink, stopUrl } from "./deeplink-math.js";
import { guidesForStop } from "./guides.js";
import { mountGuide, closeGuide, onPopState, rewriteLinks, guideLinkText } from "./guide-sheet.js";
import { fetchLive, fetchKlines, fetchFunding, LABELS } from "./data.js";
import { normaliseFunding, pollDue } from "./windsock-math.js";
import { buildGround, buildRoads, buildJumps, buildPlazas, groundHeight, roadInfo, roads, jumps, WORLD, inRaceway, trackDistance, raceGates, WATER_LEVEL, jumpAt, riverInfo, setRidgeSeries, onRidge, ridgeSeries } from "./terrain.js";
import { buildWater, buildRiverBed, buildBridges } from "./water.js";
import { stuntBlend, stuntCamera, stuntTakeoff, stuntEase } from "./stunt-math.js";
import { initStick } from "./stick.js";
import { FOCUS, focusPose, focusBlend, nearBoard, atMarker } from "./focus-math.js";
import { boardImage, shareBoard, shareCaption } from "./board-share.js";
import { REALFI } from "./build.js";
import { footStep } from "./hud-math.js";
import { buildBlimp } from "./blimp.js";
import { buildRidge } from "./ridge.js";
import { buildWindsocks } from "./windsocks.js";
import { buildKerbs, buildLamps, buildBollards } from "./furniture.js";
import { createGrass, createDust, createFireworks } from "./effects.js";
import { createSky } from "./sky.js";
import {
  M, animated, pads, crates, boards, colliders, districtGroups,
  buildStops, buildBoard, buildRoadSigns, addCrates, addProps, recolourMaterials, setTicker, modelsReady,
} from "./build.js";
import { createCar, stepCar, pushOut, keepInWorld, CAR_R, brakeLights } from "./car.js";
import { tint } from "./colours.js";
import { buildRaceway, formatTime, boardPose, boardCanvas, boardMarker } from "./raceway.js";
import { celebrateOnce } from "./race-post.js";
import { createSound } from "./sound.js";
import { initRaceLive, raceEvent, raceLiveTick, onLap, raceLocked, raceOnGrid, raceLiveState, redrawRaceButtons, injectRaceLive, raceReset } from "./race-live.js";
import { initRace, raceTick, raceHud, raceCancel, raceRefresh, fetchTop, raceBoard, onBoard, topList, toStart, ghostPreview, refreshGhost } from "./race.js";
import { buildYard, flowTick, yardValues, onYardStats, injectFills } from "./flow.js";
import { initMonuments, applyMonuments, monumentsTick, monumentValues, onMonumentStats, injectSlpFills, monumentsState } from "./monuments.js";
import { initPeers, sendPose, peersTick, peersState, onPeers, setPeerName, injectPeers, movePeer, sendEmote, peerGroup } from "./peers.js";
import { initEmotes, openEmotes, closeEmotes, toggleEmotes, emoteKeydown, showBubble, emoteTick, activeEmotes } from "./emote.js";
import { loader, paint, wantsArrival, startArrival } from "./arrive.js";
import { createPost, toGlow } from "./post.js";
import { initArcade, openArcade, arcadeOpen, injectArcadeBoard } from "./arcade.js";
import { createFps } from "./fps.js";
import { TIERS, startTier, nextTier, SLOW_MS, WINDOW } from "./quality-math.js";
import { markLive, freezeStatic } from "./freeze.js";
import { mergeStatic, collapseStatic, disposeOrphans, pruneEmpty } from "./merge.js";

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
    water: 0x4fa3c7, waterDeep: 0x2b6f93, foam: 0xeaf6fb, spray: 0xdff1f8, mud: 0x8a7a5c, blimp: "#d6dbe1",
    panel: "#ffffff", text: "#0d0d0d", sub: "#4b5563", signBoard: "#f3e9d8", signInk: "#2b2118",
  },
  dark: {
    sky: 0x0b1016, grassA: 0x2d4b2a, grassB: 0x223a20, grassBase: 0x182a16, grassTip: 0x406c37,
    dirt: 0x9b8770, dirtTop: 0x6e5a43, dirtSide: 0x56462f, dust: 0x7a6a56, plaza: 0x181c21, cobbleA: 0x2b3139, cobbleB: 0x222730, mortar: 0x15181d,
    build: 0x252a31, trim: 0xf9fafb, wood: 0x5e4631,
    water: 0x1b3a52, waterDeep: 0x0f2435, foam: 0x7f9fb4, spray: 0x9fb8c8, mud: 0x3f3a2c, blimp: "#8d949c",
    panel: "#15191e", text: "#f9fafb", sub: "#9ca3af", signBoard: "#2a241c", signInk: "#f3e9d8",
  },
};
let dark = root.classList.contains("dark");
const pal = () => (dark ? PALETTE.dark : PALETTE.light);

// ── Quality tiers (quality-math.js) ───────────────────────────────────
// The saved choice from the Graphics setting, else a touch screen starts on phone and anything else on high; the auto
// rule below only ever steps down from there
let qualityPref = (() => { try { return localStorage.getItem("eco-quality") || "auto"; } catch { return "auto"; } })();
let tierName = startTier(qualityPref, coarse);
const tier = () => TIERS[tierName];

// ── Renderer, scene, camera, lights ───────────────────────────────────
const canvas = $("world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 320);
const post = createPost(renderer, scene, camera);
const fps = createFps({ renderer, tier: () => tierName }); // ?fps=1: the frame-time readout (fps.js), nothing otherwise
const hemi = new THREE.HemisphereLight(0xffffff, 0x8892a0, 1.1);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);
markLive(sun); markLive(sun.target); // the sun follows the car (placeCamera); the matrix freeze (freeze.js) leaves live objects alone

// ── World ─────────────────────────────────────────────────────────────
// Built in steps with a painted frame between them, so the loader reports real progress
const load = loader(5);
await load.step("Laying the roads");
// Ground segments grow with the world (it reached past Partners for the raceway), same density
let ground = buildGround(Math.round((tier().ground * WORLD.radius) / 280), pal());
const roadMesh = buildRoads(pal());
const jumpMesh = buildJumps(pal());
const plazaMesh = buildPlazas(pal());
const kerbMesh = buildKerbs(scene, pal()); // plaza furniture: the stone kerb ring at every rim (furniture.js); adds itself to the scene
const ridgeMesh = buildRidge(scene, pal()); // Chart Ridge: flat until the first candles land (ridge.js); adds itself to the scene
const windsocks = buildWindsocks(scene, pal(), { reduceMotion }); // funding windsocks on the Perps spoke: grey and limp until the first comparison lands (windsocks.js)
const bedMesh = buildRiverBed(pal()); // the river channel at a fine spacing; the water itself is built per tier below
let waterMesh = null;
scene.add(ground, roadMesh, jumpMesh, plazaMesh, bedMesh);
const sky = createSky({ reduceMotion });
scene.add(sky);
await load.step("Raising the districts");
buildStops(scene);
buildLamps(scene); // plaza furniture: a lamp beside every pad (needs the pads and the buildings' colliders)
initMonuments({ coarse, reduceMotion }); // the live centrepieces (monuments.js): attach to the pads' groups, poll the SLP fills
buildBollards(scene); // and bollards either side of every road mouth
buildRoadSigns(scene);
addProps(scene, { planters: tier().planters }); // includes the plaza benches and planters (furniture-math.js)
await load.step("Marking out the raceway");
buildRaceway(scene);
buildYard();
buildBridges(scene, pal());

let live = null;
const getLive = () => live;
Object.keys(DISTRICTS).forEach((k) => buildBoard(scene, k, getLive));
const blimp = buildBlimp(scene, pal(), { reduceMotion }); // the Strike blimp: brand only, no figures (Ben, 2 Nov)

let grass = null, dust = null, spray = null; // spray: the river's white dust
let sprayCount = 0; // QA counter
const fireworks = reduceMotion ? null : createFireworks(); // a new #1 on the Raceway
// Sound: synthesised, on after the first click, mute chip in the HUD. Silent under automation unless ?sound=1 asks.
const soundParam = new URLSearchParams(location.search).get("sound");
const sound = createSound({ enabled: soundParam === "1" || (soundParam !== "0" && !navigator.webdriver) });
const onCobbles = (x, z) => Object.values(DISTRICTS).some((d) => d.plaza !== false && d.centre && Math.hypot(x - d.centre[0], z - d.centre[1]) < d.radius);
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
  freezeStatic(grass); // the tier's new pieces sit at the origin for good, like everything frozen below
  if (dust) { scene.remove(dust); dust.geometry.dispose(); dust.material.dispose(); }
  dust = createDust(t.dust, pal());
  scene.add(dust);
  freezeStatic(dust);
  if (spray) { scene.remove(spray); spray.geometry.dispose(); spray.material.dispose(); }
  spray = createDust(Math.round(t.dust / 2), pal(), "spray");
  scene.add(spray);
  freezeStatic(spray);
  if (waterMesh) { scene.remove(waterMesh); waterMesh.geometry.dispose(); waterMesh.material.dispose(); }
  waterMesh = buildWater(pal(), { tier: tierName, reduceMotion });
  scene.add(waterMesh);
  freezeStatic(waterMesh);
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
  sound.setNight(dark);
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
  [ground, roadMesh, jumpMesh, plazaMesh, kerbMesh, bedMesh, waterMesh, grass, dust, spray, ridgeMesh, windsocks].forEach((o) => o?.userData.recolour?.(p));
}
$("theme").addEventListener("click", () => {
  dark = !dark;
  try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  applyTheme();
});

// ── Input ─────────────────────────────────────────────────────────────
const keys = { up: false, down: false, left: false, right: false };
const NO_KEYS = { up: false, down: false, left: false, right: false }; // what the car sees while locked on a race grid
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
  // Emotes: E opens the row; while it is open the digits, arrows, Enter and Escape are its
  if (emoteKeydown(e)) { e.preventDefault(); return; }
  if (e.code === "KeyE" && !e.metaKey && !e.ctrlKey && !e.altKey && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) { e.preventDefault(); toggleEmotes(); return; }
  if (focus.on && (e.code === "Escape" || KEYMAP[e.code])) { e.preventDefault(); focusEnd(); return; } // zoomed on the board: Escape or a driving key brings the camera back
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
const stick = initStick($("stick"), keys); // the steering stick on the left of the touch bar (stick.js)
function releaseKeys() {
  Object.keys(keys).forEach((k) => (keys[k] = false));
  stick.release();
  document.querySelectorAll(".pad-btn").forEach((b) => b.classList.remove("is-down"));
}

// ── Crates ────────────────────────────────────────────────────────────
// Crates: a 2D slide for the knock-about, plus real falling. A crate's floor is the ground or the top of whatever
// it overlaps enough, so they land on each other; knock the one underneath away and the rest drop; land on an edge
// and it slides off, which is what makes a heap rather than a tower. In the air it tumbles; at rest it settles onto
// a face. A crate still for a moment goes to sleep: it skips its physics until the car hits it, another crate pushes
// it or the one it sits on moves. Nearly every crate (the plaza benches and planters, the Perps crates, the yard's heap)
// is asleep nearly all the time, and the step was a third of the frame's script on a phone (4 Nov 2026).
const CRATE_G = 22, CRATE_BOUNCE = 0.28, QUARTER = Math.PI / 2, SLEEP_AFTER = 0.6;
const faceSnap = (a, dt) => { const t = Math.round(a / QUARTER) * QUARTER; return t + (a - t) * Math.exp(-dt * 10); };
const wake = (c) => { c.asleep = false; c.still = 0; };
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
      wake(c);
      const nx = dx / d, nz = dz / d;
      p.x = s.x + nx * minD;
      p.z = s.z + nz * minD;
      const along = Math.max(0, (fx * nx + fz * nz) * s.speed);
      if (along > 2 && performance.now() - (c.hitAt || 0) > 250) { c.hitAt = performance.now(); sound.hit(c.sound || c.kind || "crate", along / 24); }
      if (s.air) s.airHit = true; // a clipped crate or bale spoils the jump's boost
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
    if (c.asleep) continue; // at rest: only the car, a push or a moving floor (below) bring it back
    const wasX = p.x, wasY = p.y, wasZ = p.z;
    for (const o of crates) {
      if (o === c || Math.abs(p.y - o.m.position.y) >= c.h + o.h - 0.08) continue; // one on top of the other: not a sideways touch
      const ox = p.x - o.m.position.x, oz = p.z - o.m.position.z;
      const od = Math.hypot(ox, oz), md = c.r + o.r;
      if (od < md && od > 0) {
        const push = (md - od) / 2, nx = ox / od, nz = oz / od;
        if (o.asleep && push > 0.005) wake(o); // a real push wakes a sleeper; two wedged crates pushing each other apart each frame are let settle
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
        if (c.vy < -3) { c.vy = -c.vy * CRATE_BOUNCE; c.ang.multiplyScalar(0.5); } // silent: Ben (2 Nov) likes the hit sound when driving through crates, not the clunk of them landing off the belt
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
    // Moved this frame: whatever was resting on it has lost its floor, so it wakes and falls or slides as before
    if (Math.abs(p.x - wasX) + Math.abs(p.y - wasY) + Math.abs(p.z - wasZ) > 1e-4) {
      for (const o of crates) {
        if (o === c || !o.asleep) continue;
        const span = (c.r + o.r) * 0.62, q = o.m.position;
        if (Math.abs(q.x - p.x) < span && Math.abs(q.z - p.z) < span && Math.abs(q.y - o.h - (wasY + c.h)) < 0.3) wake(o);
      }
    }
    // Still for a moment on the ground: sleep, squared up on its face. Position is what counts, so a crate wedged between
    // the shed and a neighbour, pushed one way and back each frame, goes quiet rather than looping for ever
    if (c.air || Math.abs(c.spin) > 0.02 || Math.abs(p.x - wasX) + Math.abs(p.y - wasY) + Math.abs(p.z - wasZ) > 1e-3) c.still = 0;
    else if ((c.still = (c.still || 0) + dt) > SLEEP_AFTER) {
      c.asleep = true;
      c.v.set(0, 0); c.spin = 0;
      c.m.rotation.x = Math.round(c.m.rotation.x / QUARTER) * QUARTER;
      c.m.rotation.z = Math.round(c.m.rotation.z / QUARTER) * QUARTER;
    }
  }
}

// ── Dust ──────────────────────────────────────────────────────────────
let dustCarry = 0, baseFov = 55;
function emitDust(dt, info) {
  if (reduceMotion || !dust || info.wet) return; // in the river the spray takes over
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
  dustCarry += dt * (v * 2 + Math.abs(s.steer) * v * 2.2) * (s.boost > 0 ? 2.5 : 1); // a boost throws up more
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

// ── Spray ─────────────────────────────────────────────────────────────
// White spray off the wheels while wading, a ring of it on entry; also used for other visitors' cars (peers.js)
let sprayCarry = 0;
function sprayPuff(x, y, z, vx, vy, vz, size, life) { if (reduceMotion || !spray) return; spray.userData.emit(x, y, z, vx, vy, vz, size, life); sprayCount++; } // the one gate for every spray path, the QA hook included
function sprayBurst(x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.5;
    sprayPuff(x, y + 0.2, z, Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp, 1.6 + Math.random() * 1.2, 0.5 + Math.random() * 0.5);
  }
}
// Spray from a car's rear wheels: position, heading, speed share 0..1
function sprayWheels(x, y, z, heading, k) {
  const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = -fz, rz = fx;
  for (const side of [-1, 1]) {
    const wx = x - fx * 1.3 + rx * 1.1 * side, wz = z - fz * 1.3 + rz * 1.1 * side;
    sprayPuff(wx, y + 0.1, wz, -fx * k * 3 + (Math.random() - 0.5) + rx * side * (0.8 + Math.random()), 1.5 + Math.random() * 1.5 * k, -fz * k * 3 + (Math.random() - 0.5) + rz * side * (0.8 + Math.random()), 1.4 + Math.random() * 1.2, 0.5 + Math.random() * 0.4);
  }
}
function emitSpray(dt, info) {
  const s = car.s;
  if (info.event?.splash) sprayBurst(s.x, Math.max(s.y, WATER_LEVEL), s.z, Math.min(50, Math.round(info.event.splash * 4)));
  if (!info.wet || s.air) return;
  const v = Math.abs(s.speed);
  if (v < 2) return;
  sprayCarry += dt * v * 3;
  while (sprayCarry >= 1) { sprayCarry -= 1; sprayWheels(s.x, Math.max(s.y, WATER_LEVEL), s.z, s.heading, Math.min(1, v / 12)); } // from the surface, not the bed
}
// Another visitor's car in the river (peers.js decides when)
function sprayAt(x, z, heading, k) { sprayWheels(x, WATER_LEVEL, z, heading, k); }

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
let foot = { driving: false, t: 0 }; // the footer's driving state (hud-math.js)
// The epic jump's camera state lives up here because a snap (teleport, grid, placeCar) ends it; see stuntTick below
const stunt = { k: 0, on: false, cam: new THREE.Vector3(), look: new THREE.Vector3() };
function placeCamera(dt, snap = false) {
  if (snap) { stunt.k = 0; stunt.on = false; }
  if (snap && focus.on) { focusEnd(); focus.k = 0; } // a teleport (Map view, a guide, a race grid) ends the zoom at once // a teleport mid-flight must not leave the camera easing back from the river
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

// ── The epic jump's camera ────────────────────────────────────────────
// Off a stunt ramp the camera eases to a point down the river at bank height and watches the flight side-on; after the
// landing the chase camera eases back. Never under reduced motion.
function stuntStart(j) {
  if (reduceMotion) return;
  const other = jumps.find((o) => o.stunt && o !== j);
  const lipA = { x: j.ox + j.fx * j.length, z: j.oz + j.fz * j.length }, lipB = other ? { x: other.ox + other.fx * other.length, z: other.oz + other.fz * other.length } : lipA;
  const mid = { x: (lipA.x + lipB.x) / 2, z: (lipA.z + lipB.z) / 2 }, ri = riverInfo(mid.x, mid.z, 12);
  const c = stuntCamera(mid, ri.d < Infinity ? ri : { tx: j.rx, tz: j.rz }, WATER_LEVEL);
  stunt.cam.set(c.x, c.y, c.z);
  stunt.on = true;
}
function stuntTick(dt) {
  if (!stunt.on && stunt.k <= 0) return;
  if (!car.s.air) stunt.on = false;
  stunt.k = stuntBlend(stunt.k, dt, stunt.on && car.s.air);
  if (stunt.k <= 0) return;
  const s = car.s, k = stuntEase(stunt.k);
  camera.position.lerpVectors(camPos, stunt.cam, k);
  stunt.look.set(s.x, s.y + 0.8, s.z).lerp(camLook, 1 - k);
  camera.lookAt(stunt.look);
}

// ── The board zoom (Ben, 3 Nov 2026) ─────────────────────────────────
// The camera eases to a spot in front of the Raceway's top 10 board that fits all of it (focus-math.js), looking at its
// centre, while the car stops where it is; the HUD and the driving controls hide, a bar with Save and Back stays. Back,
// Escape or a driving key on a keyboard brings the chase camera back. Reduced motion snaps instead of easing.
const focus = { k: 0, on: false, cam: new THREE.Vector3(), look: new THREE.Vector3() };
function focusAim() {
  const bar = $("focus-bar");
  bar.hidden = false; // shown first, so the band above it can be measured: the board is framed above the bar, not under it
  const inset = Math.max(0, innerHeight - bar.getBoundingClientRect().top);
  const p = focusPose(boardPose(), baseFov, camera.aspect, { inset, viewH: innerHeight }); // baseFov, not camera.fov, which widens during a boost
  focus.cam.set(p.cam.x, p.cam.y, p.cam.z);
  focus.look.set(p.look.x, p.look.y, p.look.z);
}
function focusBoard() {
  if (focus.on) return;
  focusAim();
  car.s.speed = 0; releaseKeys(); closeEmotes();
  focus.on = true;
  if (reduceMotion) focus.k = 1;
  document.body.classList.add("is-focus");
  $("focus-bar").hidden = false;
  $("board-prompt")?.setAttribute("hidden", "");
}
function focusEnd() {
  if (!focus.on) return;
  focus.on = false;
  if (nearBoard(car.s, boardPose())) boardNo = true; // Back by the board: the card waits until the car leaves and comes back, as Not now does
  if (reduceMotion) focus.k = 0;
  document.body.classList.remove("is-focus");
  $("focus-bar").hidden = true;
}
function focusTick(dt) {
  if (!focus.on && focus.k <= 0) return;
  focus.k = focusBlend(focus.k, dt, focus.on);
  if (focus.k <= 0) return;
  const k = stuntEase(focus.k);
  camera.position.lerpVectors(camPos, focus.cam, k);
  camera.lookAt(camLook.clone().lerp(focus.look, k));
}
$("focus-back").addEventListener("click", focusEnd);
$("focus-save").addEventListener("click", () => shareBoard(boardImage(boardCanvas(), shareCaption(), { band: REALFI.green, ink: REALFI.paper }), { share: coarse })); // the share sheet on a touch screen, a download elsewhere (board-share.js)

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
      sound.chime();
      const d = DISTRICTS[found.stop.district];
      $("prompt-label").textContent = `Open ${found.stop.name}`;
      $("prompt-district").textContent = d.name;
      $("prompt-btn").style.setProperty("--prompt-colour", "#" + new THREE.Color(tint(d.colour)).getHexString());
      $("prompt-hint").textContent = coarse ? "Tap" : "Enter"; // on a touch screen the card itself is the button; without a cue it read as a label
    }
  }
}
$("prompt-btn").addEventListener("click", () => activePad && openStop(activePad.stop));

// The board prompt (Ben, 3 Nov 2026): parked in front of the top 10 board, a card offers the zoom. Not now holds it until the
// car leaves the board and comes back; it never shows over a pad prompt, a race invite, a sheet or the zoom itself.
let boardStill = 0, boardNo = false, boardAt = false;
function boardPromptTick(dt) {
  const near = nearBoard(car.s, boardPose());
  if (!near) boardNo = false;
  boardStill = Math.abs(car.s.speed) < FOCUS.still ? boardStill + dt : 0;
  boardAt = atMarker(car.s, boardMarker()); // on the marker the card shows at once; elsewhere in front, after a second still
  const show = (boardAt || (near && boardStill >= 1)) && near && !boardNo && !focus.on && !activePad && $("race-invite").hidden;
  if ($("board-prompt").hidden === show) $("board-prompt").hidden = !show;
}
$("board-zoom").addEventListener("click", focusBoard);
$("board-no").addEventListener("click", () => { boardNo = true; $("board-prompt").hidden = true; });

const dialogs = ["intro", "stop", "map", "race", "peers", "arcade", "guide"].map($);
const anyOpen = () => dialogs.some((d) => d.open);
dialogs.forEach((d) => {
  d.addEventListener("close", () => {
    paused = anyOpen();
    if (!paused) setWorldLabels(true);
    if (celebrationPending && !paused) { const c = celebrationPending; celebrationPending = null; showCelebration(c); }
  });
  d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close()));
  // A click on the backdrop closes the sheet. The dialog is also the target for clicks on its own padding (and the gaps
  // between its children), which on the arcade sheet sit right next to the game: only a click outside its box counts.
  d.addEventListener("click", (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  });
});
// The stop labels floating over the world (build.js makeLabel) hide while a sheet is open: a large one at the sheet's
// top edge read as the sheet's own heading. Visibility only, so nothing frozen moves.
function setWorldLabels(visible) {
  scene.traverse((o) => { if (o.isSprite && o.userData.isLabel) o.visible = visible; });
}
function show(d) {
  dialogs.forEach((o) => o !== d && o.open && o.close());
  releaseKeys();
  closeEmotes();
  $("board-prompt").hidden = true;
  paused = true;
  setWorldLabels(false);
  d.showModal();
  // The browser's default focus goes to the first control, which on a tall sheet sits past the fold (the sheet opened
  // scrolled past its title) and on the name forms raises a phone's keyboard: focus the heading instead, unless the
  // sheet names its own autofocus (the intro's Start driving, the arcade's frame).
  if (!d.querySelector("[autofocus]")) {
    const h = d.querySelector("h1, h2");
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  d.scrollTop = 0;
}

function fillStats(dl, ks) {
  dl.replaceChildren(
    ...ks.map((k) => {
      const div = document.createElement("div");
      div.append(
        Object.assign(document.createElement("dt"), { textContent: LABELS[k] }),
        Object.assign(document.createElement("dd"), { textContent: monumentValues()[k] ?? yardValues()[k] ?? (live ? live.values[k] ?? "Not available" : "Loading") }),
      );
      return div;
    }),
  );
}

let openKey = null;
function openStop(stop) {
  openKey = stop.key;
  if (stop.arcade) { openArcade(stop); return; } // a cabinet: the game in its own sheet
  $("stop").querySelector("[data-close] .br-button-label").textContent = "Keep driving";
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
  resetLinkChip(stopUrl(location.origin, stop.key));
  const guides = guidesForStop(stop.key);
  $("stop-guides").hidden = !guides.length;
  // One guide reads "Read the guide" (the sheet is already about it; the full title rides on the link's aria-label and
  // is written out on the stops page); a stop with several carries each guide's short title, so the pills stay one line.
  $("stop-guides").replaceChildren(...guides.map((g) => {
    const a = Object.assign(document.createElement("a"), { className: "br-button br-button--secondary", href: g.path, textContent: guideLinkText(guides, g) });
    a.setAttribute("aria-label", `Read the guide: ${g.title}`);
    a.setAttribute("data-guide-link", "");
    return a;
  }));
  show($("stop"));
}

// Guides inside the world: any link marked data-guide-link (a stop sheet's "Read the guide", the intro's read line,
// links inside a mounted guide) opens the page in the #guide sheet with the URL updated; see guide-sheet.js.
// The guide and stops stylesheets load on demand (link elements from this origin, so the CSP is untouched).
let savedTitle = null;
const cssReady = {};
const ensureCss = (href) => (cssReady[href] ||= new Promise((resolve) => {
  const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
  link.onload = link.onerror = () => resolve();
  document.head.append(link);
}));
async function openGuide(url, { pushHistory = true } = {}) {
  const isStops = url.startsWith("/ecosystem/stops/");
  await Promise.all([ensureCss("/ecosystem/guides/guides.css"), isStops ? ensureCss("/ecosystem/stops/stops.css") : null]);
  const r = await mountGuide(url, {
    fetch: (u, o) => fetch(u, o), parse: (h) => new DOMParser().parseFromString(h, "text/html"), history, worldUrl: location.href, pushHistory,
    mount: (title, main) => {
      const node = document.importNode(main, true);
      rewriteLinks(node, new URL(url, location.origin).href);
      const h1 = node.querySelector("h1") || node.prepend(Object.assign(document.createElement("h1"), { textContent: title })) || node.querySelector("h1"); // the stops page keeps its h1 in its header
      h1.id = "guide-title";
      $("guide-eyebrow").textContent = isStops ? "Every stop as text" : url === "/ecosystem/guides/" ? "Strike guides" : "Strike guide";
      $("guide-main").replaceChildren(node);
      savedTitle ??= document.title;
      document.title = `${title} · Strike ecosystem`;
      show($("guide"));
      $("guide").scrollTop = 0;
    },
  });
  if (r.navigate) location.href = r.navigate;
}
document.addEventListener("click", (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const anchor = e.target.closest("a[data-guide-anchor]");
  if (anchor) { // a fragment inside the mounted page: scroll within the sheet, never a navigation
    e.preventDefault();
    const id = anchor.getAttribute("data-guide-anchor");
    const target = id && $("guide-main").querySelector(`#${CSS.escape(id)}`);
    if (target) target.scrollIntoView({ block: "start" });
    return;
  }
  const drive = e.target.closest("a[data-guide-drive]");
  if (drive) { // "Drive there" inside the in-world stops sheet: close the sheet and move the car, no reload
    e.preventDefault();
    const link = parseDeepLink(drive.getAttribute("data-guide-drive"), STOPS.map((s) => s.key), Object.keys(DISTRICTS));
    $("guide").close();
    if (link.kind === "start") { toStart(); paused = false; }
    else if (link.kind === "district") { if (link.key === "hub") placeCar(SPAWN.x, SPAWN.z, SPAWN.heading); else teleportDistrict(link.key); paused = false; }
    else if (link.kind === "stop") { const st = STOPS.find((x) => x.key === link.key); teleport(st); openStop(st); }
    return;
  }
  const a = e.target.closest("a[data-guide-link]");
  if (!a) return;
  e.preventDefault();
  openGuide(new URL(a.href).pathname);
});
$("guide").addEventListener("close", () => {
  closeGuide({ history });
  if (savedTitle) { document.title = savedTitle; savedTitle = null; }
});
window.addEventListener("popstate", (e) => onPopState(e.state, { isOpen: () => $("guide").open, close: () => $("guide").close(), restoreTitle: () => {}, open: (u) => openGuide(u, { pushHistory: false }) }));

// "Copy link" on the stop sheet: the clipboard when the browser allows it, otherwise a read-only field holding the
// URL, selected, so the visitor can copy it by hand (text inside a button is not selectable everywhere). Never throws.
let linkChipTimer = 0;
function resetLinkChip(url) {
  const b = $("stop-link"), f = $("stop-link-url");
  b.dataset.url = url;
  b.hidden = false;
  b.querySelector(".br-button-label").textContent = "Copy link";
  f.value = url;
  f.hidden = true;
  clearTimeout(linkChipTimer);
}
$("stop-link").addEventListener("click", async () => {
  const b = $("stop-link"), label = b.querySelector(".br-button-label"), url = b.dataset.url;
  try {
    if (!navigator.clipboard) throw new Error("no clipboard");
    await navigator.clipboard.writeText(url);
    label.textContent = "Link copied";
    clearTimeout(linkChipTimer);
    linkChipTimer = setTimeout(() => { label.textContent = "Copy link"; }, 2000);
  } catch {
    const f = $("stop-link-url");
    b.hidden = true;
    f.hidden = false;
    f.focus();
    f.select();
  }
});

let jumped = false; // the car was put down somewhere else this frame: tell the room so others see a snap, not a slide
let raceNoteTimer = 0;
function raceNote(text, ms = 2000) {
  const el = $("race-note");
  el.textContent = text; el.hidden = false;
  clearTimeout(raceNoteTimer);
  raceNoteTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const onGridNote = () => raceNote("You're on the grid: the race is about to start", 2500);
function teleport(stop) {
  if (raceOnGrid()) return onGridNote();
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
  if (raceOnGrid()) return onGridNote();
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
initRace({ show, place: placeCar, car, scene, record: (rec) => celebrate(rec, { self: true }), sound: (cue) => sound[cue]?.(), live: onLap, focus: focusBoard });
initArcade({ show, sound, isDark: () => dark });
initEmotes({ send: sendEmote, myGroup: car.group, groupFor: peerGroup });
initRaceLive({ place: placeCar, note: raceNote, cancelLap: () => raceCancel("Lap cancelled: on the grid"), closeSheets: () => dialogs.forEach((d) => d.open && d.close()), sound, onRaceway: () => inRaceway(car.s.x, car.s.z) });

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
  sound.fanfare();
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
initPeers({ scene, car, tierName: () => tierName, enabled: MULTIPLAYER && new URLSearchParams(location.search).get("mp") !== "0", spray: sprayAt });
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
  list.replaceChildren(...[...(state.me ? [{ ...state.me, district: ownDistrict(state.me) }] : []), ...state.peers].map(peerItem));
  st.textContent = state.status === "on" ? (state.peers.length ? "" : "Nobody else right now. Send a friend the link.") : state.status === "offline" ? "The room is away. Reconnecting." : "Multiplayer is off for this session.";
  if (document.activeElement !== $("peers-name")) $("peers-name").value = state.me?.name || "";
}
// Your own row: the "you" tag only once a name is chosen (the default name is "You", so the row read "You you")
const ownDistrict = (me) => (me.name === "You" ? whereText : `you · ${whereText}`);
function fillMapPeers(state) {
  const old = $("map-peers");
  if (old) old.remove();
  if (!state.peers.length) return;
  const wrap = document.createElement("div");
  wrap.id = "map-peers";
  const ul = document.createElement("ul");
  ul.className = "peers-list";
  ul.append(...[...(state.me ? [{ ...state.me, district: ownDistrict(state.me) }] : []), ...state.peers].map(peerItem)); // the count above includes you, so the list does too
  wrap.append(Object.assign(document.createElement("p"), { className: "map-group", textContent: `Driving now: ${state.peers.length + 1}` }), ul);
  $("map-live").after(wrap);
}
onPeers((state, event) => {
  drawPeers(state);
  if (event?.type === "join" && event.name) peersNote(`${event.name} just arrived`);
  if (event?.type === "record") celebrate(event);
  if (event?.type === "emote") showBubble(event.id, event.e);
  if (event?.type === "race") raceEvent(event.m);
  if (event?.type === "offline" || event?.type === "on") raceReset(); // a new socket is a new identity: any race is over for us
  if (event?.type === "err") {
    const why = { race_full: "The grid is full (8). You can watch.", race_running: "A race is already on. Wait for it to finish.", race_none: "That race is over." }[event.error];
    if (why) raceNote(why, 3000);
  }
  redrawRaceButtons();
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
onYardStats(() => { if ($("stop").open && (openKey === "fillyard" || openKey === "monument-developers")) fillStats($("stop-live"), STOPS.find((x) => x.key === openKey).live); });
onMonumentStats(() => { const ks = $("stop").open && openKey?.startsWith("monument-") ? STOPS.find((x) => x.key === openKey)?.live : null; if (ks) fillStats($("stop-live"), ks); }); // the Orrery has no live keys: nothing to refresh
onBoard(() => {
  const el = $("map-race-top");
  if (el) el.replaceChildren(el.firstChild, topList());
});
$("intro-map").addEventListener("click", openMap);
$("start").addEventListener("click", () => $("intro").close());
$("intro-race").addEventListener("click", () => { $("intro").close(); toStart(); });
// Browsers allow sound only after a gesture: the first click or key on the page starts the context
for (const id of ["start", "intro-race", "intro-map", "sound-chip"]) $(id).addEventListener("click", () => sound.unlock());
addEventListener("keydown", () => sound.unlock(), { once: false });
addEventListener("pointerdown", () => sound.unlock());
// The mute chip (HUD) and the Sound / Music switches (Map view) all show one state
const soundChip = $("sound-chip");
soundChip.hidden = typeof AudioContext === "undefined";
// Writes only what changed: rewriting the label's text node under a pressed pointer can swallow the click
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const setAttr = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
function drawSound() {
  const st = sound.state();
  setAttr(soundChip, "aria-pressed", String(st.on));
  setAttr(soundChip, "aria-label", st.on ? "Mute sound" : "Unmute sound");
  setText(soundChip.querySelector(".chip-long"), st.on ? "Sound" : "Muted");
  document.querySelectorAll("[data-sound]").forEach((b) => setAttr(b, "aria-pressed", String((b.dataset.sound === "on") === st.on)));
  document.querySelectorAll("[data-music]").forEach((b) => setAttr(b, "aria-pressed", String((b.dataset.music === "on") === st.music)));
}
sound.onChange(drawSound);
drawSound();
if (new URLSearchParams(location.search).get("mix") === "1") import("./mix.js").then((m) => m.mountMixer(sound)); // tuning panel, by request only
soundChip.addEventListener("click", () => sound.setOn(!sound.state().on));
document.querySelectorAll("[data-sound]").forEach((b) => b.addEventListener("click", () => { sound.unlock(); sound.setOn(b.dataset.sound === "on"); }));
document.querySelectorAll("[data-music]").forEach((b) => b.addEventListener("click", () => { sound.unlock(); sound.setMusic(b.dataset.music === "on"); }));
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
// Chart Ridge: hourly closes, fetched at most every five minutes, applied when the hour turns (or at first) and only
// while the local car is clear of the ridge, so the ground never moves under anyone (remote cars read the same
// height function on their own screens)
let ridgePending = null, ridgeHour = -1, ridgeFetchedAt = 0;
const hourNow = () => Math.floor(Date.now() / 3.6e6);
async function pollRidge() {
  if (Date.now() - ridgeFetchedAt < 5 * 60_000) return;
  ridgeFetchedAt = Date.now();
  const closes = await fetchKlines();
  if (closes.length >= 2 && (hourNow() !== ridgeHour || !ridgeSeries().profile)) ridgePending = closes;
}
function applyRidge(closes) {
  setRidgeSeries(closes);
  ridgeMesh.userData.refresh();
  grass?.userData.reseat?.(); // tufts in the corridor follow the ground
  ridgeHour = hourNow();
  ridgePending = null;
}
setInterval(() => { if (ridgePending && !onRidge(car.s.x, car.s.z)) applyRidge(ridgePending); }, 1000);
// Funding windsocks: Strike's comparison, fetched at most every five minutes and applied at once (nothing on the road
// or under a car moves; the socks ease to the new rates)
let fundingFetchedAt = 0, fundingOk = false;
async function pollFunding() {
  if (!pollDue(Date.now(), fundingFetchedAt, fundingOk)) return; // five minutes after a good fetch, thirty seconds after a failed one
  fundingFetchedAt = Date.now();
  const map = normaliseFunding(await fetchFunding());
  fundingOk = !!map;
  if (map) windsocks.userData.apply(map);
}

async function refresh() {
  pollRidge();
  pollFunding();
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
    applyMonuments(live.monuments);
    if ($("stop").open && openKey) {
      const s = STOPS.find((x) => x.key === openKey);
      if (s.live) fillStats($("stop-live"), s.live);
    }
    if ($("map").open) fillStats($("map-live"), ["volume24h", "openInterest", "markets", "maxLeverage"]);
  } catch (err) {
    console.warn("[eco] live data", err);
  }
}

// ── Auto quality: drop a tier when frames run slow while driving (the rule is in quality-math.js) ──
let slowN = 0, frameN = 0, lastDrop = 0, warmed = false;
function watchFrames(dt, t) {
  if (qualityPref !== "auto" || paused) return;
  frameN++;
  if (dt * 1000 > SLOW_MS) slowN++;
  if (frameN < WINDOW) return;
  const share = slowN / frameN;
  slowN = 0; frameN = 0;
  if (!warmed) { warmed = true; return; } // the first window after the sheet closes is shaders compiling and models landing
  const next = nextTier(share, tierName, t, lastDrop);
  if (!next) return;
  tierName = next;
  lastDrop = t;
  applyTier();
  applyTheme();
  console.info(`[eco] quality → ${tierName} (${Math.round(share * 100)}% of frames over ${SLOW_MS} ms)`);
}

// ── Loop ──────────────────────────────────────────────────────────────
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h, renderer.getPixelRatio());
  camera.aspect = w / h;
  baseFov = w < h ? 68 : 55;
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
  if (focus.on) focusAim(); // the board zoom's pose depends on the aspect
  dust?.userData.setScale(h * renderer.getPixelRatio());
  spray?.userData.setScale(h * renderer.getPixelRatio());
  fireworks?.userData.setScale(h * renderer.getPixelRatio());
  if (arcadeOpen()) post.render(); // the loop isn't drawing behind the arcade sheet; setSize cleared the canvas, so draw once
}
addEventListener("resize", resize);

const clock = new THREE.Clock();
let frameNo = 0;
let debugCam = false; // test hook: hold the camera still for overview shots
let cineCam = null; // test hook (clips): called after the chase camera each frame to place the camera itself
let arrival = null; // the opening flight owns the camera until it lands
function frame() {
  fps?.begin();
  const raw = clock.getDelta();
  const dt = Math.min(raw, 1 / 30);
  const t = clock.elapsedTime;
  if (!paused) {
    const px = car.s.x, pz = car.s.z, wasAir = car.s.air;
    const info = stepCar(car, raceLocked() || focus.on ? NO_KEYS : keys, dt);
    if (info.event) car.lastEvent = info.event; // QA scripts read it
    { const j = jumpAt(px, pz) || jumpAt(px - info.fx, pz - info.fz); if (stuntTakeoff(wasAir, car.s.air, j, info.fx, info.fz)) stuntStart(j); } // off a stunt ramp, heading up it: the side-on camera
    brakeLights(car, keys.down && car.s.speed > 0.3 && !car.s.air, post.on, info.boost > 0);
    fps?.mark("car"); // the ?fps=1 readout's sections: the car's step
    sound.tick(dt, { speed: car.s.speed, throttle: (keys.up ? 1 : 0) - (keys.down ? 1 : 0), surface: car.s.air ? "air" : info.wet ? "water" : info.dirt ? "dirt" : onCobbles(car.s.x, car.s.z) ? "cobble" : "grass", boost: info.boost > 0 });
    fps?.mark("sound"); // the engine and road sounds following the car
    if (info.event?.landed > 4) sound.land(Math.min(1, info.event.landed / 14));
    if (info.event?.splash) sound.splash(Math.min(1, info.event.splash / 16));
    if (info.event?.boost) { sound.boost(); if (inRaceway(car.s.x, car.s.z)) raceNote("Boost!", 900); }
    // The chase camera widens a little while boosting, and comes back
    const wantFov = baseFov + (info.boost > 0 ? 7 : 0);
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 6)); camera.updateProjectionMatrix(); }
    raceTick(px, pz, car.s.x, car.s.z, car.s.heading, dt);
    raceLiveTick();
    sendPose(car.s, jumped, performance.now());
    jumped = false;
    emitDust(dt, info);
    emitSpray(dt, info);
    checkPads();
    boardPromptTick(dt);
    updateWhere();
  }
  foot = footStep(foot, paused ? 0 : car.s.speed, dt); // the footer fades while driving and comes back after a moment still
  if (foot.driving !== document.body.classList.contains("is-driving")) document.body.classList.toggle("is-driving", foot.driving);
  if (paused) sound.pauseEngine(); // a sheet is open: engine off, not idling behind the text
  fps?.mark("chores"); // the race, the pose sent to the room, dust and spray emitted, pads and the place name
  stepCrates(dt);
  fps?.mark("crates");
  flowTick(dt);
  monumentsTick(dt);
  peersTick(dt, camera.position);
  emoteTick();
  fps?.mark("world"); // the Fill Yard, the monuments, other visitors, emotes
  dust?.userData.step(dt);
  spray?.userData.step(dt);
  fireworks?.userData.step(dt);
  grass?.userData.tick(t);
  waterMesh?.userData.tick(t);
  blimp.userData.tick(t);
  sky.userData.tick(t, dt, camera.position);
  fps?.mark("fx"); // dust, spray, fireworks, grass, water, the blimp, the sky
  if (arrival?.active) arrival.tick(dt);
  else if (!debugCam) { placeCamera(dt); stuntTick(dt); focusTick(dt); cineCam?.(dt); }
  if ((frameNo++ & 15) === 0) {
    if (!debugCam) cullDistricts();
    const here = inRaceway(car.s.x, car.s.z);
    raceHud(here);
    raceRefresh(here);
    redrawRaceButtons();
  }
  animated.forEach((f) => f(t));
  if (!reduceMotion) {
    const pulse = 0.65 + Math.sin(t * 3) * 0.2;
    pads.forEach((p) => (p.ring.material.opacity = p === activePad ? 1 : pulse));
    boardMarker().ring.material.opacity = boardAt ? 1 : pulse; // the board's marker pulses like a pad
  }
  fps?.draw();
  if (!arcadeOpen()) post.render(); // the game in the arcade sheet gets the GPU; the world holds its last frame behind it
  watchFrames(raw, t);
  fps?.end();
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
// Nearly nothing above moves once built: freeze its matrices (freeze.js), now and again once the Blender models have replaced
// their blockouts (the models' static nodes are frozen then; the live ones were marked when their motion was attached)
freezeStatic(scene);
// Then each district's static geometry becomes one mesh per material (merge.js), so does what stands outside the districts, and
// the pieces inside each thing that moves become one mesh
function mergeWorld() {
  const districts = new Set(Object.values(districtGroups));
  const removed = Object.values(districtGroups).flatMap((g) => mergeStatic(g));
  removed.push(...mergeStatic(scene, (o) => districts.has(o)));
  const movers = []; // the live groups (a prop, a stack of coins, the blimp): their static pieces become one mesh each
  scene.traverse((o) => { if (o.userData.live === true && o.children.length) movers.push(o); });
  for (const o of movers) removed.push(...collapseStatic(o));
  disposeOrphans(scene, removed);
  pruneEmpty(scene, (o) => districts.has(o));
}
modelsReady().then(() => { freezeStatic(scene); mergeWorld(); });
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
// A deep link (?stop=, ?district=) lands straight on the place with no flight and no intro; wantsArrival() is not
// consulted, so its once-per-tab flag stays unset and a later plain visit still gets the arrival.
// The world starts paused and only a closing sheet unpauses it, so the links that open no sheet unpause here.
// Strike HQ has no spoke road of its own (teleportDistrict needs one), so its link lands at the spawn by the hub.
const deepLink = parseDeepLink(location.search, STOPS.map((s) => s.key), Object.keys(DISTRICTS));
if (deepLink.kind === "start") { toStart(); paused = false; }
else if (deepLink.kind === "district") { if (deepLink.key === "hub") placeCar(SPAWN.x, SPAWN.z, SPAWN.heading); else teleportDistrict(deepLink.key); paused = false; }
else if (deepLink.kind === "stop") { const s = STOPS.find((x) => x.key === deepLink.key); teleport(s); openStop(s); $("stop").querySelector("[data-close] .br-button-label").textContent = "Start driving"; } // nobody has driven yet; openStop puts "Keep driving" back next time
// The flight starts under the loader, so the first frame anyone sees is already moving
else if (wantsArrival()) {
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
window.__eco = { monuments: { state: monumentsState, injectSlpFills }, car, teleport: (key) => teleport(STOPS.find((s) => s.key === key)), keys, stick, focusBoard, focusEnd, focus, boardPose, boardMarker, camera, project: (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }; }, jumps, groundHeight, placeCamera, placeCar, colliders, pads, deepLink, paused: () => paused,
  blimp: { setAngle: (deg) => blimp.userData.setAngle(deg == null ? null : (deg * Math.PI) / 180), pose: () => blimp.userData.pose(), setLivery: (n) => blimp.userData.setLivery(n), liveries: () => blimp.userData.liveries },
  stunt: () => { const j = jumps.find((o) => o.stunt && o.fx < 0); const lip = { x: j.ox + j.fx * j.length, z: j.oz + j.fz * j.length }; Object.assign(car.s, { x: lip.x + j.fx * 6, z: lip.z, heading: Math.atan2(-j.fx, -j.fz), speed: 24, air: true, vy: 2, airTime: 0.3 }); car.s.y = groundHeight(lip.x, lip.z) + j.height + 1.2; placeCamera(0, true); stuntStart(j); stunt.k = 1; stuntTick(0); } /* the snap first: it resets the stunt */, stuntState: () => ({ k: stunt.k, on: stunt.on }), // QA: mid-flight over the river with the side-on camera up
  splash: (age = 0.35) => { sprayBurst(car.s.x, Math.max(car.s.y, WATER_LEVEL), car.s.z, 40); spray?.userData.step(age); } /* pre-aged, so a still catches the burst spread rather than under the car */, sprayCount: () => sprayCount, // river QA: an entry burst on demand, and how many puffs have flown
  overview: (x, y, z, lx = 0, lz = 0) => { debugCam = true; camera.far = 2000; camera.updateProjectionMatrix(); scene.fog = null; camera.position.set(x, y, z); camera.lookAt(lx, 0, lz); Object.values(districtGroups).forEach((g) => (g.visible = true)); },
  info: () => renderer.info.render, arrival: () => arrival, post, raceGates, toStart, inRaceway, renderer, scene, camera, yardInject: injectFills, ghostPreview, peersInject: injectPeers, peersMove: movePeer, peersState,
  ridge: { set: (closes) => applyRidge(closes), series: () => ridgeSeries() }, // Chart Ridge: QA and clips set a series by hand
  windsocks: { set: (raw) => windsocks.userData.apply(normaliseFunding(raw)), state: () => windsocks.userData.state() }, // funding windsocks: QA sets a comparison by hand
  cine: (fn) => { cineCam = fn; }, celebrate: (rec = { name: 'Aveli', ms: 24650 }, skip = 0) => { celebrate(rec); fireworks?.userData.skip(skip); }, fireworks, sound,
  raceLive: raceLiveState, raceLap: onLap, raceLiveInject: injectRaceLive, boost: (secs = 1.4) => { car.s.boost = secs; },
  arcade: (key = "arcade-flappy-coin") => openStop(STOPS.find((s) => s.key === key)), arcadeBoard: injectArcadeBoard,
  emote: { open: openEmotes, close: closeEmotes, show: showBubble, send: (e) => { showBubble("me", e); sendEmote(e); }, active: activeEmotes }, peerGroup,
  fps, tiers: TIERS, quality: (name) => { tierName = name; applyTier(); applyTheme(); } }; // QA: the ?fps=1 figures; a tier applied by name as the Graphics setting applies it, nothing saved
