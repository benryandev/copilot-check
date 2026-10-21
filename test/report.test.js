import test from 'node:test'; import assert from 'node:assert/strict';
import { buildReport, bestInReplay, monthsFrom, wipeoutsFrom, listedShare } from '../src/report.js';

const NOW = Date.UTC(2026, 9, 22);
const DAY = 86_400_000;
const T = [[1e18, 10, 0.025, 0]];
const mk = { 'BTC-USD': { hl: 'BTC', tiers: T, minNotional: 10 }, 'XAU-USD': { hl: 'xyz:GOLD', tiers: T, minNotional: 10 } };
const ch = (o = {}) => ({ main: { accountValue: 1000, marginUsed: 100, maintUsed: 10, positions: [] }, xyz: { accountValue: 0, marginUsed: 0, maintUsed: 0, positions: [] }, ...o });
const base = (o = {}) => ({ addr: '0x' + 'a'.repeat(40), size: 1000, fee: 0.0005, mk, now: NOW, fills: [], fillsSince: NOW - 90 * DAY, ch: ch(),
  portfolio: { accountValue: [[NOW - 400 * DAY, 1000], [NOW - DAY, 1200]], pnl: [[NOW - 400 * DAY, 0], [NOW - DAY, 200]], perp: null },
  ledger: [], replays: [], meta: { days: 90, truncated: false, unmarked: [] }, ...o });
const row = (o) => ({ mode: 'fm', lev: 10, days: 90, net: 100, dd: -50, liquidations: 0, wiped: null, taken: 5, skipped: {}, symPk: { 'BTC-USD': 33 }, peakMargin: 81, ...o });
const banned = /recommend|you should|best setting|score|NaN|Infinity/i;

