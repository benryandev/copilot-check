// Other visitors, live: a websocket to the copilot-world room sends where everyone is, and each of
// them drives around you as a car in their own colour with their name above it. Nothing here touches
// the game when the room can't be reached: the world is single-player exactly as before.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS } from "./content.js";
import { groundHeight, inRaceway } from "./terrain.js";
import { accent } from "./build.js";
import { nameTag } from "./tags.js";
import { nextSendDelay, poseAt, pickDrawn, backoff, DELAY_MS, QUIET_MS, GONE_MS, DRAW_CAP, DRAW_RANGE } from "./peers-math.js";

const WS_DEFAULT = "wss://copilot-world.benryan.workers.dev/ws";
const NAME_KEY = "eco-race-name", OWNER_KEY = "eco-owner";
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const round1 = (v) => Math.round(v * 10) / 10, round2 = (v) => Math.round(v * 100) / 100;

let hooks = {}; // { scene, car, tierName(), socket?() }
let url = WS_DEFAULT;
let ws = null, status = "off", me = null, attempt = 0, retry = null, everOn = false, injected = false, enabled = false;
const peers = new Map(); // id → { id, name, colour, samples, lastSeen, car, building, pinned }
const listeners = new Set();
let lastSent = -Infinity;

// ── Where someone is, in words ─────────────────────────────────────────
export function districtAt(x, z) {
  for (const d of Object.values(DISTRICTS)) {
    if (d.plaza === false) continue;
    if (Math.hypot(x - d.centre[0], z - d.centre[1]) < d.radius + 3) return d.name;
  }
  if (inRaceway(x, z)) return DISTRICTS.raceway.name;
  return "On the road";
}

// ── State for the HUD ──────────────────────────────────────────────────
export function peersState() {
  return {
    status, me,
    peers: [...peers.values()].map((p) => {
      const last = p.samples[p.samples.length - 1];
      return { id: p.id, name: p.name, colour: p.colour, district: last ? districtAt(last.x, last.z) : "Just arrived" };
    }),
  };
}
export const onPeers = (f) => listeners.add(f);
const emit = (event = null) => { const s = peersState(); listeners.forEach((f) => f(s, event)); };

// ── The room ───────────────────────────────────────────────────────────
function add(p) {
  if (!me || p.id === me.id || peers.has(p.id)) return;
  const now = performance.now();
  const samples = Number.isFinite(p.x) ? [{ at: now, x: p.x, z: p.z, h: p.h || 0 }] : [];
  peers.set(p.id, { id: p.id, name: p.name, colour: p.colour, samples, lastSeen: now, car: null, building: null, pinned: false });
}
function remove(id) {
  const p = peers.get(id);
  if (!p) return;
  peers.delete(id);
  if (p.car) {
    hooks.scene?.remove(p.car.group);
    p.car.tag.dispose();
    p.car.mats.forEach((m) => m.dispose());
  }
}
function clearAll() { for (const id of [...peers.keys()]) remove(id); }

function handle(m) {
  switch (m.t) {
    case "ok":
      me = { id: m.id, name: m.name, colour: m.colour };
      status = "on"; everOn = true; attempt = 0;
      clearAll();
      (m.peers || []).forEach(add);
      emit({ type: "on" });
      break;
    case "join": add(m); emit({ type: "join", name: m.name }); break;
    case "leave": remove(m.id); emit({ type: "leave" }); break;
    case "rename": { const p = peers.get(m.id); if (p) { p.name = m.name; p.car?.tag.redraw(); emit({ type: "rename" }); } break; }
    case "named": if (me) { me.name = m.name; write(NAME_KEY, m.name); emit({ type: "named", name: m.name }); } break;
    case "s": {
      const now = performance.now();
      for (const [id, x, z, h, , j] of m.p || []) {
        const p = peers.get(id);
        if (!p) continue;
        const sample = { at: now, x, z, h };
        if (j) p.samples = [sample]; // a teleport: snap, don't slide across the map
        else { p.samples.push(sample); if (p.samples.length > 12) p.samples.shift(); }
        p.lastSeen = now;
      }
      break;
    }
    case "err": emit({ type: "err", error: m.error }); break;
    default: break;
  }
}

function connect() {
  if (ws || injected || !enabled) return;
  status = everOn ? "offline" : "connecting";
  emit({ type: "connecting" });
  let sock;
  try { sock = hooks.socket ? hooks.socket(url) : new WebSocket(url); } catch (err) { console.warn("[eco] peers", err); return scheduleRetry(); }
  ws = sock;
  sock.addEventListener("open", () => {
    const owner = read(OWNER_KEY);
    sock.send(JSON.stringify({ t: "hi", v: 1, name: read(NAME_KEY) || undefined, ...(owner ? { owner } : {}) }));
  });
  sock.addEventListener("message", (e) => {
    for (const line of String(e.data).split("\n")) {
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch (err) { console.warn("[eco] peers frame", err); }
    }
  });
  sock.addEventListener("close", () => {
    if (ws !== sock) return;
    ws = null;
    clearAll();
    if (status === "on" || everOn) status = "offline";
    emit({ type: "offline" });
    scheduleRetry();
  });
  sock.addEventListener("error", () => {}); // close follows
}
function scheduleRetry() {
  if (retry) return;
  retry = setTimeout(() => { retry = null; connect(); }, backoff(attempt++));
}

