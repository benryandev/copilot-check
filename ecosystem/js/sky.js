// The sky: big low-poly clouds by day (light theme) and a dome of twinkling stars by night (dark
// theme), with the odd shooting star. Both ride along with the camera so they never run out, and
// the clouds drift on a slow wind. One instanced mesh for every cloud, one Points for the stars,
// one for the shooting star's trail. Reduced motion: clouds hold still, stars don't twinkle, and
// there are no shooting stars.

import * as THREE from "../vendor/three.module.min.js";

const CLOUDS = 30, PUFFS = 10, CLOUD_RANGE = 250; // clouds within this of the camera, wrapping round
// Low enough to sit in the band of sky the driving camera sees (its top edge is about 12° up),
// high enough to clear the tallest building (HQ's orb, 16 m) by a long way
const CLOUD_MIN_Y = 26, CLOUD_MAX_Y = 50;
const WIND = { x: 0.9, z: 0.35 }; // m/s
const STARS = 1100, DOME_R = 300; // inside the camera's far plane (320)
const SHOOT_EVERY = [20, 45], SHOOT_LIFE = 0.9; // seconds

const rand = (a, b) => a + Math.random() * (b - a);

// ── Clouds ─────────────────────────────────────────────────────────────
// Each cloud is a cluster of PUFFS flattened spheres of different sizes: wide, with a flatter
// underside, like a cumulus. Built once in a local frame; the instance matrices move with the wind.
function buildClouds(reduceMotion) {
  const geo = new THREE.SphereGeometry(1, 10, 7);
  // Out of the fog (it would swallow anything past 100 m, and the sky is the fog's colour); the lambert
  // shading gives them bright tops and a shaded underside against the pale sky
  // Mostly self-lit (from below you see a cloud's shaded side), with lambert on top for a bright crown
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, CLOUDS * PUFFS);
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const clouds = [];
  for (let i = 0; i < CLOUDS; i++) {
    const span = rand(16, 30), h = rand(CLOUD_MIN_Y, CLOUD_MAX_Y), big = rand(8, 15);
    const puffs = [];
    for (let k = 0; k < PUFFS; k++) {
      const u = k / (PUFFS - 1) - 0.5; // along the cloud
      const r = big * (0.7 + 0.3 * Math.cos(u * Math.PI)) * rand(0.9, 1.08);
      // Close-packed so they merge into one body, flat underneath, a few riding higher on top
      puffs.push({ x: u * span * 1.6 + rand(-1.5, 1.5), y: r * 0.18 + (k % 3 === 1 ? r * 0.35 : 0), z: rand(-span * 0.2, span * 0.2), r, sy: rand(0.5, 0.66) });
    }
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * CLOUD_RANGE;
    clouds.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: h, yaw: Math.random() * Math.PI, puffs });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  function place() {
    let i = 0;
    for (const c of clouds) {
      q.setFromAxisAngle(up, c.yaw);
      const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      for (const f of c.puffs) {
        p.set(c.x + f.x * cos + f.z * sin, c.y + f.y, c.z - f.x * sin + f.z * cos);
        s.set(f.r, f.r * f.sy, f.r * 0.9);
        m.compose(p, q, s);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  place();
  // Drift with the wind; a cloud that falls too far behind the camera comes round ahead of it
  function tick(dt, cam) {
    if (!reduceMotion) for (const c of clouds) { c.x += WIND.x * dt; c.z += WIND.z * dt; }
    let moved = !reduceMotion;
    for (const c of clouds) {
      const dx = c.x - cam.x, dz = c.z - cam.z;
      if (dx * dx + dz * dz > CLOUD_RANGE * CLOUD_RANGE) {
        // Across to the far side, with a little scatter so they don't come back in a line
        const d = Math.hypot(dx, dz);
        c.x = cam.x - (dx / d) * CLOUD_RANGE * rand(0.86, 0.98) + rand(-20, 20);
        c.z = cam.z - (dz / d) * CLOUD_RANGE * rand(0.86, 0.98) + rand(-20, 20);
        moved = true;
      }
    }
    if (moved) place();
  }
  // Move every cloud within r of the segment a→b to the far side of b, out of a camera's path (the arrival flies
  // in above the cloud layer and would otherwise look down through a cloud)
  function clear(ax, az, bx, bz, r) {
    const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz || 1;
    for (const c of clouds) {
      const t = Math.max(0, Math.min(1, ((c.x - ax) * vx + (c.z - az) * vz) / len2));
      const dx = c.x - (ax + vx * t), dz = c.z - (az + vz * t);
      if (dx * dx + dz * dz > r * r) continue;
      const a = Math.atan2(vz, vx) + rand(-0.9, 0.9), far = rand(r * 1.2, CLOUD_RANGE * 0.9);
      c.x = bx + Math.cos(a) * far;
      c.z = bz + Math.sin(a) * far;
    }
    place();
  }
  return { mesh, tick, clear };
}

// ── Stars ──────────────────────────────────────────────────────────────
// A dome of points that follows the camera. Each star has its own size and twinkle phase; a few
// are warm or cool rather than white. No fog on them (the fog would swallow the horizon's).
function buildStars(reduceMotion) {
  const pos = new Float32Array(STARS * 3), size = new Float32Array(STARS), phase = new Float32Array(STARS), col = new Float32Array(STARS * 3);
  const c = new THREE.Color();
  for (let i = 0; i < STARS; i++) {
    // Even over the dome, thinner near the horizon so the hills don't fight a ring of stars
    const u = Math.random(), v = Math.random();
    const alt = Math.asin(0.06 + 0.94 * u), az = v * Math.PI * 2; // 3.4° up to the zenith
    const r = DOME_R * rand(0.94, 1);
    pos.set([Math.cos(alt) * Math.cos(az) * r, Math.sin(alt) * r, Math.cos(alt) * Math.sin(az) * r], i * 3);
    const bright = Math.random();
    size[i] = bright > 0.97 ? rand(3.2, 4.2) : bright > 0.8 ? rand(2.1, 2.9) : rand(1.2, 1.9);
    phase[i] = Math.random() * Math.PI * 2;
    const tint = Math.random();
    c.set(tint > 0.93 ? 0xffd9a8 : tint > 0.86 ? 0xbfd8ff : 0xffffff);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("aColour", new THREE.BufferAttribute(col, 3));
  const uniforms = { uTime: { value: 0 }, uTwinkle: { value: reduceMotion ? 0 : 1 }, uScale: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aSize; attribute float aPhase; attribute vec3 aColour;
      uniform float uTime; uniform float uTwinkle; uniform float uScale;
      varying float vA; varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.72 + 0.28 * sin(uTime * (1.3 + aPhase * 0.3) + aPhase * 7.0);
        vA = mix(0.9, tw, uTwinkle);
        vC = aColour;
        gl_PointSize = aSize * uScale;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        float a = smoothstep(1.0, 0.35, r);
        gl_FragColor = vec4(vC, a * vA);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -2;
  return { points, uniforms };
}

// ── Shooting stars ─────────────────────────────────────────────────────
// A short bright head with a fading trail of a dozen points, crossing part of the dome in under a
// second. Every 20 to 45 s while it's night.
const TRAIL = 24;
function buildShooter() {
  const pos = new Float32Array(TRAIL * 3), alpha = new Float32Array(TRAIL), size = new Float32Array(TRAIL);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const uniforms = { uScale: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
      void main() { vA = aAlpha; gl_PointSize = aSize * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying float vA;
      void main() { float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(1.0, 0.2, r) * vA); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -1;
  points.visible = false;
  const state = { next: rand(6, 18), t: -1, from: new THREE.Vector3(), to: new THREE.Vector3() }; // the first one comes soon
  const onDome = (alt, az) => new THREE.Vector3(Math.cos(alt) * Math.cos(az), Math.sin(alt), Math.cos(alt) * Math.sin(az)).multiplyScalar(DOME_R * 0.97);
  function launch() {
    // High in the sky, heading down and across; 25° to 45° of arc
    const az = Math.random() * Math.PI * 2, alt = rand(0.6, 1.2);
    const daz = rand(0.35, 0.65) * (Math.random() < 0.5 ? -1 : 1), dalt = -rand(0.3, 0.5);
    state.from.copy(onDome(alt, az));
    state.to.copy(onDome(Math.max(0.15, alt + dalt), az + daz));
    state.t = 0;
    points.visible = true;
  }
  const head = new THREE.Vector3();
  function tick(dt) {
    if (state.t < 0) {
      state.next -= dt;
      if (state.next <= 0) { state.next = rand(SHOOT_EVERY[0], SHOOT_EVERY[1]); launch(); }
      return;
    }
    state.t += dt;
    const k = state.t / SHOOT_LIFE;
    if (k >= 1) { state.t = -1; points.visible = false; return; }
    // Fade in fast, out over the second half
    const glow = Math.min(1, k * 6) * (k < 0.5 ? 1 : 1 - (k - 0.5) * 2);
    for (let i = 0; i < TRAIL; i++) {
      const kk = Math.max(0, k - i * 0.009); // the trail covers about a fifth of the arc
      head.lerpVectors(state.from, state.to, kk);
      pos.set([head.x, head.y, head.z], i * 3);
      alpha[i] = glow * (i === 0 ? 1 : 0.85 * (1 - i / TRAIL));
      size[i] = i === 0 ? 9 : 6.5 * (1 - i / TRAIL) + 1.2;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }
  return { points, uniforms, tick };
}

// ── The sky ────────────────────────────────────────────────────────────
export function createSky({ reduceMotion = false } = {}) {
  const group = new THREE.Group();
  const clouds = buildClouds(reduceMotion);
  const stars = buildStars(reduceMotion);
  const shooter = reduceMotion ? null : buildShooter();
  const dome = new THREE.Group(); // stars and shooting stars ride with the camera
  dome.add(stars.points);
  if (shooter) dome.add(shooter.points);
  group.add(clouds.mesh, dome);
  let night = false;
  const apply = () => {
    clouds.mesh.visible = !night;
    dome.visible = night;
  };
  apply();
  group.userData = {
    setNight(v) { night = v; apply(); },
    clearClouds: clouds.clear,
    // Point sizes are in pixels: scale them with the device pixel ratio so stars match on a phone
    setScale(ratio) { stars.uniforms.uScale.value = ratio; if (shooter) shooter.uniforms.uScale.value = ratio; },
    tick(t, dt, cam) {
      dome.position.copy(cam);
      if (night) {
        stars.uniforms.uTime.value = t;
        shooter?.tick(dt);
      } else clouds.tick(dt, cam);
    },
  };
  return group;
}
