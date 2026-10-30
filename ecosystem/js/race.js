// RealFi Raceway time trials: gates crossed in order, the lap clock, the visitor's best lap (kept in
// this browser) and the shared top 10 from the copilot-watch worker. The game works the same when
// the worker can't be reached; the board just says so.

import { RACE_TRACK } from "./content.js";
import { raceGates, trackAt, trackLen } from "./terrain.js";
import { setBoard, formatTime } from "./raceway.js";

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
let finished = null; // { ms, splits, prevBest } for the finish sheet
let hooks = {};

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

const gap = (d) => `${d <= 0 ? "−" : "+"}${(Math.abs(d) / 1000).toFixed(2)} s`;

// Called every frame the game runs, with where the car was and is. A crossing is the car's path
// this frame against each gate's segment, so a fast car can't skip one between frames, and the
// moment is placed within the frame.
export function raceTick(px, pz, x, z, dt) {
  const t0 = clock;
  clock += dt;
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
  drawHud();
}

function finish(t) {
  const ms = Math.round((t - lap.start) * 1000);
  const splits = lap.splits.slice();
  lap.running = false;
  const prevBest = best;
  if (!best || ms < best.ms) {
    best = { ms, splits };
    save(BEST_KEY, best);
  }
  finished = { ms, splits, prevBest, posted: false };
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
  const time = lap.running ? formatTime(Math.max(0, (clock - lap.start) * 1000)) : finished ? formatTime(finished.ms) : "0:00.00";
  const sub = `Best ${best ? formatTime(best.ms) : "none yet"}${lap.running ? `  ·  Checkpoint ${Math.min(lap.next, N + 1) - 1} of ${N}` : "  ·  Cross the start line"}`;
  if (time !== lastTime) { lastTime = time; $("race-time").textContent = time; }
  if (sub !== lastSub) { lastSub = sub; $("race-sub").textContent = sub; }
}

// ── Finish sheet ───────────────────────────────────────────────────────
function openFinish() {
  const f = finished;
  $("race-result").textContent = formatTime(f.ms);
  $("race-gap").textContent =
    !f.prevBest ? "Your first full lap. It's your best so far."
    : f.ms < f.prevBest.ms ? `New best, ${gap(f.ms - f.prevBest.ms).slice(1)} faster than your last best (${formatTime(f.prevBest.ms)}).`
    : f.ms === f.prevBest.ms ? "Exactly your best lap."
    : `${gap(f.ms - f.prevBest.ms).slice(1)} slower than your best (${formatTime(f.prevBest.ms)}).`;
  $("race-form").hidden = true;
  $("race-post").hidden = false;
  $("race-post").disabled = false;
  $("race-status").textContent = "";
  hooks.show($("race"));
}

$("race-post").addEventListener("click", () => {
  $("race-post").hidden = true;
  $("race-form").hidden = false;
  const name = $("race-name");
  if (!name.value) name.value = load(NAME_KEY) || "";
  name.focus();
});
$("race-again").addEventListener("click", () => toStart());

// Error codes from the worker, in words
const REASONS = {
  unknown_track: "The leaderboard doesn't know this track yet.",
  bad_name: "That name can't be used. Try another, up to 20 characters.",
  rude_name: "Please pick a different name.",
  bad_splits: "Time rejected.",
  bad_ms: "Time rejected.",
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
      body: JSON.stringify({ track: RACE_TRACK.id, name, ms: f.ms, splits: f.splits }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) {
      f.posted = true;
      $("race-form").hidden = true;
      status.textContent = body.rank ? `Posted. You're number ${body.rank} on the board.` : "Posted. Not in the top 10 this time.";
      const top = readTop(body);
      if (top) setTop({ status: "ok", top, at: Date.now() });
      else fetchTop();
    } else if (res.status === 429) {
      const wait = Number(body.retryAfter) || Number(res.headers.get("Retry-After")) || 60;
      status.textContent = `One post a minute. Try again in ${Math.ceil(wait)} s.`;
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
  if (onRaceway && Date.now() - board.at > 60_000) fetchTop();
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
