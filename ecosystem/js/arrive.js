// The arrival. A loader that reports the build step by step (the world is generated, not downloaded, so each step
// is real work), then one slow pull-in from high over Strike HQ down to the chase camera while the car drops onto
// the road. Any key or tap skips it; it plays once per tab; reduced motion goes straight to the sheet.
import * as THREE from "../vendor/three.module.min.js";

const $ = (id) => document.getElementById(id);
// A frame and a tick, so the loader's new label is painted before the next build step blocks the thread
export const paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export function loader(total) {
  let n = 0;
  const bar = $("loader-bar"), text = $("loader-text");
  return {
    async step(label) {
      n++;
      text.textContent = label;
      bar.style.setProperty("--p", String(n / total));
      await paint();
    },
    done() { bar.style.setProperty("--p", "1"); },
  };
}

// Once per tab; ?arrive=1 forces it (clips), ?arrive=0 skips it; reduced motion skips it
export function wantsArrival() {
  const q = new URLSearchParams(location.search).get("arrive");
  if (q === "0") return false;
  if (q === "1") return true;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    if (sessionStorage.getItem("eco-arrived")) return false;
    sessionStorage.setItem("eco-arrived", "1");
  } catch {}
  return true;
}

const DURATION = 6; // s of flight time: wall clock, but a stall (shaders compiling on the first frame) counts for at most
const MAX_STEP = 0.25; // this much, so the opening is not skipped while the GPU warms up, and a slow machine still lands
const HOLD = 0.16; // the first slice of the flight drifts at the top so the title has the overview to itself
const START = { dist: 105, height: 88, yaw: 1.4 }; // high over the grass east of HQ; the way down is a quarter orbit that banks in behind the car (Builders' Row lines the Developers spoke south of HQ, so the south is not clear ground)
const FOG = { near: 170, far: 400 }; // the ordinary fog would hide HQ from up there; it closes back in on the way down
const DROP = { from: 0.3, to: 0.84, height: 70 }; // the car falls in from above the frame over this stretch of the eased flight
const TITLE = { in: 0.35, out: 3.3 }; // s
const NOKEYS = { up: false, down: false, left: false, right: false };
const cubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const ease = (u) => cubic(Math.max(0, (u - HOLD) / (1 - HOLD)));

export function startArrival({ camera, scene, sky, car, hq, chase, stepCar, settle, landed, onDone }) {
  const el = $("arrive");
  const fog = scene.fog, fog0 = fog ? { near: fog.near, far: fog.far } : null, far0 = camera.far;
  const s = car.s;
  const dx = chase.pos.x - s.x, dz = chase.pos.z - s.z;
  const back = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
  const hqLook = new THREE.Vector3(hq[0], 6, hq[1]);
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  let last = performance.now(), t = 0;
  let active = true, dropped = false, shown = false;

  document.body.classList.add("is-arriving");
  // Clouds sit at 26–50 m; the flight starts above them. Clear the corridor from the start point in to HQ.
  // The path is an arc: clear from its start and from its midpoint
  for (const [e, r] of [[0, 70], [0.5, 60]]) {
    const a = angle + START.yaw * (1 - e), d = back + (START.dist - back) * (1 - e);
    sky?.userData.clearClouds?.(s.x + Math.sin(a) * d, s.z + Math.cos(a) * d, hq[0], hq[1], r);
  }
  el.hidden = false;
  car.group.visible = false;
  camera.far = FOG.far + 40;
  camera.updateProjectionMatrix();

  const skip = (e) => {
    if (!active) return;
    if (e?.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    finish();
  };
  addEventListener("keydown", skip);
  addEventListener("pointerdown", skip);

  function finish() {
    active = false;
    removeEventListener("keydown", skip);
    removeEventListener("pointerdown", skip);
    if (fog && fog0) Object.assign(fog, fog0);
    camera.far = far0;
    camera.updateProjectionMatrix();
    car.group.visible = true;
    s.squash = 0;
    stepCar(car, NOKEYS, 0);
    settle();
    el.classList.remove("is-in");
    el.hidden = true;
    document.body.classList.remove("is-arriving");
    onDone();
  }

  function tick(dt) {
    if (!active) return;
    const now = performance.now();
    t += Math.min((now - last) / 1000, MAX_STEP);
    last = now;
    const u = Math.min(1, t / DURATION), e = ease(u);
    const a = angle + START.yaw * (1 - e), d = back + (START.dist - back) * (1 - e);
    pos.set(s.x + Math.sin(a) * d, chase.pos.y + (START.height - chase.pos.y) * (1 - e), s.z + Math.cos(a) * d);
    look.lerpVectors(hqLook, chase.look, e);
    camera.position.copy(pos);
    camera.lookAt(look);
    if (fog && fog0) {
      fog.near = FOG.near + (fog0.near - FOG.near) * e;
      fog.far = FOG.far + (fog0.far - FOG.far) * e;
    }
    // The car drops in under gravity's curve and lands with a squash and a puff; then it sits as it will in play
    const drop = Math.min(1, Math.max(0, (e - DROP.from) / (DROP.to - DROP.from)));
    if (e >= DROP.from) {
      if (!dropped && drop >= 1) {
        dropped = true;
        landed();
      }
      if (dropped) stepCar(car, NOKEYS, dt);
      else {
        car.group.visible = true;
        car.group.position.set(s.x, s.y + DROP.height * (1 - drop * drop), s.z);
      }
    }
    if (!shown && t > TITLE.in) { shown = true; el.classList.add("is-in"); }
    if (shown && t > TITLE.out) el.classList.remove("is-in");
    if (u >= 1) finish();
  }

  return { tick, skip: () => skip(), get active() { return active; }, progress: () => Math.min(1, t / DURATION) };
}
