// Frame-time probe for the ecosystem world (dev only). For each quality setting it loads the world at a phone-sized
// viewport, stands on the hub plaza, then drives round it, and prints what the ?fps=1 readout shows (fps.js): the average
// and worst gap between frames, the frame loop's script time with the draw call's share, and the draw calls and triangles
// per frame. Chrome runs headed so the real GPU draws (headless Chromium draws in software); the figures are this
// machine's, so compare settings with each other rather than with a phone.
// Usage: node qa/perf-eco.mjs [baseUrl] [--browser=chrome|webkit] [--width=390] [--dpr=3] [--cpu=1] [--seconds=6]
//        [--tiers=high,medium,low] [--ab] [--scale=1] [--jitless]
// --ab runs the medium tier with one thing changed at a time (no bloom, no shadows, shadows 512, ratio 1, less grass),
// through window.__eco.tiers and window.__eco.quality, the same path the Graphics setting takes. --cpu=4 slows the
// page's main thread four times over (Chrome only), a stand-in for a phone's processor. --scale=2 doubles every tier's
// pixel ratio (capped by the device's), four times the pixels: a stand-in for a phone's GPU on a faster machine, where
// the frame is otherwise capped by the display. --jitless runs Chrome's V8 without its JIT (--js-flags=--jitless), the shape of
// Safari under Lockdown Mode on Ben's phone (4 Nov 2026): script costs there are 1.5 to 2.5 times the phone's. Under each row a
// scene-walk line says what three.js visits every frame while the car stands on the hub plaza: how many objects, how many still
// compose a matrix each frame, how many are drawables, and what one scene.updateMatrixWorld() and one renderer.render() cost
// (the median of a few calls), the figures the matrix freeze and the geometry merge were measured by.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

let pw;
try { pw = await import('playwright'); } catch {
  const g = execSync('npm root -g').toString().trim();
  pw = createRequire(`${g}/`)('playwright');
}

const args = process.argv.slice(2);
const base = (args.find(a => !a.startsWith('--')) || 'http://localhost:8080').replace(/\/$/, '');
const opt = (k, d) => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const browserName = opt('browser', 'chrome'), width = Number(opt('width', 390)), dpr = Number(opt('dpr', 3)), cpu = Number(opt('cpu', 1));
const seconds = Number(opt('seconds', 6)), scale = Number(opt('scale', 1)), jitless = args.includes('--jitless');
const HEIGHT = { 360: 780, 375: 812, 390: 844, 430: 932, 768: 1024, 1280: 800, 1440: 900, 1920: 1080 };
const height = HEIGHT[width] || Math.round(width * 2.16);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

// [label, tier, changes to that tier's settings before it is applied]
const runs = args.includes('--ab')
  ? [
    ['medium as is', 'medium', null],
    ['medium, no bloom', 'medium', { bloom: false }],
    ['medium, no shadows', 'medium', { shadow: 0 }],
    ['medium, shadows 512', 'medium', { shadow: 512 }],
    ['medium, no bloom, no shadows', 'medium', { bloom: false, shadow: 0 }],
    ['medium at ratio 1', 'medium', { ratio: 1 }],
    ['medium, grass 2500', 'medium', { grass: 2500 }],
    ['medium, no bloom, no shadows, ratio 1', 'medium', { bloom: false, shadow: 0, ratio: 1 }],
    ['low as is', 'low', null],
  ]
  : opt('tiers', 'high,medium,low').split(',').map(t => [`${t} as is`, t, null]);

const browser = browserName === 'webkit'
  ? await pw.webkit.launch({ headless: false })
  : await pw.chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist', ...(jitless ? ['--js-flags=--jitless'] : [])] });
console.log(`${browserName}${jitless && browserName !== 'webkit' ? ' (jit off)' : ''} · ${width}×${height} at ${dpr}× · ratio ×${scale} · cpu ${cpu}× · ${seconds} s driving · ${base}`);
console.log('| setting | tier | still: avg / worst ms | driving: avg / worst ms | js ms (draw) | gpu ms | calls | tris |');
console.log('|---|---|---|---|---|---|---|---|');

