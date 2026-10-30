// Buildings, labels, pads, billboards, signposts and ticker crates.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS, STOPS } from "./content.js";
import { LABELS } from "./data.js";
import { roads, jumps, ROAD_HALF, terrainHeight } from "./terrain.js";

export const colliders = []; // axis-aligned boxes in x/z: { minX, maxX, minZ, maxZ }
export const animated = []; // (t) => void
export const redraws = []; // re-paint canvas textures on theme change

const hex = (n) => "#" + new THREE.Color(n).getHexString();

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
export const cyl = (r, h, mat, x, y, z, seg = 16) => mesh(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y + h / 2, z);

export function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = (pal) => {
    draw(c.getContext("2d"), w, h, pal);
    tex.needsUpdate = true;
  };
  return { tex, redraw };
}

export function addCollider(obj, inset = 0.3) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  colliders.push({ minX: b.min.x + inset, maxX: b.max.x - inset, minZ: b.min.z + inset, maxZ: b.max.z - inset });
  return b;
}

// ── Materials that follow the theme ────────────────────────────────────
export const M = {
  build: new THREE.MeshStandardMaterial({ roughness: 0.75 }),
  trim: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
  wood: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fb3c8, roughness: 0.15, metalness: 0.3 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 }),
};
const accents = new Map();
export function accent(colour) {
  if (!accents.has(colour)) {
    const c = new THREE.Color(colour);
    accents.set(colour, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.4 }));
  }
  return accents.get(colour);
}
export function recolourMaterials(pal, dark) {
  M.build.color.set(pal.build);
  M.trim.color.set(pal.trim);
  M.wood.color.set(pal.wood);
  accents.forEach((m) => (m.emissiveIntensity = dark ? 0.6 : 0.3));
  redraws.forEach((r) => r(pal));
}

// ── Building shapes ────────────────────────────────────────────────────
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SHAPES = {
  hq(g, A) {
    g.add(cyl(5, 9, M.build, 0, 0, 0, 32));
    for (const y of [2.5, 5, 7.5]) g.add(cyl(5.08, 0.35, A, 0, y, 0, 32));
    g.add(cyl(5.4, 0.5, M.trim, 0, 9, 0, 32));
    const spire = cyl(0.5, 4, A, 0, 9.5, 0, 8);
    g.add(spire);
    const orb = mesh(new THREE.OctahedronGeometry(1.1), A, 0, 14.6, 0);
    g.add(orb);
    if (!reduceMotion) animated.push((t) => { orb.rotation.y = t * 0.8; orb.position.y = 14.6 + Math.sin(t * 1.5) * 0.25; });
    return 16;
  },
  exchange(g, A) {
    g.add(box(16, 5, 7, M.build, 0, 0, 0));
    g.add(box(16.6, 0.5, 7.6, M.trim, 0, 5, 0));
    for (let i = -3; i <= 3; i++) g.add(cyl(0.35, 4.6, M.build, i * 2.2, 0, 3.8));
    g.add(box(16, 0.25, 0.3, A, 0, 2.6, 3.65));
    return 6;
  },
  tower(g, A) {
    g.add(box(4, 14, 4, M.build, 0, 0, 0));
    for (let y = 2; y < 14; y += 2) g.add(box(4.1, 0.2, 4.1, A, 0, y, 0));
    g.add(cyl(0.12, 3, M.trim, 0, 14, 0, 6));
    return 17;
  },
  antenna(g, A) {
    g.add(box(6, 6, 6, M.build, 0, 0, 0));
    g.add(cyl(0.25, 9, M.trim, 0, 6, 0, 8));
    const dish = mesh(new THREE.SphereGeometry(1.8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), A, 0, 13, 0);
    dish.rotation.x = Math.PI;
    g.add(dish);
    if (!reduceMotion) animated.push((t) => (dish.rotation.y = t * 0.6));
    return 15;
  },
  twin(g, A) {
    g.add(box(4, 7, 4, M.build, -3.5, 0, 0));
    g.add(box(4, 5, 4, M.build, 3.5, 0, 0));
    g.add(box(3, 0.8, 1.6, A, 0, 3.6, 0));
    g.add(box(4.2, 0.3, 4.2, M.trim, 3.5, 5, 0));
    return 8;
  },
  cliff(g, A) {
    g.add(box(9, 5, 6, M.build, 0, 0, -1));
    const ramp = box(9, 0.6, 6, A, 0, 0, 0);
    ramp.position.set(0, 2.1, 3.3);
    ramp.rotation.x = 0.75;
    g.add(ramp);
    return 7;
  },
  cluster(g, A) {
    [[-2.5, -2.5, 4], [2.5, -2.5, 3], [-2.5, 2.5, 2.5], [2.5, 2.5, 5]].forEach(([x, z, h]) => {
      g.add(box(3.6, h, 3.6, M.build, x, 0, z));
      g.add(box(3.7, 0.25, 3.7, A, x, h, z));
    });
    return 7;
  },
  clock(g, A) {
    g.add(box(4, 11, 4, M.build, 0, 0, 0));
    const face = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 32), M.trim, 0, 8.5, 2.05);
    face.rotation.x = Math.PI / 2;
    g.add(face);
    const pivot = new THREE.Group();
    pivot.position.set(0, 8.5, 2.2);
    const hand = box(0.18, 1.3, 0.1, A, 0, 0, 0);
    pivot.add(hand);
    g.add(pivot);
    if (!reduceMotion) animated.push((t) => (pivot.rotation.z = -t * 0.8));
    g.add(box(4.4, 0.4, 4.4, M.trim, 0, 11, 0));
    return 13;
  },
  flag(g, A) {
    g.add(box(4, 2, 4, M.build, 0, 0, 0));
    g.add(cyl(0.15, 9, M.trim, 0, 2, 0, 8));
    const holder = new THREE.Group();
    holder.position.set(0, 9, 0);
    const flag = box(3, 1.8, 0.1, A, 0, 0, 0);
    flag.position.set(1.5, -0.9, 0);
    holder.add(flag);
    g.add(holder);
    if (!reduceMotion) animated.push((t) => (holder.rotation.y = Math.sin(t * 1.4) * 0.35));
    return 12;
  },
  grid(g, A) {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const h = 2 + ((i + 2) * (j + 3)) % 5;
        g.add(box(1.6, h, 1.6, (i + j) % 2 ? M.build : A, i * 2.6, 0, j * 2.6));
      }
    return 9;
  },
};

