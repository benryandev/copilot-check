// The trailer for the three.js Showcase post and X: ~28 s cut like a film trailer. The arrival, a convoy with two
// other drivers, a jump, the hairpin bales, the chicane crates, a timed lap against the ghost, the Fill Yard at
// night, a closing card. Needs the site served locally (PORT=8766 node qa/serve.mjs) and ffmpeg.
//   node tools/showcase-trailer.mjs [base] [--shots a,b]   → tools/out/showcase/trailer.mp4
// Each shot renders to its own segment under tools/out/showcase/trailer-frames/, so one shot can be re-cut with
// --shots and the rest reused. Same virtual clock as showcase-media.mjs: performance.now and requestAnimationFrame
// only move when the script steps them, so frames are evenly spaced however slowly the software renderer draws.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) || 'http://localhost:8766';
const only = (args.find((a) => a.startsWith('--shots='))?.slice(8) || '').split(',').filter(Boolean);
const here = (p) => new URL(p, import.meta.url).pathname;
const OUT = here('./out/showcase/'), FR = `${OUT}trailer-frames/`;
mkdirSync(FR, { recursive: true });
const SIZE = [1280, 720], FPS = 30, DT = 1000 / FPS;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// A best lap already in this browser, so the checkpoint notes read as a gap to beat (the ghost is the board's leader)
const BEST = { ms: 27500, splits: [9230, 13100, 18300, 21800, 23900], trace: null, posted: true };

async function open({ theme = 'light', arrive = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: SIZE[0], height: SIZE[1] }, deviceScaleFactor: 1, colorScheme: theme });
  await ctx.route(/\/race\/(event|time)$/, (r) => r.fulfill({ status: 204, body: '' })); // no funnel counts or posts from a clip
  await ctx.addInitScript((best) => {
    try { localStorage.setItem('eco-quality', 'high'); localStorage.setItem('eco-race-best:realfi-v1', JSON.stringify(best)); localStorage.setItem('eco-race-name', JSON.stringify('BenRyan')); } catch {}
    let now = 0, queue = [], live = true;
    const pending = new Set();
    const realRaf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
    performance.now = () => (live ? realNow() : now);
    window.requestAnimationFrame = (cb) => {
      if (!live) { queue.push(cb); return queue.length; }
      pending.add(cb);
      return realRaf((t) => { if (live && pending.delete(cb)) cb(t); });
    };
    window.__virtual = () => { now = realNow(); live = false; queue.push(...pending); pending.clear(); };
    window.__step = (ms) => { now += ms; const q = queue; queue = []; q.forEach((cb) => cb(now)); };
  }, BEST);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error', String(e).split('\n')[0]));
  page.on('console', (m) => { if (TRACE || m.type() === 'log' && !m.text().startsWith('[eco]')) console.log(m.text()); });
  await page.goto(`${base}/ecosystem/?mp=0&arrive=${arrive ? 1 : 0}#${theme}`, { waitUntil: 'domcontentloaded' });
  if (arrive) {
    await page.waitForFunction(() => document.body.classList.contains('is-arriving'), null, { timeout: 60000 });
    await page.evaluate(() => { document.getElementById('arrive').style.transition = 'none'; window.__virtual(); });
    return page;
  }
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
  await page.click('#start');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // models in
  await page.evaluate(() => { document.querySelectorAll('.hud, .touch').forEach((el) => el.style.setProperty('display', 'none', 'important')); window.__virtual(); });
  await page.evaluate(RUNTIME);
  return page;
}

