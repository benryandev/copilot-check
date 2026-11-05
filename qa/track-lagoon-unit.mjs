// qa/track-lagoon-unit.mjs: the Lagoon's layout (ecosystem/tracks/lagoon.js, design 7.10) resolved by track-math.js
import test from 'node:test'; import assert from 'node:assert/strict';
import { resolveTrack, inStretch } from '../ecosystem/js/track-math.js';
import { venueEntry } from '../ecosystem/js/entries.js';
import { RAMP, LIP_SETBACK } from '../ecosystem/js/jump-math.js';
import { generate } from '../tools/tracks-json.mjs';
import lagoon from '../ecosystem/tracks/lagoon.js';

const wrapLen = (from, to, len) => (to - from + len) % len;

test('the Lagoon resolves: 11 gates in order, lap about 780 m, start on the straight, tarmac about a third', () => {
  const t = resolveTrack(lagoon);
  assert.equal(lagoon.id, 'lagoon-v1'); assert.equal(lagoon.name, 'The Lagoon'); assert.equal(lagoon.sponsor, null); assert.equal(t.half, 6);
  assert.equal(lagoon.points.length, 21); assert.deepEqual(lagoon.start, [-40, -60]);
  assert.equal(t.gates.length - 1, 11, 'eleven gates after the start line'); assert.equal(t.checkpoints.length, 11);
  assert.ok(t.len > 740 && t.len < 820, t.len);
  assert.ok(t.gates.every((g, i) => i === 0 || g.s > t.gates[i - 1].s), 'gates in lap order');
  const tarmac = t.surface[0]; assert.equal(tarmac.kind, 'tarmac');
  const share = wrapLen(tarmac.from, tarmac.to, t.len) / t.len; // the stretch crosses the line
  assert.ok(share > 0.3 && share < 0.42, `tarmac share ${share}`);
  assert.ok(inStretch(0, tarmac.from, tarmac.to, t.len), 'the start line is on tarmac');
  const w = t.water[0];
  assert.ok(t.gates.some((g) => g.s > w.s + w.halfW + 8 && g.s < w.s + w.halfW + 14), 'first gate after the water sits about 10 m past the far bank');
  assert.equal(lagoon.floorMs, null); assert.equal(lagoon.limits, null); assert.deepEqual(lagoon.lifts, []);
});

test('every written s is the named point\'s s on the resolved track (to 0.5 m)', () => {
  const t = resolveTrack(lagoon), sAt = (x, y) => t.sOf(t.toWorld(x, y));
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.5, `${what}: written ${a}, resolved ${b}`);
  near(lagoon.water[0].s, sAt(145, 25), 'water at [145, 25]'); assert.equal(lagoon.water[0].halfW, 9.5);
  near(lagoon.surface[0].from, sAt(-80, -60), 'tarmac from [-80, -60]'); assert.equal(lagoon.surface[0].to, lagoon.water[0].s, 'tarmac to the water');
  near(lagoon.walls[0].from, sAt(50, 58), 'walls from [50, 58]'); near(lagoon.walls[0].to, sAt(-50, 60), 'walls to [-50, 60]');
  assert.deepEqual(lagoon.walls[0].sides, [-1, 1]);
  // The ramp's low end at water s - halfW - RAMP.length - LIP_SETBACK, so the lip sits on the near bank
  const r = lagoon.ramps[0];
  near(r.s, lagoon.water[0].s - 9.5 - RAMP.length - LIP_SETBACK, 'ramp low end');
  assert.deepEqual({ side: r.side, length: r.length, height: r.height, width: r.width }, { side: 0, length: 8, height: 1.9, width: 5.4 });
  const third = t.gates[3]; // [0] is the start line
  near(third.s, lagoon.water[0].s + 9.5 + 10, 'third gate 10 m past the far bank');
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

test('the registry lists the Lagoon with no limits (not open)', async () => {
  const e = (await generate())['lagoon-v1'];
  assert.equal(e.name, 'The Lagoon'); assert.equal(e.checkpoints.length, 11); assert.ok(e.length > 740 && e.length < 820);
  for (const k of ['minMs', 'maxSpeed', 'segMaxSpeed']) assert.equal(e[k], undefined, k);
});
