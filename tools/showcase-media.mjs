// Stills for the three.js Showcase post (and the X/Discord posts): two 16:9 hero stills from the arrival, the Fill
// Yard at night with two other drivers, two named cars at night, the crate heap, the Raceway with the ghost. The
// trailer is tools/showcase-trailer.mjs. Needs the site served locally.
//   node tools/showcase-media.mjs [base] [--hero]   → tools/out/showcase/*.png
// Same virtual clock as clip-eco.mjs: performance.now and requestAnimationFrame only move when the script steps them,
// so frames are evenly spaced however slowly the software renderer draws. CSS transitions run on real time, so the
// title card's fade is driven by hand from the virtual clock.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const base = process.argv[2] || 'http://localhost:8766';
const here = (p) => new URL(p, import.meta.url).pathname;
const OUT = here('./out/showcase/');
mkdirSync(OUT, { recursive: true });
const STILL = [1920, 1080], FPS = 30, DT = 1000 / FPS;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open([w, h], { theme = 'light', arrive = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: theme });
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
  await page.goto(`${base}/ecosystem/?mp=0&arrive=${arrive ? 1 : 0}#${theme}`, { waitUntil: 'domcontentloaded' });
  if (arrive) {
    await page.waitForFunction(() => document.body.classList.contains('is-arriving'), null, { timeout: 60000 });
    await page.evaluate(() => { document.getElementById('arrive').style.transition = 'none'; window.__virtual(); });
  } else {
    await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
    await page.click('#start');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // models in
    await page.evaluate(() => { document.querySelectorAll('.hud, .touch').forEach((e) => e.style.setProperty('display', 'none', 'important')); window.__virtual(); });
  }
  return page;
}
const step = (page, ms = DT) => page.evaluate((ms) => { window.__auto?.(); window.__step(ms); }, ms);
// The title card's fade, on the virtual clock (in at 0.35 s over 0.9 s, out from 3.3 s over 0.9 s)
const titleAt = (page, t) => page.evaluate((t) => {
  const a = document.getElementById('arrive');
  const o = t < 3.3 ? Math.min(1, Math.max(0, (t - 0.35) / 0.9)) : Math.max(0, 1 - (t - 3.3) / 0.9);
  a.style.opacity = String(o); a.style.transform = `translateY(${(1 - o) * 14}px)`;
}, t);

// ── Hero stills: the arrival's held overview with the title card, and a closer one on the way down ──────────
const HERO_ONLY = process.argv.includes('--hero');
{
  const page = await open(STILL, { arrive: true });
  let t = 0;
  for (const [until, name] of [[1.6, 'hero-arrival.png'], [2.9, 'hero-arrival-close.png']]) {
    while (t < until) { await step(page); t += DT / 1000; }
    await titleAt(page, 1.5); // the card fully in
    await step(page, 0);
    await page.screenshot({ path: `${OUT}${name}` });
    console.log(name);
  }
  await page.context().close();
  if (HERO_ONLY) { await browser.close(); process.exit(0); }
}

// ── Stills: the Fill Yard at night with two other drivers, crates landing; two cars; the crate heap; the ghost ──
{
  const atYard = async (p) => p.evaluate(() => {
    const e = window.__eco; e.teleport('fillyard');
    const c = e.car.s, sin = Math.sin(c.heading), cos = Math.cos(c.heading);
    const at = (f, r) => ({ x: c.x - sin * f + cos * r, z: c.z - cos * f - sin * r });
    e.peersInject([{ id: 'p1', name: 'Aveli', colour: '#22d3ee', ...at(5, -6), h: c.heading + 0.5 }, { id: 'p2', name: 'ADA_ACE', colour: '#facc15', ...at(7, 6), h: c.heading - 0.4 }]);
  });
  const fills = (p, n) => p.evaluate((n) => { const syms = ['BTC', 'ETH', 'SOL', 'ADA', 'HYPE', 'XRP']; window.__eco.yardInject(Array.from({ length: n }, (_, i) => ({ sym: syms[i % syms.length], usd: 200 + Math.round(Math.random() * 4000), buy: Math.random() > 0.5 }))); }, n);
  // Stills at 1920×1080
  const s = await open(STILL, { theme: 'dark' });
  await atYard(s); await fills(s, 10);
  for (let i = 0; i < 60; i++) { if (i % 15 === 0) await fills(s, 2); await step(s); }
  await s.screenshot({ path: `${OUT}fill-yard-night.png` });
  await s.evaluate(() => { const e = window.__eco; e.peersInject(null); e.teleport('liquidations'); const c = e.car.s, sin = Math.sin(c.heading), cos = Math.cos(c.heading); const at = (f, r) => ({ x: c.x - sin * f + cos * r, z: c.z - cos * f - sin * r }); e.peersInject([{ id: 'p1', name: 'Aveli', colour: '#22d3ee', ...at(4, -5), h: c.heading + 0.4 }, { id: 'p2', name: 'niang', colour: '#ec4899', ...at(7, 5), h: c.heading - 0.3 }]); });
  for (let i = 0; i < 30; i++) await step(s);
  await s.screenshot({ path: `${OUT}two-cars-night.png` });
  await s.context().close();
  console.log('fill-yard-night.png, two-cars-night.png');

  const d = await open(STILL);
  await d.evaluate(() => { window.__eco.teleport('fillyard'); });
  await fills(d, 40);
  for (let i = 0; i < 12 * FPS; i++) { if (i % 10 === 0 && i < 240) await fills(d, 3); await step(d); }
  await d.screenshot({ path: `${OUT}crate-heap.png` });
  await d.evaluate(() => { window.__eco.toStart(); });
  for (let i = 0; i < 20; i++) await step(d);
  await d.evaluate(() => window.__eco.ghostPreview(1.4, { name: 'BigBaws', ms: 24878, splits: [8570, 11900, 16630, 19950, 21840] }));
  for (let i = 0; i < 10; i++) await step(d);
  await d.screenshot({ path: `${OUT}raceway-ghost.png` });
  await d.context().close();
  console.log('crate-heap.png, raceway-ghost.png');
}

await browser.close();