// Page-side helpers: lanes along a road or the track, a driver that follows one (and moves stand-in visitors with
// it), and a camera the script places each frame, smoothed, on top of the chase camera
async function RUNTIME() {
  const T = await import('/ecosystem/js/terrain.js');
  const e = window.__eco, Vec = e.camera.position.constructor;
  const heading = (fx, fz) => Math.atan2(-fx, -fz);
  const frame = (p, tan) => { const l = Math.hypot(tan.x, tan.z), fx = tan.x / l, fz = tan.z / l; return { x: p.x, z: p.z, fx, fz, rx: -fz, rz: fx }; };
  const track = { at: (s) => T.trackAt(s), len: T.trackLen, half: T.TRACK_HALF };
  const spoke = (key) => T.roads.find((x) => x.kind === 'spoke' && x.to === key);
  const road = (key) => { const r = spoke(key); return { at: (s) => { const u = Math.min(0.999, Math.max(0, s / r.len)); return frame(r.curve.getPointAt(u), r.curve.getTangentAt(u)); }, len: r.len, half: r.half }; };
  const lanePt = (path, s, v) => { const p = path.at(s); return { x: p.x + p.rx * v, z: p.z + p.rz * v, fx: p.fx, fz: p.fz, rx: p.rx, rz: p.rz, h: heading(p.fx, p.fz) }; };
  const trackJump = (s) => { const j = T.jumps.find((q) => q.s === s); return { s, v: j.side * (track.half - j.width / 2 - 0.2), length: j.length }; };
  const jumpOn = (key) => { const r = spoke(key), j = T.jumps.find((q) => T.roads[q.road] === r); return { s: j.t * r.len, v: j.side * (r.half - j.width / 2 - 0.2), length: j.length }; };
  let drive = null;
  const place = (path, s, v, speed = 0) => {
    drive = null; e.keys.up = false;
    const p = lanePt(path, s, v);
    Object.assign(e.car.s, { x: p.x, z: p.z, y: e.groundHeight(p.x, p.z), heading: p.h, speed, steer: 0, vy: 0, air: false });
    e.placeCamera(0, true);
  };
  const follow = (path, s0, v, friends = []) => {
    let s = s0;
    const vAt = typeof v === 'function' ? v : () => v;
    const near = (q, c) => Math.hypot(q.x - c.x, q.z - c.z);
    drive = () => {
      const c = e.car.s;
      for (let k = 0; k < 80; k++) { if (near(lanePt(path, s + 0.5, vAt(s + 0.5)), c) < near(lanePt(path, s, vAt(s)), c)) s += 0.5; else break; }
      const aim = lanePt(path, s + 9, vAt(s + 9));
      let d = Math.atan2(-(aim.x - c.x), -(aim.z - c.z)) - c.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (!c.air) { c.heading += d * 0.3; const q = lanePt(path, s, vAt(s)); c.x += (q.x - c.x) * 0.15; c.z += (q.z - c.z) * 0.15; }
      for (const f of friends) { const p = lanePt(path, s + f.ds, f.dv); e.peersMove(f.id, p.x, p.z, p.h); }
      drive.s = s;
    };
    drive.s = s;
    e.keys.up = true;
  };
  window.__auto = () => drive?.();
  const cp = new Vec(), cl = new Vec();
  let camFn = null, fresh = true, tt = 0;
  e.cine((dt) => {
    if (!camFn) return;
    tt += dt;
    const w = camFn(e.car.s, tt);
    const kp = fresh ? 1 : 1 - Math.exp(-dt * (w.k ?? 6)), kl = fresh ? 1 : 1 - Math.exp(-dt * (w.lk ?? w.k ?? 6));
    fresh = false;
    cp.lerp(new Vec(w.px, w.py, w.pz), kp);
    cl.lerp(new Vec(w.lx, w.ly, w.lz), kl);
    e.camera.position.copy(cp);
    e.camera.lookAt(cl);
  });
  const cam = (fn) => { camFn = fn; fresh = true; tt = 0; };
  // Points relative to the car: back along its heading, up, and to its right
  const rel = (c, back, up, side) => { const sin = Math.sin(c.heading), cos = Math.cos(c.heading); return { x: c.x + sin * back + cos * side, y: c.y + up, z: c.z + cos * back - sin * side }; };
  const chase = (back, up, side, { ahead = 4, lift = 1.6, k = 6 } = {}) => (c) => {
    const p = rel(c, back, up, side), l = rel(c, -ahead, lift, 0);
    return { px: p.x, py: Math.max(p.y, e.groundHeight(p.x, p.z) + 1.2), pz: p.z, lx: l.x, ly: l.y, lz: l.z, k };
  };
  const fixed = (x, y, z, { lk = 8, lift = 1 } = {}) => (c) => ({ px: x, py: y, pz: z, lx: c.x, ly: c.y + lift, lz: c.z, k: 60, lk });
  const ground = (x, z) => e.groundHeight(x, z);
  window.__cine = { T, e, track, road, lanePt, jumpOn, trackJump, place, follow, cam, chase, fixed, rel, ground, heading, s: () => drive?.s?.toFixed(1), stop: () => { drive = null; e.keys.up = false; camFn = null; } };
}

const step = (page, ms = DT) => page.evaluate((ms) => { window.__auto?.(); window.__step(ms); }, ms);
const titleAt = (page, t) => page.evaluate((t) => {
  const a = document.getElementById('arrive');
  const o = t < 3.3 ? Math.min(1, Math.max(0, (t - 0.35) / 0.9)) : Math.max(0, 1 - (t - 3.3) / 0.9);
  a.style.opacity = String(o); a.style.transform = `translateY(${(1 - o) * 14}px)`;
}, t);
const fills = (p, n) => p.evaluate((n) => { const syms = ['BTC', 'ETH', 'SOL', 'ADA', 'HYPE', 'XRP']; window.__eco.yardInject(Array.from({ length: n }, (_, i) => ({ sym: syms[i % syms.length], usd: 200 + Math.round(Math.random() * 4000), buy: Math.random() > 0.5 }))); }, n);
// The race note hides itself on a real-time timer; hold it for 2.2 virtual seconds instead
const holdNote = (page, t) => page.evaluate((t) => {
  const n = document.getElementById('race-note'), h = (window.__note ||= { text: '', at: -9 });
  if (n.textContent && n.textContent !== h.text) { h.text = n.textContent; h.at = t; }
  n.hidden = !(h.text && t - h.at < 2.2);
}, t);

