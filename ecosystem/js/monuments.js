// The monuments (Part B of docs/superpowers/specs/2026-11-03-ecosystem-districts-design.md in the Strike repo): a live
// centrepiece in the middle of a plaza, built on Strike's public figures. Each is an ordinary stop (stops.js) whose
// blockout, and later its Blender model, carries named nodes this module animates; the maths and the field picks live in
// monument-math.js, where Node tests pin them. B1 (3 Nov 2026): the SLP Engine in Earn and the Stake in Token.
//
// Motion ticks from the frame loop whether or not a sheet is open, as the Fill Yard's belt does (the world's clock stops
// the car only). Figures arrive two ways: the 30 s fetchLive in main.js (applyMonuments) and this module's own poll of the
// SLP vault's fills every 10 s (seeded once with a thousand, the API's cap, so the hour figure fills in over the first hour).
import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS, STOPS, isMonument } from "./content.js";
import { pads, accent, M, obbOf, modelHooks, canvasTexture, redraws, themePalette } from "./build.js";
import { slpVaultId, usd, int } from "./data.js";
import { FILLS, ENGINE, STAKE, seedDue, pickFills, mergeFills, fillsIn, fillsLine, wheelSpeed, tankLevel, gaugeFraction, topVaults, sparkBudget, columnScale, lampsLit, usdExact, periodLabel, PLINTH, seriesDue, pickSeries, barScales, plinthValues, STACKS, stackScale, ringLayout, BEACON, rungScales, carsHere, carsLine, pulsePeriod, FEED, tradeLine, feedLines } from "./monument-math.js";
import { onPeers, peersState } from "./peers.js";
import { onTrade, onYardStatus, onYardStats, yardValues } from "./flow.js";

const API = "https://api.strikefinance.org";
const KERB = { lift: 0.8, gap: (40 * Math.PI) / 180, radius: 0.14 }; // the kerb arc: 0.8 m outside the footprint, open ±40° towards the pad
const RINGS = { perCircle: 24, step: 1.2, first: 0.9, max: 72, r: 0.35, tube: 0.06 };
const SPARK = { life: 0.8, gravity: 9.8, speed: 4 };
const DRIP = { seconds: 10, every: 0.4, cap: 12, gravity: 6 };

let opts = { coarse: false, reduceMotion: false };
const listeners = [];
const state = {
  slp: null, staking: null, high: null, // the last SLP and staking picks; the highest SLP equity seen this session
  fills: [], since: null, seeded: false, lastAt: 0, lastOkAt: 0, ok: true, forceSeed: false, startedAt: 0, // the fills poll
  collateral: null, // the Collateral Stacks: the last pick
  feed: [], feedDirty: false, streamStatus: "offline", // the Feed Obelisk: the last lines of the trade stream and its status
  activity: null, cars: { status: "off", n: 0 }, // the Beacon: the users series and the presence room's state
  series: null, seriesOk: true, seriesAt: 0, summary: null, // the Chart Plinth: the two daily series (hourly) and the all-time counter
};
const monuments = new Map(); // district key → { g, aux, nodes, ... }
const glass = M.glass.clone(); glass.transparent = true; glass.opacity = 0.35; glass.depthWrite = false;
const ease = (cur, target, dt, k) => cur + (target - cur) * (1 - Math.exp(-dt * k));

