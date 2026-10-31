// RealFi Raceway time trials: gates crossed in order, the lap clock, the visitor's best lap (kept in
// this browser), the shared top 10 from the copilot-watch worker, and the ghost: the fastest lap on
// the board driven beside you. The game works the same when the worker can't be reached; the board
// just says so and there's no ghost.

import * as THREE from "../vendor/three.module.min.js";
import { RACE_TRACK } from "./content.js";
import { raceGates, trackAt, trackLen, groundHeight } from "./terrain.js";
import { setBoard, formatTime } from "./raceway.js";
import { canvasTexture, redraws, themePalette } from "./build.js";

const API = "https://copilot-watch.benryan.workers.dev";
const N = RACE_TRACK.checkpoints.length;
const BEST_KEY = `eco-race-best:${RACE_TRACK.id}`;
const NAME_KEY = "eco-race-name";
const $ = (id) => document.getElementById(id);

const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
// Anonymous funnel counts (opened the world, reached the raceway, started a lap, finished one): each
// stage is sent at most once per page load, and the worker counts a visitor once per stage per day.
const sent = new Set();
function countStage(kind) {
  if (sent.has(kind)) return;
  sent.add(kind);
  const body = JSON.stringify({ track: RACE_TRACK.id, kind });
  try {
    if (!navigator.sendBeacon?.(`${API}/race/event`, body)) fetch(`${API}/race/event`, { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {}
}

let best = (() => {
  const b = load(BEST_KEY);
  return b && Number.isFinite(b.ms) && b.ms > 0 ? b : null;
})();

// ── The lap ────────────────────────────────────────────────────────────
// Time is the game's own clock (it stops while a sheet is open), so a lap can't run faster than
// the car can: 24 m/s at most, under the worker's 30 m/s check.
let clock = 0;
const lap = { running: false, start: 0, next: 1, splits: [] };
let finished = null; // { ms, splits, trace, prevBest } for the finish sheet
let hooks = {};
// The lap's path, for the ghost: [t ms, x, z, heading] ten times a second, thinned to the worker's cap
const TRACE_MS = 100, TRACE_MAX = 400;
let trace = [];
let here = { x: 0, z: 0, h: 0 };

function note(text, ms = 3000) {
  const el = $("race-note");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(note.t);
  note.t = setTimeout(() => (el.hidden = true), ms);
}

function startLap(t) {
  countStage("start");
  Object.assign(lap, { running: true, start: t, next: 1, splits: [] });
  trace = [[0, round1(here.x), round1(here.z), round2(here.h)]];
  if (ghostData) note(`Ghost: ${ghostData.name}, ${formatTime(ghostData.ms)}`, 2600);
}
export function raceCancel(why) {
  if (!lap.running) return;
  lap.running = false;
  note(why || "Lap cancelled");
}

function crossed(g, forward, t) {
  if (g.i === 0) {
    if (!forward) return raceCancel("Lap cancelled: you crossed the start line backwards");
    if (lap.running && lap.next > N) return finish(t);
    if (lap.running) note(`Lap not counted: you missed checkpoint ${lap.next}`, 4000);
    startLap(t);
    return;
  }
  if (!lap.running) return;
  if (forward && g.i === lap.next) {
    const ms = Math.round((t - lap.start) * 1000);
    lap.splits.push(ms);
    lap.next++;
    const ref = best?.splits?.[g.i - 1];
    note(ref ? `Checkpoint ${g.i} of ${N}  ${gap(ms - ref)}` : `Checkpoint ${g.i} of ${N}`, 2200);
  } else if (!forward && g.i === lap.next - 1) {
    // Backed over the checkpoint just taken: take it again on the way back through
    lap.next--;
    lap.splits.pop();
  }
}

const gap = (d) => `${d <= 0 ? "−" : "+"}${(Math.abs(d) / 1000).toFixed(3)} s`;
const round1 = (v) => Math.round(v * 10) / 10, round2 = (v) => Math.round(v * 100) / 100;

// Called every frame the game runs, with where the car was and is. A crossing is the car's path
// this frame against each gate's segment, so a fast car can't skip one between frames, and the
// moment is placed within the frame.
export function raceTick(px, pz, x, z, heading, dt) {
  const t0 = clock;
  clock += dt;
  here = { x, z, h: heading };
  if (px !== x || pz !== z) {
    for (const g of raceGates) {
      const a = (px - g.x) * g.fx + (pz - g.z) * g.fz, b = (x - g.x) * g.fx + (z - g.z) * g.fz;
      if (a < 0 === b < 0) continue;
      const u = a / (a - b);
      const mx = px + (x - px) * u, mz = pz + (z - pz) * u;
      if (Math.abs((mx - g.x) * g.rx + (mz - g.z) * g.rz) > g.w) continue;
      crossed(g, b > a, t0 + dt * u);
    }
  }
  if (lap.running) {
    const e = (clock - lap.start) * 1000;
    if (e - trace[trace.length - 1][0] >= TRACE_MS) trace.push([Math.round(e), round1(x), round1(z), round2(heading)]);
  }
  ghostTick();
  drawHud();
}

function finish(t) {
  const ms = Math.round((t - lap.start) * 1000);
  const splits = lap.splits.slice();
  lap.running = false;
  // Close the trace on the line, then thin it to the worker's cap (every k-th sample, the last one kept)
  trace.push([ms, round1(here.x), round1(here.z), round2(here.h)]);
  const k = Math.ceil(trace.length / TRACE_MAX);
  const path = k > 1 ? trace.filter((_, i) => i % k === 0 || i === trace.length - 1) : trace;
  const prevBest = best;
  if (!best || ms < best.ms) {
    best = { ms, splits };
    save(BEST_KEY, best);
  }
  finished = { ms, splits, trace: path, prevBest, posted: false };
  countStage("finish");
  openFinish();
}

// ── HUD ────────────────────────────────────────────────────────────────
let shown = false, lastTime = "", lastSub = "";
export function raceHud(visible) {
  visible = visible || lap.running;
  if (visible !== shown) { shown = visible; $("race-hud").hidden = !visible; }
}
function drawHud() {
  if (!shown) return;
  const time = lap.running ? formatTime(Math.max(0, (clock - lap.start) * 1000), 2) : finished ? formatTime(finished.ms, 2) : "0:00.00";
  const sub = `Best ${best ? formatTime(best.ms) : "none yet"}${lap.running ? `  ·  Checkpoint ${Math.min(lap.next, N + 1) - 1} of ${N}` : "  ·  Cross the start line"}`;
  if (time !== lastTime) { lastTime = time; $("race-time").textContent = time; }
  if (sub !== lastSub) { lastSub = sub; $("race-sub").textContent = sub; }
}

// ── Finish sheet ───────────────────────────────────────────────────────
function openFinish() {
  const f = finished;
  $("race-result").textContent = formatTime(f.ms);
  let text =
    !f.prevBest ? "Your first full lap. It's your best so far."
    : f.ms < f.prevBest.ms ? `New best, ${gap(f.ms - f.prevBest.ms).slice(1)} faster than your last best (${formatTime(f.prevBest.ms)}).`
    : f.ms === f.prevBest.ms ? "Exactly your best lap."
    : `${gap(f.ms - f.prevBest.ms).slice(1)} slower than your best (${formatTime(f.prevBest.ms)}).`;
  if (ghostData) {
    const d = f.ms - ghostData.ms;
    text += d < 0 ? ` You beat ${ghostData.name}'s ${formatTime(ghostData.ms)} by ${gap(d).slice(1)}. Post it to take the top spot.`
      : d === 0 ? ` Dead level with ${ghostData.name}'s ${formatTime(ghostData.ms)}.`
      : ` ${gap(d).slice(1)} behind ${ghostData.name}'s ${formatTime(ghostData.ms)}.`;
  }
  $("race-gap").textContent = text;
  // The name field is right there, like an arcade high-score screen (a visitor couldn't find it
  // behind a "Post" button, 31 Oct), filled in with the last name used on this device
  const form = $("race-form"), name = $("race-name");
  form.hidden = false;
  form.querySelector("button").disabled = false;
  if (!name.value) name.value = load(NAME_KEY) || "";
  $("race-status").textContent = "";
  hooks.show($("race"));
  // Put the cursor in the field on a keyboard device; on a phone that would throw the keyboard over the sheet
  if (!matchMedia("(pointer: coarse)").matches) name.focus();
}

$("race-again").addEventListener("click", () => toStart());

// Error codes from the worker, in words
const REASONS = {
  unknown_track: "The leaderboard doesn't know this track yet.",
  bad_name: "That name can't be used. Try another, up to 20 characters.",
  rude_name: "Please pick a different name.",
  bad_splits: "Time rejected.",
  bad_ms: "Time rejected.",
  bad_trace: "Time rejected.",
  lap_too_fast: "Time rejected.",
  segment_too_fast: "Time rejected.",
  too_large: "Time rejected.",
  origin: "The leaderboard only takes times posted from this site.",
};
$("race-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = finished;
  const status = $("race-status");
  const name = $("race-name").value.trim().slice(0, 20);
  if (!f || f.posted) return;
  if (!name) { status.textContent = "Type a name to post your time."; return; }
  save(NAME_KEY, name);
  const btn = $("race-form").querySelector("button");
  btn.disabled = true;
  status.textContent = "Posting…";
  try {
    const res = await fetch(`${API}/race/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track: RACE_TRACK.id, name, ms: f.ms, splits: f.splits, trace: f.trace }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) {
      f.posted = true;
      $("race-form").hidden = true;
      status.textContent = body.rank ? `Posted. You're number ${body.rank} on the board.` : "Posted. Not in the top 10 this time.";
      const top = readTop(body);
      if (top) setTop({ status: "ok", top, at: Date.now() });
      else fetchTop();
      if (body.rank === 1) fetchGhost(); // the ghost is now this lap
    } else if (res.status === 429) {
      const wait = Number(body.retryAfter) || Number(res.headers.get("Retry-After")) || 60;
      status.textContent = `One post every 30 seconds. Try again in ${Math.ceil(wait)} s.`;
    } else {
      const code = typeof body.error === "string" ? body.error : "";
      status.textContent = REASONS[code] || `The leaderboard turned that down${code ? ` (${code.slice(0, 40)})` : ""}.`;
    }
  } catch {
    status.textContent = "Leaderboard offline. Your best lap is still saved on this device.";
  } finally {
    btn.disabled = false;
  }
});

// ── Top 10 ─────────────────────────────────────────────────────────────
let board = { status: "loading", top: [], at: 0 };
let fetching = false;
const listeners = new Set();
function readTop(body) {
  const list = Array.isArray(body) ? body : Array.isArray(body?.top) ? body.top : null;
  if (!list) return null;
  return list
    .map((r) => ({ name: String(r?.name ?? "").slice(0, 20), ms: Number(r?.ms) }))
    .filter((r) => r.name && Number.isFinite(r.ms) && r.ms > 0)
    .slice(0, 10);
}
function setTop(b) {
  board = b;
  setBoard(b);
  listeners.forEach((f) => f(b));
}
export async function fetchTop() {
  if (fetching) return;
  fetching = true;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`${API}/race/top?track=${encodeURIComponent(RACE_TRACK.id)}`, { cache: "no-store", signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`race/top: ${res.status}`);
    const top = readTop(await res.json());
    if (!top) throw new Error("race/top: unexpected reply");
    setTop({ status: "ok", top, at: Date.now() });
  } catch (err) {
    console.info("[eco] leaderboard offline:", err.message);
    setTop({ status: "offline", top: [], at: Date.now() });
  } finally {
    fetching = false;
  }
}
export const raceBoard = () => board;
export const onBoard = (f) => listeners.add(f);
// While on the raceway: fetch on arrival, then every 60 s
export function raceRefresh(onRaceway) {
  if (onRaceway) countStage("found");
  if (onRaceway && Date.now() - board.at > 60_000) { fetchTop(); fetchGhost(); }
}

// The top 10 as a list (names as text only)
export function topList(b = board) {
  if (b.status !== "ok" || !b.top.length) {
    const p = document.createElement("p");
    p.className = "muted race-top-empty";
    p.textContent = b.status === "offline" ? "Leaderboard offline" : b.status === "loading" ? "Loading the top 10…" : "No times yet. Set the first.";
    return p;
  }
  const ol = document.createElement("ol");
  ol.className = "race-top";
  for (const r of b.top) {
    const li = document.createElement("li");
    li.append(Object.assign(document.createElement("span"), { textContent: r.name }), Object.assign(document.createElement("span"), { className: "race-top-ms", textContent: formatTime(r.ms) }));
    ol.append(li);
  }
  return ol;
}

// ── The ghost ──────────────────────────────────────────────────────────
// The fastest lap on the board, driven beside you from the moment you cross the line, with the
// leader's name over it. A lap posted with a trace replays exactly. A lap from before traces (or
// one that failed to record) has only its checkpoint times, so its ghost follows the track's
// centreline and reaches each checkpoint when they did: their pace, not their line.
let ghostData = null; // { name, ms, splits, trace|null, synth }
let ghost = null; // { group, draw }
let ghostAt = 0, fetchingGhost = false;
let previewMs = null; // test hook: hold the ghost at this point of its lap
const GHOST_COLOUR = 0x26fab0;

function readGhost(body) {
  const g = body?.ghost;
  if (!g || typeof g !== "object") return null;
  const ms = Number(g.ms), name = String(g.name ?? "").slice(0, 20);
  if (!name || !Number.isFinite(ms) || ms <= 0) return null;
  const splits = Array.isArray(g.splits) && g.splits.length === N && g.splits.every((v) => Number.isFinite(v)) ? g.splits.map(Number) : null;
  const tr = Array.isArray(g.trace) && g.trace.length >= 2 && g.trace.every((s) => Array.isArray(s) && s.length === 4 && s.every(Number.isFinite)) ? g.trace : null;
  if (!tr && !splits) return null;
  return { name, ms, splits, trace: tr, synth: !tr };
}
async function fetchGhost() {
  if (fetchingGhost) return;
  fetchingGhost = true;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`${API}/race/ghost?track=${encodeURIComponent(RACE_TRACK.id)}`, { cache: "no-store", signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`race/ghost: ${res.status}`);
    setGhost(readGhost(await res.json()));
  } catch (err) {
    console.info("[eco] ghost unavailable:", err.message);
  } finally {
    ghostAt = Date.now();
    fetchingGhost = false;
  }
}
function setGhost(g) {
  ghostData = g;
  if (g) buildGhost().then(() => ghost?.draw());
  else if (ghost) ghost.group.visible = false;
}

