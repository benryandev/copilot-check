// Live figures from Strike's public API (no key; CORS open; allowed by the site CSP's connect-src).

const API = "https://api.strikefinance.org";

async function getJson(path) {
  const res = await fetch(API + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

const usd = (n) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
  : `$${n.toFixed(0)}`;

export const LABELS = {
  markets: "Markets trading",
  maxLeverage: "Max leverage",
  volume24h: "24 h volume",
  openInterest: "Open interest",
  users: "Users, all time",
  totalVolume: "Volume, all time",
  liquidated: "Liquidated, all time",
};

export async function fetchLive() {
  const [{ markets }, tickers, summary, oiRows] = await Promise.all([
    getJson("/v2/markets"),
    getJson("/price/v2/ticker/24hr"),
    getJson("/stat/v1/dashboard/summary"),
    getJson("/price/v2/openInterest"),
  ]);
  const list = Object.values(markets).filter((m) => m.status === "trading");
  const maxLev = Math.max(...list.flatMap((m) => m.margin_tiers.map((t) => t.max_leverage)));
  const volume = tickers.reduce((s, t) => s + Number(t.quoteVolume || 0), 0);
  // Open interest in contracts × mark price. The summary's open_interest_usd reads 0.
  const mark = Object.fromEntries(list.map((m) => [m.symbol, Number(m.mark_price || m.last_price || 0)]));
  const oi = oiRows.reduce((s, r) => s + Number(r.openInterest) * (mark[r.symbol] || 0), 0);

  return {
    tickers: list.map((m) => m.base_asset).sort(),
    values: {
      markets: String(list.length),
      maxLeverage: `${maxLev}x`,
      volume24h: usd(volume),
      openInterest: usd(oi),
      users: Number(summary.total_users).toLocaleString("en-AU"),
      totalVolume: usd(Number(summary.total_volume_usd)),
      liquidated: usd(Number(summary.total_liquidated_usd)),
    },
  };
}