function findMonument(key) {
  const pad = pads.find((p) => p.stop.key === key);
  if (!pad) return null;
  const d = DISTRICTS[pad.stop.district];
  let m = monuments.get(key);
  if (!m) {
    const aux = new THREE.Group(); // kerb, sparks and rings live beside the building, not in it: a model swap empties the group
    aux.position.copy(pad.group.position); aux.rotation.copy(pad.group.rotation);
    pad.group.parent.add(aux);
    m = { key, pad, g: pad.group, aux, d, nodes: {}, kerb: null };
    monuments.set(key, m);
  }
  m.g = pad.group;
  return m;
}
const node = (g, name) => g.getObjectByName(name) || null;
const names = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(2, "0")}`);
const setMaterial = (n, mat) => n.traverse((o) => { if (o.isMesh) o.material = mat; });

/** A two-line label/value face (canvas), blank until its first text, repainted on a theme change or a new value. */
function makeFace(m, lines = 2) {
  if (m.face) return;
  m.faceText = null;
  m.face = canvasTexture(1024, 16 + 92 * lines, (ctx, w, h, p) => {
    ctx.fillStyle = p.panel; ctx.fillRect(0, 0, w, h);
    if (!m.faceText) return;
    ctx.textBaseline = "middle";
    m.faceText.forEach(([label, value], i) => {
      const y = 52 + i * 92, labelFont = "500 36px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      ctx.font = labelFont; ctx.textAlign = "left"; ctx.fillStyle = p.sub; ctx.fillText(label, 40, y);
      const room = w - 80 - ctx.measureText(label).width - 30; // the value squeezes rather than runs into its label
      ctx.textAlign = "right"; ctx.fillStyle = p.text; ctx.font = "600 46px 'Atkinson Hyperlegible Next', Arial, sans-serif"; ctx.fillText(value, w - 40, y, room);
    });
  });
  redraws.push(m.face.redraw);
  m.faceMat = new THREE.MeshBasicMaterial({ map: m.face.tex, toneMapped: false });
}
function bindFace(m, faceNode) {
  if (!faceNode) return;
  m.face.tex.flipY = !!faceNode.userData.blockout; // glTF UVs run top-down
  m.face.tex.needsUpdate = true;
  faceNode.material = m.faceMat; faceNode.castShadow = false;
  if (themePalette()) m.face.redraw(themePalette());
}
function setFaceText(m, text) {
  const key = JSON.stringify(text);
  if (key !== m.faceKey) { m.faceKey = key; m.faceText = text; if (themePalette()) m.face.redraw(themePalette()); }
}

/** The kerb arc round the footprint, rebuilt when the model lands (its footprint differs from the blockout's). */
function buildKerb(m) {
  if (m.kerb) m.aux.remove(m.kerb);
  const b = obbOf(m.g, 0).box;
  const r = Math.max(b.max.z - b.min.z, b.max.x - b.min.x) / 2 + KERB.lift;
  const holder = new THREE.Group(); holder.rotation.x = Math.PI / 2; holder.position.y = KERB.radius;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(r, KERB.radius, 8, 56, Math.PI * 2 - KERB.gap * 2), M.trim);
  arc.rotation.z = Math.PI / 2 + KERB.gap; // the gap centred on the pad side (+z before the holder's tilt)
  arc.castShadow = true; arc.receiveShadow = true;
  holder.add(arc); m.aux.add(holder); m.kerb = holder; m.kerbR = r;
}

// ── The SLP Engine ──
function attachEngine(m) {
  const tank = node(m.g, "tank"); // the shared glass is opaque; the tank has to show its level
  if (tank) { tank.material = glass; tank.castShadow = false; }
  m.nodes = { wheel: node(m.g, "flywheel"), pistons: [node(m.g, "piston_a"), node(m.g, "piston_b")], fill: node(m.g, "tank_fill"), needles: ["gauge_a", "gauge_b", "gauge_c"].map((n) => node(m.g, n)) };
  if (m.nodes.fill && m.nodes.fill.userData.fullY == null) m.nodes.fill.userData.fullY = m.nodes.fill.scale.y;
  for (const p of m.nodes.pistons) if (p) p.userData.baseY = p.position.y;
  buildKerb(m);
  if (!m.sparks) {
    const cap = opts.coarse ? ENGINE.sparkCapCoarse : ENGINE.sparkCap;
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), accent(m.d.colour), cap);
    mesh.count = 0; mesh.frustumCulled = false;
    m.aux.add(mesh);
    m.sparks = { mesh, cap, live: [] };
    const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(RINGS.r, RINGS.tube, 6, 20), accent(m.d.colour), RINGS.max);
    rings.count = 0; rings.frustumCulled = false;
    m.aux.add(rings);
    m.rings = rings;
  }
  m.wheelSpeed = m.wheelSpeed || 0;
  layRings(m);
}
/** One ring per open SLP position, flat round the base outside the kerb, spread over the 280° away from the pad. */
function layRings(m) {
  if (!m.rings) return;
  const n = Math.min(RINGS.max, state.slp?.positions?.length ?? 0);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), s = new THREE.Vector3(1, 1, 1);
  const span = Math.PI * 2 - KERB.gap * 2;
  for (let i = 0; i < n; i++) {
    const circle = Math.floor(i / RINGS.perCircle), k = i % RINGS.perCircle, onThis = Math.min(RINGS.perCircle, n - circle * RINGS.perCircle);
    const a = Math.PI / 2 + KERB.gap + (span * (k + 0.5)) / onThis; // from the gap's edge, round the back, to the other edge (+z is π/2 here)
    const r = (m.kerbR ?? 4) + RINGS.first + circle * RINGS.step;
    mat.compose(new THREE.Vector3(Math.cos(a) * r, 0.05, Math.sin(a) * r), q, s);
    m.rings.setMatrixAt(i, mat);
  }
  m.rings.count = n;
  m.rings.instanceMatrix.needsUpdate = true;
}
function fireSparks(m, n) {
  if (!m.sparks || !m.nodes.wheel || opts.reduceMotion) return;
  const w = m.nodes.wheel, radius = 2.4;
  for (let i = 0; i < n; i++) {
    const a = w.rotation.x + (Math.random() - 0.5) * 0.6, dir = Math.random() < 0.5 ? 1 : -1;
    const p = new THREE.Vector3(w.position.x, w.position.y + Math.cos(a) * radius, w.position.z + Math.sin(a) * radius);
    const v = new THREE.Vector3((Math.random() - 0.5) * 1.5, -Math.sin(a) * SPARK.speed * dir + 1.5, Math.cos(a) * SPARK.speed * dir);
    m.sparks.live.push({ p, v, life: SPARK.life });
  }
}
function stepSparks(m, dt) {
  const s = m.sparks; if (!s) return;
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  s.live = s.live.filter((k) => (k.life -= dt) > 0);
  s.live.forEach((k, i) => {
    k.v.y -= SPARK.gravity * dt; k.p.addScaledVector(k.v, dt);
    const f = Math.max(0.2, k.life / SPARK.life);
    mat.compose(k.p, q, sc.set(f, f, f)); s.mesh.setMatrixAt(i, mat);
  });
  s.mesh.count = s.live.length;
  if (s.live.length) s.mesh.instanceMatrix.needsUpdate = true;
}
function tickEngine(m, dt, now) {
  const { wheel, pistons, fill, needles } = m.nodes;
  const target = opts.reduceMotion ? 0 : wheelSpeed(fillsIn(state.fills, now, 60_000));
  m.wheelSpeed = ease(m.wheelSpeed, target, dt, 2);
  if (wheel) wheel.rotation.x += m.wheelSpeed * dt;
  pistons.forEach((p, i) => { if (p) p.position.y = p.userData.baseY + Math.sin((wheel?.rotation.x ?? 0) + i * Math.PI) * 0.35; });
  if (fill && state.slp) fill.scale.y = ease(fill.scale.y, Math.max(0.02, tankLevel(state.slp.equity, state.high)) * fill.userData.fullY, dt, 1.5);
  if (state.slp) topVaults(state.slp.userVaults).forEach((v, i) => {
    const n = needles[i]; if (!n) return;
    const want = (0.5 - (v ? gaugeFraction(v.equity) : 0)) * ((5 * Math.PI) / 6); // 150° sweep, left at $1K, right at $1M
    n.rotation.z = ease(n.rotation.z, want, dt, 1.5);
  });
  stepSparks(m, dt);
}

// ── The Stake ──
function attachStake(m) {
  m.nodes = { column: node(m.g, "column"), spout: node(m.g, "spout"), face: node(m.g, "face_rewards"), lamps: Array.from({ length: STAKE.lamps }, (_, i) => node(m.g, `lamp_${String(i + 1).padStart(2, "0")}`)) };
  buildKerb(m);
  makeFace(m); bindFace(m, m.nodes.face); // the plinth's face: two lines, blank until the first staking figure
  if (!m.drips) {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 4), accent(m.d.colour), DRIP.cap);
    mesh.count = 0; mesh.frustumCulled = false; m.aux.add(mesh);
    m.drips = { mesh, live: [], until: 0, next: 0 };
  }
  applyStake(m);
}
function applyStake(m) {
  const s = state.staking; if (!s || !m.nodes.column) return;
  if (s.staked != null) { m.columnTarget = columnScale(s.staked); if (opts.reduceMotion) m.nodes.column.scale.y = m.columnTarget; }
  if (s.stakers != null) { // a missing count leaves the lamps as they were
    const lit = lampsLit(s.stakers);
    m.nodes.lamps.forEach((l, i) => { if (l) l.material = i < lit ? accent(m.d.colour) : M.build; }); // unlit in the building colour: trim is white at night
  }
  const text = [["Rewards building this period", s.upcomingUsd != null ? usdExact(s.upcomingUsd) : ""]];
  if (s.latest?.amountUsd != null) text.push(["Last distribution", `${usdExact(s.latest.amountUsd)} · ${periodLabel(s.latest.start, s.latest.end)}`]);
  setFaceText(m, text);
  if (m.lastDistributions != null && s.distributions > m.lastDistributions && !opts.reduceMotion) m.drips.until = performance.now() / 1000 + DRIP.seconds;
  if (s.distributions != null) m.lastDistributions = s.distributions;
}
function tickStake(m, dt) {
  const { column, spout } = m.nodes;
  if (column && m.columnTarget != null) column.scale.y = ease(column.scale.y, m.columnTarget, dt, 1.5);
  const d = m.drips; if (!d) return;
  const t = performance.now() / 1000;
  if (t < d.until && t >= d.next && d.live.length < DRIP.cap && spout) {
    d.next = t + DRIP.every;
    const p = m.aux.worldToLocal(spout.getWorldPosition(new THREE.Vector3()));
    d.live.push({ p, v: new THREE.Vector3(0, 0, 0.6), life: 3 });
  }
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  d.live = d.live.filter((k) => (k.life -= dt) > 0 && k.p.y > 0.2);
  d.live.forEach((k, i) => { k.v.y -= DRIP.gravity * dt; k.p.addScaledVector(k.v, dt); mat.compose(k.p, q, sc); d.mesh.setMatrixAt(i, mat); });
  d.mesh.count = d.live.length;
  if (d.live.length) d.mesh.instanceMatrix.needsUpdate = true;
}

// ── The Chart Plinth ──
function attachPlinth(m) {
  m.nodes = { vol: names("vol", PLINTH.days).map((n) => node(m.g, n)), rev: names("rev", PLINTH.days).map((n) => node(m.g, n)), face: node(m.g, "face_counter") };
  for (const b of [...m.nodes.vol, ...m.nodes.rev]) if (b && b.userData.fullY == null) b.userData.fullY = b.scale.y;
  buildKerb(m);
  makeFace(m); bindFace(m, m.nodes.face); // the all-time counter, blank until the first summary
  applyPlinth(m);
}
/** A row of bars takes its targets: an empty slot hides, the newest filled slot is lit in the accent; returns that slot. */
function layRow(m, row, targets) {
  const last = targets.reduce((k, t, i) => (t == null ? k : i), -1);
  row.forEach((b, i) => {
    if (!b) return;
    const t = targets[i];
    b.visible = t != null; b.userData.target = t ?? 0.02;
    if (t != null) setMaterial(b, i === last ? accent(m.d.colour) : M.build);
    if (opts.reduceMotion) b.scale.y = b.userData.target * b.userData.fullY;
  });
  return last < 0 ? null : last;
}
function applyPlinth(m) {
  if (!m?.nodes.vol) return;
  const s = state.series;
  if (s?.volume) m.litBar = layRow(m, m.nodes.vol, barScales(s.volume));
  if (s?.revenue) layRow(m, m.nodes.rev, barScales(s.revenue));
  const c = state.summary, text = [];
  if (c?.volumeUsd != null) text.push(["Volume, all time", usd(c.volumeUsd)]);
  if (c?.users != null) text.push(["Users, all time", int(c.users)]);
  if (text.length) setFaceText(m, text);
}
function tickPlinth(m, dt) {
  for (const b of [...m.nodes.vol, ...m.nodes.rev]) if (b?.visible && b.userData.target != null) b.scale.y = ease(b.scale.y, b.userData.target * b.userData.fullY, dt, 1.5);
}
/** The two daily series once an hour (30 s after a failure, not while the tab is hidden); a failed side keeps its last days. */
async function pollSeries(now = Date.now()) {
  if (document.hidden || !seriesDue(now, state.seriesAt, state.seriesOk)) return;
  state.seriesAt = now;
  const get = async (p) => { try { const r = await fetch(`${API}${p}`, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };
  const [v, r] = await Promise.all([get("/stat/v1/dashboard/volumes"), get("/stat/v1/dashboard/revenue")]);
  const s = pickSeries(v, r) ?? { volume: null, revenue: null }, prev = state.series;
  state.seriesOk = !!(s.volume && s.revenue); // a side with no usable day counts as failed: the 30 s retry, the last days kept
  state.series = { volume: s.volume ?? prev?.volume ?? null, revenue: s.revenue ?? prev?.revenue ?? null };
  if (!state.seriesOk) console.warn("[eco] daily series:", [s.volume ? null : "volumes", s.revenue ? null : "revenue"].filter(Boolean).join(" and "), "failed");
  applyPlinth(monuments.get("monument-analytics"));
  listeners.forEach((f) => f());
}

// ── The Collateral Stacks ──
const STACK_RING = { r: 0.7, tube: 0.05 };
function attachStacks(m) {
  m.nodes = { stacks: names("stack", STACKS.slots).map((n) => node(m.g, n)), labels: names("label", STACKS.slots).map((n) => node(m.g, n)) };
  for (const s of m.nodes.stacks) if (s && s.userData.fullY == null) { s.userData.fullY = s.scale.y; s.userData.fullH = new THREE.Box3().setFromObject(s).getSize(new THREE.Vector3()).y / (s.scale.y || 1); }
  buildKerb(m);
  if (!m.labels) { // a name plate per slot, blank until an asset takes the slot
    m.labels = m.nodes.labels.map(() => {
      const l = { text: null };
      l.face = canvasTexture(512, 128, (ctx, w, h, p) => { ctx.fillStyle = p.panel; ctx.fillRect(0, 0, w, h); if (!l.text) return; ctx.fillStyle = p.text; ctx.font = "600 56px 'Atkinson Hyperlegible Next', Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(l.text, w / 2, h / 2 + 2, w - 40); });
      redraws.push(l.face.redraw);
      l.mat = new THREE.MeshBasicMaterial({ map: l.face.tex, toneMapped: false });
      return l;
    });
    const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(STACK_RING.r, STACK_RING.tube, 6, 20), accent(m.d.colour), STACKS.slots * STACKS.ringsCap);
    rings.count = 0; rings.frustumCulled = false; m.aux.add(rings); m.rings = rings;
  }
  m.nodes.labels.forEach((n, i) => { if (!n) return; const l = m.labels[i]; l.face.tex.flipY = !!n.userData.blockout; l.face.tex.needsUpdate = true; n.material = l.mat; n.castShadow = false; if (themePalette()) l.face.redraw(themePalette()); });
  applyStacks(m);
}
function applyStacks(m) {
  if (!m?.nodes.stacks || state.collateral == null) return;
  const list = state.collateral.slice(0, STACKS.slots);
  m.nodes.stacks.forEach((s, i) => {
    const a = list[i], l = m.labels[i];
    if (s) { s.userData.target = a ? stackScale(a.usd) : 0.02; s.userData.hide = !a; if (a) s.visible = true; if (opts.reduceMotion) s.scale.y = s.userData.target * s.userData.fullY; }
    const text = a?.name ?? null;
    if (l && text !== l.text) { l.text = text; if (themePalette()) l.face.redraw(themePalette()); }
  });
  m.stackList = list;
  layStackRings(m);
}
/** One ring per open credit line, climbing the stack from its foot, compressed when the stack is short. */
function layStackRings(m) {
  if (!m.rings) return;
  m.g.updateMatrixWorld(true); m.aux.updateMatrixWorld(true);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let k = 0;
  (m.stackList ?? []).forEach((a, i) => {
    const s = m.nodes.stacks[i]; if (!s) return;
    const { count, step } = ringLayout(s.userData.target * s.userData.fullH, a.lines); if (!count) return; // no ring above the stack's top
    m.aux.worldToLocal(s.getWorldPosition(p));
    for (let j = 0; j < count && k < m.rings.instanceMatrix.count; j++, k++) { mat.compose(new THREE.Vector3(p.x, p.y + STACKS.ringFirst + j * step, p.z), q, sc); m.rings.setMatrixAt(k, mat); }
  });
  m.rings.count = k;
  m.rings.instanceMatrix.needsUpdate = true;
}
function tickStacks(m, dt) {
  for (const s of m.nodes.stacks) {
    if (!s || s.userData.target == null) continue;
    s.scale.y = ease(s.scale.y, s.userData.target * s.userData.fullY, dt, 1.5);
    if (s.userData.hide && s.scale.y < 0.03 * s.userData.fullY) s.visible = false;
  }
}

// ── The Beacon ──
function attachBeacon(m) {
  m.nodes = { rungs: names("rung", BEACON.days).map((n) => node(m.g, n)), lantern: node(m.g, "lantern"), face: node(m.g, "face_activity") };
  buildKerb(m);
  if (m.nodes.lantern) { // its own material, so the pulse touches no other mesh
    const lm = accent(m.d.colour).clone(); if (lm.emissive) lm.emissive.set(m.d.colour); lm.emissiveIntensity = 1;
    setMaterial(m.nodes.lantern, lm); m.lanternMat = lm;
  }
  makeFace(m); bindFace(m, m.nodes.face); // yesterday's traders and the cars here now, blank until the first series
  m.pulse = m.pulse ?? pulsePeriod(1); m.phase = m.phase ?? 0;
  applyBeacon(m);
}
function applyBeacon(m) {
  if (!m?.nodes.rungs) return;
  const a = state.activity;
  if (a) {
    const scales = rungScales(a.days);
    m.nodes.rungs.forEach((r, i) => {
      if (!r) return;
      const s = scales[i];
      r.visible = s != null; r.userData.target = s ?? 0.02;
      if (s != null) setMaterial(r, accent(m.d.colour));
      if (opts.reduceMotion) r.scale.x = r.userData.target;
    });
  }
  const cars = carsHere(state.cars.status, state.cars.n);
  m.pulse = pulsePeriod(Number(cars) || 1);
  if (a?.days.length) setFaceText(m, [["Active traders, yesterday", int(a.days.at(-1).n)], ["Cars here now", cars ?? "—"]]);
}
function tickBeacon(m, dt) {
  for (const r of m.nodes.rungs) if (r?.visible && r.userData.target != null) r.scale.x = ease(r.scale.x, r.userData.target, dt, 1.5);
  if (m.lanternMat) { m.phase += dt; m.lanternMat.emissiveIntensity = opts.reduceMotion ? 1 : 0.5 + 0.9 * (0.5 + 0.5 * Math.sin((2 * Math.PI * m.phase) / m.pulse)); }
}

// ── The Feed Obelisk ──
function attachObelisk(m) {
  m.nodes = { screens: names("screen", 4).map((n) => node(m.g, n)), face: node(m.g, "face_feed") };
  buildKerb(m);
  if (!m.screen) { // one canvas for the four screens: the held lines from the top, newest at the bottom, the stream's status last
    m.screen = canvasTexture(512, 1180, (ctx, w, h, p) => {
      ctx.fillStyle = p.panel; ctx.fillRect(0, 0, w, h);
      ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.font = "500 30px 'Geist Mono', monospace";
      ctx.fillStyle = p.text;
      state.feed.forEach((line, i) => ctx.fillText(line, 24, 60 + i * 76, w - 48));
      if (state.streamStatus !== "live") { ctx.fillStyle = p.sub; ctx.fillText(state.streamStatus === "reconnecting" ? "Stream reconnecting" : "Stream offline", 24, h - 40, w - 48); }
    });
    redraws.push(m.screen.redraw);
    m.screenMat = new THREE.MeshBasicMaterial({ map: m.screen.tex, toneMapped: false });
    m.repaintIn = 0;
  }
  m.nodes.screens.forEach((s) => { if (!s) return; s.material = m.screenMat; s.castShadow = false; });
  const blockout = m.nodes.screens.some((s) => s?.userData.blockout);
  m.screen.tex.flipY = blockout; m.screen.tex.needsUpdate = true;
  if (themePalette()) m.screen.redraw(themePalette());
  makeFace(m); bindFace(m, m.nodes.face); // the yard's minute figures
  applyObelisk(m);
}
function applyObelisk(m) {
  if (!m?.nodes.screens) return;
  const v = yardValues();
  if (v.busiest === "No fills in 10 min" && v.fillsPerMin === "0") return; // nothing seen yet: the face stays blank
  setFaceText(m, [["Fills, last minute", v.fillsPerMin], ["Busiest, 10 min", v.busiest.split(" (")[0]]]);
}
function tickObelisk(m, dt) {
  m.repaintIn -= dt;
  if (state.feedDirty && m.repaintIn <= 0 && themePalette()) { m.screen.redraw(themePalette()); state.feedDirty = false; m.repaintIn = FEED.repaintMs / 1000; }
}

// ── The Three Pylons ──
function attachPylons(m) {
  m.nodes = { face: node(m.g, "face_flows"), labels: ["cardano", "ethereum", "solana"].map((c) => node(m.g, `label_${c}`)) };
  buildKerb(m);
  if (!m.labels) m.labels = ["Cardano", "Ethereum", "Solana"].map((text) => {
    const l = { text };
    l.face = canvasTexture(512, 128, (ctx, w, h, p) => { ctx.fillStyle = p.panel; ctx.fillRect(0, 0, w, h); ctx.fillStyle = p.text; ctx.font = "600 56px 'Atkinson Hyperlegible Next', Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(l.text, w / 2, h / 2 + 2, w - 40); });
    redraws.push(l.face.redraw);
    l.mat = new THREE.MeshBasicMaterial({ map: l.face.tex, toneMapped: false });
    return l;
  });
  m.nodes.labels.forEach((n, i) => { if (!n) return; const l = m.labels[i]; l.face.tex.flipY = !!n.userData.blockout; l.face.tex.needsUpdate = true; n.material = l.mat; n.castShadow = false; if (themePalette()) l.face.redraw(themePalette()); });
  makeFace(m, 3); bindFace(m, m.nodes.face); // deposits, withdrawals and the difference, blank until the first summary
  applyPylons(m);
}
function applyPylons(m) {
  if (!m?.nodes.face) return;
  const c = state.summary, text = [];
  if (c?.depositsUsd != null) text.push(["Deposits, all time", usd(c.depositsUsd)]);
  if (c?.withdrawalsUsd != null) text.push(["Withdrawals, all time", usd(c.withdrawalsUsd)]);
  if (c?.depositsUsd != null && c?.withdrawalsUsd != null) text.push(["Deposits less withdrawals", usd(c.depositsUsd - c.withdrawalsUsd)]);
  if (text.length) setFaceText(m, text);
}

// ── The fills poll ──
async function pollFills(now = Date.now()) {
  const id = slpVaultId();
  if (!state.startedAt) state.startedAt = now;
  if (!id) { if (now - state.startedAt > 90_000) state.ok = false; return; } // no vault id after three fetchLive rounds: the line says so
  if (document.hidden) return;
  const wait = state.ok ? FILLS.pollMs : FILLS.retryMs;
  if (state.lastAt && now - state.lastAt < wait - 500) return;
  state.lastAt = now;
  const seed = state.forceSeed || seedDue(now, state.lastOkAt, state.seeded); // the first poll, or the first after a gap (hidden tab, outage), or after a poll of all-new fills
  try {
    const res = await fetch(`${API}/v2/history/fill?vault_id=${id}&limit=${seed ? FILLS.seed : FILLS.limit}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`fills ${res.status}`);
    takeFills(pickFills(await res.json()), Date.now(), seed);
    state.seeded = true; state.ok = true; state.lastOkAt = Date.now(); state.forceSeed = false;
  } catch (err) {
    state.ok = false;
    console.warn("[eco] slp fills", err.message);
  }
}
function takeFills(incoming, now, seed = false) {
  const { fills, added } = mergeFills(state.fills, incoming, now);
  if (!seed && incoming.length >= FILLS.limit && added.length === incoming.length) state.forceSeed = true; // a full page of new fills: the gap may be wider than a page
  state.fills = fills;
  for (const f of incoming) if (state.since == null || f.timestamp < state.since) state.since = f.timestamp;
  const m = monuments.get("monument-earn");
  if (m && !seed) fireSparks(m, sparkBudget(added.length, m.sparks?.live.length ?? 0, m.sparks?.cap ?? 0));
  listeners.forEach((f) => f());
}

