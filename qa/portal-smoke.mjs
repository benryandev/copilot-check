// The portal end to end (dev only). Needs the site on 8766: PORT=8766 node qa/serve.mjs & node qa/portal-smoke.mjs [baseUrl]
// Runs in Chromium and WebKit, one line per browser, exit 1 on any failure. The room is off (?mp=0, put back on every page
// the arches load, since they navigate to bare urls); the hub opens with ?venues=1 (the preview) and its opening flight runs.
//   (a) hub → Lagoon: the car 15 m before the arch, up held → the venue holds (body.is-holding) then lands: HUD title
//       "The Lagoon", the car on the grid at speed 0, no #intro open, is-holding gone
//   (b) the Lagoon's arch → the hub: lands on the venue road (about 10 m short of the arch) facing the ring, no intro, and the
//       hub's url keeps ?venues=1 (the preview survives the round trip)
//   (c) page.goBack() from the hub of (b), back to the venue page (a) reached: no record, so its normal direct opening
//       (no is-holding within 5 s of load, the car on the grid)
//   (d) a stale record (at = now − 60 s) in sessionStorage before the venue loads: ignored, normal opening, the key gone
//   (e) during the transitions of (a) and (b) a JPEG (quality 30) every 100 ms for 2.5 s from the crossing; each frame is
//       decoded by drawing it into a canvas on a separate blank page and must not be near-white (≥ 90% of its pixels with
//       every channel ≥ 240). The light sky (#cfe0ec) the veil fades to has a minimum channel of 207, so it passes.
// Debug: PORTAL_BROWSERS=webkit runs one browser; PORTAL_DUMP=<dir> writes every transition frame there and prints the shares.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
let pw;
try { pw = await import('playwright'); } catch {
  const g = execSync('npm root -g').toString().trim();
  pw = createRequire(`${g}/`)('playwright');
}
const base = (process.argv[2] || 'http://localhost:8766').replace(/\/$/, '');
const VENUE = '/ecosystem/tracks/lagoon/';

