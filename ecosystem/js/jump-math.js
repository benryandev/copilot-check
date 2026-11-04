// The water jump's flight, as the car step flies it (car.js): the car leaves the ramp's lip with the face's slope as its
// climb (terrain.js builds the face as height × (u / length) ^ 1.35, so the lip's slope is 1.35 × height / length), the
// horizontal speed holds in the air (no throttle, no drag), and GRAVITY pulls it down. Pure: imported by its test for now
// and by the track that places an inlet (plan 5 of the venues design).
import { GRAVITY } from "./car-math.js";

export const RAMP = { length: 8, height: 1.9, width: 5.4 }; // the Raceway's ramp, the Lagoon's too
export const RAMP_POW = 1.35; // the face's profile, as terrain.js jumpHeight builds it
export const LAND_MARGIN = 0.8; // m past the far bank a dry landing needs: onWater's 0.3 m edge plus 0.5 m of real slack
// (the step's takeoff slope is about 1% under the lip's, and a frame at 27 m/s is 0.45 m)

/** The climb at takeoff, m/s: the lip's slope times the speed. */
export const takeoffVy = (speed, ramp = RAMP) => speed * RAMP_POW * ramp.height / ramp.length;

/** m from the lip to where the car is back at bank height (the lip stands ramp.height above it). */
export function flightRange(speed, ramp = RAMP, g = GRAVITY) {
  const vy = takeoffVy(speed, ramp);
  return speed * (vy + Math.sqrt(vy * vy + 2 * g * ramp.height)) / g;
}

// The ramp's lip stands this far before the inlet's near bank: the step checks for water before it resolves a takeoff, so
// with the lip on the bank the frame that carries the car past it can end inside onWater's edge and splash as it leaves.
export const LIP_SETBACK = 0.5;
// The ramp for an inlet at water s with half width halfW goes at s - halfW - ramp.length - LIP_SETBACK.

/** m from the lip to the far bank of an inlet of half width halfW (onWater's dry edge is 0.3 m before it). */
export const inletGap = (halfW) => 2 * halfW + LIP_SETBACK;

/** The half width whose gap a car at share × top clears with the margin, to the nearest 0.5 m. */
export const inletHalfFor = (top, share = 0.9, ramp = RAMP) => Math.round((flightRange(share * top, ramp) - LAND_MARGIN - LIP_SETBACK) / 2 * 2) / 2;
