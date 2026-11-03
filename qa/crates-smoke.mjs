// Crates sleep when still and wake when hit: the plaza props and the yard's heap sit asleep, the car knocks one awake
// and it moves, and after a moment at rest everything sleeps again (main.js stepCrates). Runs the live frame loop, so
// it waits on states rather than timers and runs the low tier in a small window (software rendering's frames are slow,
// and the world's clock with them). A few yard crates wedged between the shed and a neighbour jitter awake, as before.
// Needs the site on http://localhost:8766 (PORT=8766 node qa/serve.mjs). Usage: node qa/crates-smoke.mjs [siteBase]
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8766';
const fail = (m) => { console.log(`FAIL crates smoke: ${m}`); process.exit(1); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 600, height: 400 } });
await ctx.addInitScript(() => localStorage.setItem('eco-quality', 'low'));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  page error', String(e).split('\n')[0]));
await page.goto(`${base}/ecosystem/?arrive=0&mp=0&sound=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
await page.click('#start');
await page.evaluate(async () => { window.__crates = (await import('/ecosystem/js/build.js')).crates; }); // the live list, for the waits below (a wait's predicate must be synchronous)

const census = () => page.evaluate(() => {
  const crates = window.__crates;
  const kinds = {};
  for (const c of crates) kinds[c.kind || 'crate'] = (kinds[c.kind || 'crate'] || 0) + 1;
  return { total: crates.length, asleep: crates.filter((c) => c.asleep).length, kinds };
});
// Everything at rest from the start sleeps within a couple of seconds of the world's clock
await page.waitForFunction(() => { const crates = window.__crates; return crates.length > 20 && crates.filter((c) => c.asleep).length >= crates.length * 0.9; }, null, { timeout: 90000 }).catch(() => {});
const rest = await census();
console.log('     at rest', JSON.stringify(rest));
if (!(rest.total > 20)) fail(`only ${rest.total} crates in the world`);
if (!(rest.asleep >= rest.total * 0.9)) fail(`${rest.asleep} of ${rest.total} crates asleep after a wait; nearly all should be`);

// Drive at the nearest sleeping crate from 6 m away: it wakes and moves
const hit = await page.evaluate(async () => {
  const crates = window.__crates;
  const T = await import('/ecosystem/js/terrain.js');
  const e = window.__eco, s = e.car.s;
  const c = crates.filter((k) => k.asleep && !k.air).sort((a, b) => Math.hypot(a.m.position.x - s.x, a.m.position.z - s.z) - Math.hypot(b.m.position.x - s.x, b.m.position.z - s.z))[0];
  const p = c.m.position, ax = p.x, az = p.z;
  const a = Math.random() * Math.PI * 2, x = ax + Math.sin(a) * 6, z = az + Math.cos(a) * 6; // 6 m off, facing it
  e.placeCar(x, z, Math.atan2(-(ax - x), -(az - z)));
  s.y = T.groundHeight(x, z);
  e.keys.up = true;
  const t0 = performance.now();
  await new Promise((r) => { const tick = () => { if (Math.hypot(p.x - ax, p.z - az) > 0.4 || performance.now() - t0 > 20000) r(); else requestAnimationFrame(tick); }; tick(); });
  e.keys.up = false;
  return { moved: +Math.hypot(p.x - ax, p.z - az).toFixed(2), awake: !c.asleep, ms: Math.round(performance.now() - t0) };
});
console.log('     hit', JSON.stringify(hit));
if (!(hit.moved > 0.4)) fail(`the crate the car drove at only moved ${hit.moved} m`);
if (!hit.awake) fail('the hit crate is still marked asleep');

// Everyone settles again
await page.waitForFunction(() => { const crates = window.__crates; return crates.filter((c) => c.asleep).length >= crates.length * 0.9; }, null, { timeout: 90000 }).catch(() => {});
const after = await census();
console.log('     settled', JSON.stringify(after));
if (!(after.asleep >= after.total * 0.9)) fail(`${after.asleep} of ${after.total} asleep after settling`);
console.log('ok   crates smoke: at rest asleep, a hit wakes and moves one, all settle');
await browser.close();
