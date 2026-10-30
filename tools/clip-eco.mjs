// Render the ecosystem promo clip and the share image's background still. Needs `node qa/serve.mjs` running and
// ffmpeg. Uses Playwright, local or global as qa/shoot.mjs does.
//   node tools/clip-eco.mjs          → tools/out/eco-clip.mp4 (1080x1080, ~5 s) and tools/out/eco-clip.gif
//   node tools/clip-eco.mjs --still  → tools/og-eco-world.png (2400x1260), then run `node tools/og-eco.mjs`
// The world runs on a virtual clock (performance.now and requestAnimationFrame only move when the script steps
// them), so frames are evenly spaced however slowly the software renderer draws. The shot: the car approaches the
// Perpetuals jump in the chase camera, then a fixed low camera by the ramp pans with it through the leap (slowed)
// and the landing, with Strike HQ behind.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const STILL = process.argv.includes('--still');
const here = (p) => new URL(p, import.meta.url).pathname;
const JUMP = 0, BACK = 40; // the Perpetuals jump; start 40 m before it
const AIR = 61; // frame at which the car is mid-air (deterministic on the virtual clock)
// Fixed camera, relative to the car at AIR: ahead, right, up (metres). The still sits close; the clip's camera is
// further ahead and out to the side, so the car crosses in front of it instead of flying at it.
const CAM_STILL = { f: 9, r: -6, u: -0.8 }, CAM_CLIP = { f: 15, r: -10, u: -0.4 };
const CUT = 48, FRAMES = 100, SIZE = STILL ? [2400, 1260] : [1080, 1080];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function openWorld([w, h]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('eco-quality', 'high'); } catch {}
    // A frame still waiting on the real rAF when the clock switches is handed to the virtual queue, not lost.
    let now = 0, queue = [], live = true;
    const pending = new Set();
    const realRaf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
    performance.now = () => (live ? realNow() : now);
    window.requestAnimationFrame = (cb) => {
      if (!live) { queue.push(cb); return queue.length; }
      pending.add(cb);
      return realRaf((t) => { if (live && pending.delete(cb)) cb(t); });
    };
    window.__virtual = () => { now = realNow(); live = false; queue.push(...pending); pending.clear(); };
    window.__step = (ms) => { now += ms; const q = queue; queue = []; q.forEach((cb) => cb(now)); };
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8080/ecosystem/#light');
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
  await page.click('#start');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // models in
  await page.evaluate(async ({ JUMP, BACK }) => {
    document.querySelectorAll('.hud, .touch').forEach((e) => e.style.setProperty('display', 'none', 'important'));
    const { roads } = await import('/ecosystem/js/terrain.js');
    const e = window.__eco, j = e.jumps[JUMP], r = roads[j.road];
    // The ramp's lane: the road's centre line shifted to the ramp's side
    const lane = (t) => {
      const u = ((t % 1) + 1) % 1, q = r.curve.getPointAt(u), tan = r.curve.getTangentAt(u);
      const l = Math.hypot(tan.x, tan.z), off = j.side * (r.half - j.width / 2 - 0.2);
      return { x: q.x - (tan.z / l) * off, z: q.z + (tan.x / l) * off, fx: tan.x / l, fz: tan.z / l };
    };
    let t = j.t - BACK / r.len;
    const a = lane(t);
    Object.assign(e.car.s, { x: a.x, z: a.z, y: e.groundHeight(a.x, a.z), heading: Math.atan2(-a.fx, -a.fz), speed: 20, steer: 0, vy: 0, air: false });
    e.placeCamera(0, true);
    e.keys.up = true;
    // Autopilot: steer at a point 9 m along the lane and hold the lane while on the ground
    window.__auto = () => {
      const s = e.car.s;
      for (let k = 0; k < 40; k++) {
        const n = lane(t + 1 / r.len), c = lane(t);
        if (Math.hypot(n.x - s.x, n.z - s.z) < Math.hypot(c.x - s.x, c.z - s.z)) t += 1 / r.len; else break;
      }
      const aim = lane(t + 9 / r.len);
      let d = Math.atan2(-(aim.x - s.x), -(aim.z - s.z)) - s.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (!s.air) {
        s.heading += d * 0.3;
        const c = lane(t);
        s.x += (c.x - s.x) * 0.2; s.z += (c.z - s.z) * 0.2;
      }
    };
    window.__virtual();
  }, { JUMP, BACK });
  return page;
}
const step = (page, ms) => page.evaluate((ms) => { window.__auto(); window.__step(ms); }, ms);
// Put the fixed camera at CAM relative to the car state `at` and look `follow` of the way from the take-off spot
// towards the car (1 = locked on), offset sideways by lr and up by lu
const aimCamera = (page, at, CAM, { lr, lu, fov, follow = 1 }) => page.evaluate(({ at, CAM, lr, lu, fov, follow }) => {
  const e = window.__eco, s = e.car.s, cam = e.camera;
  const fx = -Math.sin(at.heading), fz = -Math.cos(at.heading), rx = -fz, rz = fx;
  e.overview(at.x + fx * CAM.f + rx * CAM.r, at.y + CAM.u, at.z + fz * CAM.f + rz * CAM.r, s.x, s.z);
  cam.far = 400; cam.fov = fov; cam.updateProjectionMatrix();
  const x = at.x + (s.x - at.x) * follow, y = at.y + (s.y - at.y) * follow, z = at.z + (s.z - at.z) * follow;
  cam.lookAt(x + rx * lr, y + lu, z + rz * lr);
}, { at, CAM, lr, lu, fov, follow });

