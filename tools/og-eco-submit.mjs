// Share image for the project submission page: ecosystem/img/og-submit.png (1200x630).
//   node tools/og-eco-submit.mjs          → still of Builders' Row (tools/og-submit-world.png), then the card
//   node tools/og-eco-submit.mjs --card   → the card only, from the existing still
// Needs `node qa/serve.mjs` running for the still. Card source: tools/og-eco-submit.html.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const here = (p) => new URL(p, import.meta.url).pathname;
const opt = (k, d) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

if (!process.argv.includes('--card')) {
  const ctx = await browser.newContext({ viewport: { width: 2400, height: 1260 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('eco-quality', 'high'); } catch {} });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8080/ecosystem/#light');
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
  await page.click('#start');
  await page.evaluate(() => window.__eco.teleport('copilot-watch'));
  await page.waitForTimeout(6000); // models in
  // Camera: beside the road on the HQ side of the row, looking up it towards the Developers plaza.
  // back = metres behind the last shop along the road, side = metres off the centre line, up = height.
  await page.evaluate(async ({ back, side, up, fov, look, lift }) => {
    document.querySelectorAll('.hud, .touch, .prompt').forEach((e) => e.style.setProperty('display', 'none', 'important'));
    const { builderSlots, roads } = await import('/ecosystem/js/terrain.js');
    const r = roads.find((x) => x.kind === 'spoke' && x.to === 'developers');
    const e = window.__eco, cam = e.camera;
    const t0 = 0.88 - ((builderSlots.length - 1) * 13 + back) / r.len, t1 = 0.88 + look / r.len;
    const p = r.curve.getPointAt(t0), tan = r.curve.getTangentAt(t0), q = r.curve.getPointAt(Math.min(1, t1));
    const x = p.x - tan.z * side, z = p.z + tan.x * side;
    e.car.s.x = q.x + 400; e.car.s.z = q.z + 400; // park the car out of shot
    e.overview(x, e.groundHeight(x, z) + up, z, q.x, q.z);
    cam.fov = fov; cam.far = 600; cam.updateProjectionMatrix();
    cam.lookAt(q.x, e.groundHeight(q.x, q.z) + lift, q.z);
  }, { back: opt('back', 2), side: opt('side', -3), up: opt('up', 3), fov: opt('fov', 55), look: opt('look', 6), lift: opt('lift', 12) });
  await page.waitForTimeout(2500);
  // A 2400 px capture under SwiftShader sometimes fails once; try again
  for (let i = 0; ; i++) {
    try { await page.screenshot({ path: here('./og-submit-world.png') }); break; } catch (err) { if (i >= 2) throw err; await page.waitForTimeout(1500); }
  }
  await ctx.close();
  console.log('tools/og-submit-world.png written');
}
await browser.close();
// The card in a fresh, plain browser (after the software-rendered world, captures in the same one can fail)
const plain = await chromium.launch();
const page = await plain.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('./og-eco-submit.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: here('../ecosystem/img/og-submit.png') });
await plain.close();
console.log('ecosystem/img/og-submit.png written');
