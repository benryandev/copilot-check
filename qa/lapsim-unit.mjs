import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSim } from '../tools/lapsim/sim.mjs';
import { cutLine } from '../tools/lapsim/cut.mjs';
import { TRACK } from '../ecosystem/js/content.js';
import { resolveTrack } from '../ecosystem/js/track-math.js';
const ghost = JSON.parse(readFileSync('qa/fixtures/lapsim/ghost-ninja1-23034.json', 'utf8')).ghost;
const line = JSON.parse(readFileSync('qa/fixtures/lapsim/line-realfi-22914.json', 'utf8'));
test('the leader\'s lap replays within 50 ms of the real 23.034 with the bales cleared', async () => {
  const sim = await makeSim({ props: 'cleared' });
  const r = sim.runLap(sim.ghostPath(ghost.trace), { look: 9 });
  assert.ok(r.valid, r.reason); assert.ok(Math.abs(r.ms - 23034) < 50, `${r.ms}`);
});
test('the recorded floor line runs within 40 ms of 22.914', async () => {
  const sim = await makeSim({ props: 'cleared' });
  const r = sim.runLap(sim.pathFrom(line.ctrl, line.DS), { look: line.look });
  assert.ok(r.valid, r.reason); assert.ok(Math.abs(r.ms - 22914) < 40, `${r.ms}`);
});
test('bales in place make the same line slower by at least half a second', async () => {
  const cleared = await makeSim({ props: 'cleared' }), placed = await makeSim({ props: 'placed' });
  const a = cleared.runLap(cleared.ghostPath(ghost.trace), { look: 9 }), b = placed.runLap(placed.ghostPath(ghost.trace), { look: 9 });
  assert.ok(!b.valid || b.ms - a.ms > 500, `${a.ms} vs ${b.ms}`); assert.ok(b.hits.length >= 6);
});
test('the centreline flat out is 26.7 s and the three ramps are worth about 1.5 s', async () => {
  const sim = await makeSim({ props: 'cleared' });
  const flat = sim.runLap(() => 0, { look: 9 }).ms;
  const ramps = sim.runLap((s) => (s > 50 && s < 82 ? -3.1 : (s > 240 && s < 274) || (s > 423 && s < 457) ? 3.1 : 0), { look: 9 }).ms;
  assert.ok(Math.abs(flat - 26725) < 100, `${flat}`); assert.ok(flat - ramps > 1300 && flat - ramps < 1700, `${flat - ramps}`);
});
test('the Raceway\'s cut ratio is 87%', () => {
  const c = cutLine(TRACK, { wallsAsGates: false });
  assert.ok(Math.abs(c.ratio - 0.87) < 0.01, `${c.ratio}`);
});
test('the simulator\'s gates are terrain\'s raceGates, each at its own half-width', async () => {
  const { raceGates } = await import('../ecosystem/js/terrain.js');
  const sim = await makeSim({ props: 'cleared' });
  assert.deepEqual(sim.gates.map((g) => [g.i, g.s, g.w]), raceGates.map((g) => [g.i, g.s, g.w]));
});
test('makeSim refuses a track the terrain is not configured for', async () => {
  await assert.rejects(makeSim({ track: resolveTrack({ id: 'tiny-v1', half: 6, points: [[-40, -20], [40, -20], [40, 20], [-40, 20]], gates: [{ s: 60 }] }) }), /tiny-v1.*realfi-v1|realfi-v1.*tiny-v1/);
});
test('makeSim resolves physics once and an override reaches the step', async () => {
  const sim = await makeSim({ physics: { dirt: { top: 20 } } });
  assert.equal(sim.physics.resolved, true); assert.equal(sim.physics.dirt.top, 20);
  const r = sim.runLap(() => 0, { startSpeed: 20, maxT: 12 });
  assert.ok(Math.max(...r.path.map((p) => p[3])) <= 20 * 1.2 + 1e-6, 'never past a boosted 20');
});
test('the throttle channel: full by default (the floor line has none), a lift coasts, and wall hits are counted', async () => {
  const sim = await makeSim({ props: 'cleared' });
  const lat = sim.pathFrom(line.ctrl, line.DS);
  const a = sim.runLap(lat, { look: line.look }), b = sim.runLap(lat, { look: line.look, thrFn: sim.throttleFrom(new Array(line.ctrl.length).fill(1), line.DS) });
  assert.equal(a.ms, b.ms, 'all-ones throttle is the default'); assert.equal(a.wallHits, 0, 'the floor line is clean');
  const lift = sim.runLap(() => 0, { look: 9, log: true, thrFn: (s) => (s > 100 && s < 130 ? 0 : 1) });
  const off = lift.path.filter((p) => p[9] === 0);
  assert.ok(off.length > 20 && off.every((p) => p[1] >= 99 && p[1] <= 131), `throttle off only over s 100 to 130 (${off.length} frames)`);
  assert.ok(off.at(-1)[3] < off[0][3] - 0.5, `the car coasts down (${off[0][3]} to ${off.at(-1)[3]})`);
  const { wallSpots } = await import('../ecosystem/js/walls-math.js');
  const w = wallSpots(sim.track).find((p) => p.s > 100); // the first tyre wall past s 100: drive at it, centre elsewhere
  const into = sim.runLap((s) => (Math.abs(s - w.s) < 12 ? w.side * (sim.track.half + 4) : 0), { look: 9 });
  assert.ok(into.wallHits > 0, `hits counted (${into.wallHits}, wall at s ${w.s})`);
});
test('trackForCli configures a venue from its track module, and realfi stays the hub', async () => {
  const { trackForCli } = await import('../tools/lapsim/sim.mjs');
  const T = await import('../ecosystem/js/terrain.js');
  const hub = T.terrainConfig();
  try {
    assert.equal((await trackForCli('realfi')).id, 'realfi-v1');
    const t = await trackForCli('lagoon');
    assert.equal(t.id, 'lagoon-v2'); assert.equal(T.trackDef(), t, 'the terrain is configured for the venue');
    await assert.rejects(trackForCli('nowhere'), /unknown track "nowhere"/);
  } finally { T.configureTerrain(hub); }
});

