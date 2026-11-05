// qa/content-unit.mjs: venue roads (plan 4, Task 4b). With no venues the hub's ROADS is exactly as before; with the
// ?venues=1 preview the only change is one 40 m "venue" road appended, leaving the ring at its district's exit.
import test from 'node:test'; import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ROADS, VENUES, DISTRICTS, venuesPreview, venueRoads } from '../ecosystem/js/content.js';

const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
const LAGOON = { key: 'lagoon', name: 'The Lagoon', track: 'lagoon-v1', url: '/ecosystem/tracks/lagoon/', off: 'partners', colour: 0x2fa7c9 };

test('with no venues ROADS is byte for byte the 22 roads it was before venues existed (c0d26d9)', () => {
  assert.deepEqual(VENUES, []);
  assert.deepEqual(venuesPreview(), [], 'node has no location, so the preview is off');
  assert.equal(ROADS.length, 22);
  assert.equal(hash(ROADS), '122fc1ed0ff683d6');
  assert.ok(!ROADS.some((r) => r.kind === 'venue'));
});

test('a venue road joins the ring at its district\'s exit and ends 40 m from where it starts', () => {
  const link = ROADS.find((r) => r.kind === 'link' && r.from === 'partners').points[0];
  const [r] = venueRoads([LAGOON], DISTRICTS, link);
  assert.equal(r.kind, 'venue'); assert.equal(r.from, 'partners'); assert.equal(r.to, 'lagoon'); assert.equal(r.venue, LAGOON);
  const exits = DISTRICTS.partners.exits;
  const exit = exits.find((e) => e.to === r.exit);
  assert.deepEqual(r.points[0], exit.at, 'the first point is the exit point of a ring road');
  const ring = ROADS.find((x) => x.kind === 'ring' && ((x.from === 'partners' && x.to === exit.to) || (x.to === 'partners' && x.from === exit.to)));
  assert.ok(ring.points.some((p) => p[0] === exit.at[0] && p[1] === exit.at[1]), 'that exit point is on the ring road');
  const other = exits.find((e) => e !== exit);
  const d = (p) => Math.hypot(p[0] - link[0], p[1] - link[1]);
  assert.ok(d(exit.at) > d(other.at), 'it leaves from the exit away from the Raceway link road');
  const [a, b] = [r.points[0], r.points.at(-1)];
  assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 40) < 1e-9);
});

test('the ?venues=1 preview appends one Lagoon road and changes nothing else', async () => {
  globalThis.location = { search: '?venues=1' };
  try {
    const m = await import('../ecosystem/js/content.js?preview=1');
    assert.deepEqual(m.venuesPreview().map((v) => v.key), ['lagoon']);
    assert.equal(m.ROADS.length, 23);
    assert.equal(JSON.stringify(m.ROADS.slice(0, 22)), JSON.stringify(ROADS));
    assert.equal(m.ROADS[22].kind, 'venue'); assert.equal(m.ROADS[22].to, 'lagoon');
  } finally { delete globalThis.location; }
});
