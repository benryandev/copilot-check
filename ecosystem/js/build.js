// Buildings, labels, pads, billboards, signposts and ticker crates.

import * as THREE from "../vendor/three.module.min.js";
import { glowIntensity } from "./post.js";
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

// Collision boxes turn with their building (oriented boxes), so an angled building doesn't grow
// invisible corners. Each also keeps a world-aligned bound for quick rejection.
export function obbOf(o, inset = 0.3) {
  o.updateWorldMatrix(true, true);
  const inv = o.matrixWorld.clone().invert();
  const box = new THREE.Box3(), tmp = new THREE.Box3(), m = new THREE.Matrix4();
  o.traverse((c) => {
    if (!c.isMesh) return; // labels are sprites, so they never widen the box
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    tmp.copy(c.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, c.matrixWorld));
    box.union(tmp);
  });
  const yaw = new THREE.Euler().setFromRotationMatrix(o.matrixWorld, "YXZ").y;
  const w = box.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);
  const hx = Math.max(0.15, (box.max.x - box.min.x) / 2 - inset), hz = Math.max(0.15, (box.max.z - box.min.z) / 2 - inset);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const ex = Math.abs(hx * c) + Math.abs(hz * s), ez = Math.abs(hx * s) + Math.abs(hz * c);
  const top = w.y + (box.max.y - box.min.y) / 2; // the camera keeps out of anything this tall
  return { cx: w.x, cz: w.z, hx, hz, c, s, minX: w.x - ex, maxX: w.x + ex, minZ: w.z - ez, maxZ: w.z + ez, box, top };
}
// A box turned to yaw about the vertical (local x runs along (cos yaw, −sin yaw)), as obbOf makes
export function orientedBox(cx, cz, hx, hz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const ex = Math.abs(hx * c) + Math.abs(hz * s), ez = Math.abs(hx * s) + Math.abs(hz * c);
  return { cx, cz, hx, hz, c, s, minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez };
}
export const aabb = (minX, maxX, minZ, maxZ) => ({
  cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, hx: (maxX - minX) / 2, hz: (maxZ - minZ) / 2, c: 1, s: 0, minX, maxX, minZ, maxZ,
});
export function addCollider(obj, inset = 0.3) {
  const o = obbOf(obj, inset);
  colliders.push(o);
  return o.box;
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
// Car paint: the same material family, but it never joins the bloom (a glowing car is a silhouette, not a car)
const paints = new Map();
export const paint = (colour) => accent(colour, paints);
export function accent(colour, into = accents) {
  const accents = into;
  if (!accents.has(colour)) {
    const c = new THREE.Color(colour);
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.4 });
    m.userData.accent = true; // so a clone of the car can find its paint and change it
    accents.set(colour, m);
  }
  return accents.get(colour);
}
let currentPal = null; // the theme's palette, for textures painted after a theme change
export const themePalette = () => currentPal;
export function recolourMaterials(pal, dark, glow = false) {
  currentPal = pal;
  setDark(dark);
  [accents, paints].forEach((map) => map.forEach((m, c) => { m.color.set(tint(c)); m.emissive.set(tint(c)); }));
  tinted.forEach(({ m, colour }) => m.color.set(tint(colour)));
  M.build.color.set(pal.build);
  M.trim.color.set(pal.trim);
  M.wood.color.set(pal.wood);
  // At night the accent strips are the lights; with bloom on each is pushed to the same glow luminance whatever its hue
  accents.forEach((m) => (m.emissiveIntensity = dark ? (glow ? glowIntensity(m.emissive) : 0.6) : 0.3));
  paints.forEach((m) => (m.emissiveIntensity = dark ? 0.6 : 0.3));
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
  // The raceway's race control: a booth with a glass upper floor looking over the start straight
  pitbox(g, A) {
    g.add(box(8, 3.4, 5, M.build, 0, 0, 0), box(8.4, 0.3, 5.4, A, 0, 3.4, 0));
    g.add(box(7.2, 2.2, 4.4, M.glass, 0, 3.7, 0), box(8.6, 0.4, 5.6, M.trim, 0, 5.9, 0));
    g.add(box(2, 2.6, 0.2, M.trim, 0, 0, 2.55));
    // RealFi's full logo across the glass floor, front (pad and start straight) and back (Ben, 30 Oct)
    for (const side of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.9), realfiPanel());
      panel.position.set(0, 3.7 + 1.1, side * 2.21);
      if (side < 0) panel.rotation.y = Math.PI;
      g.add(panel);
    }
    // RealFi's mark turning on a pole above the roof, like Strike's on HQ (Ben, 30 Oct)
    g.add(cyl(0.18, 2.2, M.trim, 0, 6.3, 0, 8));
    const coin = realfiCoin();
    coin.position.y = 6.3 + 2.2 + 1.9;
    g.add(coin);
    if (!reduceMotion) animated.push((t) => (coin.rotation.y = t * 0.9));
    return 12.4;
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
  // The Fill Yard's shed: the matching engine's loading dock. flow.js adds the door, belt and screen.
  depot(g, A) {
    g.add(box(10, 5, 6, M.build, 0, 0, 0), box(10.4, 0.4, 6.4, M.trim, 0, 5, 0));
    g.add(box(10.4, 0.25, 0.3, A, 0, 4.55, 3.2));
    for (const x of [-4.6, 4.6]) g.add(box(0.5, 5, 0.5, A, x, 0, 3.0));
    return 5.4;
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
    ctx.fillRect((w - pw) / 2 + 56, 148, pw - 112, 8); // district colour line along the bottom
    ctx.fillStyle = p.text;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, 96);
  });
  redraws.push(redraw);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(10, 1.875, 1);
  sprite.position.y = y;
  sprite.renderOrder = 2;
  parent.add(sprite);
}

