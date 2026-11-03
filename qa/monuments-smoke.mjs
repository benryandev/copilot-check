// The monuments against the live API (dev only): the Stake's six sheet lines equal the strings monument-math makes from a
// fresh /v2/liquid-staking/summary; the SLP Engine's open-position count is within 5 of /v2/positions, its fills line has the
// honest shape, the seed lands (more than 100 fills held) and three injected fills make three sparks. Part B2: the Chart
// Plinth's 30-day lines equal the strings from the two daily series and its thirty bars stand with today's lit; the Collateral
// Stacks' lines equal the strings from the collateral assets and the stacks and rings count; the Beacon's lines equal the users
// series, "Cars here now" reads 1 with the room off, thirty rungs stand and the lantern pulses slowly. Part B3: the Feed Obelisk's
// lines have the yard's shapes and two injected fills reach its screens; the Three Pylons' lines equal the summary; the Compass
// has no live block, seven arms named for the partners, and a dial that turns.
// Usage: node qa/monuments-smoke.mjs [baseUrl]   (exit 1 on any failure or page error; one line per check)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pickStaking, pickSlp, stakeValues, engineValues, pickSeries, plinthValues, pickCollateral, collateralValues, pickActivity, beaconValues, STACKS, flowValues, tradeLine, pickSummary } from '../ecosystem/js/monument-math.js';
import { STOPS } from '../ecosystem/js/content.js';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const base = (process.argv[2] || 'http://localhost:8766').replace(/\/$/, '');
const API = 'https://api.strikefinance.org';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p) => (await fetch(`${API}${p}`, { cache: 'no-store' })).json();
let failures = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok ' : 'FAIL'} ${line}`); if (!ok) failures++; };

async function expected() {
  const [staking, vaults] = await Promise.all([api('/v2/liquid-staking/summary'), api('/v2/vaults')]);
  const slpId = vaults.vaults.find((v) => v.type === 'protocol')?.vault_id;
  const positions = slpId ? await api(`/v2/positions?vault_id=${slpId}`) : null;
  return { stake: stakeValues(pickStaking(staking)), slp: pickSlp(vaults, positions) };
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
const page = await ctx.newPage();
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log(`PAGE ERROR: ${e.message}`); });
const open = async (stop) => {
  await page.goto(`${base}/ecosystem/?stop=${stop}&mp=0&arrive=0#dark`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__eco && document.getElementById('stop').open, null, { timeout: 90000 });
  await page.waitForFunction(() => [...document.querySelectorAll('#stop-live dd')].every((d) => d.textContent !== 'Loading'), null, { timeout: 30000 });
};
const sheet = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#stop-live div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent])));
const LABELS = { stakedStrike: 'STRIKE staked', stakers: 'Active stakers', rewardsThisPeriod: 'Rewards building this period', lastDistribution: 'Last distribution', distributions: 'Distributions so far', distributedAllTime: 'Distributed all time' };

// (1) and (2): the Stake
let want = await expected();
await open('monument-token');
let got = await sheet();
// The summary alternates between two sources ("snapshot" and "current_exposures", 0.06% apart on 3 Nov) and the stakers and
// rewards move between fetches, so those three lines get a tolerance; the distribution lines must match exactly.
const num = (s) => Number(String(s).replace(/[^0-9.]/g, ''));
const near = (k, tol) => Math.abs(num(got[LABELS[k]]) - num(want.stake[k])) <= tol * Math.max(1, num(want.stake[k]));
const compare = () => Object.entries(LABELS).filter(([k, label]) => (k === 'stakedStrike' ? !near(k, 0.005) : k === 'stakers' ? !near(k, 0.01) : k === 'rewardsThisPeriod' ? !near(k, 0.03) : got[label] !== want.stake[k]));
let mismatch = compare();
if (mismatch.length) { want = await expected(); mismatch = compare(); }
check(mismatch.length === 0, `the Stake's sheet matches the staking summary${mismatch.length ? `: ${mismatch.map(([k, l]) => `${l} "${got[l]}" vs "${want.stake[k]}"`).join('; ')}` : ''}`);
check(Object.keys(got).length === 6, `six lines on the Stake's sheet (${Object.keys(got).length})`);

