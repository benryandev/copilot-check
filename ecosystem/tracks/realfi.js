// The RealFi Raceway as a track definition (see track-math.js for the shape).
// Plain data: no three.js, no DOM. content.js passes the frame in because this module must not import it.
// Numbers measured 30 Oct 2026 (642.2 m a lap; 21.4 s is the fastest lap the leaderboard worker accepts);
// they now come from this module, resolved by resolveTrack. Change the track and give it a new id.
export default function realfi({ origin, angle }) {
  return {
    id: "realfi-v1",
    name: "RealFi Raceway",
    sponsor: { name: "RealFi", logo: "realfi", colour: 0x0fb89c }, // the gantry, gates and board wear RealFi's colours and logo (raceway.js)
    half: 6,
    frame: { origin, angle },
    points: [
      [-62, -36], [-20, -36], [20, -36], [60, -36], [100, -35], [127, -29], [141, -12], [140, 8], [125, 21],
      [100, 26], [76, 25], [56, 33], [38, 40], [20, 35], [4, 26], [-14, 29], [-30, 38], [-55, 38], [-85, 33],
      [-112, 23], [-134, 8], [-142, -12], [-131, -29], [-106, -36],
    ],
    gates: [{ s: 211 }, { s: 300 }, { s: 420 }, { s: 500 }, { s: 550 }],
    // On the start straight, the short straight after the first hairpin, and the sweep
    ramps: [
      { s: 70, side: -1, length: 8, height: 1.9, width: 5.4 },
      { s: 262, side: 1, length: 8, height: 1.9, width: 5.4 },
      { s: 445, side: 1, length: 8, height: 1.9, width: 5.4 },
    ],
    walls: "auto",
    lifts: [{ from: 330, to: 425, height: 2.2 }],
    water: [],
    surface: [],
    stands: [],
    floorMs: 22914,
    limits: { maxSpeed: 29, segMaxSpeed: 36 },
  };
}
