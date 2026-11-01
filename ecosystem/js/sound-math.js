// The sound module's pure parts (no AudioContext), so they can be unit-tested: how the engine follows the car, how
// the surface noise follows the ground, and the ambient bed's chord walk.

const TOP_SPEED = 24; // m/s, the car's

/** Four virtual gears: the pitch climbs through each band and drops at the shift, so a run to top speed is not
 * one long rising drone. Bands in m/s. */
export const GEARS = [[0, 7], [7, 13], [13, 19], [19, TOP_SPEED]];
export function gearOf(speed) {
  const v = Math.min(TOP_SPEED, Math.abs(speed));
  const i = Math.max(0, GEARS.findIndex(([lo, hi]) => v < hi || hi === TOP_SPEED));
  const [lo, hi] = GEARS[i];
  // Each gear is entered a little way up its range, as a real shift lands
  return { gear: i + 1, rpm: Math.min(1, 0.18 + 0.82 * ((v - lo) / (hi - lo))) };
}

/** Engine settings for a speed (m/s, sign ignored) and throttle (-1 to 1): gear, rpm (0..1), the block's
 * frequency in Hz, the low-pass cutoff, the block gain, and the gain of the on-throttle exhaust layer. */
export function engineParams(speed, throttle) {
  const load = Math.max(0, Math.abs(throttle));
  const still = Math.abs(speed) < 0.3;
  const { gear, rpm: r } = still ? { gear: 1, rpm: 0 } : gearOf(speed);
  const rpm = still ? 0 : r;
  return {
    gear, rpm,
    freq: 58 + rpm * 125,
    filter: 300 + rpm * 420 + load * 1000,
    gain: 0.035 + rpm * 0.03 + load * 0.035,
    exhaust: load * (0.05 + rpm * 0.08),
  };
}

const SURFACE = { dirt: 0.022, grass: 0.06, cobble: 0.05, air: 0 };
/** Level of the rolling noise for a surface and speed (m/s). */
export function surfaceGain(surface, speed) {
  const base = SURFACE[surface] ?? SURFACE.dirt;
  return base * Math.min(1, Math.abs(speed) / TOP_SPEED);
}

/** The bed's chords, low voicings in Hz (C3 E3 G3 B3 and friends). */
export const CHORDS = [
  [130.81, 164.81, 196.0, 246.94], // Cmaj7
  [110.0, 130.81, 164.81, 246.94], // Am9 (no 5th)
  [87.31, 130.81, 174.61, 220.0], // Fmaj7
  [98.0, 123.47, 146.83, 196.0], // G6
];
export const CHORD_SEC = 12;
/** Which chord sounds at bed time `t` (s), with the filter cutoff for day or night. */
export function chordAt(t, night = false) {
  const index = Math.floor(t / CHORD_SEC) % CHORDS.length;
  return { index, notes: CHORDS[index], filter: night ? 360 : 520 };
}
