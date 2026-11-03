// Plaza furniture: the stone kerb ring at each plaza's rim (the bump itself lives in terrain.js kerbLift), and later the
// lamps and bollards. Where things go comes from furniture-math.js.
import * as THREE from "../vendor/three.module.min.js";
import { kerbGapsOf, terrainHeight } from "./terrain.js";
import { KERB, lampSpot, bollardSpots, rimLampSpots } from "./furniture-math.js";
import { pads, colliders, clearance, orientedBox, accent, M } from "./build.js";
import { DISTRICTS } from "./content.js";

const TAU = Math.PI * 2;
const plazas = () => Object.values(DISTRICTS).filter((d) => d.plaza !== false);

/** The kerb rings: a tube arc between each pair of gaps on every plaza, at 0.14 m (the disc is at 0.08, the rim ring at 0.12). */
export function buildKerbs(scene, palette) {
  const g = new THREE.Group();
  g.name = "kerbs";
  const mat = new THREE.MeshStandardMaterial({ color: palette.mortar, roughness: 0.95 });
  for (const p of plazas()) {
    const r = p.radius - KERB.inset, [cx, cz] = p.centre, gaps = kerbGapsOf(p);
    const arcs = [];
    if (!gaps.length) arcs.push([0, TAU]);
    else for (let i = 0; i < gaps.length; i++) {
      const a0 = gaps[i].a1, a1 = i + 1 < gaps.length ? gaps[i + 1].a0 : gaps[0].a0 + TAU;
      if (a1 - a0 > 0.02) arcs.push([a0, a1]);
    }
    for (const [a0, a1] of arcs) {
      const n = Math.max(4, Math.ceil(((a1 - a0) * r) / 1.5));
      const pts = Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return new THREE.Vector3(cx + Math.cos(a) * r, 0.14, cz + Math.sin(a) * r); });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), n, 0.14, 8, false), mat);
      tube.castShadow = true;
      tube.receiveShadow = true;
      g.add(tube);
    }
  }
  g.userData = { recolour: (p) => mat.color.set(p.mortar) };
  scene.add(g);
  return g;
}

// ── Lamps and bollards (instanced; small static colliders) ──

const place = (mesh, i, x, y, z, s = 1) => { const m = new THREE.Matrix4().makeScale(s, s, s).setPosition(x, y, z); mesh.setMatrixAt(i, m); };

/** One lamp beside every pad whose district has a plaza: a pole, a glowing head in the district colour, a cap. */
export function buildLamps(scene) {
  const g = new THREE.Group();
  g.name = "lamps";
  const spots = [];
  const padList = pads.map((p) => ({ x: p.pos.x, z: p.pos.z, dx: p.dir.x, dz: p.dir.z, district: p.stop.district }));
  padList.forEach((pad, i) => {
    const d = DISTRICTS[pad.district];
    if (!d || d.plaza === false) return;
    const spot = lampSpot(pad, d, { pads: padList.filter((_, k) => k !== i), clearance });
    if (spot) spots.push({ ...spot, colour: d.colour });
  });
  // Four more on each plaza's near rim, either side of the HQ mouth (3 Nov 2026): the front half had nothing standing at night
  for (const d of plazas()) for (const spot of rimLampSpots(d, kerbGapsOf(d))) spots.push({ ...spot, colour: d.colour });
  if (!spots.length) { scene.add(g); return g; }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 10), M.trim, spots.length);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), M.trim, spots.length);
  poles.castShadow = caps.castShadow = true;
  const byColour = new Map();
  spots.forEach((s, i) => {
    const y = terrainHeight(s.x, s.z);
    place(poles, i, s.x, y + 1.7, s.z);
    place(caps, i, s.x, y + 3.9, s.z);
    if (!byColour.has(s.colour)) byColour.set(s.colour, []);
    byColour.get(s.colour).push({ ...s, y });
    colliders.push(orientedBox(s.x, s.z, 0.1, 0.1, 0));
  });
  for (const [colour, list] of byColour) {
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), accent(colour), list.length);
    list.forEach((s, i) => place(heads, i, s.x, s.y + 3.4 + 0.25, s.z));
    g.add(heads);
  }
  g.add(poles, caps);
  g.userData.count = spots.length;
  scene.add(g);
  return g;
}

/** Bollards flanking every kerb gap: a post with a white band near the top. */
export function buildBollards(scene) {
  const g = new THREE.Group();
  g.name = "bollards";
  const spots = plazas().flatMap((p) => bollardSpots(p, kerbGapsOf(p)));
  if (!spots.length) { scene.add(g); return g; }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.85, 10), M.trim, spots.length);
  const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), M.build, spots.length);
  posts.castShadow = true;
  spots.forEach((s, i) => {
    const y = terrainHeight(s.x, s.z);
    place(posts, i, s.x, y + 0.425, s.z);
    place(bands, i, s.x, y + 0.7, s.z);
    colliders.push(orientedBox(s.x, s.z, 0.08, 0.08, 0));
  });
  g.add(posts, bands);
  g.userData.count = spots.length;
  scene.add(g);
  return g;
}
