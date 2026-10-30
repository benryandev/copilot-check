// RealFi Raceway, the build: start/finish gantry, checkpoint gates (seen, not solid), tyre walls
// on the outside of the tight corners, the top 10 board, and RealFi crates, cones and bales to
// knock about. The timing lives in race.js; the track itself is a road in content.js.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS, RACE_TRACK, raceLocal } from "./content.js";
import { raceGates, trackAt, terrainHeight, TRACK_HALF, GATE_HALF } from "./terrain.js";
import {
  M, accent, box, cyl, mesh, canvasTexture, colliders, redraws, groupFor, addCollider, addProp, orientedBox,
  drawLogo, realfiLogo, REALFI,
} from "./build.js";

const D = () => DISTRICTS.raceway;
const brand = new THREE.MeshStandardMaterial({ color: REALFI.green, roughness: 0.6 });
const yawOf = (g) => Math.atan2(g.fx, g.fz); // a group turned so its local +z runs along the track

// A banner on both faces of a beam, drawn once (it reads the same in both themes)
function banner(w, h, cw, draw, z0 = 0.02) {
  const { tex, redraw } = canvasTexture(cw, Math.round((cw * h) / w), draw);
  redraw();
  realfiLogo.then(() => redraw());
  const g = new THREE.Group();
  for (const [z, ry] of [[z0, 0], [-z0, Math.PI]]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    plane.position.z = z;
    plane.rotation.y = ry;
    g.add(plane);
  }
  return g;
}

// A stripe across the track at a gate: the chequered start line, or a thin line in the raceway colour
function lineAcross(parent, gate, depth, material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_HALF * 2 + 0.6, depth), material);
  m.rotation.set(-Math.PI / 2, 0, yawOf(gate), "YXZ");
  m.position.set(gate.x, terrainHeight(gate.x, gate.z) + 0.17, gate.z);
  m.renderOrder = 2;
  parent.add(m);
}

function buildGantry(parent, gate) {
  const g = new THREE.Group();
  g.position.set(gate.x, terrainHeight(gate.x, gate.z), gate.z);
  g.rotation.y = yawOf(gate);
  const A = accent(D().colour);
  const half = TRACK_HALF + 2.2;
  const posts = [box(1.2, 7.4, 1.2, M.build, -half, 0, 0), box(1.2, 7.4, 1.2, M.build, half, 0, 0)];
  g.add(...posts);
  for (const x of [-half, half]) g.add(box(1.28, 0.3, 1.28, A, x, 1.2, 0), box(1.28, 0.3, 1.28, A, x, 5.4, 0));
  g.add(box(half * 2 + 1.6, 2, 1.2, brand, 0, 5.6, 0));
  const b = banner(half * 2 + 1.2, 1.7, 2048, (ctx, w, h) => {
    ctx.fillStyle = REALFI.green;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = REALFI.accent;
    ctx.fillRect(0, h - 12, w, 12);
    drawLogo(ctx, "#ffffff", 70, 22, 520, h - 50);
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 72px 'Geist Mono', monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("START / FINISH", w - 80, h / 2);
  }, 0.62); // just proud of the beam's faces
  b.position.set(0, 6.6, 0);
  g.add(b);
  parent.add(g);
  posts.forEach((p) => addCollider(p, 0));
  // Chequered line on the ground
  const { tex, redraw } = canvasTexture(512, 64, (ctx, w, h) => {
    const n = 32, sq = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#111111" : "#f5f5f5";
      ctx.fillRect(i * sq, (j * h) / 4, sq, h / 4);
    }
  });
  redraw();
  lineAcross(parent, gate, 1.6, new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -4 }));
}

