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
import { pads, accent, M, obbOf, modelHooks } from "./build.js";
import { slpVaultId } from "./data.js";
import { FILLS, ENGINE, pickFills, mergeFills, fillsIn, hourFigure, hourString, wheelSpeed, tankLevel, gaugeFraction, topVaults, sparkBudget } from "./monument-math.js";

const API = "https://api.strikefinance.org";
const KERB = { lift: 0.8, gap: (40 * Math.PI) / 180, radius: 0.14 }; // the kerb arc: 0.8 m outside the footprint, open ±40° towards the pad
const RINGS = { perCircle: 24, step: 1.2, first: 0.9, max: 72, r: 0.35, tube: 0.06 };
const SPARK = { life: 0.8, gravity: 9.8, speed: 4 };

let opts = { coarse: false, reduceMotion: false };
const listeners = [];
const state = {
  slp: null, staking: null, high: null, // the last SLP and staking picks; the highest SLP equity seen this session
  fills: [], since: null, seeded: false, lastAt: 0, ok: true, // the fills poll
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
  const n = Math.min(RINGS.max, state.slp?.positions.length ?? 0);
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

// ── The fills poll ──
async function pollFills(now = Date.now()) {
  const id = slpVaultId();
  if (!id || document.hidden) return;
  const wait = state.ok ? FILLS.pollMs : FILLS.retryMs;
  if (state.lastAt && now - state.lastAt < wait - 500) return;
  state.lastAt = now;
  try {
    const res = await fetch(`${API}/v2/history/fill?vault_id=${id}&limit=${state.seeded ? FILLS.limit : FILLS.seed}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`fills ${res.status}`);
    takeFills(pickFills(await res.json()), Date.now(), !state.seeded);
    state.seeded = true; state.ok = true;
  } catch (err) {
    state.ok = false;
    console.warn("[eco] slp fills", err.message);
  }
}
function takeFills(incoming, now, seed = false) {
  const { fills, added } = mergeFills(state.fills, incoming, now);
  state.fills = fills;
  for (const f of incoming) if (state.since == null || f.timestamp < state.since) state.since = f.timestamp;
  const m = monuments.get("monument-earn");
  if (m && !seed) fireSparks(m, sparkBudget(added.length, m.sparks?.live.length ?? 0, m.sparks?.cap ?? 0));
  listeners.forEach((f) => f());
}

// ── Public ──
export function initMonuments({ coarse = false, reduceMotion = false } = {}) {
  opts = { coarse, reduceMotion };
  const attach = { "monument-earn": attachEngine };
  for (const stop of STOPS.filter(isMonument)) {
    const fn = attach[stop.key];
    if (!fn) continue;
    const go = () => { const m = findMonument(stop.key); if (m) fn(m); };
    modelHooks.set(stop.key, go);
    go();
  }
  setInterval(() => pollFills(), 1000);
  pollFills();
}
export function applyMonuments(monuments) {
  if (!monuments) return;
  if (monuments.slp) {
    state.slp = monuments.slp;
    if (monuments.slp.equity != null) state.high = Math.max(state.high ?? 0, monuments.slp.equity);
    const m = findMonument("monument-earn"); if (m) layRings(m);
  }
  if (monuments.staking) state.staking = monuments.staking;
}
export function monumentsTick(dt) {
  const now = Date.now();
  const e = monuments.get("monument-earn"); if (e) tickEngine(e, dt, now);
}
export function monumentValues() {
  return state.seeded ? { slpFillsHour: hourString(hourFigure(state.fills, state.since, Date.now())) } : {};
}
export const onMonumentStats = (f) => listeners.push(f);
/** QA: feed fills as a poll would. */
export function injectSlpFills(list) { state.seeded = true; takeFills(pickFills({ fills: list }), Date.now()); }
export const monumentsState = () => {
  const e = monuments.get("monument-earn");
  return { fills: state.fills.length, since: state.since, seeded: state.seeded, sparks: e?.sparks?.live.length ?? 0, rings: e?.rings?.count ?? 0, wheel: e?.wheelSpeed ?? 0 };
};