// ── Arcade cabinets ────────────────────────────────────────────────────
// A cabinet is a landmark-sized blockout (no Blender model yet): body, side art, control deck with a stick and two
// buttons, a lit screen and a marquee whose second line is the board's top score (setMarquee, from arcade.js).
export const marquees = new Map(); // stop key → redraw(line)
export function setMarquee(key, line) { marquees.get(key)?.(line); }
const lit = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
function cabinetScreen(title) {
  return canvasTexture(512, 400, (ctx, w, h) => {
    ctx.fillStyle = "#170F38"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(180,160,255,.12)"; ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const candle = (x, top, bot) => { ctx.fillStyle = "#23CDA8"; ctx.fillRect(x, 0, 46, top); ctx.fillStyle = "#FF5C70"; ctx.fillRect(x, bot, 46, h - bot); };
    candle(300, 110, 250); candle(440, 170, 310);
    ctx.fillStyle = "#0B6E5B"; ctx.beginPath(); ctx.arc(150, 190, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#23CDA8"; ctx.beginPath(); ctx.arc(146, 186, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#6D3BF5"; ctx.beginPath(); ctx.moveTo(150, 166); ctx.lineTo(136, 190); ctx.lineTo(147, 190); ctx.lineTo(142, 208); ctx.lineTo(158, 184); ctx.lineTo(147, 184); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#F1ECFF"; ctx.font = "700 44px Impact, 'Arial Black', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(title.toUpperCase(), w / 2, 22);
    ctx.font = "600 24px 'Atkinson Hyperlegible Next', Arial, sans-serif"; ctx.fillStyle = "#B3A6E6";
    ctx.fillText("Pull onto the pad to play", w / 2, h - 50);
  });
}
function cabinetMarquee(title) {
  return canvasTexture(768, 180, (ctx, w, h, line) => {
    ctx.fillStyle = "#0E0A2A"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#FFD400"; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFD400"; ctx.font = "700 74px Impact, 'Arial Black', sans-serif"; ctx.fillText(title.toUpperCase(), w / 2, 62, w - 60);
    ctx.fillStyle = "#7CFF6B"; ctx.font = "700 44px 'Courier New', monospace"; ctx.fillText(line || "INSERT COIN", w / 2, 136, w - 60);
  });
}
SHAPES.cabinet = (g, A, stop) => {
  const title = stop.arcade?.title || stop.name;
  g.add(box(3.2, 5.4, 2.4, M.build, 0, 0, -0.2)); // body; its front is the +z face, toward the pad
  for (const sx of [-1, 1]) g.add(box(0.06, 4.6, 1.8, A, sx * 1.62, 0.4, -0.3)); // side art
  g.add(box(3.2, 0.5, 1.4, M.trim, 0, 2.4, 0.9)); // control deck
  g.add(cyl(0.07, 0.5, M.trim, -0.7, 2.9, 1.1, 8));
  g.add(mesh(new THREE.SphereGeometry(0.17, 12, 8), A, -0.7, 3.55, 1.1));
  for (const [x, z] of [[0.45, 1.0], [0.95, 1.25]]) g.add(cyl(0.16, 0.08, A, x, 2.9, z, 16));
  g.add(box(3.4, 0.9, 2.0, A, 0, 5.4, -0.4)); // marquee housing
  const screen = cabinetScreen(title); screen.redraw();
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), lit(screen.tex));
  sc.position.set(0, 4.1, 1.01); sc.rotation.x = -0.1; g.add(sc);
  const sign = cabinetMarquee(title); sign.redraw("INSERT COIN");
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.7), lit(sign.tex));
  sg.position.set(0, 5.85, 0.61); g.add(sg);
  marquees.set(stop.key, (line) => sign.redraw(line));
  return 6.3;
};

