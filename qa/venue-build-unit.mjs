// qa/venue-build-unit.mjs: the Raceway's gantry and board take the track's sponsor and name
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackDef } from '../ecosystem/js/terrain.js';
import { boardHeader, brandFor } from '../ecosystem/js/sponsor-math.js';
test('the Raceway module carries its sponsor and the hub gantry keeps the RealFi branding', () => {
  assert.deepEqual(trackDef().sponsor, { name: 'RealFi', logo: 'realfi', colour: 0x0fb89c });
  assert.equal(trackDef().name, 'RealFi Raceway');
  assert.equal(boardHeader(trackDef().sponsor), 'RACEWAY TOP 10', 'the hub board reads as it did');
  assert.equal(boardHeader(null), 'TOP 10', 'a track with no sponsor gets a plain header');
  const hub = brandFor(trackDef().sponsor);
  assert.deepEqual(hub, { band: '#032327', accent: '#0fb89c', paper: '#fafafa', logo: true }, 'RealFi colours and logo on the hub');
  const plain = brandFor(null);
  assert.equal(plain.logo, false); assert.notEqual(plain.band, '#032327');
  assert.equal(brandFor({ name: 'Acme', logo: 'acme', colour: 0xff0000 }).logo, false, 'only RealFi has a logo asset');
  const src = readFileSync('ecosystem/js/raceway.js', 'utf8');
  assert.match(src, /export\s*\{[^}]*\bboardHeader\b[^}]*\}\s*from\s*["']\.\/sponsor-math\.js["']/, 'raceway.js exports boardHeader');
  assert.match(src, /trackDef\(\)\.sponsor/, 'raceway.js reads the configured sponsor');
});
test('the saved board image takes its band and ink from the sponsor: RealFi on the hub, neutral without one', () => {
  const hub = brandFor(trackDef().sponsor);
  assert.equal(hub.band, '#032327'); assert.equal(hub.paper, '#fafafa', 'the hub image keeps RealFi green and paper as before');
  const plain = brandFor(null);
  assert.equal(plain.band, '#1b1f24'); assert.equal(plain.paper, '#fafafa', 'a track with no sponsor gets the neutral band');
  const src = readFileSync('ecosystem/js/runner.js', 'utf8');
  assert.match(src, /shareCaption\(trackDef\(\)\.name\), \{ band: brandFor\(trackDef\(\)\.sponsor\)\.band, ink: brandFor\(trackDef\(\)\.sponsor\)\.paper \}/, 'main.js colours the saved image through brandFor');
  assert.doesNotMatch(src, /band: REALFI\.green/, 'no hard-wired RealFi band');
});

// Plan 5 Task 1b (ruling R4): the Raceway's crates, cones and bales are its sponsor's dressing, placed at the Raceway's own s
// values (the chicane, the hairpins); a track with no sponsor builds none of them, the Raceway keeps every one
import { racewayProps } from '../ecosystem/js/sponsor-math.js';
import { venueEntry } from '../ecosystem/js/entries.js';
import lagoon from '../ecosystem/tracks/lagoon.js';
test('no crates for a track with no sponsor; the Raceway keeps its crates, cones and bales where they were', () => {
  const lag = venueEntry(lagoon, { slug: 'lagoon' }).track;
  assert.equal(lag.sponsor, null);
  assert.deepEqual(racewayProps(lag), [], 'nothing on the Lagoon');
  const props = racewayProps(trackDef()), count = (k) => props.filter((p) => p.kind === k).length;
  assert.deepEqual([count('crate'), count('cone'), count('bale')], [15, 6, 6], 'five stacks of three crates, six cones, six bales');
  const h = trackDef().half;
  // the first stack, outside the gantry on the left, as buildProps placed it: two side by side, one on top turned 0.3
  assert.deepEqual(props.slice(0, 3), [
    { kind: 'crate', s: 8, v: -(h + 4) - 0.65, yaw: 0, lift: 0 }, { kind: 'crate', s: 8, v: -(h + 4) + 0.65, yaw: 0, lift: 0 }, { kind: 'crate', s: 8, v: -(h + 4), yaw: 0.3, lift: 1.2 },
  ]);
  assert.deepEqual(props.filter((p) => p.kind === 'cone').map((p) => [p.s, p.v]), [[346, -4], [342, -4], [368, 4], [364, 4], [390, -4], [386, -4]]);
  assert.deepEqual(props.filter((p) => p.kind === 'bale').map((p) => p.s), [205, 213, 221, 544, 552, 560]);
  for (const b of props.filter((p) => p.kind === 'bale')) assert.equal(Math.abs(b.v), h + 1.6);
  const src = readFileSync('ecosystem/js/raceway.js', 'utf8');
  assert.match(src, /racewayProps\(trackDef\(\)\)/, 'raceway.js places what racewayProps lists');
});
