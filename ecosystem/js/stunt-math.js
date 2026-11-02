// The epic jump's side-on camera, kept free of three.js so it can be tested in node.
// While the car is in the air off a stunt ramp the camera eases to a fixed point down the river at bank height and
// watches the car cross; after landing the chase camera eases back.
export const STUNT_IN = 0.25; // s to blend in after take-off
export const STUNT_OUT = 0.6; // s to blend back after landing
export const STUNT_BACK = 22; // m down the river from the jump line
export const STUNT_UP = 4; // m above the water
/** True on the one frame the car leaves the ground off a stunt ramp (`jump` is the ramp under its last ground position). */
export const stuntTakeoff = (wasAir, air, jump) => !wasAir && air && !!jump?.stunt;
/** Blend 0..1: rises while airborne, falls once landed. */
export const stuntBlend = (k, dt, airborne) => (airborne ? Math.min(1, k + dt / STUNT_IN) : Math.max(0, k - dt / STUNT_OUT));
/** Where the camera stands: `at` is the river point under the jump line, `tan` the river's unit tangent there. */
export const stuntCamera = (at, tan, waterLevel) => ({ x: at.x + tan.tx * STUNT_BACK, y: waterLevel + STUNT_UP, z: at.z + tan.tz * STUNT_BACK });
