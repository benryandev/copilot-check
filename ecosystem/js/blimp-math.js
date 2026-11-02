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
/** The banner's line: the same 24 h volume the district boards show (data.js `values`), or a holding word. Never a price. */
export const blimpText = (values) => `24H VOLUME  ${values?.volume24h ?? "LOADING"}`;