// ── Labels ─────────────────────────────────────────────────────────────
function makeLabel(text, colour, y, parent) {
  const { tex, redraw } = canvasTexture(1024, 192, (ctx, w, h, p) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = "600 88px 'Atkinson Hyperlegible Next', Arial, sans-serif";
    const tw = ctx.measureText(text).width;
    const pw = Math.min(w - 8, tw + 96);
    ctx.fillStyle = p.panel;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.roundRect((w - pw) / 2, 30, pw, 132, 66);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = hex(colour);
    ctx.fillRect((w - pw) / 2 + 52, 86, 20, 20);
    ctx.fillStyle = p.text;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2 + 14, 100);
  });
  redraws.push(redraw);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(10, 1.875, 1);
  sprite.position.y = y;
  sprite.renderOrder = 2;
  parent.add(sprite);
}

// ── Stops: building + label + pad ──────────────────────────────────────
export const pads = [];
const padGeo = new THREE.RingGeometry(2.3, 3, 40);
const discGeo = new THREE.CircleGeometry(2.3, 40);
export function buildStops(scene) {
  for (const stop of STOPS) {
    const d = DISTRICTS[stop.district];
    const A = accent(d.colour);
    const g = new THREE.Group();
    g.position.set(stop.pos[0], 0, stop.pos[1]);
    // Face the open middle of the district (the hub's buildings face the spawn)
    const fx = d.centre[0] - stop.pos[0], fz = d.centre[1] - stop.pos[1];
    const fl = Math.hypot(fx, fz) || 1;
    const toCentre = new THREE.Vector3(fx / fl, 0, fz / fl);
    g.rotation.y = Math.atan2(toCentre.x, toCentre.z);
    const height = SHAPES[stop.shape](g, A);
    scene.add(g);
    makeLabel(stop.name, d.colour, height + 2.2, g);
    const bb = addCollider(g);
    const reach = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 4.5;
    const padPos = new THREE.Vector3(stop.pos[0], 0.06, stop.pos[1]).addScaledVector(toCentre, reach);
    const ring = new THREE.Mesh(padGeo, new THREE.MeshBasicMaterial({ color: d.colour, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(padPos);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: d.colour, transparent: true, opacity: 0.14 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(padPos).setY(0.05);
    scene.add(ring, disc);
    pads.push({ stop, pos: padPos, ring });
  }
}

// ── Billboards with live figures ───────────────────────────────────────
export const boards = [];
export function buildBoard(scene, district, x, z, rotY, getLive) {
  const d = DISTRICTS[district];
  const keys = d.board;
  const cols = keys.length > 4 ? 3 : 2;
  const rows = Math.ceil(keys.length / cols);
  const W = cols === 3 ? 1600 : 1200, H = 190 + rows * 270;
  const board = canvasTexture(W, H, (ctx, w, h, p) => {
    const live = getLive();
    ctx.fillStyle = p.panel;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(d.colour);
    ctx.fillRect(0, 0, w, 14);
    ctx.fillStyle = p.sub;
    ctx.font = "500 40px 'Geist Mono', monospace";
    ctx.textBaseline = "top";
    ctx.fillText(`${d.name.toUpperCase()}, LIVE`, 70, 64);
    keys.forEach((k, i) => {
      const x0 = 70 + (i % cols) * 500, y0 = 180 + Math.floor(i / cols) * 270;
      ctx.fillStyle = p.sub;
      ctx.font = "500 34px 'Geist Mono', monospace";
      ctx.fillText(LABELS[k].toUpperCase(), x0, y0);
      ctx.fillStyle = p.text;
      ctx.font = "500 104px 'Geist Mono', monospace";
      ctx.fillText(live ? live.values[k] : "…", x0, y0 + 56);
    });
  });
  redraws.push(board.redraw);
  boards.push(board.redraw);
  const pw = W / 100, ph = H / 100;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const legs = [cyl(0.35, 5.5, M.trim, -pw / 2 + 1.5, 0, 0, 8), cyl(0.35, 5.5, M.trim, pw / 2 - 1.5, 0, 0, 8)];
  const back = box(pw + 0.4, ph + 0.4, 0.5, M.build, 0, 5.5 - 0.2, 0);
  const panel = mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false }), 0, 5.5 + ph / 2, 0.3);
  panel.castShadow = false;
  g.add(...legs, back, panel);
  scene.add(g);
  legs.forEach((l) => addCollider(l, 0));
}

