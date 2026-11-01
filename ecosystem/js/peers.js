// Other visitors, live: a websocket to the copilot-world room sends where everyone is, and each of
// them drives around you as a car in their own colour with their name above it. Nothing here touches
// the game when the room can't be reached: the world is single-player exactly as before.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS } from "./content.js";
import { groundHeight, inRaceway } from "./terrain.js";
import { paint as carPaint } from "./build.js";
import { nameTag } from "./tags.js";
import { clockOffset } from "./race-live-math.js";
import { nextSendDelay, poseAt, pickDrawn, backoff, flyY, opacityFor, pingSample, renderDelay, DELAY_MS, QUIET_MS, GONE_MS, PARK_MS, IDLE_MS, DRAW_CAP, DRAW_RANGE } from "./peers-math.js";

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
  peers.set(p.id, { id: p.id, name: p.name, colour: p.colour, samples, lastSeen: now, car: null, building: null, pinned: false, parkedAt: null });
}
function disposeCar(p) {
  if (p.car) {
    hooks.scene?.remove(p.car.group);
    p.car.tag.dispose();
    p.car.mats.forEach((m) => m.dispose());
  }
  p.car = null;
  p.building = null;
  p.parkedAt = null;
}
// Only the room decides who has left (leave, a fresh ok, or our socket closing); a quiet spell parks the car, nothing more
function remove(id) {
  const p = peers.get(id);
  if (!p) return;
  peers.delete(id);
  disposeCar(p);
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
      ping(); // the server clock, for race countdowns
      if (m.race) emit({ type: "race", m: { t: "race.sync", ...m.race } }); // a race already on when we arrived
      break;
    case "join": add(m); emit({ type: "join", name: m.name }); break;
    case "leave": remove(m.id); emit({ type: "leave" }); break;
    case "rename": { const p = peers.get(m.id); if (p) { p.name = m.name; p.car?.tag.redraw(); emit({ type: "rename" }); } break; }
    case "named": if (me) { me.name = m.name; emit({ type: "named", name: m.name, reason: m.reason, asked: m.asked }); } break; // the typed name stays in storage; the room's rendering ("Aveli (2)") is shown, not kept
    case "s": {
      const now = performance.now();
      for (const [id, x, z, h, , j] of m.p || []) {
        const p = peers.get(id);
        if (!p) continue;
        const sample = { at: now, x, z, h };
        if (j) { p.samples = [sample]; p.fly = null; } // a teleport: snap, don't slide across the map
        else { p.samples.push(sample); if (p.samples.length > 12) p.samples.shift(); }
        p.lastSeen = now;
      }
      break;
    }
    case "record": emit({ type: "record", name: String(m.name ?? "").slice(0, 20), ms: Number(m.ms), track: m.track }); break; // a new #1 on the Raceway
    case "emote": emit({ type: "emote", id: String(m.id), e: Number(m.e) }); break; // someone waved (emote.js draws it)
    case "err": emit({ type: "err", error: m.error }); break;
    case "pong": { pings = pingSample(pings, { sentAt: Number(m.echo), receivedAt: performance.now(), serverNow: Number(m.now) }); offset = clockOffset(pings); break; }
    default: if (typeof m.t === "string" && m.t.startsWith("race.")) emit({ type: "race", m }); break;
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

// ── Live races ride the same socket: race.* messages out and in, and a server clock from the pings ──
let racers = new Set(), pings = [], offset = 0, lastPing = -Infinity;
const PING_MS = 10_000;
function ping() {
  if (!ws || ws.readyState !== 1) return;
  lastPing = performance.now();
  ws.send(JSON.stringify({ t: "ping", echo: lastPing }));
}
/** Server time now (ms, the room's Date.now()); the wall clock until the first pong has answered. */
export const serverNow = () => (pings.length ? performance.now() + offset : Date.now());
export const clockReady = () => pings.length > 0;
export function sendRace(m) {
  if (status !== "on" || !ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify(m));
  return true;
}
/** The cars in a live race are drawn at 70 % on the track so the apex shows through the one ahead. */
export function setRacers(ids) {
  racers = new Set(ids);
  const now = performance.now();
  for (const p of peers.values()) if (p.car) fade(p, !p.pinned && now - p.lastSeen > QUIET_MS);
}

let heartbeat = null;
export function initPeers({ scene, car, tierName, enabled: on = true, wsUrl, socket }) {
  hooks = { scene, car, tierName: tierName || (() => "high"), socket };
  enabled = on;
  if (!enabled) { status = "off"; emit({ type: "off" }); return; }
  // Ben's owner token can arrive as #owner=… (easier than a console on a phone); it's stored and the hash is cleared
  const tok = new URLSearchParams(location.hash.slice(1)).get("owner");
  if (tok) { write(OWNER_KEY, tok); history.replaceState(null, "", location.pathname + location.search); }
  // The frame loop stops while a sheet is open or the tab is hidden; the room must still hear from us once a second or
  // everyone else puts our car away. Browsers slow background timers to about once a second, which is exactly this rate.
  if (!heartbeat) heartbeat = setInterval(() => { if (hooks.car?.s && performance.now() - lastSent >= IDLE_MS) sendPose(hooks.car.s, false, performance.now()); if (performance.now() - lastPing >= PING_MS) ping(); }, IDLE_MS);
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

/** An emote (0 to 4) to everyone in the room. */
export function sendEmote(e) {
  if (status === "on" && ws?.readyState === 1) ws.send(JSON.stringify({ t: "emote", e }));
}
/** A peer's car group, when it is built (for a bubble over it). */
export const peerGroup = (id) => peers.get(id)?.car?.group ?? null;

export function setPeerName(name) {
  const n = String(name || "").trim();
  if (!n) return;
  write(NAME_KEY, n); // used by the next hi even if the room is away
  const owner = read(OWNER_KEY);
  if (status === "on" && ws?.readyState === 1) ws.send(JSON.stringify({ t: "name", name: n, ...(owner ? { owner } : {}) }));
}

// ── Their cars, in ─────────────────────────────────────────────────────
const colourOf = (hex) => parseInt(String(hex).replace("#", ""), 16);
function buildCar(p) {
  if (p.building) return p.building;
  const job = (async () => {
    await hooks.car?.ready;
    if (peers.get(p.id) !== p || p.building !== job) return; // left, or put away, while the model loaded
    const group = new THREE.Group();
    const body = hooks.car.tilt.clone(true);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    const mats = [];
    const paint = carPaint(colourOf(p.colour));
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
    p.car = { group, tag, mats, opacity: 1 };
  })();
  p.building = job;
  return job;
}

// Out of the drawn set (too far, over the cap, or quiet too long): hide the car, and after a while let it go
function park(p, now) {
  if (!p.car) { p.building = null; return; }
  p.car.group.visible = false;
  p.parkedAt ??= now;
  if (now - p.parkedAt > PARK_MS) disposeCar(p);
}

function fade(p, quiet) {
  if (!p.car) return;
  const o = opacityFor(quiet, racers.has(p.id));
  if (p.car.opacity === o) return;
  p.car.opacity = o;
  for (const m of p.car.mats) { m.transparent = o < 1; m.opacity = o; m.needsUpdate = true; }
}

let rank = 0, drawn = new Set();
export function peersTick(dt, camPos) {
  if (!peers.size) return;
  const now = performance.now();
  // Who could be drawn: a known pose, not gone quiet, within range of the camera. Each car is drawn as far behind
  // its latest sample as its own sender's rate needs (150 ms at 10 Hz, more for a sparse one).
  const cands = [];
  for (const p of peers.values()) {
    const gone = !p.pinned && now - p.lastSeen > GONE_MS;
    const pose = gone ? null : poseAt(p.samples, now - renderDelay(p.samples));
    if (!pose || Math.hypot(pose.x - camPos.x, pose.z - camPos.z) > DRAW_RANGE) { park(p, now); continue; }
    cands.push({ p, x: pose.x, z: pose.z, h: pose.h });
  }
  // The nearest few of them, re-ranked once a second or so; cars are built only for these and put away otherwise
  if ((rank++ % 60) === 0) drawn = new Set(pickDrawn(cands, camPos, DRAW_CAP[hooks.tierName()] ?? 24).map((e) => e.p.id));
  for (const { p, x, z, h } of cands) {
    if (!drawn.has(p.id)) { park(p, now); continue; }
    if (!p.car) { buildCar(p); continue; }
    p.parkedAt = null;
    p.car.group.visible = true;
    const g = groundHeight(x, z);
    p.fly ||= { y: g, vy: 0, air: false };
    p.car.group.position.set(x, flyY(p.fly, g, dt), z); // off a ramp the car flies rather than snapping to the ground
    p.car.group.rotation.y = h;
    fade(p, !p.pinned && now - p.lastSeen > QUIET_MS);
  }
}

// ── Test hook ──────────────────────────────────────────────────────────
// Stand a few visitors in the world without a room (null takes them away again)
// Move a stood-in visitor (clips): one more pose sample, as if the room had sent it
export function movePeer(id, x, z, h) {
  const p = peers.get(id);
  if (!p) return;
  const now = performance.now();
  p.samples.push({ at: now, x, z, h });
  if (p.samples.length > 12) p.samples.shift();
  p.lastSeen = now;
}
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
  rank = 0; // re-rank on the next tick so the stand-ins are drawn at once
  emit({ type: "inject" });
}
