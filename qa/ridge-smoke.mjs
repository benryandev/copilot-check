// Chart Ridge under the wheels: the car drives the chart end to end, both ways, at 24 m/s, on the steepest day the
// scale allows and on a flat one, without stopping against a step or flying off a crest. Drives the car's own physics
// (stepCar) in the page at a fixed 60 Hz. Needs the site on http://localhost:8766 (PORT=8766 node qa/serve.mjs).
// Usage: node qa/ridge-smoke.mjs [siteBase]
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8766';
const fail = (m) => { console.log(`FAIL ridge smoke: ${m}`); process.exit(1); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
page.on('pageerror', (e) => console.log('  page error', String(e).split('\n')[0]));
await page.goto(`${base}/ecosystem/?arrive=0&mp=0&sound=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
await page.click('#start');

const SAW = Array.from({ length: 24 }, (_, i) => (i % 2 ? 80000 : 78000)); // every hour a full-range step: the profile scales it to the slope cap
const FLAT = Array(24).fill(79000);

// Drive the ridge from one end to the other with the throttle held, steering to the road each frame
const drive = (series, reverse) => page.evaluate(async ({ series, reverse }) => {
  const T = await import('/ecosystem/js/terrain.js');
  const { stepCar } = await import('/ecosystem/js/car.js');
  const e = window.__eco, car = e.car, s = car.s, r = T.roads[T.RIDGE_ROAD];
  e.ridge.set(series);
  const dirSign = reverse ? -1 : 1, s0 = reverse ? r.len - 10 : 10;
  const p = r.curve.getPointAt(s0 / r.len), t = r.curve.getTangentAt(s0 / r.len);
  Object.assign(s, { x: p.x, z: p.z, heading: Math.atan2(-t.x * dirSign, -t.z * dirSign), speed: 24, steer: 0, vy: 0, air: false, boost: 0, wet: false, airTime: 0 });
  s.y = T.groundHeight(s.x, s.z);
  const out = { minSpeed: Infinity, maxAir: 0, stopped: false, past: 0, frames: 0, maxLift: 0 };
  let airRun = 0;
  for (let i = 0; i < 20 * 60; i++) {
    const ri = T.roadInfo(s.x, s.z, 12);
    if (!s.air && ri.road === T.RIDGE_ROAD) s.heading = Math.atan2(-ri.tx * dirSign, -ri.tz * dirSign);
    stepCar(car, { up: true, down: false, left: false, right: false }, 1 / 60);
    out.frames = i + 1;
    if (i > 30 && !s.air) out.minSpeed = Math.min(out.minSpeed, s.speed);
    airRun = s.air ? airRun + 1 : 0;
    out.maxAir = Math.max(out.maxAir, airRun / 60);
    out.maxLift = Math.max(out.maxLift, s.y);
    const along = ri.road === T.RIDGE_ROAD ? ri.t * r.len : null;
    if (along != null) out.past = reverse ? r.len - along : along;
    if (i > 30 && s.speed < 1) { out.stopped = true; break; }
    if (out.past >= r.len - 5) break;
  }
  out.len = +r.len.toFixed(1); out.scale = +T.ridgeSeries().profile?.scale.toFixed(2);
  return out;
}, { series, reverse });

for (const [name, series] of [['saw', SAW], ['flat', FLAT]]) {
  for (const reverse of [false, true]) {
    const o = await drive(series, reverse);
    const tag = `${name} ${reverse ? 'back' : 'out'}`;
    console.log(`     ${tag}`, JSON.stringify(o));
    if (o.stopped) fail(`${tag}: the car stopped on the ridge`);
    if (!(o.past >= o.len - 6)) fail(`${tag}: did not reach the far end (past ${o.past.toFixed(1)} of ${o.len})`);
    if (!(o.minSpeed > 12)) fail(`${tag}: slowed to ${o.minSpeed.toFixed(1)} m/s`);
    if (!(o.maxAir < 0.6)) fail(`${tag}: flew for ${o.maxAir.toFixed(2)} s off a crest`);
  }
}
console.log('ok   ridge smoke');
await browser.close();
