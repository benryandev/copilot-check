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

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const obj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** /v2/liquid-staking/summary → { staked, stakers, upcomingUsd, distributions, allTimeUsd, latest }; null without a staked figure. */
export function pickStaking(body) {
  if (!obj(body) || num(body.current_staked_strike) == null) return null;
  const l = obj(body.latest_distribution) ? body.latest_distribution : null;
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
  const positions = (Array.isArray(positionsBody?.positions) ? positionsBody.positions : []).map((p) => ({ symbol: String(p.symbol), size: num(p.size) }));
  const userVaults = list.filter((v) => v.type === "user").map((v) => ({ name: String(v.name), equity: num(v.equity) }));
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

export const wheelSpeed = (fillsLastMinute) => ENGINE.maxSpeed * Math.min(1, fillsLastMinute / ENGINE.fullFillsPerMinute);
export const tankLevel = (equity, high) => (!high ? 1 : Math.min(1, equity / high));
export const gaugeFraction = (equity) => Math.min(1, Math.max(0, (Math.log10(Math.max(1, equity)) - Math.log10(ENGINE.gaugeLow)) / (Math.log10(ENGINE.gaugeHigh) - Math.log10(ENGINE.gaugeLow))));
export function topVaults(userVaults, n = ENGINE.gauges) {
  const top = [...userVaults].sort((a, b) => b.equity - a.equity).slice(0, n);
  while (top.length < n) top.push(null);
  return top;
}
export const columnScale = (staked) => Math.min(1, Math.max(0.05, staked / STAKE.fullStaked));
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
  const v = {
    slpOpenPositions: int(slp.positions.length),
    userVaultSizes: vaults.length ? vaults.map((x) => `${x.name} ${usd(x.equity)}`).join(" · ") : "None",
  };
  if (hour) v.slpFillsHour = hourString(hour);
  return v;
}

// What no monument string may say: the sheets' rules plus yield, return and price (the staking APR never reaches the world)
export const MONUMENT_BANNED = [/recommend|\bAPR\b|\byield\b|\breturn\b|loss cover|you should|best setting|\bprice\b/i, /STRIKE (token )?price/];