async function run(name, type) {
  const browser = await type.launch(name === 'chromium' ? { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); return ok; };
  const decoder = await (await browser.newContext()).newPage();
  await decoder.setContent('<canvas id=c></canvas>');
  const whiteShare = (b64) => decoder.evaluate(async (src) => {
    const img = new Image(); img.src = `data:image/jpeg;base64,${src}`; await img.decode();
    const c = document.getElementById('c'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let w = 0; for (let i = 0; i < d.length; i += 4) if (d[i] >= 240 && d[i + 1] >= 240 && d[i + 2] >= 240) w++;
    return w / (d.length / 4);
  }, b64);

  async function context({ seedStale = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(({ seedStale, VENUE }) => {
      try { localStorage.setItem('theme', 'light'); localStorage.setItem('eco-tier', 'low'); } catch {}
      const q = new URLSearchParams(location.search);
      if (q.get('mp') !== '0') { q.set('mp', '0'); history.replaceState(history.state, '', `${location.pathname}?${q}`); }
      if (seedStale && !sessionStorage.getItem('smoke-seeded')) {
        sessionStorage.setItem('smoke-seeded', '1');
        sessionStorage.setItem('eco-portal', JSON.stringify({ from: 'hub', to: VENUE, camOff: [0, 60, 0], lookOff: [0, 0, -30], heading: 0, preview: true, at: Date.now() - 60_000 }));
      }
    }, { seedStale, VENUE });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    return { ctx, page, errs };
  }
  const ready = (page) => page.waitForFunction(() => window.__eco && !document.getElementById('loader'), null, { timeout: 120_000 });
  const state = (page) => page.evaluate(() => {
    const s = window.__eco.car.s;
    return { x: s.x, z: s.z, heading: s.heading, speed: s.speed, paused: window.__eco.paused(), intro: document.getElementById('intro').open, holding: document.body.classList.contains('is-holding'), title: document.getElementById('where')?.textContent?.trim() ?? null, url: location.pathname + location.search };
  });
  // Through the first arch: 15 m before it, facing it, up held; then frames every 100 ms for 2.5 s from the crossing
  async function through(page, label) {
    await page.evaluate(() => { const [l] = window.__eco.portalLines(); window.__eco.placeCar(l.x - l.fx * 15, l.z - l.fz * 15, Math.atan2(-l.fx, -l.fz)); window.__eco.keys.up = true; });
    await page.waitForFunction(() => window.__eco?.portalState?.(), null, { timeout: 20_000 });
    const t0 = Date.now(), bufs = [];
    while (Date.now() - t0 < 2500) { // decoded afterwards, so the capture loop only waits on the screenshots
      const tick = Date.now();
      const buf = await page.screenshot({ type: 'jpeg', quality: 30, timeout: 2000 }).catch(() => null);
      if (buf) bufs.push(buf);
      if (buf && process.env.PORTAL_DUMP) (await import('node:fs')).writeFileSync(`${process.env.PORTAL_DUMP}/${name}-${label.replace(/\W+/g, '_')}-${String(Date.now() - t0).padStart(4, '0')}.jpg`, buf);
      const wait = 100 - (Date.now() - tick); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    let worst = 0;
    const shares = []; for (const b of bufs) { const w = await whiteShare(b.toString('base64')); shares.push(+w.toFixed(2)); worst = Math.max(worst, w); }
    if (process.env.PORTAL_DUMP) console.log(name, label, JSON.stringify(shares));
    const n = bufs.length;
    check(n > 0 && worst < 0.9, `${label}: ${n} frames, the whitest ${(worst * 100).toFixed(0)}% near-white`);
    return { n, worst };
  }
  const near = (a, b, m) => Math.hypot(a.x - b.x, a.z - b.z) < m;
  const out = {};
  try {
    // (a) + (b) + (c) in one tab
    {
      const { ctx, page, errs } = await context();
      await page.goto(`${base}/ecosystem/?venues=1&mp=0`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__eco?.arrival?.(), null, { timeout: 120_000 }).catch(() => {});
      await page.keyboard.press('Space'); // the hub's opening flight, skipped
      await page.waitForFunction(() => document.getElementById('intro')?.open, null, { timeout: 120_000 });
      await page.click('#start'); await page.waitForTimeout(500);
      check((await page.evaluate(() => window.__eco.portalLines().length)) === 1, '(a) the hub preview has one arch');
      out.a = await through(page, '(e) hub → venue');
      await page.waitForURL((u) => u.pathname === VENUE, { timeout: 30_000 });
      const held = await page.waitForFunction(() => document.body.classList.contains('is-holding'), null, { timeout: 30_000 }).then(() => true, () => false);
      check(held, '(a) the venue holds (is-holding)');
      await page.waitForFunction(() => window.__eco && !document.body.classList.contains('is-holding'), null, { timeout: 120_000 });
      await page.waitForTimeout(400);
      const va = await state(page);
      const grid = { x: va.x, z: va.z };
      check(va.title === 'The Lagoon', `(a) HUD title "${va.title}"`);
      check(va.speed === 0 && !va.paused && !va.intro && !va.holding, `(a) landed ${JSON.stringify(va)}`);
      const spawn = await page.evaluate(() => { const l = window.__eco.portalLines()[0]; return { line: !!l }; });
      check(spawn.line, '(a) the venue has its arch home');
      out.b = await through(page, '(e) venue → hub');
      await page.waitForURL((u) => u.pathname === '/ecosystem/', { timeout: 30_000 });
      await page.waitForFunction(() => window.__eco && !document.body.classList.contains('is-holding') && !document.getElementById('loader'), null, { timeout: 120_000 });
      await page.waitForTimeout(400);
      const hb = await state(page);
      const rel = await page.evaluate(() => { const [l] = window.__eco.portalLines(); const s = window.__eco.car.s; return { d: Math.hypot(s.x - l.x, s.z - l.z), dot: -Math.sin(s.heading) * l.fx - Math.cos(s.heading) * l.fz }; });
      check(new URLSearchParams(hb.url.split('?')[1]).get('venues') === '1', `(b) the hub url keeps the preview: ${hb.url}`);
      check(Math.abs(rel.d - 10) < 1.5 && rel.dot < -0.95, `(b) on the venue road facing the ring: ${rel.d.toFixed(1)} m from the arch, facing dot ${rel.dot.toFixed(2)}`);
      check(hb.speed === 0 && !hb.paused && !hb.intro && !hb.holding, `(b) landed ${JSON.stringify(hb)}`);
      // (c)
      await page.evaluate(() => sessionStorage.removeItem('eco-portal'));
      await page.goBack({ waitUntil: 'load' });
      const t0 = Date.now(); let holdSeen = false;
      while (Date.now() - t0 < 5000) { holdSeen ||= await page.evaluate(() => document.body.classList.contains('is-holding')).catch(() => false); await page.waitForTimeout(100); }
      await ready(page); await page.waitForTimeout(300);
      const vc = await state(page);
      check(new URL(page.url()).pathname === VENUE, `(c) back on the venue: ${page.url()}`);
      check(!holdSeen, '(c) no is-holding within 5 s');
      check(near(vc, grid, 2) && vc.speed === 0, `(c) the car on the grid ${JSON.stringify(vc)}`);
      out.c = vc.intro ? 'intro' : 'no intro';
      check(errs.length === 0, `(a–c) page errors ${JSON.stringify(errs)}`);
      await ctx.close();
      out.grid = grid;
    }
    // (d)
    {
      const { ctx, page, errs } = await context({ seedStale: true });
      await page.goto(`${base}${VENUE}?mp=0`, { waitUntil: 'load' });
      const t0 = Date.now(); let holdSeen = false;
      while (Date.now() - t0 < 5000) { holdSeen ||= await page.evaluate(() => document.body.classList.contains('is-holding')).catch(() => false); await page.waitForTimeout(100); }
      await ready(page); await page.waitForTimeout(300);
      const vd = await state(page);
      const key = await page.evaluate(() => sessionStorage.getItem('eco-portal'));
      check(!holdSeen, '(d) a stale record: no is-holding');
      check(key === null, '(d) the stale key is gone');
      check(near(vd, out.grid, 2) && vd.speed === 0 && (await page.evaluate(() => window.__eco.landing())) === null, `(d) normal opening on the grid ${JSON.stringify(vd)}`);
      check(errs.length === 0, `(d) page errors ${JSON.stringify(errs)}`);
      await ctx.close();
    }
  } catch (e) { fails.push(`threw: ${e.message.split('\n')[0]}`); }
  await browser.close();
  const frames = out.a && out.b ? `frames ${out.a.n}+${out.b.n}, whitest ${(Math.max(out.a.worst, out.b.worst) * 100).toFixed(0)}%` : 'frames n/a';
  console.log(`${fails.length ? 'FAIL' : 'ok  '} ${name}: (a)–(e) ${fails.length ? fails.join('; ') : 'pass'}; ${frames}; (c) opening ${out.c ?? 'n/a'}`);
  return fails.length === 0;
}

const results = [];
for (const name of (process.env.PORTAL_BROWSERS || 'chromium,webkit').split(',')) results.push(await run(name, pw[name]));
process.exit(results.every(Boolean) ? 0 : 1);