// ── Stops: building + label + pad ──────────────────────────────────────
export const pads = [];
const padGeo = new THREE.RingGeometry(2.3, 3, 40);
const discGeo = new THREE.CircleGeometry(2.3, 40);
// ── Blender models ─────────────────────────────────────────────────────
// Shapes with a model in /ecosystem/models replace their blockout once loaded. Material names in
// the model pick the theme-aware materials: Accent (district colour), Building, Trim, Glass.
// Nodes named spin_* turn slowly about the vertical; turn_* turn about the way they face (a door).
const MODELS = {
  hq: "hq.glb", exchange: "exchange.glb", slpvault: "slp-vault.glb", coinstack: "coin-stack.glb",
  bridgegate: "bridge-gate.glb", terminal: "terminal.glb", observatory: "observatory.glb",
  townhall: "town-hall.glb", rotunda: "rotunda.glb", gatehouse: "gatehouse.glb",
  kiosk: "kiosk.glb", twin: "twin.glb", cluster: "cluster.glb", pillar: "pillar.glb", dome: "dome.glb",
  tower: "tower.glb", antenna: "antenna.glb", grid: "grid.glb", coins: "coins.glb", vault: "vault.glb",
  arch: "arch.glb", cliff: "cliff.glb", shop: "shop.glb", plot: "plot.glb",
};
// Models whose front was built facing another way: turn them so it faces the pad (+z)
const MODEL_YAW = { "cliff.glb": -Math.PI / 2 };
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
    // Multi-material nodes load as a group of meshes: spin the outermost spin_ node
    if (o.name.startsWith("spin_") && !o.parent?.name.startsWith("spin_") && !reduceMotion) {
      animated.push((t) => (o.rotation.y = t * 0.9));
    }
    if (o.name.startsWith("turn_") && !o.parent?.name.startsWith("turn_") && !reduceMotion) {
      animated.push((t) => (o.rotation.z = t * 0.35));
    }
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    // Builders' Row: paint the project's name on the shop's fascia board
    if (o.name === "sign_board") {
      const name = g.userData.pad?.stop.name ?? "";
      // A listed project's logo sits left of its name once it has loaded
      const logoSrc = g.userData.pad?.stop.logo;
      const logo = logoSrc ? new Image() : null;
      const sign = canvasTexture(1024, 200, (ctx, w, h, p) => {
        ctx.fillStyle = p.panel;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = p.text;
        ctx.font = "600 104px 'Atkinson Hyperlegible Next', Arial, sans-serif";
        ctx.textBaseline = "middle";
        if (logo?.complete && logo.naturalWidth) {
          const s = h - 48, room = w - 80 - s - 32;
          const tw = Math.min(ctx.measureText(name).width, room), x0 = (w - (s + 32 + tw)) / 2;
          ctx.drawImage(logo, x0, 24, s, s);
          ctx.textAlign = "left";
          ctx.fillText(name, x0 + s + 32, h / 2 + 4, room);
        } else {
          ctx.textAlign = "center";
          ctx.fillText(name, w / 2, h / 2 + 4, w - 80);
        }
      });
      if (logo) {
        logo.onload = () => currentPal && sign.redraw(currentPal);
        logo.src = new URL(`../${logoSrc}`, import.meta.url).href;
      }
      sign.tex.flipY = false; // glTF UVs
      redraws.push(sign.redraw);
      if (currentPal) sign.redraw(currentPal); // else the first theme pass paints it
      o.material = new THREE.MeshBasicMaterial({ map: sign.tex, toneMapped: false });
      o.castShadow = false;
      return;
    }
    if (o.name.startsWith("screen_") || o.name === "code_screen") {
      o.material = o.name === "code_screen" ? codeMaterial : tickerMaterial;
      o.castShadow = false;
      return;
    }
    // Town hall clock: the visitor's local time
    if (o.name === "clockhand_h" || o.name === "clockhand_m") {
      const hour = o.name === "clockhand_h";
      animated.push(() => {
        const d = new Date();
        const m = d.getMinutes() + d.getSeconds() / 60;
        o.rotation.z = -(hour ? ((d.getHours() % 12) + m / 60) / 12 : m / 60) * Math.PI * 2;
      });
    }
    const n = o.material?.name;
    o.material =
      n === "Accent" ? A : n === "Trim" ? M.trim : n === "Glass" ? M.glass : n === "Building" ? M.build
      : n === "ClockFace" ? clockFace : n === "ClockHand" ? clockHand : o.material;
  });
  // Keep the floating label; drop the blockout
  [...g.children].filter((c) => !c.isSprite).forEach((c) => g.remove(c));
  model.rotation.y = MODEL_YAW[file] ?? 0;
  g.add(model);
  // The model's footprint replaces the blockout's in the collision list
  const obb = obbOf(model, 0.3);
  colliders[colliderIndex] = obb;
  const b = obb.box; // in the building's own frame
  // Move the pad out to clear the model's footprint
  const pad = g.userData.pad;
  if (pad) {
    const reach = (b.max.z - b.min.z) / 2 + 3.5; // depth towards the pad
    pad.pos.set(g.position.x + pad.dir.x * reach, pad.pos.y, g.position.z + pad.dir.z * reach);
    pad.ring.position.set(pad.pos.x, pad.ring.position.y, pad.pos.z);
    pad.disc.position.set(pad.pos.x, pad.disc.position.y, pad.pos.z);
  }
  // Float the label just above the model's top
  const label = g.children.find((c) => c.isSprite);
  if (label) label.position.y = b.max.y + 2.2;
}