// ── Public ──
export function initMonuments({ coarse = false, reduceMotion = false } = {}) {
  opts = { coarse, reduceMotion };
  const attach = { "monument-earn": attachEngine, "monument-token": attachStake, "monument-analytics": attachPlinth, "monument-collateral": attachStacks, "monument-community": attachBeacon, "monument-developers": attachObelisk, "monument-chains": attachPylons };
  for (const stop of STOPS.filter(isMonument)) {
    const fn = attach[stop.key];
    if (!fn) continue;
    const go = () => { const m = findMonument(stop.key); if (m) fn(m); };
    modelHooks.set(stop.key, go);
    go();
  }
  const room = (s) => { state.cars = { status: s.status, n: s.peers.length }; applyBeacon(monuments.get("monument-community")); listeners.forEach((f) => f()); };
  room(peersState()); onPeers(room); // the Beacon's lantern and its "Cars here now"
  onTrade((ev) => { const line = tradeLine(ev); if (line) { state.feed = feedLines(state.feed, line); state.feedDirty = true; } }); // the Feed Obelisk's screens
  onYardStatus((s) => { state.streamStatus = s; state.feedDirty = true; });
  onYardStats(() => applyObelisk(monuments.get("monument-developers")));
  setInterval(() => { pollFills(); pollSeries(); }, 1000);
  pollFills(); pollSeries();
}
export function applyMonuments(monuments) {
  if (!monuments) return;
  if (monuments.slp) {
    const prev = state.slp;
    state.slp = { ...monuments.slp, positions: monuments.slp.positions ?? prev?.positions ?? null }; // a failed positions fetch keeps the rings
    if (monuments.slp.equity != null) state.high = Math.max(state.high ?? 0, monuments.slp.equity);
    const m = findMonument("monument-earn"); if (m) layRings(m);
  }
  if (monuments.staking) { state.staking = monuments.staking; const m = findMonument("monument-token"); if (m) applyStake(m); }
  if (monuments.summary) { state.summary = monuments.summary; applyPlinth(findMonument("monument-analytics")); applyPylons(findMonument("monument-chains")); }
  if (monuments.collateral) { state.collateral = monuments.collateral; applyStacks(findMonument("monument-collateral")); } // a failed fetch keeps the last stacks
  if (monuments.activity) { state.activity = monuments.activity; applyBeacon(findMonument("monument-community")); }
}
export function monumentsTick(dt) {
  const now = Date.now();
  const e = monuments.get("monument-earn"); if (e) tickEngine(e, dt, now);
  const t = monuments.get("monument-token"); if (t) tickStake(t, dt);
  const a = monuments.get("monument-analytics"); if (a?.nodes.vol) tickPlinth(a, dt);
  const c = monuments.get("monument-collateral"); if (c?.nodes.stacks) tickStacks(c, dt);
  const b = monuments.get("monument-community"); if (b?.nodes.rungs) tickBeacon(b, dt);
  const o = monuments.get("monument-developers"); if (o?.screen) tickObelisk(o, dt);
}
export function monumentValues() {
  // Before the seed lands the line is loading, not "Not available" (the smoke caught a sheet opened in that gap, 3 Nov);
  // after a failed seed with nothing held it is honestly unavailable until the next try succeeds
  const line = fillsLine(state.fills, state.since, Date.now());
  const p = plinthValues(state.series), pending = state.seriesOk || !state.seriesAt ? "Loading" : "Not available";
  return { slpFillsHour: line ?? (state.ok ? "Loading" : "Not available"), volume30d: p.volume30d ?? pending, revenue30d: p.revenue30d ?? pending,
    carsHere: carsLine(state.cars.status, state.cars.n) };
}
export const onMonumentStats = (f) => listeners.push(f);
/** QA: feed fills as a poll would. */
export function injectSlpFills(list) { state.seeded = true; takeFills(pickFills({ fills: list }), Date.now()); }
export const monumentsState = () => {
  const e = monuments.get("monument-earn");
  const t = monuments.get("monument-token");
  const a = monuments.get("monument-analytics");
  const c = monuments.get("monument-collateral");
  const b = monuments.get("monument-community");
  const o = monuments.get("monument-developers");
  const y = monuments.get("monument-chains");
  return { pylonsFace: y?.faceText ?? null,
    feed: state.feed.length, feedLast: state.feed.at(-1) ?? null, stream: state.streamStatus, obeliskFace: o?.faceText ?? null,
    rungs: b?.nodes.rungs?.filter((r) => r?.visible).length ?? 0, pulse: b?.pulse ?? null, beaconFace: b?.faceText ?? null, cars: state.cars,
    stacks: c?.stackList?.length ?? 0, stackRings: c?.rings?.count ?? 0, stackNames: c?.stackList?.map((x) => x.name) ?? [],
    bars: a?.nodes.vol?.filter((b) => b?.visible).length ?? 0, litBar: a?.litBar ?? null, plinthFace: a?.faceText ?? null, seriesAt: state.seriesAt,
    fills: state.fills.length, since: state.since, seeded: state.seeded, sparks: e?.sparks?.live.length ?? 0, rings: e?.rings?.count ?? 0, wheel: e?.wheelSpeed ?? 0,
    column: t?.nodes.column?.scale.y ?? null, lampsLit: t?.nodes.lamps.filter((l) => l?.material?.userData.accent).length ?? 0, drips: t?.drips?.live.length ?? 0, face: t?.faceText ?? null };
};
