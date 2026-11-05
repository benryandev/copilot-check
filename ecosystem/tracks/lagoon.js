// The Lagoon (venue track, design 7.10) as a track definition (see track-math.js for the shape).
// Plain data: a venue track needs no frame (entries.js venueEntry places it on the venue origin).
// Every `s` below was computed once with resolveTrack on these points (lap 847.8 m) and is written as a number;
// the comment names the point it came from. Once the track is open (it holds board records), a layout change needs a new
// id so old laps and ghosts do not sit on a new layout. lagoon-v1 opened on 6 Nov 2026 with plan 5's layout and an empty board.
// Plan 5 (5 Nov 2026): Turn 1 is a flat right kink off the start straight ([79, -65] [93, -78]) into a walled 150° left
// hairpin ([105, -88] [119, -85] [126, -72], about 17 m) that a 30 m/s car must lift for, then north to the inlet. The right-hand side
// sits 19 m west and the top 35 m north of the sketch, which keeps the tarmac share near a third with its start in the last corner.
// The lagoon-v2 relay (6 Nov 2026): the hairpin's exit is the end of the Turn 1 walls ([126, -60], s 195.9, gate 2 there).
// The ramp's lip sits 10 m past it (s 205.9; the plan proposed 15, Ben chose 10), so the ramp's foot is past the walls and
// the water 18 m past the foot (s 215.9), 20 m past the exit where v1's sat 30 m past it: a car leaving the hairpin slowly
// cannot reach take-off speed and wades. The back arc gets a blind, walled crest between gates 7 and 8 (lifts, walls[2]) and a walled
// right-left kink between gates 9 and 10 (two inserted points, walls on both sides), so the lap is no longer flat out there.
// floorMs and limits are tools/lapsim/results/lagoon.json (analyse --write on the optimiser's best clean lap).
export default {
  id: "lagoon-v2",
  name: "The Lagoon",
  sponsor: null,
  half: 6,
  points: [
    [-120, -60], [-60, -60], [0, -60], [60, -60], [79, -65], [93, -78], [105, -88], [119, -85], [126, -72], [126, -55],
    [126, -30], [124, 15], [108, 65], [85, 97], [65, 101], [50, 93], [25, 77], [0, 95], [-25, 77], [-50, 95],
    [-85, 97], [-120, 85], [-145, 20], [-156, 2], [-152, -14], [-150, -20], [-140, -48],
  ],
  start: [-40, -60],
  // 11 gates in lap order. The second is at the hairpin's exit (the walls' end, [126, -60]). The third sits 10 m past the
  // inlet's far bank (water s 215.9 + halfW 9.5 + 10 = 235.4), so its shift off [126, -30] (s 225.9) is 9.5.
  // Gates 1, 2 and 10 are as wide as the road (half 6, not the default 7.5): the cut line through the gates alone then stays
  // above 88% of the lap (88.2%; 87.8% with every gate at 7.5, the kink adding length the gates do not pin), and the floor
  // line crosses all three well inside (gate lat -4.9, -1.2, -4.7).
  gates: [
    { at: [105, -88], half: 6 }, { at: [126, -60], half: 6 }, { at: [126, -30], shift: 9.5 }, { at: [85, 97] }, { at: [25, 77] },
    { at: [-25, 77] }, { at: [-85, 97] }, { at: [-133, 55] }, { at: [-145, 20] }, { at: [-150, -20], half: 6 }, { at: [-140, -48] },
  ],
  // Low end at the walls' end + 10 − RAMP.length 8 (the lip 10 m past the hairpin's exit) and at water s − 18 (halfW 9.5 +
  // RAMP.length 8 + LIP_SETBACK 0.5, jump-math.js): the lip sits on the near bank
  ramps: [{ s: 197.9, side: 0, length: 8, height: 1.9, width: 5.4 }],
  // The inlet (s of [126, -40], the ramp's lip + 10) is a channel: straight across the track as a plain inlet is (terrain.js inletBody), then on
  // through `inside` (from the track toward the lake, ending in it: a 40 m arc, so the 10 m strip never folds on its inner
  // bank) and `outside` (out past the venue's radius, bending gently away from the hairpin); the relay moved
  // every channel point 10 m south with the crossing. The lake (terrain.js, kind
  // "lake"; rx along the frame's x) fills the infield north of the road home, 14 m or more from the track's edge.
  water: [
    { s: 215.9, halfW: 9.5, inside: [[60, -35.6], [45.4, -21], [38.5, -2], [34, 12]], outside: [[175, -48], [215, -65], [262, -88]] },
    { kind: "lake", centre: [-10, 31], rx: 95, ry: 26, depth: 1.2 },
  ],
  walls: [
    { from: 119.9, to: 195.9, sides: [-1, 1] }, // [79, -65] to [126, -60]: Turn 1, from the end of the start straight to the corner's exit
    { from: 401.8, to: 525.9, sides: [-1, 1] }, // [50, 93] to [-50, 95]: the esses
    { from: 575, to: 625, sides: [-1, 1] }, // about [-98, 95] to [-132, 63]: the crest (lifts[0]), so the line takes the brow, not its shoulder
    { from: 670.0, to: 713.9, sides: [-1, 1] }, // [-145, 20] to [-150, -20]: the kink, gate 9 to gate 10
  ],
  surface: [{ from: 757.9, to: 215.9, kind: "tarmac" }], // [-130, -56] in the last corner, across the line to the water (306 m, 36%)
  // A blind crest between gate 7 ([-85, 97]) and gate 8 ([-133, 55]): the Raceway's height, its peak near [-120, 85] (s 599.4)
  lifts: [{ from: 575, to: 625, height: 2.2 }],
  // s is the stand's centre, off its signed offset from the centreline (+ is the track's right: the outside in the venue's frame)
  stands: [
    { s: 247.4, off: 16, len: 40 }, // outside the water jump, facing the landing: s 227.4 to 267.4, its south end 2 m past the inlet's far bank (s 215.9 + halfW 9.5 = 225.4; plan 5 R13)
    { s: 0, off: 16, len: 90 }, // along the start straight, centred on the line ([-40, -60])
  ],
  // The road home (entries.js venueEntry): square off the start straight's outside at s 65 (about [25, -60]), past the start-line
  // stand's end (s 45) and well short of Turn 1's walls (s 119.9), out to the tree belt; the infield is the lake (plan 5 R13)
  home: { s: 65, side: 1 },
  floorMs: 29694,
  limits: { maxSpeed: 30.8, segMaxSpeed: 38 },
};
