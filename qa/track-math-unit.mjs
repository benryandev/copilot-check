// qa/track-math-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { resolveTrack, frameToWorld } from '../ecosystem/js/track-math.js';
const square = { id: 't', half: 6, points: [[0, 0], [100, 0], [100, 60], [0, 60]], gates: [{ at: [100, 30] }, { at: [50, 60] }, { at: [0, 30] }] };

test('a closed track is sampled about 2 m apart, with s = 0 at points[0] and the lap closed', () => {
  const t = resolveTrack(square);
  assert.ok(t.len > 280 && t.len < 360, `lap ${t.len}`); // a rounded 100 × 60 loop
  assert.ok(Math.hypot(t.at(0).x - 0, t.at(0).z - 0) < 0.6);
  assert.ok(Math.hypot(t.at(t.len).x - t.at(0).x, t.at(t.len).z - t.at(0).z) < 0.01);
});
test('gates by point resolve to arc lengths in lap order, width half + 1.5', () => {
  const t = resolveTrack(square);
  assert.deepEqual(t.gates.map((g) => g.i), [0, 1, 2, 3]);
  assert.ok(t.gates[1].s < t.gates[2].s && t.gates[2].s < t.gates[3].s);
  assert.equal(t.gates[1].w, 7.5);
  assert.deepEqual(t.checkpoints, t.gates.slice(1).map((g) => Math.round(g.s)));
});
test('gates by s and a gate half override are kept as given', () => {
  const t = resolveTrack({ ...square, gates: [{ s: 120, half: 6.5 }, { s: 200 }] });
  assert.equal(t.gates[1].s, 120); assert.equal(t.gates[1].w, 6.5); assert.equal(t.gates[2].s, 200);
});
test('start re-roots s, and a gate just behind the start wraps to the end of the lap', () => {
  const t = resolveTrack({ ...square, start: [50, 0], gates: [{ at: [45, 0] }, { at: [100, 30] }] });
  assert.ok(t.sOf([50, 0]) < 1.2 || t.sOf([50, 0]) > t.len - 1.2, 'the sample nearest the start is s = 0');
  const behind = t.gates.find((g) => Math.abs(g.x - 45) < 2);
  assert.ok(behind.s > t.len - 8 && behind.s < t.len, `gate behind the line at s ${behind.s}`);
  assert.equal(behind.i, 2, 'it is the last gate in lap order');
});
test('shift moves a gate along the lap and wraps past the end', () => {
  const base = resolveTrack({ ...square, gates: [{ at: [0, 30] }] }).gates[1].s; // on the last leg, near the end of the lap
  const t = resolveTrack({ ...square, gates: [{ at: [0, 30], shift: 80 }] });
  const g = t.gates[1], wrapped = (((g.s - base - 80) % t.len) + t.len) % t.len;
  assert.ok(wrapped < 1e-6 || t.len - wrapped < 1e-6, `s ${g.s} is base ${base} + 80 modulo the lap`);
  assert.ok(g.s < base, 'it wrapped past the start');
});
test('frameToWorld matches the raceway frame', () => {
  const a = 1.1, to = frameToWorld({ origin: [Math.sin(a) * 303, -Math.cos(a) * 303], angle: a });
  const rOut = [Math.sin(a), -Math.cos(a)], rAlong = [Math.cos(a), Math.sin(a)];
  const expect = (x, y) => [rOut[0] * (303 + y) + rAlong[0] * x, rOut[1] * (303 + y) + rAlong[1] * x];
  for (const [x, y] of [[0, 0], [-62, -36], [141, -12]]) { const p = to(x, y), q = expect(x, y); assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9); }
});
