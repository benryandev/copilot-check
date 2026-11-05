// Chart Ridge's picture: a fine ground patch along the ridge road (the coarse ground is built flat and low under it,
// terrain.js groundVertexHeight), the road's own dirt ribbon tinted a third towards green or red per candle, and five
// small posts at the verge reading 24h, 18h, 12h, 6h and now. Everything that depends on the series is rebuilt by
// refresh(); main.js calls it when a new series is applied (only while the local car is clear of the ridge).
import * as THREE from "../vendor/three.module.min.js";
import { roads, RIDGE_ROAD, RIDGE_FADE, terrainHeight, ridgeSeries, roadRibbon, dirtMaterial, groundShade, districts } from "./terrain.js";
import { RIDGE, candleIndex, candleDir } from "./ridge-math.js";
import { canvasTexture, redraws, accent, box } from "./build.js";
import { freezeStatic, markKeep, moved } from "./freeze.js";

const UP = new THREE.Color(0x4ade80), DOWN = new THREE.Color(0xf87171), TINT = 0.26, BLEND = 3; // tint strength; metres either side of a point averaged, so candle boundaries drift rather than band
const LABELS = ["24h", "18h", "12h", "6h", "now"];

export function buildRidge(scene, palette) {
  const g = new THREE.Group();
  g.name = "ridge";
  const r = roads[RIDGE_ROAD];
  if (!r) { g.userData = { refresh() {}, recolour() {} }; return g; }
  let pal = palette;
  const half = r.half + RIDGE_FADE;
  const patchMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const roadMat = dirtMaterial({ vertexColors: true });
  const dyn = new THREE.Group(); // rebuilt on refresh
  g.add(dyn);
  const at = (s, v = 0) => { const u = Math.min(1, Math.max(0, s / r.len)), p = r.curve.getPointAt(u), t = r.curve.getTangentAt(u), l = Math.hypot(t.x, t.z); return { x: p.x + (-t.z / l) * v, z: p.z + (t.x / l) * v, tx: t.x / l, tz: t.z / l }; };

  // The patch: 1 m along, 2 m across, ±(half) from the centreline; the outer 2.5 m tuck under the coarse ground
  function buildPatch() {
    const n = Math.ceil(r.len) + 1, m = Math.ceil(half) + 1; // samples along and across
    const pos = new Float32Array(n * m * 3), col = new Float32Array(n * m * 3), idx = [];
    const a = new THREE.Color(pal.grassA), b = new THREE.Color(pal.grassB), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const s = (i / (n - 1)) * r.len;
      for (let j = 0; j < m; j++) {
        const v = -half + (j / (m - 1)) * 2 * half, p = at(s, v);
        const tuck = Math.abs(v) > half - 2.5 ? 0.35 : 0;
        const k = (i * m + j) * 3;
        pos[k] = p.x; pos[k + 1] = terrainHeight(p.x, p.z) - tuck; pos[k + 2] = p.z;
        c.copy(a).lerp(b, groundShade(p.x, p.z));
        col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
        if (i < n - 1 && j < m - 1) { const q = i * m + j; idx.push(q, q + 1, q + m, q + 1, q + m + 1, q + m); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, patchMat);
    mesh.receiveShadow = true;
    return mesh;
  }
  // The road: the shared dirt ribbon with a vertex tint per candle
  function buildRoad() {
    const closes = ridgeSeries().closes.slice(-RIDGE.candles);
    while (closes.length && closes.length < RIDGE.candles) closes.unshift(closes[0]);
    const dirAt = (s) => { const i = candleIndex(s, r.len); return i < 0 || closes.length < 2 ? 0 : candleDir(closes[i - 1] ?? closes[i], closes[i]); };
    const colourAt = (s) => {
      const d = (dirAt(s - BLEND) + dirAt(s) + dirAt(s + BLEND)) / 3; // −1..1, soft across boundaries and the run-ins
      if (!d) return [1, 1, 1];
      const t = d > 0 ? UP : DOWN, k = Math.abs(d) * TINT;
      return [1 + (t.r - 1) * k, 1 + (t.g - 1) * k, 1 + (t.b - 1) * k];
    };
    const mesh = new THREE.Mesh(roadRibbon(r, colourAt), roadMat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    return mesh;
  }
  // The posts: built once at the right verge, their height follows the ridge on refresh
  const seg = (r.len - 2 * RIDGE.run) / RIDGE.candles;
  const posts = LABELS.map((text, k) => {
    const s = k < 4 ? RIDGE.run + k * 6 * seg : r.len - RIDGE.run, p = at(s, r.half + 1.2);
    const post = markKeep(new THREE.Group()); // rises and falls with the ridge: kept out of the geometry merge (merge.js)
    post.position.set(p.x, 0, p.z);
    post.rotation.y = Math.atan2(p.tx, p.tz);
    post.add(box(0.22, 1.35, 0.22, accent(districts().analytics.colour), 0, 0, 0));
    const { tex, redraw } = canvasTexture(256, 96, (ctx, w, h, q) => {
      ctx.fillStyle = q.panel; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = q.text; ctx.font = "600 56px 'Atkinson Hyperlegible Next', Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2 + 2);
    });
    redraws.push(redraw);
    for (const [z, ry] of [[-0.015, Math.PI], [0.015, 0]]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      plane.position.set(0, 1.58, z); plane.rotation.y = ry; post.add(plane);
    }
    post.userData.s = s;
    g.add(post);
    return post;
  });
  function placePosts() { for (const post of posts) { post.position.y = terrainHeight(post.position.x, post.position.z); moved(post); } } // frozen with the world (freeze.js): composed again when the ridge moves

  function refresh() {
    for (const o of [...dyn.children]) { dyn.remove(o); o.geometry.dispose(); }
    dyn.add(buildPatch(), buildRoad());
    freezeStatic(dyn); // laid once, never moved
    placePosts();
  }
  g.userData = { refresh, recolour: (p) => { pal = p; roadMat.color.set(p.dirt); refresh(); } };
  roadMat.color.set(pal.dirt);
  refresh();
  scene.add(g);
  return g;
}
