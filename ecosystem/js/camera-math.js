// The chase camera's framing, kept free of three.js so it can be tested in node (qa/camera-unit.mjs).
// On the grid in portrait the start gantry (18.2 m wide, 14 m ahead of the car) is wider than the view, so the camera stands
// further back and looks a little higher until the car pulls away. Everywhere else the framing is the long-standing one.
export const GRID_BACK = 21, GRID_LIFT = 1.6;

/** How far behind the car the camera stands (back), and where it looks (ahead and lift, m in front of and above the car). */
export function chaseFrame({ aspect, speed, grid }) {
  const portrait = aspect < 1;
  const frame = { back: 11 + Math.max(0, speed) * 0.12, ahead: portrait ? 1 : 4, lift: portrait ? 0.6 : 2.2 };
  if (grid && portrait) { frame.back = GRID_BACK; frame.lift = GRID_LIFT; }
  return frame;
}

/** True when the car (x, z) is 0 to `max` m before the line { x, z, fx, fz } along its direction and within `half` m of its centre (the track's half width plus 2 m, 8 on both tracks). */
export function behindLine(car, line, max = 24, half = 8) {
  const dx = line.x - car.x, dz = line.z - car.z;
  const ahead = dx * line.fx + dz * line.fz, side = dx * -line.fz + dz * line.fx;
  return ahead >= 0 && ahead <= max && Math.abs(side) <= half;
}
