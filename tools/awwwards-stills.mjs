// The Awwwards entry's extra stills at 1600×1200 (its thumbnail shape), the ones tools/showcase-media.mjs does not
// make: the Orrery and the SLP Engine at night from their pads, the Orrery by day, a stop sheet open over the world in
// both themes, and the stops page. Needs the site served locally (PORT=8766 node qa/serve.mjs).
//   node tools/awwwards-stills.mjs [base]   → tools/out/showcase/1600x1200/*.png
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const base = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8766';
const OUT = new URL('./out/showcase/1600x1200/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const W = 1600, H = 1200, DT = 1000 / 30;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// The same virtual clock as the showcase tool: frames advance only when stepped, so the software renderer's pace does not matter
async function world(theme, query = 'mp=0&sound=0&arrive=0') {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: theme });
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
  await page.goto(`${base}/ecosystem/?${query}#${theme}`, { waitUntil: 'domcontentloaded' });
  return page;
}
const step = (page, n = 1) => page.evaluate(({ n, dt }) => { for (let i = 0; i < n; i++) window.__step(dt); }, { n, dt: DT });

// The monuments from their pads: the car on the pad, the chase camera looking at the centrepiece, the HUD away
for (const [name, key, theme] of [['orrery-night', 'monument-partners', 'dark'], ['slp-engine-night', 'monument-earn', 'dark'], ['orrery-day', 'monument-partners', 'light']]) {
  const page = await world(theme);
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 120000 });
  await page.click('#start');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 3000))); // models in
  await page.evaluate((k) => { window.__eco.teleport(k); document.querySelectorAll('.hud, .touch').forEach((e) => e.style.setProperty('display', 'none', 'important')); window.__virtual(); }, key);
  await step(page, 90); // three seconds of the rings and sparks, the camera settled
  await page.screenshot({ path: `${OUT}${name}.png`, timeout: 120000 }); // a 1600×1200 frame with the glow pass takes the software renderer a while
  console.log(`${name}.png`);
  await page.context().close();
}

// A stop sheet open over the world, from a shared link (the HUD hides under a sheet by itself)
for (const [name, key, theme] of [['sheet-plinth-night', 'monument-analytics', 'dark'], ['sheet-liquidations-day', 'liquidations', 'light']]) {
  const page = await world(theme, `stop=${key}&mp=0&sound=0&arrive=0`);
  await page.waitForFunction(() => document.getElementById('stop')?.open && window.__eco, null, { timeout: 120000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('#stop-live dd')].some((d) => d.textContent === 'Loading'), null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => window.__virtual());
  await step(page, 30);
  await page.screenshot({ path: `${OUT}${name}.png`, timeout: 120000 });
  console.log(`${name}.png`);
  await page.context().close();
}

// The stops page, the world as text
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(`${base}/ecosystem/stops/#${theme}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}stops-page-${theme}.png`, timeout: 120000 });
  console.log(`stops-page-${theme}.png`);
  await ctx.close();
}
await browser.close();
