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
const run = (to, opts) => page.evaluate(async ({ to, kind = 'spoke', metres, speed, secs, air, follow = false, back = false }) => {
  const T = await import('/ecosystem/js/terrain.js');
  const { stepCar } = await import('/ecosystem/js/car.js');
  const e = window.__eco, car = e.car, s = car.s;
  const c = T.crossings.find((c) => T.roads[c.road].kind === kind && T.roads[c.road].to === to), r = T.roads[c.road];
  // Start `metres` back along the road itself (or ahead of it with `back`), heading along the road; `follow` keeps the
  // car on the centreline every step, like a driver who steers with the road
  const dirSign = back ? -1 : 1;
  const sStart = c.s0 - dirSign * metres, pStart = r.curve.getPointAt(Math.max(0, Math.min(1, sStart / r.len))), tStart = r.curve.getTangentAt(Math.max(0, Math.min(1, sStart / r.len)));
  const fx = tStart.x * dirSign, fz = tStart.z * dirSign, l = 1, p0 = { x: pStart.x, z: pStart.z };
  Object.assign(s, { x: p0.x, z: p0.z, heading: Math.atan2(-fx / l, -fz / l), speed, steer: 0, vy: 0, air: false, boost: 0, wet: false, airTime: 0 });
  s.y = T.groundHeight(s.x, s.z);
  if (air) { const back = speed * Math.sqrt((2 * air) / 30); s.x = c.x - fx * back; s.z = c.z - fz * back; s.y = T.groundHeight(s.x, s.z) + air; s.air = true; s.vy = 0; s.airTime = 0; } // falls under the car's own gravity (30) to land on the crossing
  const keys = { up: !air, down: false, left: false, right: false };
  const out = { minY: Infinity, maxWetSpeed: 0, exitSpeed: null, minAirSpeed: Infinity, minDeckY: Infinity, minSpeed: Infinity, wetFrames: 0, splash: null, landed: null, boostAfterLanding: null, everOnBridge: false };
  for (let i = 0; i < secs * 60; i++) {
    if (follow && !s.air) { const ri = T.roadInfo(s.x, s.z, 12); if (ri.road === c.road) s.heading = Math.atan2(-ri.tx * dirSign, -ri.tz * dirSign); }
    const info = stepCar(car, keys, 1 / 60);
    const wet = T.onWater(s.x, s.z), bridge = T.onBridge(s.x, s.z);
    out.minY = Math.min(out.minY, s.y);
    if (wet) { out.wetFrames++; out.maxWetSpeed = Math.max(out.maxWetSpeed, Math.abs(s.speed)); out.exitSpeed = +Math.abs(s.speed).toFixed(1); }
    if (bridge) { out.everOnBridge = true; if (T.bridgeHeight(s.x, s.z) >= T.DECK_Y - 1e-6) out.minDeckY = Math.min(out.minDeckY, s.y); } // the deck proper, not its ramps
    if (!s.air && i > 30) out.minSpeed = Math.min(out.minSpeed, s.speed);
    if (s.air) out.minAirSpeed = Math.min(out.minAirSpeed, Math.abs(s.speed));
    if (info.event?.splash) out.splash = +info.event.splash.toFixed(1);
    if (info.event?.landed) { out.landed = i; out.boostAfterLanding = s.boost; }
    if (follow && (s.x - c.x) * (fx / l) + (s.z - c.z) * (fz / l) > 14) break; // across and clear: stop before the next thing on the road (a jump, a plaza)
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

for (const [to, kind] of [['community', 'spoke'], ['chains', 'spoke'], ['community', 'ring'], ['perps', 'ring']]) for (const back of [false, true]) {
  const bridge = await run(to, { kind, metres: 25, speed: 24, secs: 4, follow: true, back });
  const tag = `${kind} ${to}${back ? ' (towards HQ)' : ''}`;
  console.log(`     bridge ${tag}`, JSON.stringify(bridge));
  if (!bridge.everOnBridge) fail(`${tag}: the car never reached the deck`);
  if (!(bridge.minDeckY >= 0.17)) fail(`${tag}: dipped to ${bridge.minDeckY} on the deck`);
  if (!(bridge.minSpeed >= 20)) fail(`${tag}: slowed to ${bridge.minSpeed} m/s crossing the bridge`);
  if (bridge.wetFrames) fail(`${tag}: got wet on a bridge`);
  if (!(bridge.past > 10)) fail(`${tag}: did not get across (past ${bridge.past.toFixed(1)})`);
}
// Flying over the river keeps its speed: the air is not water
const fly = await run('token', { metres: 6, speed: 24, secs: 1, air: 2.5 });
console.log('     fly over the ford', JSON.stringify(fly));
if (!(fly.minAirSpeed >= 23.5)) fail(`lost speed in the air over the water (${fly.minAirSpeed})`);

const jump = await run('token', { metres: 0, speed: 8, secs: 3, air: 3 });
console.log('     jump into the ford', JSON.stringify(jump));
if (jump.landed == null) fail('never landed');
if (!jump.splash) fail('no splash landing in the ford');
if (!(jump.boostAfterLanding === 0)) fail(`a boost (${jump.boostAfterLanding}) for landing in the water`);

// Spray through the live frame loop: the car wading at speed throws puffs within a second of real time
const sprayed = await page.evaluate(async () => {
  const T = await import('/ecosystem/js/terrain.js');
  const e = window.__eco, c = T.crossings.find((c) => T.roads[c.road].kind === 'spoke' && T.roads[c.road].to === 'token');
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  e.placeCar(c.x - fx * 2, c.z - fz * 2, Math.atan2(-fx, -fz));
  const before = e.sprayCount();
  e.car.s.speed = 9; e.keys.up = true;
  await new Promise((r) => setTimeout(r, 1200));
  e.keys.up = false;
  return e.sprayCount() - before;
});
console.log('     spray puffs while wading', sprayed);
if (!(sprayed > 0)) fail('no spray while wading through the ford');

// The epic jump: flat out from the east bank clears the river and lands on the far ramp with a boost; 16 m/s ends in the water
const jumpRun = (speed) => page.evaluate(async (speed) => {
  const T = await import('/ecosystem/js/terrain.js');
  const { stepCar } = await import('/ecosystem/js/car.js');
  const e = window.__eco, car = e.car, s = car.s;
  const j = T.jumps.find((o) => o.stunt && o.fx < 0);
  // Flat out: a 45 m run-up with the throttle held. Slow: rolled onto the ramp's foot at `speed` and left to coast (the throttle would pull it back to 24)
  const back = speed >= 24 ? 45 : 0;
  Object.assign(s, { x: j.ox - j.fx * back, z: j.oz, heading: Math.atan2(-j.fx, -j.fz), speed, steer: 0, vy: 0, air: false, boost: 0, wet: false, airTime: 0 });
  s.y = T.groundHeight(s.x, s.z);
  const far = T.jumps.find((o) => o.stunt && o.fx > 0), farLip = { x: far.ox + far.fx * far.length, z: far.oz + far.fz * far.length };
  const out = { air: 0, landed: null, boost: null, wetFrames: 0, minSpeed: Infinity, maxY: -Infinity, popUp: 0, pastFarLip: null };
  let prevY = s.y;
  for (let i = 0; i < 300; i++) {
    const info = stepCar(car, { up: speed >= 24, down: false, left: false, right: false }, 1 / 60);
    if (s.air) out.air++;
    out.maxY = Math.max(out.maxY, s.y);
    if (T.onWater(s.x, s.z) && !s.air) out.wetFrames++;
    out.minSpeed = Math.min(out.minSpeed, s.speed);
    if (out.landed == null) out.popUp = Math.max(out.popUp, s.y - prevY - Math.max(0, s.vy) * (1 / 60)); // a rise in one frame beyond what the car's own climb explains
    prevY = s.y;
    if (info.event?.landed != null && out.landed == null) { out.landed = i; out.boost = s.boost; out.landedOn = T.jumpAt(s.x, s.z) ? 'ramp' : T.onWater(s.x, s.z) ? 'water' : 'ground'; out.pastFarLip = +((s.x - farLip.x) * far.fx * -1).toFixed(2); }
    if (out.landed != null && i > out.landed + 30) break;
  }
  return out;
}, speed);
const fast = await jumpRun(24);
console.log('     epic jump at 24', JSON.stringify(fast));
if (!(fast.air > 20)) fail('never took off');
if (fast.landedOn !== 'ramp') fail(`landed on ${fast.landedOn}, not the far ramp`);
if (!(fast.pastFarLip >= 1)) fail(`landed only ${fast.pastFarLip} m past the far lip`);
if (!(fast.popUp < 0.3)) fail(`popped up ${fast.popUp.toFixed(2)} m in one frame: snapped onto the ramp through its face`);
if (!(fast.boost > 0)) fail('no boost for the landing');
if (fast.wetFrames) fail('got wet on the fast run');
const edge = await jumpRun(21);
console.log('     epic jump at 21', JSON.stringify(edge));
if (!(edge.minSpeed < 0)) fail('21 m/s should hit the far face and bounce, not be lifted onto the ramp');
if (edge.boost) fail('a boost for hitting the far face');
const slow = await jumpRun(16);
console.log('     epic jump at 16', JSON.stringify(slow));
if (!(slow.wetFrames > 0 || slow.minSpeed < 0)) fail('the slow run should end in the river or against the far face');

console.log('ok   river smoke');
await browser.close();
