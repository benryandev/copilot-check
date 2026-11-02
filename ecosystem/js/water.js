// The river's looks: a fine riverbed patch (the ground mesh is too coarse to show a 7 m channel), the water
// surface with flowing ripples and bank foam, and the wooden bridges. Where the water is and how deep lives in
// terrain.js; this file only draws it.

import * as THREE from "../vendor/three.module.min.js";
import { river, riverInfo, terrainHeight, groundShade, WATER_LEVEL, crossings, DECK_Y, DECK_RAMP } from "./terrain.js";
import { RIVER } from "./content.js";
import { M, box, cyl, canvasTexture, redraws, colliders, orientedBox } from "./build.js";

const BED_W = RIVER.half + 14; // half-width of the bed patch: wide enough to cover the ground mesh's pushed-down band and the triangles beside it
const BED_ACROSS = 15; // samples across the patch
const WATER_W = RIVER.half + 0.8; // the surface tucks under the banks

// Sweep a strip of `across` samples along the river; `at(x, z, u)` gives the height, u is -1..1 across
function sweep(halfW, across, at) {
  const n = river.pts.length;
  const verts = new Float32Array(n * across * 3), uvs = new Float32Array(n * across * 2), idx = [];
  const frames = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = river.pts[i];
    const [ax, az] = river.pts[Math.max(0, i - 1)], [bx, bz] = river.pts[Math.min(n - 1, i + 1)];
    const tx = bx - ax, tz = bz - az, l = Math.hypot(tx, tz);
    const nx = -tz / l, nz = tx / l;
    frames.push({ x, z, nx, nz });
    for (let k = 0; k < across; k++) {
      const u = (k / (across - 1)) * 2 - 1;
      const px = x + nx * halfW * u, pz = z + nz * halfW * u;
      const o = (i * across + k) * 3;
      verts[o] = px; verts[o + 1] = at(px, pz, u); verts[o + 2] = pz;
      uvs[(i * across + k) * 2] = k / (across - 1); uvs[(i * across + k) * 2 + 1] = river.cum[i] / 4;
      if (i < n - 1 && k < across - 1) {
        const a = i * across + k, b = a + 1, c = a + across, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, frames };
}

/** The riverbed: analytic heights at a fine spacing, mud in the channel, the ground's own grass colour outside it. */
export function buildRiverBed(palette) {
  const { geo } = sweep(BED_W, BED_ACROSS, (x, z) => terrainHeight(x, z));
  const pos = geo.attributes.position;
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.recolour = (p) => {
    const a = new THREE.Color(p.grassA), b = new THREE.Color(p.grassB), mud = new THREE.Color(p.mud), c = new THREE.Color();
    const col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      c.copy(a).lerp(b, groundShade(x, z));
      const d = riverInfo(x, z, RIVER.half + 4).d;
      const wet = 1 - THREE.MathUtils.smoothstep(d, RIVER.half - 0.4, RIVER.half + 1.2);
      c.lerp(mud, wet);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  };
  mesh.userData.recolour(palette);
  return mesh;
}

// A tileable value-noise texture painted once
function noiseTexture(size = 256, cells = 12) {
  const g = [];
  for (let j = 0; j < cells; j++) { g.push([]); for (let i = 0; i < cells; i++) g[j].push(Math.random()); }
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d"), img = ctx.createImageData(size, size);
  const ease = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cells;
    const sx = ease(fx - i0), sy = ease(fy - j0);
    const v = (g[j0][i0] * (1 - sx) + g[j0][i1] * sx) * (1 - sy) + (g[j1][i0] * (1 - sx) + g[j1][i1] * sx) * sy;
    const o = (y * size + x) * 4, b = Math.round(v * 255);
    img.data[o] = img.data[o + 1] = img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * The water surface. Medium and High: an unlit shader with two noise layers scrolling downstream and foam at the
 * banks, under the bloom threshold in both themes. Low: a flat tinted plane. Still under reduced motion.
 */
export function buildWater(palette, { tier = "high", reduceMotion = false } = {}) {
  const { geo } = sweep(WATER_W, 2, () => WATER_LEVEL);
  const simple = tier === "low";
  let mat, uniforms = null;
  if (simple) {
    mat = new THREE.MeshLambertMaterial({ color: palette.water, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  } else {
    uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uFlow: { value: RIVER.flow }, uNoise: { value: null },
      uWater: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() },
    }]);
    uniforms.uNoise.value = noiseTexture();
    mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime, uFlow; uniform sampler2D uNoise; uniform vec3 uWater, uDeep, uFoam;
        varying vec2 vUv;
        void main() {
          float v = vUv.y; // metres / 4 along the river
          float n1 = texture2D(uNoise, vec2(vUv.x * 0.6 + sin(v * 3.0) * 0.05, v * 0.35 - uTime * uFlow * 0.09)).r;
          float n2 = texture2D(uNoise, vec2(vUv.x * 1.3 + 0.37, v * 0.7 - uTime * uFlow * 0.05)).r;
          float ripple = mix(n1, n2, 0.5);
          vec3 col = mix(uDeep, uWater, ripple);
          float bank = smoothstep(0.38, 0.5, abs(vUv.x - 0.5));
          float foam = bank * smoothstep(0.5, 0.62, n1);
          col = mix(col, uFoam, foam * 0.85);
          gl_FragColor = vec4(col, 0.82 + 0.12 * foam);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1; // after the opaque world, before the dust
  mesh.userData.recolour = (p) => {
    if (simple) mat.color.set(p.water);
    else { uniforms.uWater.value.set(p.water); uniforms.uDeep.value.set(p.waterDeep); uniforms.uFoam.value.set(p.foam); }
  };
  mesh.userData.recolour(palette);
  mesh.userData.tick = (t) => { if (uniforms && !reduceMotion) uniforms.uTime.value = t; };
  return mesh;
}

// ── Bridges ────────────────────────────────────────────────────────────
// A plank deck over each bridged crossing, rails you cannot drive through, piles into the water and a short ramp at
// each end. Cosmetic only: the height the car rides is terrain.js bridgeHeight, which these match.
const WOOD_W = 256, WOOD_H = 256;
function planks(ctx, w, h, pal) {
  const base = new THREE.Color(pal.wood), dark = base.clone().multiplyScalar(0.72), light = base.clone().multiplyScalar(1.12);
  ctx.fillStyle = "#" + base.getHexString();
  ctx.fillRect(0, 0, w, h);
  const n = 12, ph = h / n; // planks run across the deck; the texture repeats along it
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = "#" + (i % 3 === 1 ? light : i % 3 === 2 ? dark : base).clone().offsetHSL(0, 0, ((i * 7) % 5) * 0.012 - 0.024).getHexString();
    ctx.fillRect(0, i * ph + 2, w, ph - 4);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, i * ph, w, 2);
    // a nail at each end
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(10, i * ph + ph / 2 - 2, 4, 4); ctx.fillRect(w - 14, i * ph + ph / 2 - 2, 4, 4);
  }
}
export function buildBridges(scene, palette) {
  const group = new THREE.Group();
  const { tex, redraw } = canvasTexture(WOOD_W, WOOD_H, planks);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  redraws.push(redraw);
  redraw(palette);
  const deckMat = new THREE.MeshLambertMaterial({ map: tex });
  const built = [];
  for (const c of crossings) {
    if (!c.bridge) continue;
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    g.rotation.y = c.yaw; // local +z runs along the road
    const W = c.halfW * 2, L = c.halfLen * 2;
    const deck = box(W, DECK_Y, L, deckMat, 0, 0, 0);
    deck.material = deckMat.clone(); deck.material.map = tex.clone(); deck.material.map.repeat.set(1, L / 4); deck.material.map.needsUpdate = true;
    g.add(deck);
    // ramps: a thin slab from the deck top down to the ground over DECK_RAMP
    const hyp = Math.hypot(DECK_RAMP, DECK_Y), tilt = Math.atan2(DECK_Y, DECK_RAMP);
    for (const side of [-1, 1]) {
      const ramp = box(W, 0.06, hyp, deckMat, 0, 0, 0);
      ramp.position.set(0, DECK_Y / 2 - 0.03, side * (c.halfLen + DECK_RAMP / 2));
      ramp.rotation.x = side * tilt;
      g.add(ramp);
    }
    // rails: posts every 1.5 m and a top rail, on both edges; their colliders keep the car on the deck
    const rx = c.halfW - 0.1;
    for (const side of [-1, 1]) {
      g.add(box(0.1, 0.1, L, M.wood, side * rx, DECK_Y + 0.85, 0));
      g.add(box(0.08, 0.06, L, M.wood, side * rx, DECK_Y + 0.45, 0));
      for (let z = -c.halfLen + 0.3; z <= c.halfLen - 0.3; z += 1.5) g.add(box(0.12, 0.95, 0.12, M.wood, side * rx, DECK_Y, z));
      const ox = side * rx; // the rail's centre in the world; orientedBox's local x runs along (cos yaw, -sin yaw)
      colliders.push(orientedBox(c.x + Math.cos(c.yaw) * ox, c.z - Math.sin(c.yaw) * ox, 0.12, c.halfLen - 0.6, c.yaw)); // the first 60 cm of rail is open, so a slightly wide approach slides on instead of stopping dead
    }
    // piles at the corners, down into the water
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.14, 1.3, M.wood, sx * (c.halfW - 0.35), -0.6, sz * (c.halfLen - 1.2), 8));
    group.add(g);
    built.push(g);
  }
  scene.add(group);
  return built;
}
