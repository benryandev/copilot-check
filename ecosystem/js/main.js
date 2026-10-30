// Strike ecosystem world: scene assembly, input, camera, sheets and the frame loop.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS, STOPS, SPAWN } from "./content.js";
import { fetchLive, LABELS } from "./data.js";
import { buildGround, buildRoads, buildJumps, buildPlazas, groundHeight, roadInfo, roads, jumps } from "./terrain.js";
import { createGrass, createDust } from "./effects.js";
import {
  M, animated, pads, crates, boards, colliders, districtGroups,
  buildStops, buildBoard, buildRoadSigns, addCrates, recolourMaterials,
} from "./build.js";
import { createCar, stepCar, pushOut, keepInWorld, CAR_R } from "./car.js";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;

// ── Palettes ──────────────────────────────────────────────────────────
const PALETTE = {
  light: {
    sky: 0xcfe0ec, grassA: 0x93bb6c, grassB: 0x75a056, grassBase: 0x4f7d3b, grassTip: 0xaed383,
    dirt: 0xf6ead6, dirtTop: 0xc9a97e, dirtSide: 0xa9896a, dust: 0xd9c5a3, plaza: 0xeef1f4,
    build: 0xf5f6f8, trim: 0x0d0d0d, wood: 0x8a6a48,
    panel: "#ffffff", text: "#0d0d0d", sub: "#4b5563", signBoard: "#f3e9d8", signInk: "#2b2118",
  },
  dark: {
    sky: 0x0b1016, grassA: 0x2d4b2a, grassB: 0x223a20, grassBase: 0x182a16, grassTip: 0x406c37,
    dirt: 0x9b8770, dirtTop: 0x6e5a43, dirtSide: 0x56462f, dust: 0x7a6a56, plaza: 0x181c21,
    build: 0x252a31, trim: 0xf9fafb, wood: 0x5e4631,
    panel: "#15191e", text: "#f9fafb", sub: "#9ca3af", signBoard: "#2a241c", signInk: "#f3e9d8",
  },
};
let dark = root.classList.contains("dark");
const pal = () => (dark ? PALETTE.dark : PALETTE.light);

// ── Quality tiers ─────────────────────────────────────────────────────
const TIERS = {
  high: { ratio: 2, shadow: 2048, grass: 14000, ground: 200, dust: 420 },
  medium: { ratio: 1.5, shadow: 1024, grass: 7000, ground: 150, dust: 280 },
  low: { ratio: 1, shadow: 0, grass: 2500, ground: 110, dust: 140 },
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
const hemi = new THREE.HemisphereLight(0xffffff, 0x8892a0, 1.1);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);

// ── World ─────────────────────────────────────────────────────────────
let ground = buildGround(tier().ground, pal());
const roadMesh = buildRoads(pal());
const jumpMesh = buildJumps(pal());
const plazaMesh = buildPlazas(pal());
scene.add(ground, roadMesh, jumpMesh, plazaMesh);
buildStops(scene);
buildRoadSigns(scene);

let live = null;
const getLive = () => live;
Object.keys(DISTRICTS).forEach((k) => buildBoard(scene, k, getLive));

let grass = null, dust = null;
function applyTier() {
  const t = tier();
  renderer.setPixelRatio(Math.min(devicePixelRatio, t.ratio));
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
  recolourMaterials(p, dark);
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
  if (anyOpen()) return;
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
  if ((e.code === "Enter" || e.code === "Space") && activePad) { e.preventDefault(); openStop(activePad.stop); }
});
addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener("blur", releaseKeys);

if (coarse || "ontouchstart" in window) $("touch").hidden = false;
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
function stepCrates(dt) {
  const s = car.s;
  const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  for (const c of crates) {
    const p = c.m.position;
    const dx = p.x - s.x, dz = p.z - s.z;
    const d = Math.hypot(dx, dz);
    const minD = CAR_R + c.r;
    if (d < minD && d > 0 && s.y < 1.5) {
      const nx = dx / d, nz = dz / d;
      p.x = s.x + nx * minD;
      p.z = s.z + nz * minD;
      const along = Math.max(0, (fx * nx + fz * nz) * s.speed);
      c.v.x += nx * (along * 1.3 + 1);
      c.v.y += nz * (along * 1.3 + 1);
      c.spin += (Math.random() - 0.5) * along * 1.2;
      c.tilt = Math.min(1, c.tilt + along * 0.08);
      s.speed *= 0.92;
    }
    for (const o of crates) {
      if (o === c) continue;
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
    const damp = Math.exp(-dt * 2.2);
    c.v.multiplyScalar(damp);
    c.spin *= damp;
    c.m.rotation.y += c.spin * dt;
    c.tilt *= Math.exp(-dt * 3);
    p.y = groundHeight(p.x, p.z) + 0.75 + c.tilt * 0.9;
    c.m.rotation.x = c.tilt * 0.5;
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
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function placeCamera(dt, snap = false) {
  const s = car.s;
  const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  const back = 11 + Math.max(0, s.speed) * 0.12;
  const want = new THREE.Vector3(s.x - fx * back, s.y + 6.5, s.z - fz * back);
  // Never dip under a hill behind the car
  want.y = Math.max(want.y, groundHeight(want.x, want.z) + 2);
  const look = new THREE.Vector3(s.x + fx * 4, s.y + 2.2, s.z + fz * 4);
  camPos.lerp(want, snap ? 1 : 1 - Math.exp(-dt * 5));
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
    g.visible = Math.hypot(camera.position.x - d.centre[0], camera.position.z - d.centre[1]) < 250 + d.radius;
  }
}

// ── Where am I ────────────────────────────────────────────────────────
let whereText = "";
function updateWhere() {
  const s = car.s;
  let text = null;
  for (const d of Object.values(DISTRICTS)) {
    if (Math.hypot(s.x - d.centre[0], s.z - d.centre[1]) < d.radius + 3) text = d.name;
  }
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
      $("prompt-label").textContent = `Open ${found.stop.name}`;
      $("prompt-hint").hidden = coarse;
    }
  }
}
$("prompt-btn").addEventListener("click", () => activePad && openStop(activePad.stop));

