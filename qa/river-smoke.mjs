// The river under the wheels: the ford slows and splashes, a bridge costs nothing, a jump into the ford pays no boost.
// Drives the car's own physics (stepCar) in the page at a fixed 60 Hz so software rendering's frame rate doesn't matter.
// Needs the site on http://localhost:8766 (PORT=8766 node qa/serve.mjs). Usage: node qa/river-smoke.mjs [siteBase]
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8766';
const fail = (m) => { console.log(`FAIL river smoke: ${m}`); process.exit(1); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
page.on('pageerror', (e) => console.log('  page error', String(e).split('\n')[0]));
await page.goto(`${base}/ecosystem/?arrive=0&mp=0&sound=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
await page.click('#start');

// Run `secs` of physics from `metres` before the crossing of road `to`, heading at it, and report what happened
const run = (to, opts) => page.evaluate(async ({ to, metres, speed, secs, air }) => {
  const T = await import('/ecosystem/js/terrain.js');
  const { stepCar } = await import('/ecosystem/js/car.js');
  const e = window.__eco, car = e.car, s = car.s;
  const c = T.crossings.find((c) => T.roads[c.road].kind === 'spoke' && T.roads[c.road].to === to);
  // Lined up with the road at the crossing, `metres` back along its heading (a driver following the road)
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), l = 1, p0 = { x: c.x - fx * metres, z: c.z - fz * metres };
  Object.assign(s, { x: p0.x, z: p0.z, heading: Math.atan2(-fx / l, -fz / l), speed, steer: 0, vy: 0, air: false, boost: 0, wet: false, airTime: 0 });
  s.y = T.groundHeight(s.x, s.z);
  if (air) { const back = speed * Math.sqrt((2 * air) / 30); s.x = c.x - fx * back; s.z = c.z - fz * back; s.y = T.groundHeight(s.x, s.z) + air; s.air = true; s.vy = 0; s.airTime = 0; } // falls under the car's own gravity (30) to land on the crossing
  const keys = { up: !air, down: false, left: false, right: false };
  const out = { minY: Infinity, maxWetSpeed: 0, exitSpeed: null, minDeckY: Infinity, minSpeed: Infinity, wetFrames: 0, splash: null, landed: null, boostAfterLanding: null, everOnBridge: false };
  for (let i = 0; i < secs * 60; i++) {
    const info = stepCar(car, keys, 1 / 60);
    const wet = T.onWater(s.x, s.z), bridge = T.onBridge(s.x, s.z);
    out.minY = Math.min(out.minY, s.y);
    if (wet) { out.wetFrames++; out.maxWetSpeed = Math.max(out.maxWetSpeed, Math.abs(s.speed)); out.exitSpeed = +Math.abs(s.speed).toFixed(1); }
    if (bridge) { out.everOnBridge = true; if (T.bridgeHeight(s.x, s.z) >= T.DECK_Y - 1e-6) out.minDeckY = Math.min(out.minDeckY, s.y); } // the deck proper, not its ramps
    if (!s.air && i > 30) out.minSpeed = Math.min(out.minSpeed, s.speed);
    if (info.event?.splash) out.splash = +info.event.splash.toFixed(1);
    if (info.event?.landed) { out.landed = i; out.boostAfterLanding = s.boost; }
  }
  const ux = fx / l, uz = fz / l;
  out.past = (s.x - c.x) * ux + (s.z - c.z) * uz; // metres beyond the crossing along the approach
  out.endWet = T.onWater(s.x, s.z);
  return out;
}, { to, ...opts });

const ford = await run('token', { metres: 25, speed: 0, secs: 8 });
console.log('     ford', JSON.stringify(ford));
if (!(ford.minY < -0.3)) fail(`the car never went down into the ford (minY ${ford.minY})`);
if (!(ford.wetFrames > 10)) fail('the car was never in the water');
if (!(ford.exitSpeed <= 14)) fail(`left the water at ${ford.exitSpeed} m/s; wading should have pulled a flat-out entry to about half of 24`);
if (!ford.splash) fail('no splash event on entry');
if (!(ford.past > 6 && !ford.endWet)) fail(`the car did not come out the far side (past ${ford.past.toFixed(1)}, wet ${ford.endWet})`);

const bridge = await run('community', { metres: 25, speed: 24, secs: 4 });
console.log('     bridge', JSON.stringify(bridge));
if (!bridge.everOnBridge) fail('the car never reached the deck');
if (!(bridge.minDeckY >= 0.17)) fail(`dipped to ${bridge.minDeckY} on the deck`);
if (!(bridge.minSpeed >= 20)) fail(`slowed to ${bridge.minSpeed} m/s crossing the bridge`);
if (bridge.wetFrames) fail('got wet on a bridge');
if (!(bridge.past > 10)) fail(`did not get across (past ${bridge.past.toFixed(1)})`);

const jump = await run('token', { metres: 0, speed: 8, secs: 3, air: 3 });
console.log('     jump into the ford', JSON.stringify(jump));
if (jump.landed == null) fail('never landed');
if (!jump.splash) fail('no splash landing in the ford');
if (!(jump.boostAfterLanding === 0)) fail(`a boost (${jump.boostAfterLanding}) for landing in the water`);

console.log('ok   river smoke');
await browser.close();
