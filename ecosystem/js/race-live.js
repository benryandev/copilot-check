// Live races on the Raceway (multiplayer stage two). The room (copilot-world) owns the race; this module mirrors
// it: puts the car on the grid, locks the throttle until the shared Go, shows the countdown and positions, reports
// checkpoints and the finish, and offers the Race / Join buttons. The lap itself is still timed by race.js, line to
// line, so a race lap can post to the leaderboard like any other.
import { gridSlot, positionLine, countdownText } from "./race-live-math.js";
import { trackAt, trackLen } from "./terrain.js";
import { sendRace, serverNow, setRacers, peersState } from "./peers.js";
import { setLiveLine, setGhostHidden } from "./race.js";

const $ = (id) => document.getElementById(id);
let hooks = {}; // { place(x, z, heading), note(text, ms), closeSheets(), sound, onRaceway: () => bool }
let race = null; // { id, host, name, startsAt, grid, state, order, dnf }
let entered = false, locked = false, onGrid = false, lastCount = null, lastGoIn = null;

const myId = () => peersState().me?.id ?? null;
const isEntrant = () => !!(race && race.grid.some((g) => g.id === myId()));
const others = () => (race ? race.grid.map((g) => g.id).filter((id) => id !== myId()) : []);

export function initRaceLive(h) {
  hooks = h;
  $("race-invite-join").addEventListener("click", () => { hideInvite(); join(); });
  $("race-invite-no").addEventListener("click", hideInvite);
  for (const id of ["peers-race", "race-go"]) $(id).addEventListener("click", () => { hooks.closeSheets?.(); raceButton(); });
  draw();
}

/** A race.* message from the room (via peers.js). */
export function raceEvent(m) {
  switch (m.t) {
    case "race.open":
      race = { id: m.id, host: m.host, name: m.name, startsAt: m.startsAt, grid: m.grid, state: "open", order: [], dnf: [] };
      entered = isEntrant();
      if (entered) toGrid(); else showInvite(m);
      break;
    case "race.sync": // the room told us on arrival about a race already on (we are never in it: new socket, new id)
      offGrid();
      race = { id: m.id, host: m.host, name: m.name, startsAt: m.startsAt, grid: m.grid, state: m.state, order: m.order || [], dnf: [] };
      entered = false;
      if (race.state === "open") showInvite(m);
      break;
    case "race.grid":
      if (race?.id !== m.id) break;
      race.grid = m.grid;
      { const was = entered; entered = isEntrant(); if (entered && !was) toGrid(); else if (!entered && was) offGrid(); }
      break;
    case "race.cancel":
      if (race?.id !== m.id) break;
      hooks.note?.(m.why === "Nobody joined" ? "Race cancelled: nobody joined" : "Race cancelled", 4000);
      clear();
      break;
    case "race.go":
      if (race?.id !== m.id) break;
      race.state = "countdown"; race.startsAt = m.startsAt;
      hideInvite();
      break;
    case "race.pos":
      if (race?.id !== m.id) break;
      if (race.state !== "done") race.state = "running";
      race.order = m.order;
      drawPositions();
      break;
    case "race.end":
      if (race?.id !== m.id) break;
      race.state = "done"; race.order = m.order; race.dnf = m.dnf;
      drawPositions();
      finishRace();
      break;
    default: break;
  }
  draw();
}

/** Every frame: the countdown on the server clock, the lock lifting at Go. */
export function raceLiveTick() {
  if (!race || !entered || race.state === "done") return;
  const now = serverNow();
  if (race.state === "open") {
    const goIn = Math.max(0, Math.ceil((race.startsAt - now) / 1000));
    if (goIn !== lastGoIn && goIn <= 20 && goIn % 5 === 0) { lastGoIn = goIn; if (goIn > 3) hooks.note?.(`On the grid, slot ${mySlot()}. Go in ${goIn} s`, 1800); }
  }
  const text = countdownText(race.startsAt, now);
  if (text && text !== lastCount) {
    lastCount = text;
    hooks.note?.(text, 950);
    hooks.sound?.countdown?.(text === "Go" ? 0 : Number(text));
  }
  if (now >= race.startsAt && locked) { locked = false; onGrid = false; race.state = "running"; draw(); }
}

/** race.js tells us about the lap: "cp" with the gate index, "fin" with the lap ms. */
export function onLap(kind, v) {
  if (!race || !entered || race.state !== "running") return;
  if (kind === "cp") sendRace({ t: "race.cp", i: v });
  else if (kind === "fin") sendRace({ t: "race.fin", ms: v });
}

export const raceLocked = () => locked;
export const raceOnGrid = () => onGrid;
export const raceLiveState = () => ({ race, entered, locked, onGrid, state: race?.state ?? null });

