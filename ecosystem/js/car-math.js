// The car's surface rule, kept free of three.js so it can be tested in node.
// Grass only slows the car at the Raceway (cutting corners must not pay); out in the world it is a free,
// full-speed shortcut between stops (Ben, 2 Nov 2026). `w` is terrain.js racewayWeight: 1 on or inside the
// raceway, fading to 0 across a band outside it so the change in top speed is a slope, not a step.
export const OFF_ROAD = 0.8; // top speed share on raceway grass
export const topShare = (dirt, w) => (dirt ? 1 : 1 - (1 - OFF_ROAD) * Math.max(0, Math.min(1, w)));
