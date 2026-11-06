// Design-QA screenshots for the ecosystem world (dev only).
// Usage: node qa/shoot-eco.mjs [baseUrl] [--states=intro,map] [--widths=375,1280] [--themes=dark] [--page=/ecosystem/tracks/lagoon/]
// --page shoots a venue page instead of the hub, its frames named eco-<slug>-<state>-<width>-<theme>.png (eco-lagoon-grid-375-dark.png)
// so a venue run never overwrites the hub's: loading, intro (the direct-visit intro, the opening flight skipped with &arrive=0),
// grid (the car on the grid once the intro closes), drive (up held until the car is past the start line and the lap clock
// runs), peers (the car back behind the line with no lap running, three stand-ins apart on the grid in the venue's zone; a peer
// in another zone is parked, not drawn), jump (the lap run to the ramp's run-up first so the HUD counts its checkpoints, then
// the car driven over the ramp at speed and shot in the air over the inlet, the stunt camera up), map, race (the finish sheet
// with Lagoon times above its floor, a new best, each time stated once). raceway and ghost are hub states only: the venue is the track, so raceway would be
// the grid again, and the ghost needs the open worker's board, which is a production check. Two hub states cross the portal
// and need ?venues=1 (the shoot adds it): portalOut (the flight to the Lagoon frozen mid-way with the portalHold hook) and
// portalIn (the venue's hold under a real hand-off record, then the landed frame). They run with --page or on their own:
// --states=portalOut,portalIn.
// Shoots each state × width × theme to qa/shots/eco-<state>-<width>-<theme>.png (the venue's prefixed, above) and prints, per frame:
//   - sideways scroll, sheets past the viewport, HUD pieces off-screen or overlapping each other;
//   - tap targets under 44px on touch layouts (375 and 768 run as touch devices);
//   - WCAG AA contrast on panel text. A translucent panel is tried over a black and a white scene and the worse
//     ratio counts; text straight on the 3D scene has no measurable backing, so judge it from the screenshot;
//   - page errors.
// The 3D renders in software (SwiftShader), so frame rates are low: states that wait on the frame loop sleep longer.
// Test-environment artifacts: "Leaderboard offline" unless the origin is one the race API allows (localhost:8766,
// strike.benryan.com.au); the race-finish sheet is filled in by the script, so the HUD's "Best" won't match it.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
const ALL = ['loading', 'arrive', 'intro', 'drive', 'boost', 'bridge', 'ford', 'stunt', 'ridge', 'windsocks', 'stop', 'plaza', 'yard', 'yardSheet', 'cabinet', 'arcade', 'peers', 'emote', 'peersSheet', 'map', 'mapEnd', 'raceway', 'walls', 'ghost', 'fireworks', 'raceGrid', 'racePos', 'raceInvite', 'race', 'deeplink', 'guide'];
const PAGE = args.find(a => a.startsWith('--page='))?.slice(7) || null;
const VENUE_STATES = ['loading', 'intro', 'grid', 'drive', 'peers', 'jump', 'map', 'race'], PORTAL_STATES = ['portalOut', 'portalIn'];
// A venue run's frames carry its slug (R30), so they sit beside the hub's instead of over them
const SLUG = PAGE ? (/\/tracks\/([a-z0-9-]+)\/?/.exec(PAGE)?.[1] ?? 'venue') : null;
const PREFIX = SLUG ? `eco-${SLUG}-` : 'eco-';
const pick = opt('states') || (PAGE ? [...VENUE_STATES, ...PORTAL_STATES] : ALL);
const hubFlow = !PAGE && pick.some(x => ALL.includes(x));
const venueFlow = !!PAGE && pick.some(x => VENUE_STATES.includes(x));
const portalFlow = pick.some(x => PORTAL_STATES.includes(x));
const FUNDING = JSON.parse(readFileSync(new URL('./fixtures/funding-2026-11-02.json', import.meta.url), 'utf8')); // the windsocks' fixed comparison (2 Nov 2026: ADA out straight, BTC gentle)
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
    if (/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\s]+$/u.test(text)) continue; // colour emoji ignore `color`: the emote row and chip
    const s = getComputedStyle(el), fg = parse(s.color), bgs = backings(el);
    if (!fg || !bgs) continue;
    const ratio = Math.min(...bgs.map(bg => { const A = lum(blend(fg, bg)), B = lum(bg); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); }));
    const px = parseFloat(s.fontSize), need = px >= 24 || (+s.fontWeight >= 700 && px >= 18.66) ? 3 : 4.5;
    const key = `${text.slice(0, 24)}|${ratio.toFixed(2)}`;
    if (ratio < need && !seen.has(key)) { seen.add(key); issues.push(`contrast ${ratio.toFixed(2)} < ${need}: "${text.slice(0, 40)}" (${px}px)`); }
  }
  return issues;
}

