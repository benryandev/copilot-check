// Quality tiers and the auto rule that steps down through them (no DOM, no three.js). Unit tests: qa/quality-unit.mjs.

// ratio: the pixel ratio cap; shadow: the sun's shadow map size, 0 for none; grass: blade clumps; ground: ground mesh
// segments at the original world radius; dust: particles; bloom: the glow pass (post.js) or false; planters: plaza props.
export const TIERS = {
  high: { ratio: 2, shadow: 2048, grass: 14000, ground: 200, dust: 420, bloom: { strength: 0.28, radius: 0.22 }, planters: true },
  medium: { ratio: 1.5, shadow: 1024, grass: 7000, ground: 150, dust: 280, bloom: { strength: 0.25, radius: 0.2 }, planters: true },
  // Phone: medium's resolution (text stays crisp on a 3× screen) without the glow pass and the shadow map, which between
  // them took two thirds of the GPU's frame and a quarter of the draw calls (measured 4 Nov 2026); a touch screen starts here
  phone: { ratio: 1.5, shadow: 0, grass: 7000, ground: 150, dust: 280, bloom: false, planters: true },
  low: { ratio: 1, shadow: 0, grass: 2500, ground: 110, dust: 140, bloom: false, planters: false },
};
export const ORDER = ["high", "medium", "phone", "low"]; // the auto rule steps down this list

/** The tier to start on: the saved choice when it names a tier, else phone on a touch screen and high elsewhere. */
export const startTier = (pref, coarse) => (TIERS[pref] ? pref : coarse ? "phone" : "high");

// Auto quality. A frame past SLOW_MS has missed at least one refresh on a 60 Hz screen (three on 120 Hz); when a quarter
// of a window's frames are slow the tier drops one step, at most once every DROP_GAP_S seconds. The old rule (the average
// over 1/38 s) needed most frames doubled before it moved, so a phone flipping between 60 and 30 fps felt laggy and never
// dropped. No climbing back: a tier change rebuilds the grass and recompiles every shader, a hitch worth paying once.
export const SLOW_MS = 25, WINDOW = 120, SLOW_SHARE = 0.25, DROP_GAP_S = 4;

/** The tier to drop to after a window in which `share` of the frames were slow, or null to hold. */
export function nextTier(share, tierName, t, lastDrop) {
  const i = ORDER.indexOf(tierName);
  if (share < SLOW_SHARE || i < 0 || i >= ORDER.length - 1 || t - lastDrop <= DROP_GAP_S) return null;
  return ORDER[i + 1];
}
