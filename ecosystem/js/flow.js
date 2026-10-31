// Fill Yard: every fill on Strike's order books as it happens, from the public trade stream
// (wss://api.strikefinance.org/ws/price, channel `trade`, no key), as crates on a conveyor out of
// the matching engine's shed. One crate per order (partial fills within half a second merge),
// sized by its dollar value, bordered green for a buy and red for a sell, with the market's own
// icon. The belt runs at a fixed pace: when fills come faster than it can carry them they wait
// at the door, and past six waiting they spill over the side. Crates that reach the end drop into
// the yard and join the knockable props (main.js stepCrates). Quiet spells are shown as quiet:
// nothing is invented, and the screen says how long ago the last fill was.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS } from "./content.js";
import { groundHeight } from "./terrain.js";
import { M, box, cyl, mesh, canvasTexture, crates, colliders, orientedBox, redraws, pads, districtGroups, marketLogo, LOGO_DISC } from "./build.js";

const API = "https://api.strikefinance.org";
const WS = "wss://api.strikefinance.org/ws/price";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// The belt, in the shed's own frame: local +x runs out through the door
const BELT = { x0: 4.6, x1: 19.2, top: 1.1, width: 1.6, speed: 1.7 };
const SPAWN_X = 3.4;
const LIP = { len: 1.8, rise: 0.5 }; // the belt's last stretch rises, so crates are thrown off rather than rolled off
LIP.angle = Math.atan2(LIP.rise, LIP.len); // just inside the door, so a crate comes out through it
const QUEUE_MAX = 6; // more than this waiting at the door and the next crate spills over the side
const MERGE_MS = 500; // partial fills of one order, this close together, make one crate
const MAX_LANDED = 44; // crates in the yard before the oldest is cleared
const WINDOW_MS = 10 * 60_000; // the figures on the screen cover this long
const BACKFILL_MARKETS = 12; // busiest markets whose recent trades seed the figures and the yard
const MINT = "#26fab0", BUY = "#16a34a", SELL = "#dc2626";

const usd = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)}M`
  : n >= 1e4 ? `$${Math.round(n / 1e3)}K`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K`
  : `$${Math.round(n)}`;
// Crate edge: 0.6 m for a $50 order, about 2.1 m for $500K. A log scale, so a whale still fits on the belt.
const sizeOf = (n) => Math.min(2.1, Math.max(0.6, 0.6 + 0.37 * Math.log10(Math.max(1, n / 50))));
const base = (symbol) => String(symbol).replace(/-USD$/i, "").toUpperCase();
const ago = (ms) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))} s ago` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min ago` : `${Math.round(ms / 3_600_000)} h ago`);

const state = {
  status: "connecting", // connecting | live | reconnecting | offline
  queue: [], // fills waiting at the door: { sym, buy, usd, t }
  belt: [], // crates riding the belt: { rec, x }
  landed: [], // crate records in the yard, oldest first
  fills: [], // every fill in the window: { sym, buy, usd, t }
  last: null, // the newest fill seen
  lastSpill: 0, // ms clock of the last spill, for the screen
  seeded: false,
};
let yard = null; // { g, screen, stripes, dirX }
let pal = { panel: "#ffffff", text: "#0d0d0d", sub: "#4b5563" };
const liveBoxes = new Set();
const seen = new Set(); // trade ids, so the backfill and the stream don't count a fill twice
let symbols = [];
let ws = null, backoff = 1000, subId = 0;
const statsListeners = [];
const crateGeo = new THREE.BoxGeometry(1, 1, 1);
const doorMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.95 });