// Where the ghost is `e` ms into its lap: a recorded path interpolated, or the centreline at the
// splits' pace
function ghostPose(e) {
  const g = ghostData;
  if (g.trace) {
    const tr = g.trace;
    if (e <= tr[0][0]) return { x: tr[0][1], z: tr[0][2], h: tr[0][3] };
    let lo = 0, hi = tr.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr[mid][0] <= e) lo = mid; else hi = mid; }
    const a = tr[lo], b = tr[hi];
    const u = b[0] > a[0] ? Math.min(1, (e - a[0]) / (b[0] - a[0])) : 1;
    let dh = b[3] - a[3];
    dh = Math.atan2(Math.sin(dh), Math.cos(dh)); // the short way round
    return { x: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u, h: a[3] + dh * u };
  }
  const times = [0, ...g.splits, g.ms], dist = [0, ...RACE_TRACK.checkpoints, trackLen];
  let i = 1;
  while (i < times.length - 1 && e > times[i]) i++;
  const u = Math.max(0, Math.min(1, (e - times[i - 1]) / (times[i] - times[i - 1])));
  const s = dist[i - 1] + (dist[i] - dist[i - 1]) * u;
  const p = trackAt(s);
  return { x: p.x, z: p.z, h: Math.atan2(-p.fx, -p.fz) };
}