export function initPeers({ scene, car, tierName, enabled: on = true, wsUrl, socket }) {
  hooks = { scene, car, tierName: tierName || (() => "high"), socket };
  enabled = on;
  if (!enabled) { status = "off"; emit({ type: "off" }); return; }
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  url = wsUrl || (local && new URLSearchParams(location.search).get("ws")) || WS_DEFAULT;
  connect();
}

// ── Our pose, out ──────────────────────────────────────────────────────
export function sendPose(s, jumped, now) {
  if (status !== "on" || !ws || ws.readyState !== 1) return;
  if (!jumped && now - lastSent < nextSendDelay(s.speed)) return;
  lastSent = now;
  const m = { t: "p", x: round1(s.x), z: round1(s.z), h: round2(s.heading), s: round1(Math.min(40, Math.abs(s.speed))) };
  if (jumped) m.j = 1;
  ws.send(JSON.stringify(m));
}

export function setPeerName(name) {
  const n = String(name || "").trim();
  if (!n) return;
  write(NAME_KEY, n); // used by the next hi even if the room is away
  if (status === "on" && ws?.readyState === 1) ws.send(JSON.stringify({ t: "name", name: n }));
}

// ── Their cars, in ─────────────────────────────────────────────────────
const colourOf = (hex) => parseInt(String(hex).replace("#", ""), 16);
function buildCar(p) {
  if (p.building) return p.building;
  p.building = (async () => {
    await hooks.car?.ready;
    if (!peers.has(p.id)) return; // left while the model loaded
    const group = new THREE.Group();
    const body = hooks.car.tilt.clone(true);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    const mats = [];
    const paint = accent(colourOf(p.colour));
    const low = hooks.tierName() === "low";
    body.traverse((o) => {
      if (!o.isMesh) return;
      const m = (o.material?.userData?.accent ? paint : o.material).clone(); // own copy, so this car can fade alone
      o.material = m;
      mats.push(m);
      o.castShadow = !low;
      o.receiveShadow = false;
    });
    group.add(body);
    const tag = nameTag(() => p.name, { colour: colourOf(p.colour) });
    group.add(tag.sprite);
    group.visible = false;
    hooks.scene?.add(group);
    p.car = { group, tag, mats, faded: false };
  })();
  return p.building;
}

function fade(p, on) {
  if (!p.car || p.car.faded === on) return;
  p.car.faded = on;
  for (const m of p.car.mats) { m.transparent = on; m.opacity = on ? 0.4 : 1; m.needsUpdate = true; }
}

let rank = 0, drawn = new Set();
export function peersTick(dt, camPos) {
  if (!peers.size) return;
  const now = performance.now(), at = now - DELAY_MS;
  const placed = [];
  for (const p of [...peers.values()]) {
    if (!p.pinned && now - p.lastSeen > GONE_MS) { remove(p.id); emit({ type: "leave" }); continue; }
    const pose = poseAt(p.samples, at);
    if (!pose) continue;
    if (!p.car) { buildCar(p); continue; }
    p.car.group.position.set(pose.x, groundHeight(pose.x, pose.z), pose.z);
    p.car.group.rotation.y = pose.h;
    fade(p, !p.pinned && now - p.lastSeen > QUIET_MS);
    placed.push({ p, x: pose.x, z: pose.z });
  }
  // Which of them to draw: the nearest few within range, re-ranked once a second or so
  if ((rank++ % 60) === 0 || drawn.size === 0) {
    const cap = DRAW_CAP[hooks.tierName()] ?? 24;
    drawn = new Set(pickDrawn(placed.filter((e) => Math.hypot(e.x - camPos.x, e.z - camPos.z) < DRAW_RANGE), camPos, cap).map((e) => e.p.id));
  }
  for (const { p } of placed) p.car.group.visible = drawn.has(p.id);
}

// ── Test hook ──────────────────────────────────────────────────────────
// Stand a few visitors in the world without a room (null takes them away again)
export function injectPeers(list) {
  if (!list) {
    injected = false;
    clearAll();
    if (!ws) { status = everOn ? "offline" : "off"; connect(); }
    emit({ type: "inject" });
    return;
  }
  injected = true;
  if (ws) { const s = ws; ws = null; s.close(); }
  clearAll();
  me = me || { id: "me", name: read(NAME_KEY) || "You", colour: "#22c55e" };
  status = "on";
  for (const p of list) { add(p); const q = peers.get(p.id); if (q) q.pinned = true; }
  drawn = new Set();
  emit({ type: "inject" });
}
