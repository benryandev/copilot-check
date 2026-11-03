// The monuments' maths and field picks (Part B of docs/superpowers/specs/2026-11-03-ecosystem-districts-design.md in the
// Strike repo): pure functions, no three.js, no DOM, so Node tests pin them against fixtures recorded on 3 Nov 2026.
// A pick keeps only the fields named here and drops the rest at the fetch, which is how the content rules (no APR, no
// price, no supply share) are made mechanical: the staking summary carries apr_30d and strike_price_usd, the vaults
// carry apr, share_price and sharpe_ratio, and none of them survive past this file.
import { usd, int } from "./data.js";

// The Stake: the column is full at 30 M STRIKE staked (21.8 M on 3 Nov 2026); twelve lamps, all lit at 2,000 stakers (1,620)
export const STAKE = { fullStaked: 30e6, lamps: 12, fullStakers: 2000 };
// The SLP Engine: the flywheel is flat out at 30 fills a minute (the SLP filled about 1,000 to 1,400 an hour on 3 Nov);
// gauges on a log scale, $1K at rest and $1M full; sparks capped per tier
export const ENGINE = { fullFillsPerMinute: 30, maxSpeed: 3, gaugeLow: 1e3, gaugeHigh: 1e6, gauges: 3, sparkCap: 60, sparkCapCoarse: 20 };
// Fills: 100 every 10 s, seeded once with 1,000 (the API's cap: 2,000 returns 1,000), held for an hour
export const FILLS = { limit: 100, seed: 1000, pollMs: 10_000, retryMs: 30_000, windowMs: 3_600_000 };

const num = (v) => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }; // a JSON null is not a zero
const obj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** /v2/liquid-staking/summary → { staked, stakers, upcomingUsd, distributions, allTimeUsd, latest }; null without a staked figure. */
export function pickStaking(body) {
  if (!obj(body) || !("current_staked_strike" in body)) return null;
  const date = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));
  let l = obj(body.latest_distribution) ? body.latest_distribution : null;
  if (l && !(num(l.amount_usd) != null && num(l.recipient_count) != null && date(l.period_start) && date(l.period_end))) l = null; // a partial distribution is no line
  return {
    staked: num(body.current_staked_strike),
    stakers: num(body.active_staked_count),
    upcomingUsd: num(body.upcoming_rewards_usd),
    distributions: num(body.distribution_count),
    allTimeUsd: num(body.all_time_distributed_usd),
    latest: l ? { start: l.period_start, end: l.period_end, amountUsd: num(l.amount_usd), recipients: num(l.recipient_count) } : null,
  };
}

/** /v2/vaults + /v2/positions?vault_id=<SLP> → { id, equity, positions: [{ symbol, size }], userVaults: [{ name, equity }] }. */
export function pickSlp(vaultsBody, positionsBody) {
  const list = Array.isArray(vaultsBody?.vaults) ? vaultsBody.vaults : [];
  const slp = list.find((v) => v.type === "protocol");
  if (!slp) return null;
  // A failed positions fetch is null, not an empty book: the sheet then drops its count and the rings stay as they were
  const positions = Array.isArray(positionsBody?.positions) ? positionsBody.positions.map((p) => ({ symbol: String(p.symbol), size: num(p.size) })) : null;
  const userVaults = list.filter((v) => v.type === "user").map((v) => ({ name: String(v.name), equity: num(v.equity) })).filter((v) => v.equity != null); // "by size" needs a size
  return { id: slp.vault_id, equity: num(slp.equity), positions, userVaults };
}

/** /v2/history/fill → [{ id, symbol, side, size, price, timestamp }], newest first as the API sends them. */
export function pickFills(body) {
  if (!Array.isArray(body?.fills)) return [];
  return body.fills.map((f) => ({ id: f.id, symbol: String(f.symbol), side: String(f.side), size: num(f.size), price: num(f.price), timestamp: num(f.timestamp) }));
}

