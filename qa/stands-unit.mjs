// The Lagoon's grandstands (plan 5 Task 1b, stands.js): one per `track.stands` entry, on its side of the track, one collider
// box each, clear of the track's edge by 2 m or more, the crowd one instanced draw: node --test qa/stands-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../ecosystem/vendor/three.module.min.js';
import * as T from '../ecosystem/js/terrain.js';
import { venueEntry, hubEntry } from '../ecosystem/js/entries.js';
import lagoon from '../ecosystem/tracks/lagoon.js';
import { buildStands, STAND } from '../ecosystem/js/stands.js';

const hub = T.terrainConfig();
const entry = venueEntry(lagoon, { slug: 'lagoon' }), trk = entry.track;
const pal = { build: 0xf5f6f8, trim: 0x0d0d0d, wood: 0x8a6a48 };
const withLagoon = (fn) => { T.configureTerrain(entry.terrain); try { return fn(); } finally { T.configureTerrain(hub); } };
/** Distance from (x, z) to the track's centreline polyline */
const centreDist = (x, z) => {
  let best = Infinity; const p = trk.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    best = Math.min(best, Math.hypot(x - ax - vx * u, z - az - vz * u));
  }
  return best;
};
/** Points round a collider box's outline, every metre or so */
const outline = (b) => {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), pts = [];
  const at = (u, v) => [b.cx + u * c + v * s, b.cz - u * s + v * c]; // local x along (cos yaw, −sin yaw), as orientedBox
  for (let u = -b.hx; u <= b.hx + 1e-9; u += Math.min(1, b.hx)) for (const v of [-b.hz, b.hz]) pts.push(at(u, v));
  for (let v = -b.hz; v <= b.hz + 1e-9; v += Math.min(1, b.hz)) for (const u of [-b.hx, b.hx]) pts.push(at(u, v));
  return pts;
};

test('the Lagoon has two stands: the jump stand north of the inlet\'s far bank (R13), the start-line stand on the line', () => {
  assert.deepEqual(trk.stands, [{ s: 259, off: 16, len: 40 }, { s: 0, off: 16, len: 90 }]);
  const inlet = trk.water.find((w) => w.kind !== 'lake');
  assert.ok(259 - 40 / 2 >= inlet.s + inlet.halfW + 2, 'the jump stand\'s south end clears the far bank by 2 m');
});

test('buildStands: one stand per entry at its s and on its side, 8 m deep, one collider box each and nothing else solid', () => withLagoon(() => {
  const scene = new THREE.Scene();
  const g = buildStands(scene, trk, pal);
  assert.ok(g && g.parent === scene, 'added to the scene');
  const boxes = g.userData.boxes;
  assert.equal(boxes.length, trk.stands.length, 'one box per stand');
  trk.stands.forEach((st, i) => {
    const b = boxes[i], p = trk.at(st.s);
    const along = (b.cx - p.x) * p.fx + (b.cz - p.z) * p.fz, side = (b.cx - p.x) * p.rx + (b.cz - p.z) * p.rz;
    assert.ok(Math.abs(along) < 0.5, `stand ${i} centred on s ${st.s} (${along.toFixed(2)} m along)`);
    assert.ok(Math.sign(side) === Math.sign(st.off) && Math.abs(side - st.off) < 0.5, `stand ${i} at off ${st.off} (${side.toFixed(2)})`);
    assert.ok(Math.abs(b.hx * 2 - st.len) < 1e-6, `stand ${i} ${st.len} m long`);
    assert.equal(b.hz * 2, STAND.depth, `stand ${i} ${STAND.depth} m deep`);
    assert.equal(STAND.depth, 8);
  });
  assert.equal(typeof g.userData.recolour, 'function'); g.userData.recolour(pal);
}));

test('no stand comes nearer than 2 m to the track\'s edge', () => withLagoon(() => {
  const g = buildStands(new THREE.Scene(), trk, pal);
  g.userData.boxes.forEach((b, i) => {
    const gap = Math.min(...outline(b).map(([x, z]) => centreDist(x, z))) - trk.half;
    assert.ok(gap >= 2, `stand ${i}: ${gap.toFixed(2)} m from the edge`);
  });
}));

test('the crowd is one instanced draw for every stand, and sways only with motion allowed', () => withLagoon(() => {
  const g = buildStands(new THREE.Scene(), trk, pal);
  const inst = []; g.traverse((o) => { if (o.isInstancedMesh) inst.push(o); });
  assert.equal(inst.length, 1, 'one crowd mesh');
  assert.ok(inst[0].count > 200, `${inst[0].count} in the crowd`);
  assert.equal(typeof g.userData.tick, 'function', 'a tick for the sway');
  const still = buildStands(new THREE.Scene(), trk, pal, { reduceMotion: true });
  assert.equal(still.userData.tick, null, 'no tick under reduced motion');
}));

test('a track without stands builds nothing (the hub\'s Raceway)', () => {
  const scene = new THREE.Scene();
  assert.equal(buildStands(scene, T.trackDef(), pal), null);
  assert.equal(scene.children.length, 0);
});

test('the runner builds the stands under builders.stands and makes their boxes solid; venues have the builder, the hub too (no stands there)', () => {
  const src = readFileSync('ecosystem/js/runner.js', 'utf8');
  assert.match(src, /if \(entry\.builders\.stands\)[^\n]*buildStands\(scene, trackDef\(\), pal\(\), \{ reduceMotion \}\)/);
  assert.match(src, /stands\.userData\.boxes\.map\(\(b\) => orientedBox\(b\.cx, b\.cz, b\.hx, b\.hz, b\.yaw\)\)/);
  assert.equal(venueEntry(lagoon, { slug: 'lagoon' }).builders.stands, true);
  assert.equal(hubEntry().builders.stands, true);
});