// Checkpoint gates: two slim poles and a banner, nothing solid
function buildGate(parent, gate, lineMat) {
  const g = new THREE.Group();
  g.position.set(gate.x, terrainHeight(gate.x, gate.z), gate.z);
  g.rotation.y = yawOf(gate);
  const half = GATE_HALF + 0.3;
  const A = accent(D().colour);
  for (const x of [-half, half]) {
    const pole = cyl(0.14, 6.6, M.trim, x, 0, 0, 8);
    pole.castShadow = false;
    g.add(pole);
  }
  g.add(box(half * 2, 0.22, 0.22, A, 0, 6.4, 0));
  const n = RACE_TRACK.checkpoints.length;
  const b = banner(7.2, 1.2, 1024, (ctx, w, h) => {
    ctx.fillStyle = REALFI.green;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = REALFI.accent;
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 64px 'Geist Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`CHECKPOINT ${gate.i} OF ${n}`, w / 2, h / 2 - 2);
  });
  b.position.y = 5.6;
  g.add(b);
  parent.add(g);
  lineAcross(parent, gate, 0.6, lineMat);
}

// Tyre walls round the outside of the tight corners: stacks of three tyres, solid in 4 m pieces
function buildTyreWalls(parent) {
  const spots = [];
  const step = 1.0, off = TRACK_HALF + 3;
  for (let s = 0; s < RACE_TRACK.length; s += step) {
    const a = trackAt(s - 4), b = trackAt(s + 4);
    const turn = Math.asin(Math.max(-1, Math.min(1, a.fx * b.fz - a.fz * b.fx)));
    if (Math.abs(turn) / 8 < 1 / 34) continue; // gentler than a 34 m radius: no wall
    const p = trackAt(s);
    // Inside of the corner is the way the track turns; the wall goes on the other side
    const ix = b.fx - a.fx, iz = b.fz - a.fz;
    const side = ix * p.rx + iz * p.rz > 0 ? -1 : 1;
    spots.push({ s, x: p.x + p.rx * off * side, z: p.z + p.rz * off * side, fx: p.fx, fz: p.fz });
  }
  const geo = new THREE.CylinderGeometry(0.45, 0.45, 0.36, 14);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const tyres = new THREE.InstancedMesh(geo, mat, spots.length * 3);
  tyres.castShadow = tyres.receiveShadow = true;
  const m = new THREE.Matrix4(), c1 = new THREE.Color(0x1b1b1b), c2 = new THREE.Color(D().colour);
  spots.forEach((p, i) => {
    const y = terrainHeight(p.x, p.z);
    for (let k = 0; k < 3; k++) {
      m.makeTranslation(p.x, y + 0.18 + k * 0.36, p.z);
      tyres.setMatrixAt(i * 3 + k, m);
      tyres.setColorAt(i * 3 + k, k === 1 && i % 2 ? c2 : c1);
    }
  });
  parent.add(tyres);
  // Solid in pieces of four tyres, each turned along the track
  for (let i = 0; i < spots.length; i += 4) {
    const run = spots.slice(i, i + 4);
    if (run.length < 2 || run.at(-1).s - run[0].s > 6) {
      for (const p of run) colliders.push(orientedBox(p.x, p.z, 0.5, 0.5, 0));
      continue;
    }
    const cx = run.reduce((t, p) => t + p.x, 0) / run.length, cz = run.reduce((t, p) => t + p.z, 0) / run.length;
    const dx = run.at(-1).x - run[0].x, dz = run.at(-1).z - run[0].z;
    colliders.push(orientedBox(cx, cz, Math.hypot(dx, dz) / 2 + 0.5, 0.5, Math.atan2(-dz, dx)));
  }
  return spots.length;
}

