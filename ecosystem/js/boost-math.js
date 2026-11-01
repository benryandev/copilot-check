// The jump boost (1 Nov 2026, Ben's call): a clean landing on the track after real air pushes the car past its top
// speed for a moment, so the ramp lane is a choice worth making. Pure, so it can be unit-tested.
export const BOOST_MULT = 1.2; // top speed while boosting
export const BOOST_CAP = 28; // m/s, under the leaderboard worker's 30 m/s lap ceiling with margin
export const BOOST_MIN_AIR = 0.35; // s in the air before a landing counts as a jump

/** Seconds of boost earned by a landing: none for a hop, an off-track landing or a jump that clipped something. */
export function boostFor(airTime, onDirt, hitInAir) {
  if (!onDirt || hitInAir || airTime < BOOST_MIN_AIR) return 0;
  return Math.min(1.6, 0.4 + airTime * 1.5);
}
export const boostedTop = (top) => Math.min(BOOST_CAP, top * BOOST_MULT);
