// qa/entries-unit.mjs: the world's entries (entries.js) and the shared runner (runner.js)
// The venue test uses a tiny fixture track (controller ruling R1); the Lagoon's own test comes with its module (Task 3).
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hubEntry, venueEntry } from '../ecosystem/js/entries.js';

const BUILDERS = ['districts', 'stops', 'boards', 'monuments', 'yard', 'ridge', 'windsocks', 'blimp', 'furniture', 'signs', 'props', 'bridges', 'raceway', 'portal'];
// A rectangle 80 by 40 whose centre sits at (100, 50), so centring has work to do
const tiny = ({ origin, angle }) => ({
  id: 'tiny-v1', name: 'Tiny', sponsor: null, half: 6, frame: { origin, angle },
  points: [[60, 30], [140, 30], [140, 70], [60, 70]], start: [100, 30],
  gates: [{ s: 40 }, { s: 120 }], ramps: [], walls: [], lifts: [], water: [], surface: [], stands: [],
});

test('hubEntry is the hub as today', () => {
  const e = hubEntry();
  assert.equal(e.kind, 'hub'); assert.equal(e.zone, 'hub');
  assert.deepEqual(Object.keys(e.builders).sort(), [...BUILDERS].sort());
  assert.ok(Object.values(e.builders).every(Boolean));
  assert.equal(e.terrain, null); assert.equal(e.track, null); assert.equal(e.portal, null);
  assert.deepEqual(e.spawn, { x: 0, z: 14, heading: 0 });
  assert.equal(e.arrival, 'flight'); assert.equal(e.home, '/ecosystem/'); assert.equal(e.multiplayer, true);
});

test('venueEntry centres the track, sizes the world and turns the hub builders off (tiny fixture)', () => {
  for (const mod of [tiny, tiny({ origin: [0, 0], angle: 0 })]) { // a track module is a function of its frame; a plain definition works too
    const e = venueEntry(mod, { slug: 'tiny' });
    assert.equal(e.kind, 'venue'); assert.equal(e.zone, 'tiny-v1'); assert.equal(e.title, 'Tiny');
    const pts = e.terrain.track.worldPoints;
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    assert.ok(Math.abs(cx) < 1 && Math.abs(cz) < 1, `centred (${cx}, ${cz})`);
    const extent = Math.max(...e.track.pts.map(([x, z]) => Math.hypot(x, z)));
    assert.ok(extent >= Math.hypot(40, 20) - 1 && extent < Math.hypot(40, 20) + 6, `extent ${extent}`);
    assert.equal(e.terrain.world.radius, extent + 80); assert.equal(e.terrain.world.cx, 0); assert.equal(e.terrain.world.cz, 0);
    assert.equal(e.terrain.track, e.track);
    assert.equal(e.terrain.roads.length, 2); // the track, then the road home (Task 5b)
    assert.equal(e.terrain.roads[1].kind, 'venue'); assert.equal(e.terrain.roads[1].venue.url, '/ecosystem/'); assert.equal(e.terrain.roads[1].venue.name, 'Strike HQ');
    assert.equal(e.url, '/ecosystem/tracks/tiny/');
    const r = e.terrain.roads[0];
    assert.equal(r.kind, 'track'); assert.equal(r.closed, true); assert.equal(r.half, 6); assert.deepEqual(r.points, pts);
    assert.deepEqual(e.terrain.jumps, []); assert.deepEqual(e.terrain.waters, []); assert.deepEqual(e.terrain.districts, {}); assert.deepEqual(e.terrain.stops, []);
    assert.deepEqual(Object.keys(e.builders).sort(), [...BUILDERS].sort());
    for (const k of BUILDERS) assert.equal(e.builders[k], k === 'raceway' || k === 'portal', `builder ${k}`);
    const g = e.track.at(e.track.len - 14);
    assert.ok(Math.abs(e.spawn.x - g.x) < 1e-9 && Math.abs(e.spawn.z - g.z) < 1e-9, 'spawn on the grid');
    assert.ok(Math.abs(-Math.sin(e.spawn.heading) - g.fx) < 1e-9 && Math.abs(-Math.cos(e.spawn.heading) - g.fz) < 1e-9, 'facing along the track');
    assert.equal(e.arrival, 'portal'); assert.equal(e.home, '/ecosystem/');
    assert.deepEqual(e.portal, { to: '/ecosystem/', from: 'tiny' });
    assert.equal(e.multiplayer, true);
  }
});

test('the source track module is not mutated and two venue entries do not share state', () => {
  const def = tiny({ origin: [0, 0], angle: 0 });
  const before = JSON.stringify(def);
  const a = venueEntry(def, { slug: 'a' }), b = venueEntry(def, { slug: 'b' });
  assert.equal(JSON.stringify(def), before);
  assert.notEqual(a.terrain, b.terrain); assert.notEqual(a.builders, b.builders);
  assert.notEqual(hubEntry().builders, hubEntry().builders);
});

