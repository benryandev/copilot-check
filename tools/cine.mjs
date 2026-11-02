// Shared machinery for the rendered cuts (showcase-trailer.mjs, water-video.mjs): a Chromium page on a virtual clock
// (performance.now, requestAnimationFrame and Date.now only move when the script steps them, so frames are evenly
// spaced however slowly the software renderer draws), page-side drivers and cameras, per-shot segments, and the sound:
// while the picture renders every call the page makes into the sound engine is logged per frame; afterwards the same
// engine runs through an OfflineAudioContext against that timeline, written as WAV and muxed under the picture.
// Needs the site served locally (PORT=8766 node qa/serve.mjs) and ffmpeg.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const here = (p) => new URL(p, import.meta.url).pathname;
export const SR = 48000;

// A best lap already in this browser, so the checkpoint notes read as a gap to beat (the ghost is the board's leader)
const BEST = { ms: 27500, splits: [9230, 13100, 18300, 21800, 23900], trace: null, posted: true };

/** `name` is the output stem: tools/out/showcase/<name>.mp4, <name>-forum.mp4 and <name>-frames/. */
export async function createKit({ name, args = process.argv.slice(2), size = [1280, 720], fps = 30 } = {}) {
  const base = args.find((a) => !a.startsWith('--')) || 'http://localhost:8766';
  const only = (args.find((a) => a.startsWith('--shots='))?.slice(8) || '').split(',').filter(Boolean);
  const NO_AUDIO = args.includes('--no-audio');
  const OUT = here('./out/showcase/'), FR = `${OUT}${name}-frames/`;
  mkdirSync(FR, { recursive: true });
  const SIZE = size, FPS = fps, DT = 1000 / FPS;
  const TRACE = process.env.TRACE === '1';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

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
      const realDate = Date.now.bind(Date); let d0 = 0, n0 = 0;
      Date.now = () => (live ? realDate() : d0 + (now - n0));
      window.__virtual = () => { now = realNow(); d0 = realDate(); n0 = now; live = false; queue.push(...pending); pending.clear(); };
      window.__step = (ms) => { now += ms; const q = queue; queue = []; q.forEach((cb) => cb(now)); };
    }, BEST);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  page error', String(e).split('\n')[0]));
    page.on('console', (m) => { if (TRACE || m.type() === 'log' && !m.text().startsWith('[eco]')) console.log(m.text()); });
    await page.goto(`${base}/ecosystem/?mp=0&arrive=${arrive ? 1 : 0}#${theme}`, { waitUntil: 'domcontentloaded' });
    if (arrive) {
      await page.waitForFunction(() => document.body.classList.contains('is-arriving'), null, { timeout: 60000 });
      await page.evaluate(() => { document.getElementById('arrive').style.transition = 'none'; window.__virtual(); });
      await page.waitForFunction(() => !!window.__eco, null, { timeout: 60000 });
      await page.evaluate(TAP);
      return page;
    }
    await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
    await page.click('#start');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // models in
    await page.evaluate(() => { document.querySelectorAll('.hud, .touch').forEach((el) => el.style.setProperty('display', 'none', 'important')); window.__virtual(); });
    await page.evaluate(RUNTIME);
    await page.evaluate(TAP);
    return page;
  }

  // Page-side: log every call into the sound engine while a frame is being recorded (window.__tl.on), tagged with the
  // frame number the script sets before each step and the frame's time scale (1 real time, under 1 slow motion). The
  // engine itself stays silent under automation; the log is replayed offline afterwards.
  function TAP() {
    const s = window.__eco.sound, tl = (window.__tl = { frame: 0, on: false, slow: 1, log: [] });
    const push = (e) => { if (tl.on) tl.log.push({ f: tl.frame, ...(tl.slow < 1 ? { slow: tl.slow } : {}), ...e }); };
    const tick = s.tick; s.tick = (dt, st = {}) => { push({ t: 'tick', speed: st.speed, th: st.throttle, surf: st.surface, boost: !!st.boost }); return tick(dt, st); };
    const pause = s.pauseEngine; s.pauseEngine = () => { push({ t: 'pause' }); return pause(); };
    for (const c of ['hit', 'land', 'chime', 'blip', 'lapStart', 'lapFinish', 'countdown', 'boost', 'clunk', 'fanfare', 'splash']) {
      const orig = s[c]; s[c] = (...a) => { push({ t: 'cue', cue: c, args: a }); return orig?.(...a); };
    }
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
    // Past either end a road carries straight on along its last tangent, so a shot can run off the end without stalling
    const wrap = (r) => ({ at: (s) => { const u = Math.min(0.999, Math.max(0, s / r.len)), p = r.curve.getPointAt(u), tan = r.curve.getTangentAt(u), f = frame(p, tan), over = s - u * r.len; return { ...f, x: f.x + f.fx * over, z: f.z + f.fz * over }; }, len: r.len, half: r.half, index: T.roads.indexOf(r) });
    const road = (key) => wrap(spoke(key));
    const roadBy = (kind, to) => wrap(T.roads.find((x) => x.kind === kind && x.to === to));
    // The river crossing of a road, with the road wrapped: { s0 (metres along it), x, z, yaw, bridge, halfLen }
    const crossing = (kind, to) => { const c = T.crossings.find((c) => T.roads[c.road].kind === kind && T.roads[c.road].to === to); return { ...c, path: wrap(T.roads[c.road]) }; };
    const sm = (lo, hi, x) => { const u = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return u * u * (3 - 2 * u); };
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
    // A straight run: the car set down at a point with a heading, throttle held, no steering
    const placeAt = (x, z, h, speed = 0) => {
      drive = null;
      Object.assign(e.car.s, { x, z, y: e.groundHeight(x, z), heading: h, speed, steer: 0, vy: 0, air: false });
      e.placeCamera(0, true);
      e.keys.up = true;
    };
    const follow = (path, s0, v, friends = []) => {
      let s = s0;
      const vAt = typeof v === 'function' ? v : () => v;
      const near = (q, c) => Math.hypot(q.x - c.x, q.z - c.z);
      drive = () => {
        const c = e.car.s;
        // Progress along the centreline (not the offset lane, which can jump sideways and leave the marker behind)
        for (let k = 0; k < 80; k++) { if (near(path.at(s + 0.5), c) < near(path.at(s), c)) s += 0.5; else break; }
        const aim = lanePt(path, s + 9, vAt(s + 9));
        let d = Math.atan2(-(aim.x - c.x), -(aim.z - c.z)) - c.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (!c.air) { c.heading += d * 0.3; const q = lanePt(path, s, vAt(s)); c.x += (q.x - c.x) * 0.15; c.z += (q.z - c.z) * 0.15; }
        for (const f of friends) {
          const fs = s + f.ds;
          if (f.peel && fs >= f.peel.at) {
            // Off the road on its own line: a steady turn to the peel angle, then straight. Offsetting the road's
            // frame by metres folds back on itself around a bend, so a peeling car keeps its own heading instead.
            if (!f.st) { const p = lanePt(path, fs, f.dv); f.st = { x: p.x, z: p.z, h: p.h, prev: fs }; }
            const step = Math.max(0, fs - f.st.prev); f.st.prev = fs;
            const base = path.at(f.peel.at), target = heading(base.fx, base.fz) + f.peel.angle;
            let dh = target - f.st.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            f.st.h += dh * (1 - Math.exp(-step / 7));
            f.st.x -= Math.sin(f.st.h) * step; f.st.z -= Math.cos(f.st.h) * step;
            f.log = `${f.id} s${fs.toFixed(1)} peel h${f.st.h.toFixed(2)}`;
            e.peersMove(f.id, f.st.x, f.st.z, f.st.h);
            continue;
          }
          const p = lanePt(path, fs, f.dv), ahead = lanePt(path, fs + 2, f.dv);
          const fh = Math.atan2(-(ahead.x - p.x), -(ahead.z - p.z));
          f.log = `${f.id} s${fs.toFixed(1)} h${fh.toFixed(2)}`;
          e.peersMove(f.id, p.x, p.z, fh);
        }
        drive.friends = friends;
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
    const cam = (fn) => { camFn = fn; fresh = true; tt = 0; }; // null hands the picture back to the world's own cameras (chase, stunt)
    // Points relative to the car: back along its heading, up, and to its right
    const rel = (c, back, up, side) => { const sin = Math.sin(c.heading), cos = Math.cos(c.heading); return { x: c.x + sin * back + cos * side, y: c.y + up, z: c.z + cos * back - sin * side }; };
    const chase = (back, up, side, { ahead = 4, lift = 1.6, k = 6 } = {}) => (c) => {
      const p = rel(c, back, up, side), l = rel(c, -ahead, lift, 0);
      return { px: p.x, py: Math.max(p.y, e.groundHeight(p.x, p.z) + 1.2), pz: p.z, lx: l.x, ly: l.y, lz: l.z, k };
    };
    const fixed = (x, y, z, { lk = 8, lift = 1 } = {}) => (c) => ({ px: x, py: y, pz: z, lx: c.x, ly: c.y + lift, lz: c.z, k: 60, lk });
    const ground = (x, z) => e.groundHeight(x, z);
    window.__cine = { T, e, track, road, roadBy, crossing, lanePt, sm, jumpOn, trackJump, place, placeAt, follow, cam, chase, fixed, rel, ground, heading, s: () => drive?.s?.toFixed(1), friends: () => (drive?.friends || []).map((f) => f.log), stop: () => { drive = null; e.keys.up = false; camFn = null; } };
  }

  const step = (page, ms = DT, f = null) => page.evaluate(([ms, f, slow]) => { if (window.__tl) { window.__tl.on = f != null; window.__tl.slow = slow; if (f != null) window.__tl.frame = f; } window.__auto?.(); window.__step(ms); }, [ms, f, Math.min(1, ms / DT)]);
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
  const trace = (page, i) => page.evaluate((i) => { const e = window.__eco, c = e.car.s, p = e.camera.position; console.log(`  f${i} car ${c.x.toFixed(1)},${c.z.toFixed(1)} y${c.y.toFixed(1)} v${c.speed.toFixed(1)} air:${c.air} s:${window.__cine?.s?.()} ${(window.__cine?.friends?.() || []).join(' | ')} cam ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`); }, i);
  let shotLog = [];
  // Record `secs` of video. `perFrame(t, i)` runs before each frame; it may return a time scale for that frame
  // (0.25 steps the world a quarter frame: slow motion) or false to end the shot early.
  async function rec(page, secs, perFrame) {
    for (let i = 0; i < Math.round(secs * FPS); i++) {
      const t = i / FPS;
      let scale = 1;
      if (perFrame) { const r = await perFrame(t, i); if (r === false) break; if (typeof r === 'number') scale = r; }
      await step(page, DT * scale, frame); await shoot(page);
      if (TRACE && i % 5 === 0) await trace(page, i);
    }
    shotLog.push(...(await page.evaluate(() => { const l = window.__tl?.log || []; if (window.__tl) { window.__tl.log = []; window.__tl.on = false; } return l; })));
  }
  async function skip(page, secs, perFrame) { for (let i = 0; i < Math.round(secs * FPS); i++) { if (perFrame) await perFrame(i / FPS, i); await step(page); } }

  const pages = {};
  const dayPage = async () => (pages.light ||= await open({ theme: 'light' }));
  const nightPage = async () => (pages.dark ||= await open({ theme: 'dark' }));

  /** Render each shot to its own segment (skipping those not in --shots), then close the browser. */
  async function render(SHOTS) {
    for (const [name, run] of SHOTS) {
      if (only.length && !only.some((o) => name.includes(o))) continue;
      dir = `${FR}${name}/`; frame = 0; shotLog = [];
      rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
      const t0 = Date.now();
      await run();
      writeFileSync(`${FR}${name}.json`, JSON.stringify({ frames: frame, log: shotLog }));
      execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${dir}f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 ${FR}${name}.mp4`);
      console.log(`${name}: ${frame} frames (${(frame / FPS).toFixed(1)} s) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    await browser.close();
  }

  /** Concatenate the segments in SHOTS order, score them, and write <name>.mp4 and the forum cut. */
  async function finish(SHOTS, { music = 'sprint', slowEngine = true } = {}) {
    const segs = SHOTS.map(([n]) => `${FR}${n}.mp4`).filter((f) => existsSync(f));
    writeFileSync(`${FR}list.txt`, segs.map((f) => `file '${f}'`).join('\n'));
    const total = segs.reduce((a, f) => a + parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${f}`).toString()), 0);
    execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${FR}list.txt -vf "fade=t=out:st=${(total - 0.7).toFixed(2)}:d=0.7" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart ${OUT}${name}-silent.mp4`);
    console.log(`picture: ${segs.length} shots, ${total.toFixed(1)} s`);

    if (!NO_AUDIO) {
      const tl = []; let off = 0;
      for (const [n] of SHOTS) {
        const j = `${FR}${n}.json`;
        if (!existsSync(`${FR}${n}.mp4`)) continue;
        if (!existsSync(j)) { off += Number(execSync(`ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 ${FR}${n}.mp4`).toString().trim()); continue; } // an older segment with no log: silent
        const d = JSON.parse(readFileSync(j, 'utf8'));
        for (const e of d.log) tl.push({ ...e, f: e.f + off });
        off += d.frames;
      }
      const b2 = await chromium.launch();
      const page = await (await b2.newContext()).newPage();
      await page.goto(`${base}/ecosystem/arcade/flappy-coin/`, { waitUntil: 'domcontentloaded' }); // any page on the origin: the module imports from there
      const wavB64 = await page.evaluate(async ([tl, frames, fps, sr, sketch, slowEngine]) => {
        const { createSound } = await import('/ecosystem/js/sound.js');
        const { createPlayer } = await import('/ecosystem/js/music.js');
        const { eventsFor, loopSeconds } = await import('/ecosystem/js/music-math.js');
        const dt = 1 / fps, PRE = Math.round(4 * fps), dur = (frames + PRE) * dt + 0.8; // four seconds of pre-roll, so nothing is still fading in at frame one
        const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
        const sound = createSound({ enabled: true, context: () => ctx, offline: true });
        sound.setNight(false);
        sound.unlock();
        // The mix (Ben, 1 Nov): the engine is not the lead instrument. It sits well under the music, the one-shots stay forward, the old bed goes.
        for (const [k, v] of Object.entries({ block: 0.22, exhaust: 0.35, chug: 0.12, whine: 0.12, wind: 0.3, road: 0.3, pops: 0.9, cues: 0.75, bed: 0 })) sound.setTrim(k, v);
        // The music: the sketch under the whole cut, its layers following the car's speed (bass and hats at rest, drums, arpeggio and lead with speed)
        const musicGain = ctx.createGain(); musicGain.gain.value = 0.9; musicGain.connect(ctx.destination);
        const music = createPlayer(ctx, musicGain, sketch);
        const t0 = PRE * dt - 0.05; // bar one lands on frame one
        music.schedule(eventsFor(sketch, Math.ceil((frames * dt) / loopSeconds(sketch)) + 1), t0, 0, (frames * dt) / music.spb + 8);
        let level = 0.15; // smoothed intensity
        music.setIntensity(level, 0, 0.001);
        let full = 0; // frames of flat-out throttle in a row: every 1.8 s the throttle lifts for a third of a second, for the ear (the picture is unchanged)
        const byFrame = new Map();
        for (const e of tl) { if (!byFrame.has(e.f)) byFrame.set(e.f, []); byFrame.get(e.f).push(e); }
        const apply = (i) => {
          const evs = byFrame.get(i) || [];
          const tick = evs.find((e) => e.t === 'tick');
          if (!tick) { sound.pauseEngine(); full = 0; } // paused frames (the arrival): the music alone, at rest
          // Slow motion: the engine drops with the picture (speed scaled by the frame's time scale, throttle off), the music keeps its pace but breathes out
          const slow = slowEngine && tick?.slow ? tick.slow : 1;
          const want = tick ? Math.max(0.15, Math.min(1, (Math.abs(tick.speed) * slow) / 22)) : 0.15;
          level += (want - level) * 0.08;
          music.setIntensity(level, ctx.currentTime, 0.3);
          for (const e of evs) {
            if (e.t === 'tick') {
              let th = slow < 1 ? 0 : e.th;
              if (th > 0 && e.speed > 19 && !e.boost) { full++; if (full % 54 >= 44) th = 0; } else full = 0;
              sound.tick(dt, { speed: e.speed * slow, throttle: th, surface: e.surf, boost: e.boost });
            }
            else if (e.t === 'cue') sound[e.cue]?.(...e.args);
            else if (e.t === 'pause') sound.pauseEngine();
          }
        };
        const at = (k) => { if (k < PRE) sound.pauseEngine(); else apply(k - PRE); };
        at(0);
        for (let k = 1; k < frames + PRE; k++) ctx.suspend(k * dt).then(() => { at(k); ctx.resume(); });
        const buf = await ctx.startRendering();
        // 16-bit stereo WAV
        const n = buf.length, ch = buf.numberOfChannels, bytes = 44 + n * ch * 2, out = new DataView(new ArrayBuffer(bytes));
        const str = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
        str(0, 'RIFF'); out.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
        out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
        const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
        let o = 44, peak = 0;
        for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); peak = Math.max(peak, Math.abs(v)); out.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2; }
        console.log(`audio peak ${peak.toFixed(3)}`);
        const u8 = new Uint8Array(out.buffer); let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return btoa(s);
      }, [tl, off, FPS, SR, music, slowEngine]);
      writeFileSync(`${OUT}${name}.wav`, Buffer.from(wavB64, 'base64'));
      await b2.close();
      console.log(`audio: ${tl.length} events over ${off} frames`);
      // One fixed gain so the loudest moment peaks at -1.5 dBFS (a loudness normaliser flattened the quiet shots up to the engine's level)
      const peak = parseFloat(/max_volume: (-?[\d.]+) dB/.exec(execSync(`ffmpeg -ss 4 -i ${OUT}${name}.wav -af volumedetect -f null - 2>&1`).toString())?.[1] ?? '0');
      const gain = Math.min(24, -1.5 - peak).toFixed(1);
      execSync(`ffmpeg -y -loglevel error -i ${OUT}${name}-silent.mp4 -ss 4 -i ${OUT}${name}.wav -af "volume=${gain}dB" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart ${OUT}${name}.mp4`);
      console.log(`audio: peak ${peak} dB, gain ${gain} dB`);
    } else {
      execSync(`cp ${OUT}${name}-silent.mp4 ${OUT}${name}.mp4`);
    }
    // The forum's 10 MB cap: a two-pass cut sized to fit
    const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${OUT}${name}.mp4`).toString());
    const vk = Math.max(600, Math.floor((9.3 * 8192) / dur) - 96);
    execSync(`ffmpeg -y -loglevel error -i ${OUT}${name}.mp4 -c:v libx264 -b:v ${vk}k -pass 1 -an -f mp4 /dev/null && ffmpeg -y -loglevel error -i ${OUT}${name}.mp4 -c:v libx264 -b:v ${vk}k -pass 2 -c:a aac -b:a 96k -movflags +faststart ${OUT}${name}-forum.mp4`, { cwd: OUT });
    console.log(`${name}.mp4 ${(statSync(`${OUT}${name}.mp4`).size / 1e6).toFixed(1)} MB, ${name}-forum.mp4 ${(statSync(`${OUT}${name}-forum.mp4`).size / 1e6).toFixed(1)} MB (${dur.toFixed(1)} s)`);
    return { out: `${OUT}${name}.mp4`, forum: `${OUT}${name}-forum.mp4`, dur };
  }

  return { base, only, OUT, FR, FPS, DT, open, step, rec, skip, fills, holdNote, titleAt, dayPage, nightPage, render, finish };
}
