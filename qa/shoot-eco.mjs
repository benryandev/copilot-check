// Design-QA screenshots for the ecosystem world (dev only).
// Usage: node qa/shoot-eco.mjs [baseUrl] [--states=intro,map] [--widths=375,1280] [--themes=dark]
// Shoots each state × width × theme to qa/shots/eco-<state>-<width>-<theme>.png and prints, per frame:
//   - sideways scroll, sheets past the viewport, HUD pieces off-screen or overlapping each other;
//   - tap targets under 44px on touch layouts (375 and 768 run as touch devices);
//   - WCAG AA contrast on panel text. A translucent panel is tried over a black and a white scene and the worse
//     ratio counts; text straight on the 3D scene has no measurable backing, so judge it from the screenshot;
//   - page errors.
// The 3D renders in software (SwiftShader), so frame rates are low: states that wait on the frame loop sleep longer.
// Test-environment artifacts: "Leaderboard offline" unless the origin is one the race API allows (localhost:8766,
// strike.benryan.com.au); the race-finish sheet is filled in by the script, so the HUD's "Best" won't match it.
import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}

const args = process.argv.slice(2);
const base = (args.find(a => !a.startsWith('--')) || 'http://localhost:8080').replace(/\/$/, '');
const opt = k => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1]?.split(',');
// Phones: 360 (small Android), 375 (iPhone SE/mini), 390 (iPhone 14/15), 430 (Pro Max, which a 420 px breakpoint misses), 844 = a phone on its side
const HEIGHT = { 360: 780, 375: 812, 390: 844, 430: 932, 768: 1024, 844: 390, 1024: 768, 1440: 900, 1920: 1080 };
const PHONE = new Set([360, 375, 390, 430, 844]);
const WIDTHS = (opt('widths') || ['360', '375', '390', '430', '844', '768', '1001', '1024', '1279', '1280', '1440', '1920']).map(Number);
const THEMES = opt('themes') || ['light', 'dark'];
const ALL = ['loading', 'arrive', 'intro', 'drive', 'stop', 'yard', 'yardSheet', 'peers', 'peersSheet', 'map', 'mapEnd', 'raceway', 'ghost', 'race'];
const pick = opt('states') || ALL;
const out = new URL('./shots/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runs in the page: returns a list of problems (empty when clean).
function audit() {
  const issues = [];
  // On a mobile viewport Chrome widens the layout to fit oversized content (innerWidth grows), so measure against
  // the device width too
  const W = Math.min(innerWidth, screen.width), H = innerHeight;
  if (document.documentElement.scrollWidth > W + 1) issues.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${W}`);
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]') && (!el.closest('dialog') || el.closest('dialog').open); };
  for (const d of document.querySelectorAll('dialog[open]')) {
    const r = d.getBoundingClientRect();
    if (r.left < 0 || r.right > W + 0.5 || r.top < 0 || r.bottom > H + 0.5) issues.push(`sheet #${d.id} past the viewport`);
    if (d.scrollWidth > d.clientWidth + 1) issues.push(`sheet #${d.id} scrolls sideways (${d.scrollWidth} > ${d.clientWidth})`);
  }
  for (const el of document.querySelectorAll('.hud, .touch, .hud .chip')) { // HUD chips too: a third chip can push its neighbour off the right edge (chips inside a scrolling sheet are allowed below the fold)
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < -0.5 || r.right > W + 0.5 || r.top < -0.5 || r.bottom > H + 0.5) issues.push(`${el.id || el.className} outside the viewport`);
  }
  const hud = [...document.querySelectorAll('.hud-title, .hud-actions, .prompt-card, #race-hud, .touch-group, .hud-foot')].filter(vis);
  for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) {
    const a = hud[i].getBoundingClientRect(), b = hud[j].getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 1 && oy > 1) issues.push(`overlap: ${hud[i].id || hud[i].className} / ${hud[j].id || hud[j].className} (${ox.toFixed(0)}×${oy.toFixed(0)})`);
  }
  if (matchMedia('(pointer: coarse)').matches) {
    for (const el of document.querySelectorAll('button, a, input')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) issues.push(`tap target ${Math.round(r.width)}×${Math.round(r.height)}: ${(el.id || el.textContent.trim() || el.className).slice(0, 30)}`);
    }
  }
  // Colours: rgb()/rgba() are 0–255; color(srgb r g b / a) (what color-mix() computes to) is 0–1
  const parse = c => {
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    const n = m.map(Number);
    return c.startsWith('color(') ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : n;
  };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => { const a = top[3] ?? 1; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)); };
  // Panels up to (not including) <body>, whose colour sits behind the canvas. Returns the backing over a black and
  // over a white scene, or null when nothing at least 60% opaque is behind the text.
  const backings = el => {
    const layers = [];
    for (let e = el; e && e.tagName !== 'BODY' && e.tagName !== 'HTML'; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && (c[3] ?? 1) > 0) { layers.push(c); if ((c[3] ?? 1) >= 0.99) break; }
    }
    if (!layers.length || (layers.at(-1)[3] ?? 1) < 0.6) return null;
    return [[0, 0, 0], [255, 255, 255]].map(scene => layers.reduceRight((c, l) => blend(l, c), scene));
  };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!text) continue;
    const s = getComputedStyle(el), fg = parse(s.color), bgs = backings(el);
    if (!fg || !bgs) continue;
    const ratio = Math.min(...bgs.map(bg => { const A = lum(blend(fg, bg)), B = lum(bg); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); }));
    const px = parseFloat(s.fontSize), need = px >= 24 || (+s.fontWeight >= 700 && px >= 18.66) ? 3 : 4.5;
    const key = `${text.slice(0, 24)}|${ratio.toFixed(2)}`;
    if (ratio < need && !seen.has(key)) { seen.add(key); issues.push(`contrast ${ratio.toFixed(2)} < ${need}: "${text.slice(0, 40)}" (${px}px)`); }
  }
  return issues;
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let problems = 0;
// Self-test: the audit must catch a translucent panel that fails only over a dark scene (and parse its color(srgb)
// background), a pale line on an opaque panel, sideways scroll and a small tap target; or its silence means nothing.
{
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.setContent(`<body style="margin:0">
    <div style="background:color-mix(in srgb, #fff 88%, transparent);color:#6b7280">grey on a translucent panel</div>
    <div style="background:#fff;color:#bbb">pale grey text</div>
    <div style="width:600px;background:#fff;color:#000">wide</div>
    <button style="width:30px;height:30px">x</button></body>`);
  const a = await page.evaluate(audit);
  const ok = a.some(i => i.includes('translucent')) && a.some(i => i.includes('pale grey')) && a.some(i => i.startsWith('page scrolls'))
    && a.some(i => i.startsWith('tap target 30×30')) && a.length === 4;
  console.log(ok ? 'ok   audit self-test' : `FAIL audit self-test ${JSON.stringify(a)}`);
  if (!ok) process.exit(1);
  await ctx.close();
}

