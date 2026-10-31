// Live figures from Strike's public API (no key; CORS open; allowed by the site CSP's connect-src).
// Never an APR or yield: those stay off the page by design.

const API = "https://api.strikefinance.org";

async function getJson(path) {
  const res = await fetch(API + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}
// One failing endpoint shouldn't blank the rest
const soft = (p) => getJson(p).catch((err) => { console.warn("[eco]", err.message); return null; });

const usd = (n) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
  : `$${n.toFixed(0)}`;
const int = (n) => Number(n).toLocaleString("en-AU");

export const LABELS = {
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

export async function fetchLive() {
  const [mk, tickers, summary, oiRows, vaults, copy, credit, referral, users] = await Promise.all([
    getJson("/v2/markets"),
    soft("/price/v2/ticker/24hr"),
    soft("/stat/v1/dashboard/summary"),
    soft("/price/v2/openInterest"),
    soft("/v2/vaults"),
    soft("/stat/v1/dashboard/copy-trading-summary"),
    soft("/v2/credit/collateral-assets"),
    soft("/stat/v1/stats/referral-leaderboard?limit=1"),
    soft("/stat/v1/dashboard/users"),
  ]);
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
  if (credit) {
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
  return { tickers: list.map((m) => m.base_asset).sort(), values, quotes };
}
