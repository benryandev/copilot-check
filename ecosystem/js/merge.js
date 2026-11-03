// Static geometry merged per material (BufferGeometryUtils.mergeGeometries), once the models are in. three.js visits every
// object in the scene twice a frame (the matrix walk, then the culling walk) and issues a draw call per visible mesh, and
// without a JIT each of those costs a phone tens of microseconds: a district of two hundred boxes and cylinders was two
// hundred visits and up to two hundred calls (4 Nov 2026). mergeStatic(root) takes every static mesh under a root (a
// district's group, or the scene for what stands outside the districts) that shares an opaque material with another, bakes
// its world transform into a copy of its geometry and joins them into one mesh per material (and per shadow flags, render
// order and attribute set), added to the root in their place; the merged mesh is culled with its district as before and
// takes theme changes as before, since the material objects are the same. Left alone: anything live or under a live
// object (it moves; freeze.js markLive), anything marked keep and everything under it (found by name or repainted later:
// a monument's faces and lamps, the pads, the ridge posts; freeze.js markKeep), transparent materials (their sort order is
// their own), multi-material, instanced and skinned meshes, sprites and points, and a mesh whose material nobody else
// shares (nothing to merge with). Groups the merge empties are pruned (pruneEmpty) unless kept, live or protected.
// Run after the models land: a model landing later would be merged with nothing, and a kerb rebuilt from a group's box
// (monuments.js buildKerb) would read an empty group. qa/scene-walk-smoke.mjs checks that nothing mergeable is left.
import * as THREE from "../vendor/three.module.min.js";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";

export const mergeable = (o) => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible && !o.userData.keep && !o.userData.live
  && !Array.isArray(o.material) && !o.material.transparent && !!o.geometry?.attributes.position;
/** The batch a mesh can join: one material, one set of shadow flags, one render order, one attribute set. */
export const batchKey = (o) => [o.material.uuid, +o.castShadow, +o.receiveShadow, o.renderOrder, +o.frustumCulled, Object.keys(o.geometry.attributes).sort().join(","), Object.keys(o.geometry.morphAttributes).sort().join(",")].join("|");

/** Merge under `root`, not entering subtrees `boundary(o)` names (the district groups, when the root is the scene). Returns the meshes taken out. */
export function mergeStatic(root, boundary = () => false) {
  root.updateWorldMatrix(true, true);
  const rootInv = root.matrixWorld.clone().invert();
  const batches = new Map();
  const walk = (o, underLive) => {
    if (o.userData.live === "deep" || (o !== root && o.userData.keep)) return;
    const live = underLive || !!o.userData.live;
    if (!live && mergeable(o)) { const k = batchKey(o); if (!batches.has(k)) batches.set(k, []); batches.get(k).push(o); }
    for (const c of o.children) if (!boundary(c)) walk(c, live);
  };
  walk(root, false);
  const removed = [], rel = new THREE.Matrix4();
  for (const list of batches.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => o.geometry.clone().applyMatrix4(rel.multiplyMatrices(rootInv, o.matrixWorld)));
    const indexed = geos.every((g) => g.index);
    const merged = mergeGeometries(indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!merged) continue; // incompatible after all (the console says which): left as they were
    merged.computeBoundingSphere();
    const first = list[0], mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.renderOrder = first.renderOrder; mesh.frustumCulled = first.frustumCulled;
    mesh.name = "merged"; mesh.userData.merged = list.length;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix(); // the geometry is in the root's frame already
    root.add(mesh);
    for (const o of list) { o.parent.remove(o); removed.push(o); }
  }
  return removed;
}

/** Free the GPU buffers of geometries nothing in the scene draws any more (a model's geometry is shared by its clones; one still standing keeps it). */
export function disposeOrphans(scene, removed) {
  const used = new Set();
  scene.traverse((o) => { if (o.geometry) used.add(o.geometry); });
  const done = new Set();
  for (const o of removed) if (!used.has(o.geometry) && !done.has(o.geometry)) { done.add(o.geometry); o.geometry.dispose(); }
  return done.size;
}

/** Remove the groups the merge left empty, bottom up; never a kept, live or protected object, nor anything under a live one. */
export function pruneEmpty(root, protect = () => false) {
  let n = 0;
  const walk = (o) => {
    if (o.userData.live || o.userData.keep || protect(o)) return;
    for (const c of [...o.children]) walk(c);
    if (o !== root && !o.children.length && (o.isGroup || o.type === "Object3D")) { o.parent.remove(o); n++; }
  };
  walk(root);
  return n;
}
