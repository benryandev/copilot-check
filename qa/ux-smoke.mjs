// The UX controls end to end (dev only): PORT=8767 node qa/serve.mjs & node qa/ux-smoke.mjs [baseUrl] [--part=stick,footer,zoom,triggers,save] [--shots] [--reduced]
//   stick     the floating steering stick on a 375 px touch screen: the value and the knob follow the thumb, full lock past
//             the pad's edge, a window blur releases it
// Each part opens its own page. Exits 1 on any failure. Runs against http://localhost:8767 by default (the worktree's
// server); the leaderboard is offline on that origin, which none of these checks need. The room is off (?mp=0) and
// the opening flight is skipped (arrive=0).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { stickValue } from '../ecosystem/js/stick-math.js';
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) || 'http://localhost:8767').replace(/\/$/, '');
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]?.split(',');
const parts = opt('part') || ['stick'];
const reduced = args.includes('--reduced');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A page in the world with the intro closed, the car on the hub road, nothing else open
async function open({ width = 1280, height = 800, touch = false, theme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => { try { localStorage.setItem('eco-tier', 'low'); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  const noise = (t) => /benryan\.workers\.dev|Failed to load resource/.test(t); // the race and arcade API allow localhost:8766, not this origin
  page.on('console', (m) => { if (m.type() === 'error' && !noise(m.text())) errs.push(m.text()); });
  await page.goto(`${base}/ecosystem/?mp=0&arrive=0#${theme}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eco && !document.getElementById('loader'), null, { timeout: 120_000 });
  await page.evaluate(() => document.getElementById('intro').close());
  await sleep(400);
  return { ctx, page, errs };
}

if (parts.includes('stick')) {
  const { ctx, page, errs } = await open({ width: 375, height: 812, touch: true });
  const pad = await page.locator('#stick').boundingBox({ timeout: 3000 }).catch(() => null);
  check(!!pad, 'stick: #stick is on the touch bar');
  if (pad) {
    check(pad.height >= 44 && pad.width >= 44, `stick: a tap target, ${Math.round(pad.width)}x${Math.round(pad.height)}`);
    const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 30, cy, { steps: 4 });
    await sleep(500);
    const held = await page.evaluate(() => ({ steer: window.__eco.keys.steer, car: window.__eco.car.s.steer, x: document.getElementById('stick').style.getPropertyValue('--stick-x').trim(), aria: document.getElementById('stick').getAttribute('aria-valuetext') }));
    check(Math.abs(held.steer - stickValue(-30)) < 1e-9, `stick: 30 px left reads ${held.steer}`);
    check(held.car > 0.5, `stick: the car's steer follows it (${held.car})`);
    check(held.x.startsWith('-'), `stick: the knob went left (${held.x})`);
    check(/^left \d+%$/.test(held.aria), `stick: aria says "${held.aria}"`);
    await page.mouse.move(cx - 230, cy, { steps: 4 });
    check((await page.evaluate(() => window.__eco.keys.steer)) === 1, 'stick: past the edge is full lock');
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    const after = await page.evaluate(() => ({ steer: window.__eco.keys.steer, x: document.getElementById('stick').style.getPropertyValue('--stick-x').trim(), aria: document.getElementById('stick').getAttribute('aria-valuetext') }));
    check(after.steer === null, `stick: a blur releases it (${after.steer})`);
    check(after.x === '0px', `stick: the knob is home (${after.x})`);
    check(after.aria === 'straight', `stick: aria says "${after.aria}"`);
    await page.mouse.up();
    const touchBox = await page.locator('#touch').boundingBox();
    check(touchBox.y + touchBox.height <= 812 && touchBox.x >= 0 && touchBox.x + touchBox.width <= 375, 'stick: the touch bar sits inside the viewport');
  }
  check(errs.length === 0, `stick: no page errors${errs.length ? ' ' + errs.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `${failures.length} failure(s)` : 'clean');
process.exit(failures.length ? 1 : 0);
