// The trailer for the three.js Showcase post and X: ~40 s cut like a film trailer. The arrival, a convoy with two
// other drivers, a jump, the boost, the hairpin bales, the chicane crates, a live race grid and Go, a timed lap
// against the ghost, fireworks for a new #1, the Fill Yard at night, the arcade cabinet with a wave, a closing card.
// With sound (v2, 1 Nov 2026): the real synth scored offline against the logged timeline; see tools/cine.mjs for the
// machinery (virtual clock, drivers, cameras, segments, sound). Needs the site served locally
// (PORT=8766 node qa/serve.mjs) and ffmpeg.
//   node tools/showcase-trailer.mjs [base] [--shots a,b] [--no-audio] [--size=WxH]   → tools/out/showcase/trailer.mp4 (+ trailer-forum.mp4 under 10 MB)
// Each shot renders to its own segment under tools/out/showcase/trailer-frames/, so one shot can be re-cut with
// --shots and the rest reused. --size=1600x1200 renders into trailer-1600x1200-frames/ instead (the 4:3 element clips
// for the Awwwards entry, 4 Nov 2026: --shots=02-convoy,05b-grid,06-record,07b-cabinet --no-audio), leaving the 16:9 set alone.
import { createKit } from './cine.mjs';

const { open, rec, skip, fills, holdNote, titleAt, dayPage, nightPage, render, finish } = await createKit({ name: 'trailer' });

