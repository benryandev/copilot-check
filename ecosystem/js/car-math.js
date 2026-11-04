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
export const MAX_CLIMB = 0.9; // steepest slope (rise per unit) the car can drive up
export const CLIMB_PROBE = 0.5; // metres ahead the ground is read for the climb rule (at least; a fast frame's step when longer)
/** Too steep to drive up: over the probe distance ahead the ground rises steeper than MAX_CLIMB, by more than a bump
 * (0.25 m). Reading a fixed distance ahead rather than this frame's step makes a wall a wall at any speed: judged per
 * frame step, a slow car crept up any face a few centimetres at a time. */
export const blocksClimb = (rise, dist) => dist > 1e-4 && rise / dist > MAX_CLIMB && rise > 0.25;

// Surfaces (track-engine plan 2): the numbers that differ between the dirt Raceway and a tarmac circuit.
// Dirt is the Raceway's own numbers, untouched. Tarmac is the spec's starting point and is tuned by overrides.
export const SURFACES = {
  dirt: { top: 24, pull: 16, turn: 2.2 }, // m/s, m/s², rad/s: today's Raceway
  tarmac: { top: 30, pull: 20, turn: 2.2, turnHigh: 1.0, vLow: 20, vHigh: 30 }, // turn eases from turn at vLow to turnHigh at vHigh (m/s)
};
export const GRAZE = { min: 0.8, headOn: 0.35, nudge: 0.2 }; // speed share kept at a graze and head-on; nudge in radians at a graze
export const EASE_NET = 1; // m/s², the net bleed above top with the throttle held (pull + this = the ease-down rate)
export const BRAKE_WATER = 68; // m/s², water's drag on a too-fast car: today's 34 × WATER_DRAG
/** Deep merge of overrides over the defaults, one level per surface; always a fresh object. */
export function resolvePhysics(overrides = {}) {
  return {
    dirt: { ...SURFACES.dirt, ...overrides.dirt },
    tarmac: { ...SURFACES.tarmac, ...overrides.tarmac },
    graze: { ...GRAZE, ...overrides.graze },
    resolved: true,
  };
}
export const DEFAULT_PHYSICS = resolvePhysics();
/** Steering rate (rad/s): flat on dirt; on tarmac flat to vLow, linear to turnHigh at vHigh, held beyond. */
export function turnRate(surface, speed, P = DEFAULT_PHYSICS) {
  if (surface !== 'tarmac') return P.dirt.turn;
  const t = P.tarmac;
  if (speed <= t.vLow) return t.turn;
  if (speed >= t.vHigh) return t.turnHigh;
  return t.turn + (t.turnHigh - t.turn) * (speed - t.vLow) / (t.vHigh - t.vLow);
}
/** Deceleration above top speed: pull + 1 on land (never creeps past top), water drags hard. Dirt: 17, as before. */
export const easeRate = (pull, wet) => (wet ? BRAKE_WATER : pull + EASE_NET);
/** Speed kept on the hit frame for wall-normal share k (sin of the angle): 0.8 at a graze, 0.35 head-on; 0.77 at 15°. */
export const hitSpeedShare = (k, G = GRAZE) => G.min - (G.min - G.headOn) * k * k;
/** Speed kept per frame while rubbing along a wall afterwards: 0.35 head-on, 0.99 at 10°. */
export const slideShare = (k, G = GRAZE) => 1 - (1 - G.headOn) * k * k;
/** Radians the car is turned away from the wall at a graze: 0.2 at a graze, 0 head-on. */
export const grazeNudge = (k, G = GRAZE) => G.nudge * (1 - k);