const dialogs = ["intro", "stop", "map"].map($);
const anyOpen = () => dialogs.some((d) => d.open);
dialogs.forEach((d) => {
  d.addEventListener("close", () => { paused = anyOpen(); });
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
        Object.assign(document.createElement("dd"), { textContent: live ? live.values[k] ?? "Not available" : "Loading" }),
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
    $("stop-site").querySelector(".br-button-label").textContent = `Visit ${stop.name}`;
  }
  show($("stop"));
}

function teleport(stop) {
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
  const r = roads.find((x) => x.kind === "spoke" && x.to === key);
  const t = 1 - 16 / r.len;
  const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
  Object.assign(car.s, { x: p.x, z: p.z, y: groundHeight(p.x, p.z), heading: Math.atan2(-tan.x, -tan.z), speed: 0, steer: 0, vy: 0, air: false });
  dialogs.forEach((d) => d.open && d.close());
  stepCar(car, keys, 0);
  placeCamera(0, true);
  checkPads();
  updateWhere();
}

function openMap() {
  fillStats($("map-live"), ["volume24h", "openInterest", "markets", "maxLeverage"]);
  const groups = Object.entries(DISTRICTS).flatMap(([key, d]) => {
    if (!STOPS.some((s) => s.district === key)) return [];
    const h = document.createElement("div");
    h.className = "map-group-row";
    const label = Object.assign(document.createElement("p"), { className: "map-group", textContent: d.name });
    h.append(label);
    if (key !== "hub") {
      const go = Object.assign(document.createElement("button"), { type: "button", className: "map-read", textContent: "Drive in" });
      go.setAttribute("aria-label", `Go to the ${d.name} entrance`);
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
        go.addEventListener("click", () => teleport(s));
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
    return [h, ul];
  });
  $("map-groups").replaceChildren(...groups);
  show($("map"));
}
$("open-map").addEventListener("click", openMap);
$("intro-map").addEventListener("click", openMap);
$("start").addEventListener("click", () => $("intro").close());
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
  camera.aspect = w / h;
  camera.fov = w < h ? 68 : 55;
  camera.updateProjectionMatrix();
  dust?.userData.setScale(h * renderer.getPixelRatio());
}
addEventListener("resize", resize);

const clock = new THREE.Clock();
let frameNo = 0;
let debugCam = false; // test hook: hold the camera still for overview shots
function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 1 / 30);
  const t = clock.elapsedTime;
  if (!paused) {
    const info = stepCar(car, keys, dt);
    emitDust(dt, info);
    checkPads();
    updateWhere();
  }
  stepCrates(dt);
  dust?.userData.step(dt);
  grass?.userData.tick(t);
  if (!debugCam) placeCamera(dt);
  if ((frameNo++ & 15) === 0 && !debugCam) cullDistricts();
  animated.forEach((f) => f(t));
  if (!reduceMotion) {
    const pulse = 0.65 + Math.sin(t * 3) * 0.2;
    pads.forEach((p) => (p.ring.material.opacity = p === activePad ? 1 : pulse));
  }
  renderer.render(scene, camera);
  watchFrames(raw, t);
  requestAnimationFrame(frame);
}

await document.fonts.ready;
applyTier();
applyTheme();
stepCar(car, keys, 0);
placeCamera(0, true);
updateWhere();
refresh();
setInterval(refresh, 30_000);
requestAnimationFrame(frame);
show($("intro"));

// Test hook for automated checks (no effect on play)
window.__eco = { car, teleport: (key) => teleport(STOPS.find((s) => s.key === key)), keys, jumps, groundHeight, placeCamera, colliders,
  overview: (x, y, z, lx = 0, lz = 0) => { debugCam = true; camera.far = 2000; camera.updateProjectionMatrix(); scene.fog = null; camera.position.set(x, y, z); camera.lookAt(lx, 0, lz); Object.values(districtGroups).forEach((g) => (g.visible = true)); },
  info: () => renderer.info.render };