test('report for empty fills', () => {
  const r = buildReport(base({ portfolio: { accountValue: [], pnl: [], perp: null }, ch: null }));
  assert.deepEqual(r.record.months, []); assert.equal(r.fit.listedShareAll, null); assert.equal(r.replay.best, null);
  assert.equal(r.verdict.sentence, 'No perp trades in this wallet\'s history yet.');
  assert.doesNotMatch(JSON.stringify(r), banned);
});
test('listed share on a 3-coin fill set equals the hand value', () => {
  const fills = [{ coin: 'BTC', time: NOW - DAY, closedPnl: 300 }, { coin: 'XMR', time: NOW - DAY, closedPnl: -100 }, { coin: 'xyz:GOLD', time: NOW - DAY, closedPnl: 100 }, { coin: '@107', time: NOW - DAY, closedPnl: 9999 }];
  assert.equal(listedShare(fills, mk).share, 400 / 500);
  const r = buildReport(base({ fills }));
  assert.equal(r.fit.listedShareAll, 0.8); assert.match(r.verdict.sentence, /^Most of this wallet's closed profit/);
});
test('verdict bands', () => {
  const f = (b, x) => [{ coin: 'BTC', time: NOW - DAY, closedPnl: b }, { coin: 'XMR', time: NOW - DAY, closedPnl: x }];
  assert.match(buildReport(base({ fills: f(50, 50) })).verdict.sentence, /^About half/);
  assert.match(buildReport(base({ fills: f(30, 70) })).verdict.sentence, /doesn't list, so a copy can't follow them/);
});
test('best in replay: ratio, no liquidations, ties to the smaller drop', () => {
  assert.equal(bestInReplay([row({ lev: 10, net: 200, dd: -100, liquidations: 1 }), row({ lev: 5, net: 100, dd: -100 }), row({ lev: 3, net: 50, dd: -50 })]).lev, 3);
  assert.equal(bestInReplay([row({ liquidations: 2 })]), null);
  assert.equal(bestInReplay([row({ net: 10, dd: 0 }), row({ lev: 5, net: 5, dd: 0 })]).net, 10);
  const r = buildReport(base({ replays: [row({ liquidations: 1 })] }));
  assert.equal(r.replay.best, null);
  const ok = buildReport(base({ replays: [row({})] })).replay.best;
  assert.deepEqual([ok.marginPerEntry, ok.symCap, ok.totalCap], [50, 40, 90]);
});
test('catches fire on their threshold, not 1 unit under', () => {
  const titles = o => buildReport(base(o)).catches.map(c => c.title).join(' | ');
  const pos = lev => ch({ main: { accountValue: 1000, marginUsed: 100, maintUsed: 10, positions: [{ coin: 'BTC', szi: 1, lev, value: 100, liqPx: 90, entry: 100 }] } });
  assert.match(titles({ ch: pos(20) }), /20x position/); assert.doesNotMatch(titles({ ch: pos(19) }), /x position/);
  const m = r => ch({ main: { accountValue: 1000, marginUsed: 900, maintUsed: r, positions: [] } });
  assert.match(titles({ ch: m(600) }), /Close to liquidation/); assert.doesNotMatch(titles({ ch: m(599) }), /Close to liquidation/);
  const young = d => ({ portfolio: { accountValue: [[NOW - d * DAY, 1000]], pnl: [[NOW - d * DAY, 0]], perp: null } });
  assert.match(titles(young(150)), /Young record/); assert.doesNotMatch(titles(young(200)), /Young record/);
  const conc = (a, b) => ({ fills: [{ coin: 'BTC', time: NOW - DAY, closedPnl: a }, { coin: 'xyz:GOLD', time: NOW - DAY, closedPnl: b }] });
  assert.match(titles(conc(61, 39)), /Concentrated in BTC/); assert.doesNotMatch(titles(conc(60, 40)), /Concentrated/);
  const wd = x => ({ ledger: [{ time: NOW - DAY, usdc: -x }], ch: ch({ main: { accountValue: 1000, marginUsed: 0, maintUsed: 0, positions: [] } }) });
  assert.match(titles(wd(1001)), /Large withdrawals/); assert.doesNotMatch(titles(wd(1000)), /Large withdrawals/);
  const drift = { fills: [{ coin: 'BTC', time: NOW - 60 * DAY, closedPnl: 100 }, { coin: 'XMR', time: NOW - DAY, closedPnl: 40 }] };
  assert.match(titles(drift), /drifting/);
  const never = { fills: [{ coin: 'XMR', time: NOW - 60 * DAY, closedPnl: 100 }, { coin: 'XMR', time: NOW - DAY, closedPnl: 40 }] };
  assert.match(titles(never), /Most profit is on markets Strike doesn't list/); assert.doesNotMatch(titles(never), /drifting/);
});
test('wipeouts use P&L, so withdrawals are not wipeouts', () => {
  assert.equal(wipeoutsFrom([[1, 1000], [2, 50]], [[1, 0], [2, 0]]).n, 0);          // withdrew 950
  assert.equal(wipeoutsFrom([[1, 1000], [2, 50]], [[1, 0], [2, -950]]).n, 1);       // lost 950
  assert.match(buildReport(base({ portfolio: { accountValue: [[NOW - 400 * DAY, 1000], [NOW - 300 * DAY, 50]], pnl: [[NOW - 400 * DAY, 0], [NOW - 300 * DAY, -950]], perp: null } })).catches[0].title, /One wipeout/);
});
test('months from cumulative P&L', () => {
  const t = (m, d) => Date.UTC(2026, m, d);
  assert.deepEqual(monthsFrom([[t(7, 1), 0], [t(7, 20), 50], [t(8, 10), 20], [t(9, 5), 100]]), [{ ym: '2026-08', pnl: 50 }, { ym: '2026-09', pnl: -30 }, { ym: '2026-10', pnl: 80 }]);
});
test('wording: no advice words and no score in any report', () => {
  const fills = [{ coin: 'BTC', time: NOW - DAY, closedPnl: 10 }];
  const r = buildReport(base({ fills, replays: [row({}), row({ mode: 'fr' })], meta: { days: 30, truncated: true, unmarked: ['XAU-USD'] } }));
  assert.doesNotMatch(JSON.stringify(r), banned);
  assert.ok(r.catches.some(c => /30 days only/.test(c.title)));
});
test('a serious catch changes the headline; the notice counts catches', () => {
  const fills = [{ coin: 'BTC', time: NOW - DAY, closedPnl: 100 }];
  const r = buildReport(base({ fills, replays: [row({})], portfolio: { accountValue: [[NOW - 400 * DAY, 1000], [NOW - 300 * DAY, 50]], pnl: [[NOW - 400 * DAY, 0], [NOW - 300 * DAY, -950]], perp: null } }));
  assert.equal(r.verdict.word, 'Mostly copyable on Strike, with a serious catch');
  assert.match(r.verdict.sentence, /But: one wipeout in its history\.$/);
  assert.equal(r.verdict.notice.title, 'Catches below: 1 serious, 1 to weigh'); // plus concentration in one coin
  assert.equal(buildReport(base({ fills: [...fills, { coin: 'xyz:GOLD', time: NOW - DAY, closedPnl: 90 }] })).verdict.notice, null);
});
test('verdict: a replay that copied nothing does not claim liquidations', () => {
  const fills = [{ coin: 'XMR', time: NOW - DAY, closedPnl: 100, dir: 'Close Long' }];
  const v = buildReport(base({ fills, replays: [row({ taken: 0, net: 0, dd: 0 }), row({ mode: 'fr', taken: 0, net: 0, dd: 0 })] })).verdict;
  assert.match(v.sentence, /would have opened nothing/); assert.doesNotMatch(v.sentence, /liquidation/);
  const liq = buildReport(base({ fills, replays: [row({ liquidations: 1 })] })).verdict;
  assert.match(liq.sentence, /Every setting in the replay had a liquidation/);
});