// ── Ticker board: a scrolling strip of live prices on screen_ meshes ────
const ticker = canvasTexture(8192, 192, (ctx, w, h, p) => {
  ctx.fillStyle = "#07090b";
  ctx.fillRect(0, 0, w, h);
  if (!tickerQuotes.length) return;
  ctx.textBaseline = "middle";
  ctx.font = "600 92px 'Geist Mono', monospace";
  let x = 60;
  for (const q of tickerQuotes) {
    const price = q.price >= 1000 ? q.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : q.price >= 1 ? q.price.toFixed(2) : q.price.toPrecision(3);
    const chg = `${q.change >= 0 ? "+" : "−"}${Math.abs(q.change).toFixed(1)}%`;
    const sw = ctx.measureText(q.sym + " ").width;
    const pw = ctx.measureText(price + "  ").width;
    const width = sw + pw + ctx.measureText(chg).width;
    if (x + width > w - 40) break; // whatever fits, busiest markets first
    ctx.fillStyle = "#26fab0";
    ctx.fillText(q.sym, x, h / 2);
    ctx.fillStyle = "#f9fafb";
    ctx.fillText(price, x + sw, h / 2);
    ctx.fillStyle = "#9ca3af";
    ctx.fillText(chg, x + sw + pw, h / 2);
    x += width + 160;
  }
});
ticker.tex.wrapS = THREE.RepeatWrapping;
ticker.tex.flipY = false; // glTF UVs run top-down, unlike canvas textures
ticker.tex.repeat.x = 0.32; // the board shows about a third of the strip at once
const tickerMaterial = new THREE.MeshBasicMaterial({ map: ticker.tex, toneMapped: false });
let tickerQuotes = [];
export function setTicker(quotes, values = {}) {
  tickerQuotes = quotes || [];
  ticker.redraw({});
  codeValues = values;
  code.redraw({});
}
if (!reduceMotion) animated.push((t) => (ticker.tex.offset.x = (t * 0.018) % 1));

