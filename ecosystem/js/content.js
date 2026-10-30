// The world's layout and words. Sheet text paraphrases Strike's docs (read 30 Oct 2026); every stop
// links its source page. Colours follow the community ecosystem map's districts.

const DOCS = "https://docs.strikefinance.org";

export const DISTRICTS = {
  hub: { name: "Strike HQ", colour: 0x22c55e, centre: [0, 0], radius: 24, board: ["users", "totalVolume", "volume24h", "markets"] },
  perps: { name: "Perpetuals & Trading", colour: 0x22c55e, centre: [0, -140], radius: 50, board: ["volume24h", "openInterest", "markets", "maxLeverage", "users", "liquidated"] },
};

// Dirt roads as waypoints on the ground (x, z); smoothed into a curve.
export const ROADS = [
  { from: "hub", to: "perps", points: [[0, -20], [10, -34], [17, -52], [13, -70], [4, -83], [0, -92]] },
];

// Jumps: a kicker on one half of a road, so the other half is always a flat way past.
// `t` is how far along the road (0–1), `side` +1 right / −1 left of the direction of travel.
export const JUMPS = [{ road: 0, t: 0.42, side: 1, length: 8, height: 1.9, width: 3.4 }];

export const SPAWN = { x: 0, z: 14, heading: 0 };

export const STOPS = [
  {
    key: "strike",
    district: "hub",
    name: "Strike Finance",
    shape: "hq",
    pos: [-15, -4],
    summary:
      "A perpetuals exchange with its own execution layer and settlement on several chains. Strike V1 launched on Cardano in May 2025; V2 moved to a central limit order book.",
    points: [
      "Matching, positions, liquidations and funding run on the Strike Node.",
      "Deposits sit in on-chain locker contracts, with validators signing deposits and withdrawals.",
      "There's a mobile app, a full API for bots and tools, and fiat on and off ramps.",
    ],
    live: ["users", "totalVolume", "volume24h"],
    docs: `${DOCS}/getting-started/welcome`,
    docsLabel: "Welcome",
  },
  {
    key: "perpetuals",
    district: "perps",
    name: "Perpetuals",
    shape: "exchange",
    pos: [0, -166],
    summary:
      "Perpetual futures: go long or short with leverage, and no expiry date to roll. Strike lists crypto, US and Asian stocks, indices, gold, silver and oil.",
    points: [
      "Every market has its own leverage limit, which falls as a position gets bigger (margin tiers).",
      "Funding is paid between longs and shorts to keep the price close to the index.",
    ],
    live: ["markets", "maxLeverage", "volume24h"],
    docs: `${DOCS}/perpetuals/margin-tiers`,
    docsLabel: "Margin tiers",
  },
  {
    key: "node",
    district: "perps",
    name: "Strike Node",
    shape: "tower",
    pos: [-22, -152],
    summary:
      "Strike's own execution layer. Orders are matched off the base chain so trading can be fast, while deposits stay in on-chain locker contracts.",
    points: [
      "Execution happens on the Strike network; settlement and custody stay on the chain.",
      "Every order gets a sequence number, so all nodes process orders in the same order.",
    ],
    live: null,
    docs: `${DOCS}/perpetuals/strike-node`,
    docsLabel: "Strike Node",
  },
  {
    key: "rfq",
    district: "perps",
    name: "Strike RFQ",
    shape: "antenna",
    pos: [22, -152],
    summary:
      "For orders too big for the visible order book. Market makers (Quoters) look across venues like Binance and Hyperliquid and compete to bring that depth onto Strike's book.",
    points: [
      "Strike may suggest RFQ when a market order is large or its estimated slippage is high.",
      "Orders still execute on Strike's normal order book. It isn't a liquidity guarantee.",
    ],
    live: null,
    docs: `${DOCS}/perpetuals/strike-rfq`,
    docsLabel: "Strike RFQ",
  },
  {
    key: "margin",
    district: "perps",
    name: "Margin Modes",
    shape: "twin",
    pos: [-26, -134],
    summary:
      "Choose per market. Cross margin shares your whole balance across positions; isolated margin ring-fences one position so a loss there can't touch the rest.",
    points: [
      "Cross is the default and more capital efficient, but one bad trade can drain shared margin.",
      "You can run cross on one market and isolated on another at the same time.",
    ],
    live: null,
    docs: `${DOCS}/perpetuals/margin-modes`,
    docsLabel: "Margin modes",
  },
  {
    key: "liquidations",
    district: "perps",
    name: "Liquidations",
    shape: "cliff",
    pos: [26, -134],
    summary:
      "Staged, not all at once. An account that falls short of margin is first reduced in parts on the public order book; the insurance fund and auto-deleveraging are the last resort.",
    points: [
      "The aim is to keep as much of the position open as the margin allows.",
      "Liquidations carry a fee; the docs cover the full lifecycle.",
    ],
    live: ["liquidated"],
    docs: `${DOCS}/perpetuals/liquidations`,
    docsLabel: "Liquidations",
  },
  {
    key: "subaccounts",
    district: "perps",
    name: "Sub-accounts",
    shape: "cluster",
    pos: [-18, -114],
    summary:
      "Separate trading accounts under one master account, each with its own balance, positions and risk. Useful for keeping strategies, hedges or tests apart.",
    points: [
      "Balances and risk are not combined, so a liquidation in one doesn't reach the others.",
      "Move funds between the master account and its sub-accounts at any time.",
    ],
    live: null,
    docs: `${DOCS}/perpetuals/sub-accounts`,
    docsLabel: "Sub-accounts",
  },
  {
    key: "twap",
    district: "perps",
    name: "TWAP Bot",
    shape: "clock",
    pos: [18, -114],
    summary:
      "Splits one large order into many small ones over a time you choose, to soften the price impact of a single big market order.",
    points: [
      "If it falls behind, later slices grow to catch up, within a cap.",
      "Best effort: no guarantee of a full fill or a set average price.",
    ],
    live: null,
    docs: `${DOCS}/bots/twap`,
    docsLabel: "TWAP",
  },
  {
    key: "trailing",
    district: "perps",
    name: "Trailing Stop",
    shape: "flag",
    pos: [-34, -120],
    summary:
      "A stop that follows the price while a trade goes your way, then closes the position if price turns back by the percentage you set.",
    points: [
      "On a long it tracks the highest price; on a short, the lowest.",
      "It only ever moves in your favour.",
    ],
    live: null,
    docs: `${DOCS}/bots/trailing-stop`,
    docsLabel: "Trailing stop",
  },
  {
    key: "grid",
    district: "perps",
    name: "Grid Bot",
    shape: "grid",
    pos: [34, -120],
    summary:
      "Places a ladder of orders across a price range and tries to buy low and sell higher as price moves through it. Long, neutral or short.",
    points: [
      "Works best when price chops sideways inside the range.",
      "A strong trend out of the range is where it struggles.",
    ],
    live: null,
    docs: `${DOCS}/bots/grid`,
    docsLabel: "Grid",
  },
];
