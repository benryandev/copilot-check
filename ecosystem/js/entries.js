// The world's entries: what runWorld (runner.js) builds and where. Pure: no scene, no DOM, node-testable.
// The hub is today's world, every builder on and its terrain self-configured (terrain.js hubConfig). A venue is one
// track module resolved at the venue origin in a world sized to it, with only the raceway and the portal home built.

import { SPAWN, MULTIPLAYER, HUB_COLOUR } from "./content.js";
import { frameToWorld, resolveTrack } from "./track-math.js";
import { venueArchRoad } from "./portal-math.js";

const BUILDERS = ["districts", "stops", "boards", "monuments", "yard", "ridge", "windsocks", "blimp", "furniture", "signs", "props", "bridges", "raceway", "portal", "stands"];
const builders = (on) => Object.fromEntries(BUILDERS.map((k) => [k, on(k)]));
const HOME = "/ecosystem/";
const MAX_RADIUS = 320; // the room's pose bound is 400 m; a venue world stays well inside it

export function hubEntry() {
  return {
    kind: "hub", zone: "hub", url: HOME, title: "Strike ecosystem", terrain: null, builders: builders(() => true),
    spawn: { ...SPAWN }, arrival: "flight", flight: null, track: null, portal: null, home: HOME, multiplayer: MULTIPLAYER, carColour: HUB_COLOUR,
  };
}

// How a page opens (ruling R10, spec 7.2): through an arch, a portal record is waiting and the car lands with no intro;
// otherwise the entry's own arrival, the opening flight that ends in the intro (hub and venue alike; runner.js asks
// wantsArrival() for it, so reduced motion and a second visit in the tab skip straight to the intro)
export const arrivalFor = (entry, landing) => (landing ? "portal" : entry.arrival);

// A venue's opening flight (arrive.js flightPath): from high over the venue, FLIGHT.back m out from its centre on the
// grid's side, looking at the centre so the lake and the whole track are in view, down to the chase camera on the grid.
// The fog is pushed out past the far side of the track for the overview and closes back in on the way down, and the clouds
// (26 to 50 m up, under the start) are moved off the venue's middle so they do not hide the track (`clouds`, sky.js clear).
const FLIGHT = { back: 60, height: 230, fog: 40, clouds: 150 };

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
  const radius = extent + 80;
  if (!(radius < MAX_RADIUS)) throw new Error(`venueEntry: ${track.id} needs a world radius of ${Math.round(radius)} m; venues must stay under ${MAX_RADIUS} m`);
  const grid = track.at(track.len - 14);
  // The road home, to an arch named for Strike HQ (Task 5b): where the track says (its `home`: the Lagoon's leaves the start
  // straight's outside at s 65, past the start-line stand, since its infield is the lake; plan 5 R13) it runs out to the tree
  // belt and ends 5 m into it, so the arch (5 m back from the end) stands at the tree line, radius − 60; otherwise 40 m off the
  // start straight beside the grid, clear of the track. `from: "raceway"` puts the arch in the raceway's group, which the frame
  // culls by distance to the track.
  const homePts = track.home ? venueArchRoad(track, { s: track.home.s, side: track.home.side, to: radius - 60 + 5 }) : venueArchRoad(track);
  // R22: the arch is signed "Back to the World"; the venue keeps the name Strike HQ, so the where-label reads "Road to Strike HQ"
  const home = { kind: "venue", from: "raceway", to: "home", venue: { key: "home", name: "Strike HQ", sign: "Back to the World", colour: HUB_COLOUR, url: HOME }, points: homePts };
  const gl = Math.hypot(grid.x, grid.z) || 1;
  const at = [(grid.x / gl) * FLIGHT.back, (grid.z / gl) * FLIGHT.back];
  const reach = Math.max(...track.pts.map(([x, z]) => Math.hypot(x - at[0], z - at[1])));
  const flight = { at, height: FLIGHT.height, look: [0, 0], clouds: FLIGHT.clouds, fog: { near: Math.round(Math.hypot(FLIGHT.back, FLIGHT.height)), far: Math.round(Math.hypot(reach, FLIGHT.height) + FLIGHT.fog) } };
  return {
    kind: "venue", zone: track.id, url: `/ecosystem/tracks/${slug}/`, title: track.name,
    terrain: {
      world: { cx: 0, cz: 0, radius },
      roads: [{ kind: "track", from: "track", to: "track", closed: true, half: track.half, points: track.worldPoints }, home],
      jumps: [], waters: [], districts: {}, stops: [], track, // the track's ramps, inlets and lakes are derived in configureTerrain
      // A shallow bowl: flat to 20 m past the track's outermost point (the start of the tree belt, radius − 60), then 6 m up over
      // the belt's inner 30 m, so the belt stands on a rim and no point of the track or its run-off changes height (R2)
      bowl: { from: extent + 20, to: extent + 50, height: 6 },
    },
    builders: builders((k) => k === "raceway" || k === "portal" || k === "stands"),
    spawn: { x: grid.x, z: grid.z, heading: Math.atan2(-grid.fx, -grid.fz) }, // the car faces (-sin h, -cos h)
    arrival: "flight", flight, track, portal: { to: HOME, from: slug }, home: HOME, multiplayer: MULTIPLAYER,
    carColour: track.sponsor?.colour ?? HUB_COLOUR,
  };
}
