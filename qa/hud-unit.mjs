// The HUD's footer state (no three.js): node --test qa/hud-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { FOOT, footStep } from '../ecosystem/js/hud-math.js';
const run = (st, speed, secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) st = footStep(st, speed, dt); return st; };

test('footStep hides after a quarter second of driving and shows after a second and a half still', () => {
  assert.deepEqual(FOOT, { hideSpeed: 2, hideAfter: 0.25, showSpeed: 0.5, showAfter: 1.5 });
  let st = { driving: false, t: 0 };
  st = run(st, 6, 0.2); assert.equal(st.driving, false, 'not yet');
  st = run(st, 6, 0.1); assert.equal(st.driving, true, 'driving');
  st = run(st, 0, 1.4); assert.equal(st.driving, true, 'still waiting');
  st = run(st, 0, 0.2); assert.equal(st.driving, false, 'back');
});
test('footStep ignores a short burst', () => { let st = run({ driving: false, t: 0 }, 6, 0.15); st = run(st, 0, 0.5); assert.equal(st.driving, false); assert.equal(st.t, 0); });
test('a slow roll keeps the footer and reverse counts as driving', () => {
  assert.equal(run({ driving: false, t: 0 }, 1.5, 3).driving, false, 'under hideSpeed');
  assert.equal(run({ driving: false, t: 0 }, -6, 0.3).driving, true, 'reversing');
  assert.equal(run({ driving: true, t: 0 }, 1, 3).driving, true, 'a slow roll is not still');
});

// The Map sheet on a venue (R31, fix wave G): its lap record row, and the runner's venue-only branch
import { venueRecord } from '../ecosystem/js/map-math.js';
import { readFileSync } from 'node:fs';
const fmt = (ms) => { const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000; return `${m}:${s.toFixed(3).padStart(6, '0')}`; }; // raceway.js formatTime
test('a venue\'s lap record: the board\'s best when it has one, else the device\'s, else an invitation', () => {
  const board = { status: 'ok', top: [{ name: 'Ben', ms: 29469 }, { name: 'Rook', ms: 30100 }] };
  assert.deepEqual(venueRecord(board, { ms: 29000 }, fmt), { source: 'board', title: 'Lap record', text: 'Ben, 0:29.469' }, 'the board wins over a faster unposted device best');
  assert.deepEqual(venueRecord({ status: 'ok', top: [] }, { ms: 31250 }, fmt), { source: 'device', title: 'Your best lap', text: '0:31.250 on this device' });
  assert.deepEqual(venueRecord({ status: 'offline', top: [] }, { ms: 31250 }, fmt).source, 'device', 'offline still shows the device best');
  assert.equal(venueRecord({ status: 'loading', top: [] }, null, fmt).source, null);
  assert.match(venueRecord({ status: 'ok', top: [] }, null, fmt).text, /Race one/);
  assert.match(venueRecord({ status: 'offline', top: [] }, null, fmt).text, /offline/);
  assert.equal(venueRecord(undefined, null, fmt).source, null);
});
test('the runner: a venue\'s Map leads with its rows, drops the Strike figures, keeps phone rows; the hub branch is unchanged', () => {
  const src = readFileSync('ecosystem/js/runner.js', 'utf8');
  assert.match(src, /const onVenue = entry\.kind === "venue";\n\s*\$\("map-live"\)\.hidden = onVenue;\n\s*if \(!onVenue\) fillStats\(\$\("map-live"\), \["volume24h", "openInterest", "markets", "maxLeverage"\]\);\n\s*const groups = onVenue \? venueMapRows\(\) : \[\];/);
  assert.match(src, /if \(\$\("map"\)\.open && entry\.kind !== "venue"\) fillStats\(\$\("map-live"\)/, 'the live refresh skips a venue');
  assert.match(src, /venueRecord\(raceBoard\(\), deviceBest\(\), formatTime\)/);
  assert.match(src, /textContent: "Go to start" \}\);\n\s*start\.setAttribute\("aria-label", "Go to the start line"\);\n\s*start\.addEventListener\("click", \(\) => teleportDistrict\("raceway"\)\);/);
  assert.match(src, /className: entry\.kind === "venue" \? "map-item map-item--row" : "map-item"/, 'the hub keeps its rows as they were');
  assert.match(src, /const rec = \$\("map-venue-record"\);\n\s*if \(rec\) fillVenueRecord\(rec\);/, 'the record follows the board');
  const css = readFileSync('ecosystem/ecosystem.css', 'utf8');
  assert.match(css, /@media \(max-width: 480px\) \{\n\s*\.map-item--row \{ flex-direction: row; \}\n\s*\.map-item--row \.map-read \{ align-self: center; \}\n\}/, 'DRIVE IN stays beside its card at 375');
});