// (3) the SLP Engine
await open('monument-earn');
got = await sheet();
const positions = Number(String(got['SLP open positions']).replace(/,/g, ''));
check(Math.abs(positions - want.slp.positions.length) <= 5, `SLP open positions ${positions} within 5 of the API's ${want.slp.positions.length}`);
check(/^\d[\d,]* in the last \d+ min$|^\d[\d,]*$/.test(got['SLP fills, last hour'] || ''), `the fills line reads honestly ("${got['SLP fills, last hour']}")`);
check(got['User vaults by size'] === engineValues(want.slp, null).userVaultSizes, `the user vaults line matches ("${got['User vaults by size']}")`);
await page.keyboard.press('Escape');
await sleep(15000);
let state = await page.evaluate(() => window.__eco.monuments.state());
check(state.fills > 100 && state.seeded, `the seed landed: ${state.fills} fills held, since ${new Date(state.since).toISOString()}`);
check(state.wheel >= 0 && state.rings === Math.min(72, want.slp.positions.length), `flywheel ${state.wheel.toFixed(2)} rad/s, ${state.rings} rings`);

// (4) sparks
await page.waitForFunction(() => window.__eco.monuments.state().sparks === 0, null, { timeout: 15000 }).catch(() => {}); // sparks live 0.8 s
const before = (await page.evaluate(() => window.__eco.monuments.state())).sparks;
await page.evaluate(() => window.__eco.monuments.injectSlpFills([1, 2, 3].map((i) => ({ id: 1e9 + i, symbol: 'BTC-USD', side: 'buy', size: '0.01', price: '77000', timestamp: Date.now() }))));
await sleep(150);
state = await page.evaluate(() => window.__eco.monuments.state());
check(state.sparks === before + 3, `three injected fills made exactly three sparks (${before} → ${state.sparks})`);

// (10) and (11): the Chart Plinth
const plinthWant = async () => { const [v, r] = await Promise.all([api('/stat/v1/dashboard/volumes'), api('/stat/v1/dashboard/revenue')]); return plinthValues(pickSeries(v, r)); };
let pw = await plinthWant();
await open('monument-analytics');
got = await sheet();
let plinthOff = () => [['Volume, last 30 days', pw.volume30d], ['Revenue, last 30 days', pw.revenue30d]].filter(([l, w]) => got[l] !== w);
let off = plinthOff();
if (off.length) { pw = await plinthWant(); off = plinthOff(); } // the hour can roll between the two reads
check(off.length === 0, `the Chart Plinth's 30-day lines match the daily series${off.length ? `: ${off.map(([l, w]) => `${l} "${got[l]}" vs "${w}"`).join('; ')}` : ` ("${got['Volume, last 30 days']}", "${got['Revenue, last 30 days']}")`}`);
check(/^\$[\d.]+[KMB]?$/.test(got['Volume, all time'] || '') && /^[\d,]+$/.test(got['Users, all time'] || ''), `the counter lines are figures ("${got['Volume, all time']}", "${got['Users, all time']}")`);
state = await page.evaluate(() => window.__eco.monuments.state());
check(state.bars === 30 && state.litBar === 29, `thirty bars stand with today's lit (${state.bars}, lit ${state.litBar})`);

// (12) and (13): the Collateral Stacks
const stacksWant = async () => pickCollateral(await api('/v2/credit/collateral-assets'));
let cw = await stacksWant(), cv = collateralValues(cw);
await open('monument-collateral');
got = await sheet();
let stacksOff = () => [['Collateral assets', cv.collateralAssets], ['Open credit lines by asset', cv.collateralLines], ['Collateral held by asset', cv.collateralHeld]].filter(([l, w]) => got[l] !== w);
off = stacksOff();
if (off.length) { cw = await stacksWant(); cv = collateralValues(cw); off = stacksOff(); } // the units and their valuation move
check(off.length === 0, `the Collateral Stacks' lines match the collateral assets${off.length ? `: ${off.map(([l, w]) => `${l} "${got[l]}" vs "${w}"`).join('; ')}` : ` ("${got['Collateral held by asset']}")`}`);
state = await page.evaluate(() => window.__eco.monuments.state());
const ringsWant = cw.slice(0, STACKS.slots).reduce((s, a) => s + Math.min(a.lines ?? 0, STACKS.ringsCap), 0);
check(state.stacks === Math.min(cw.length, STACKS.slots) && state.stackRings === ringsWant, `${state.stacks} stacks and ${state.stackRings} rings (the API: ${cw.length} assets, ${ringsWant} lines)`);

// (14) and (15): the Beacon
const activity = pickActivity(await api('/stat/v1/dashboard/users')), bv = beaconValues(activity);
await open('monument-community');
got = await sheet();
const yesterday = activity.days.at(-1).n.toLocaleString('en-AU');
check(got['Active traders, yesterday'] === yesterday && got['Active traders, 30-day high'] === bv.activeTradersHigh30d && got['Cars here now'] === '1', `the Beacon's lines match the users series and read one car with the room off ("${got['Active traders, yesterday']}", "${got['Active traders, 30-day high']}", "${got['Cars here now']}")`);
state = await page.evaluate(() => window.__eco.monuments.state());
check(state.rungs === 30 && state.pulse === 3, `thirty rungs stand and the lantern pulses every 3 s (${state.rungs}, ${state.pulse})`);

