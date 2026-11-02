// The Strike blimp's loop and banner, kept free of three.js so it can be tested in node.
// It cruises a slow circle round HQ among the lowest clouds. Its place on the loop comes from the clock, so everyone in
// the world sees it in the same part of the sky, and a shot can pin it to an angle.
export const BLIMP = { cx: 0, cz: 0, radius: 140, height: 24, period: 220 }; // under the cloud base (26 m), so it is never lost in a cloud; about 4 m/s
export function blimpPose(nowMs, fixedAngle = null) {
  const angle = fixedAngle ?? ((nowMs / 1000 / BLIMP.period) * Math.PI * 2) % (Math.PI * 2);
  const x = BLIMP.cx + Math.sin(angle) * BLIMP.radius, z = BLIMP.cz - Math.cos(angle) * BLIMP.radius;
  const heading = Math.atan2(-Math.cos(angle), -Math.sin(angle)); // nose along the loop: forward is (-sin h, -cos h), like the car
  return { x, y: BLIMP.height, z, heading, angle };
}

/** Where the blimp's soft shadow sits on the ground: down-sun of it by its height over the sun's slope. The world's sun
 * stands at (+30, +55, +20) from the car (main.js placeCamera), so shadows fall towards −x, −z. */
export const SUN = { x: 30, y: 55, z: 20 };
export const shadowSpot = (pose, sun = SUN) => ({ x: pose.x - (pose.y * sun.x) / sun.y, z: pose.z - (pose.y * sun.z) / sun.y, heading: pose.heading });
