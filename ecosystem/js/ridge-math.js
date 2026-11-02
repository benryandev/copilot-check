// Chart Ridge: the last 24 hourly closes as a height along a road, kept free of three.js so node can test it.
// Each candle is a plateau; neighbours join with a smoothstep ramp whose length grows with the step so the average
// slope never exceeds maxSlope (the smoothstep peaks at 1.5× that). If the steepest hour would still be too steep
// within one candle's length, the whole chart scales down: a wild day reads as a lower ridge, not a broken one.
// Run-ins at each end bring the road to plaza level, so the arches stand on flat ground.
export const RIDGE = { height: 8, run: 20, maxSlope: 0.45, candles: 24 };

const sm = (t) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };

/** 24 heights in metres (0..height) from the closes: the last 24, padded at the front with the first; all zero when
 * there are fewer than two usable closes or the day is flat. */
export function ridgeLevels(closes, height = RIDGE.height) {
  const n = RIDGE.candles;
  const vals = (Array.isArray(closes) ? closes : []).map(Number).filter(Number.isFinite).slice(-n);
  if (vals.length < 2) return Array(n).fill(0);
  while (vals.length < n) vals.unshift(vals[0]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo <= 0) return Array(n).fill(0);
  return vals.map((v) => ((v - lo) / (hi - lo)) * height);
}

/** The profile along a road of length `len`: h(s) in metres, the scaled levels, the candle length and the scale. */
export function ridgeProfile(closes, len, opts = RIDGE) {
  const { run, maxSlope, candles, height } = { ...RIDGE, ...opts };
  const seg = (len - 2 * run) / candles;
  const raw = ridgeLevels(closes, height);
  let maxStep = 0;
  for (let i = 1; i < raw.length; i++) maxStep = Math.max(maxStep, Math.abs(raw[i] - raw[i - 1]));
  const endMax = Math.max(raw[0], raw[raw.length - 1]);
  const scale = Math.min(1, maxStep > 0 ? (maxSlope * seg) / maxStep : 1, endMax > 0 ? (maxSlope * run) / endMax : 1);
  const levels = raw.map((v) => v * scale);
  const half = (i) => (i < 0 || i >= candles - 1 ? 0 : Math.min(seg, Math.max(2, Math.abs(levels[i + 1] - levels[i]) / maxSlope)) / 2); // half the ramp between candle i and i + 1
  const h = (s) => {
    if (!(s > 0) || !(s < len)) return 0;
    if (s < run) return sm(s / run) * levels[0];
    if (s > len - run) return sm((len - s) / run) * levels[candles - 1];
    const u = (s - run) / seg, i = Math.min(candles - 1, Math.max(0, Math.floor(u)));
    const d0 = (u - i) * seg, d1 = seg - d0;
    const hb = half(i - 1), ha = half(i);
    if (i > 0 && d0 < hb) return levels[i - 1] + (levels[i] - levels[i - 1]) * sm((hb + d0) / (2 * hb));
    if (i < candles - 1 && d1 < ha) return levels[i] + (levels[i + 1] - levels[i]) * sm((ha - d1) / (2 * ha));
    return levels[i];
  };
  return { h, levels, seg, scale };
}

/** Which candle (0..23) a distance along the road falls in; −1 on the run-ins and outside. */
export function candleIndex(s, len, opts = RIDGE) {
  const { run, candles } = { ...RIDGE, ...opts };
  if (s <= run || s >= len - run) return -1;
  return Math.min(candles - 1, Math.max(0, Math.floor((s - run) / ((len - 2 * run) / candles))));
}

/** Up, down or flat, for the candle's tint. */
export const candleDir = (prev, close) => (close > prev ? 1 : close < prev ? -1 : 0);