// The top-level keys of the window.__eco literal (comments stripped)
function ecoKeys(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const i = src.indexOf('window.__eco = {'); if (i < 0) return null;
  let d = 0, k = [], tok = '', str = null;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    const c = src[j];
    if (str) { if (c === '\\') { j++; continue; } if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if ('{[('.includes(c)) { d++; if (d === 1) { tok = ''; } continue; }
    if ('}])'.includes(c)) { if (d === 1 && tok.trim()) k.push(tok.trim()); d--; if (d === 0) break; continue; }
    if (d === 1) { if (c === ',') { if (tok.trim()) k.push(tok.trim()); tok = ''; } else if (c === ':') { k.push(tok.trim()); tok = '\u0000'; } else if (tok !== '\u0000') tok += c; }
  }
  return k.filter((x) => x && x !== '\u0000').map((x) => x.replace(/^\.\.\./, '...'));
}
// Every key the hub's __eco had in main.js before the move (5 Nov 2026, at 41fc3d6); the smokes under qa/ read them
const ECO_KEYS = ["monuments","car","teleport","keys","stick","focusBoard","focusEnd","focus","boardPose","boardMarker","camera","project","jumps","groundHeight","placeCamera","placeCar","colliders","pads","deepLink","paused","blimp","stunt","stuntState","splash","sprayCount","overview","info","arrival","post","raceGates","toStart","inRaceway","renderer","scene","yardInject","ghostPreview","peersInject","peersMove","peersState","peersClose","peersConnects","ridge","windsocks","cine","celebrate","fireworks","sound","raceLive","raceLap","raceLiveInject","boost","arcade","arcadeBoard","emote","peerGroup","fps","tiers","quality"];

test('main.js is the hub entry and runner.js holds the body: every __eco key survives the move', () => {
  const main = readFileSync('ecosystem/js/main.js', 'utf8').replace(/^\/\/[^\n]*\n/gm, '').trim();
  assert.equal(main, 'import { runWorld } from "./runner.js";\nimport { hubEntry } from "./entries.js";\nrunWorld(hubEntry());');
  const runner = readFileSync('ecosystem/js/runner.js', 'utf8');
  assert.match(runner, /export async function runWorld\(entry\)/);
  assert.doesNotMatch(runner, /from "\.\/content\.js"/, 'the runner reads the world through the entry and the terrain accessors');
  assert.doesNotMatch(runner, /\b(DISTRICTS|STOPS|SPAWN|MULTIPLAYER)\b/);
  const keys = ecoKeys(runner);
  assert.ok(keys, 'runner.js assigns window.__eco');
  assert.deepEqual(ECO_KEYS.filter((k) => !keys.includes(k)), [], 'no __eco key lost');
});

test('venueEntry on the Lagoon: centred, sized under the 320 m ceiling, hub builders off', async () => {
  const lagoon = (await import('../ecosystem/tracks/lagoon.js')).default;
  const e = venueEntry(lagoon, { slug: 'lagoon' });
  assert.equal(e.kind, 'venue'); assert.equal(e.zone, 'lagoon-v1'); assert.equal(e.title, 'The Lagoon');
  assert.ok(e.terrain.world.radius > 200 && e.terrain.world.radius < 320, `radius ${e.terrain.world.radius}`);
  const pts = e.terrain.track.worldPoints;
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  assert.ok(Math.abs(cx) < 1 && Math.abs(cz) < 1, 'centred');
  assert.deepEqual(e.terrain.districts, {}); assert.equal(e.builders.districts, false); assert.equal(e.builders.raceway, true); assert.equal(e.builders.portal, true);
  assert.equal(e.arrival, 'portal'); assert.equal(e.home, '/ecosystem/'); assert.deepEqual(e.portal, { to: '/ecosystem/', from: 'lagoon' });
  assert.equal(e.track.gates.length, 12); assert.equal(e.track.water.length, 2, 'the inlet and the lake');
  assert.equal(e.carColour, 0x22c55e, 'no sponsor: the hub green');
});

test('the car colour: the hub green on the hub, a sponsor\'s colour on its venue', () => {
  assert.equal(hubEntry().carColour, 0x22c55e);
  const sponsored = tiny({ origin: [0, 0], angle: 0 }); sponsored.sponsor = { name: 'X', logo: null, colour: 0x123456 };
  assert.equal(venueEntry(sponsored, { slug: 'x' }).carColour, 0x123456);
  assert.equal(venueEntry(tiny, { slug: 'tiny' }).carColour, 0x22c55e);
});

test('venueEntry refuses a track too big for the room\'s pose bound', () => {
  const huge = tiny({ origin: [0, 0], angle: 0 }); huge.points = [[0, 0], [500, 0], [500, 300], [0, 300]]; huge.start = [250, 0];
  assert.throws(() => venueEntry(huge, { slug: 'huge' }), /320/);
});
