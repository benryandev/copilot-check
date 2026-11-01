// Grass that sways in the wind (vertex shader, instanced) and dust kicked up on dirt (pooled points).

import * as THREE from "../vendor/three.module.min.js";
import { WORLD, terrainHeight, grassWeight, roadInfo } from "./terrain.js";

// ── Grass ──────────────────────────────────────────────────────────────
function clumpGeometry() {
  // Five tapered blades, each two segments tall, merged into one geometry
  const pos = [];
  const h = [];
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + Math.random() * 0.6;
    const r = 0.12 + Math.random() * 0.15;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const height = 0.55 + Math.random() * 0.45;
    const w = 0.07;
    const dx = Math.cos(a + Math.PI / 2) * w, dz = Math.sin(a + Math.PI / 2) * w;
    const lean = 0.12 + Math.random() * 0.12;
    const lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    const p0 = [cx - dx, 0, cz - dz], p1 = [cx + dx, 0, cz + dz];
    const m0 = [cx - dx * 0.6 + lx * 0.4, height * 0.55, cz - dz * 0.6 + lz * 0.4];
    const m1 = [cx + dx * 0.6 + lx * 0.4, height * 0.55, cz + dz * 0.6 + lz * 0.4];
    const tip = [cx + lx, height, cz + lz];
    pos.push(...p0, ...p1, ...m1, ...p0, ...m1, ...m0, ...m0, ...m1, ...tip);
    h.push(0, 0, 0.55, 0, 0.55, 0.55, 0.55, 0.55, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aH", new THREE.Float32BufferAttribute(h, 1));
  g.computeVertexNormals();
  // Point all normals up so blades shade like the ground, not like flat cards
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export function createGrass(count, palette, sway) {
  const geo = clumpGeometry();
  const uniforms = { uTime: { value: 0 }, uSway: { value: sway ? 1 : 0 }, uBase: { value: new THREE.Color() }, uTip: { value: new THREE.Color() } };
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aH;\nuniform float uTime;\nuniform float uSway;\nvarying float vH;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vH = aH;
        vec3 ip = instanceMatrix[3].xyz;
        float gust = sin(uTime * 0.7 + ip.x * 0.05 + ip.z * 0.04) * 0.5 + 0.5;
        float w = sin(uTime * 2.1 + ip.x * 0.35 + ip.z * 0.27) * (0.08 + 0.14 * gust);
        transformed.x += w * aH * aH * uSway;
        transformed.z += w * 0.6 * aH * aH * uSway;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uBase;\nuniform vec3 uTip;\nvarying float vH;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( mix(uBase, uTip, vH) * diffuse, opacity );");
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let placed = 0, tries = 0;
  const R = WORLD.radius - 22;
  while (placed < count && tries < count * 12) {
    tries++;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
    const x = WORLD.cx + Math.cos(a) * r, z = WORLD.cz + Math.sin(a) * r;
    const g = grassWeight(x, z);
    if (g < 0.35) continue;
    // Denser near roads, where the camera mostly looks
    const near = Math.exp(-Math.min(90, roadInfo(x, z, 60).d) / 30);
    if (Math.random() > 0.25 + 0.75 * near) continue;
    p.set(x, terrainHeight(x, z) - 0.02, z);
    q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
    const k = 0.8 + Math.random() * 0.7;
    s.set(k, k * (0.8 + Math.random() * 0.5), k);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    tint.setScalar(0.85 + Math.random() * 0.3);
    mesh.setColorAt(placed, tint);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.recolour = (pal) => { uniforms.uBase.value.set(pal.grassBase); uniforms.uTip.value.set(pal.grassTip); };
  mesh.userData.recolour(palette);
  mesh.userData.tick = (t) => (uniforms.uTime.value = t);
  return mesh;
}

// ── Dust ───────────────────────────────────────────────────────────────
function puffTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createDust(max, palette) {
  const pos = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  const uniforms = { uMap: { value: puffTexture() }, uColour: { value: new THREE.Color() }, uScale: { value: 300 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
        vA = aAlpha;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uColour; varying float vA;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(uColour, t.a * vA);
        if (gl_FragColor.a < 0.01) discard;
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const parts = Array.from({ length: max }, () => ({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
  let next = 0;

  function emit(x, y, z, vx, vy, vz, s, life) {
    const p = parts[next];
    next = (next + 1) % max;
    Object.assign(p, { x, y, z, vx, vy, vz, s, life, max: life });
  }

  function step(dt) {
    for (let i = 0; i < max; i++) {
      const p = parts[i];
      if (p.life <= 0) { alpha[i] = 0; pos[i * 3 + 1] = -99; continue; }
      p.life -= dt;
      const k = Math.exp(-dt * 2.5);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k + 0.4 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const age = 1 - p.life / p.max;
      pos.set([p.x, p.y, p.z], i * 3);
      size[i] = p.s * (0.6 + age * 1.6);
      alpha[i] = Math.min(1, age * 6) * (1 - age) * 0.7;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  points.userData = {
    emit,
    step,
    setScale: (h) => (uniforms.uScale.value = h * 0.6),
    recolour: (pal) => uniforms.uColour.value.set(pal.dust),
  };
  points.userData.recolour(palette);
  return points;
}

// ── Fireworks: a new #1 on the Raceway ───────────────────────────────
// Rockets rise from around a point in the distance and burst into coloured sparks that drift down. Points with a
// per-particle colour; no fog, so they read from far off. Nothing is drawn until launch() is called.
const FIREWORK_COLOURS = [0xffd166, 0x26fab0, 0xff6b9d, 0x5ad8ff, 0xffffff, 0xff9f43];
const FW_G = 10; // m/s²: slower than real gravity, so the sparks hang
export function createFireworks(max = 1400) {
  const pos = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max), col = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute("aColour", new THREE.BufferAttribute(col, 3));
  const uniforms = { uMap: { value: puffTexture() }, uScale: { value: 300 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColour; uniform float uScale; varying float vA; varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
        vA = aAlpha; vC = aColour;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying float vA; varying vec3 vC;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vC, t.a * vA);
        if (gl_FragColor.a < 0.01) discard;
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  const parts = Array.from({ length: max }, () => ({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, s: 1, r: 1, g: 1, b: 1, rocket: false, drag: 1, flicker: 0 }));
  let next = 0, rockets = [], anyLive = false;
  const tmp = new THREE.Color();
  const rnd = (a, b) => a + Math.random() * (b - a);

  function emit(o) {
    const p = parts[next];
    next = (next + 1) % max;
    Object.assign(p, { rocket: false, drag: 1, flicker: 0, ...o, max: o.life });
    anyLive = true;
  }
  function burst(p) {
    const n = Math.round(rnd(80, 110));
    for (let i = 0; i < n; i++) {
      // Even over the sphere, with a little bias upward so the shape opens
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), v = rnd(8, 16);
      const white = Math.random() < 0.18;
      emit({ x: p.x, y: p.y, z: p.z, vx: r * Math.cos(a) * v, vy: u * v + 2, vz: r * Math.sin(a) * v, s: rnd(1.4, 2.2), life: rnd(1.5, 2.3),
        r: white ? 1 : p.r, g: white ? 1 : p.g, b: white ? 1 : p.b, drag: 1.1, flicker: rnd(6, 11) });
    }
  }
  /** Rockets from around (cx, cz) at ground height cy, spread along the right vector (rx, rz) and its normal. */
  function launch(cx, cy, cz, { rx = 1, rz = 0, count = 6 } = {}) {
    const delays = [0, 0.55, 0.95, 1.5, 1.95, 2.6, 3.1, 3.5];
    for (let i = 0; i < count; i++) {
      const side = rnd(-30, 30), along = rnd(-14, 14);
      rockets.push({ at: delays[i % delays.length] + (i >= delays.length ? 3.8 : 0), x: cx + rx * side - rz * along, y: cy, z: cz + rz * side + rx * along, colour: FIREWORK_COLOURS[(Math.random() * FIREWORK_COLOURS.length) | 0] });
    }
    anyLive = true;
  }
  let clock = 0;
  function step(dt) {
    if (!anyLive) return;
    clock += dt;
    if (rockets.length) {
      const due = rockets.filter((k) => k.at <= clock);
      if (due.length) {
        rockets = rockets.filter((k) => k.at > clock);
        for (const k of due) {
          tmp.set(k.colour);
          emit({ x: k.x, y: k.y, z: k.z, vx: rnd(-1.5, 1.5), vy: rnd(25, 28), vz: rnd(-1.5, 1.5), s: 1.1, life: rnd(1.4, 1.6), r: tmp.r, g: tmp.g, b: tmp.b, rocket: true, drag: 0 });
        }
      }
      if (!rockets.length) clock = 0;
    }
    let live = rockets.length > 0;
    for (let i = 0; i < max; i++) {
      const p = parts[i];
      if (p.life <= 0) { alpha[i] = 0; pos[i * 3 + 1] = -99; continue; }
      p.life -= dt;
      if (p.rocket) {
        // A faint trail, then the burst when the fuse runs out
        if (Math.random() < 0.6) emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-0.6, 0.6), vy: rnd(-2, 0), vz: rnd(-0.6, 0.6), s: 0.55, life: 0.35, r: 1, g: 0.9, b: 0.7 });
        if (p.life <= 0) { burst(p); alpha[i] = 0; pos[i * 3 + 1] = -99; continue; }
      }
      live = true;
      const k = Math.exp(-dt * p.drag);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - FW_G * dt * (p.rocket ? 1 : 0.7);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const age = 1 - p.life / p.max;
      pos.set([p.x, p.y, p.z], i * 3);
      col.set([p.r, p.g, p.b], i * 3);
      size[i] = p.rocket ? p.s : p.s * (1 - age * 0.5);
      const tw = p.flicker ? 0.75 + 0.25 * Math.sin(clock * p.flicker + i) : 1;
      alpha[i] = (p.rocket ? 0.9 : Math.min(1, age * 8) * (1 - age * age)) * tw;
    }
    anyLive = live;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aColour.needsUpdate = true;
  }
  points.userData = {
    launch, step,
    active: () => anyLive,
    skip: (sec) => { for (let t = 0; t < sec; t += 1 / 30) step(1 / 30); }, // test hook: run ahead so a still shows the bursts
    setScale: (h) => (uniforms.uScale.value = h * 0.6),
  };
  return points;
}
