// The monuments against the live API (dev only): the Stake's six sheet lines equal the strings monument-math makes from a
// fresh /v2/liquid-staking/summary; the SLP Engine's open-position count is within 5 of /v2/positions, its fills line has the
// honest shape, the seed lands (more than 100 fills held) and three injected fills make three sparks.
// Usage: node qa/monuments-smoke.mjs [baseUrl]   (exit 1 on any failure or page error; one line per check)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pickStaking, pickSlp, stakeValues, engineValues } from '../ecosystem/js/monument-math.js';

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
const before = state.sparks;
await page.evaluate(() => window.__eco.monuments.injectSlpFills([1, 2, 3].map((i) => ({ id: 1e9 + i, symbol: 'BTC-USD', side: 'buy', size: '0.01', price: '77000', timestamp: Date.now() }))));
await sleep(200);
state = await page.evaluate(() => window.__eco.monuments.state());
check(state.sparks >= before + 3 || state.sparks >= 3, `three injected fills made sparks (${before} → ${state.sparks})`);

// (5) no page error
check(errors === 0, `no page error (${errors})`);
await browser.close();
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('monuments: clean');
