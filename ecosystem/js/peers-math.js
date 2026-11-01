// The arithmetic of the multiplayer client, kept free of three.js and the DOM so it can be tested in Node.

export const SEND_MS = 100; // pose interval while moving (10 Hz)
export const IDLE_MS = 1000; // heartbeat while stopped
export const DELAY_MS = 150; // render other cars this far behind their latest pose, so 10 Hz looks smooth
export const QUIET_MS = 3000; // no pose for this long: the car fades and sits still
export const GONE_MS = 15000; // no pose for this long: the car is put away (the player stays listed until the room says they left)
export const PARK_MS = 10000; // a car out of the drawn set this long is disposed; it's rebuilt when needed
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
export const EXTRAP_MS = 250; // past the latest sample a car carries on along its last velocity this long, then holds
const EXTRAP_GAP_MAX = 500; // only from two samples this close in time (not a heartbeat after a stop)
export function poseAt(samples, t) {
  if (!samples.length) return null;
  const pick = ({ x, z, h }) => ({ x, z, h });
  if (t <= samples[0].at) return pick(samples[0]);
  const last = samples[samples.length - 1];
  if (t >= last.at) {
    // Dead reckoning: a late sample (slow sender, lossy link) stalls the car otherwise, and the jump when it lands reads as lag
    const prev = samples.length > 1 ? samples[samples.length - 2] : null;
    const gap = prev ? last.at - prev.at : 0;
    if (!prev || gap <= 0 || gap > EXTRAP_GAP_MAX) return pick(last);
    const ahead = Math.min(EXTRAP_MS, t - last.at) / gap;
    return { x: last.x + (last.x - prev.x) * ahead, z: last.z + (last.z - prev.z) * ahead, h: last.h };
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    if (t >= a.at && t < b.at) return interp(a, b, (t - a.at) / (b.at - a.at));
  }
  return pick(last);
}

/** How far behind the latest sample to draw a car: 1.3 × the median gap between its recent samples, so a sender
 * at 10 Hz is drawn 150 ms behind and a sparse one further back where there is always a pose to blend to. */
export function renderDelay(samples, base = DELAY_MS, cap = 600) {
  if (samples.length < 3) return base;
  const gaps = [];
  for (let i = 1; i < samples.length; i++) gaps.push(samples[i].at - samples[i - 1].at);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.max(base, Math.min(cap, Math.round(median * 1.3)));
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

export const FLY_G = 30; // m/s², the car's gravity
/** Vertical motion for a car whose ground height is known each frame but not its height (other visitors, the
 * ghost): it rides the ground, and when the ground drops away faster than it can fall (a ramp's end) it flies on
 * under gravity until it meets the ground again. `st` is { y, vy, air }, updated in place; returns the y to draw. */
export function flyY(st, g, dt) {
  if (!(dt > 0)) { st.y = g; return g; }
  if (st.air) {
    st.vy -= FLY_G * dt;
    st.y += st.vy * dt;
    if (st.y <= g) { st.y = g; st.vy = 0; st.air = false; }
    return st.y;
  }
  const vyGround = (g - st.y) / dt;
  if (st.y - g > FLY_G * dt * dt * 2 && st.vy > 2) { st.air = true; st.y += st.vy * dt; } // the same rule as the car
  else { st.y = g; st.vy = vyGround; }
  return st.y;
}

/** Opacity of another car: quiet (no pose for a while) 0.4, a racer on the track 0.7, otherwise solid. */
export const opacityFor = (quiet, racer) => (quiet ? 0.4 : racer ? 0.7 : 1);
/** Keep the last `max` ping samples, newest last. */
export const pingSample = (samples, s, max = 5) => [...samples, s].slice(-max);
