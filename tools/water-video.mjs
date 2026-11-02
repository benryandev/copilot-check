// The water cut (Ben's idea, 2 Nov 2026): a short film to introduce the river. Over the bridges, through the ford, off
// the road and through the water, then flat out at the epic jump: the side-on camera watches the flight in slow
// motion with the Strike blimp hanging in the sky behind, and the chase camera catches the landing boost. Closes on
// the river with the address. Day throughout. Built on tools/cine.mjs (virtual clock, drivers, cameras, segments, the
// synth scored offline; in slow motion the engine drops with the picture while the music keeps time).
//   node tools/water-video.mjs [base] [--shots a,b] [--no-audio]   → tools/out/showcase/water.mp4 (+ water-forum.mp4 under 10 MB)
import { createKit } from './cine.mjs';

const { rec, skip, dayPage, render, finish, FPS } = await createKit({ name: 'water' });
const BLIMP_DEG = 282; // where the river jump's camera sees the blimp (the stunt still pins the same angle)

// A low camera on the bank a few metres downstream of a crossing, water in the foreground, looking at the car
const bankCam = (page, kind, to, { down = 12, up = 1.6, side = 0, lift = 0.9, lk = 8 } = {}) => page.evaluate(([kind, to, down, up, side, lift, lk]) => {
  const C = window.__cine, T = C.T, c = C.crossing(kind, to), ri = T.riverInfo(c.x, c.z); ri.nx = -ri.tz; ri.nz = ri.tx;
  const px = c.x + ri.tx * down + ri.nx * side, pz = c.z + ri.tz * down + ri.nz * side;
  C.cam(C.fixed(px, Math.max(T.WATER_LEVEL + up, C.ground(px, pz) + 0.9), pz, { lk, lift }));
}, [kind, to, down, up, side, lift, lk]);

// Drive at a crossing along its road from `back` metres before it, at `speed`
const approach = (page, kind, to, back, speed, v = 0) => page.evaluate(([kind, to, back, speed, v]) => {
  const C = window.__cine, c = C.crossing(kind, to);
  C.place(c.path, c.s0 - back, v, speed);
  C.follow(c.path, c.s0 - back, v);
  return { s0: c.s0.toFixed(1), len: c.path.len.toFixed(0), x: c.x.toFixed(1), z: c.z.toFixed(1), angle: c.angle.toFixed(0) };
}, [kind, to, back, speed, v]);