// ── Developers' terminal screen: real API calls with live numbers ──────
const code = canvasTexture(1024, 800, (ctx, w, h) => {
  ctx.fillStyle = "#07090b";
  ctx.fillRect(0, 0, w, h);
  const v = codeValues;
  const lines = [
    ["#9ca3af", "$ curl api.strikefinance.org/v2/markets"],
    ["#f9fafb", `{ "markets": ${v.markets ?? "…"}, "max_leverage": "${v.maxLeverage ?? "…"}" }`],
    ["", ""],
    ["#9ca3af", "$ curl …/price/v2/ticker/24hr"],
    ["#f9fafb", `{ "volume_24h": "${v.volume24h ?? "…"}" }`],
    ["", ""],
    ["#26fab0", "POST /v2/order   X-Builder-Fee-Bps: 5"],
    ["#26fab0", "WS   /ws/user-api   connected"],
    ["", ""],
    ["#9ca3af", "docs.strikefinance.org/api"],
  ];
  ctx.font = "500 40px 'Geist Mono', monospace";
  ctx.textBaseline = "top";
  lines.forEach(([c, t], i) => {
    ctx.fillStyle = c || "#f9fafb";
    ctx.fillText(t, 48, 60 + i * 68, w - 96);
  });
  ctx.fillStyle = "#26fab0";
  ctx.fillRect(48, 60 + lines.length * 68, 22, 40); // cursor
});
code.tex.flipY = false; // glTF UVs
const codeMaterial = new THREE.MeshBasicMaterial({ map: code.tex, toneMapped: false });
let codeValues = {};

// Clocks read the same in both themes: lit face, dark hands, unaffected by the scene lights
const clockFace = new THREE.MeshBasicMaterial({ color: 0xf4f1e8 });
const clockHand = new THREE.MeshBasicMaterial({ color: 0x111111 });

