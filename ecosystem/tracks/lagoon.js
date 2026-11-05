// The Lagoon (venue track, design 7.10) as a track definition (see track-math.js for the shape).
// Plain data: a venue track needs no frame (entries.js venueEntry places it on the venue origin).
// Every `s` below was computed once with resolveTrack on these points (lap 844.5 m) and is written as a number;
// the comment names the point it came from. Change the track and give it a new id.
// Plan 5 (5 Nov 2026): Turn 1 is a flat right kink off the start straight ([79, -65] [93, -78]) into a walled 150° left
// hairpin ([105, -88] [119, -85] [126, -72], about 17 m) that a 30 m/s car must lift for, then north to the inlet. The right-hand side
// sits 19 m west and the top 35 m north of the sketch, which keeps the tarmac share near a third with its start in the last corner.
// floorMs and limits are tools/lapsim/results/lagoon.json (analyse --write on the optimiser's best clean lap).
export default {
  id: "lagoon-v1",
  name: "The Lagoon",
  sponsor: null,
  half: 6,
  points: [
    [-120, -60], [-60, -60], [0, -60], [60, -60], [79, -65], [93, -78], [105, -88], [119, -85], [126, -72], [126, -55],
    [126, -30], [124, 15], [108, 65], [85, 97], [65, 101], [50, 93], [25, 77], [0, 95], [-25, 77], [-50, 95],
    [-85, 97], [-120, 85], [-145, 20], [-150, -20], [-140, -48],
  ],
  start: [-40, -60],
  // 11 gates in lap order. The third sits 10 m past the inlet's far bank (water s 227.5 + halfW 9.5 + 10 = 247),
  // so its shift is 19.5.
  gates: [
    { at: [105, -88] }, { at: [126, -55] }, { at: [126, -30], shift: 19.5 }, { at: [85, 97] }, { at: [25, 77] },
    { at: [-25, 77] }, { at: [-85, 97] }, { at: [-133, 55] }, { at: [-145, 20] }, { at: [-150, -20] }, { at: [-140, -48] },
  ],
  // Low end at water s − 18 (halfW 9.5 + RAMP.length 8 + LIP_SETBACK 0.5, jump-math.js): the lip sits on the near bank
  ramps: [{ s: 209.5, side: 0, length: 8, height: 1.9, width: 5.4 }],
  water: [{ s: 227.5, halfW: 9.5 }], // s of [126, -30]
  walls: [
    { from: 119.8, to: 197.6, sides: [-1, 1] }, // [79, -65] to [126, -60]: Turn 1, from the end of the start straight to the corner's exit
    { from: 403.2, to: 527.1, sides: [-1, 1] }, // [50, 93] to [-50, 95]: the esses
  ],
  surface: [{ from: 754.7, to: 227.5, kind: "tarmac" }], // [-130, -56] in the last corner, across the line to the water (317 m, 38%)
  lifts: [],
  // s is the stand's centre, off its signed offset from the centreline (+ is the track's right: the outside in the venue's frame)
  stands: [
    { s: 241.5, off: 16, len: 40 }, // outside the water jump, facing the landing (water s 227.5 + 14)
    { s: 0, off: 16, len: 90 }, // along the start straight, centred on the line ([-40, -60])
  ],
  floorMs: 29469,
  limits: { maxSpeed: 30.9, segMaxSpeed: 35.6 },
};