/** Merge a poll into the held fills: deduped by id, newest first, trimmed to the window; `added` are the ones not held before. */
export function mergeFills(held, incoming, now, windowMs = FILLS.windowMs) {
  const seen = new Set(held.map((f) => f.id));
  const added = incoming.filter((f) => !seen.has(f.id) && seen.add(f.id));
  const fills = [...added, ...held].filter((f) => f.timestamp >= now - windowMs).sort((a, b) => b.timestamp - a.timestamp);
  return { fills, added };
}

/** Fills in the last `ms`; a stamp in the future (clock skew) counts as now. */
export const fillsIn = (fills, now, ms) => fills.filter((f) => Math.min(f.timestamp, now) >= now - ms).length;

/** The hour figure: complete once the session has seen an hour of fills (`since` is the oldest stamp seen). */
export function hourFigure(fills, since, now) {
  const n = fillsIn(fills, now, 3_600_000);
  const complete = since != null && now - since >= 3_600_000;
  const minutes = since == null ? 0 : Math.min(60, Math.ceil((now - since) / 60_000));
  return { n, minutes, complete };
}
export const hourString = ({ n, minutes, complete }) => (complete ? int(n) : `${int(n)} in the last ${minutes} min`);
/** The sheet's fills line, or null until a fill has been seen (an empty or malformed seed shows nothing, not "0 in the last 0 min"). */
export const fillsLine = (fills, since, now) => (since == null ? null : hourString(hourFigure(fills, since, now)));

export const wheelSpeed = (fillsLastMinute) => ENGINE.maxSpeed * Math.min(1, fillsLastMinute / ENGINE.fullFillsPerMinute);
export const tankLevel = (equity, high) => (!high ? 1 : Math.min(1, equity / high));
export const gaugeFraction = (equity) => Math.min(1, Math.max(0, (Math.log10(Math.max(1, equity)) - Math.log10(ENGINE.gaugeLow)) / (Math.log10(ENGINE.gaugeHigh) - Math.log10(ENGINE.gaugeLow))));
export function topVaults(userVaults, n = ENGINE.gauges) {
  const top = [...userVaults].sort((a, b) => b.equity - a.equity).slice(0, n);
  while (top.length < n) top.push(null);
  return top;
}
export const columnScale = (staked) => Math.min(1, Math.max(0.05, staked / STAKE.fullStaked));
/** The fills poll seeds (limit 1,000) on its first call and again after more than a minute without a good poll: a hidden tab
 * or an outage leaves a gap that 100 fills cannot fill, and the hour figure would undercount while labelled as an hour. */
export const seedDue = (now, lastOkAt, seeded) => !seeded || now - lastOkAt > 60_000;
/** Sparks to fire for one poll: the new fills, within what the live cap leaves free. */
export const sparkBudget = (added, live, cap) => Math.max(0, Math.min(added, cap - live));
export const lampsLit = (stakers) => Math.round(STAKE.lamps * Math.min(1, stakers / STAKE.fullStakers));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 to 29 Oct 2026" when the two UTC dates share a month and year, else "28 Sep to 13 Oct 2026". */
export function periodLabel(startIso, endIso) {
  const a = new Date(startIso), b = new Date(endIso);
  const d = (x) => x.getUTCDate(), m = (x) => MONTHS[x.getUTCMonth()], y = (x) => x.getUTCFullYear();
  if (m(a) === m(b) && y(a) === y(b)) return `${d(a)} to ${d(b)} ${m(b)} ${y(b)}`;
  return `${d(a)} ${m(a)}${y(a) !== y(b) ? ` ${y(a)}` : ""} to ${d(b)} ${m(b)} ${y(b)}`;
}
export const usdExact = (n) => `$${Math.round(n).toLocaleString("en-AU")}`;

