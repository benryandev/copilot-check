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
  const src = readFileSync('ecosystem/js/main.js', 'utf8');
  assert.match(src, /shareCaption\(trackDef\(\)\.name\), \{ band: brandFor\(trackDef\(\)\.sponsor\)\.band, ink: brandFor\(trackDef\(\)\.sponsor\)\.paper \}/, 'main.js colours the saved image through brandFor');
  assert.doesNotMatch(src, /band: REALFI\.green/, 'no hard-wired RealFi band');
});
