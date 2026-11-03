// The sheets as data: node --test qa/stops-unit.mjs
// Pins the district plan of workstream B (docs/superpowers/specs/2026-11-03-ecosystem-content-design.md in the Strike
// repo), the sheet schema openStop() and the stops page rely on, and the words no sheet may carry.
import test from 'node:test'; import assert from 'node:assert/strict';
import { STOPS, DISTRICTS } from '../ecosystem/js/content.js';
import { LABELS } from '../ecosystem/js/data.js';
import { isMonument } from '../ecosystem/js/content.js';
import { MONUMENT_BANNED } from '../ecosystem/js/monument-math.js';

// The places after the merges, moves and six new stops (3 Nov 2026). Order matters where layoutStops lays a row
// (perps, earn): it is the STOPS order. Builders' Row (row: "builders") is checked apart.
const PLAN = {
  hub: ['strike', 'getting-started'],
  perps: ['perpetuals', 'node', 'markets', 'order-types', 'rfq', 'margin', 'liquidations', 'subaccounts', 'pair-trading', 'twap', 'trailing', 'grid', 'scale', 'funding-comparison', 'funding-rates'],
  earn: ['monument-earn', 'slp', 'insurance-fund', 'borrow-earn', 'user-vaults', 'protocol-vaults', 'copy-trading', 'points', 'lp-program'],
  collateral: ['monument-collateral', 'usdm', 'usdc', 'ada', 'usdcx-usdm-lp', 'ausdc', 'susdrf', 'enzobtc'],
  partners: ['monument-partners', 'realfi', 'sundaeswap', 'aave-v3', 'unifold', 'dex-aggregators', 'hizz', 'lorenzo'], // lorenzo: Strike's own ecosystem graphic, 2 Nov 2026 (Ben: add now, 3 Nov)
  analytics: ['monument-analytics', 'defillama', 'coingecko', 'bendingai', 'directories'],
  community: ['monument-community', 'arcade-flappy-coin', 'referrals', 'clans', 'leaderboard', 'x', 'discord', 'docs', 'medium'],
  token: ['monument-token', 'strike-token', 'staking', 'revenue-share', 'dao-treasury'],
  chains: ['monument-chains', 'cardano', 'ethereum', 'solana', 'validators', 'lockers'],
  raceway: ['raceway'], yard: ['fillyard'],
};
const REMOVED = ['cardanocube', 'adastack', 'cardano-org-apps', 'dexhunter', 'linktree', 'migration', 'aiken'];
// Case-insensitive for the content rules; the STRIKE price rule is case-sensitive, since "Strike prices it per unit" and a
// collateral token's own price are fine
const BANNED = [/recommend|\bAPR\b|loss cover|you should|best setting/i, /STRIKE (token )?price/];
const keysIn = (d) => STOPS.filter((s) => s.district === d && s.row !== 'builders').map((s) => s.key);

for (const [d, keys] of Object.entries(PLAN)) test(`${d} holds exactly the planned stops, in order`, () => assert.deepEqual(keysIn(d), keys));
test('developers keeps its five docs stops (Builders\' Row, Ben\'s shops included, is row: "builders")', () => {
  assert.deepEqual(keysIn('developers'), ['monument-developers', 'api', 'builder-codes', 'vault-leader-api', 'l3', 'github']);
});
test('removed keys are gone and keys are unique', () => {
  const keys = STOPS.map((s) => s.key);
  for (const k of REMOVED) assert.ok(!keys.includes(k), k);
  assert.equal(new Set(keys).size, keys.length);
});
test('every stop fits the sheet schema', () => {
  for (const s of STOPS) {
    assert.ok(DISTRICTS[s.district], `${s.key}: district`);
    assert.ok(typeof s.summary === 'string' && s.summary.length > 40, `${s.key}: summary`);
    assert.ok(Array.isArray(s.points) && s.points.length >= 2 && s.points.length <= 4, `${s.key}: 2 to 4 points`);
    assert.match(s.docs, /^(https?:\/\/|\/)/, `${s.key}: docs`);
    assert.ok(s.docsLabel, `${s.key}: docsLabel`);
    for (const k of s.live || []) assert.ok(LABELS[k] || k.startsWith('lines:'), `${s.key}: live key ${k}`);
  }
});
test('stop names fit the pad label (22 characters; makeLabel draws 88 px type on a 1024 px canvas)', () => {
  for (const s of STOPS) assert.ok(s.name.length <= 22, `${s.key}: "${s.name}" is ${s.name.length} characters`);
});
test('no sheet carries a banned word', () => {
  for (const s of STOPS) for (const t of [s.summary, ...s.points]) for (const re of BANNED) assert.doesNotMatch(t, re, `${s.key}: "${t}"`);
});
test('merged sheets keep the names they absorbed', () => {
  const text = (k) => { const s = STOPS.find((x) => x.key === k); assert.ok(s, k); return [s.summary, ...s.points].join(' '); };
  for (const w of ['CardanoCube', 'Adastack', 'cardano.org']) assert.match(text('directories'), new RegExp(w));
  assert.match(text('dex-aggregators'), /DexHunter/);
  assert.match(text('github'), /Aiken/);
  assert.match(text('staking'), /single address mode/);
  assert.match(text('medium'), /2026/);
});

test('no model is used twice in Perpetuals (3 Nov 2026: scale, pair trading and funding comparison were swapped)', () => {
  const shapes = STOPS.filter((s) => s.district === 'perps').map((s) => s.shape);
  const dup = shapes.filter((s, i) => shapes.indexOf(s) !== i && s !== 'flag');
  assert.deepEqual(dup, [], `duplicates: ${dup}`);
  assert.equal(STOPS.find((s) => s.key === 'scale').shape, 'pillar');
  assert.equal(STOPS.find((s) => s.key === 'pair-trading').shape, 'bridgegate');
  assert.equal(STOPS.find((s) => s.key === 'funding-comparison').shape, 'observatory');
});

test('monuments: eight, one a plaza, placed by hand, their sheets name every figure and carry no banned word', () => {
  const ms = STOPS.filter(isMonument);
  assert.deepEqual(ms.map((s) => s.key), ['monument-earn', 'monument-collateral', 'monument-partners', 'monument-developers', 'monument-analytics', 'monument-community', 'monument-token', 'monument-chains']);
  for (const s of ms) {
    assert.ok(s.pos && s.face, s.key); assert.ok(s.live === null || s.live.length >= 3, s.key); assert.match(s.docs, /^(https:\/\/(app|docs)\.strikefinance\.org\/|\/ecosystem\/)/); // the Compass has no figures and links to the stops page; // the figures' source pages: the app for Earn and Token, the docs for the rest (app.strikefinance.org/stats is a 404)
    for (const t of [s.summary, ...s.points]) for (const re of MONUMENT_BANNED) assert.doesNotMatch(t, re, `${s.key}: "${t}"`);
  }
});