// ── Signposts ──────────────────────────────────────────────────────────
// arms: [{ text, colour, dir: [dx, dz] }] — each board points along dir
export function buildSignpost(scene, x, z, arms) {
  const g = new THREE.Group();
  const y0 = terrainHeight(x, z);
  g.position.set(x, y0, z);
  g.add(cyl(0.22, 5.6, M.wood, 0, 0, 0, 8));
  g.add(mesh(new THREE.ConeGeometry(0.34, 0.5, 8), M.wood, 0, 5.85, 0));
  arms.forEach((arm, i) => {
    // flip = the back face: tip drawn on the left, so from behind it still points the same way
    const face = (flip) =>
      canvasTexture(768, 160, (ctx, w, h, p) => {
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
        ctx.fillStyle = p.signBoard;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(w - 80, 0); ctx.lineTo(w, h / 2); ctx.lineTo(w - 80, h); ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = hex(arm.colour);
        ctx.fillRect(0, 0, 22, h);
        ctx.restore();
        ctx.fillStyle = p.signInk;
        ctx.font = "600 64px 'Atkinson Hyperlegible Next', Arial, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = flip ? "right" : "left";
        ctx.fillText(arm.text, flip ? w - 52 : 52, h / 2 + 4, w - 160);
      });
    const f = face(false), bk = face(true);
    redraws.push(f.redraw, bk.redraw);
    const arrow = new THREE.Group();
    const bw = 5.4, bh = 1.12;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshLambertMaterial({ map: f.tex, transparent: true }));
    front.position.set(bw / 2 + 0.15, 0, 0.06);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshLambertMaterial({ map: bk.tex, transparent: true }));
    back.rotation.y = Math.PI;
    back.position.set(bw / 2 + 0.15, 0, -0.06);
    arrow.add(front, back, box(bw - 0.4, bh - 0.08, 0.1, M.wood, bw / 2 + 0.1, -(bh - 0.08) / 2, 0));
    arrow.position.y = 4.8 - i * 1.35;
    // Board's local +x points along dir
    arrow.rotation.y = Math.atan2(-arm.dir[1], arm.dir[0]);
    g.add(arrow);
  });
  scene.add(g);
  colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35 });
}

// Signs: one at each end of every road, and a warning before each jump
export function buildRoadSigns(scene) {
  roads.forEach((r) => {
    const sideOf = (t, s) => {
      const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
      return { x: p.x + -tan.z * s, z: p.z + tan.x * s, tx: tan.x, tz: tan.z };
    };
    const a = sideOf(0.04, -(ROAD_HALF + 1.6));
    const to = DISTRICTS[r.to], from = DISTRICTS[r.from];
    buildSignpost(scene, a.x, a.z, [{ text: to.name, colour: to.colour, dir: [a.tx, a.tz] }]);
    const b = sideOf(0.96, ROAD_HALF + 1.6);
    buildSignpost(scene, b.x, b.z, [{ text: from.name, colour: from.colour, dir: [-b.tx, -b.tz] }]);
  });
  jumps.forEach((j, i) => {
    const r = roads[j.road];
    const t = Math.max(0, j.t - 14 / r.len);
    const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
    const s = j.side * (ROAD_HALF + 1.6);
    buildSignpost(scene, p.x + -tan.z * s, p.z + tan.x * s, [{ text: "Jump ahead", colour: 0xf59e0b, dir: [tan.x, tan.z] }]);
  });
}

// ── Ticker crates: one per Strike market, knock them about ─────────────
export const crates = [];
export function addCrates(scene, tickers, cx, cz, colour) {
  tickers.forEach((t, i) => {
    const { tex, redraw } = canvasTexture(256, 256, (ctx, w, h, p) => {
      ctx.fillStyle = p.panel;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, w - 14, h - 14);
      ctx.fillStyle = p.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `500 ${t.length > 5 ? 44 : 64}px 'Geist Mono', monospace`;
      ctx.fillText(t, w / 2, h / 2);
    });
    redraws.push(redraw);
    const s = 1.5;
    const m = mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    const ring = Math.floor(i / 12);
    const a = ((i % 12) / 12) * Math.PI * 2 + ring * 0.26;
    const r = 7 + ring * 2.2;
    m.position.set(cx + Math.cos(a) * r, s / 2, cz + Math.sin(a) * r);
    m.rotation.y = a;
    scene.add(m);
    crates.push({ m, v: new THREE.Vector2(), spin: 0, tilt: 0, r: 0.9, redraw });
  });
}
