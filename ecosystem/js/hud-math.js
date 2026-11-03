// The HUD's footer while driving, kept free of the DOM so it can be tested in node.
// The footer pill (the disclosure, the credit, the Every stop link) fades out once the car has been moving for a
// quarter of a second and comes back once it has been still for a second and a half, with hysteresis on both sides so
// a tap of the throttle or a slow roll never flickers it. The frame loop keeps the state and sets body.is-driving.
export const FOOT = { hideSpeed: 2, hideAfter: 0.25, showSpeed: 0.5, showAfter: 1.5 };

/** The next state from the previous one, the car's speed (m/s, either sign) and the frame's dt (s). */
export function footStep(state, speed, dt, f = FOOT) {
  const v = Math.abs(speed);
  if (!state.driving) {
    const t = v > f.hideSpeed ? state.t + dt : 0;
    return t >= f.hideAfter ? { driving: true, t: 0 } : { driving: false, t };
  }
  const t = v < f.showSpeed ? state.t + dt : 0;
  return t >= f.showAfter ? { driving: false, t: 0 } : { driving: true, t };
}
