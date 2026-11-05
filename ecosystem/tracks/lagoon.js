// The Lagoon (venue track, design 7.10) as a track definition (see track-math.js for the shape).
// Plain data: a venue track needs no frame (entries.js venueEntry places it on the venue origin).
// Every `s` below was computed once with resolveTrack on these points (lap 779.6 m) and is written as a number;
// the comment names the point it came from. Change the track and give it a new id.
export default {
  id: "lagoon-v1",
  name: "The Lagoon",
  sponsor: null,
  half: 6,
  points: [
    [-120, -60], [-60, -60], [0, -60], [60, -60], [105, -55], [135, -35], [145, -5], [145, 25], [140, 50], [115, 68],
    [80, 68], [50, 58], [25, 42], [0, 60], [-25, 42], [-50, 60], [-85, 62], [-120, 50], [-145, 20], [-150, -20], [-140, -48],
  ],
  start: [-40, -60],
  // 11 gates in lap order. The third sits 10 m past the inlet's far bank (water s 243.9 + halfW 9.5 + 10 = 263.4),
  // so its shift is 19.5 rather than the sketch's 14 (drawn for a 15 m inlet; the inlet is 19 m wide, plan 2).
  gates: [
    { at: [105, -55] }, { at: [135, -35] }, { at: [145, 25], shift: 19.5 }, { at: [115, 68] }, { at: [25, 42] },
    { at: [-25, 42] }, { at: [-85, 62] }, { at: [-130, 40] }, { at: [-145, 20] }, { at: [-150, -20] }, { at: [-140, -48] },
  ],
  // Low end at water s − 18 (halfW 9.5 + RAMP.length 8 + LIP_SETBACK 0.5, jump-math.js): the lip sits on the near bank
  ramps: [{ s: 225.9, side: 0, length: 8, height: 1.9, width: 5.4 }],
  water: [{ s: 243.9, halfW: 9.5 }], // s of [145, 25]
  walls: [{ from: 367.8, to: 493.7, sides: [-1, 1] }], // [50, 58] to [-50, 60]: the esses
  surface: [{ from: 739.6, to: 243.9, kind: "tarmac" }], // [-80, -60] across the line to the water (284 m, 36%)
  lifts: [],
  // s is the stand's centre, off its signed offset from the centreline (+ is the track's right: the outside in the venue's frame)
  stands: [
    { s: 258, off: 16, len: 40 }, // outside the water jump, facing the landing (water s 243.9 + 14)
    { s: 0, off: 16, len: 90 }, // along the start straight, centred on the line ([-40, -60])
  ],
  floorMs: null,
  limits: null,
};
