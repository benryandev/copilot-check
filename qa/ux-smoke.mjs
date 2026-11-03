// The UX controls end to end (dev only): PORT=8767 node qa/serve.mjs & node qa/ux-smoke.mjs [baseUrl] [--part=stick,footer,zoom,triggers,save] [--shots] [--reduced]
//   stick     the floating steering stick on a 375 px touch screen: the value and the knob follow the thumb, full lock past
//             the pad's edge, a window blur releases it
//   footer    the footer pill fades out after a moment on the throttle and comes back after a moment still; the touch bar
//             never moves
//   zoom      focusBoard() eases the camera to the pose that frames the top 10 board while the car stops where it is; the
//             HUD and the touch controls hide, the Save and Back bar shows; Escape or Back brings the chase camera back
//   landscape a phone on its side (844 by 390): no closed sheet paints (the arcade sheet did, 3 Nov 2026, Ben's phone)
//   triggers  See it on the board in the finish sheet closes the sheet and zooms; parked in front of the board a card
//             offers Zoom in, Not now holds it until the car leaves and comes back
//   save      Save the board while zoomed downloads raceway-top-10.png, the board plus its caption band (no share sheet
//             in headless Chromium, so the download path is what runs here)
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
const parts = opt('part') || ['stick', 'footer', 'zoom', 'landscape', 'triggers', 'save'];
const reduced = args.includes('--reduced');
const shots = args.includes('--shots'); // the zoom part also screenshots the zoomed state in both themes to qa/shots/eco-focus-<w>-<theme>.png
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

