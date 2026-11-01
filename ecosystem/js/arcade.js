// Arcade cabinets: a stop whose sheet runs a community-made game in a sandboxed frame under /ecosystem/arcade/<slug>/.
// The frame is created when the sheet opens and removed when it closes (the game and its music stop with it). The game
// posts its own scores to the leaderboard worker and tells this page by postMessage, so the sheet's board and the
// cabinet's marquee in the world follow. While a cabinet is open the world's music bed is ducked for the game's own.
import { parseArcadeMessage, marqueeText, frameUrl } from "./arcade-math.js";
import { setMarquee } from "./build.js";
import { STOPS } from "./content.js";

const API = "https://copilot-watch.benryan.workers.dev";
const $ = (id) => document.getElementById(id);
let hooks = {}; // { show(dialog), sound, isDark: () => bool }
let current = null; // the open stop
const boards = new Map(); // slug → { status: loading | ok | offline, top }
let injected = false; // QA: a board was injected, don't fetch over it

export function initArcade(h) {
  hooks = h;
  const d = $("arcade");
  d.addEventListener("close", () => {
    $("arcade-frame").replaceChildren(); // the game stops here
    hooks.sound?.duck?.(false);
    current = null;
  });
  addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.source !== $("arcade-frame").querySelector("iframe")?.contentWindow) return; // only the open cabinet's frame
    const m = parseArcadeMessage(e.data);
    if (!m) return;
    if (m.t === "close") { if (d.open) d.close(); return; }
    if (m.t === "board") setBoard(m.game, { status: "ok", top: m.top });
  });
  // The marquees: the top score on each cabinet, fetched once at start
  for (const s of STOPS) if (s.arcade) fetchBoard(s.arcade.slug);
}

export const arcadeOpen = () => $("arcade").open;

/** Open a cabinet's sheet with its game. */
export function openArcade(stop) {
  const a = stop.arcade;
  current = stop;
  $("arcade-title").textContent = a.title;
  $("arcade-credit").textContent = `Made by ${a.maker}. ${a.controls} Scores post to this cabinet's board under the name you race with.`;
  const f = document.createElement("iframe");
  f.src = frameUrl(a.slug, !!hooks.isDark?.());
  f.title = `${a.title} by ${a.maker}`;
  f.setAttribute("sandbox", "allow-scripts allow-same-origin"); // no popups, no top navigation, no forms out
  f.setAttribute("allow", "");
  f.loading = "eager";
  $("arcade-frame").replaceChildren(f);
  drawBoard(a.slug);
  if (!injected) fetchBoard(a.slug);
  hooks.sound?.duck?.(true); // the world's bed steps aside for the game's own music
  hooks.show($("arcade"));
  f.addEventListener("load", () => f.focus(), { once: true }); // the first Space goes to the game
}

async function fetchBoard(slug) {
  if (injected) return;
  if (!boards.has(slug)) setBoard(slug, { status: "loading", top: [] });
  try {
    const res = await fetch(`${API}/arcade/top?game=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    if (!injected) setBoard(slug, { status: "ok", top: Array.isArray(j.top) ? j.top : [] });
  } catch {
    if (!injected) setBoard(slug, { status: "offline", top: boards.get(slug)?.top ?? [] });
  }
}

function setBoard(slug, b) {
  boards.set(slug, b);
  const stop = STOPS.find((s) => s.arcade?.slug === slug);
  if (stop) setMarquee(stop.key, marqueeText(b.top));
  if (current?.arcade.slug === slug) drawBoard(slug);
}

function drawBoard(slug) {
  const b = boards.get(slug) || { status: "loading", top: [] };
  const h = Object.assign(document.createElement("h3"), { textContent: "Top ten on this cabinet" });
  let body;
  if (b.status !== "ok" || !b.top.length) {
    body = Object.assign(document.createElement("p"), { className: "muted race-top-empty", textContent: b.status === "offline" ? "Board offline" : b.status === "loading" ? "Loading the board…" : "No scores yet. Set the first." });
  } else {
    body = Object.assign(document.createElement("ol"), { className: "race-top" });
    for (const r of b.top.slice(0, 10)) {
      const li = document.createElement("li");
      li.append(Object.assign(document.createElement("span"), { textContent: r.name }),
        Object.assign(document.createElement("span"), { className: "race-top-ms", textContent: `${r.score}${r.won ? " · cleared" : r.level ? ` · L${r.level}` : ""}` }));
      body.append(li);
    }
  }
  $("arcade-board").replaceChildren(h, body);
}

/** Test hook (QA shots): a board without the worker. */
export function injectArcadeBoard(rows, slug = "flappy-coin") {
  injected = true;
  setBoard(slug, { status: "ok", top: rows });
}
