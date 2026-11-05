// qa/content-unit.mjs: venue roads (plan 4, Task 4b; on by default from plan 5 Task 5). The hub's ROADS is the 22 roads it
// was before venues existed plus exactly one 40 m "venue" road for the Lagoon, appended, leaving the ring at its district's
// exit; an empty venue list adds nothing. ?venues=1 (kept for QA) gives the same list.
import test from 'node:test'; import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ROADS, VENUES, DISTRICTS, venuesPreview, venueRoads } from '../ecosystem/js/content.js';

const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
const LAGOON = { key: 'lagoon', name: 'The Lagoon', track: 'lagoon-v2', url: '/ecosystem/tracks/lagoon/', off: 'partners', colour: 0x2fa7c9 };

const PRE_VENUE = '122fc1ed0ff683d6'; // the 22 roads before venues existed (c0d26d9)

test('VENUES holds the Lagoon by default, with a listing line of its own', () => {
  assert.deepEqual(VENUES.map((v) => v.key), ['lagoon']);
  const { line, ...rest } = VENUES[0];
  assert.deepEqual(rest, LAGOON);
  assert.ok(typeof line === 'string' && line.length > 40 && line.endsWith('.'), line);
  assert.deepEqual(venuesPreview(), VENUES, 'node has no location: the default list');
});

test('with the Lagoon on, ROADS is the pre-venue list plus exactly the venue road', () => {
  assert.equal(ROADS.length, 23);
  assert.equal(hash(ROADS.slice(0, 22)), PRE_VENUE, 'the first 22 are byte for byte the roads before venues');
  assert.deepEqual(ROADS.filter((r) => r.kind === 'venue').map((r) => r.to), ['lagoon']);
  assert.equal(ROADS[22].kind, 'venue'); assert.equal(ROADS[22].venue, VENUES[0]);
});

test('an empty venue list adds no road, so the pre-venue list is what the hub had with none', () => {
  const link = ROADS.find((r) => r.kind === 'link' && r.from === 'partners').points[0];
  assert.deepEqual(venueRoads([], DISTRICTS, link), []);
  assert.equal(hash([...ROADS.slice(0, 22), ...venueRoads([], DISTRICTS, link)]), PRE_VENUE);
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

test('the ?venues=1 preview (kept for QA) gives the same list and the same roads', async () => {
  globalThis.location = { search: '?venues=1' };
  try {
    const m = await import('../ecosystem/js/content.js?preview=1');
    assert.deepEqual(m.venuesPreview(), m.VENUES);
    assert.equal(JSON.stringify(m.ROADS), JSON.stringify(ROADS));
  } finally { delete globalThis.location; }
});
