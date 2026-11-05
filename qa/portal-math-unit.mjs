// Portal math (no three.js): node --test qa/portal-math-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { archLine, crossed, flightPath, portalRecord, readPortal } from '../ecosystem/js/portal-math.js';

const road = { pts: [[0, 0], [0, -20], [0, -40]] }; // heads -z
const arch = { x: 0, z: -40, half: 6 };
const line = archLine(road, arch);
const store = () => { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('archLine: across the road at the arch, half the arch width each side, f down the road', () => {
  assert.equal(line.fx, 0); assert.equal(line.fz, -1);
  assert.equal(Math.hypot(line.bx - line.ax, line.bz - line.az), 12);
  assert.equal(line.az, -40); assert.equal(line.bz, -40);
});

test('crossed: forward true, backward false, parallel miss false, 3 m outside the width false', () => {
  assert.equal(crossed([0, -39], [0, -41], line), true);
  assert.equal(crossed([0, -41], [0, -39], line), false);
  assert.equal(crossed([7, -30], [7, -50], line), false);
  assert.equal(crossed([0, -39], [10, -39], line), false);
  assert.equal(crossed([9, -39], [9, -41], line), false);
  assert.equal(crossed([0, -30], [0, -39], line), false); // stops short
});

test('flightPath: starts at the chase pose, ends 60 m up over the arch looking down the road', () => {
  const from = { pos: [1, 3, 5], look: [1, 1, -4] }, to = { x: 10, z: -40, fx: 0, fz: -1 };
  const a = flightPath(0, from, to), b = flightPath(1, from, to);
  assert.deepEqual(a.pos, from.pos); assert.deepEqual(a.look, from.look);
  assert.ok(Math.abs(b.pos[1] - (from.pos[1] + 60)) < 1e-9);
  assert.deepEqual([b.pos[0], b.pos[2]], [10, -40]);
  assert.equal(b.look[1], 0); assert.equal(b.look[0], 10); assert.ok(b.look[2] < -40);
  const m = flightPath(0.5, from, to); assert.ok(Math.abs(m.pos[1] - (from.pos[1] + 30)) < 1e-9); // smoothstep midpoint
});

test('readPortal: the record once; null when stale, for another page, garbage, or read twice', () => {
  const rec = portalRecord({ from: 'hub', to: 'lagoon', cam: [1, 2, 3], look: [0, 0, 0], heading: 1.5, now: 1000 });
  assert.equal(rec.at, 1000);
  const s = store(); s.setItem('eco-portal', JSON.stringify(rec));
  assert.deepEqual(readPortal(s, { to: 'lagoon', now: 5000 }), rec);
  assert.equal(readPortal(s, { to: 'lagoon', now: 5000 }), null);
  s.setItem('eco-portal', JSON.stringify(rec)); assert.equal(readPortal(s, { to: 'lagoon', now: 31001 }), null);
  assert.equal(s.getItem('eco-portal'), null);
  s.setItem('eco-portal', JSON.stringify(rec)); assert.equal(readPortal(s, { to: 'hub', now: 2000 }), null);
  assert.equal(s.getItem('eco-portal'), null);
  s.setItem('eco-portal', '{nope'); assert.equal(readPortal(s, { to: 'lagoon', now: 2000 }), null);
  s.setItem('eco-portal', JSON.stringify(rec)); assert.deepEqual(readPortal(s, { to: 'lagoon', now: 31000 }), rec); // exactly 30 s is fresh
});
