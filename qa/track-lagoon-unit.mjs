// qa/track-lagoon-unit.mjs: the Lagoon's layout (ecosystem/tracks/lagoon.js, design 7.10) resolved by track-math.js
import test from 'node:test'; import assert from 'node:assert/strict';
import { resolveTrack, inStretch } from '../ecosystem/js/track-math.js';
import { venueEntry } from '../ecosystem/js/entries.js';
import { RAMP, LIP_SETBACK } from '../ecosystem/js/jump-math.js';
import { wallSpots, wallBoxes } from '../ecosystem/js/walls-math.js';
import { generate } from '../tools/tracks-json.mjs';
import lagoon from '../ecosystem/tracks/lagoon.js';

const wrapLen = (from, to, len) => (to - from + len) % len;

test('the Lagoon resolves: 11 gates in order, lap about 845 m, start on the straight, tarmac about a third', () => {
  const t = resolveTrack(lagoon);
  assert.equal(lagoon.id, 'lagoon-v2'); assert.equal(lagoon.name, 'The Lagoon'); assert.equal(lagoon.sponsor, null); assert.equal(t.half, 6);
  assert.equal(lagoon.points.length, 27); assert.deepEqual(lagoon.start, [-40, -60]);
  assert.equal(t.gates.length - 1, 11, 'eleven gates after the start line'); assert.equal(t.checkpoints.length, 11);
  assert.ok(t.len > 740 && t.len < 860, t.len);
  assert.ok(t.gates.every((g, i) => i === 0 || g.s > t.gates[i - 1].s), 'gates in lap order');
  // no sector short enough for a cut to inflate its centreline speed (the worker's segMaxSpeed reads it): 29.9 m at the least
  const gaps = t.gates.map((g, i) => (t.gates[(i + 1) % t.gates.length].s - g.s + t.len) % t.len);
  assert.ok(Math.min(...gaps) > 29.5, `shortest sector ${Math.min(...gaps)}`);
  const tarmac = t.surface[0]; assert.equal(tarmac.kind, 'tarmac');
  const share = wrapLen(tarmac.from, tarmac.to, t.len) / t.len; // the stretch crosses the line
  assert.ok(share > 0.3 && share < 0.42, `tarmac share ${share}`);
  assert.ok(inStretch(0, tarmac.from, tarmac.to, t.len), 'the start line is on tarmac');
  const w = t.water[0];
  assert.ok(t.gates.some((g) => g.s > w.s + w.halfW + 8 && g.s < w.s + w.halfW + 14), 'first gate after the water sits about 10 m past the far bank');
  // the floor and limits are the optimiser's (tools/lapsim/results/lagoon.json, the lagoon-v2 relay)
  assert.equal(lagoon.floorMs, 29694); assert.deepEqual(lagoon.limits, { maxSpeed: 30.8, segMaxSpeed: 38 });
});

test('every written s is the named point\'s s on the resolved track (to 0.5 m)', () => {
  const t = resolveTrack(lagoon), sAt = (x, y) => t.sOf(t.toWorld(x, y));
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.5, `${what}: written ${a}, resolved ${b}`);
  near(lagoon.water[0].s, sAt(126, -40), 'water at [126, -40]'); assert.equal(lagoon.water[0].halfW, 9.5);
  // the tarmac starts in the last corner (between [-140, -48] and [-120, -60]), so the surface changes mid-corner
  near(lagoon.surface[0].from, sAt(-130, -56), 'tarmac from [-130, -56]'); assert.equal(lagoon.surface[0].to, lagoon.water[0].s, 'tarmac to the water');
  assert.ok(lagoon.surface[0].from > sAt(-140, -48) && lagoon.surface[0].from < sAt(-120, -60), 'inside the last corner');
  assert.equal(lagoon.walls.length, 4);
  near(lagoon.walls[0].from, sAt(79, -65), 'Turn 1 walls from [79, -65]'); near(lagoon.walls[0].to, sAt(126, -60), 'Turn 1 walls to [126, -60]');
  near(lagoon.walls[1].from, sAt(50, 93), 'esses walls from [50, 93]'); near(lagoon.walls[1].to, sAt(-50, 95), 'esses walls to [-50, 95]');
  // the crest's walls run along the lift, so the line goes over the brow, not round its shoulder
  near(lagoon.walls[2].from, lagoon.lifts[0].from, 'crest walls from the lift\'s start'); near(lagoon.walls[2].to, lagoon.lifts[0].to, 'crest walls to the lift\'s end');
  // the kink's walls run from gate 9 ([-145, 20]) to gate 10 ([-150, -20]), and both gates keep their points
  near(lagoon.walls[3].from, sAt(-145, 20), 'kink walls from gate 9 [-145, 20]'); near(lagoon.walls[3].to, sAt(-150, -20), 'kink walls to gate 10 [-150, -20]');
  near(t.gates[9].s, sAt(-145, 20), 'gate 9 at [-145, 20]'); near(t.gates[10].s, sAt(-150, -20), 'gate 10 at [-150, -20]');
  for (const w of lagoon.walls) assert.deepEqual(w.sides, [-1, 1]);
  // plan 5 R13: the jump stand moved north off the inlet's channel, its south end 2 m past the far bank (water s + halfW)
  near(lagoon.stands[0].s, lagoon.water[0].s + lagoon.water[0].halfW + 2 + lagoon.stands[0].len / 2, 'the jump stand 2 m past the far bank');
  // The ramp's low end at water s - halfW - RAMP.length - LIP_SETBACK, so the lip sits on the near bank; the lagoon-v2
  // relay put the lip 10 m past the hairpin's exit (the Turn 1 walls' end), so the ramp never sits between the walls
  const r = lagoon.ramps[0], exitS = sAt(126, -60);
  near(r.s + RAMP.length, exitS + 10, 'the lip 10 m past the walls\' end');
  near(r.s, lagoon.water[0].s - 9.5 - RAMP.length - LIP_SETBACK, 'ramp low end');
  near(lagoon.walls[0].to, exitS, 'the walls\' end is unchanged at [126, -60]');
  assert.ok(r.s > exitS, `the ramp's foot (s ${r.s}) is past the walls' end (s ${exitS})`);
  near(t.gates[2].s, exitS, 'gate 2 at the walls\' end'); assert.ok(t.gates[2].s < r.s, 'gate 2 before the ramp\'s foot');
  assert.deepEqual({ side: r.side, length: r.length, height: r.height, width: r.width }, { side: 0, length: 8, height: 1.9, width: 5.4 });
  const third = t.gates[3]; // [0] is the start line
  near(third.s, lagoon.water[0].s + 9.5 + 10, 'third gate 10 m past the far bank');
});