let dir = '', frame = 0;
const shoot = (page) => page.screenshot({ path: `${dir}f${String(frame++).padStart(4, '0')}.png` });
const TRACE = process.env.TRACE === '1';
const trace = (page, i) => page.evaluate((i) => { const e = window.__eco, c = e.car.s, p = e.camera.position; console.log(`  f${i} car ${c.x.toFixed(1)},${c.z.toFixed(1)} y${c.y.toFixed(1)} v${c.speed.toFixed(1)} air:${c.air} s:${window.__cine?.s?.()} cam ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`); }, i);
async function rec(page, secs, perFrame) {
  for (let i = 0; i < Math.round(secs * FPS); i++) { const t = i / FPS; if (perFrame) await perFrame(t, i); await step(page); await shoot(page); if (TRACE && i % 15 === 0) await trace(page, i); }
}
async function skip(page, secs, perFrame) { for (let i = 0; i < Math.round(secs * FPS); i++) { if (perFrame) await perFrame(i / FPS, i); await step(page); } }

const pages = {};
const dayPage = async () => (pages.light ||= await open({ theme: 'light' }));
const nightPage = async () => (pages.dark ||= await open({ theme: 'dark' }));

const SHOTS = [
  ['01-arrival', async () => {
    const page = await open({ arrive: true });
    await rec(page, 5.6, (t) => titleAt(page, t));
    await page.context().close();
  }],
  ['02-convoy', async () => {
    const page = await dayPage();
    await page.evaluate(() => {
      const C = window.__cine, e = C.e, r = C.road('perps'), j = C.jumpOn('perps');
      const s0 = j.s + 14;
      e.peersInject([{ id: 'p1', name: 'Aveli', colour: '#22d3ee' }, { id: 'p2', name: 'ADA_ACE', colour: '#facc15' }]);
      C.place(r, s0, -0.4, 20);
      C.follow(r, s0, -0.4, [{ id: 'p1', ds: 12, dv: -2.4 }, { id: 'p2', ds: -2.5, dv: 2.5 }]);
      const k = C.lanePt(r, s0 + 30, 8.8);
      C.cam(C.fixed(k.x, C.ground(k.x, k.z) + 1.7, k.z, { lk: 7, lift: 0.9 }));
      console.log(`convoy: spoke ${r.len.toFixed(0)} m, from s=${s0.toFixed(0)}`);
    });
    await rec(page, 3.0);
    await page.evaluate(() => { window.__cine.stop(); window.__cine.e.peersInject(null); });
  }],
  ['03-jump', async () => {
    const page = await dayPage();
    await page.evaluate(() => {
      const C = window.__cine, tr = C.track, j = C.trackJump(70);
      C.place(tr, 50, j.v, 24);
      C.follow(tr, 50, j.v);
      const k = C.lanePt(tr, j.s + j.length + 20, 2.6); // low on the flat lane beside the ramp: the car flies past
      C.cam(C.fixed(k.x, C.ground(k.x, k.z) + 1.1, k.z, { lk: 10, lift: 0.7 }));
    });
    await rec(page, 2.4);
    await page.evaluate(() => window.__cine.stop());
  }],
  ['04-bales', async () => {
    const page = await dayPage();
    await page.evaluate(() => {
      const C = window.__cine, tr = C.track;
      const a = tr.at(209), b = tr.at(217), p = tr.at(213);
      const inner = (b.fx - a.fx) * p.rx + (b.fz - a.fz) * p.rz > 0 ? 1 : -1;
      const sm = (lo, hi, x) => { const u = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return u * u * (3 - 2 * u); };
      const v = (s) => inner * 7.6 * (sm(182, 200, s) - sm(226, 244, s));
      C.place(tr, 186, inner * 1.6, 24);
      C.follow(tr, 186, v);
      const k = C.lanePt(tr, 231, inner * 10.2); // low, just past the last bale on the inside: they come at the lens
      C.cam(C.fixed(k.x, C.ground(k.x, k.z) + 1.0, k.z, { lk: 10, lift: 0.6 }));
    });
    await rec(page, 2.6);
    await page.evaluate(() => window.__cine.stop());
  }],
  ['05-crates', async () => {
    const page = await dayPage();
    await page.evaluate(() => {
      const C = window.__cine, tr = C.track;
      const v = (s) => (s < 363 ? -3.2 : s < 385 ? 3.2 : -3.2);
      C.place(tr, 334, -3.2, 24);
      C.follow(tr, 334, v);
      C.cam(C.chase(8.5, 2.6, 0, { ahead: 6, lift: 1.2, k: 7 }));
    });
    await rec(page, 2.6);
    await page.evaluate(() => window.__cine.stop());
  }],
  ['06-record', async () => {
    const page = await dayPage();
    // On the raceway first so the board and the leader's ghost have loaded from the worker before the lap
    await page.evaluate(() => { window.__eco.toStart(); document.getElementById('race-hud').style.removeProperty('display'); });
    await skip(page, 1.0);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500)));
    await page.evaluate(() => {
      const C = window.__cine, tr = C.track;
      C.place(tr, -12, 0, 24);
      C.follow(tr, -12, 0);
      const g = tr.at(-7), cx = g.x + g.rx * 8.2, cz = g.z + g.rz * 8.2; // beside the track just before the line: the car passes, then goes under the gantry
      C.cam(C.fixed(cx, C.ground(cx, cz) + 1.7, cz, { lk: 9, lift: 0.8 }));
    });
    await rec(page, 1.4, (t) => holdNote(page, t));
    await skip(page, 6.9, (t) => holdNote(page, 1.4 + t));
    await page.evaluate(() => window.__cine.cam(window.__cine.chase(10, 3.0, -2.4, { ahead: 5, lift: 1.3, k: 7 })));
    await rec(page, 2.8, (t) => holdNote(page, 8.3 + t));
    await page.evaluate(() => { window.__cine.stop(); document.getElementById('race-hud').style.setProperty('display', 'none', 'important'); });
  }],
  ['07-yard', async () => {
    const page = await nightPage();
    await page.evaluate(() => {
      const C = window.__cine, e = C.e; e.teleport('fillyard');
      const c = e.car.s, sin = Math.sin(c.heading), cos = Math.cos(c.heading);
      const at = (f, r) => ({ x: c.x - sin * f + cos * r, z: c.z - cos * f - sin * r });
      e.peersInject([{ id: 'p1', name: 'Aveli', colour: '#22d3ee', ...at(5, -6), h: c.heading + 0.5 }, { id: 'p2', name: 'ADA_ACE', colour: '#facc15', ...at(7, 6), h: c.heading - 0.4 }]);
      C.cam((car, t) => { const p = C.rel(car, 10, 3.4, -7 + t * 4.4); return { px: p.x, py: p.y, pz: p.z, lx: car.x, ly: car.y + 1.4, lz: car.z, k: 60, lk: 60 }; });
    });
    await fills(page, 6);
    await rec(page, 3.0, async (t, i) => { if (i % 20 === 0) await fills(page, 2); });
    await page.evaluate(() => { window.__cine.stop(); window.__cine.e.peersInject(null); });
  }],
  ['08-card', async () => {
    const page = await nightPage();
    await page.evaluate(() => {
      const C = window.__cine, e = C.e; e.teleport('strike');
      C.cam((car, t) => { const a = 0.7 + t * 0.09; return { px: Math.sin(a) * 46, py: 27 - t * 1.2, pz: Math.cos(a) * 46, lx: 0, ly: 5, lz: 0, k: 60, lk: 60 }; });
      const a = document.getElementById('arrive');
      a.style.transition = 'none'; a.hidden = false; a.style.opacity = '0';
      const hint = a.querySelector('.arrive-hint');
      hint.textContent = 'strike.benryan.com.au/ecosystem'; hint.style.fontSize = '1.05rem'; hint.style.textTransform = 'none';
    });
    await rec(page, 3.2, (t) => page.evaluate((t) => {
      const a = document.getElementById('arrive'), o = Math.min(1, Math.max(0, (t - 0.5) / 0.9));
      a.style.opacity = String(o); a.style.transform = `translateY(${(1 - o) * 14}px)`;
    }, t));
    await page.evaluate(() => window.__cine.stop());
  }],
];

for (const [name, run] of SHOTS) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  dir = `${FR}${name}/`; frame = 0;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  await run();
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${dir}f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 ${FR}${name}.mp4`);
  console.log(`${name}: ${frame} frames (${(frame / FPS).toFixed(1)} s) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();

const segs = SHOTS.map(([n]) => `${FR}${n}.mp4`).filter((f) => existsSync(f));
writeFileSync(`${FR}list.txt`, segs.map((f) => `file '${f}'`).join('\n'));
const total = segs.reduce((a, f) => a + parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${f}`).toString()), 0);
execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${FR}list.txt -vf "fade=t=out:st=${(total - 0.7).toFixed(2)}:d=0.7" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart ${OUT}trailer.mp4`);
console.log(`trailer.mp4 written (${segs.length} shots, ${total.toFixed(1)} s)`);
