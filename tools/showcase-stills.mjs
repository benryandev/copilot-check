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
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7); // cabinet | wave
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
await browser.close();
