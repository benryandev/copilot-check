// Two more stills for the three.js Showcase thread (1 Nov 2026): the arcade cabinet at night, and a wave between three
// cars by day. Same virtual clock as showcase-media.mjs. Needs the site served locally.
//   node tools/showcase-stills.mjs [base]   → tools/out/showcase/cabinet-night.png, wave-day.png
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8766';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7); // cabinet | wave | river | stunt | ridge
const OUT = new URL('./out/showcase/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const FPS = 30, DT = 1000 / FPS;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: theme });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('eco-quality', 'high'); } catch {}
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
  page.on('pageerror', (e) => console.log('  page error', String(e).split('\n')[0]));
  await page.goto(`${base}/ecosystem/?mp=0&arrive=0#${theme}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
  await page.click('#start');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // models in
  await page.evaluate(() => { document.querySelectorAll('.hud, .touch').forEach((e) => e.style.setProperty('display', 'none', 'important')); window.__virtual(); });
  return page;
}
const step = (page, ms = DT) => page.evaluate((ms) => window.__step(ms), ms);
const steps = async (page, n) => { for (let i = 0; i < n; i++) await step(page); };

// The cabinet at night, from the pad, the live board on its marquee
if (!only || only === 'cabinet') {
  const p = await open('dark');
  await p.evaluate(() => window.__eco.teleport('arcade-flappy-coin'));
  await p.evaluate(() => new Promise((r) => setTimeout(r, 1500))); // the board fetch
  await steps(p, 45);
  await p.screenshot({ path: `${OUT}cabinet-night.png` });
  await p.context().close();
  console.log('cabinet-night.png');
}

// A wave by day at the raceway start (open ground, nothing behind the bubbles): our wave, Juno's party, Rook's flag
if (!only || only === 'wave') {
  const p = await open('light');
  await p.evaluate(() => {
    const e = window.__eco; e.toStart();
    const c = e.car.s, sin = Math.sin(c.heading), cos = Math.cos(c.heading);
    const at = (f, r) => ({ x: c.x - sin * f + cos * r, z: c.z - cos * f - sin * r });
    e.peersInject([{ id: 'p1', name: 'Juno', colour: '#22d3ee', ...at(8, -7), h: c.heading + 2.4 }, { id: 'p2', name: 'Rook', colour: '#facc15', ...at(10, 7), h: c.heading - 2.2 }]);
  });
  await p.evaluate(() => new Promise((r) => setTimeout(r, 800)));
  await steps(p, 30); // their cars built and placed
  await p.evaluate(() => { const e = window.__eco.emote; e.show('me', 0); e.show('p1', 1); e.show('p2', 3); });
  await steps(p, 24); // 0.8 s in: popped, held
  await p.screenshot({ path: `${OUT}wave-day.png` });
  await p.context().close();
  console.log('wave-day.png');
}
// The river by day: the car mid-ford on the Token spoke with spray up, the water and banks either side
if (!only || only === 'river') {
  const p = await open('light');
  await p.evaluate(async () => {
    const T = await import('/ecosystem/js/terrain.js');
    const e = window.__eco, c = T.crossings.find((c) => T.roads[c.road].kind === 'spoke' && T.roads[c.road].to === 'token');
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    e.placeCar(c.x - fx * 1.5, c.z - fz * 1.5, Math.atan2(-fx, -fz));
    e.car.s.speed = 7; e.keys.up = true;
  });
  await steps(p, 8);
  await p.evaluate(() => window.__eco.splash());
  await steps(p, 6); // 0.2 s: the burst at full spread, the wheels spraying
  await p.screenshot({ path: `${OUT}river-day.png` });
  await p.evaluate(() => { window.__eco.keys.up = false; });
  await p.context().close();
  console.log('river-day.png');
}
// Chart Ridge by day: a fixed day's closes, the car a few metres in, the chart rising ahead
if (!only || only === 'ridge') {
  const p = await open('light');
  await p.evaluate(async () => {
    const T = await import('/ecosystem/js/terrain.js');
    const e = window.__eco, r = T.roads[T.RIDGE_ROAD];
    e.ridge.set([80120, 80040, 79880, 79910, 79650, 79420, 79500, 79310, 78990, 78760, 78820, 78540, 78410, 78600, 78880, 79050, 78970, 79240, 79480, 79350, 79610, 79820, 79700, 79930]);
    const q = r.curve.getPointAt(14 / r.len), t = r.curve.getTangentAt(14 / r.len);
    e.placeCar(q.x, q.z, Math.atan2(-t.x, -t.z));
  });
  await steps(p, 12);
  await p.screenshot({ path: `${OUT}ridge-day.png` });
  await p.context().close();
  console.log('ridge-day.png');
}
// The epic jump by day: the car mid-air over the river from the side-on camera
if (!only || only === 'stunt') {
  const p = await open('light');
  await p.evaluate(() => { window.__eco.blimp.setAngle(282); window.__eco.stunt(); });
  await steps(p, 4);
  await p.screenshot({ path: `${OUT}stunt-day.png` });
  await p.context().close();
  console.log('stunt-day.png');
}
await browser.close();
