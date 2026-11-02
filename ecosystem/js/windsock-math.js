// Funding windsocks: the row along the Perps spoke, kept free of three.js so node can test it. Nine fixed markets,
// each sock's fill and direction from Strike's funding rate per 8 h (the comparison endpoint's unit), the venue socks
// behind, the labels, and where every pole stands along the road.
export const WINDSOCKS = {
  markets: ["ZEC", "SUI", "HYPE", "DOGE", "ADA", "XRP", "SOL", "ETH", "BTC"], // south to north: BTC at the Perps gate
  venues: ["bybit", "binance", "hyperliquid"], // the row behind, bybit nearest the board
  full: 0.0005, // |rate| per 8 h at which a sock stands out straight (the base 0.0001 most markets sit at reads gentle)
  start: 71, spacing: 5.5, // metres along the spoke for the Strike socks (5.5 keeps the last sock at 115 m, clear of the bend at 118 and the arch at 124)
  offset: 1.5, // metres beyond the road's edge
  cexOffset: 5.5, cexSpacing: 1.6, // the venue socks: further out, in a short line along the road
  boardAt: 67, boardOffset: 2.2, // the explaining board before the first sock
  segments: 6, droop: 80, // cloth segments, and how far below horizontal a limp tip hangs (degrees)
  ease: 2, // seconds for a sock to settle on a new rate
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** Strike's comparison body → Map of bare symbol → { strike, bybit, binance, hyperliquid } (numbers per 8 h or null). */
export function normaliseFunding(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray(raw.data) || !raw.data.length) return null;
  const out = new Map();
  for (const row of raw.data) {
    if (!row || typeof row.symbol !== "string") continue;
    const sym = row.symbol.replace(/-USD$/, "");
    const rates = { strike: num(row.strike?.rate) };
    for (const v of WINDSOCKS.venues) rates[v] = num(row[v]?.rate);
    out.set(sym, rates);
  }
  return out.size ? out : null;
}

/** How a sock hangs for a rate: fill 0..1, the way it streams (+1 north, −1 south, 0 none), and its colour tone. */
export function sockState(rate) {
  if (rate == null) return { fill: 0, dir: 0, tone: "none" };
  return { fill: Math.min(1, Math.abs(rate) / WINDSOCKS.full), dir: rate < 0 ? -1 : 1, tone: rate < 0 ? "down" : "up" };
}

/** "+0.086%": the rate per 8 h as a percentage, sign always; a dash for nothing. */
export const fmtRate = (rate) => (rate == null ? "—" : `${rate < 0 ? "-" : "+"}${Math.abs(rate * 100).toFixed(3)}%`);
export const sockLabel = (symbol, rate) => `${symbol}  ${fmtRate(rate)}`;

/** Where the poles stand: distance along the spoke and lateral offset beyond the road's half-width (east positive). */
export function polePositions(len) {
  const { markets, venues, start, spacing, offset, cexOffset, cexSpacing, boardAt, boardOffset } = WINDSOCKS;
  const strike = markets.map((symbol, i) => ({ s: start + spacing * i, v: offset, i, symbol }));
  const cex = strike.flatMap(({ s, i, symbol }) => venues.map((venue, k) => ({ s: s + (k - 1) * cexSpacing, v: cexOffset, i, symbol, venue })));
  void len;
  return { strike, cex, board: { s: boardAt, v: boardOffset } };
}

/** Each cloth segment's angle below horizontal (radians) for a fill at time t: a limp sock droops to `droop` at the
 * tip, a full one lies flat, and every sock flutters a little, more when fuller. */
export function segmentAngles(fill, t, n = WINDSOCKS.segments) {
  const { droop } = WINDSOCKS;
  const out = [];
  for (let k = 0; k < n; k++) out.push((((1 - fill) * (k + 1)) / n * droop + (2 + 6 * fill) * Math.sin(t * 6 + k)) * (Math.PI / 180));
  return out;
}