// A see-through copy of the car, with a name tag; built once the car model is in
let building = null;
function buildGhost() {
  if (building) return building;
  building = (async () => {
    await hooks.car?.ready;
    const group = new THREE.Group();
    // Writes depth, so the car's inner parts don't show through each other as a stack of cars
    const mat = new THREE.MeshStandardMaterial({ color: GHOST_COLOUR, emissive: GHOST_COLOUR, emissiveIntensity: 0.35, transparent: true, opacity: 0.55, roughness: 0.5 });
    const body = hooks.car.tilt.clone(true);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    body.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = o.receiveShadow = false; o.renderOrder = 3; } });
    group.add(body);
    // The name tag: who you're racing and their time
    const tag = canvasTexture(1024, 192, (ctx, w, h, p) => {
      ctx.clearRect(0, 0, w, h);
      const text = ghostData ? `${ghostData.name}  ${formatTime(ghostData.ms)}` : "";
      ctx.font = "600 84px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      const tw = Math.min(w - 120, ctx.measureText(text).width);
      const pw = tw + 96;
      ctx.fillStyle = p.panel;
      ctx.globalAlpha = 0.96;
      ctx.beginPath();
      ctx.roundRect((w - pw) / 2, 30, pw, 132, 66);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#" + new THREE.Color(GHOST_COLOUR).getHexString();
      ctx.fillRect((w - pw) / 2 + 56, 148, pw - 112, 8);
      ctx.fillStyle = p.text;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(text, w / 2, 96, w - 120);
    });
    // The theme pass ran before this was built: paint with the palette it used, then follow theme changes
    let pal = themePalette();
    const draw = () => pal && tag.redraw(pal);
    redraws.push((p) => { pal = p; tag.redraw(p); });
    if (pal) tag.redraw(pal);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tag.tex, depthWrite: false, transparent: true }));
    sprite.scale.set(8, 1.5, 1);
    sprite.position.y = 3.2;
    sprite.renderOrder = 4;
    group.add(sprite);
    group.visible = false;
    hooks.scene?.add(group);
    ghost = { group, draw, tag };
  })();
  return building;
}

function ghostTick() {
  if (!ghost || !ghostData) return;
  const e = previewMs ?? (lap.running ? (clock - lap.start) * 1000 : null);
  const on = e != null && e <= ghostData.ms + 2000;
  ghost.group.visible = on;
  if (!on) return;
  const p = ghostPose(Math.min(e, ghostData.ms));
  ghost.group.position.set(p.x, groundHeight(p.x, p.z), p.z);
  ghost.group.rotation.y = p.h;
}

// Test hook: hold the ghost `sec` seconds into its lap (null to release); `stub` stands in for the
// board's leader when the worker can't be reached ({name, ms, splits})
export function ghostPreview(sec, stub) {
  if (stub) setGhost(readGhost({ ghost: stub }));
  previewMs = sec == null ? null : sec * 1000;
  if (previewMs != null) buildGhost().then(ghostTick);
  else if (ghost) ghost.group.visible = false;
}

// ── To the start ───────────────────────────────────────────────────────
// 14 m behind the start line, facing along the track, stopped
export function toStart() {
  lap.running = false;
  const p = trackAt(trackLen - 14);
  hooks.place(p.x, p.z, Math.atan2(-p.fx, -p.fz));
}

export function initRace(h) {
  hooks = h;
  countStage("open");
}
