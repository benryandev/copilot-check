// The world's entries: what runWorld (runner.js) builds and where. Pure: no scene, no DOM, node-testable.
// The hub is today's world, every builder on and its terrain self-configured (terrain.js hubConfig). A venue is one
// track module resolved at the venue origin in a world sized to it, with only the raceway and the portal home built.

import { SPAWN, MULTIPLAYER } from "./content.js";
import { frameToWorld, resolveTrack } from "./track-math.js";

const BUILDERS = ["districts", "stops", "boards", "monuments", "yard", "ridge", "windsocks", "blimp", "furniture", "signs", "props", "bridges", "raceway", "portal"];
const builders = (on) => Object.fromEntries(BUILDERS.map((k) => [k, on(k)]));
const HOME = "/ecosystem/";

export function hubEntry() {
  return {
    kind: "hub", zone: "hub", title: "Strike ecosystem", terrain: null, builders: builders(() => true),
    spawn: { ...SPAWN }, arrival: "flight", track: null, portal: null, home: HOME, multiplayer: MULTIPLAYER,
  };
}

// A track module is a function of its frame ({ origin, angle }) returning the definition; a plain definition works too.
// The frame's origin is shifted so the centroid of the track's points lands on the venue origin, angle 0, which moves
// every coordinate given in the track's own frame (the start, any gate `at`, the water) with it.
export function venueEntry(mod, { slug }) {
  const defAt = (frame) => (typeof mod === "function" ? mod(frame) : { ...mod, frame });
  const zero = frameToWorld({ origin: [0, 0], angle: 0 });
  const w = defAt({ origin: [0, 0], angle: 0 }).points.map(([x, y]) => zero(x, y));
  const cx = w.reduce((a, p) => a + p[0], 0) / w.length, cz = w.reduce((a, p) => a + p[1], 0) / w.length;
  const track = resolveTrack(defAt({ origin: [-cx, -cz], angle: 0 }));
  const extent = Math.max(...track.pts.map(([x, z]) => Math.hypot(x, z)));
  const grid = track.at(track.len - 14);
  return {
    kind: "venue", zone: track.id, title: track.name,
    terrain: {
      world: { cx: 0, cz: 0, radius: extent + 80 },
      roads: [{ kind: "track", from: "track", to: "track", closed: true, half: track.half, points: track.worldPoints }],
      jumps: [], waters: [], districts: {}, stops: [], track, // the track's ramps and inlets are derived in configureTerrain
    },
    builders: builders((k) => k === "raceway" || k === "portal"),
    spawn: { x: grid.x, z: grid.z, heading: Math.atan2(-grid.fx, -grid.fz) }, // the car faces (-sin h, -cos h)
    arrival: "portal", track, portal: { to: HOME, from: slug }, home: HOME, multiplayer: MULTIPLAYER,
  };
}