// The start gantry's twelve key points (beam ends at 5.6 and 7.45 m, post tops and feet, outer and inner faces) projected through
// the live camera: every one must sit inside the viewport with a 3% margin, or the grid shot clips the gantry (Lagoon v2 Task 3).
async function gantryFit(page) {
  return page.evaluate(() => {
    const e = window.__eco, g = e.raceGates[0], rx = -g.fz, rz = g.fx, pts = [];
    const add = (name, lat, y) => { const x = g.x + rx * lat, z = g.z + rz * lat; pts.push([name, e.project(x, y, z)]); };
    for (const lat of [-9.1, 9.1]) for (const y of [5.6, 7.45]) add(`beam ${lat < 0 ? 'L' : 'R'} ${y}`, lat, e.groundHeight(g.x, g.z) + y);
    for (const lat of [-8.8, -7.6, 7.6, 8.8]) { add(`post top ${lat}`, lat, e.groundHeight(g.x, g.z) + 7.4); add(`post foot ${lat}`, lat, e.groundHeight(g.x, g.z)); }
    const W = innerWidth, H = innerHeight, mx = W * 0.03, my = H * 0.03;
    let worst = Infinity, bad = [];
    for (const [name, p] of pts) {
      const m = Math.min(p.x - mx, W - mx - p.x, p.y - my, H - my - p.y);
      worst = Math.min(worst, m);
      if (m < 0) bad.push(`${name} at ${Math.round(p.x)},${Math.round(p.y)} (${Math.round(-m)}px outside)`);
    }
    return { worst: Math.round(worst), bad, W, H };
  });
}

