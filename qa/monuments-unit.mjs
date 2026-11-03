// The monuments' maths and field picks: node --test qa/monuments-unit.mjs
// Fixtures recorded from Strike's public API on 3 Nov 2026 15:20 AEST (docs/superpowers/specs/2026-11-03-ecosystem-districts-design.md
// Part B in the Strike repo). The picks keep only the named fields, so no APR or price field can reach the world.
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickStaking, pickSlp, pickFills, mergeFills, fillsIn, hourFigure, hourString, wheelSpeed, tankLevel, gaugeFraction, topVaults, columnScale, lampsLit, periodLabel, usdExact, stakeValues, engineValues, MONUMENT_BANNED, STAKE, ENGINE } from '../ecosystem/js/monument-math.js';
import { LABELS } from '../ecosystem/js/data.js';
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}-2026-11-03.json`, import.meta.url)));
const staking = fx('liquid-staking-summary'), vaults = fx('vaults'), positions = fx('slp-positions'), fills = fx('slp-fills-100');

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
  assert.deepEqual(pickSlp(vaults, null).positions, []);
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