// ── The yard: door, belt frame, belt and the screen, added to the shed's group ──
export function buildYard() {
  const pad = pads.find((p) => p.stop.key === "fillyard");
  if (!pad?.group) return;
  const g = pad.group;
  g.updateWorldMatrix(true, false);
  const len = BELT.x1 - BELT.x0, mid = (BELT.x0 + BELT.x1) / 2, half = BELT.width / 2;
  // The opening the belt comes out of, in the shed's +x wall
  g.add(box(0.24, 3.2, 3.0, doorMat, 5.0, 0.1, 0));
  // Rails, legs and the rollers at each end
  for (const z of [-1, 1]) g.add(box(len, 0.14, 0.1, M.trim, mid, BELT.top - 0.2, z * (half + 0.08)));
  for (let x = BELT.x0 + 1.4; x < BELT.x1; x += 3.6) for (const z of [-1, 1]) g.add(cyl(0.08, BELT.top - 0.25, M.trim, x, 0, z * (half - 0.1), 8));
  for (const x of [BELT.x0 + 0.2, BELT.x1 - 0.2]) {
    const roller = cyl(0.22, BELT.width + 0.1, M.trim, x, 0, 0, 14);
    roller.rotation.x = Math.PI / 2;
    roller.position.y = BELT.top - 0.2 + (x > BELT.x1 - LIP.len ? LIP.rise * (1 - 0.2 / LIP.len) : 0);
    g.add(roller);
  }
  // The belt: chevrons that scroll towards the end
  const stripes = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#1f2428";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a4249";
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 22, 0); ctx.lineTo(x + 40, h / 2); ctx.lineTo(x + 22, h); ctx.lineTo(x, h); ctx.lineTo(x + 18, h / 2);
      ctx.closePath();
      ctx.fill();
    }
  });
  stripes.redraw();
  stripes.tex.wrapS = THREE.RepeatWrapping;
  stripes.tex.repeat.set(len / 1.6, 1);
  // The belt, then a lip that rises over the last stretch so crates leave it with a throw and heap up below
  const beltMat = new THREE.MeshStandardMaterial({ map: stripes.tex, roughness: 0.9 });
  const flat = len - LIP.len;
  g.add(mesh(new THREE.BoxGeometry(flat, 0.1, BELT.width), beltMat, BELT.x0 + flat / 2, BELT.top - 0.05, 0));
  const lip = mesh(new THREE.BoxGeometry(LIP.len / Math.cos(LIP.angle), 0.1, BELT.width), beltMat, BELT.x1 - LIP.len / 2, BELT.top - 0.05 + LIP.rise / 2, 0);
  lip.rotation.z = LIP.angle;
  g.add(lip);
  // The screen over the front door
  const screen = canvasTexture(1200, 480, drawScreen);
  screen.redraw();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.04), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
  plane.position.set(0, 2.9, 3.02);
  g.add(plane);
  // The belt is solid to the car (its own box, turned with the shed)
  const c = g.localToWorld(new THREE.Vector3(mid, 0, 0));
  colliders.push(orientedBox(c.x, c.z, len / 2 + 0.3, half + 0.3, g.rotation.y));
  // World direction of local +x (the way the belt runs) and of local +z
  const dirX = g.localToWorld(new THREE.Vector3(1, 0, 0)).sub(g.localToWorld(new THREE.Vector3(0, 0, 0)));
  const dirZ = g.localToWorld(new THREE.Vector3(0, 0, 1)).sub(g.localToWorld(new THREE.Vector3(0, 0, 0)));
  redraws.push((p) => { pal = p; for (const b of liveBoxes) b.redraw(p); });
  yard = { g, screen, stripes, dirX, dirZ };
  start();
}

// ── Crates ─────────────────────────────────────────────────────────────
function makeCrate(f) {
  const s = sizeOf(f.usd), sym = f.sym, colour = f.buy ? BUY : SELL;
  const tex = canvasTexture(256, 256, (ctx, w, h, p) => {
    const img = marketLogo(sym, () => tex.redraw(pal));
    const logo = img && img.complete && img.naturalWidth && !img.failed;
    ctx.fillStyle = p.panel;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = colour;
    ctx.fillRect(16, 16, f.buy ? 76 : 88, 34);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 22px 'Geist Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(f.buy ? "BUY" : "SELL", 26, 34);
    const d = 88, lx = w / 2, ly = 106;
    if (logo) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, d / 2, 0, Math.PI * 2);
      ctx.clip();
      if (LOGO_DISC.has(sym)) { ctx.fillStyle = p.text; ctx.fillRect(lx - d / 2, ly - d / 2, d, d); }
      ctx.drawImage(img, lx - d / 2, ly - d / 2, d, d);
      ctx.restore();
    }
    ctx.fillStyle = p.text;
    ctx.textAlign = "center";
    ctx.font = `500 ${sym.length > 5 ? 26 : 32}px 'Geist Mono', monospace`;
    ctx.fillText(sym, w / 2, logo ? 170 : 110, w - 48);
    ctx.font = "600 40px 'Geist Mono', monospace";
    ctx.fillText(usd(f.usd), w / 2, 214, w - 48);
  });
  tex.redraw(pal);
  const mat = new THREE.MeshStandardMaterial({ map: tex.tex, roughness: 0.7 });
  const m = mesh(crateGeo, mat);
  m.scale.setScalar(s);
  const rec = {
    m, s, r: s * 0.72, h: s / 2, v: new THREE.Vector2(), spin: 0, tilt: 0, lift: 0, hit: false,
    redraw: (p) => tex.redraw(p),
    dispose: () => { mat.dispose(); tex.tex.dispose(); },
  };
  liveBoxes.add(rec);
  return rec;
}