// (16) and (17): the Feed Obelisk
await open('monument-developers');
got = await sheet();
check(/^[\d,]+$/.test(got['Fills, last minute'] || '') && /^\$[\d.,]+[KMB]?$/.test(got['Traded, last 10 min'] || '') && /^(.+ \(\d+ fills?\)|No fills in 10 min)$/.test(got['Busiest market, 10 min'] || ''), `the Obelisk's lines have the yard's shapes ("${got['Fills, last minute']}", "${got['Traded, last 10 min']}", "${got['Busiest market, 10 min']}")`);
state = await page.evaluate(() => window.__eco.monuments.state());
const feedBefore = state.feed;
await page.evaluate(() => window.__eco.yardInject([{ sym: 'BTC', usd: 77000, buy: true }, { sym: 'ETH', usd: 3000, buy: false }]));
await sleep(300);
state = await page.evaluate(() => window.__eco.monuments.state());
const wantLast = tradeLine({ s: 'ETH-USD', p: '3000', q: '1', m: true });
check(state.stream === 'live' && state.feed === Math.min(14, feedBefore + 2) && state.feedLast === wantLast, `the stream is live and two injected fills reached the screens (${feedBefore} → ${state.feed}, last "${state.feedLast}")`);

// (18) and (19): the Three Pylons
const flowWant = async () => flowValues(pickSummary(await api('/stat/v1/dashboard/summary')));
let fw = await flowWant();
await open('monument-chains');
got = await sheet();
let flowOff = () => [['Deposits, all time', fw.depositsAllTime], ['Withdrawals, all time', fw.withdrawalsAllTime], ['Deposits less withdrawals', fw.netDeposits]].filter(([l, w]) => got[l] !== w);
off = flowOff();
if (off.length) { fw = await flowWant(); off = flowOff(); }
check(off.length === 0, `the Pylons' lines match the summary${off.length ? `: ${off.map(([l, w]) => `${l} "${got[l]}" vs "${w}"`).join('; ')}` : ` ("${got['Deposits, all time']}", "${got['Withdrawals, all time']}", "${got['Deposits less withdrawals']}")`}`);
state = await page.evaluate(() => window.__eco.monuments.state());
check(state.pylonsFace?.length === 3, `three lines on the Pylons' face (${state.pylonsFace?.length})`);

// (20) and (21): the Compass
await page.goto(`${base}/ecosystem/?stop=monument-partners&mp=0&arrive=0#dark`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__eco && document.getElementById('stop').open, null, { timeout: 90000 });
const partners = STOPS.filter((s) => s.district === 'partners' && !s.key.startsWith('monument-')).map((s) => s.name);
const liveBlock = await page.evaluate(() => document.querySelectorAll('#stop-live div').length);
state = await page.evaluate(() => window.__eco.monuments.state());
check(liveBlock === 0 && state.arms === partners.length && JSON.stringify(state.armNames) === JSON.stringify(partners), `the Compass has no live block and ${state.arms} arms named for the partners (${state.armNames.join(', ')})`);
const dial0 = state.dial;
await page.waitForFunction((d) => window.__eco.monuments.state().dial > d + 0.01, dial0, { timeout: 15000 }).catch(() => {}); // software rendering is slow; give it a few frames
state = await page.evaluate(() => window.__eco.monuments.state());
check(state.dial > dial0, `the dial turns (${dial0.toFixed(3)} → ${state.dial.toFixed(3)} rad)`);
// (22) a sheet without live keys open while the fills poll lands must not throw (the reviewer's catch: it broke the SLP poll and the room)
const sparksBefore = state.sparks;
const threw = await page.evaluate(() => { try { window.__eco.monuments.injectSlpFills([1, 2, 3].map((i) => ({ id: 2e9 + i, symbol: 'BTC-USD', side: 'buy', size: '0.01', price: '77000', timestamp: Date.now() }))); return null; } catch (e) { return e.message; } });
state = await page.evaluate(() => window.__eco.monuments.state());
check(threw === null && state.fillsOk && state.sparks === sparksBefore + 3, `fills landing under the Compass's sheet keep the poll and the sparks (${threw ?? 'no throw'}, ok ${state.fillsOk}, sparks ${sparksBefore} → ${state.sparks})`);

// (5) no page error
check(errors === 0, `no page error (${errors})`);
await browser.close();
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('monuments: clean');
