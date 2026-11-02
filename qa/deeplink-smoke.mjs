// Deep links end to end (dev only): node qa/serve.mjs & node qa/deeplink-smoke.mjs [baseUrl]
//   ?stop=slp       no intro, the stop sheet open on "SLP Vault", the car within 6 m of the SLP pad
//   ?stop=raceway   race HUD visible, no sheet open
//   ?stop=getting-started  the hub's hand-placed pad, sheet open, no intro
//   ?stop=nope      a normal visit: the intro sheet, no stop sheet
//   Copy link       with clipboard-write granted the chip says "Link copied"; without it the chip shows the URL
// Also loads /ecosystem/stops/ and asserts no page errors there. Exits 1 on any failure.
// Runs against http://localhost:8766 by default (PORT=8766 node qa/serve.mjs): that is the local origin the race and
// arcade API allow, so their replies are not CORS errors here. The room is off (?mp=0) so no socket is opened.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const base = (process.argv[2] || 'http://localhost:8766').replace(/\/$/, '');
const world = (q) => `/ecosystem/?mp=0&${q}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };

async function open(path, { clipboard = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: clipboard ? ['clipboard-write', 'clipboard-read'] : [] });
  await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); localStorage.setItem('eco-tier', 'low'); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eco && !document.getElementById('loader'), null, { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { ctx, page, errs };
}

// ?stop=slp
{
  const { ctx, page, errs } = await open(world('stop=slp'));
  const st = await page.evaluate(() => {
    const pad = window.__eco.pads.find((p) => p.stop.key === 'slp');
    const c = window.__eco.car.s;
    return { intro: document.getElementById('intro').open, stop: document.getElementById('stop').open, title: document.getElementById('stop-title').textContent,
      dist: Math.hypot(c.x - pad.pos.x, c.z - pad.pos.z), url: document.getElementById('stop-link').dataset.url };
  });
  check(!st.intro, 'stop=slp: no intro sheet');
  check(st.stop && st.title === 'SLP Vault', `stop=slp: sheet open on "${st.title}"`);
  check(st.dist < 6, `stop=slp: car ${st.dist.toFixed(1)} m from the pad`);
  check(st.url === `${base}/ecosystem/?stop=slp`, `stop=slp: link chip url ${st.url}`);
  check(errs.length === 0, `stop=slp: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  // Copy link without clipboard permission: a read-only field holding the URL, selected, so it can be copied by hand
  await page.click('#stop-link');
  await page.waitForTimeout(200);
  const fb = await page.evaluate(() => {
    const i = document.getElementById('stop-link-url');
    return { shown: !!i && !i.hidden && i.offsetParent !== null, value: i ? i.value : '', selected: !!i && document.activeElement === i && i.selectionStart === 0 && i.selectionEnd === i.value.length, btnHidden: document.getElementById('stop-link').hidden };
  });
  check(fb.shown && fb.value.endsWith('?stop=slp') && fb.selected && fb.btnHidden, `copy link, no clipboard: url field shown and selected (${fb.value}), chip hidden`);
  await ctx.close();
}
// Copy link with the clipboard
{
  const { ctx, page } = await open(world('stop=slp'), { clipboard: true });
  await page.click('#stop-link');
  await page.waitForTimeout(200);
  const t = await page.evaluate(() => document.querySelector('#stop-link .br-button-label').textContent);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(t === 'Link copied', `copy link, clipboard granted: chip says "${t}"`);
  check(clip.endsWith('/ecosystem/?stop=slp'), `copy link: clipboard holds ${clip}`);
  await ctx.close();
}
// Can the car drive after a deep link that opens no sheet? (the world starts paused and only a closing sheet unpauses it)
// Returns metres moved under 2 s of throttle, or -1 when the world is still paused. The software renderer runs a
// few frames a second, so the distance is small but non-zero once the car is live.
async function drives(page) {
  if (await page.evaluate(() => window.__eco.paused())) return -1;
  const before = await page.evaluate(() => ({ x: window.__eco.car.s.x, z: window.__eco.car.s.z }));
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2000); await page.keyboard.up('ArrowUp');
  const after = await page.evaluate(() => ({ x: window.__eco.car.s.x, z: window.__eco.car.s.z }));
  return Math.hypot(after.x - before.x, after.z - before.z);
}
// ?stop=raceway
{
  const { ctx, page, errs } = await open(world('stop=raceway'));
  await page.waitForFunction(() => !document.getElementById('race-hud').hidden, null, { timeout: 15_000 }).catch(() => {}); // the HUD follows the frame loop
  const st = await page.evaluate(() => ({ hud: !document.getElementById('race-hud').hidden, intro: document.getElementById('intro').open, stop: document.getElementById('stop').open }));
  check(st.hud && !st.intro && !st.stop, `stop=raceway: race HUD ${st.hud}, intro ${st.intro}, sheet ${st.stop}`);
  const moved = await drives(page);
  check(moved > 0.1, `stop=raceway: not paused, the car drives (${moved.toFixed(1)} m in 2 s of throttle)`);
  check(errs.length === 0, `stop=raceway: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
// ?district=perps
{
  const { ctx, page, errs } = await open(world('district=perps'));
  const st = await page.evaluate(() => ({ intro: document.getElementById('intro').open, where: document.getElementById('where').textContent }));
  check(!st.intro, `district=perps: no intro sheet (HUD says "${st.where}")`);
  const moved = await drives(page);
  check(moved > 0.1, `district=perps: not paused, the car drives (${moved.toFixed(1)} m)`);
  check(errs.length === 0, `district=perps: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
// ?district=hub: Strike HQ has no spoke road, so this must land at the spawn, not crash
{
  const { ctx, page, errs } = await open(world('district=hub'));
  const st = await page.evaluate(() => (window.__eco ? { ok: true, intro: document.getElementById('intro').open, x: window.__eco.car.s.x, z: window.__eco.car.s.z } : { ok: false }));
  check(st.ok && !st.intro && Math.hypot(st.x, st.z) < 30, `district=hub: lands by HQ, no intro (${st.ok ? `${st.x.toFixed(0)}, ${st.z.toFixed(0)}` : 'world never loaded'})`);
  check(errs.length === 0, `district=hub: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
// Without JavaScript: the noscript box must be what the visitor sees, not the loader
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(base + '/ecosystem/', { waitUntil: 'load' });
  const st = await page.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { top: el ? (el.closest('.noscript') ? 'noscript' : el.id || el.className || el.tagName) : 'none', hasLink: !!document.querySelector('.noscript a[href="/ecosystem/stops/"]') };
  });
  check(st.top === 'noscript' && st.hasLink, `no JS: the noscript box is on top (topmost at centre: ${st.top})`);
  await ctx.close();
}
// ?stop=getting-started: a hand-placed hub pad, the first from the arrival
{
  const { ctx, page, errs } = await open(world('stop=getting-started'));
  const st = await page.evaluate(() => {
    const pad = window.__eco.pads.find((p) => p.stop.key === 'getting-started');
    const c = window.__eco.car.s;
    return { intro: document.getElementById('intro').open, stop: document.getElementById('stop').open, title: document.getElementById('stop-title').textContent,
      dist: pad ? Math.hypot(c.x - pad.pos.x, c.z - pad.pos.z) : Infinity };
  });
  check(!st.intro && st.stop && st.title === 'Getting started', `stop=getting-started: sheet open on "${st.title}", no intro`);
  check(st.dist < 6, `stop=getting-started: car ${st.dist.toFixed(1)} m from the pad`);
  check(errs.length === 0, `stop=getting-started: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
// ?stop=nope
{
  const { ctx, page, errs } = await open(world('stop=nope&arrive=0'));
  const st = await page.evaluate(() => ({ intro: document.getElementById('intro').open, stop: document.getElementById('stop').open, prompt: !document.getElementById('prompt').hidden, kind: window.__eco.deepLink.kind }));
  check(st.intro && st.kind === null, `stop=nope: intro shown, link ignored (kind ${st.kind})`);
  check(!st.stop && !st.prompt, 'stop=nope: no stop sheet and no pad prompt at landing (the Getting started pad is outside the trigger)');
  check(errs.length === 0, `stop=nope: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
// The stops page
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + '/ecosystem/stops/', { waitUntil: 'load' });
  const n = await page.evaluate(() => document.querySelectorAll('article.stop a[href^="/ecosystem/?stop="]').length);
  check(n > 50, `stops page: ${n} Drive there links`);
  check(errs.length === 0, `stops page: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
await browser.close();
if (failures.length) { console.log(`deeplink smoke: ${failures.length} failure(s)`); process.exit(1); }
console.log('deeplink smoke: ok');
