// Static matrices. three.js composes every object's local matrix from its position, rotation and scale on every frame
// (Object3D.matrixAutoUpdate), then multiplies it by its parent's: over the world's 2,770 objects that was 2.4 ms a frame
// on an M5 with V8's JIT off, the shape of Safari under Lockdown Mode on Ben's phone (4 Nov 2026). Nearly nothing in the
// world moves once it is built, so once the world is up, and again once the Blender models have replaced their
// blockouts, freezeStatic(scene) composes each static object's matrix one last time and switches its automatic update
// off. Whatever moves marks itself live before that pass (markLive); the pass leaves a live object alone and, with
// `deep`, its whole subtree (the car, whose wheels turn inside it). Code that moves a frozen object afterwards calls
// moved(o) so its matrix is composed again (a pad slid out to clear a model's footprint). The frozen state is invisible
// to the rest of the code: a frozen child of a moving parent still takes its world matrix from the parent each frame,
// and getWorldPosition, updateWorldMatrix and obbOf read frozen matrices as they always did. qa/freeze-smoke.mjs checks
// that nothing frozen is moved behind three.js's back.
export function markLive(o, deep = false) { o.userData.live = deep ? "deep" : true; return o; }
/** Kept out of the geometry merge: a node the code finds by name later, a pad whose own material pulses, a group that is referenced. */
export function markKeep(o) { o.userData.keep = true; return o; }
/** Freeze the static objects under `root` (root included); live objects and the subtrees of deep-live ones are left as they are. Returns how many were frozen. */
export function freezeStatic(root) {
  let n = 0;
  const walk = (o) => {
    const live = o.userData.live;
    if (live === "deep") return;
    if (!live) { o.updateMatrix(); o.matrixAutoUpdate = false; n++; }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return n;
}
/** After moving an object that may be frozen: compose its matrix again. */
export function moved(o) { if (!o.matrixAutoUpdate) o.updateMatrix(); }
