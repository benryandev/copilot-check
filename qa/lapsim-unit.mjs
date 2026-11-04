import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSim } from '../tools/lapsim/sim.mjs';
import { cutLine } from '../tools/lapsim/cut.mjs';
import { TRACK } from '../ecosystem/js/content.js';
const ghost = JSON.parse(readFileSync('qa/fixtures/lapsim/ghost-ninja1-23034.json', 'utf8')).ghost;
const line = JSON.parse(readFileSync('qa/fixtures/lapsim/line-realfi-22914.json', 'utf8'));
test('the leader\'s lap replays within 60 ms of the real 23.034 with the bales cleared', async () => {
  const sim = await makeSim({ props: 'cleared' });
  const r = sim.runLap(sim.ghostPath(ghost.trace), { look: 9 });
  assert.ok(r.valid, r.reason); assert.ok(Math.abs(r.ms - 23034) < 60, `${r.ms}`);
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