test('the back arc: a blind crest between gates 7 and 8, a walled right-left kink between gates 9 and 10', () => {
  const t = resolveTrack(lagoon), sAt = (x, y) => t.sOf(t.toWorld(x, y));
  assert.deepEqual(lagoon.lifts, [{ from: 575, to: 625, height: 2.2 }]); // the Raceway's crest height, its peak near [-120, 85]
  const [lift] = lagoon.lifts;
  assert.ok(lift.from > t.gates[7].s && lift.to < t.gates[8].s, 'the crest lies between gate 7 and gate 8');
  assert.ok(Math.abs((lift.from + lift.to) / 2 - sAt(-120, 85)) < 5, 'its peak near [-120, 85]');
  const kink = lagoon.walls[3];
  assert.deepEqual(kink.sides, [-1, 1]);
  // the two inserted centreline points sit between gate 9 [-145, 20] and gate 10 [-150, -20]
  const i9 = lagoon.points.findIndex(([x, y]) => x === -145 && y === 20), i10 = lagoon.points.findIndex(([x, y]) => x === -150 && y === -20);
  assert.equal(i10 - i9, 3, 'two points between [-145, 20] and [-150, -20]');
  for (const [x, y] of lagoon.points.slice(i9 + 1, i10)) assert.ok(y < 20 && y > -20, `[${x}, ${y}] between the gates`);
  // a gentle jog: the resolved curve's samples through the kink turn no tighter than a 9 m radius (three consecutive samples)
  const n = t.pts.length, inKink = (p) => { const s = t.sOf(p); return s >= kink.from - 5 && s <= kink.to + 5; };
  let minR = Infinity;
  for (let i = 0; i < n; i++) {
    const a = t.pts[(i - 1 + n) % n], b = t.pts[i], c = t.pts[(i + 1) % n];
    if (!inKink(b)) continue;
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    minR = Math.min(minR, cross < 1e-12 ? Infinity : (ab * bc * ca) / (2 * cross));
  }
  assert.ok(minR >= 9, `the kink's minimum centreline radius ${minR.toFixed(2)} m`);
  // walls never on the road: every box of the kink's section (corners, edge midpoints, centre) at least TRACK_HALF from the centreline
  const centre = []; for (let s = kink.from - 20; s <= kink.to + 20; s += 0.25) { const p = t.at(s); centre.push([p.x, p.z]); }
  const boxes = wallBoxes(wallSpots({ ...t, walls: [kink] }));
  assert.ok(boxes.length > 0, 'the kink has wall boxes');
  let nearest = Infinity;
  for (const k of boxes) {
    const c = Math.cos(k.yaw), sn = Math.sin(k.yaw);
    for (const qx of [-k.hx, 0, k.hx]) for (const qz of [-k.hz, 0, k.hz]) {
      const x = k.cx + qx * c + qz * sn, z = k.cz - qx * sn + qz * c;
      for (const [px, pz] of centre) nearest = Math.min(nearest, Math.hypot(x - px, z - pz));
    }
  }
  assert.ok(nearest >= t.half, `the kink's nearest wall box is ${nearest.toFixed(2)} m from the centreline (half ${t.half})`);
});

test('both stands stand outside the track in the venue\'s frame', () => {
  const e = venueEntry(lagoon, { slug: 'lagoon' }), t = e.track;
  assert.equal(lagoon.stands.length, 2);
  assert.deepEqual(lagoon.stands.map((s) => s.len).sort((a, b) => a - b), [40, 90]);
  for (const st of lagoon.stands) {
    const p = t.at(st.s), x = p.x + p.rx * st.off, z = p.z + p.rz * st.off;
    assert.ok(Math.hypot(x, z) > Math.hypot(p.x, p.z), `stand at s ${st.s} is further from the infield than the track`);
    assert.ok(Math.abs(st.off) > t.half + 3, 'clear of the track edge');
  }
});

test('the registry lists the Lagoon open: its limits and minMs from the floor', async () => {
  const e = (await generate())['lagoon-v2'];
  assert.equal(e.name, 'The Lagoon'); assert.equal(e.checkpoints.length, 11); assert.ok(e.length > 740 && e.length < 860);
  assert.equal(e.minMs, Math.round(0.97 * lagoon.floorMs)); assert.equal(e.maxSpeed, lagoon.limits.maxSpeed); assert.equal(e.segMaxSpeed, lagoon.limits.segMaxSpeed);
});
