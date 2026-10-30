// Ground: rolling hills that flatten under plazas and roads, dirt road ribbons, and jump kickers.
// groundHeight(x, z) is the single source of truth for both the meshes and the car.

import * as THREE from "../vendor/three.module.min.js";
import { DISTRICTS, ROADS, JUMPS, STOPS, TRACK_ROAD, RACE_TRACK } from "./content.js";
import { tint } from "./colours.js";

export const ROAD_HALF = 3.6;
export const WORLD = { cx: 0, cz: 0, radius: 395 }; // 280 before the raceway went in beyond Partners

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ── Roads as sampled polylines ─────────────────────────────────────────
// A closed road (the raceway) loops back on itself; its last sample repeats the first.
export const roads = ROADS.map((r) => {
  const curve = new THREE.CatmullRomCurve3(r.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), !!r.closed, "centripetal");
  const n = Math.max(160, Math.ceil(curve.getLength() / 2)); // about 2 m apart on long roads
  const half = r.half || ROAD_HALF;
  const pts = curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
  let len = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(len);
  }
  return { ...r, curve, pts, cum, len, half };
});

// Road segments bucketed on a grid, so lookups only check nearby segments
const CELL = 12;
const grid = new Map();
const cellKey = (i, j) => i * 100003 + j;
roads.forEach((r, ri) => {
  for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    const seg = { ax, az, bx, bz, ri, cum: r.cum[i] };
    const i0 = Math.floor(Math.min(ax, bx) / CELL), i1 = Math.floor(Math.max(ax, bx) / CELL);
    const j0 = Math.floor(Math.min(az, bz) / CELL), j1 = Math.floor(Math.max(az, bz) / CELL);
    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
      const k = cellKey(a, b);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(seg);
    }
  }
});

// Nearest point on any road within maxD: distance, road index, t (0–1), unit tangent.
// Beyond maxD, d is Infinity.
export function roadInfo(x, z, maxD = 26) {
  let best = { d: Infinity, road: -1, t: 0, tx: 0, tz: 1, half: ROAD_HALF };
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), n = Math.ceil(maxD / CELL);
  for (let a = ci - n; a <= ci + n; a++) for (let b = cj - n; b <= cj + n; b++) {
    const list = grid.get(cellKey(a, b));
    if (!list) continue;
    for (const g of list) {
      const vx = g.bx - g.ax, vz = g.bz - g.az;
      const l2 = vx * vx + vz * vz;
      const u = Math.max(0, Math.min(1, ((x - g.ax) * vx + (z - g.az) * vz) / l2));
      const d = Math.hypot(x - (g.ax + vx * u), z - (g.az + vz * u));
      if (d < best.d && d <= maxD) {
        const l = Math.sqrt(l2), r = roads[g.ri];
        best = { d, road: g.ri, t: (g.cum + l * u) / r.len, tx: vx / l, tz: vz / l, half: r.half };
      }
    }
  }
  return best;
}

// ── Jumps, placed in each road's local frame ───────────────────────────
// A jump may give `s` (metres along the road) instead of `t`.
export const jumps = JUMPS.map((jump) => {
  const r = roads[jump.road];
  const j = jump.s != null ? { ...jump, t: jump.s / r.len } : jump;
  const start = r.curve.getPointAt(j.t);
  const tan = r.curve.getTangentAt(j.t);
  const tx = tan.x, tz = tan.z;
  const l = Math.hypot(tx, tz);
  // Right of travel, looking down the road (heading towards -z means right is -x... use cross product)
  const rx = -tz / l, rz = tx / l;
  const off = j.side * (r.half - j.width / 2 - 0.2);
  return { ...j, ox: start.x + rx * off, oz: start.z + rz * off, fx: tx / l, fz: tz / l, rx, rz };
});

function jumpHeight(x, z) {
  for (const j of jumps) {
    const dx = x - j.ox, dz = z - j.oz;
    const u = dx * j.fx + dz * j.fz;
    const v = dx * j.rx + dz * j.rz;
    if (u >= 0 && u <= j.length && Math.abs(v) <= j.width / 2) return j.height * Math.pow(u / j.length, 1.35);
  }
  return 0;
}

// ── Builders' Row: shop plots along the last stretch of the road into Developers ──
// Alternate sides every 13 m, facing the road; each slot is flattened.
const ROW_STOPS = STOPS.filter((s) => s.row === "builders");
export const builderSlots = (() => {
  const r = roads.find((x) => x.kind === "spoke" && x.to === "developers");
  if (!r) return [];
  return ROW_STOPS.map((stop, i) => {
    const t = 0.88 - (i * 13) / r.len;
    const p = r.curve.getPointAt(t), tan = r.curve.getTangentAt(t);
    const side = i % 2 ? 1 : -1;
    const nx = -tan.z * side, nz = tan.x * side; // away from the road
    const off = ROAD_HALF + 9;
    return { key: stop.key, x: p.x + nx * off, z: p.z + nz * off, face: [p.x, p.z] };
  });
})();

