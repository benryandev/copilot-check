// The car's surface rule, kept free of three.js so it can be tested in node.
// Grass only slows the car at the Raceway (cutting corners must not pay); out in the world it is a free,
// full-speed shortcut between stops (Ben, 2 Nov 2026). `w` is terrain.js racewayWeight: 1 on or inside the
// raceway, fading to 0 across a band outside it so the change in top speed is a slope, not a step.
export const GRAVITY = 30; // m/s², the car's own (a little strong, so jumps feel snappy)
export const OFF_ROAD = 0.8; // top speed share on raceway grass
export const WATER_SHARE = 0.5; // top speed share wading through the river, whatever the ground under it
export const WATER_ACCEL = 0.6; // how much of the throttle's pull is left in the water
export const topShare = (dirt, w, wet = false) => (dirt ? 1 : 1 - (1 - OFF_ROAD) * Math.max(0, Math.min(1, w))) * (wet ? WATER_SHARE : 1);
export const accelShare = (wet) => (wet ? WATER_ACCEL : 1);
export const WATER_DRAG = 2; // multiple of the brake's deceleration that pulls a too-fast car down in water (0.5 on land)
export const slowShare = (wet) => (wet ? WATER_DRAG : 0.5);
export const MAX_CLIMB = 0.9; // steepest slope (rise per unit) the car can drive up
export const CLIMB_PROBE = 0.5; // metres ahead the ground is read for the climb rule (at least; a fast frame's step when longer)
/** Too steep to drive up: over the probe distance ahead the ground rises steeper than MAX_CLIMB, by more than a bump
 * (0.25 m). Reading a fixed distance ahead rather than this frame's step makes a wall a wall at any speed: judged per
 * frame step, a slow car crept up any face a few centimetres at a time. */
export const blocksClimb = (rise, dist) => dist > 1e-4 && rise / dist > MAX_CLIMB && rise > 0.25;