const agg = list => list.length ? {
  avg: mean(list.map(s => s.avg)), worst: Math.max(...list.map(s => s.worst)), js: mean(list.map(s => s.js)), draw: mean(list.map(s => s.draw)),
  gpu: list.some(s => s.gpu != null) ? mean(list.filter(s => s.gpu != null).map(s => s.gpu)) : null,
  calls: Math.round(mean(list.map(s => s.calls))), tris: Math.round(mean(list.map(s => s.triangles))), tier: list.at(-1).tier,
} : null;
const k = n => (n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n));
const f = v => (v == null ? '—' : v.toFixed(1));

for (const [label, tier, patch] of runs) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(t => { localStorage.setItem('eco-quality', t); sessionStorage.setItem('eco-arrived', '1'); }, tier);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
  if (cpu > 1 && browserName !== 'webkit') { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  try {
    await page.goto(`${base}/ecosystem/?fps=1&mp=0&arrive=0&sound=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 90000 });
    await page.evaluate(async () => { const b = await import('/ecosystem/js/build.js'); await b.modelsReady(); }); // the models in, and with them the matrix freeze and the geometry merge (main.js), before anything is read
    if (patch || scale !== 1) await page.evaluate(([t, p, s]) => { const tr = window.__eco.tiers[t]; Object.assign(tr, p || {}); tr.ratio *= s; window.__eco.quality(t); }, [tier, patch, scale]);
    await page.click('#start');
    await sleep(2000); // the sheet closes, shaders compile, the first second's figures land
    // The scene walk, standing still on the plaza: what three.js visits each frame and what one walk and one draw cost here
    const walk = await page.evaluate(() => {
      const { scene, renderer, camera } = window.__eco;
      let objects = 0, auto = 0, drawables = 0;
      scene.traverse((o) => { objects++; if (o.matrixAutoUpdate) auto++; if (o.isMesh || o.isSprite || o.isPoints || o.isLine) drawables++; });
      const median = (fn, n) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return t[n >> 1]; };
      const umw = median(() => scene.updateMatrixWorld(), 15);
      const render = median(() => renderer.render(scene, camera), 9);
      return { objects, auto, drawables, umw, render };
    });
    await sleep(1200); // the walk's own stall lands in a second the samples below never read
    const perSecond = [];
    const sample = async secs => {
      const out = [];
      for (let i = 0; i < secs; i++) { await sleep(1000); const s = await page.evaluate(() => window.__eco.fps.stats()); if (s) { out.push(s); perSecond.push(Math.round(s.worst)); } }
      return out;
    };
    const still = agg(await sample(Math.max(3, Math.round(seconds / 2))));
    perSecond.push('|'); // still on the left of the bar, driving on the right
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowLeft'); // round the plaza
    await sleep(1000);
    const driving = agg(await sample(seconds));
    await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowLeft');
    console.log(`| ${label} | ${driving.tier} | ${f(still.avg)} / ${Math.round(still.worst)} | ${f(driving.avg)} / ${Math.round(driving.worst)} | ${f(driving.js)} (${f(driving.draw)}) | ${f(driving.gpu)} | ${driving.calls} | ${k(driving.tris)} |`);
    console.log(`     worst frame per second: ${perSecond.join(' ')}`);
    console.log(`     scene walk: ${walk.objects} objects (${walk.auto} composing a matrix each frame, ${walk.drawables} drawables) · updateMatrixWorld ${f(walk.umw)} ms · renderer.render ${f(walk.render)} ms`);
    for (const e of errors) console.log(`     page error: ${e}`);
  } catch (err) {
    console.log(`| ${label} | failed: ${String(err).split('\n')[0]} |`);
  }
  await ctx.close();
}
await browser.close();