// The jump frame (Lagoon v2 Task 4), judged through the live stunt camera: (i) the ramp deck's four corners projected and clipped
// to the viewport (Sutherland-Hodgman) must cover under 6% of it, (ii) gate 3's banner (7.2 x 1.2 m at 5.6 m, centred on the gate)
// must sit wholly inside with a 2% margin or wholly outside, and wholly inside from 1001 wide up, (iii) the car must be on screen.
async function jumpFrame(page) {
  return page.evaluate(() => {
    const e = window.__eco, W = innerWidth, H = innerHeight, j = e.jumps.find((o) => o.stunt) || e.jumps[0];
    const g = e.raceGates.find((o) => o.i === 3), rx = -g.fz, rz = g.fx;
    const clip = (poly, inside, cut) => {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) out.push(cut(a, b));
      }
      return out;
    };
    const ground = (x, z) => e.groundHeight(x, z);
    // The deck is clipped against the near plane in view space first, so a corner behind the camera cannot mirror into the frame
    const cam = e.camera; cam.updateMatrixWorld();
    const M = cam.matrixWorldInverse.elements, P = cam.projectionMatrix.elements;
    const view = (x, y, z) => ({ x: M[0] * x + M[4] * y + M[8] * z + M[12], y: M[1] * x + M[5] * y + M[9] * z + M[13], z: M[2] * x + M[6] * y + M[10] * z + M[14] });
    const corner = (f, lat, up) => { const x = j.ox + j.fx * f + j.rx * lat, z = j.oz + j.fz * f + j.rz * lat; return view(x, ground(x, z) + up, z); };
    const NEAR = -0.1, lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    // The share of the viewport a quad (view-space corners, in order) covers: near-plane clip, projection, clip to the four edges, shoelace
    const visible = (v) => {
      const out3 = [];
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length], ia = a.z <= NEAR, ib = b.z <= NEAR;
        if (ia) out3.push(a);
        if (ia !== ib) { const t = (NEAR - a.z) / (b.z - a.z); out3.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR }); }
      }
      let poly = out3.map((q) => { const w = -q.z; return { x: ((P[0] * q.x) / w + 1) / 2 * W, y: (1 - (P[5] * q.y) / w) / 2 * H }; });
      poly = clip(poly, (p) => p.x >= 0, (a, b) => lerp(a, b, (0 - a.x) / (b.x - a.x)));
      poly = clip(poly, (p) => p.x <= W, (a, b) => lerp(a, b, (W - a.x) / (b.x - a.x)));
      poly = clip(poly, (p) => p.y >= 0, (a, b) => lerp(a, b, (0 - a.y) / (b.y - a.y)));
      poly = clip(poly, (p) => p.y <= H, (a, b) => lerp(a, b, (H - a.y) / (b.y - a.y)));
      let area = 0;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a.x * b.y - b.x * a.y; }
      return Math.abs(area) / 2 / (W * H);
    };
    const deck = visible([corner(0, -2.7, 0), corner(0, 2.7, 0), corner(j.length, 2.7, j.height), corner(j.length, -2.7, j.height)]);
    // Gate 3's banner: "inside" is every corner within the 2% margin and none behind the camera; "outside" is no visible area at all
    // (a banner hanging off two edges, or half behind the camera, is neither: it is clipped)
    const base = ground(g.x, g.z), ban = [], bv = [];
    let behind = false;
    for (const [lat, y] of [[-3.6, 5.0], [3.6, 5.0], [3.6, 6.2], [-3.6, 6.2]]) {
      const x = g.x + rx * lat, z = g.z + rz * lat;
      if (view(x, base + y, z).z > NEAR) behind = true;
      ban.push(e.project(x, base + y, z)); bv.push(view(x, base + y, z));
    }
    const mx = W * 0.02, my = H * 0.02;
    const inside = !behind && ban.every((p) => p.x >= mx && p.x <= W - mx && p.y >= my && p.y <= H - my);
    const outside = visible(bv) < 1e-9;
    const margin = behind ? -9999 : Math.round(Math.min(...ban.map((p) => Math.min(p.x - mx, W - mx - p.x, p.y - my, H - my - p.y))));
    const c = e.car.s, cp = e.project(c.x, c.y + 0.8, c.z);
    return { W, H, deck, inside, outside, margin, carOn: cp.x >= 0 && cp.x <= W && cp.y >= 0 && cp.y <= H, car: `${Math.round(cp.x)},${Math.round(cp.y)}` };
  });
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
      await page.screenshot({ path: `${out}${PREFIX}${state}-${tag}.png` });
      const found = await page.evaluate(audit);
      problems += found.length;
      for (const i of found) console.log(`     ${state}-${tag}: ${i}`);
    };
    try {
      if (hubFlow) {
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
        await page.evaluate(() => window.__eco.boost(1.4)); // a jump just landed: afterburner lamps, wider camera, more dust
        await shot('boost', 350);
        // The river: the Community spoke bridge from the road, then the car in the Token ford with an entry burst of spray
        await page.evaluate(async () => {
          const T = await import('/ecosystem/js/terrain.js');
          const c = T.crossings.find((c) => T.roads[c.road].kind === 'spoke' && T.roads[c.road].to === 'community');
          const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
          window.__eco.placeCar(c.x - fx * 14, c.z - fz * 14, Math.atan2(-fx, -fz));
        });
        await shot('bridge', 900);
        await page.evaluate(async () => {
          const T = await import('/ecosystem/js/terrain.js');
          const e = window.__eco, c = T.crossings.find((c) => T.roads[c.road].kind === 'spoke' && T.roads[c.road].to === 'token');
          const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
          e.placeCar(c.x + fx * 0.5, c.z + fz * 0.5, Math.atan2(-fx, -fz));
          e.splash();
        });
        await shot('ford', 400);
        await page.evaluate(() => { window.__eco.blimp.setAngle(282); window.__eco.stunt(); }); // mid-flight over the river, the side-on camera up, the blimp in the top left
        await shot('stunt', 400);
        // Chart Ridge: a fixed day's closes so the still is stable, the car a few metres in, looking along the chart
        await page.evaluate(async () => {
          const T = await import('/ecosystem/js/terrain.js');
          const e = window.__eco, r = T.roads[T.RIDGE_ROAD];
          e.ridge.set([80120, 80040, 79880, 79910, 79650, 79420, 79500, 79310, 78990, 78760, 78820, 78540, 78410, 78600, 78880, 79050, 78970, 79240, 79480, 79350, 79610, 79820, 79700, 79930]);
          const p = r.curve.getPointAt(14 / r.len), t = r.curve.getTangentAt(14 / r.len);
          e.placeCar(p.x, p.z, Math.atan2(-t.x, -t.z));
        });
        await shot('ridge', 600);
        // Funding windsocks: the fixed comparison, the car on the Perps spoke level with the board (past the jump), looking up the row
        await page.evaluate(async (raw) => {
          const T = await import('/ecosystem/js/terrain.js');
          const e = window.__eco, r = T.roads.find((x) => x.kind === 'spoke' && x.to === 'perps');
          e.windsocks.set(raw);
          const p = r.curve.getPointAt(66 / r.len), t = r.curve.getTangentAt(66 / r.len);
          e.placeCar(p.x, p.z, Math.atan2(-t.x, -t.z));
        }, FUNDING);
        await shot('windsocks', 2500); // the socks ease up over about two seconds
        await page.evaluate(() => window.__eco.teleport('liquidations')); // back on the pad for the stop sheet below
        await page.click('#prompt-btn');
        await shot('stop');
        // Plaza furniture: HQ's rim from the inside, a kerb arc, bollards at a mouth, a lamp by the pad (HQ has no benches: nine mouths leave no room)
        await page.evaluate(() => { const e = window.__eco; document.querySelector('#stop [data-close]')?.click(); e.teleport('strike'); e.placeCar(16, 14, Math.PI / 2); });
        await shot('plaza', 600);
        await page.evaluate(() => window.__eco.teleport('liquidations'));
        await page.click('#prompt-btn'); // the stop sheet again, so the states after this keep their old starting point
        await page.evaluate(() => document.querySelector('#stop [data-close]').click());
        await page.evaluate(() => window.__eco.teleport('fillyard'));
        await shot('yard', 3000); // the conveyor and whatever the trade stream has sent
        await page.click('#prompt-btn');
        await shot('yardSheet'); // its sheet, with the three figures from the stream
        await page.evaluate(() => document.querySelector('#stop [data-close]').click());
        // The arcade cabinet from its pad, then its sheet with the game running in the frame and an injected board
        await page.evaluate(() => { const e = window.__eco; e.arcadeBoard([{ name: 'Juno', score: 640, level: 7, won: false }, { name: 'Rook', score: 410, level: 5, won: false }, { name: 'Aveli', score: 230, level: 3, won: false }]); e.teleport('arcade-flappy-coin'); });
        await shot('cabinet', 1200);
        if (pick.includes('arcade')) {
          await page.click('#prompt-btn');
          await page.waitForFunction(() => { const f = document.querySelector('#arcade iframe'); return !!f?.contentDocument?.getElementById('c') && f.contentDocument.readyState === 'complete'; }, null, { timeout: 20000 });
          await shot('arcade', 1500);
          await page.evaluate(() => document.querySelector('#arcade [data-close]').click());
        }
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
        // Emotes: the row open, a wave over our car and a flag over Aveli's
        await page.evaluate(() => { const e = window.__eco.emote; e.open(); e.show('me', 0); e.show('p1', 3); });
        await shot('emote', 500);
        await page.evaluate(() => window.__eco.emote.close());
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
        { const f = await gantryFit(page); console.log(`gantry ${tag} hub worst margin ${f.worst}px`); if (f.bad.length) errors.push(`raceway: the start gantry is clipped (${f.bad.join('; ')})`); }
        // The graze rule on the hairpin's tyre walls: 12 m before a point 8 m into the first auto wall run, 15 degrees into it at 24 m/s, then real frames
        if (pick.includes('walls')) {
          await page.evaluate(async () => {
            const { wallSpots } = await import('/ecosystem/js/walls-math.js');
            const { trackDef } = await import('/ecosystem/js/terrain.js');
            const tr = trackDef(), spots = wallSpots(tr), w = spots[8]; // 8 m into the first run, so the nose meets a side of the wall and not its end
            const p = tr.at(w.s - 12), side = w.side, a = 15 * Math.PI / 180;
            const dx = p.fx * Math.cos(a) + p.rx * side * Math.sin(a), dz = p.fz * Math.cos(a) + p.rz * side * Math.sin(a);
            const off = tr.half + 3 - 3.2; // the wall's line less the lateral run of 12 m at 15 degrees, so the nose meets it at the spot
            const e = window.__eco;
            e.placeCar(p.x + p.rx * side * off, p.z + p.rz * side * off, Math.atan2(-dx, -dz));
            // Record that contact happened, on whichever frame: a graze on a straight wall lasts only a few frames, so polling
            // for contact still holding would depend on the renderer's speed. A setter on the flag sees every frame's write.
            const s = e.car.s; let wall = false;
            window.__wallTouches = 0;
            Object.defineProperty(s, 'wall', { configurable: true, enumerable: true, get: () => wall, set: (v) => { wall = v; if (v) window.__wallTouches++; } });
            s.speed = 24; e.keys.up = true;
          });
          // The software renderer runs few frames a second, so wait on the car (the wall touched, then a few frames more), not the clock
          const touched = await page.waitForFunction(() => window.__wallTouches > 0, null, { timeout: 15000 }).then(() => true, () => false);
          await page.waitForTimeout(350);
          await page.evaluate(() => { window.__eco.keys.up = false; });
          const wallState = await page.evaluate(() => { const s = window.__eco.car.s; return { speed: +s.speed.toFixed(1), wall: s.wall, touches: window.__wallTouches, x: +s.x.toFixed(1), z: +s.z.toFixed(1), heading: +s.heading.toFixed(3) }; });
          console.log('walls', JSON.stringify(wallState));
          if (!touched) errors.push(`walls: the car never touched the tyre wall (at ${wallState.x}, ${wallState.z}, ${wallState.speed} m/s); the graze was not shown`);
          await shot('walls', 200);
          await page.evaluate(() => { const s = window.__eco.car.s, v = s.wall; delete s.wall; s.wall = v; delete window.__wallTouches; window.__eco.toStart(); }); // back to a plain field
        }
        // The ghost, held 1.4 s into a stand-in leader's lap so it sits just ahead of the car (the real board may be offline here)
        await page.evaluate(() => window.__eco.ghostPreview(1.4, { name: 'Ben', ms: 25449, splits: [8570, 11900, 16630, 19950, 21840] }));
        await shot('ghost', 1500);
        await page.evaluate(() => window.__eco.ghostPreview(null));
        // A new #1 just announced by the room: the note, and the fireworks run ahead to their first bursts
        await page.evaluate(() => window.__eco.celebrate({ name: 'Aveli', ms: 24650 }, 1.9));
        await shot('fireworks', 400);
        // Live racing: on the grid with two others and the countdown up; mid-race with the position line; the invite
        await page.evaluate(() => { document.getElementById('peers-note').hidden = true; const e = window.__eco; e.toStart(); e.peersInject([{ id: 'p1', name: 'Juno', colour: '#22d3ee' }, { id: 'p2', name: 'Rook', colour: '#facc15' }]); e.raceLiveInject('grid'); });
        await page.evaluate(async () => {
          const { trackAt, trackLen } = await import('/ecosystem/js/terrain.js');
          const { gridSlot } = await import('/ecosystem/js/race-live-math.js');
          for (const [id, k] of [['p1', 2], ['p2', 3]]) { const g = gridSlot(k), p = trackAt(trackLen - g.back); window.__eco.peersMove(id, p.x + p.rx * g.v, p.z + p.rz * g.v, Math.atan2(-p.fx, -p.fz)); }
        });
        await shot('raceGrid', 3000); // the race HUD updates every 16 frames
        await page.evaluate(() => window.__eco.raceLiveInject('pos'));
        await shot('racePos', 800);
        await page.evaluate(() => { window.__eco.raceLiveInject('invite'); window.__eco.peersInject(null); });
        await shot('raceInvite', 400);
        await page.evaluate(() => document.getElementById('race-invite').hidden = true);
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
        // A deep link (?stop=slp): a fresh load that lands on the pad with the sheet open, no flight, no intro
        if (pick.includes('deeplink')) {
          await page.goto(`${base}/ecosystem/?mp=0&stop=slp#${theme}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => window.__eco && document.getElementById('stop').open && !document.getElementById('loader'), null, { timeout: 60000 });
          await shot('deeplink', 600);
        }
        // A guide inside the world: the HQ sheet's "Read the guide" mounts the guide page in the #guide sheet
        if (pick.includes('guide')) {
          await page.goto(`${base}/ecosystem/?mp=0&stop=strike#${theme}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => window.__eco && document.getElementById('stop').open && !document.getElementById('loader'), null, { timeout: 60000 });
          await page.click('#stop-guides a');
          await page.waitForFunction(() => document.getElementById('guide').open && document.querySelector('#guide h1'), null, { timeout: 20000 });
          await shot('guide', 600);
        }
      }
      // A venue page: the car starts on the grid. Same states as the hub's where the page is the same. A direct visit plays the
      // opening flight as the hub does (plan 5 Task 5), so it is skipped here with &arrive=0, as on the hub, and the grid is what is shot.
      if (venueFlow) {
        await page.goto(`${base}${PAGE}?mp=0&arrive=0#${theme}`, { waitUntil: 'domcontentloaded' });
        if (pick.includes('loading')) { await sleep(150); await page.screenshot({ path: `${out}${PREFIX}loading-${tag}.png` }); }
        await page.waitForFunction(() => window.__eco && !document.getElementById('loader'), null, { timeout: 120000 });
        await page.evaluate(() => document.fonts.ready);
        const grid = await page.evaluate(() => { const s = window.__eco.car.s; return { intro: document.getElementById('intro').open, holding: document.body.classList.contains('is-holding'), speed: s.speed, title: document.getElementById('where')?.textContent?.trim() }; });
        // A direct visit (no record from an arch) opens the intro sheet after its flight (skipped here); a landing never does.
        // Shot as it is shown, then closed the way a visitor would, and the grid is shot.
        if (!grid.intro) errors.push(`a direct visit to ${PAGE} did not open #intro`);
        else { await shot('intro', 1500); await page.click('#start'); }
        if (grid.holding) errors.push('the venue is still holding');
        if (grid.speed !== 0) errors.push(`the car is not stopped on the grid (${grid.speed} m/s)`);
        if (/lagoon\/?$/.test(PAGE) && grid.title !== 'The Lagoon') errors.push(`the HUD title is "${grid.title}", not "The Lagoon"`);
        await shot('grid', 2500);
        { const f = await gantryFit(page); console.log(`gantry ${tag} venue worst margin ${f.worst}px`); if (f.bad.length) errors.push(`grid: the start gantry is clipped (${f.bad.join('; ')})`); }
        // Driving: up held until the car is over the line with the lap clock running (software frames are few, so wait on
        // the car, not the clock), then let go
        if (pick.includes('drive')) {
          await page.evaluate(() => { window.__eco.keys.up = true; });
          const drove = await page.waitForFunction(() => window.__eco.car.s.speed > 12 && !/^0:00\.00$/.test(document.getElementById('race-time').textContent), null, { timeout: 60000 }).then(() => true, () => false);
          await page.evaluate(() => { window.__eco.keys.up = false; });
          if (!drove) errors.push(`drive: the car did not get over the start line (${await page.evaluate(() => `${window.__eco.car.s.speed.toFixed(1)} m/s, ${document.getElementById('race-time').textContent}`)})`);
          await shot('drive', 200);
        }
        // Three other visitors round the car in the venue's own zone (peers.js parks a peer from another zone). The car goes
        // back to the start (toStart: 14 m behind the line, stopped, no lap running), so the camera is not under the gantry and
        // the clock reads 0:00.00 with "Cross the start line"; the stand-ins sit apart on the grid, short of the line, each at
        // its own distance and side so no two cars or name tags overlap and none is under the gantry's beam
        if (pick.includes('peers')) {
          await page.evaluate(() => window.__eco.toStart());
          await sleep(600);
          await page.evaluate(() => {
            const e = window.__eco, c = e.car.s, sin = Math.sin(c.heading), cos = Math.cos(c.heading), zone = e.peersState().zone;
            const at = (f, r) => ({ x: c.x - sin * f + cos * r, z: c.z - cos * f - sin * r });
            e.peersInject([
              { id: 'p1', name: 'Aveli', colour: '#22d3ee', zone, ...at(4, -2.9), h: c.heading + 0.15 },
              { id: 'p2', name: 'ADA_ACE', colour: '#facc15', zone, ...at(7.5, 2.7), h: c.heading - 0.12 },
              { id: 'p3', name: 'Driver 07', colour: '#ec4899', zone, ...at(11, -0.8), h: c.heading + 0.06 },
            ]);
          });
          await shot('peers', 2500);
          const seen = await page.evaluate(() => { const st = window.__eco.peersState(); return st.peers.filter((p) => p.zone === st.zone).length; });
          if (seen !== 3) errors.push(`peers: ${seen} of 3 stand-ins in the venue's zone`);
          const clock = await page.evaluate(() => document.getElementById('race-time').textContent);
          if (clock !== '0:00.00') errors.push(`peers: the lap clock runs behind the line (${clock})`);
          await page.evaluate(() => window.__eco.peersInject(null));
        }
        // The water jump: the car put 12 m before the ramp's foot (the hairpin's exit) on its line at 27 m/s with up held, and shot once it is in
        // the air over the inlet with the stunt camera most of the way round (stunt k past 0.5; the hub's stunt state snaps there with a hook; on the venue the
        // physics takes it off the real ramp)
        // The lap is run up to there first, so the HUD counts the checkpoints a driver would have taken (not "Checkpoint 0 of 11"
        // while passing gate 3): from the start, the page's own race module (race.js raceTick) is taken over the start line and
        // each checkpoint short of the run-up, its clock moved on as a car at 25 m/s would take, then the car is put down
        if (pick.includes('jump')) {
          const cps = await page.evaluate(async () => {
            const T = await import('/ecosystem/js/terrain.js'), R = await import('/ecosystem/js/race.js');
            window.__onWater = T.onWater;
            const e = window.__eco, j = e.jumps.find((o) => o.stunt) || e.jumps[0];
            const x = j.ox - j.fx * 12, z = j.oz - j.fz * 12, h = Math.atan2(-j.fx, -j.fz);
            const len = T.trackLen;
            let sAt = 0, best = Infinity;
            for (let u = 0; u < len; u += 0.5) { const p = T.trackAt(u), d = Math.hypot(p.x - x, p.z - z); if (d < best) { best = d; sAt = u; } }
            e.toStart(); // no lap running, so the start line starts a fresh one
            let s0 = 0;
            for (const g of [...T.raceGates].sort((a, b) => a.i - b.i)) {
              if (g.i > 0 && g.s >= sAt) break;
              R.raceTick(g.x - g.fx, g.z - g.fz, g.x + g.fx, g.z + g.fz, Math.atan2(-g.fx, -g.fz), g.i === 0 ? 0.01 : (g.s - s0) / 25);
              s0 = g.i === 0 ? 0 : g.s;
            }
            R.raceTick(x, z, x, z, h, Math.max(0, sAt - s0) / 25); // the clock to the run-up's start, no crossing
            e.placeCar(x, z, h);
            e.car.s.speed = 27; e.keys.up = true;
            // The car's screen position on every frame the stunt camera is more than a third in, to the landing (read after the shot)
            window.__jumpTrack = [];
            const tick = () => { const c = e.car.s, k = e.stuntState().k; if (k > 0.33 && c.air) { const p = e.project(c.x, c.y + 0.8, c.z); window.__jumpTrack.push([p.x, p.y]); } if (!window.__jumpDone) requestAnimationFrame(tick); };
            window.__jumpDone = false; requestAnimationFrame(tick);
            return T.raceGates.filter((g) => g.i > 0 && g.s < sAt).length;
          });
          const flew = await page.waitForFunction(() => { const e = window.__eco, s = e.car.s; return s.air && e.stuntState().on && e.stuntState().k > 0.5 && window.__onWater(s.x, s.z); }, null, { timeout: 60000, polling: 'raf' }).then(() => true, () => false);
          const f = await jumpFrame(page); // measured on the frame that is shot, not after it: the car keeps flying
          await page.screenshot({ path: `${out}${PREFIX}jump-${tag}.png` });
          console.log(`jump ${tag}: deck ${(f.deck * 100).toFixed(1)}%, sign ${f.inside ? 'inside' : f.outside ? 'outside' : 'CLIPPED'} (margin ${f.margin}px), car at ${f.car}`);
          if (f.deck >= 0.06) errors.push(`jump: the ramp deck fills ${(f.deck * 100).toFixed(1)}% of the frame (limit 6%)`);
          if (!f.inside && !(f.outside && f.W < 1001)) errors.push(`jump: gate 3's sign is ${f.outside ? 'out of the frame (it must be whole from 1001 up)' : 'clipped'} at ${f.W} wide (worst margin ${f.margin}px)`);
          if (!f.carOn) errors.push(`jump: the car is off screen at ${f.car}`);
          const air = await page.evaluate(() => ({ air: window.__eco.car.s.air, stunt: window.__eco.stuntState().on, k: +window.__eco.stuntState().k.toFixed(2) }));
          await page.evaluate(() => { window.__eco.keys.up = false; });
          if (!flew || !air.air) errors.push(`jump: the car was not in the air over the inlet when shot (${JSON.stringify(air)})`);
          const sub = await page.evaluate(() => document.getElementById('race-sub')?.textContent || '');
          if (cps < 1 || /Checkpoint 0 of|CP 0\//.test(sub)) errors.push(`jump: the HUD has taken no checkpoint (${cps} short of the run-up, "${sub}")`);
          const found = await page.evaluate(audit); problems += found.length; for (const i of found) console.log(`     jump-${tag}: ${i}`);
          await page.waitForFunction(() => !window.__eco.car.s.air, null, { timeout: 30000 }).catch(() => {});
          { const t = await page.evaluate(() => { window.__jumpDone = true; return { pts: window.__jumpTrack, W: innerWidth, H: innerHeight }; });
            const out = t.pts.filter(([x, y]) => x < 0 || x > t.W || y < 0 || y > t.H);
            console.log(`jump ${tag}: the car stays in the frame on ${t.pts.length - out.length} of ${t.pts.length} airborne frames`);
            if (!t.pts.length || out.length) errors.push(`jump: the car is off screen on ${out.length} of ${t.pts.length} airborne frames of the stunt camera (first at ${out[0] ? Math.round(out[0][0]) + ',' + Math.round(out[0][1]) : 'none'})`); }
          await page.evaluate(() => window.__eco.toStart());
        }
        await page.click('#open-map');
        await shot('map');
        await page.evaluate(() => document.querySelector('#map [data-close]').click());
        // The lap-finish sheet with Lagoon times (the floor is 29.469 s, results/lagoon.json): a new best of 0:29.794, 0.326 s
        // faster than the last best 0:30.120, as race.js openFinish writes it. The lap is the device's best, so showOffer has no
        // older best to offer and the post-my-best note stays hidden: each time is stated once. (A slower lap's sheet names
        // the same best twice, in the gap line and the offer, by construction; that is the hub's sheet, not the fixture.)
        await page.evaluate(() => {
          document.getElementById('race-result').textContent = '0:29.794';
          document.getElementById('race-gap').textContent = 'New best, 0.326 s faster than your last best (0:30.120).';
          document.getElementById('race-form').hidden = false;
          document.getElementById('race-best-note').hidden = true;
          document.getElementById('race').showModal();
        });
        await shot('race');
      }
      // Across the portal: the hub preview's flight to the venue, frozen mid-way; then released, the venue holds and lands
      if (portalFlow) {
        await page.goto(`${base}/ecosystem/?venues=1&mp=0&arrive=0#${theme}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 120000 });
        await page.click('#start');
        await sleep(500);
        await page.evaluate(() => { const [l] = window.__eco.portalLines(); window.__eco.placeCar(l.x - l.fx * 15, l.z - l.fz * 15, Math.atan2(-l.fx, -l.fz)); window.__eco.keys.up = true; });
        await page.waitForFunction(() => window.__eco.portalState?.(), null, { timeout: 60000 });
        await page.evaluate(() => { window.__eco.keys.up = false; });
        await page.waitForFunction(() => window.__eco.portalState().t > 0.5, null, { timeout: 60000 });
        await page.evaluate(() => window.__eco.portalHold(true));
        await shot('portalOut', 400);
        await page.evaluate(() => window.__eco.portalHold(false));
        await page.waitForURL(u => u.pathname.startsWith('/ecosystem/tracks/'), { timeout: 60000 });
        await page.waitForFunction(() => document.body.classList.contains('is-holding'), null, { timeout: 60000 });
        await page.waitForFunction(() => window.__eco && !document.body.classList.contains('is-holding') && !document.getElementById('loader'), null, { timeout: 180000 });
        // The landed frame under a real hand-off record: the record was read (landing()), no intro opened, the car stopped
        const landed = await page.evaluate(() => ({ record: !!window.__eco.landing(), intro: document.getElementById('intro').open, speed: window.__eco.car.s.speed }));
        if (!landed.record) errors.push('portalIn: the venue opened without the hand-off record');
        if (landed.intro) errors.push('portalIn: the landing opened #intro');
        await shot('portalIn', 2500);
      }
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