// ── RealFi Raceway: gates and the infield ──────────────────────────────
const track = roads[TRACK_ROAD];
// A point `s` metres along the track: position, unit forward and right (right of travel)
export function trackAt(s) {
  const t = (((s / track.len) % 1) + 1) % 1;
  const p = track.curve.getPointAt(t), tan = track.curve.getTangentAt(t);
  const l = Math.hypot(tan.x, tan.z);
  const fx = tan.x / l, fz = tan.z / l;
  return { x: p.x, z: p.z, fx, fz, rx: -fz, rz: fx };
}
// The centreline polyline sampled at even spacing (s = 0 is the start line)
export const trackPts = track.pts, trackCum = track.cum, trackLen = track.len, TRACK_HALF = track.half;
// Gate 0 is the start/finish line, then each checkpoint in order. A gate is a segment across the
// track, a little wider than it, so cutting across grass beside it doesn't count.
export const GATE_HALF = track.half + 1.5;
export const raceGates = [0, ...RACE_TRACK.checkpoints].map((s, i) => ({ i, s, ...trackAt(s), w: GATE_HALF }));
{
  const drift = Math.abs(track.len - RACE_TRACK.length);
  if (drift > 0.5) console.warn(`[eco] raceway: lap is ${track.len.toFixed(1)} m but RACE_TRACK.length says ${RACE_TRACK.length}`);
}
// Inside the raceway: on or near the track, or anywhere in its infield
const trackPoly = track.pts;
export function inRaceway(x, z) {
  let inside = false;
  for (let i = 0, j = trackPoly.length - 1; i < trackPoly.length; j = i++) {
    const [xi, zi] = trackPoly[i], [xj, zj] = trackPoly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (inside) return true;
  const info = roadInfo(x, z, 30);
  return info.road === TRACK_ROAD && info.d < 30;
}
// Distance to the nearest point of the track (for skipping it when far away)
export function trackDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < trackPoly.length; i += 4) best = Math.min(best, Math.hypot(x - trackPoly[i][0], z - trackPoly[i][1]));
  return best;
}
// A gentle crest along the far side of the track: metres of lift at `s` along it
const CREST = { from: 330, to: 425, height: 2.2 }; // over the S-bend
const crest = (s) => (s <= CREST.from || s >= CREST.to ? 0 : CREST.height * 0.5 * (1 - Math.cos(((s - CREST.from) / (CREST.to - CREST.from)) * Math.PI * 2)));
function trackLift(info) {
  if (info.road !== TRACK_ROAD || !CREST.height) return 0;
  return crest(info.t * track.len) * (1 - smooth(track.half + 3, 22, info.d));
}

// ── Height field ───────────────────────────────────────────────────────
const plazas = Object.values(DISTRICTS).filter((d) => d.plaza !== false);
function flatMask(x, z, d, half = ROAD_HALF) {
  let m = smooth(half + 2, half + 16, d);
  for (const p of plazas) {
    const dp = Math.hypot(x - p.centre[0], z - p.centre[1]) - p.radius;
    m *= smooth(1, 14, dp);
  }
  for (const b of builderSlots) m *= smooth(7, 16, Math.hypot(x - b.x, z - b.z));
  return m;
}
function hills(x, z) {
  return (
    1.6 +
    2.0 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038) +
    1.1 * Math.sin((x + z) * 0.07) +
    0.5 * Math.sin(x * 0.13 - z * 0.11)
  );
}
function edgeRise(x, z) {
  const d = Math.hypot(x - WORLD.cx, z - WORLD.cz);
  return Math.max(0, d - (WORLD.radius - 25)) * 0.55;
}

export function terrainHeight(x, z, info = roadInfo(x, z)) {
  return Math.max(0, hills(x, z)) * flatMask(x, z, info.d, info.half) + trackLift(info) + edgeRise(x, z);
}
export function groundHeight(x, z) {
  return terrainHeight(x, z) + jumpHeight(x, z);
}
// Grass grows where the ground isn't road or plaza
export function grassWeight(x, z) {
  const info = roadInfo(x, z);
  return flatMask(x, z, info.d, info.half);
}
export const onDirt = (x, z) => { const info = roadInfo(x, z); return info.d < info.half + 0.3 || jumpHeight(x, z) > 0; };

// ── Meshes ─────────────────────────────────────────────────────────────
export function buildGround(segments, palette) {
  const size = WORLD.radius * 2 + 40;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD.cx, 0, WORLD.cz);
  const pos = geo.attributes.position;
  const shade = new Float32Array(pos.count); // 0..1 variation, coloured per theme
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    shade[i] = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.13);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.recolour = (p) => {
    const a = new THREE.Color(p.grassA), b = new THREE.Color(p.grassB), c = new THREE.Color();
    const col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      c.copy(a).lerp(b, shade[i]);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  };
  mesh.userData.recolour(palette);
  return mesh;
}

