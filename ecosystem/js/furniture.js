// Plaza furniture: the stone kerb ring at each plaza's rim (the bump itself lives in terrain.js kerbLift), and later the
// lamps and bollards. Where things go comes from furniture-math.js.
import * as THREE from "../vendor/three.module.min.js";
import { kerbGapsOf } from "./terrain.js";
import { KERB } from "./furniture-math.js";
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
