// Buildings, labels, pads, billboards, signposts and ticker crates.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS, STOPS, ROADS, layoutStops, boardSpot } from "./content.js";
import { LABELS } from "./data.js";
import { roads, jumps, ROAD_HALF, terrainHeight, builderSlots } from "./terrain.js";
import { tint, setDark } from "./colours.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";

// Everything in a district lives in its group, so far-away districts can be skipped when drawing
export const districtGroups = {};
export function groupFor(scene, key) {
  if (!districtGroups[key]) {
    const g = new THREE.Group();
    g.userData.key = key;
    scene.add(g);
    districtGroups[key] = g;
  }
  return districtGroups[key];
}

export const colliders = []; // axis-aligned boxes in x/z: { minX, maxX, minZ, maxZ }
export const animated = []; // (t) => void
export const redraws = []; // re-paint canvas textures on theme change

const hex = (n) => "#" + new THREE.Color(tint(n)).getHexString();

// Materials painted in a district colour, re-tinted on theme change
export const tinted = [];
const tintedBasic = (colour, opts) => {
  const m = new THREE.MeshBasicMaterial({ color: tint(colour), ...opts });
  tinted.push({ m, colour });
  return m;
};

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
  obj.updateWorldMatrix(true, true); // parents too, or a child's box lands at the origin
  const b = new THREE.Box3().setFromObject(obj, true); // precise: rotated shapes don't inflate the box
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
  setDark(dark);
  accents.forEach((m, c) => { m.color.set(tint(c)); m.emissive.set(tint(c)); });
  tinted.forEach(({ m, colour }) => m.color.set(tint(colour)));
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
  dome(g, A) {
    g.add(cyl(4.5, 3, M.build, 0, 0, 0, 32));
    g.add(mesh(new THREE.SphereGeometry(4.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.build, 0, 3, 0));
    g.add(cyl(4.6, 0.35, A, 0, 2.6, 0, 32));
    g.add(cyl(0.35, 1.6, A, 0, 7.3, 0, 8));
    return 9;
  },
  vault(g, A) {
    g.add(box(7, 6, 6, M.build, 0, 0, 0));
    const door = mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.4, 28), A, 0, 3, 3.1);
    door.rotation.x = Math.PI / 2;
    g.add(door, box(7.4, 0.4, 6.4, M.trim, 0, 6, 0));
    if (!reduceMotion) animated.push((t) => (door.rotation.y = t * 0.3));
    return 7;
  },
  coins(g, A) {
    [[-2.2, 0, 5], [0.4, -1.6, 8], [2.3, 1.2, 3]].forEach(([x, z, n]) => {
      for (let i = 0; i < n; i++) g.add(cyl(1.4, 0.45, i % 2 ? A : M.build, x, i * 0.5, z, 24));
    });
    return 5;
  },
  kiosk(g, A) {
    g.add(box(5, 3.2, 4, M.build, 0, 0, 0));
    const awning = box(5.6, 0.25, 2, A, 0, 0, 0);
    awning.position.set(0, 3.1, 2.6);
    awning.rotation.x = -0.3;
    g.add(awning, box(5.4, 0.3, 4.4, M.trim, 0, 3.2, 0));
    return 5;
  },
  pillar(g, A) {
    g.add(cyl(2, 10, M.build, 0, 0, 0, 20));
    for (const y of [3, 6, 9]) g.add(cyl(2.1, 0.3, A, 0, y, 0, 20));
    g.add(mesh(new THREE.ConeGeometry(2.4, 2.4, 20), A, 0, 11.2, 0));
    return 13;
  },
  arch(g, A) {
    g.add(box(1.4, 7, 1.4, M.build, -3.5, 0, 0), box(1.4, 7, 1.4, M.build, 3.5, 0, 0), box(8.4, 1.2, 1.6, A, 0, 7, 0));
    g.add(box(4, 1.5, 4, M.build, 0, 0, -3));
    return 9;
  },
  // Builders' Row: a shopfront with the project's name over the door
  shop(g, A, stop) {
    g.add(box(6, 4.2, 5, M.build, 0, 0, 0), box(6.4, 0.35, 5.4, M.trim, 0, 4.2, 0));
    g.add(box(2, 2.6, 0.2, M.trim, 0, 0, 2.55));
    const awning = box(6.2, 0.2, 1.6, A, 0, 0, 0);
    awning.position.set(0, 3.1, 3.2);
    awning.rotation.x = -0.25;
    g.add(awning);
    g.add(signBoard(stop.name, 5.6, 1.1, 0, 4.9, 2.4));
    return 6;
  },
  // An empty plot waiting for a project: pegged-out ground, a sign and a cone
  plot(g, A, stop) {
    const ground = box(7, 0.08, 6, M.wood, 0, 0, 0);
    g.add(ground);
    for (const [x, z] of [[-3.3, -2.8], [3.3, -2.8], [-3.3, 2.8], [3.3, 2.8]]) g.add(cyl(0.08, 0.9, A, x, 0, z, 6));
    g.add(cyl(0.12, 2.6, M.wood, -1.4, 0, 1.5, 6), cyl(0.12, 2.6, M.wood, 1.4, 0, 1.5, 6));
    g.add(signBoard(stop.name, 3.6, 1.2, 0, 2.3, 1.6));
    return 3.6;
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

// A flat painted board (both faces) for names on buildings
function signBoard(text, w, h, x, y, z) {
  const { tex, redraw } = canvasTexture(1024, Math.round((1024 * h) / w), (ctx, cw, ch, p) => {
    ctx.fillStyle = p.panel;
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = p.text;
    ctx.font = `600 ${Math.round(ch * 0.5)}px 'Atkinson Hyperlegible Next', Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cw / 2, ch / 2 + 2, cw - 60);
  });
  redraws.push(redraw);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(box(w + 0.2, h + 0.2, 0.15, M.trim, 0, -(h + 0.2) / 2, 0));
  for (const [dz, ry] of [[0.09, 0], [-0.09, Math.PI]]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    plane.position.z = dz;
    plane.rotation.y = ry;
    g.add(plane);
  }
  return g;
}

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
// ── Blender models ─────────────────────────────────────────────────────
// Shapes with a model in /ecosystem/models replace their blockout once loaded. Material names in
// the model pick the theme-aware materials: Accent (district colour), Building, Trim, Glass.
// Nodes named spin_* turn slowly.
const MODELS = { hq: "hq.glb" };
const loader = new GLTFLoader();
const loading = new Map();
const loadModel = (file) => {
  if (!loading.has(file)) loading.set(file, loader.loadAsync(`/ecosystem/models/${file}`).then((g) => g.scene));
  return loading.get(file);
};
async function swapInModel(g, file, A, colliderIndex) {
  let src;
  try {
    src = await loadModel(file);
  } catch (err) {
    console.warn("[eco] model", file, err);
    return;
  }
  const model = src.clone(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const n = o.material?.name;
    o.material = n === "Accent" ? A : n === "Trim" ? M.trim : n === "Glass" ? M.glass : n === "Building" ? M.build : o.material;
    if (o.name.startsWith("spin_") && !reduceMotion) animated.push((t) => (o.rotation.y = t * 0.9));
  });
  // Keep the floating label; drop the blockout
  [...g.children].filter((c) => !c.isSprite).forEach((c) => g.remove(c));
  g.add(model);
  // The model's footprint replaces the blockout's in the collision list
  model.updateWorldMatrix(true, true);
  const b = new THREE.Box3();
  model.traverse((o) => o.isMesh && b.expandByObject(o, true));
  colliders[colliderIndex] = { minX: b.min.x + 0.3, maxX: b.max.x - 0.3, minZ: b.min.z + 0.3, maxZ: b.max.z - 0.3 };
}

const FALLBACK = ["dome", "vault", "kiosk", "pillar", "coins", "arch", "tower", "twin", "cluster"];
export function buildStops(scene) {
  const placed = layoutStops();
  STOPS.forEach((stop, i) => {
    const d = DISTRICTS[stop.district];
    if (!d) return;
    const slot = builderSlots.find((b) => b.key === stop.key);
    stop.pos = stop.pos || (slot ? [slot.x, slot.z] : placed.get(stop.key));
    const shape = SHAPES[stop.shape] ? stop.shape : FALLBACK[i % FALLBACK.length];
    const A = accent(d.colour);
    const parent = groupFor(scene, stop.district);
    const g = new THREE.Group();
    g.position.set(stop.pos[0], 0, stop.pos[1]);
    // Face the open middle of the district (the hub's buildings face the spawn)
    const target = slot ? slot.face : d.centre;
    const fx = target[0] - stop.pos[0], fz = target[1] - stop.pos[1];
    const fl = Math.hypot(fx, fz) || 1;
    const toCentre = new THREE.Vector3(fx / fl, 0, fz / fl);
    g.rotation.y = Math.atan2(toCentre.x, toCentre.z);
    const height = SHAPES[shape](g, A, stop);
    parent.add(g);
    const bb = addCollider(g); // before the label, whose sprite would widen the box
    const colliderIndex = colliders.length - 1;
    makeLabel(stop.name, d.colour, height + 2.2, g);
    if (MODELS[shape]) swapInModel(g, MODELS[shape], A, colliderIndex);
    const reach = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 4.5;
    const padPos = new THREE.Vector3(stop.pos[0], 0.18, stop.pos[1]).addScaledVector(toCentre, reach);
    const ring = new THREE.Mesh(padGeo, tintedBasic(d.colour, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(padPos);
    const disc = new THREE.Mesh(discGeo, tintedBasic(d.colour, { transparent: true, opacity: 0.14 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(padPos).setY(0.16);
    parent.add(ring, disc);
    pads.push({ stop, pos: padPos, ring });
  });
}

// ── Billboards with live figures ───────────────────────────────────────
export const boards = [];
export function buildBoard(scene, district, getLive) {
  const d = DISTRICTS[district];
  const keys = d.board;
  if (!keys) return;
  const { x, z, rotY } = boardSpot(d);
  const cols = keys.length > 4 ? 3 : keys.length > 1 ? 2 : 1;
  const rows = Math.ceil(keys.length / cols);
  const W = Math.max(1100, 140 + cols * 500), H = 190 + rows * 270;
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
      ctx.fillText(live?.values[k] ?? "…", x0, y0 + 56);
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
  groupFor(scene, district).add(g);
  legs.forEach((l) => addCollider(l, 0));
}

// ── Signposts ──────────────────────────────────────────────────────────
// arms: [{ text, colour, dir: [dx, dz] }] — each board points along dir
export function buildSignpost(parent, x, z, arms) {
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
  parent.add(g);
  colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35 });
}

// Wayfinding: a sign at HQ for every spoke, a welcome arch and a junction sign where each spoke
// meets its district (back to HQ and on to both neighbours), and a warning before each jump.
const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
export function buildRoadSigns(scene) {
  roads.forEach((r) => {
    if (r.kind !== "spoke") return;
    const to = DISTRICTS[r.to];
    const side = (t, s) => {
      const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
      return { x: p.x - tan.z * s, z: p.z + tan.x * s, tx: tan.x, tz: tan.z, px: p.x, pz: p.z };
    };
    // At HQ: this road's destination
    const a = side(0.03, ROAD_HALF + 1.6);
    buildSignpost(groupFor(scene, "hub"), a.x, a.z, [{ text: to.name, colour: to.colour, dir: [a.tx, a.tz] }]);
    // At the district: back to HQ, and along the ring road both ways
    const b = side(0.97, -(ROAD_HALF + 1.6));
    const arms = [{ text: "Strike HQ", colour: DISTRICTS.hub.colour, dir: [-b.tx, -b.tz] }];
    for (const e of to.exits) {
      const n = DISTRICTS[e.to];
      arms.push({ text: n.name, colour: n.colour, dir: unit(e.at[0] - b.x, e.at[1] - b.z) });
    }
    buildSignpost(groupFor(scene, r.to), b.x, b.z, arms);
    buildArch(groupFor(scene, r.to), r, to);
  });
  // Where Builders' Row begins, on the way into Developers
  if (builderSlots.length) {
    const r = roads.find((x) => x.kind === "spoke" && x.to === "developers");
    const t = 0.88 - (builderSlots.length * 13 + 4) / r.len;
    const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
    const s = ROAD_HALF + 1.6;
    buildSignpost(groupFor(scene, "developers"), p.x - tan.z * s, p.z + tan.x * s, [{ text: "Builders' Row", colour: DISTRICTS.developers.colour, dir: [tan.x, tan.z] }]);
  }
  jumps.forEach((j) => {
    const r = roads[j.road];
    const t = Math.max(0, j.t - 14 / r.len);
    const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
    const s = j.side * (ROAD_HALF + 1.6);
    buildSignpost(scene, p.x - tan.z * s, p.z + tan.x * s, [{ text: "Jump ahead", colour: 0xf59e0b, dir: [tan.x, tan.z] }]);
  });
}

// A gateway over the road where it enters a district, with the district's name on the beam
function buildArch(parent, road, d) {
  const t = 1 - 5 / road.len;
  const p = road.curve.getPointAt(t), tan = road.curve.getTangentAt(t);
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.rotation.y = Math.atan2(tan.x, tan.z);
  const A = accent(d.colour);
  const half = ROAD_HALF + 1.6;
  const posts = [box(0.8, 6.4, 0.8, M.build, -half, 0, 0), box(0.8, 6.4, 0.8, M.build, half, 0, 0)];
  g.add(...posts, box(half * 2 + 1.4, 0.3, 1, A, 0, 6.4, 0));
  const { tex, redraw } = canvasTexture(1024, 160, (ctx, w, h, pal) => {
    ctx.fillStyle = pal.panel;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(d.colour);
    ctx.fillRect(0, h - 14, w, 14);
    ctx.fillStyle = pal.text;
    ctx.font = "600 76px 'Atkinson Hyperlegible Next', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(d.name, w / 2, h / 2 - 4, w - 60);
  });
  redraws.push(redraw);
  const bw = half * 2 + 1, bh = bw * (160 / 1024);
  for (const [z, ry] of [[-0.52, Math.PI], [0.52, 0]]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    plane.position.set(0, 5.4, z);
    plane.rotation.y = ry;
    g.add(plane);
  }
  g.add(box(bw + 0.2, bh + 0.2, 1, M.build, 0, 5.4 - (bh + 0.2) / 2, 0));
  parent.add(g);
  posts.forEach((post) => addCollider(post, 0));
}

// ── Props: things to knock over (they share the crate physics in main.js) ──
// Each prop: { m, v, spin, tilt, r (radius), h (half height), lift (height off the ground,
// drops to 0 once hit, so stacks topple) }
const PROP = {
  cone: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(0.38, 0.85, 14), new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 }), 0, 0.05, 0));
    g.children[0].position.y = 0.43 - 0.45;
    g.add(mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 0, 0.03, 0));
    g.add(mesh(new THREE.BoxGeometry(0.85, 0.06, 0.85), new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.7 }), 0, -0.42, 0));
    return { m: g, r: 0.45, h: 0.45 };
  },
  bale: () => {
    const m = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.3, 16), new THREE.MeshStandardMaterial({ color: 0xd6b25e, roughness: 1 }));
    m.rotation.z = Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    return { m: g, r: 0.85, h: 0.7 };
  },
  coin: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x6b4500, emissiveIntensity: 0.35, metalness: 0.15, roughness: 0.35 })));
    return { m: g, r: 0.8, h: 0.1 };
  },
};
export function addProp(parent, kind, x, z, rotY = 0, lift = 0) {
  const p = PROP[kind]();
  p.m.position.set(x, terrainHeight(x, z) + p.h + lift, z);
  p.m.rotation.y = rotY;
  parent.add(p.m);
  crates.push({ ...p, v: new THREE.Vector2(), spin: 0, tilt: 0, lift, redraw: () => {} });
}

export function addProps(scene) {
  // Cones in an arc in front of the Liquidations building
  const liq = STOPS.find((s) => s.key === "liquidations");
  if (liq) {
    const d = DISTRICTS.perps;
    const [dx, dz] = [d.centre[0] - liq.pos[0], d.centre[1] - liq.pos[1]];
    const a0 = Math.atan2(dz, dx);
    // Down both sides of the building, clear of its pad in front
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const a = a0 + side * (Math.PI / 2 + (i - 2) * 0.28);
      addProp(groupFor(scene, "perps"), "cone", liq.pos[0] + Math.cos(a) * 8, liq.pos[1] + Math.sin(a) * 8);
    }
  }
  // Hay bales on the grass either side of each jump's landing
  jumps.forEach((j) => {
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const u = j.length + 10 + k * 2.2;
      const v = side * (ROAD_HALF + 2.4);
      addProp(scene, "bale", j.ox + j.fx * u + j.rx * (v - j.side * (ROAD_HALF - j.width / 2)), j.oz + j.fz * u + j.rz * (v - j.side * (ROAD_HALF - j.width / 2)), Math.atan2(j.fx, j.fz));
    }
  });
  // A tower of STRIKE coins in Token & Governance
  const t = DISTRICTS.token;
  if (t) {
    const [hx, hz] = t.hubDir;
    const cx = t.centre[0] + hx * 6, cz = t.centre[1] + hz * 6;
    for (let i = 0; i < 14; i++) addProp(groupFor(scene, "token"), "coin", cx + (Math.random() - 0.5) * 0.08, cz + (Math.random() - 0.5) * 0.08, Math.random() * 6, i * 0.21);
  }
}

// ── Ticker crates: one per Strike market, knock them about ─────────────
export const crates = [];
export function addCrates(scene, tickers, cx, cz, colour) {
  const parent = groupFor(scene, "perps");
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
    const r = 4.5 + ring * 2.1;
    m.position.set(cx + Math.cos(a) * r, s / 2, cz + Math.sin(a) * r);
    m.rotation.y = a;
    parent.add(m);
    crates.push({ m, v: new THREE.Vector2(), spin: 0, tilt: 0, r: 0.9, h: 0.75, lift: 0, redraw });
  });
}