/** The Stake's sheet strings; {} without a staking body; the last-distribution line only when there is one. */
export function stakeValues(s) {
  if (!s) return {};
  const v = {};
  if (s.staked != null) v.stakedStrike = `${int(Math.round(s.staked))} STRIKE`;
  if (s.stakers != null) v.stakers = int(s.stakers);
  if (s.upcomingUsd != null) v.rewardsThisPeriod = usdExact(s.upcomingUsd);
  if (s.latest?.amountUsd != null) v.lastDistribution = `${usdExact(s.latest.amountUsd)} to ${int(s.latest.recipients)} stakers, ${periodLabel(s.latest.start, s.latest.end)}`;
  if (s.distributions != null) v.distributions = int(s.distributions);
  if (s.allTimeUsd != null) v.distributedAllTime = usdExact(s.allTimeUsd);
  return v;
}

/** The SLP Engine's sheet strings; the fills line only once the poll has a figure. */
export function engineValues(slp, hour) {
  if (!slp) return {};
  const vaults = [...slp.userVaults].sort((a, b) => b.equity - a.equity);
  const v = { userVaultSizes: vaults.length ? vaults.map((x) => `${x.name} ${usd(x.equity)}`).join(" · ") : "None" };
  if (slp.positions) v.slpOpenPositions = int(slp.positions.length);
  if (hour) v.slpFillsHour = hourString(hour);
  return v;
}

// What no monument string may say: the sheets' rules plus yield, return and price (the staking APR never reaches the world)
export const MONUMENT_BANNED = [/recommend|\bAPR\b|\byield\b|\breturn\b|loss cover|you should|best setting|\bprice\b/i, /STRIKE (token )?price/];

// ── Part B2 (3 Nov 2026): the Chart Plinth in Analytics, the Collateral Stacks in Collateral, the Beacon in Community ──
export const PLINTH = { days: 30, minBar: 0.03 };
export const STACKS = { slots: 8, low: 1e3, high: 1e6, floor: 0.2, min: 0.05, ringsCap: 48, ringFirst: 0.3, ringStep: 0.12, ringMinStep: 0.04 }; // $1K is a fifth of full height, $1M is full
export const BEACON = { days: 30, minRung: 0.08, pulseSlow: 3, pulseFast: 0.5, fullCars: 8 };
export const SERIES = { pollMs: 3_600_000, retryMs: 30_000 }; // the two daily series, once an hour
export const COLLATERAL_NAMES = { ADA: "ADA", LP_SUNDAE_USDCx_USDM: "USDCx/USDM LP", SCALED_AAVE_V3_ETH_aUSDC: "aUSDC", sUSDrf: "sUSDrf", enzoBTC: "enzoBTC" }; // the Collateral sheets' names; an unknown key shows as itself

/** The API's [ts, symbol, usd] rows summed per day, ascending; a row whose figure is not a number is skipped. */
export function dailyTotals(rows) {
  if (!Array.isArray(rows)) return [];
  const byDay = new Map();
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const ts = num(r[0]), v = num(r[2]);
    if (ts == null || v == null) continue;
    byDay.set(ts, (byDay.get(ts) ?? 0) + v);
  }
  return [...byDay].map(([ts, usd]) => ({ ts, usd })).sort((a, b) => a.ts - b.ts);
}
export const lastDays = (totals, n = PLINTH.days) => totals.slice(-n);
export function pickSeries(volumesBody, revenueBody) {
  if (volumesBody == null && revenueBody == null) return null;
  const side = (body, key) => { const d = body == null ? [] : lastDays(dailyTotals(body[key])); return d.length ? d : null; }; // a 200 with no usable day is a failed side, so the last days are kept
  const s = { volume: side(volumesBody, "total_volume_daily"), revenue: side(revenueBody, "total_revenue_daily") };
  return s.volume || s.revenue ? s : null;
}
/** Exactly n slots, oldest first, null where there is no day; a bar is its day against the row's busiest, never below minBar. */
export function barScales(days, n = PLINTH.days) {
  const d = (days ?? []).slice(-n);
  const max = Math.max(0, ...d.map((x) => x.usd));
  const scaled = d.map((x) => (max > 0 ? Math.max(PLINTH.minBar, x.usd / max) : PLINTH.minBar));
  return [...Array(n - scaled.length).fill(null), ...scaled];
}
const sumUsd = (days) => days.reduce((s, d) => s + d.usd, 0);
export function plinthValues(series) {
  const out = {};
  if (series?.volume?.length) out.volume30d = usd(sumUsd(series.volume));
  if (series?.revenue?.length) out.revenue30d = usd(sumUsd(series.revenue));
  return out;
}
export const pickSummary = (body) => (body == null ? null : { volumeUsd: num(body.total_volume_usd), users: num(body.total_users), depositsUsd: num(body.total_deposits_usd), withdrawalsUsd: num(body.total_withdrawals_usd) }); // the Pylons read the two totals (B3)

