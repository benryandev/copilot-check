// The arithmetic of the multiplayer client, kept free of three.js and the DOM so it can be tested in Node.

export const SEND_MS = 100; // pose interval while moving (10 Hz)
export const IDLE_MS = 1000; // heartbeat while stopped
export const DELAY_MS = 150; // render other cars this far behind their latest pose, so 10 Hz looks smooth
export const QUIET_MS = 3000; // no pose for this long: the car fades and sits still
export const GONE_MS = 15000; // no pose for this long: the car goes
export const DRAW_CAP = { high: 24, medium: 24, low: 8 }; // nearest cars drawn, by quality tier
export const DRAW_RANGE = 250; // m from the camera, like the district culling
const MOVING = 0.05; // m/s

/** How long after the last pose the next one is due. */
export const nextSendDelay = (speed) => (Math.abs(speed) >= MOVING ? SEND_MS : IDLE_MS);

/** Blend two poses; the heading takes the short way round. */
export function interp(a, b, t) {
  let dh = b.h - a.h;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  else if (dh < -Math.PI) dh += 2 * Math.PI;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h + dh * t };
}

/** The pose at time `t` from samples sorted by `at`: held before the first and after the last, blended between. */
export function poseAt(samples, t) {
  if (!samples.length) return null;
  const pick = ({ x, z, h }) => ({ x, z, h });
  if (t <= samples[0].at) return pick(samples[0]);
  const last = samples[samples.length - 1];
  if (t >= last.at) return pick(last);
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    if (t >= a.at && t < b.at) return interp(a, b, (t - a.at) / (b.at - a.at));
  }
  return pick(last);
}

/** The `cap` peers nearest the camera (each needs x, z), nearest first, ties in input order. */
export function pickDrawn(peers, cam, cap) {
  return peers
    .map((p, i) => ({ p, i, d: Math.hypot(p.x - cam.x, p.z - cam.z) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, cap)
    .map((e) => e.p);
}

/** Reconnect delay for the n-th attempt: 1 s doubling, capped at 30 s. */
export const backoff = (n) => Math.min(30000, 1000 * 2 ** Math.max(0, n));
