// A venue's grandstands (plan 5 Task 1): for each { s, off, len } in track.stands a tiered stand 8 m deep along the track at
// lateral `off` (+ the track's right, − its left), its seats rising away from the track, with a crowd on the tiers. The crowd is
// one instanced mesh of coloured dots for every stand (one draw), swaying in the vertex shader (one uniform a frame, nothing
// under reduced motion). One collider box per stand, returned for the runner to make solid (userData.boxes, the shape
// walls-math.js wallBoxes gives: { cx, cz, hx, hz, yaw }, local x along the track); nothing else here is solid. Each stand's
// boxes reach a metre below the lowest ground under its footprint (standLow), so it sits on the ground on any slope.
// Imports three.js and terrain.js only, so node can build it (qa/stands-unit.mjs).

import * as THREE from "../vendor/three.module.min.js";
import { terrainHeight, groundHeight, groundVertexHeight } from "./terrain.js";

export const STAND = { depth: 8, tiers: 4, rise: 0.8, seat: 0.9, base: 1, sample: 3 }; // m: depth, tier count, each tier's rise, crowd spacing, how far the base sinks below the lowest ground, footprint sample spacing
const CROWD = [0xe4572e, 0x2fa7c9, 0xf3b61f, 0x76b041, 0xf5f6f8, 0x7d5ba6, 0x1b1f24, 0xef8a17]; // shirts, the same in both themes

// A seeded random, so the crowd is the same on every load (the scene's fingerprint is stable)
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** The stands' footprints: centre, yaw (three's rotation.y: local +x along the track, local +z away from it) and half sizes. */
export function standBoxes(track) {
  return (track.stands || []).map(({ s, off, len }) => {
    const p = track.at(s), sgn = Math.sign(off) || 1;
    const nx = p.rx * sgn, nz = p.rz * sgn; // away from the track
    return { s, cx: p.x + p.rx * off, cz: p.z + p.rz * off, hx: len / 2, hz: STAND.depth / 2, yaw: Math.atan2(nx, nz) };
  });
}

/** The lowest ground under a stand's footprint: sampled every STAND.sample m or closer along both long edges, the centreline
 * and both ends, from the analytic ground and from what the ground mesh writes (groundVertexHeight), whichever is lower. */
export function standLow(b) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const nu = Math.max(1, Math.ceil((b.hx * 2) / STAND.sample)), nv = Math.max(1, Math.ceil((b.hz * 2) / STAND.sample));
  let low = Infinity;
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    if (i > 0 && i < nu && j > 0 && j < nv && j * 2 !== nv) continue; // the outline and the centreline
    const u = -b.hx + (b.hx * 2 * i) / nu, v = -b.hz + (b.hz * 2 * j) / nv;
    const x = b.cx + u * c + v * s, z = b.cz - u * s + v * c;
    low = Math.min(low, groundHeight(x, z), groundVertexHeight(x, z));
  }
  return low;
}

/** Builds every stand of `track` into one group added to `scene`; null (and nothing added) for a track with none. */
export function buildStands(scene, track, palette, { reduceMotion = false } = {}) {
  const boxes = standBoxes(track);
  if (!boxes.length) return null;
  const group = new THREE.Group();
  group.name = "stands";
  const mats = { seat: new THREE.MeshStandardMaterial({ roughness: 0.8 }), frame: new THREE.MeshStandardMaterial({ roughness: 0.7 }) };
  const td = STAND.depth / STAND.tiers;
  const seats = [];
  for (const b of boxes) {
    const g = new THREE.Group();
    const y0 = terrainHeight(b.cx, b.cz); // the seats' level, where the crowd sits
    // Every box reaches STAND.base below the lowest ground under the footprint, so a stand on a slope or a hump (the start
    // stand's centre is 2.9 m above its ends) shows no gap anywhere; the part below the seats is a plain plinth
    const sink = Math.max(0, y0 - standLow(b)) + STAND.base;
    g.position.set(b.cx, y0, b.cz);
    g.rotation.y = b.yaw;
    const L = b.hx * 2;
    for (let i = 0; i < STAND.tiers; i++) { // each tier a step up and back, from below the ground so a slope never shows a gap
      const top = STAND.rise * (i + 1), h = top + sink;
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, h, td), mats.seat);
      m.position.set(0, top - h / 2, -STAND.depth / 2 + td * (i + 0.5));
      g.add(m);
      seats.push({ b, y: y0 + top, v: -STAND.depth / 2 + td * (i + 0.35) });
    }
    const backH = STAND.rise * STAND.tiers + 2.4 + sink; // a back wall above the top tier, and the two ends
    const back = new THREE.Mesh(new THREE.BoxGeometry(L + 0.4, backH, 0.3), mats.frame);
    back.position.set(0, backH / 2 - sink, STAND.depth / 2 - 0.15);
    g.add(back);
    for (const x of [-L / 2, L / 2]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(0.3, backH, STAND.depth), mats.frame);
      end.position.set(x, backH / 2 - sink, 0);
      g.add(end);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    group.add(g);
  }

  // The crowd: a dot every STAND.seat m along each tier, three in four seats taken
  const rand = rng(5);
  const spots = [];
  for (const { b, y, v } of seats) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    for (let u = -b.hx + 0.8; u <= b.hx - 0.8; u += STAND.seat) {
      if (rand() > 0.75) continue;
      const lu = u + (rand() - 0.5) * 0.3;
      spots.push({ x: b.cx + lu * c + v * s, z: b.cz - lu * s + v * c, y, yaw: b.yaw, k: 0.85 + rand() * 0.3, col: CROWD[Math.floor(rand() * CROWD.length)] });
    }
  }
  const uniforms = { uTime: { value: 0 } };
  const dotMat = new THREE.MeshLambertMaterial();
  dotMat.onBeforeCompile = (shader) => { // a sway and a bob, each dot on its own phase from its position
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        float ph = ip.x * 1.37 + ip.z * 0.91;
        transformed.x += sin(uTime * 2.3 + ph) * 0.07 * (position.y + 0.45);
        transformed.y += max(0.0, sin(uTime * 3.1 + ph * 0.7)) * 0.08;`);
  };
  dotMat.customProgramCacheKey = () => "stand-crowd";
  const crowd = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 0), dotMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  spots.forEach((d, i) => {
    q.setFromAxisAngle(up, d.yaw);
    sc.set(d.k, d.k * 1.5, d.k);
    pos.set(d.x, d.y + 0.45 * d.k, d.z);
    crowd.setMatrixAt(i, m.compose(pos, q, sc));
    crowd.setColorAt(i, col.set(d.col));
  });
  crowd.instanceMatrix.needsUpdate = true;
  crowd.castShadow = false;
  crowd.computeBoundingSphere();
  group.add(crowd);

  group.userData.boxes = boxes.map(({ cx, cz, hx, hz, yaw }) => ({ cx, cz, hx, hz, yaw }));
  group.userData.crowd = crowd;
  group.userData.tick = reduceMotion ? null : (t) => { uniforms.uTime.value = t; };
  group.userData.recolour = (pal) => { mats.seat.color.set(pal.build); mats.frame.color.set(pal.wood ?? pal.trim); };
  group.userData.recolour(palette);
  scene.add(group);
  return group;
}