// Resolves once every model started so far has loaded (or failed)
export const modelsReady = () => Promise.allSettled([...loading.values()]);

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
    const target = slot ? slot.face : stop.face || d.centre;
    const fx = target[0] - stop.pos[0], fz = target[1] - stop.pos[1];
    const fl = Math.hypot(fx, fz) || 1;
    const toCentre = new THREE.Vector3(fx / fl, 0, fz / fl);
    g.rotation.y = Math.atan2(toCentre.x, toCentre.z);
    const height = SHAPES[shape](g, A, stop);
    parent.add(g);
    const bb = addCollider(g); // before the label, whose sprite would widen the box
    const colliderIndex = colliders.length - 1;
    makeLabel(stop.name, d.colour, height + 2.2, g);
    const modelFile = MODELS[stop.shape] || MODELS[shape]; // a landmark may have no blockout shape of its own
    if (modelFile) swapInModel(g, modelFile, A, colliderIndex);
    const reach = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 4.5;
    const padPos = new THREE.Vector3(stop.pos[0], 0.18, stop.pos[1]).addScaledVector(toCentre, reach);
    const ring = new THREE.Mesh(padGeo, tintedBasic(d.colour, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(padPos);
    const disc = new THREE.Mesh(discGeo, tintedBasic(d.colour, { transparent: true, opacity: 0.14 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(padPos).setY(0.16);
    parent.add(ring, disc);
    const pad = { stop, pos: padPos, ring, disc, dir: toCentre, group: g };
    pads.push(pad);
    g.userData.pad = pad;
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
  colliders.push(aabb(x - 0.35, x + 0.35, z - 0.35, z + 0.35));
}

// Wayfinding: a sign at HQ for every spoke, a welcome arch and a junction sign where each spoke
// meets its district (back to HQ and on to both neighbours), and a warning before each jump.
const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
// Gap from (x, z) to the nearest building's box. Models load later and can be a little wider
// than the blockout, so callers ask for a margin.
function clearance(x, z) {
  let best = Infinity;
  for (const k of colliders) {
    if (k.top === undefined) continue;
    const dx = x - k.cx, dz = z - k.cz;
    const lx = dx * k.c - dz * k.s, lz = dx * k.s + dz * k.c;
    best = Math.min(best, Math.hypot(Math.max(0, Math.abs(lx) - k.hx), Math.max(0, Math.abs(lz) - k.hz)));
  }
  return best;
}
export function buildRoadSigns(scene) {
  roads.forEach((r) => {
    if (r.kind !== "spoke") return;
    const to = DISTRICTS[r.to];
    const side = (t, s) => {
      const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
      return { x: p.x - tan.z * s, z: p.z + tan.x * s, tx: tan.x, tz: tan.z, px: p.x, pz: p.z };
    };
    // At HQ: this road's destination, on whichever side has room for a car past the stop beside it
    const tries = [0.03, 0.05, 0.07, 0.09].flatMap((t) => [side(t, ROAD_HALF + 1.6), side(t, -(ROAD_HALF + 1.6))]);
    const a = tries.find((c) => clearance(c.x, c.z) > 4) ?? tries[0];
    buildSignpost(groupFor(scene, "hub"), a.x, a.z, [{ text: to.name, colour: to.colour, dir: [a.tx, a.tz] }]);
    // At the district: back to HQ, and along the ring road both ways
    const b = side(0.95, -(ROAD_HALF + 3.4)); // clear of the arch posts
    const arms = [{ text: "Strike HQ", colour: DISTRICTS.hub.colour, dir: [-b.tx, -b.tz] }];
    for (const e of to.exits) {
      const n = DISTRICTS[e.to];
      arms.push({ text: n.name, colour: n.colour, dir: unit(e.at[0] - b.x, e.at[1] - b.z) });
    }
    // Link roads and drives out of this district (Partners to the raceway, Perps to the Fill Yard)
    for (const l of roads) {
      if ((l.kind !== "link" && l.kind !== "drive") || l.from !== r.to) continue;
      const n = DISTRICTS[l.to];
      arms.push({ text: n.name, colour: n.colour, dir: unit(l.pts[0][0] - b.x, l.pts[0][1] - b.z) });
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
  // A link road: a signpost where it leaves its district, an arch where it arrives
  roads.forEach((r) => {
    if (r.kind !== "link") return;
    const to = DISTRICTS[r.to];
    const p = r.curve.getPointAt(0.04), tan = r.curve.getTangentAt(0.04);
    const s = r.half + 1.6;
    buildSignpost(groupFor(scene, r.from), p.x - tan.z * s, p.z + tan.x * s, [{ text: to.name, colour: to.colour, dir: [tan.x, tan.z] }]);
    buildArch(groupFor(scene, r.to), r, to, 22);
  });
  // A drive off a spoke (the Fill Yard): a signpost on the spoke's verge before the turn, pointing
  // down the drive, and an arch where the drive reaches the yard
  roads.forEach((r) => {
    if (r.kind !== "drive") return;
    const to = DISTRICTS[r.to];
    const spoke = roads.find((x) => x.kind === "spoke" && x.to === r.from);
    if (!spoke) return;
    const [sx, sz] = r.pts[0];
    let best = 0, bd = Infinity;
    spoke.pts.forEach(([x, z], i) => { const d = Math.hypot(x - sx, z - sz); if (d < bd) { bd = d; best = i; } });
    const t = Math.max(0, (spoke.cum[best] - 12) / spoke.len); // 12 m before the turn
    const p = spoke.curve.getPointAt(t), tan = spoke.curve.getTangentAt(t);
    const dt = r.curve.getTangentAt(0.1);
    const side = Math.sign(-tan.z * dt.x + tan.x * dt.z) || 1; // the verge the drive leaves from
    const s = side * (spoke.half + 1.6);
    buildSignpost(groupFor(scene, r.from), p.x - tan.z * s, p.z + tan.x * s, [{ text: to.name, colour: to.colour, dir: unit(dt.x, dt.z) }]);
    buildArch(groupFor(scene, r.to), r, to, Math.min(22, r.len / 2));
  });
  jumps.forEach((j) => {
    const r = roads[j.road];
    const t = (j.t - 14 / r.len + 1) % 1;
    const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
    const s = j.side * (r.half + 1.6);
    buildSignpost(scene, p.x - tan.z * s, p.z + tan.x * s, [{ text: "Jump ahead", colour: 0xf59e0b, dir: [tan.x, tan.z] }]);
  });
}

// A gateway over the road where it enters a district, with the district's name on the beam
function buildArch(parent, road, d, back = 5) {
  const t = 1 - back / road.len;
  const p = road.curve.getPointAt(t), tan = road.curve.getTangentAt(t);
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.rotation.y = Math.atan2(tan.x, tan.z);
  const A = accent(d.colour);
  const half = road.half + 1.6;
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
  // RealFi crates at the raceway: the logo on every face, one shared material
  crate: () => {
    const g = new THREE.Group();
    g.add(mesh(crateGeo, crateMaterial()));
    return { m: g, r: 0.8, h: 0.6 };
  },
  coin: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x6b4500, emissiveIntensity: 0.35, metalness: 0.15, roughness: 0.35 })));
    return { m: g, r: 0.8, h: 0.1 };
  },
};
// ── RealFi's logo (img/realfi-logo.svg, from realfi.co) for canvases ──────
const logoImg = new Image();
export const realfiLogo = new Promise((res) => {
  logoImg.onload = () => res(logoImg);
  logoImg.onerror = () => { console.warn("[eco] RealFi logo didn't load"); res(null); };
});
logoImg.src = "/ecosystem/img/realfi-logo.svg";
const logoTints = new Map();
// The logo in one colour (it ships in RealFi's brand green), centred in the box (x, y, w, h)
export function drawLogo(ctx, colour, x, y, w, h) {
  if (!logoImg.complete || !logoImg.naturalWidth) return false;
  if (!logoTints.has(colour)) {
    const c = document.createElement("canvas");
    c.width = 620;
    c.height = 200;
    const k = c.getContext("2d");
    k.drawImage(logoImg, 0, 0, c.width, c.height);
    k.globalCompositeOperation = "source-in";
    k.fillStyle = colour;
    k.fillRect(0, 0, c.width, c.height);
    logoTints.set(colour, c);
  }
  const src = logoTints.get(colour);
  const s = Math.min(w / src.width, h / src.height);
  ctx.drawImage(src, x + (w - src.width * s) / 2, y + (h - src.height * s) / 2, src.width * s, src.height * s);
  return true;
}
export const REALFI = { green: "#032327", accent: "#0fb89c", paper: "#fafafa" };

// RealFi's full logo, white on their dark green as on realfi.co, for the race-control booth
let panelMat = null;
function realfiPanel() {
  if (panelMat) return panelMat;
  const { tex, redraw } = canvasTexture(1024, 286, (ctx, w, h) => {
    ctx.fillStyle = REALFI.green;
    ctx.fillRect(0, 0, w, h);
    if (!drawLogo(ctx, REALFI.paper, 120, 50, w - 240, h - 100)) {
      ctx.fillStyle = REALFI.paper;
      ctx.font = "600 120px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("RealFi", w / 2, h / 2);
    }
  });
  redraw();
  realfiLogo.then(() => redraw());
  panelMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  return panelMat;
}

// RealFi's mark on a coin (img/realfi-mark.svg: the rings and line from their logo), the size of HQ's
function realfiCoin() {
  const mark = new Image();
  const face = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = REALFI.green;
    ctx.fillRect(0, 0, w, h);
    if (!mark.complete || !mark.naturalWidth) return;
    // Tint the mark (drawn in RealFi's dark green) to the accent, then centre it
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const k = c.getContext("2d");
    const mh = 380, mw = (mark.naturalWidth / mark.naturalHeight) * mh;
    k.drawImage(mark, (512 - mw) / 2, (512 - mh) / 2, mw, mh);
    k.globalCompositeOperation = "source-in";
    k.fillStyle = REALFI.accent;
    k.fillRect(0, 0, 512, 512);
    // A cylinder cap's UVs run a quarter-turn round from the face's upright: turn the mark to match
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(c, -w / 2, -h / 2, w, h);
    ctx.restore();
  });
  mark.onload = () => face.redraw();
  mark.src = "/ecosystem/img/realfi-mark.svg";
  face.redraw();
  const faceMat = new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: face.tex, emissiveIntensity: 0.35 });
  const rim = new THREE.MeshStandardMaterial({ color: REALFI.accent, roughness: 0.4 });
  // Cylinder groups: side, top cap, bottom cap. Turned so the caps face the front and back.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.36, 48), [rim, faceMat, faceMat]);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  const holder = new THREE.Group();
  holder.add(disc);
  return holder;
}
const crateGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
let crateMat = null;
function crateMaterial() {
  if (crateMat) return crateMat;
  const { tex, redraw } = canvasTexture(256, 256, (ctx, w, h) => {
    // Dark face, logo in RealFi's green (Ben, 30 Oct)
    ctx.fillStyle = REALFI.green;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = REALFI.accent;
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    if (!drawLogo(ctx, REALFI.accent, 30, 30, w - 60, h - 60)) {
      ctx.fillStyle = REALFI.accent;
      ctx.font = "600 52px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("RealFi", w / 2, h / 2);
    }
  });
  redraw();
  realfiLogo.then(() => redraw());
  crateMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  return crateMat;
}