// Dirt texture: speckles, two wheel ruts, soft worn edges
function dirtTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const u = x / (c.width - 1);
      const edge = Math.min(1, Math.min(u, 1 - u) * 7);
      const rut = Math.exp(-((u - 0.3) ** 2) / 0.002) + Math.exp(-((u - 0.7) ** 2) / 0.002);
      const n = Math.random();
      const v = 200 + n * 40 - rut * 30;
      const i = (y * c.width + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v * 0.86;
      img.data[i + 2] = v * 0.68;
      // ragged edge
      img.data[i + 3] = 255 * Math.min(1, edge * (0.75 + n * 0.5));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildRoads(palette) {
  const tex = dirtTexture();
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const group = new THREE.Group();
  for (const r of roads) {
    const n = r.pts.length;
    const verts = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const idx = [];
    const w = r.half + 0.6;
    for (let i = 0; i < n; i++) {
      const [x, z] = r.pts[i];
      // A closed road's ends meet, so its neighbours wrap round (the last sample repeats the first)
      const [ax, az] = r.pts[i > 0 ? i - 1 : r.closed ? n - 2 : 0];
      const [bx, bz] = r.pts[i < n - 1 ? i + 1 : r.closed ? 1 : n - 1];
      const tx = bx - ax, tz = bz - az, l = Math.hypot(tx, tz);
      const nx = -tz / l, nz = tx / l;
      // Roads sit on the ground: flat almost everywhere, over the raceway's crest where it rises
      const lx = x + nx * w, lz = z + nz * w, qx = x - nx * w, qz = z - nz * w;
      verts.set([lx, terrainHeight(lx, lz) + 0.14, lz, qx, terrainHeight(qx, qz) + 0.14, qz], i * 6);
      const v = r.cum[i] / 8;
      uvs.set([0, v, 1, v], i * 4);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    group.add(m);
  }
  group.userData.recolour = (p) => mat.color.set(p.dirt);
  group.userData.recolour(palette);
  return group;
}

// Kicker: sampled from jumpHeight so the mesh matches the physics exactly
export function buildJumps(palette) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial();
  const side = new THREE.MeshLambertMaterial();
  for (const j of jumps) {
    const steps = 16;
    const pos = [];
    const P = (u, v, y) => {
      const x = j.ox + j.fx * u + j.rx * v, z = j.oz + j.fz * u + j.rz * v;
      return [x, y + terrainHeight(x, z), z];
    };
    const hw = j.width / 2;
    const top = [];
    for (let s = 0; s <= steps; s++) {
      const u = (s / steps) * j.length;
      const y = j.height * Math.pow(u / j.length, 1.35) + 0.16;
      top.push([u, y]);
    }
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let s = 0; s < steps; s++) {
      const [u0, y0] = top[s], [u1, y1] = top[s + 1];
      // top surface
      tri(P(u0, -hw, y0), P(u1, -hw, y1), P(u1, hw, y1));
      tri(P(u0, -hw, y0), P(u1, hw, y1), P(u0, hw, y0));
    }
    const sidePos = [];
    const stri = (a, b, c) => sidePos.push(...a, ...b, ...c);
    for (let s = 0; s < steps; s++) {
      const [u0, y0] = top[s], [u1, y1] = top[s + 1];
      for (const v of [-hw, hw]) {
        stri(P(u0, v, 0), P(u1, v, 0), P(u1, v, y1));
        stri(P(u0, v, 0), P(u1, v, y1), P(u0, v, y0));
      }
    }
    // back face
    const L = j.length, H = j.height + 0.16;
    stri(P(L, -hw, 0), P(L, hw, 0), P(L, hw, H));
    stri(P(L, -hw, 0), P(L, hw, H), P(L, -hw, H));
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g1.computeVertexNormals();
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute("position", new THREE.Float32BufferAttribute(sidePos, 3));
    g2.computeVertexNormals();
    const m1 = new THREE.Mesh(g1, mat);
    const m2 = new THREE.Mesh(g2, side);
    m1.material.side = THREE.DoubleSide;
    m2.material.side = THREE.DoubleSide;
    for (const m of [m1, m2]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }
  group.userData.recolour = (p) => { mat.color.set(p.dirtTop); side.color.set(p.dirtSide); };
  group.userData.recolour(palette);
  return group;
}

export function buildPlazas(palette) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial();
  for (const d of plazas) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(d.radius, 72), mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(d.centre[0], 0.08, d.centre[1]);
    disc.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(d.radius - 0.5, d.radius, 96),
      new THREE.MeshBasicMaterial({ color: tint(d.colour) }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(d.centre[0], 0.12, d.centre[1]);
    ring.userData.colour = d.colour;
    group.add(disc, ring);
  }
  group.userData.recolour = (p) => {
    mat.color.set(p.plaza);
    group.children.forEach((c) => c.userData.colour && c.material.color.set(tint(c.userData.colour)));
  };
  group.userData.recolour(palette);
  return group;
}
