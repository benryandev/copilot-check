// Pure parts of live racing (unit-tested): the grid, the HUD position line, the countdown text, the server clock.

/** Grid slot k (1-based): two staggered columns 3 m apart, from 14 m behind the start line; odd slots on the left. */
export const gridSlot = (k) => ({ back: 14 + Math.floor((k - 1) / 2) * 3, v: k % 2 ? -1.6 : 1.6 });

/** The HUD line for `me` from the server's order (`[{id, cp, at, fin, pos}]`), or null if not racing. The gap is
 * shown only against a car at the same mark (both finished, or both at the same checkpoint), where it is honest. */
export function positionLine(order, me) {
  const i = order.findIndex((o) => o.id === me);
  if (i < 0) return null;
  const o = order[i], n = order.length;
  if (order.some((q, j) => j !== i && q.pos === o.pos)) return `Dead heat · P${o.pos} of ${n}`;
  const ahead = i > 0 ? order[i - 1] : null;
  const comparable = ahead && ahead.fin === o.fin && ahead.cp === o.cp && ahead.at != null && o.at != null && o.at >= ahead.at;
  return comparable ? `P${o.pos} of ${n} · +${(Math.round((o.at - ahead.at) / 100) / 10).toFixed(1)} s` : `P${o.pos} of ${n}`;
}

/** What the countdown shows at server time `now` for a race starting at `startsAt`. */
export function countdownText(startsAt, now) {
  const d = startsAt - now;
  if (d > 3000) return null;
  if (d > 2000) return '3';
  if (d > 1000) return '2';
  if (d > 0) return '1';
  return d > -1000 ? 'Go' : null;
}

/** Server-minus-local clock offset from ping samples, the median of (serverNow - (sentAt + rtt/2)). */
export function clockOffset(samples) {
  if (!samples.length) return 0;
  const est = samples.map((s) => s.serverNow - (s.sentAt + (s.receivedAt - s.sentAt) / 2)).sort((a, b) => a - b);
  return est[Math.floor(est.length / 2)];
}