// A crate steps onto the belt inside the door
function spawn(f) {
  const rec = makeCrate(f);
  rec.m.position.set(SPAWN_X, BELT.top + rec.h, 0);
  yard.g.add(rec.m);
  state.belt.push({ rec, x: SPAWN_X });
}

// A crate becomes part of the yard: world space, knockable, counted towards the limit
function land(rec, x, y, z, rotY, vx, vz, vy = 0, tumble = 0) {
  const m = rec.m;
  m.position.set(x, y, z);
  m.rotation.set(0, rotY, 0);
  districtGroups.yard.add(m);
  rec.v.set(vx, vz);
  rec.vy = vy;
  rec.air = y - rec.h > groundHeight(x, z) + 0.05;
  rec.ang = new THREE.Vector3((Math.random() - 0.5) * tumble, 0, (Math.random() - 0.5) * tumble);
  rec.hit = rec.air;
  crates.push(rec);
  state.landed.push(rec);
  while (state.landed.length > MAX_LANDED) {
    const old = state.landed.shift();
    old.dying = 0;
  }
}

// Off the end of the belt
function drop(b) {
  const w = new THREE.Vector3();
  b.rec.m.getWorldPosition(w);
  yard.g.remove(b.rec.m);
  // Thrown off the lip: forward at belt speed, up at the lip's pitch, tumbling
  const k = BELT.speed * Math.cos(LIP.angle) + 0.5, up = BELT.speed * Math.sin(LIP.angle) * 1.3 + 0.6;
  land(b.rec, w.x, w.y, w.z, yard.g.rotation.y + (Math.random() - 0.5) * 0.3, yard.dirX.x * k, yard.dirX.z * k, up, 3);
  b.rec.spin = (Math.random() - 0.5) * 2.5;
}

// Too many waiting at the door: this one tumbles off the side, beside the belt
function spill(f) {
  const rec = makeCrate(f);
  const side = Math.random() < 0.5 ? -1 : 1;
  const p = yard.g.localToWorld(new THREE.Vector3(5.6, BELT.top + rec.h + 0.4, side * (BELT.width / 2 + rec.h + 0.3)));
  land(rec, p.x, p.y, p.z, yard.g.rotation.y + (Math.random() - 0.5) * 0.6, yard.dirZ.x * side * 2.4, yard.dirZ.z * side * 2.4, 0.4, 4);
  rec.spin = (Math.random() - 0.5) * 4;
  rec.tilt = 0.6;
  state.lastSpill = performance.now();
}

// The yard isn't empty when you arrive: the most recent fills from the backfill, already landed
function seed(fills) {
  for (const f of fills) {
    const rec = makeCrate(f);
    const p = yard.g.localToWorld(new THREE.Vector3(BELT.x1 + 1.2 + Math.random() * 4, rec.h, (Math.random() - 0.5) * 4.5));
    land(rec, p.x, p.y, p.z, Math.random() * Math.PI * 2, 0, 0);
  }
}

function retire(rec, dt) {
  rec.dying += dt;
  const k = Math.max(0, 1 - rec.dying / 0.5);
  rec.m.scale.setScalar(rec.s * (0.02 + 0.98 * k));
  if (k > 0) return;
  const i = crates.indexOf(rec);
  if (i >= 0) crates.splice(i, 1);
  rec.m.parent?.remove(rec.m);
  rec.dispose();
  liveBoxes.delete(rec);
  rec.gone = true;
}