const SHOTS = [
  ['01-arrival', async () => {
    const page = await open({ arrive: true });
    // A viewer can't skip a video, and the small eyebrow was hard to read over the grass (Ben, 1 Nov): title alone
    await page.evaluate(() => { for (const sel of ['#arrive .arrive-hint', '#arrive .br-label']) document.querySelector(sel).style.display = 'none'; });
    await rec(page, 5.6, (t) => titleAt(page, t));
    await page.context().close();
  }],
  ['02-convoy', async () => {
    const page = await dayPage();
    await page.evaluate(() => {
      const C = window.__cine, e = C.e, r = C.road('perps');
      const end = r.len - 12, s0 = end - 70; // the shot ends short of the arch
      e.peersInject([{ id: 'p1', name: 'Juno', colour: '#22d3ee' }, { id: 'p2', name: 'Rook', colour: '#facc15' }]);
      C.place(r, s0, -0.6, 20);
      // Over the last 30 m the two of them peel off either side (Rook takes the jump on the way); our car keeps the road
      C.follow(r, s0, -0.6, [
        { id: 'p1', ds: 12, dv: -2.4, peel: { at: end - 34, angle: 0.42 } },
        { id: 'p2', ds: -2.5, dv: 2.5, peel: { at: end - 24, angle: -0.42 } },
      ]);
      const k = C.lanePt(r, s0 + 37, 8.8);
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
  ['03b-boost', async () => {
    const page = await dayPage();
    await page.evaluate(() => {
      const C = window.__cine, tr = C.track, j = C.trackJump(70);
      C.place(tr, 38, j.v, 24);
      C.follow(tr, 38, j.v);
      C.cam(C.chase(7.5, 2.3, 0.8, { ahead: 6, lift: 1.3, k: 7 })); // from behind: the flight, the landing, the afterburner lamps and the push
    });
    await rec(page, 3.2);
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
      const v = (s) => -3.2 + 6.4 * (C.sm(356, 368, s) - C.sm(378, 390, s));
      C.place(tr, 334, -3.2, 24);
      C.follow(tr, 334, v);
      C.cam(C.chase(8.5, 2.6, 0, { ahead: 6, lift: 1.2, k: 7 }));
    });
    await rec(page, 2.6);
    await page.evaluate(() => window.__cine.stop());
  }],
  ['05b-grid', async () => {
    const page = await dayPage();
    await page.evaluate(async () => {
      const C = window.__cine, e = C.e, tr = C.track;
      const { gridSlot } = await import('/ecosystem/js/race-live-math.js');
      e.toStart();
      document.getElementById('race-hud').style.removeProperty('display');
      e.peersInject([{ id: 'p1', name: 'Juno', colour: '#22d3ee' }, { id: 'p2', name: 'Rook', colour: '#facc15' }]);
      e.raceLiveInject('grid'); // slot 1, throttle locked, Go in 2.6 s
      const slots = Object.fromEntries([1, 2, 3].map((k) => [k, gridSlot(k)]));
      for (const [id, k] of [['p1', 2], ['p2', 3]]) { const g = slots[k], p = tr.at(tr.len - g.back); e.peersMove(id, p.x + p.rx * g.v, p.z + p.rz * g.v, C.heading(p.fx, p.fz)); }
      window.__grid = { s0: tr.len - slots[1].back, v: slots[1].v, friends: [['p1', 2], ['p2', 3]].map(([id, k]) => ({ id, ds: slots[1].back - slots[k].back, dv: slots[k].v })) };
      const k = C.lanePt(tr, tr.len - slots[1].back + 7, -5.5); // low, a few metres ahead of the front row and off to the left, looking back at the three of them
      C.cam(C.fixed(k.x, C.ground(k.x, k.z) + 1.3, k.z, { lk: 9, lift: 0.9 }));
    });
    await rec(page, 2.75, (t) => holdNote(page, t));
    // Go: the lock lifts; the three of them launch and the camera falls in behind
    await page.evaluate(() => { const C = window.__cine, g = window.__grid; C.follow(C.track, g.s0, g.v, g.friends); C.cam(C.chase(10, 3.2, -1.5, { ahead: 6, lift: 1.3, k: 6 })); });
    await rec(page, 2.2, (t) => holdNote(page, 2.75 + t));
    await page.evaluate(() => { window.__cine.stop(); window.__cine.e.peersInject(null); document.getElementById('race-hud').style.setProperty('display', 'none', 'important'); });
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
  ['06b-fireworks', async () => {
    const page = await nightPage();
    await page.evaluate(() => {
      const C = window.__cine, e = C.e, tr = C.track;
      e.toStart();
      C.place(tr, 8, 0, 20); // rolling off the throttle up the straight: overrun pops under the fanfare
      C.cam(C.chase(11, 3.4, 0, { ahead: 12, lift: 5.5, k: 6 })); // a little up: the sky ahead is where they burst
    });
    // The rockets are already up, so the first burst lands early in the shot; fired on frame 1 so the fanfare is on the log
    await rec(page, 4.0, (t, i) => i === 1 && page.evaluate(() => window.__eco.celebrate({ name: 'Juno', ms: 23389 }, 1.5)));
    await page.evaluate(() => window.__cine.stop());
  }],
  ['07-yard', async () => {
    const page = await nightPage();
    await page.evaluate(() => {
      const C = window.__cine, e = C.e; e.teleport('fillyard');
      const c = e.car.s, sin = Math.sin(c.heading), cos = Math.cos(c.heading);
      const at = (f, r) => ({ x: c.x - sin * f + cos * r, z: c.z - cos * f - sin * r });
      e.peersInject([{ id: 'p1', name: 'Juno', colour: '#22d3ee', ...at(5, -6), h: c.heading + 0.5 }, { id: 'p2', name: 'Rook', colour: '#facc15', ...at(1, 6.5), h: c.heading - 0.3 }]);
      C.cam((car, t) => { const p = C.rel(car, 10, 3.4, -7 + t * 4.4); return { px: p.x, py: p.y, pz: p.z, lx: car.x, ly: car.y + 1.4, lz: car.z, k: 60, lk: 60 }; });
    });
    await fills(page, 6);
    await rec(page, 3.0, async (t, i) => { if (i % 20 === 0) await fills(page, 2); });
    await page.evaluate(() => { window.__cine.stop(); window.__cine.e.peersInject(null); });
  }],
  ['07b-cabinet', async () => {
    const page = await nightPage();
    await page.evaluate(() => {
      const C = window.__cine, e = C.e; e.teleport('arcade-flappy-coin');
      const c = e.car.s, sin = Math.sin(c.heading), cos = Math.cos(c.heading);
      const at = (f, r) => ({ x: c.x - sin * f + cos * r, z: c.z - cos * f - sin * r });
      e.peersInject([{ id: 'p1', name: 'Juno', colour: '#22d3ee', ...at(1.5, -6), h: c.heading + 0.35 }, { id: 'p2', name: 'Rook', colour: '#facc15', ...at(0.5, 6), h: c.heading - 0.35 }]);
      // A slow sweep behind the three cars, looking past them at the cabinet
      C.cam((car, t) => { const p = C.rel(car, 10 - t * 0.5, 3.4, 6 - t * 3.6), l = C.rel(car, -7, 3.0, 0); return { px: p.x, py: p.y, pz: p.z, lx: l.x, ly: l.y, lz: l.z, k: 60, lk: 60 }; });
    });
    await skip(page, 0.8); // their cars built
    await page.evaluate(() => window.__eco.emote.show('me', 0));
    await rec(page, 1.0);
    await page.evaluate(() => { const em = window.__eco.emote; em.show('p1', 1); em.show('p2', 3); });
    await rec(page, 2.4);
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

await render(SHOTS);
await finish(SHOTS);
