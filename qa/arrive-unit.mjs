// qa/arrive-unit.mjs: the opening flight's path (arrive.js flightPath), shared by the hub and a venue opened directly (plan 5
// Task 5, ruling R10). It starts at the entry's start pose and ends exactly on the chase pose behind the car: node --test qa/arrive-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
const { flightPath, START } = await import('../ecosystem/js/arrive.js');
const { venueEntry } = await import('../ecosystem/js/entries.js');
const lagoon = (await import('../ecosystem/tracks/lagoon.js')).default;

const near = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const chaseOf = (s) => ({ pos: { x: s.x + Math.sin(s.heading) * 9, y: s.y + 4, z: s.z + Math.cos(s.heading) * 9 }, look: { x: s.x, y: s.y + 1, z: s.z } });

test('the hub: a quarter orbit from START over the grass east of HQ down to the chase pose, looking from HQ to the car', () => {
  const s = { x: 0, y: 0.5, z: 14, heading: 0 }, chase = chaseOf(s), hq = [0, 0];
  const p = flightPath({ s, chase, look: hq });
  const a = p(0), b = p(1);
  assert.ok(Math.abs(Math.hypot(a.pos[0] - s.x, a.pos[2] - s.z) - START.dist) < 1e-6, 'START.dist from the car');
  assert.equal(a.pos[1], START.height);
  assert.ok(near(a.look, [0, 6, 0]), 'looking at HQ');
  assert.ok(near(b.pos, [chase.pos.x, chase.pos.y, chase.pos.z]) && near(b.look, [chase.look.x, chase.look.y, chase.look.z]), 'ends on the chase pose');
});

test('a venue: starts at its flight pose above the venue centre, ends on the chase pose behind the car on the grid', () => {
  const e = venueEntry(lagoon, { slug: 'lagoon' });
  const s = { x: e.spawn.x, y: 0.5, z: e.spawn.z, heading: e.spawn.heading }, chase = chaseOf(s);
  const p = flightPath({ s, chase, look: e.flight.look, start: e.flight });
  const a = p(0), m = p(0.5), b = p(1);
  assert.ok(near(a.pos, [e.flight.at[0], e.flight.height, e.flight.at[1]]), `the start pose ${a.pos}`);
  assert.ok(Math.hypot(a.pos[0], a.pos[2]) <= 60 && a.pos[1] >= 150, 'high above the venue centre');
  assert.ok(near(a.look, [0, 6, 0]), 'looking at the centre');
  assert.ok(m.pos[1] < a.pos[1] && m.pos[1] > b.pos[1], 'coming down');
  assert.ok(near(b.pos, [chase.pos.x, chase.pos.y, chase.pos.z]) && near(b.look, [chase.look.x, chase.look.y, chase.look.z]), 'ends on the chase pose');
});