/** The Race button: start one, join the open one, or leave the grid. */
export function raceButton() {
  if (race && race.state === "open") { if (entered) leave(); else join(); return; }
  if (race && race.state !== "done") return;
  sendRace({ t: "race.open" });
}
function join() { sendRace({ t: "race.join" }); }
function leave() { sendRace({ t: "race.leave" }); }

function mySlot() { return race?.grid.find((g) => g.id === myId())?.slot ?? 0; }
function toGrid() {
  const k = mySlot();
  if (!k) return;
  hooks.cancelLap?.(); // a lap already under way must not finish at Go
  const g = gridSlot(k), p = trackAt(trackLen - g.back);
  hooks.place?.(p.x + p.rx * g.v, p.z + p.rz * g.v, Math.atan2(-p.fx, -p.fz));
  locked = true; onGrid = true; lastCount = null; lastGoIn = null;
  setGhostHidden(true);
  setRacers(others());
  hideInvite();
  const goIn = Math.max(0, Math.round((race.startsAt - serverNow()) / 1000));
  hooks.note?.(`On the grid, slot ${k}. Go in ${goIn} s`, 2500);
}
function offGrid() {
  locked = false; onGrid = false;
  setGhostHidden(false);
  setRacers([]);
  setLiveLine(null);
}
function clear() {
  offGrid();
  race = null; entered = false;
  hideInvite();
  $("race-live-line").hidden = true;
}
function drawPositions() {
  if (!race) return;
  const line = positionLine(race.order, myId());
  setLiveLine(entered ? line : null);
  const el = $("race-live-line");
  el.textContent = line || "";
  el.hidden = !line;
  setRacers(race.state === "done" ? [] : others());
}
function finishRace() {
  locked = false; onGrid = false;
  setGhostHidden(false);
  setRacers([]);
  if (entered) {
    const line = positionLine(race.order, myId());
    if (line) hooks.note?.(`${line} · race over`, 5000);
  }
  setTimeout(() => { if (race?.state === "done") { setLiveLine(null); entered = false; $("race-live-line").hidden = true; draw(); } }, 10_000);
}
/** The socket went away or came back as someone new: whatever race we thought we were in is over for us. */
export function raceReset() { if (race) clear(); draw(); }

function showInvite(m) {
  if (entered) return;
  $("race-invite-text").textContent = `${m.name} started a race on the Raceway. 20 s to the grid.`;
  $("race-invite").hidden = false;
}
function hideInvite() { $("race-invite").hidden = true; }

/** Buttons and labels from the current state. */
function draw() {
  const btn = $("peers-race"), go = $("race-go");
  const n = peersState().peers.length;
  let label = "Start a race", disabled = n === 0, title = n === 0 ? "Nobody else is here yet" : "";
  if (race && race.state === "open") { label = entered ? "Leave the grid" : `Join the race (${race.grid.length} on the grid)`; disabled = !entered && race.grid.length >= 8; }
  else if (race && race.state !== "done") { label = "Race on"; disabled = true; }
  btn.querySelector(".br-button-label").textContent = label;
  btn.disabled = disabled; btn.title = title;
  go.hidden = !(n > 0 && (!race || race.state === "open" || race.state === "done") && !entered && hooks.onRaceway?.());
  go.textContent = race && race.state === "open" ? "Join the race" : "Race";
}
export const redrawRaceButtons = draw;

/** Test hook (QA shots): stand in a race state without a room. */
export function injectRaceLive(kind) {
  const me = myId() || "me";
  if (kind === "invite") { race = null; entered = false; showInvite({ name: "Juno" }); draw(); return; }
  const grid = [{ id: me, name: "You", slot: 1 }, { id: "p1", name: "Juno", slot: 2 }, { id: "p2", name: "Rook", slot: 3 }];
  if (kind === "grid") {
    race = { id: "qa", host: me, name: "You", startsAt: serverNow() + 2600, grid, state: "countdown", order: [], dnf: [] };
    entered = true; toGrid(); hooks.note?.("3", 60_000);
  } else if (kind === "pos") {
    race = { id: "qa", host: me, name: "You", startsAt: serverNow() - 9000, grid, state: "running", dnf: [],
      order: [{ id: "p1", name: "Juno", cp: 2, at: 8400, fin: false, pos: 1 }, { id: me, name: "You", cp: 2, at: 8812, fin: false, pos: 2 }, { id: "p2", name: "Rook", cp: 1, at: 4100, fin: false, pos: 3 }] };
    entered = true; locked = false; onGrid = false; setGhostHidden(true); drawPositions();
  }
  draw();
}