// The Lagoon (plan 5 task 3): its floor line, Turn 1's lift, the water jump. Each test configures the venue and restores the hub.
const lagoonLine = JSON.parse(readFileSync('qa/fixtures/lapsim/line-lagoon-29694.json', 'utf8'));
async function lagoonSim() {
  const { trackForCli } = await import('../tools/lapsim/sim.mjs');
  const T = await import('../ecosystem/js/terrain.js');
  const hub = T.terrainConfig(), track = await trackForCli('lagoon');
  return { sim: await makeSim({ track }), T, restore: () => T.configureTerrain(hub) };
}
const lagoonDef = (await import('../ecosystem/tracks/lagoon.js')).default;
const lagoonRun = (sim, opts = {}) => sim.runLap(sim.pathFrom(lagoonLine.ctrl, lagoonLine.DS), { look: lagoonLine.look, thrFn: sim.throttleFrom(lagoonLine.thr, lagoonLine.DS), log: true, ...opts });
test('the Lagoon\'s best line replays within 50 ms of floorMs, clean', async () => {
  const { sim, restore } = await lagoonSim();
  try {
    const r = lagoonRun(sim);
    assert.ok(r.valid, r.reason); assert.ok(Math.abs(r.ms - lagoonDef.floorMs) < 50, `${r.ms} vs ${lagoonDef.floorMs}`);
    assert.equal(r.wallHits, 0, 'no wall hits');
  } finally { restore(); }
});
test('the line lifts for Turn 1: below 0.9 × tarmac top between the start straight and the ramp, throttle off there', async () => {
  const { sim, restore } = await lagoonSim();
  try {
    const t = sim.track, from = t.sOf(t.toWorld(60, -60)), to = t.ramps[0].s;
    const rows = lagoonRun(sim).path.filter((p) => p[1] >= from && p[1] < to);
    const min = Math.min(...rows.map((p) => p[3]));
    assert.ok(min < 0.9 * sim.physics.tarmac.top, `Turn 1 minimum ${min}`);
    assert.ok(rows.some((p) => p[9] === 0), 'a lift (throttle off) in Turn 1');
  } finally { restore(); }
});
test('the line clears the jump dry at 1/60, and its committed entry clears dry at 1/30 too', async () => {
  const { sim, T, restore } = await lagoonSim();
  try {
    const w = sim.track.water[0];
    const P = lagoonRun(sim).path;
    const i0 = P.findIndex((p) => p[5] && Math.abs(p[1] - w.s) < 30);
    assert.ok(i0 > 0, 'took off');
    let i1 = i0; while (P[i1][5]) i1++;
    assert.equal(T.onWater(P[i1][7], P[i1][8]), false, `dry landing (s ${P[i1][1]})`); assert.ok(P[i1][1] > w.s + w.halfW, 'past the far bank');
    // At 1/30 the tuned line itself leaves Turn 1 off the ramp (the README's fragility); the jump check at 1/30 is the
    // committed approach at the line's own entry speed (R10 of plan 5)
    const walls = sim.colliders.length, entry = P[i0 - 1][3], q = sim.inletJump(entry, { dt: 1 / 30 });
    assert.equal(sim.colliders.length, walls, 'the walls are put back after the jump check');
    assert.ok(entry >= 0.92 * sim.physics.tarmac.top, `a committed entry (${entry})`);
    assert.equal(q.wet, false, `dry at 1/30 from ${entry} m/s (${q.past} m past the lip)`);
  } finally { restore(); }
});
test('the inlet (halfW 9.5): 80% and 85% of tarmac top land wet, 92% lands dry, at 1/60 and at 1/30', async () => {
  const { sim, restore } = await lagoonSim();
  try {
    assert.equal(sim.track.water[0].halfW, 9.5);
    const top = sim.physics.tarmac.top;
    for (const dt of [1 / 60, 1 / 30]) {
      const at = (share) => sim.inletJump(share * top, { dt });
      for (const sh of [0.8, 0.85]) { const q = at(sh); assert.ok(q.takeoff, `${sh} took off`); assert.equal(q.wet, true, `${sh} at 1/${Math.round(1 / dt)}: lands wet (${q.past} m)`); }
      const q = at(0.92); assert.equal(q.wet, false, `0.92 at 1/${Math.round(1 / dt)}: lands dry (${q.past} m)`); assert.ok(q.boost, 'with a boost');
    }
  } finally { restore(); }
});
test('the exit jump (lagoon-v2): from the hairpin\'s exit at 0 m/s the car wades, at 20 m/s it clears with a boost, at 1/60 and 1/30', async () => {
  const { sim, restore } = await lagoonSim();
  try {
    const walls = sim.colliders.length;
    for (const dt of [1 / 60, 1 / 30]) {
      const fps = `1/${Math.round(1 / dt)}`;
      const slow = sim.exitJump(0, { dt });
      assert.equal(slow.wet, true, `from 0 at ${fps}: wet (lip ${slow.lip}, ${slow.past} m)`);
      const fast = sim.exitJump(20, { dt });
      assert.equal(fast.wet, false, `from 20 at ${fps}: dry (lip ${fast.lip}, ${fast.past} m)`); assert.ok(fast.boost, `from 20 at ${fps}: a boost`);
      assert.ok(fast.lip < 30.5, `from 20 at ${fps}: take-off at ${fast.lip} m/s, under 30.5`);
    }
    assert.equal(sim.colliders.length, walls, 'the walls are put back after the jump check');
  } finally { restore(); }
});
test('the recorded exit sweep: the lip 10 m past the walls\' end (Ben\'s LIP_FROM_EXIT, 6 Nov 2026)', () => {
  const res = JSON.parse(readFileSync('tools/lapsim/results/lagoon.json', 'utf8'));
  assert.ok(res.inlet?.exit, 'results/lagoon.json records inlet.exit');
  assert.equal(res.inlet.exit.from, lagoonDef.walls[0].to);
  assert.ok(Math.abs(res.inlet.exit.lipDist - 10) <= 0.5, `lipDist ${res.inlet.exit.lipDist}`);
  assert.deepEqual(res.inlet.exit.sweep.map((sw) => sw.dt), ['1/60', '1/30']);
  for (const sw of res.inlet.exit.sweep) assert.deepEqual(sw.runs.map((q) => q.v0), [0, 5, 8, 10, 12, 15, 20, 23]);
});
test('the back arc (lagoon-v2): the line steers through the kink clean, and the brow holds it 1.5 m up at the crest\'s peak', async () => {
  const { sim, T, restore } = await lagoonSim();
  try {
    const t = sim.track, r = lagoonRun(sim), P = r.path, k = t.walls[3];
    const kink = P.filter((p) => p[1] >= k.from && p[1] <= k.to), lat = kink.map((p) => p[2]);
    assert.ok(Math.max(...lat) - Math.min(...lat) >= 3, `the line's offset across the kink spans ${(Math.max(...lat) - Math.min(...lat)).toFixed(1)} m`);
    assert.equal(r.wallHits, 0, 'no wall hits, the kink included');
    // At the crest's peak the line is on the brow: the ground under it (the car's y, or less if it is airborne) 1.5 m or more
    // above the same spot with the crest taken away (the flat grass). A line round the crest's shoulder fails this.
    const [lift] = t.lifts, peak = (lift.from + lift.to) / 2;
    const row = P.filter((p) => p[1] >= lift.from && p[1] < lift.to).reduce((b, p) => (Math.abs(p[1] - peak) < Math.abs(b[1] - peak) ? p : b));
    const { venueEntry } = await import('../ecosystem/js/entries.js');
    const up = T.groundHeight(row[7], row[8]);
    T.configureTerrain(venueEntry({ ...lagoonDef, lifts: [] }, { slug: 'lagoon' }).terrain);
    const flat = T.groundHeight(row[7], row[8]);
    assert.ok(up - flat >= 1.5, `the brow holds the line ${(up - flat).toFixed(2)} m above the flat at s ${row[1]} (offset ${row[2]} m)`);
  } finally { restore(); }
});
