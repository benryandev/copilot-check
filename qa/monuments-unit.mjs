// The monuments' maths and field picks: node --test qa/monuments-unit.mjs
// Fixtures recorded from Strike's public API on 3 Nov 2026 15:20 AEST (docs/superpowers/specs/2026-11-03-ecosystem-districts-design.md
// Part B in the Strike repo). The picks keep only the named fields, so no APR or price field can reach the world.
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickStaking, pickSlp, pickFills, mergeFills, fillsIn, hourFigure, hourString, wheelSpeed, tankLevel, gaugeFraction, topVaults, columnScale, lampsLit, periodLabel, usdExact, stakeValues, engineValues, MONUMENT_BANNED, STAKE, ENGINE, PLINTH, STACKS, dailyTotals, lastDays, pickSeries, barScales, plinthValues, pickSummary, pickCollateral, stackScale, collateralValues, pickActivity, rungScales, activityHigh, beaconValues, carsHere, pulsePeriod, seriesDue } from '../ecosystem/js/monument-math.js';
import { LABELS } from '../ecosystem/js/data.js';
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}-2026-11-03.json`, import.meta.url)));
const staking = fx('liquid-staking-summary'), vaults = fx('vaults'), positions = fx('slp-positions'), fills = fx('slp-fills-100');
const volumes = fx('dashboard-volumes'), revenue = fx('dashboard-revenue'), summary = fx('dashboard-summary'), users = fx('dashboard-users'), collateral = fx('collateral-assets'); // B2, recorded 18:02 AEST

test('pickStaking keeps the named fields and nothing else', () => {
  const s = pickStaking(staking);
  assert.deepEqual(Object.keys(s).sort(), ['allTimeUsd', 'distributions', 'latest', 'staked', 'stakers', 'upcomingUsd']);
  assert.deepEqual(Object.keys(s.latest).sort(), ['amountUsd', 'end', 'recipients', 'start']);
  assert.equal(Math.round(s.staked), 21790408); assert.equal(s.stakers, 1620); assert.equal(Math.round(s.upcomingUsd), 5997);
  assert.equal(s.distributions, 11); assert.equal(Math.round(s.allTimeUsd), 224595);
  assert.deepEqual(s.latest, { start: '2026-10-14T00:00:00Z', end: '2026-10-29T00:00:00Z', amountUsd: 13100, recipients: 1090 });
  assert.doesNotMatch(JSON.stringify(s), /apr|price|usd_|share/i);
  assert.equal(pickStaking(null), null); assert.equal(pickStaking({}), null);
  assert.equal(pickStaking({ ...staking, latest_distribution: null }).latest, null);
});
test('pickSlp resolves the protocol vault and keeps equity, positions and the user vaults', () => {
  const s = pickSlp(vaults, positions);
  assert.equal(s.id, '3fd3ab0b-318b-4f99-9ad6-66e9e917bea8'); assert.equal(Math.round(s.equity), 934046);
  assert.equal(s.positions.length, 34); assert.deepEqual(Object.keys(s.positions[0]).sort(), ['size', 'symbol']);
  assert.deepEqual(s.userVaults.map((v) => v.name), ['MARKET WIZARDS', 'Strike V.I.S.I.O.N. Strategy', 'Glacier Arc Digital']);
  assert.doesNotMatch(JSON.stringify(s), /apr|share_price|sharpe|return/i);
  assert.equal(pickSlp(vaults, null).positions, null, 'a failed positions fetch is not an empty book');
  assert.equal(pickSlp({ vaults: [] }, null), null); assert.equal(pickSlp(null, null), null);
});
test('fills: pick, merge by id, window, future stamps, the hour figure', () => {
  const list = pickFills(fills);
  assert.equal(list.length, 100); assert.equal(list[0].id, 5106164); assert.equal(list[99].id, 5105966);
  assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'price', 'side', 'size', 'symbol', 'timestamp']);
  const now = list[0].timestamp;
  const first = mergeFills([], list, now);
  assert.equal(first.fills.length, 100); assert.equal(first.added.length, 100);
  const again = mergeFills(first.fills, list, now);
  assert.equal(again.fills.length, 100); assert.equal(again.added.length, 0);
  const newer = { id: 9_000_000, symbol: 'BTC-USD', side: 'buy', size: 0.01, price: 77000, timestamp: now + 5000 };
  const third = mergeFills(again.fills, [newer, ...list.slice(0, 10)], now + 5000);
  assert.equal(third.added.length, 1); assert.equal(third.fills[0].id, 9_000_000);
  assert.equal(mergeFills(list, [], now + 3_600_001).fills.length, 0, 'trimmed to the window');
  assert.equal(fillsIn(list, now, 60_000), 13); assert.equal(fillsIn(list, now, 300_000), 79);
  assert.equal(fillsIn([{ ...newer, timestamp: now + 99_999_999 }], now, 60_000), 1, 'a future stamp counts as now');
  assert.deepEqual(hourFigure(list, list[99].timestamp, now), { n: 100, minutes: 7, complete: false });
  assert.equal(hourString({ n: 612, minutes: 43, complete: false }), '612 in the last 43 min');
  assert.equal(hourString({ n: 1380, minutes: 60, complete: true }), '1,380');
  assert.deepEqual(pickFills({ nope: 1 }), []);
});
test('motion maths', () => {
  assert.equal(wheelSpeed(0), 0); assert.equal(wheelSpeed(15), 1.5); assert.equal(wheelSpeed(300), ENGINE.maxSpeed);
  assert.equal(tankLevel(900, null), 1); assert.equal(tankLevel(500, 1000), 0.5); assert.equal(tankLevel(1200, 1000), 1);
  assert.equal(gaugeFraction(1000), 0); assert.equal(gaugeFraction(1e6), 1); assert.ok(Math.abs(gaugeFraction(42594) - 0.543) < 0.01); assert.equal(gaugeFraction(10), 0);
  assert.equal(columnScale(21790408), 21790408 / 30e6); assert.equal(columnScale(0), 0.05); assert.equal(columnScale(40e6), 1);
  assert.equal(lampsLit(1620), 10); assert.equal(lampsLit(0), 0); assert.equal(lampsLit(5000), STAKE.lamps);
  assert.equal(periodLabel('2026-10-14T00:00:00Z', '2026-10-29T00:00:00Z'), '14 to 29 Oct 2026');
  assert.equal(periodLabel('2026-09-28T00:00:00Z', '2026-10-13T00:00:00Z'), '28 Sep to 13 Oct 2026');
  assert.equal(usdExact(5997.31), '$5,997'); assert.equal(usdExact(224595.19), '$224,595');
});
test('the sheet strings from the 3 Nov fixtures, and the empty cases', () => {
  assert.deepEqual(stakeValues(pickStaking(staking)), {
    stakedStrike: '21,790,408 STRIKE', stakers: '1,620', rewardsThisPeriod: '$5,997',
    lastDistribution: '$13,100 to 1,090 stakers, 14 to 29 Oct 2026', distributions: '11', distributedAllTime: '$224,595',
  });
  assert.deepEqual(stakeValues(null), {});
  assert.ok(!('lastDistribution' in stakeValues({ ...pickStaking(staking), latest: null })));
  const slp = pickSlp(vaults, positions);
  assert.deepEqual(engineValues(slp, null), { slpOpenPositions: '34', userVaultSizes: 'Glacier Arc Digital $43K · Strike V.I.S.I.O.N. Strategy $11K · MARKET WIZARDS $2K' });
  assert.equal(engineValues(slp, { n: 612, minutes: 43, complete: false }).slpFillsHour, '612 in the last 43 min');
  assert.equal(engineValues({ ...slp, userVaults: [] }, null).userVaultSizes, 'None');
  assert.deepEqual(engineValues(null, null), {});
  const top = topVaults(slp.userVaults); assert.equal(top.length, 3); assert.equal(top[0].name, 'Glacier Arc Digital');
  assert.deepEqual(topVaults([{ name: 'A', equity: 5 }]), [{ name: 'A', equity: 5 }, null, null]);
  assert.equal(topVaults(slp.userVaults.concat([{ name: 'Big', equity: 1e6 }]))[0].name, 'Big');
});
test('no monument value or label carries a banned word; every value key has a label', () => {
  const all = { ...stakeValues(pickStaking(staking)), ...engineValues(pickSlp(vaults, positions), { n: 1, minutes: 60, complete: true }) };
  for (const [k, v] of Object.entries(all)) { assert.ok(LABELS[k], `label for ${k}`); for (const re of MONUMENT_BANNED) { assert.doesNotMatch(v, re, k); assert.doesNotMatch(LABELS[k], re, k); } }
});

import { sparkBudget } from '../ecosystem/js/monument-math.js';
test('sparkBudget never exceeds the live cap, and fires nothing for a quiet poll', () => {
  assert.equal(sparkBudget(0, 0, 60), 0); assert.equal(sparkBudget(100, 0, 60), 60); assert.equal(sparkBudget(5, 58, 60), 2); assert.equal(sparkBudget(3, 20, 20), 0); assert.equal(sparkBudget(3, 25, 20), 0);
});

// ── Review fixes (3 Nov 2026): a JSON null is not a zero, a partial distribution is not a line, a failed fetch keeps its state ──
test('a null field in the staking body drops its line, never "0" or "NaN"', () => {
  const s = pickStaking({ ...staking, upcoming_rewards_usd: null, active_staked_count: null, all_time_distributed_usd: '' });
  assert.equal(s.upcomingUsd, null); assert.equal(s.stakers, null); assert.equal(s.allTimeUsd, null);
  const v = stakeValues(s);
  assert.ok(!('rewardsThisPeriod' in v) && !('stakers' in v) && !('distributedAllTime' in v), JSON.stringify(v));
  assert.equal(pickStaking({ ...staking, current_staked_strike: null }).staked, null);
  assert.ok(!('stakedStrike' in stakeValues(pickStaking({ ...staking, current_staked_strike: null }))));
  for (const val of Object.values(v)) assert.doesNotMatch(val, /NaN|undefined|^\$0$|^0$/);
});
test('a partial latest_distribution is dropped whole', () => {
  const noDates = { ...staking.latest_distribution, period_start: undefined, period_end: undefined };
  assert.equal(pickStaking({ ...staking, latest_distribution: noDates }).latest, null);
  assert.equal(pickStaking({ ...staking, latest_distribution: { ...staking.latest_distribution, recipient_count: null } }).latest, null);
  assert.equal(pickStaking({ ...staking, latest_distribution: { ...staking.latest_distribution, period_end: 'soon' } }).latest, null);
  assert.ok(pickStaking(staking).latest);
});
test('a user vault without an equity is left out; a null positions body keeps the previous count', () => {
  const broken = { vaults: vaults.vaults.map((v) => (v.name === 'MARKET WIZARDS' ? { ...v, equity: null } : v)) };
  const slp = pickSlp(broken, positions);
  assert.deepEqual(slp.userVaults.map((v) => v.name), ['Strike V.I.S.I.O.N. Strategy', 'Glacier Arc Digital']);
  assert.equal(engineValues(slp, null).userVaultSizes, 'Glacier Arc Digital $43K · Strike V.I.S.I.O.N. Strategy $11K');
  assert.equal(topVaults(slp.userVaults)[2], null);
  const noBook = pickSlp(vaults, null);
  assert.ok(!('slpOpenPositions' in engineValues(noBook, null)), 'no count without a book');
  assert.equal(engineValues(pickSlp(vaults, { positions: [] }), null).slpOpenPositions, '0', 'an empty book is a real zero');
});
import { seedDue } from '../ecosystem/js/monument-math.js';
test('seedDue: the first poll seeds, and so does the first poll after more than a minute without a good one (a hidden tab, an outage)', () => {
  assert.equal(seedDue(1000, 0, false), true);
  assert.equal(seedDue(100_000, 95_000, true), false);
  assert.equal(seedDue(200_000, 95_000, true), true);
});
import { fillsLine } from '../ecosystem/js/monument-math.js';
test('fillsLine is absent until a fill has been seen, so an empty seed never reads "0 in the last 0 min"', () => {
  assert.equal(fillsLine([], null, 1_000_000), null);
  const list = pickFills(fills), now = list[0].timestamp;
  assert.equal(fillsLine(list, list[99].timestamp, now), '100 in the last 7 min');
  assert.equal(fillsLine([], list[99].timestamp, now + 3_600_000 * 2), '0', 'a quiet hour after a seen fill is a real zero');
});

// ── Part B2: the Chart Plinth, the Collateral Stacks and the Beacon ──
test('dailyTotals sums the rows per day, skips bad figures, and the last 30 days total honestly', () => {
  const v = dailyTotals(volumes.total_volume_daily);
  assert.equal(v.length, 229); assert.ok(v.every((d, i) => i === 0 || d.ts > v[i - 1].ts));
  const last = lastDays(v); assert.equal(last.length, 30);
  assert.equal(new Date(last[0].ts).toISOString().slice(0, 10), '2026-10-05'); assert.equal(new Date(last.at(-1).ts).toISOString().slice(0, 10), '2026-11-03');
  assert.equal(Math.round(last.reduce((s, d) => s + d.usd, 0)), 216919395);
  assert.deepEqual(dailyTotals([[1, 'A', '10'], [1, 'B', null], [1, 'C', 'x'], [2, 'A', 5]]), [{ ts: 1, usd: 10 }, { ts: 2, usd: 5 }]);
  assert.deepEqual(dailyTotals(null), []); assert.deepEqual(dailyTotals([[1, 'A', null]]), []);
});
test('pickSeries and plinthValues give the two 30-day strings and nothing for a missing side', () => {
  const s = pickSeries(volumes, revenue);
  assert.deepEqual(plinthValues(s), { volume30d: '$216.9M', revenue30d: '$41K' });
  assert.deepEqual(plinthValues(pickSeries(volumes, null)), { volume30d: '$216.9M' });
  assert.equal(pickSeries(null, null), null); assert.deepEqual(plinthValues(null), {});
  for (const t of Object.values(plinthValues(s))) for (const re of MONUMENT_BANNED) assert.doesNotMatch(t, re);
});
test('barScales pads a short series at the old end and never reads a day as nothing', () => {
  const s = pickSeries(volumes, revenue);
  const b = barScales(s.volume); assert.equal(b.length, 30); assert.equal(Math.max(...b), 1); assert.ok(Math.abs(b[29] - 2200359 / 23415153) < 1e-6);
  const short = barScales([{ ts: 1, usd: 0 }, { ts: 2, usd: 50 }]);
  assert.equal(short.length, 30); assert.equal(short.filter((x) => x === null).length, 28); assert.deepEqual(short.slice(28), [PLINTH.minBar, 1]);
  assert.ok(barScales([]).every((x) => x === null)); assert.ok(barScales([{ ts: 1, usd: 0 }]).at(-1) === PLINTH.minBar);
});
test('pickSummary keeps the two counter figures and nothing else', () => {
  assert.deepEqual(pickSummary(summary), { volumeUsd: 864125249.59404689, users: 6562 });
  assert.equal(pickSummary(null), null); assert.deepEqual(pickSummary({}), { volumeUsd: null, users: null });
});
test('pickCollateral values the units, names the assets, sorts by value, and drops every rate and price field', () => {
  const c = pickCollateral(collateral);
  assert.deepEqual(c.map((a) => a.name), ['enzoBTC', 'sUSDrf', 'ADA', 'aUSDC', 'USDCx/USDM LP']);
  assert.deepEqual(c.map((a) => Math.round(a.usd)), [195432, 183754, 56338, 2664, 1580]); assert.deepEqual(c.map((a) => a.lines), [1, 36, 39, 3, 3]);
  assert.deepEqual(Object.keys(c[0]).sort(), ['key', 'lines', 'name', 'units', 'usd']);
  assert.doesNotMatch(JSON.stringify(c), /apr|price|discount|debt|encumbered/i);
  assert.equal(pickCollateral(null), null); assert.equal(pickCollateral({}), null); assert.deepEqual(pickCollateral({ assets: {} }), []);
  const noPrice = pickCollateral({ assets: { ADA: { ...collateral.assets.ADA, price: null }, ZZZ: { total_collateral_units: '5', price: '2', open_lines: 0 } } });
  assert.deepEqual(noPrice.map((a) => [a.name, a.usd, a.lines]), [['ZZZ', 10, 0], ['ADA', null, 39]], 'a priceless asset stands last, named, with its lines');
  assert.deepEqual(pickCollateral({ assets: { ADA: { price: '1', open_lines: 2 } } }), [], 'no units, no stack');
});
test('stackScale runs $1K to $1M on a log scale with a floor for the priceless', () => {
  assert.ok(Math.abs(stackScale(1e3) - 0.2) < 1e-9); assert.equal(stackScale(1e6), 1); assert.equal(stackScale(1e8), 1);
  assert.ok(Math.abs(stackScale(56338) - 0.667) < 0.002); assert.ok(Math.abs(stackScale(195432) - 0.811) < 0.002);
  assert.equal(stackScale(10), STACKS.min); assert.equal(stackScale(null), STACKS.min); assert.equal(stackScale(0), STACKS.min);
});
test('collateralValues: the sheet strings, largest first, lines by count, a priceless asset only in the lines', () => {
  const v = collateralValues(pickCollateral(collateral));
  assert.deepEqual(v, { collateralAssets: '5', collateralHeld: 'enzoBTC $195K · sUSDrf $184K · ADA $56K · aUSDC $3K · USDCx/USDM LP $2K', collateralLines: 'ADA 39 · sUSDrf 36 · aUSDC 3 · USDCx/USDM LP 3 · enzoBTC 1' });
  for (const t of Object.values(v)) for (const re of MONUMENT_BANNED) assert.doesNotMatch(t, re);
  assert.deepEqual(collateralValues([{ key: 'ADA', name: 'ADA', units: 1, usd: null, lines: 4 }]), { collateralAssets: '1', collateralHeld: 'None', collateralLines: 'ADA 4' });
  assert.deepEqual(collateralValues([]), { collateralAssets: '0', collateralHeld: 'None', collateralLines: 'None' }); assert.deepEqual(collateralValues(null), {});
});
test('pickActivity keeps the full days only, rungScales lights yesterday on top, a short series stays honest', () => {
  const a = pickActivity(users);
  assert.equal(a.days.length, 30); assert.equal(a.days.at(-1).n, 277); assert.equal(new Date(a.days[0].ts).toISOString().slice(0, 10), '2026-10-04');
  assert.equal(activityHigh(a.days), 343); assert.deepEqual(beaconValues(a), { activeTradersHigh30d: '343' });
  const r = rungScales(a.days); assert.equal(r.length, 30); assert.ok(Math.abs(r[0] - 277 / 343) < 1e-6); assert.equal(Math.max(...r), 1);
  const three = pickActivity({ daily_active_users: [[1, 10], [2, 5], [3, 99]] });
  assert.deepEqual(three.days, [{ ts: 1, n: 10 }, { ts: 2, n: 5 }]); const rs = rungScales(three.days); assert.deepEqual(rs.slice(0, 2), [0.5, 1]); assert.ok(rs.slice(2).every((x) => x === null));
  assert.equal(pickActivity({ daily_active_users: [[1, 10]] }), null); assert.equal(pickActivity(null), null); assert.deepEqual(beaconValues(null), {});
  assert.deepEqual(pickActivity({ daily_active_users: [[1, null], [2, 4], [3, 1]] }).days, [{ ts: 2, n: 4 }]);
});
test('carsHere and pulsePeriod: the room\'s states and the lantern\'s pace', () => {
  assert.equal(carsHere('on', 2), '3'); assert.equal(carsHere('on', 0), '1'); assert.equal(carsHere('off', 0), '1');
  assert.equal(carsHere('connecting', 0), null); assert.equal(carsHere('offline', 4), null);
  assert.equal(pulsePeriod(1), 3); assert.ok(Math.abs(pulsePeriod(4) - 1.9286) < 1e-3); assert.equal(pulsePeriod(8), 0.5); assert.equal(pulsePeriod(20), 0.5); assert.equal(pulsePeriod(0), 3);
});
test('the new labels exist and fetchLive\'s value keys are labelled', () => {
  for (const k of ['volume30d', 'revenue30d', 'collateralAssets', 'collateralHeld', 'collateralLines', 'activeTradersHigh30d', 'carsHere']) assert.ok(LABELS[k], k);
});
test('seriesDue: the hourly series poll, sooner after a failure', () => {
  assert.equal(seriesDue(1000, 0, true), true); assert.equal(seriesDue(10_000 + 3_599_000, 10_000, true), false); assert.equal(seriesDue(10_000 + 3_600_000, 10_000, true), true);
  assert.equal(seriesDue(10_000 + 29_000, 10_000, false), false); assert.equal(seriesDue(10_000 + 30_000, 10_000, false), true);
});
