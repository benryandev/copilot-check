// Live figures from Strike's public API (no key; CORS open; allowed by the site CSP's connect-src).
// Never an APR or yield: those stay off the page by design.

import { pickStaking, pickSlp, stakeValues, engineValues, pickCollateral, pickActivity, pickSummary, collateralValues, beaconValues } from "./monument-math.js";

const API = "https://api.strikefinance.org";

async function getJson(path) {
  const res = await fetch(API + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}
// One failing endpoint shouldn't blank the rest
const soft = (p) => getJson(p).catch((err) => { console.warn("[eco]", err.message); return null; });

/** Hourly closes for the Chart Ridge, oldest first (the last row is the candle still forming). `[]` on any failure:
 * the ridge then stays flat. Rows are Binance-style arrays; the close is index 4. `f` is injectable for tests. */
export async function fetchKlines(symbol = "BTC-USD", interval = "1h", limit = 25, f = fetch) {
  try {
    const res = await f(`${API}/price/v2/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { cache: "no-store" });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => Number(r?.[4])).filter(Number.isFinite);
  } catch (err) {
    console.warn("[eco]", "klines", err.message);
    return [];
  }
}

/** Strike's funding comparison for the windsocks: the raw body (`{ data: [{ symbol, strike, bybit, … }] }`, rates per 8 h as
 * strings) when the call is ok and the body has that shape, else null; never throws. windsock-math.js normaliseFunding reads it. */
export async function fetchFunding(f = fetch) {
  try {
    const res = await f(`${API}/stat/v1/stats/coin/funding-rate-comparison`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return body && typeof body === "object" && !Array.isArray(body) && Array.isArray(body.data) ? body : null;
  } catch (err) {
    console.warn("[eco]", "funding-rate-comparison", err.message);
    return null;
  }
}

export const usd = (n) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
  : `$${n.toFixed(0)}`;
export const int = (n) => Number(n).toLocaleString("en-AU");

export const LABELS = {
  // The monuments (Part B1, 3 Nov 2026): the SLP Engine in Earn and the Stake in Token
  slpFillsHour: "SLP fills, last hour",
  slpOpenPositions: "SLP open positions",
  userVaultSizes: "User vaults by size",
  stakedStrike: "STRIKE staked",
  stakers: "Active stakers",
  rewardsThisPeriod: "Rewards building this period",
  lastDistribution: "Last distribution",
  distributions: "Distributions so far",
  distributedAllTime: "Distributed all time",
  // Part B2: the Chart Plinth, the Collateral Stacks and the Beacon
  volume30d: "Volume, last 30 days",
  revenue30d: "Revenue, last 30 days",
  collateralAssets: "Collateral assets",
  collateralHeld: "Collateral held by asset",
  collateralLines: "Open credit lines by asset",
  activeTradersHigh30d: "Active traders, 30-day high",
  carsHere: "Cars here now",
  markets: "Markets trading",
  maxLeverage: "Max leverage",
  volume24h: "24 h volume",
  openInterest: "Open interest",
  users: "Users, all time",
  totalVolume: "Volume, all time",
  liquidated: "Liquidated, all time",
  slpEquity: "SLP vault size",
  slpDepositors: "SLP depositors",
  userVaults: "User vaults",
  copyAllocated: "Allocated to copies",
  copyOpenInterest: "Copy open interest",
  creditLines: "Open credit lines",
  referralCodes: "Referral codes",
  referredVolume: "Referred volume",
  activeTraders: "Active traders, yesterday",
  // The Fill Yard's own figures (flow.js), from the trade stream rather than the REST calls below
  fillsPerMin: "Fills, last minute",
  usd10m: "Traded, last 10 min",
  busiest: "Busiest market, 10 min",
};
// Per-collateral credit lines get their labels from the asset name
export const lineKey = (asset) => `lines:${asset}`;

// The SLP vault's id, resolved from /v2/vaults by type on every fetch; the monuments' fills poll needs it
let slpId = null;
export const slpVaultId = () => slpId;

export async function fetchLive() {
  const [mk, tickers, summary, oiRows, vaults, copy, credit, referral, users, stakingBody] = await Promise.all([
    getJson("/v2/markets"),
    soft("/price/v2/ticker/24hr"),
    soft("/stat/v1/dashboard/summary"),
    soft("/price/v2/openInterest"),
    soft("/v2/vaults"),
    soft("/stat/v1/dashboard/copy-trading-summary"),
    soft("/v2/credit/collateral-assets"),
    soft("/stat/v1/stats/referral-leaderboard?limit=1"),
    soft("/stat/v1/dashboard/users"),
    soft("/v2/liquid-staking/summary"),
  ]);
  // The monuments read only the fields monument-math.js names; every APR and price field in these bodies stops here
  slpId = vaults?.vaults?.find((v) => v.type === "protocol")?.vault_id ?? slpId;
  const positionsBody = slpId ? await soft(`/v2/positions?vault_id=${slpId}`) : null;
  const monuments = { staking: pickStaking(stakingBody), slp: pickSlp(vaults, positionsBody), collateral: pickCollateral(credit), activity: pickActivity(users), summary: pickSummary(summary) };
  const list = Object.values(mk.markets).filter((m) => m.status === "trading");
  const values = {
    markets: String(list.length),
    maxLeverage: `${Math.max(...list.flatMap((m) => m.margin_tiers.map((t) => t.max_leverage)))}x`,
  };
  if (tickers) values.volume24h = usd(tickers.reduce((s, t) => s + Number(t.quoteVolume || 0), 0));
  if (oiRows) {
    // Open interest in contracts × mark price. The summary's open_interest_usd reads 0.
    const mark = Object.fromEntries(list.map((m) => [m.symbol, Number(m.mark_price || m.last_price || 0)]));
    values.openInterest = usd(oiRows.reduce((s, r) => s + Number(r.openInterest) * (mark[r.symbol] || 0), 0));
  }
  if (summary) {
    values.users = int(summary.total_users);
    values.totalVolume = usd(Number(summary.total_volume_usd));
    values.liquidated = usd(Number(summary.total_liquidated_usd));
  }
  if (vaults) {
    const slp = vaults.vaults.find((v) => v.type === "protocol");
    if (slp) {
      values.slpEquity = usd(Number(slp.equity));
      values.slpDepositors = int(slp.depositors);
    }
    values.userVaults = String(vaults.vaults.filter((v) => v.type === "user").length);
  }
  if (copy) {
    values.copyAllocated = usd(Number(copy.total_allocated_usd));
    values.copyOpenInterest = usd(Number(copy.open_interest_usd));
  }
  if (credit?.assets) { // a body without assets would throw here and stop every board (reviewer, 3 Nov)
    let total = 0;
    for (const [asset, a] of Object.entries(credit.assets)) {
      values[lineKey(asset)] = String(a.open_lines ?? 0);
      LABELS[lineKey(asset)] = "Open credit lines";
      total += a.open_lines ?? 0;
    }
    values.creditLines = String(total);
  }
  if (referral) {
    values.referralCodes = String(referral.total_codes);
    values.referredVolume = usd(Number(referral.totals.total_volume_usd));
  }
  if (users?.daily_active_users?.length > 1) {
    values.activeTraders = int(users.daily_active_users.at(-2)[1]); // last full day
  }
  // Prices for the exchange's ticker board, busiest markets first
  const quotes = (tickers || [])
    .map((t) => ({ sym: t.symbol.replace("-USD", ""), price: Number(t.lastPrice), change: Number(t.priceChangePercent), vol: Number(t.quoteVolume) }))
    .filter((q) => q.price > 0)
    .sort((a, b) => b.vol - a.vol);
  try { Object.assign(values, stakeValues(monuments.staking), engineValues(monuments.slp, null), collateralValues(monuments.collateral), beaconValues(monuments.activity)); } catch (err) { console.warn("[eco] monuments", err.message); } // a monument string must never take the boards down
  return { tickers: list.map((m) => m.base_asset).sort(), values, quotes, monuments };
}
