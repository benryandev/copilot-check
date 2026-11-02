// The world still behind each guide page (workstream C): for every stop that has a guide, plus Strike HQ (the stops
// page and the guides index), the world at that pad by day and by night, 960 and 1920 px wide, as JPEG. Needs the
// site served locally. Same virtual clock and HUD hiding as tools/showcase-stills.mjs.
//   PORT=8766 node qa/serve.mjs & node tools/guide-stills.mjs http://localhost:8766 [--only=<stop>]
//   → ecosystem/guides/img/stills/<stop>-<light|dark>-<960|1920>.jpg
// Size caps: 1920 under 220 KB, 960 under 80 KB (quality steps down 72 → 64 → 56 before failing).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8766';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const OUT = new URL('../ecosystem/guides/img/stills/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const guides = JSON.parse(readFileSync(new URL('./lib/guides.json', import.meta.url), 'utf8')).guides;
const stops = [...new Set(['strike', ...Object.values(guides).map((g) => g.stop)])].filter((k) => !only || k === only).sort();
const CAPS = { 1920: 220 * 1024, 960: 80 * 1024 };
const SIZES = { 1920: [1920, 1080], 960: [960, 540] };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;

for (const theme of ['light', 'dark']) {
  for (const [w, [vw, vh]] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, colorScheme: theme });
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('eco-quality', 'high'); localStorage.setItem('theme', t); } catch {}
      let now = 0, queue = [], live = true;
      const pending = new Set();
      const realRaf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
      performance.now = () => (live ? realNow() : now);
      window.requestAnimationFrame = (cb) => {
        if (!live) { queue.push(cb); return queue.length; }
        pending.add(cb);
        return realRaf((tt) => { if (live && pending.delete(cb)) cb(tt); });
      };
      window.__virtual = () => { now = realNow(); live = false; queue.push(...pending); pending.clear(); };
      window.__step = (ms) => { now += ms; const q = queue; queue = []; q.forEach((cb) => cb(now)); };
    }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  page error', String(e).split('\n')[0]));
    await page.goto(`${base}/ecosystem/?mp=0&arrive=0#${theme}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
    await page.click('#start');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500)));
    await page.evaluate(() => { document.querySelectorAll('.hud, .touch').forEach((e) => e.style.setProperty('display', 'none', 'important')); window.__virtual(); });
    for (const key of stops) {
      await page.evaluate((k) => { window.__eco.teleport(k); document.querySelectorAll('dialog[open]').forEach((d) => d.close()); }, key);
      for (let i = 0; i < 12; i++) await page.evaluate(() => window.__step(1000 / 30));
      const path = `${OUT}${key}-${theme}-${w}.jpg`;
      let q = 72, size = Infinity;
      for (const quality of [72, 64, 56]) {
        q = quality;
        await page.screenshot({ path, type: 'jpeg', quality });
        size = statSync(path).size;
        if (size <= CAPS[w]) break;
      }
      const ok = size <= CAPS[w];
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${key}-${theme}-${w}.jpg ${(size / 1024).toFixed(0)} KB (q${q})`);
    }
    await ctx.close();
  }
}
await browser.close();
if (failed) { console.error(`${failed} still(s) over the size cap`); process.exit(1); }
