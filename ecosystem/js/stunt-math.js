// The epic jump's side-on camera, kept free of three.js so it can be tested in node.
// While the car is in the air off a stunt ramp the camera eases to a fixed point down the river at bank height and
// watches the car cross; after landing the chase camera eases back. A venue's lone water jump is watched from the
// grandstand's side of the track instead (plan 5 Task 2).
export const STUNT_IN = 0.25; // s to blend in after take-off
export const STUNT_OUT = 0.6; // s to blend back after landing
export const STUNT_BACK = 22; // m down the river from the jump line
export const STUNT_UP = 4; // m above the water
/** True on the one frame the car leaves the ground off a stunt ramp (`jump` is the ramp under its last ground position),
 * heading up it within 30°: a sideways hop off the ramp's edge is not the stunt. */
export const STUNT_COS = Math.cos((30 * Math.PI) / 180);
export const stuntTakeoff = (wasAir, air, jump, fx, fz) => !wasAir && air && !!jump?.stunt && fx * jump.fx + fz * jump.fz >= STUNT_COS;
/** The blend eased (smoothstep), so the camera leaves and arrives gently. */
export const stuntEase = (k) => k * k * (3 - 2 * k);
/** Blend 0..1: rises while airborne, falls once landed. */
export const stuntBlend = (k, dt, airborne) => (airborne ? Math.min(1, k + dt / STUNT_IN) : Math.max(0, k - dt / STUNT_OUT));
/** Where the camera stands: `at` is the river point under the jump line, `tan` the river's unit tangent there.
 * With `{ side: "stand", fx, fz, rx, rz, back }` (a lone ramp over a track inlet, plan 5 Task 2) it stands low and trackside
 * instead: `back` m behind `at` along the flight (fx, fz), STAND_OFF m off the ramp lane toward
 * (rx, rz), the grandstand's side, and STAND_UP m above the water, looking along the flight toward the far bank. */
export const STAND_ALONG = 0.4; // of the bank (lip to far bank) past the lip
export const STAND_LOOK_TO = 1; // the point the stand camera leans toward: this fraction of the bank past the lip, on the lane
export const STAND_LOOK = 0.7; // how far from the car toward that point it looks, on a wide frame
export const STAND_WIDE = [0.9, 1.2]; // the aspect ratios between which that lean fades in: a portrait frame is too narrow to hold both
export const STAND_OFF = 15; // m off the ramp lane
export const STAND_UP = 2.5; // m above the water
export const stuntCamera = (at, tan, waterLevel, o) =>
  o?.side === "stand"
    ? { x: at.x - o.fx * o.back + o.rx * STAND_OFF, y: waterLevel + STAND_UP, z: at.z - o.fz * o.back + o.rz * STAND_OFF }
    : { x: at.x + tan.tx * STUNT_BACK, y: waterLevel + STUNT_UP, z: at.z + tan.tz * STUNT_BACK };
/** The camera's pose for a take-off from stunt ramp `j` (of `all`). The hub's river pair: the point down the river from the
 * middle of the two lips. A lone ramp with a far bank (terrain.js sets `bank` and `standSide` for a ramp over a track inlet):
 * the stand-side pose, a quarter of its own flight past the lip (lip to far bank), so the ramp the car has just left sits
 * behind the camera's shoulder rather than filling the foreground (the blind read, 6 Nov 2026: level with the lip, a flat
 * tan ramp side covered the lower left of every jump frame). `waterAt` is terrain.js waterInfo. */
export function stuntPose(j, all, waterAt, waterLevel) {
  const other = all.find((o) => o.stunt && o !== j);
  const lipA = { x: j.ox + j.fx * j.length, z: j.oz + j.fz * j.length };
  if (!other && j.bank > 0) {
    const h = j.bank / 2, mid = { x: lipA.x + j.fx * h, z: lipA.z + j.fz * h };
    return stuntCamera(mid, null, waterLevel, { side: "stand", fx: j.fx, fz: j.fz, rx: j.rx * j.standSide, rz: j.rz * j.standSide, back: h - j.bank * STAND_ALONG });
  }
  const lipB = other ? { x: other.ox + other.fx * other.length, z: other.oz + other.fz * other.length } : lipA;
  const mid = { x: (lipA.x + lipB.x) / 2, z: (lipA.z + lipB.z) / 2 }, ri = waterAt(mid.x, mid.z, 12);
  return stuntCamera(mid, ri.d < Infinity ? ri : { tx: j.rx, tz: j.rz }, waterLevel);
}
/** One frame of the cue, in place on `st` ({ k, on }): a landing (wet, dry or into a ramp's face: the car is not airborne in
 * any of them) ends it for good, and the blend eases out; a snap (teleport, grid, placeCar) sets it to { k: 0, on: false }. */
export function stuntStep(st, dt, airborne) {
  if (!airborne) st.on = false;
  st.k = stuntBlend(st.k, dt, st.on && airborne);
  return st;
}
/** Which side of the track (+1 its right, −1 its left) the stand camera takes for a ramp at track s: the side of the stand
 * nearest along the lap (its `off` sign), or `outside` when the track has none. */
export function standSide(s, stands, len, outside) {
  let best = null, bd = Infinity;
  for (const st of stands || []) { const d = Math.abs(st.s - s) % len, w = Math.min(d, len - d); if (w < bd) { bd = w; best = st; } }
  return best ? Math.sign(best.off) || outside : outside;
}
/** Where the stunt camera looks: the car (a little above its middle) for the hub's river ramps; for a lone ramp with a far bank,
 * up to `STAND_LOOK` of the way from the car toward the lane STAND_LOOK_TO banks past the lip, so the far side of the inlet
 * and the gate beyond it share the frame with the car. The lean fades in with the frame's aspect ratio (STAND_WIDE): a
 * portrait frame cannot hold the car and the gate, so it keeps the car (the gate falls wholly out of it, never half in). */
export function stuntLook(car, j, aspect = Infinity) {
  const own = { x: car.x, y: car.y + 0.8, z: car.z };
  if (!(j?.bank > 0)) return own;
  const t = Math.min(1, Math.max(0, (aspect - STAND_WIDE[0]) / (STAND_WIDE[1] - STAND_WIDE[0]))), w = STAND_LOOK * t * t * (3 - 2 * t);
  const d = j.length + j.bank * STAND_LOOK_TO, ax = j.ox + j.fx * d, az = j.oz + j.fz * d;
  return { x: own.x + (ax - own.x) * w, y: own.y, z: own.z + (az - own.z) * w };
}