// ── Frame step ─────────────────────────────────────────────────────────
let secAcc = 0;
export function flowTick(dt) {
  if (!yard) return;
  // The belt carries what's on it; the end drops into the yard
  for (const b of state.belt) {
    b.x += BELT.speed * dt;
    b.rec.m.position.x = b.x;
    const u = (b.x - (BELT.x1 - LIP.len)) / LIP.len; // 0 at the foot of the lip, 1 at its end
    if (u > 0) { b.rec.m.position.y = BELT.top + b.rec.h + u * LIP.rise + Math.sin(LIP.angle) * b.rec.h * 0.4; b.rec.m.rotation.z = LIP.angle; }
  }
  while (state.belt.length && state.belt[0].x >= BELT.x1 - 0.05) drop(state.belt.shift());
  // The next crate waiting steps on once there's room behind the last
  if (state.queue.length) {
    const last = state.belt.at(-1), next = state.queue[0];
    const need = last ? last.rec.s / 2 + sizeOf(next.usd) / 2 + 0.4 : 0;
    if (!last || last.x - SPAWN_X >= need) spawn(state.queue.shift());
  }
  if (!reduceMotion) yard.stripes.tex.offset.x -= (BELT.speed / 1.6) * dt;
  // Cleared crates shrink away
  for (const rec of [...liveBoxes]) if (rec.dying !== undefined && !rec.gone) retire(rec, dt);
  secAcc += dt;
  if (secAcc >= 1) {
    secAcc = 0;
    if (districtGroups.yard?.visible) yard.screen.redraw();
    statsListeners.forEach((f) => f());
  }
}

// ── Figures ────────────────────────────────────────────────────────────
function trim(now) {
  const since = now - WINDOW_MS;
  let i = 0;
  while (i < state.fills.length && state.fills[i].t < since) i++;
  if (i) state.fills.splice(0, i);
}
function record(f) {
  state.fills.push(f);
  if (!state.last || f.t >= state.last.t) state.last = f;
}
export function yardValues(now = Date.now()) {
  trim(now);
  const minute = now - 60_000;
  let perMin = 0, total = 0;
  const bySym = new Map();
  for (const f of state.fills) {
    if (f.t >= minute) perMin++;
    total += f.usd;
    bySym.set(f.sym, (bySym.get(f.sym) || 0) + 1);
  }
  const busiest = [...bySym.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    fillsPerMin: String(perMin),
    usd10m: usd(total),
    busiest: busiest ? `${busiest[0]} (${busiest[1]} fill${busiest[1] === 1 ? "" : "s"})` : "No fills in 10 min",
  };
}
export const onYardStats = (f) => statsListeners.push(f);
// Test hook (main.js puts it on window.__eco): feed made-up fills through the same path as the stream
let fakeId = 0;
export function injectFills(list) {
  const now = Date.now();
  for (const f of list) onTrade({ s: `${f.sym}-USD`, p: String(f.usd), q: "1", T: now, t: `test-${++fakeId}`, m: !f.buy });
}

function drawScreen(ctx, w, h) {
  const now = Date.now();
  const v = yardValues(now);
  ctx.fillStyle = "#07090b";
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = MINT;
  ctx.font = "500 38px 'Geist Mono', monospace";
  ctx.fillText("FILL YARD · LIVE FROM STRIKE", 48, 40);
  const st = state.status;
  const label = st === "live" ? "LIVE" : st === "connecting" ? "CONNECTING" : st === "reconnecting" ? "RECONNECTING" : "OFFLINE";
  ctx.textAlign = "right";
  ctx.fillStyle = st === "live" ? MINT : st === "offline" ? "#9ca3af" : "#f59e0b";
  ctx.fillText(`● ${label}`, w - 48, 40);
  [[v.fillsPerMin, "FILLS / MIN"], [v.usd10m, "TRADED, 10 MIN"], [state.fills.length ? v.busiest.split(" (")[0] : "—", "BUSIEST, 10 MIN"]].forEach(([val, lab], i) => {
    const x = 48 + i * 370;
    ctx.textAlign = "left";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "500 30px 'Geist Mono', monospace";
    ctx.fillText(lab, x, 136);
    ctx.fillStyle = "#f9fafb";
    ctx.font = "500 84px 'Geist Mono', monospace";
    ctx.fillText(val, x, 178, 340);
  });
  ctx.font = "500 34px 'Geist Mono', monospace";
  ctx.fillStyle = "#f9fafb";
  const last = state.last;
  ctx.fillText(
    !last ? (st === "offline" ? "NO CONNECTION TO THE TRADE STREAM" : "WAITING FOR THE FIRST FILL")
    : `LAST FILL: ${last.sym} ${usd(last.usd)} ${last.buy ? "BUY" : "SELL"}, ${ago(now - last.t).toUpperCase()}`,
    48, 330, w - 96,
  );
  ctx.fillStyle = "#9ca3af";
  const spilling = performance.now() - state.lastSpill < 4000;
  ctx.fillText(
    spilling ? "BELT FULL: CRATES SPILLING OVER THE SIDE"
    : state.queue.length ? `BACKED UP: ${state.queue.length} WAITING AT THE DOOR`
    : `${state.belt.length} ON THE BELT · ${state.landed.length} IN THE YARD`,
    48, 392, w - 96,
  );
}