if (parts.includes('footer')) {
  const foot = (page) => page.evaluate(() => ({ driving: document.body.classList.contains('is-driving'), opacity: +getComputedStyle(document.querySelector('.hud-foot')).opacity, speed: window.__eco.car.s.speed }));
  // The world's clock runs slower than the wall clock under software rendering (dt is capped per frame), so every
  // check waits on the state it expects rather than on a timer; only the CSS fades run on the wall clock
  const until = (page, fn, ms = 20_000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
  // A keyboard page on the start straight, where a stretch on the throttle meets nothing
  const { ctx, page, errs } = await open({ width: 1280, height: 800 });
  await page.evaluate(() => window.__eco.toStart());
  await sleep(300);
  const before = await foot(page);
  check(!before.driving && before.opacity === 1, `footer: shown at rest (${JSON.stringify(before)})`);
  await page.keyboard.down('ArrowUp');
  check(await until(page, () => window.__eco.car.s.speed > 2), 'footer: the car gets going on the throttle');
  check(await until(page, () => document.body.classList.contains('is-driving')), 'footer: body.is-driving once the car has been moving a moment');
  check(await until(page, () => +getComputedStyle(document.querySelector('.hud-foot')).opacity < 0.05, 5000), `footer: faded out (${(await foot(page)).opacity})`);
  await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowDown');
  // The brake takes a capped frame's worth of speed at a time, so it can cross zero between two samples: wait for the
  // crossing, then let the car roll to a stop
  check(await until(page, () => window.__eco.car.s.speed <= 0.5), 'footer: the brake stops the car');
  await page.keyboard.up('ArrowDown');
  check(await until(page, () => !document.body.classList.contains('is-driving'), 40_000), `footer: back after a moment still (speed ${(await foot(page)).speed.toFixed(2)})`);
  check(await until(page, () => +getComputedStyle(document.querySelector('.hud-foot')).opacity === 1, 5000), `footer: fully shown again (${(await foot(page)).opacity})`);
  check(errs.length === 0, `footer: no page errors${errs.length ? ' ' + errs.join(' | ') : ''}`);
  await ctx.close();
  // A touch page: the driving buttons and the stick stay put while the footer fades
  const t = await open({ width: 375, height: 812, touch: true });
  await t.page.evaluate(() => window.__eco.toStart());
  await sleep(300);
  const barBefore = await t.page.locator('#touch').boundingBox();
  await t.page.evaluate(() => { window.__eco.keys.up = true; });
  check(await until(t.page, () => document.body.classList.contains('is-driving')), 'footer: fades on the touch page too');
  const barDriving = await t.page.locator('#touch').boundingBox();
  check(JSON.stringify(barBefore) === JSON.stringify(barDriving), `footer: the touch bar never moves (${JSON.stringify(barBefore)} vs ${JSON.stringify(barDriving)})`);
  await t.page.evaluate(() => { window.__eco.keys.up = false; });
  await t.ctx.close();
}

if (parts.includes('zoom')) {
  const until = (page, fn, ms = 20_000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
  for (const [w, h, touch] of [[1280, 800, false], [375, 812, true], [844, 390, true]]) for (const theme of shots ? ['light', 'dark'] : ['dark']) {
    const tag = `zoom ${w}${shots ? ' ' + theme : ''}`;
    const { ctx, page, errs } = await open({ width: w, height: h, touch, theme });
    await page.evaluate(() => window.__eco.toStart());
    await sleep(300);
    check(typeof (await page.evaluate(() => typeof window.__eco.focusBoard)) === 'string' && (await page.evaluate(() => typeof window.__eco.focusBoard)) === 'function', `${tag}: focusBoard is on __eco`);
    await page.evaluate(() => { window.__eco.keys.up = true; });
    check(await until(page, () => window.__eco.car.s.speed > 2), `${tag}: the car is rolling`);
    // Zoom while still rolling: the car must stop where it is
    const at = await page.evaluate(() => { const e = window.__eco; e.keys.up = false; const s = e.car.s; const pos = { x: s.x, z: s.z, speed: s.speed }; e.focusBoard(); return pos; });
    check(at.speed > 1, `${tag}: zoomed while rolling at ${at.speed.toFixed(1)} m/s`);
    check(await page.evaluate(() => document.body.classList.contains('is-focus')), `${tag}: body.is-focus`);
    check(await until(page, () => { const e = window.__eco, c = e.camera.position, p = e.focus.cam; return e.focus.k >= 1 && Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) < 0.5; }, 30_000), `${tag}: the camera arrives at the board pose`);
    if (shots) { await sleep(900); await page.screenshot({ path: new URL(`./shots/eco-focus-${w}-${theme}.png`, import.meta.url).pathname }); }
    const st = await page.evaluate(() => {
      const vis = (sel) => getComputedStyle(document.querySelector(sel)).visibility;
      const s = window.__eco.car.s, b = window.__eco.boardPose(), c = window.__eco.camera.position;
      return { speed: s.speed, x: s.x, z: s.z, bar: getComputedStyle(document.getElementById('focus-bar')).display, top: vis('.hud-top'), foot: vis('.hud-foot'), touch: vis('#touch'), inFront: (c.x - b.x) * b.fx + (c.z - b.z) * b.fz, level: Math.abs(c.y - window.__eco.focus.look.y), below: b.y - c.y };
    });
    check(st.speed === 0 && Math.abs(st.x - at.x) < 1e-6 && Math.abs(st.z - at.z) < 1e-6, `${tag}: the car stopped where it was (speed ${st.speed}, moved ${Math.hypot(st.x - at.x, st.z - at.z).toFixed(3)} m)`);
    check(st.bar !== 'none', `${tag}: the Save and Back bar shows`);
    check(st.top === 'hidden' && st.foot === 'hidden' && st.touch === 'hidden', `${tag}: the HUD and the touch controls hide (${st.top}, ${st.foot}, ${st.touch})`);
    // The view is level (the camera at its look point's height) and sits at or a little below the board's centre, which
    // is how the board centres in the band above the bar
    check(st.inFront > 5 && st.level < 0.01 && st.below >= 0 && st.below < 2, `${tag}: the camera stands in front of the printed side, level, ${st.below.toFixed(2)} m under the centre (${st.inFront.toFixed(1)} m out)`);
    // Every corner of the board is on screen and its bottom edge sits above the Save and Back bar
    const fit = await page.evaluate(() => {
      const e = window.__eco, b = e.boardPose(), rx = b.fz, rz = -b.fx; // the board's own x axis in the world
      const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => e.project(b.x + rx * sx * b.w / 2, b.y + sy * b.h / 2, b.z + rz * sx * b.w / 2));
      const barTop = document.getElementById('focus-bar').getBoundingClientRect().top;
      return { corners: corners.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`), onScreen: corners.every((c) => c.x >= 0 && c.x <= innerWidth && c.y >= 0 && c.y <= innerHeight), clear: corners.slice(2).every((c) => c.y < barTop), barTop: Math.round(barTop) };
    });
    check(fit.onScreen && fit.clear, `${tag}: the whole board is on screen above the bar (corners ${fit.corners.join(' ')}, bar top ${fit.barTop})`);
    if (touch) await page.click('#focus-back'); else await page.keyboard.press('Escape');
    check(await until(page, () => !document.body.classList.contains('is-focus') && window.__eco.focus.k === 0, 30_000), `${tag}: ${touch ? 'Back' : 'Escape'} brings the chase camera back`);
    check((await page.evaluate(() => getComputedStyle(document.getElementById('focus-bar')).display)) === 'none', `${tag}: the bar is gone`);
    // A teleport (Map view's Drive in, a guide's Drive there) during the zoom ends it
    await page.evaluate(() => window.__eco.focusBoard());
    check(await until(page, () => window.__eco.focus.k >= 1, 30_000), `${tag}: zoomed again`);
    await page.evaluate(() => window.__eco.teleport('slp'));
    check(await until(page, () => !document.body.classList.contains('is-focus') && window.__eco.focus.k === 0 && document.getElementById('focus-bar').hidden, 5000), `${tag}: a teleport ends the zoom`);
    check(errs.length === 0, `${tag}: no page errors${errs.length ? ' ' + errs.join(' | ') : ''}`);
    await ctx.close();
  }
}

if (parts.includes('landscape')) {
  const { ctx, page, errs } = await open({ width: 844, height: 390, touch: true });
  const shown = await page.evaluate(() => [...document.querySelectorAll('dialog')].filter((d) => !d.open && getComputedStyle(d).display !== 'none').map((d) => d.id));
  check(shown.length === 0, `landscape: no closed sheet paints (${shown.join(', ') || 'none'})`);
  check(errs.length === 0, `landscape: no page errors${errs.length ? ' ' + errs.join(' | ') : ''}`);
  await ctx.close();
}

if (parts.includes('triggers')) {
  const until = (page, fn, ms = 20_000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
  const { ctx, page, errs } = await open({ width: 1280, height: 800 });
  await page.evaluate(() => window.__eco.toStart());
  await sleep(300);
  // (a) the finish sheet, filled the way qa/shoot-eco.mjs fills it, then See it on the board
  await page.evaluate(() => { document.getElementById('race-result').textContent = '0:25.853'; document.getElementById('race-gap').textContent = 'New best.'; document.getElementById('race-form').hidden = false; document.getElementById('race').showModal(); });
  check((await page.locator('#race-board').count()) === 1, 'triggers: See it on the board is in the finish sheet');
  await page.click('#race-board').catch(() => {});
  check(await until(page, () => !document.getElementById('race').open && document.body.classList.contains('is-focus'), 5000), 'triggers: the sheet closes and the zoom starts');
  await page.evaluate(() => window.__eco.focusEnd());
  check(await until(page, () => window.__eco.focus.k === 0, 30_000), 'triggers: back from the zoom');
  // (b) parked ten metres in front of the board, facing it
  const park = () => page.evaluate(() => { const e = window.__eco, b = e.boardPose(); e.placeCar(b.x + b.fx * 10, b.z + b.fz * 10, Math.atan2(-b.fx, -b.fz) + Math.PI); });
  await park();
  check(await until(page, () => !document.getElementById('board-prompt').hidden, 30_000), 'triggers: the card offers the board once the car has been still by it');
  await page.click('#board-no', { timeout: 3000 }).catch(() => {});
  check(await page.evaluate(() => document.getElementById('board-prompt')?.hidden === true), 'triggers: Not now hides it');
  await page.evaluate(() => { const e = window.__eco, b = e.boardPose(); e.placeCar(b.x + b.fx * 40, b.z + b.fz * 40, 0); });
  await sleep(1200);
  await park();
  check(await until(page, () => !document.getElementById('board-prompt').hidden, 30_000), 'triggers: it offers again after leaving and coming back');
  await page.click('#board-zoom', { timeout: 3000 }).catch(() => {});
  check(await until(page, () => document.body.classList.contains('is-focus'), 5000), 'triggers: Zoom in zooms');
  check(await page.evaluate(() => document.getElementById('board-prompt')?.hidden === true), 'triggers: the card is gone while zoomed');
  await page.evaluate(() => window.__eco.focusEnd());
  check(await until(page, () => window.__eco.focus.k === 0, 30_000), 'triggers: back from Zoom in');
  check(!(await until(page, () => !document.getElementById('board-prompt').hidden, 2500)), 'triggers: Back by the board holds the card until the car leaves');
  check(errs.length === 0, `triggers: no page errors${errs.length ? ' ' + errs.join(' | ') : ''}`);
  await ctx.close();
}

if (parts.includes('save')) {
  const { readFileSync } = await import('node:fs');
  const until = (page, fn, ms = 20_000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
  const { ctx, page, errs } = await open({ width: 1280, height: 800 });
  await page.evaluate(() => { window.__eco.toStart(); window.__eco.focusBoard(); });
  check(await until(page, () => window.__eco.focus.k >= 1, 30_000), 'save: zoomed on the board');
  const dl = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
  await page.click('#focus-save', { timeout: 3000 }).catch(() => {});
  const d = await dl;
  check(!!d && d.suggestedFilename() === 'raceway-top-10.png', `save: a download named raceway-top-10.png (${d ? d.suggestedFilename() : 'no download'})`);
  if (d) {
    const buf = readFileSync(await d.path());
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // the PNG's IHDR
    check(w === 1400 && h === 1110, `save: the board plus the band, ${w} by ${h}`);
  }
  check(errs.length === 0, `save: no page errors${errs.length ? ' ' + errs.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `${failures.length} failure(s)` : 'clean');
process.exit(failures.length ? 1 : 0);
