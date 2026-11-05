// Tree belts (plan 5 Task 1, Ben's amendment 1: the Lagoon is hidden in a forest). buildTreeBelt rings a venue's world with
// low-poly trees between radius − 60 and radius, standing on the bowl's rim; buildArchTrees puts a short belt across a hub
// venue road at its arch, so the road runs into the trees with the arch in the gap. Either is one InstancedMesh with one
// material (trunk and crown in one geometry, coloured per vertex), so one draw call; nothing moves and nothing is solid.
// No tree on a road or its verge (and a short lane is kept open past a road's end), in or beside water, on a plaza or in the
// Raceway. The phone and low tiers draw half the trees (setDensity; the half kept is every other cell of the grid, so it
// thins evenly). Spots come from a seeded random, so the scene is the same on every load. Imports three.js and terrain.js
// only, so node can build it (qa/trees-unit.mjs).

import * as THREE from "../vendor/three.module.min.js";
import { roads, roadInfo, waterInfo, onWater, groundHeight, districts, inRaceway } from "./terrain.js";

export const TREES = {
  band: 60, // m deep, the venue ring: radius − band to radius
  cell: 6.5, // m, one tree per cell of a jittered grid (about 1,900 on the Lagoon)
  sink: 0.3, // m below the ground at the trunk, so a slope never shows the base
  roadClear: 4, // m from a road's edge to the nearest trunk
  waterClear: 3, // m from a bank
  plazaClear: 8, // m from a plaza's rim
  lane: 10, // m past the road home's end kept open in a venue's ring, so the road runs on into the trees rather than into a wall
  // The hub's belt across a venue road, centred on the road's end (the arch stands 5 m inside it) with no lane, so the trees
  // close in a few metres behind the arch and nothing of the world beyond shows through it
  arch: { width: 56, depth: 28, cell: 5, lane: 0 },
};

/** The share of trees a tier draws: all on high and medium, half on the phone and low tiers. */
export const treeDensity = (tierName) => (tierName === "phone" || tierName === "low" ? 0.5 : 1);

const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// The open lane past each venue road's end: a segment from the end, `lane` m on along the road's last direction
const lanes = (lane) => (lane > 0 ? roads.filter((r) => r.kind === "venue") : []).map((r) => {
  const p = r.pts, [x1, z1] = p[p.length - 1], [x0, z0] = p[p.length - 2], l = Math.hypot(x1 - x0, z1 - z0) || 1;
  return { ax: x1, az: z1, bx: x1 + ((x1 - x0) / l) * lane, bz: z1 + ((z1 - z0) / l) * lane, half: r.half };
});
const segD = (s, x, z) => { const vx = s.bx - s.ax, vz = s.bz - s.az, u = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (vx * vx + vz * vz))); return Math.hypot(x - s.ax - vx * u, z - s.az - vz * u); };

/** Whether a trunk may stand at (x, z) in the configured world. */
function clear(x, z, open) {
  const info = roadInfo(x, z, 30);
  if (info.d - info.half <= TREES.roadClear) return false;
  for (const s of open) if (segD(s, x, z) - s.half <= TREES.roadClear) return false;
  const w = waterInfo(x, z, 40);
  if (w.d - w.half <= TREES.waterClear || onWater(x, z)) return false;
  for (const d of Object.values(districts())) if (d.plaza !== false && d.centre && Math.hypot(x - d.centre[0], z - d.centre[1]) <= d.radius + TREES.plazaClear) return false;
  return !inRaceway(x, z);
}

// Jittered grid cells in a frame (origin o, unit axes a and b) over [u0, u1] × [v0, v1], kept where `keep` says; each spot
// carries its cell's parity, and the even cells come first so a count of about half draws a checkerboard
function grid(o, a, b, [u0, u1], [v0, v1], cell, keep, seed) {
  const rand = rng(seed), even = [], odd = [];
  for (let i = Math.floor(u0 / cell); i * cell <= u1; i++) for (let j = Math.floor(v0 / cell); j * cell <= v1; j++) {
    const u = (i + 0.5 + (rand() - 0.5) * 0.8) * cell, v = (j + 0.5 + (rand() - 0.5) * 0.8) * cell;
    const k = 0.8 + rand() * 0.6, yaw = rand() * Math.PI * 2, shade = 0.85 + rand() * 0.3; // drawn every cell, so the spots never shift
    if (u < u0 || u > u1 || v < v0 || v > v1) continue;
    const x = o[0] + a[0] * u + b[0] * v, z = o[1] + a[1] * u + b[1] * v;
    if (!keep(x, z)) continue;
    ((i + j) & 1 ? odd : even).push({ x, z, k, yaw, shade });
  }
  return [...even, ...odd];
}