// ── Feed ───────────────────────────────────────────────────────────────
function setStatus(s) {
  if (state.status === s) return;
  state.status = s;
  yard?.screen.redraw();
}
function remember(id) {
  if (id == null) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 6000) for (const k of seen) { seen.delete(k); if (seen.size <= 4000) break; }
  return true;
}
function onTrade(ev) {
  const usdv = Number(ev.p) * Number(ev.q);
  if (!(usdv > 0) || !remember(ev.t)) return;
  const f = { sym: base(ev.s), buy: !ev.m, usd: usdv, t: Number(ev.T) || Date.now() };
  record(f);
  const q = state.queue.at(-1);
  if (q && q.sym === f.sym && q.buy === f.buy && f.t - q.t < MERGE_MS) { q.usd += f.usd; q.t = f.t; return; }
  if (state.queue.length >= QUEUE_MAX) spill(f);
  else state.queue.push({ ...f });
}
function connect() {
  try { ws = new WebSocket(WS); } catch { return retry(); }
  ws.onopen = () => {
    backoff = 1000;
    setStatus("live");
    for (const s of symbols) ws.send(JSON.stringify({ method: "subscribe", channel: "trade", symbol: s, id: ++subId }));
  };
  ws.onmessage = (e) => {
    // Frames can carry several events separated by newlines
    for (const line of String(e.data).split("\n")) {
      if (!line.trim()) continue;
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      if (d?.e === "trade") onTrade(d);
    }
  };
  ws.onclose = () => retry();
  ws.onerror = () => {}; // close follows
}
function retry() {
  ws = null;
  setStatus(backoff >= 30_000 ? "offline" : "reconnecting");
  setTimeout(connect, backoff);
  backoff = Math.min(30_000, backoff * 2);
}
async function start() {
  try {
    const mk = await fetch(`${API}/v2/markets`, { cache: "no-store" }).then((r) => r.json());
    symbols = Object.values(mk.markets).filter((m) => m.status === "trading").map((m) => m.symbol);
  } catch (err) {
    console.warn("[eco] fill yard markets", err);
    setStatus("offline");
    return;
  }
  connect();
  backfill();
}
// Recent trades on the busiest markets: the figures start full, and the yard starts with crates in it
async function backfill() {
  try {
    const tickers = await fetch(`${API}/price/v2/ticker/24hr`, { cache: "no-store" }).then((r) => r.json());
    const top = tickers
      .filter((t) => symbols.includes(t.symbol))
      .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
      .slice(0, BACKFILL_MARKETS)
      .map((t) => t.symbol);
    const lists = await Promise.all(top.map((s) => fetch(`${API}/price/v2/trades?symbol=${s}&limit=300`).then((r) => r.json()).catch(() => [])));
    const since = Date.now() - WINDOW_MS;
    const all = lists
      .flatMap((l, i) => (Array.isArray(l) ? l : []).map((t) => ({ id: t.id, sym: base(top[i]), buy: !t.isBuyerMaker, usd: Number(t.quoteQty) || Number(t.price) * Number(t.qty), t: Number(t.time) })))
      .filter((f) => f.t >= since && f.usd > 0 && remember(f.id))
      .sort((a, b) => a.t - b.t);
    for (const f of all) record(f);
    // The last few orders (partials merged), already through the yard
    const orders = [];
    for (const f of all) {
      const q = orders.at(-1);
      if (q && q.sym === f.sym && q.buy === f.buy && f.t - q.t < MERGE_MS) { q.usd += f.usd; q.t = f.t; } else orders.push({ ...f });
    }
    if (!state.seeded && yard) { state.seeded = true; seed(orders.slice(-8)); }
    yard?.screen.redraw();
  } catch (err) {
    console.warn("[eco] fill yard backfill", err);
  }
}