/** One entry per collateral asset the API lists, valued in dollars where it has a price (the price itself never leaves here), largest first, the priceless last. */
export function pickCollateral(body) {
  if (!body?.assets || typeof body.assets !== "object") return null;
  const list = [];
  for (const [key, a] of Object.entries(body.assets)) {
    const units = num(a?.total_collateral_units);
    if (units == null) continue;
    const price = a?.price_available === false ? null : num(a?.price); // the API flags an unavailable price; a zero values nothing
    list.push({ key, name: COLLATERAL_NAMES[key] ?? key, units, usd: price == null || price <= 0 ? null : units * price, lines: num(a?.open_lines) });
  }
  return list.sort((x, y) => (x.usd == null) - (y.usd == null) || (y.usd ?? 0) - (x.usd ?? 0) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}
/** A stack's height: a log scale from $1K (a fifth) to $1M (full), with a floor so the priceless and the tiny still stand. */
export function stackScale(usd) {
  if (usd == null) return STACKS.min;
  const span = Math.log10(STACKS.high) - Math.log10(STACKS.low);
  const f = STACKS.floor + (1 - STACKS.floor) * ((Math.log10(Math.max(1, usd)) - Math.log10(STACKS.low)) / span);
  return Math.min(1, Math.max(STACKS.min, f));
}
/** How many rings fit on a stack of height h for n lines: the usual step, compressed to the minimum, then no more than fit. */
export function ringLayout(h, n, cap = STACKS.ringsCap) {
  const want = Math.min(n ?? 0, cap);
  const room = h - STACKS.ringFirst - 0.1;
  const step = want > 0 ? Math.min(STACKS.ringStep, Math.max(STACKS.ringMinStep, room / want)) : STACKS.ringStep;
  const fit = room <= 0 ? 0 : Math.floor(room / step);
  return { count: Math.max(0, Math.min(want, fit)), step };
}
export function collateralValues(list) {
  if (list == null) return {};
  const held = list.filter((a) => a.usd != null).map((a) => `${a.name} ${usd(a.usd)}`);
  const lines = list.filter((a) => a.lines != null).sort((x, y) => y.lines - x.lines || (y.usd ?? 0) - (x.usd ?? 0)).map((a) => `${a.name} ${int(a.lines)}`);
  return { collateralAssets: String(list.length), collateralHeld: held.length ? held.join(" · ") : "None", collateralLines: lines.length ? lines.join(" · ") : "None" };
}

/** The full days of the users series (the last row is today's partial, as data.js reads it), the last 30 of them. */
export function pickActivity(body) {
  const rows = body?.daily_active_users;
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const days = rows.slice(0, -1).map((r) => ({ ts: num(r?.[0]), n: num(r?.[1]) })).filter((d) => d.ts != null && d.n != null);
  return days.length ? { days: days.slice(-BEACON.days) } : null; // every full day malformed: no activity, the last one is kept
}
export const activityHigh = (days) => (days?.length ? Math.max(...days.map((d) => d.n)) : null);
/** Exactly n rungs, newest first (yesterday on top), null padding at the end; a rung is its day against the best of them, never below minRung. */
export function rungScales(days, n = BEACON.days) {
  const d = (days ?? []).slice(-n).reverse();
  const max = activityHigh(d) ?? 0;
  const scaled = d.map((x) => (max > 0 ? Math.max(BEACON.minRung, x.n / max) : BEACON.minRung));
  return [...scaled, ...Array(n - scaled.length).fill(null)];
}
export const beaconValues = (activity) => (activity?.days?.length ? { activeTradersHigh30d: int(activityHigh(activity.days)) } : {});
/** "Cars here now": the room's count plus you when it is on, you alone when it is off by choice, unknown while connecting or offline. */
export const carsHere = (status, peersCount) => (status === "on" ? String(peersCount + 1) : status === "off" ? "1" : null);
/** The sheet line: the count, or "Not available" while the room is connecting or offline (never "Loading": a room that never connects would load forever). */
export const carsLine = (status, peersCount) => carsHere(status, peersCount) ?? "Not available";
/** The lantern's pulse period in seconds: slow alone, fast with eight or more cars here. */
export const pulsePeriod = (cars) => BEACON.pulseSlow - (BEACON.pulseSlow - BEACON.pulseFast) * Math.min(1, Math.max(0, cars - 1) / (BEACON.fullCars - 1));
/** The daily series poll is due once an hour, or 30 s after a failure. */
export const seriesDue = (now, lastAt, ok) => !lastAt || now - lastAt >= (ok ? SERIES.pollMs : SERIES.retryMs);

// ── Part B3 (3 Nov 2026): the Feed Obelisk in Developers, the Three Pylons in Chains, the Orrery in Partners ──
export const FEED = { lines: 14, repaintMs: 200 }; // the screens hold fourteen lines and repaint at most five times a second
export const ORRERY = { speeds: [0.12, -0.12 / Math.SQRT2, 0.12 / Math.sqrt(5)] }; // rad/s, outer to inner, sign = direction; irrational ratios so the pose never comes back round (12 : −8 : 5 repeated every 628 s, reviewer)

const trim = (s) => (String(s).includes(".") ? String(s).replace(/\.?0+$/, "") : String(s));
/** One screen line from a stream message { s, p, q, m } or a backfill trade { symbol, price, qty, isBuyerMaker }; null when a field is missing or not a positive number. */
export function tradeLine(ev) {
  if (!ev) return null;
  const sym = ev.s ?? ev.symbol, level = ev.p ?? ev.price, qty = ev.q ?? ev.qty, maker = ev.m ?? ev.isBuyerMaker;
  if (typeof sym !== "string" || !sym) return null;
  const l = num(level), q = num(qty);
  if (l == null || q == null || l <= 0 || q <= 0) return null;
  return `${sym.replace(/-USD$/, "")}  ${maker ? "sell" : "buy"}  ${trim(Number(q).toFixed(8))} @ ${trim(level)}`;
}
export const feedLines = (held, line, max = FEED.lines) => (line == null ? held : [...held, line].slice(-max));
/** Deposits and withdrawals all time and the difference; a missing figure leaves its line out, the difference needs both. */
/** A dollar figure that may be negative: the sign in front of the usual short form. */
export const signedUsd = (n) => (n < 0 ? `-${usd(-n)}` : usd(n));
export function flowValues(summary) {
  if (summary == null) return {};
  const d = num(summary.depositsUsd), w = num(summary.withdrawalsUsd), out = {};
  if (d != null) out.depositsAllTime = usd(d);
  if (w != null) out.withdrawalsAllTime = usd(w);
  if (d != null && w != null) out.netDeposits = signedUsd(d - w);
  return out;
}
// The Orrery (Partners) has no live data and no data-side functions; its three rings rotate in monuments.js from ORRERY.speeds.
