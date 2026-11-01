// Pure helpers for posting laps (no DOM): which lap to offer, the device's best, the wait after a 429.
// Tested in qa/race-unit.mjs.

// The device's best is offered on a slower lap's sheet when it has not been posted yet (a 429 or a missed
// tap left a 24.892 off the board, 1 Nov 2026). Old records saved without splits can't be posted.
export const offerBest = (best, lapMs) =>
  best && Array.isArray(best.splits) && !best.posted && best.ms < lapMs ? best : null;

// Keep ms, splits and the trace of the best lap, so it can be posted later with its ghost
export function recordBest(best, { ms, splits, trace }) {
  if (best && best.ms <= ms) return best;
  return { ms, splits, trace: trace || null, posted: false };
}

export const markPosted = (best, ms) => (best && best.ms === ms ? { ...best, posted: true } : best);

// The worker's wait plus half a second, between 1 and 30 s; 10 s when it says nothing
export function retryAfterMs(body, header) {
  const s = Number(body?.retryAfter) || Number(header) || 10;
  return Math.min(30, Math.max(1, s)) * 1000 + 500;
}

/** One set of fireworks per record, however many ways the news arrives (the setter's own post, then the room's
 * echo of it). `seen` is the last celebration {key, at}; returns {fire, seen}. */
export function celebrateOnce(seen, { name, ms }, now, windowMs = 20_000) {
  const key = `${name}|${ms}`;
  if (seen && seen.key === key && now - seen.at < windowMs) return { fire: false, seen };
  return { fire: true, seen: { key, at: now } };
}
