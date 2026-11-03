// The touch steering stick's maths, kept free of the DOM and three.js so it can be tested in node.
// A floating stick: the point where the thumb lands is neutral, and dragging left or right from there steers in
// proportion, full lock at `travel` px, with a `dead` zone round the landing point so a resting thumb goes straight.
// Left is positive, the car's own sign (keys.left adds one to the steer target).
export const STICK = { travel: 40, dead: 5 };

/** Steer value for a thumb `dx` px from where it landed (negative dx is to the left): -1 (full right) to 1 (full left). */
export function stickValue(dx, { travel, dead } = STICK) {
  const a = Math.abs(dx);
  if (a <= dead) return 0;
  return -Math.sign(dx) * Math.min(1, (a - dead) / (travel - dead));
}

/** The knob's offset from the pad's centre for a steer value, so it moves the way the thumb went (left is negative px). */
export const knobOffset = (value, maxPx) => (0 - value) * maxPx; // 0 - value, so a straight stick gives 0 and not -0

/** The car's steer target from the input state: the stick's number while it is held, otherwise the left and right keys. */
export function steerInput(keys) {
  if (typeof keys.steer === "number") return Math.max(-1, Math.min(1, keys.steer));
  return (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
}