for (const w of WIDTHS) for (const theme of THEMES) {
  const tag = `${w}-${theme}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const touch = w <= 768 || PHONE.has(w);
    const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT[w] || 800 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, colorScheme: theme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
    const shot = async (state, wait = 700) => {
      if (!pick.includes(state)) return;
      await sleep(wait);
      await page.screenshot({ path: `${out}eco-${state}-${tag}.png` });
      const found = await page.evaluate(audit);
      problems += found.length;
      for (const i of found) console.log(`     ${state}-${tag}: ${i}`);
    };
    try {
      // No live room in the shoot (peers are injected below); the opening flight only when it is being shot
      await page.goto(`${base}/ecosystem/?mp=0${pick.includes('arrive') ? '' : '&arrive=0'}#${theme}`, { waitUntil: 'domcontentloaded' });
      if (pick.includes('loading')) { await sleep(150); await page.screenshot({ path: `${out}eco-loading-${tag}.png` }); }
      // The opening flight: title card in, the city still high in frame (wall-clock timed, so the same moment here)
      if (pick.includes('arrive')) {
        await page.waitForFunction(() => document.body.classList.contains('is-arriving'), null, { timeout: 60000 });
        await shot('arrive', 1900);
      }
      await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await shot('intro', 2500);
      await page.click('#start');
      await page.evaluate(() => window.__eco.teleport('liquidations'));
      await shot('drive');
      await page.click('#prompt-btn');
      await shot('stop');
      await page.evaluate(() => document.querySelector('#stop [data-close]').click());
      await page.evaluate(() => window.__eco.teleport('fillyard'));
      await shot('yard', 3000); // the conveyor and whatever the trade stream has sent
      await page.click('#prompt-btn');
      await shot('yardSheet'); // its sheet, with the three figures from the stream
      await page.evaluate(() => document.querySelector('#stop [data-close]').click());
      // Three other visitors stood around the car (no room needed), then the who's-here sheet
      await page.evaluate(() => {
        const c = window.__eco.car.s, sin = Math.sin(c.heading), cos = Math.cos(c.heading);
        // f metres ahead of the car and r to its right, so they sit in the camera's view whichever way it faces
        const at = (f, r) => ({ x: c.x - sin * f + cos * r, z: c.z - cos * f - sin * r });
        window.__eco.peersInject([
          { id: 'p1', name: 'Aveli', colour: '#22d3ee', ...at(4, -6), h: c.heading + 0.4 },
          { id: 'p2', name: 'ADA_ACE', colour: '#facc15', ...at(6, 6), h: c.heading - 0.3 },
          { id: 'p3', name: 'Driver 07', colour: '#ec4899', ...at(13, -10), h: c.heading + 3 },
        ]);
      });
      await shot('peers', 2500);
      await page.click('#peers-chip');
      await shot('peersSheet');
      await page.evaluate(() => document.querySelector('#peers [data-close]').click());
      await page.click('#open-map');
      await shot('map');
      await page.evaluate(() => { const d = document.getElementById('map'); d.scrollTop = d.scrollHeight; });
      await shot('mapEnd');
      await page.evaluate(() => document.querySelector('#map [data-close]').click());
      await page.evaluate(() => window.__eco.toStart());
      await shot('raceway', 3000); // the race HUD updates every 16 frames
      // The ghost, held 1.4 s into a stand-in leader's lap so it sits just ahead of the car (the real board may be offline here)
      await page.evaluate(() => window.__eco.ghostPreview(1.4, { name: 'Ben', ms: 25449, splits: [8570, 11900, 16630, 19950, 21840] }));
      await shot('ghost', 1500);
      await page.evaluate(() => window.__eco.ghostPreview(null));
      // The lap-finish sheet, filled in as openFinish() fills it
      await page.evaluate(() => {
        document.getElementById('race-result').textContent = '0:25.853';
        document.getElementById('race-gap').textContent = 'New best, 1.417 s faster than your last best (0:27.270).';
        document.getElementById('race-form').hidden = false;
        document.getElementById('race-best-note').hidden = false; // the device's unposted best, offered under the form
        document.getElementById('race-best-time').textContent = '0:24.892';
        document.getElementById('race').showModal();
      });
      await shot('race');
      problems += errors.length;
      for (const e of errors) console.log(`     ${tag}: page error ${e}`);
      console.log(`done ${tag}`);
      await ctx.close();
      break;
    } catch (err) {
      await ctx.close();
      console.log(`${attempt === 2 ? 'FAIL' : 'retry'} ${tag}: ${String(err).split('\n')[0]}`);
      if (attempt === 2) problems++;
    }
  }
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'clean');
process.exit(problems ? 1 : 0);