// One tree: a five-sided trunk under two stacked seven-sided cones, in one non-indexed geometry with a colour per vertex
function treeGeometry() {
  const parts = [
    [new THREE.CylinderGeometry(0.22, 0.32, 2.4, 5, 1, true), 1.2, "trunk"],
    [new THREE.ConeGeometry(2.3, 4.2, 7), 3.9, "crown"],
    [new THREE.ConeGeometry(1.6, 3.4, 7), 6.4, "crown"],
  ];
  const pos = [], nor = [], kind = [];
  for (const [g, y, k] of parts) {
    g.translate(0, y, 0);
    const n = g.toNonIndexed();
    pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array);
    for (let i = 0; i < n.attributes.position.count; i++) kind.push(k === "trunk" ? 0 : 1);
    g.dispose(); n.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  geo.userData.kind = kind;
  return geo;
}

function instanced(parent, spots, palette, density) {
  const geo = treeGeometry();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  spots.forEach((t, i) => {
    p.set(t.x, groundHeight(t.x, t.z) - TREES.sink, t.z);
    q.setFromAxisAngle(up, t.yaw);
    s.set(t.k, t.k * (0.9 + (t.shade - 0.85)), t.k);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    mesh.setColorAt(i, c.setScalar(t.shade));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false; // one instanced mesh is culled whole, so casting would draw every tree into the sun's map each frame
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  const total = spots.length;
  mesh.userData.total = total;
  mesh.userData.setDensity = (d) => { mesh.count = d >= 1 ? total : Math.round(total * d); };
  mesh.userData.setDensity(density);
  mesh.userData.recolour = (pal) => {
    const col = geo.attributes.color, kind = geo.userData.kind;
    const crown = new THREE.Color(pal.grassB).multiplyScalar(0.72), trunk = new THREE.Color(pal.wood);
    for (let i = 0; i < kind.length; i++) { const k = kind[i] ? crown : trunk; col.setXYZ(i, k.r, k.g, k.b); }
    col.needsUpdate = true;
  };
  mesh.userData.recolour(palette);
  parent.add(mesh);
  return mesh;
}

/** A venue's belt: the ring from radius − TREES.band to radius round the world's centre (the venue origin). */
export function buildTreeBelt(scene, radius, palette, { density = 1 } = {}) {
  const inner = radius - TREES.band, open = lanes(TREES.lane);
  const keep = (x, z) => { const r = Math.hypot(x, z); return r >= inner && r <= radius - 1 && clear(x, z, open); };
  const spots = grid([0, 0], [1, 0], [0, 1], [-radius, radius], [-radius, radius], TREES.cell, keep, 17);
  const mesh = instanced(scene, spots, palette, density);
  mesh.name = "tree-belt";
  return mesh;
}

/** The hub's belt across a venue road: TREES.arch.width across and depth along, centred on the road's end (its arch 5 m
 * inside), the road in its gap and the trees closing behind the arch. */
export function buildArchTrees(parent, road, palette, { density = 1 } = {}) {
  const p = road.pts ?? road.points, [x1, z1] = p[p.length - 1], [x0, z0] = p[p.length - 2], l = Math.hypot(x1 - x0, z1 - z0) || 1;
  const f = [(x1 - x0) / l, (z1 - z0) / l], n = [-f[1], f[0]];
  const { width, depth, cell, lane } = TREES.arch, open = lanes(lane);
  const spots = grid([x1, z1], f, n, [-depth / 2, depth / 2], [-width / 2, width / 2], cell, (x, z) => clear(x, z, open), 23);
  const mesh = instanced(parent, spots, palette, density);
  mesh.name = `arch-trees-${road.to}`;
  return mesh;
}