const SHOTS = [
  ['01-river', async () => { // the long ring bridge between Analytics and Community from up on the bank: the river, the bridge, a car crossing small in frame
    const page = await dayPage();
    const c = await approach(page, 'ring', 'community', 38, 22);
    await page.evaluate(() => {
      const C = window.__cine, T = C.T, c = C.crossing("ring", "community"), ri = T.riverInfo(c.x, c.z); ri.nx = -ri.tz; ri.nz = ri.tx;
      // 30 m downstream and off to one side, 13 m up, looking at the bridge; a slow push in
      C.cam((car, t) => { const d = 30 - t * 1.6; return { px: c.x + ri.tx * d + ri.nx * 12, py: T.WATER_LEVEL + 13 - t * 0.6, pz: c.z + ri.tz * d + ri.nz * 12, lx: c.x, ly: 1.5, lz: c.z, k: 60, lk: 60 }; });
    });
    console.log('river: ring→community crossing', JSON.stringify(c));
    await rec(page, 3.2);
    await page.evaluate(() => window.__cine.stop());
  }],
  ['02-bridge', async () => { // the ring bridge towards Perps from the bank, water in the foreground: planks, rails and piles side-on as the car crosses
    const page = await dayPage();
    const c = await approach(page, 'ring', 'perps', 27, 22);
    await page.evaluate(() => { // 14 m downstream on the water, looking at the bridge itself: the car enters one side and leaves the other
      const C = window.__cine, T = C.T, c = C.crossing('ring', 'perps'), ri = T.riverInfo(c.x, c.z);
      const px = c.x + ri.tx * 14, pz = c.z + ri.tz * 14;
      C.cam(() => ({ px, py: T.WATER_LEVEL + 1.8, pz, lx: c.x, ly: 1.1, lz: c.z, k: 60, lk: 60 }));
    });
    console.log('bridge: ring→perps crossing', JSON.stringify(c));
    await rec(page, 2.6);
    await page.evaluate(() => window.__cine.stop());
  }],
  ['03-bridge-chase', async () => { // the Chains spoke from behind: over the bridge and straight through the gate arch
    const page = await dayPage();
    const c = await approach(page, 'spoke', 'chains', 44, 23);
    await page.evaluate(() => window.__cine.cam(window.__cine.chase(8.5, 2.6, 0.7, { ahead: 6, lift: 1.2, k: 7 })));
    console.log('bridge-chase: chains spoke crossing', JSON.stringify(c));
    await rec(page, 3.0);
    await page.evaluate(() => window.__cine.stop());
  }],
  ['04-ford', async () => { // the Token spoke ford: flat out into the water from the bank (the splash), then from behind as the drag bites and the car wades out
    const page = await dayPage();
    const c = await approach(page, 'spoke', 'token', 20, 24); // the spoke's own jump sits at 58 to 65 m with bales round its landing to about 76 m: start past them
    await bankCam(page, 'spoke', 'token', { down: 10, up: 1.4, side: 2, lift: 0.7, lk: 10 });
    await skip(page, 0.1); // the set-down itself registers a touch on the bales behind; keep it off the log
    console.log('ford: token spoke crossing', JSON.stringify(c));
    await rec(page, 3.0, (t, i) => { if (i === Math.round(1.3 * FPS)) return page.evaluate(() => window.__cine.cam(window.__cine.chase(7.5, 2.4, 1.2, { ahead: 5, lift: 1.1, k: 8 }))); });
    await page.evaluate(() => window.__cine.stop());
  }],
  ['05-offroad', async () => { // no road at all: across the grass and straight through the river, spray both sides, out the far bank
    const page = await dayPage();
    await page.evaluate(() => {
      const C = window.__cine;
      C.placeAt(-66, 86, Math.PI / 2, 24); // heading west; the river runs north to south at about x = -100 here, well south of the Community bridge (z 58)
      C.cam(C.chase(9, 3.4, -2.2, { ahead: 6, lift: 1.1, k: 7 }));
    });
    await rec(page, 3.2);
    await page.evaluate(() => window.__cine.stop());
  }],
  ['06-jump', async () => { // the epic jump: the world's own cameras (chase up the run, the side-on stunt camera in the air), the flight at quarter speed, the landing boost in real time
    const page = await dayPage();
    await page.evaluate((deg) => {
      const C = window.__cine, T = C.T, j = T.jumps.find((o) => o.stunt && o.fx < 0);
      window.__eco.blimp.setAngle(deg);
      C.placeAt(j.ox - j.fx * 46, j.oz, C.heading(j.fx, j.fz), 24); // 46 m run-up straight at the east ramp, throttle held
      C.cam(null);
    }, BLIMP_DEG);
    let flew = false, landed = null;
    await rec(page, 12, async (t, i) => {
      const st = await page.evaluate(() => ({ air: window.__eco.car.s.air, on: window.__eco.stuntState().on, k: window.__eco.stuntState().k }));
      if (st.air && (st.on || st.k > 0)) { flew = true; return 0.25; }
      if (flew && !st.air) { landed ??= i; if (i - landed > Math.round(1.9 * FPS)) return false; }
      return 1;
    });
    console.log(`jump: flew ${flew}, landed at frame ${landed}`);
    await page.evaluate(() => { window.__cine.stop(); window.__eco.blimp.setAngle(null); });
  }],
  ['07-card', async () => { // the river from above the jump, the blimp in the sky, the address
    const page = await dayPage();
    await page.evaluate((deg) => {
      const C = window.__cine, T = C.T, e = C.e, j = T.jumps.find((o) => o.stunt && o.fx < 0);
      e.blimp.setAngle(deg);
      const lip = { x: j.ox + j.fx * j.length, z: j.oz }; // the east lip; the river runs under the gap just west of it
      Object.assign(e.car.s, { x: lip.x + 30, z: lip.z, speed: 0 }); e.car.s.y = e.groundHeight(e.car.s.x, e.car.s.z); e.placeCamera(0, true);
      C.cam((car, t) => ({ px: lip.x - 5 + t * 0.4, py: T.WATER_LEVEL + 7 + t * 0.5, pz: lip.z + 34 - t * 1.2, lx: lip.x - 6, ly: 2, lz: lip.z - 10, k: 60, lk: 60 }));
      const a = document.getElementById('arrive');
      a.style.transition = 'none'; a.hidden = false; a.style.opacity = '0';
      // Over grass and water the secondary grey eyebrow and link vanish (Ben, 2 Nov): give both the title's ink and halo
      const ink = getComputedStyle(a.querySelector('.arrive-title'));
      for (const el of a.querySelectorAll('.br-label, .arrive-hint')) { el.style.color = ink.color; el.style.textShadow = ink.textShadow; }
      a.querySelector('.br-label').style.fontSize = '0.95rem';
      const hint = a.querySelector('.arrive-hint');
      hint.textContent = 'strike.benryan.com.au/ecosystem'; hint.style.fontSize = '1.25rem'; hint.style.textTransform = 'none'; hint.style.letterSpacing = '0.02rem'; hint.style.fontWeight = '600';
    }, BLIMP_DEG);
    await rec(page, 3.0, (t) => page.evaluate((t) => {
      const a = document.getElementById('arrive'), o = Math.min(1, Math.max(0, (t - 0.4) / 0.9));
      a.style.opacity = String(o); a.style.transform = `translateY(${(1 - o) * 14}px)`;
    }, t));
    await page.evaluate(() => { window.__cine.stop(); window.__eco.blimp.setAngle(null); });
  }],
];

await render(SHOTS);
await finish(SHOTS);