// Where the car is at AIR, for placing the fixed camera
let page = await openWorld([540, 540]);
for (let i = 0; i < AIR; i++) await step(page, 1000 / 30);
const at = await page.evaluate(() => { const s = window.__eco.car.s; return { x: s.x, y: s.y, z: s.z, heading: s.heading }; });
await page.context().close();

page = await openWorld(SIZE);
if (STILL) {
  for (let i = 0; i < AIR; i++) await step(page, 1000 / 30);
  await aimCamera(page, at, CAM_STILL, { lr: -4.5, lu: 1.2, fov: 50 });
  await page.evaluate(() => window.__step(0));
  await page.screenshot({ path: here('./og-eco-world.png') });
  console.log('tools/og-eco-world.png written');
} else {
  const frames = here('./out/frames/');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  for (let i = 0; i < FRAMES; i++) {
    // Slow the leap: 0.4x from just before take-off until shortly after landing
    const slow = i >= CUT + 4 && i < CUT + 40;
    if (i >= CUT) await aimCamera(page, at, CAM_CLIP, { lr: 0, lu: 1.6, fov: 46, follow: 0.6 });
    await step(page, (1000 / 30) * (slow ? 0.4 : 1));
    await page.screenshot({ path: `${frames}f${String(i).padStart(4, '0')}.png` });
  }
  // Overlay: the share image's headline and address, on a transparent page
  const ov = await browser.newPage({ viewport: { width: SIZE[0], height: SIZE[1] } });
  await ov.goto(new URL('./clip-eco-overlay.html', import.meta.url).href);
  await ov.evaluate(() => document.fonts.ready);
  await ov.screenshot({ path: here('./out/overlay.png'), omitBackground: true });
  const o = here('./out/');
  execSync(`ffmpeg -y -loglevel error -framerate 30 -i ${frames}f%04d.png -i ${o}overlay.png -filter_complex "[0][1]overlay" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart ${o}eco-clip.mp4`);
  execSync(`ffmpeg -y -loglevel error -i ${o}eco-clip.mp4 -vf "fps=15,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" ${o}eco-clip.gif`);
  console.log('tools/out/eco-clip.mp4 and eco-clip.gif written');
}
await browser.close();