export function addProp(parent, kind, x, z, rotY = 0, lift = 0) {
  const p = PROP[kind]();
  p.m.position.set(x, terrainHeight(x, z) + p.h + lift, z);
  p.m.rotation.y = rotY;
  parent.add(p.m);
  crates.push({ ...p, kind, v: new THREE.Vector2(), spin: 0, tilt: 0, lift, redraw: () => {} });
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
    const half = roads[j.road].half;
    const parent = roads[j.road].kind === "track" ? groupFor(scene, "raceway") : scene;
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const u = j.length + 10 + k * 2.2;
      const v = side * (half + 2.4);
      addProp(parent, "bale", j.ox + j.fx * u + j.rx * (v - j.side * (half - j.width / 2)), j.oz + j.fz * u + j.rz * (v - j.side * (half - j.width / 2)), Math.atan2(j.fx, j.fz));
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
// Strike's own market icons (img/markets/<SYMBOL>.png, from app.strikefinance.org; see SOURCES.md).
// Only symbols with a file are requested, so a new market keeps its text face without a 404.
const MARKET_LOGOS = new Set(("AAOI ADA BNB BTC COIN CRCL CXMT DOGE DRAM ETH GOOGL HYPE LIT MINIMAX MU NAS100 " +
  "NEAR NIGHT NVDA PUMP SKHYNIX SNDK SOL SP500 SPCX SUI TSLA UNITREE WTI XAG XAU XRP ZEC ZHIPU").split(" "));
// The app puts these three on a text-colour disc (no "noBg"); the rest draw straight
export const LOGO_DISC = new Set(["ADA", "NEAR", "NIGHT"]);
const marketLogos = new Map(); // symbol -> Image, loaded once and reused by every redraw
export function marketLogo(sym, onReady) {
  if (!MARKET_LOGOS.has(sym)) return null;
  let img = marketLogos.get(sym);
  if (!img) {
    img = new Image();
    img.onerror = () => { img.failed = true; };
    img.src = `/ecosystem/img/markets/${sym}.png`;
    marketLogos.set(sym, img);
  }
  if (!img.complete) img.addEventListener("load", onReady, { once: true });
  return img;
}
export function addCrates(scene, tickers, cx, cz, colour) {
  const parent = groupFor(scene, "perps");
  tickers.forEach((t, i) => {
    const sym = String(t).toUpperCase();
    let lastPal = null;
    const { tex, redraw } = canvasTexture(256, 256, (ctx, w, h, p) => {
      lastPal = p;
      const img = marketLogo(sym, () => lastPal && redraw(lastPal));
      const logo = img && img.complete && img.naturalWidth && !img.failed;
      ctx.fillStyle = p.panel;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, w - 14, h - 14);
      ctx.fillStyle = p.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (!logo) {
        ctx.font = `500 ${t.length > 5 ? 44 : 64}px 'Geist Mono', monospace`;
        ctx.fillText(t, w / 2, h / 2);
        return;
      }
      // Logo in a circle, as the app shows it, with the ticker underneath
      const d = 116, lx = w / 2, ly = 98;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, d / 2, 0, Math.PI * 2);
      ctx.clip();
      if (LOGO_DISC.has(sym)) ctx.fillRect(lx - d / 2, ly - d / 2, d, d);
      ctx.drawImage(img, lx - d / 2, ly - d / 2, d, d);
      ctx.restore();
      ctx.save(); // the app's faint ring, so white icons keep their edge on a light panel
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = p.text;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(lx, ly, d / 2 - 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = p.text;
      ctx.font = `500 ${t.length > 5 ? 32 : 40}px 'Geist Mono', monospace`;
      ctx.fillText(t, w / 2, 196);
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