// ── The top 10 board ───────────────────────────────────────────────────
const fmt = (ms) => {
  const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
};
export const formatTime = fmt;
let boardState = { status: "loading", top: [] };
let boardRedraw = null, lastPal = null;
export function setBoard(state) {
  boardState = state;
  if (boardRedraw && lastPal) boardRedraw(lastPal);
}
function buildBoard(parent) {
  const W = 1400, H = 1000;
  const board = canvasTexture(W, H, (ctx, w, h, p) => {
    lastPal = p;
    ctx.fillStyle = p.panel;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = REALFI.green;
    ctx.fillRect(0, 0, w, 170);
    ctx.fillStyle = REALFI.accent;
    ctx.fillRect(0, 170, w, 12);
    drawLogo(ctx, "#ffffff", 60, 40, 300, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 50px 'Geist Mono', monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("RACEWAY TOP 10", w - 60, 88);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const { status, top } = boardState;
    if (status !== "ok" || !top.length) {
      ctx.fillStyle = p.sub;
      ctx.font = "500 56px 'Geist Mono', monospace";
      const msg = status === "offline" ? "Leaderboard offline" : status === "loading" ? "Loading…" : "No times yet. Set the first.";
      ctx.fillText(msg, 70, 260);
      return;
    }
    top.slice(0, 10).forEach((r, i) => {
      const y = 222 + i * 76;
      ctx.fillStyle = p.sub;
      ctx.font = "500 52px 'Geist Mono', monospace";
      ctx.fillText(String(i + 1).padStart(2, " "), 70, y);
      ctx.fillStyle = p.text;
      ctx.font = "600 54px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      ctx.fillText(r.name, 190, y, 820); // fillText draws text, never markup
      ctx.font = "500 52px 'Geist Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(fmt(r.ms), w - 70, y);
      ctx.textAlign = "left";
    });
  });
  redraws.push(board.redraw);
  boardRedraw = board.redraw;
  realfiLogo.then(() => lastPal && board.redraw(lastPal));
  const [x, z] = raceLocal(-36, -15);
  const [tx, tz] = raceLocal(-78, -40);
  const g = new THREE.Group();
  g.position.set(x, terrainHeight(x, z), z);
  g.rotation.y = Math.atan2(tx - x, tz - z);
  const pw = W / 100, ph = H / 100;
  const legs = [cyl(0.35, 5, M.trim, -pw / 2 + 1.5, 0, 0, 8), cyl(0.35, 5, M.trim, pw / 2 - 1.5, 0, 0, 8)];
  const back = box(pw + 0.4, ph + 0.4, 0.5, M.build, 0, 5 - 0.2, 0);
  const panel = mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false }), 0, 5 + ph / 2, 0.3);
  panel.castShadow = false;
  g.add(...legs, back, panel);
  parent.add(g);
  legs.forEach((l) => addCollider(l, 0));
  return g;
}

// ── Things to knock about ──────────────────────────────────────────────
function propsAt(parent, kind, s, v, lift = 0) {
  const p = trackAt(s);
  addProp(parent, kind, p.x + p.rx * v, p.z + p.rz * v, yawOf(p), lift);
}
// Three RealFi crates: two side by side, one on top
function crateStack(parent, s, v) {
  const p = trackAt(s);
  for (const k of [-0.65, 0.65]) addProp(parent, "crate", p.x + p.rx * (v + k), p.z + p.rz * (v + k), yawOf(p));
  addProp(parent, "crate", p.x + p.rx * v, p.z + p.rz * v, yawOf(p) + 0.3, 1.2);
}
function buildProps(parent) {
  // Either side of the start, outside the gantry
  for (const v of [-(TRACK_HALF + 4), TRACK_HALF + 4]) crateStack(parent, 8, v);
  // The chicane through the S-bend: crate stacks on alternate sides, cones leading in
  [[352, -3.2], [374, 3.2], [396, -3.2]].forEach(([s, v]) => {
    crateStack(parent, s, v);
    for (const k of [6, 10]) propsAt(parent, "cone", s - k, v * 1.25);
  });
  // Bales on the inside of both hairpins
  for (const s of [205, 213, 221, 544, 552, 560]) {
    const a = trackAt(s - 4), b = trackAt(s + 4), p = trackAt(s);
    const inner = (b.fx - a.fx) * p.rx + (b.fz - a.fz) * p.rz > 0 ? 1 : -1;
    propsAt(parent, "bale", s, inner * (TRACK_HALF + 1.6));
  }
}

export function buildRaceway(scene) {
  const parent = groupFor(scene, "raceway");
  const lineMat = new THREE.MeshBasicMaterial({ color: D().colour, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 });
  raceGates.forEach((gate) => (gate.i === 0 ? buildGantry(parent, gate) : buildGate(parent, gate, lineMat)));
  const tyres = buildTyreWalls(parent);
  buildBoard(parent);
  buildProps(parent);
  return { tyres };
}
