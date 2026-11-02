// Deep links end to end (dev only): node qa/serve.mjs & node qa/deeplink-smoke.mjs [baseUrl]
//   ?stop=slp       no intro, the stop sheet open on "SLP Vault", the car within 6 m of the SLP pad
//   ?stop=raceway   race HUD visible, no sheet open
//   ?stop=nope      a normal visit: the intro sheet
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
  // Copy link without clipboard permission: the chip becomes the URL
  await page.click('#stop-link');
  await page.waitForTimeout(200);
  const fb = await page.evaluate(() => ({ cls: document.getElementById('stop-link').className, text: document.querySelector('#stop-link .br-button-label').textContent }));
  check(fb.cls.includes('is-url') && fb.text.endsWith('?stop=slp'), `copy link, no clipboard: chip shows the url (${fb.text})`);
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
// ?stop=raceway
{
  const { ctx, page, errs } = await open(world('stop=raceway'));
  await page.waitForFunction(() => !document.getElementById('race-hud').hidden, null, { timeout: 15_000 }).catch(() => {}); // the HUD follows the frame loop
  const st = await page.evaluate(() => ({ hud: !document.getElementById('race-hud').hidden, intro: document.getElementById('intro').open, stop: document.getElementById('stop').open }));
  check(st.hud && !st.intro && !st.stop, `stop=raceway: race HUD ${st.hud}, intro ${st.intro}, sheet ${st.stop}`);
  check(errs.length === 0, `stop=raceway: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
// ?stop=nope
{
  const { ctx, page, errs } = await open(world('stop=nope&arrive=0'));
  const st = await page.evaluate(() => ({ intro: document.getElementById('intro').open, kind: window.__eco.deepLink.kind }));
  check(st.intro && st.kind === null, `stop=nope: intro shown, link ignored (kind ${st.kind})`);
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
