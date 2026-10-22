import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bech32Decode, bech32Encode, cardanoAddress, toHex, fromHex, utf8Hex, newKey, authHeaders, signedMessage, client, connect,
  plan, execute, openMarkets, readBack, cardanoWallets, FEE_BPS } from '../src/golive.js';

const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const res = (status, v) => ({ ok: status < 300, status, text: async () => (v === undefined ? '' : JSON.stringify(v)), json: async () => v });
/** Routes by "METHOD path-prefix"; records every call. */
function fakeFetch(routes, calls = []) {
  return async (url, init = {}) => {
    const u = new URL(url), m = init.method || 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ m, path: u.pathname + u.search, body, headers: init.headers || {} });
    const k = Object.keys(routes).find(k => `${m} ${u.pathname}${u.search}`.startsWith(k));
    if (!k) return res(404, { error: 'not found' });
    const v = typeof routes[k] === 'function' ? routes[k](body, u) : routes[k];
    return Array.isArray(v) && typeof v[0] === 'number' ? res(v[0], v[1]) : res(200, v);
  };
}

// CIP-19 test vector (mainnet base address, key/key).
const ADDR = 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x';

test('bech32 round trip on a CIP-19 address; CIP-30 hex → addr1', () => {
  const { hrp, bytes } = bech32Decode(ADDR);
  assert.equal(hrp, 'addr'); assert.equal(bytes.length, 57);
  assert.equal(bech32Encode('addr', bytes), ADDR);
  assert.equal(cardanoAddress(toHex(bytes)), ADDR);
  const test0 = new Uint8Array(bytes); test0[0] = 0x00;
  assert.match(cardanoAddress(toHex(test0)), /^addr_test1/);
  assert.throws(() => bech32Decode(ADDR.slice(0, -1) + 'q'), /checksum/);
  assert.equal(utf8Hex('Hi'), '4869'); assert.deepEqual([...fromHex('00ff')], [0, 255]);
});

test('request signature: Ed25519 over METHOD:PATH:TS:NONCE:sha256(body), key not exportable', async () => {
  const key = await newKey();
  assert.match(key.pub, /^[0-9a-f]{64}$/);
  await assert.rejects(crypto.subtle.exportKey('pkcs8', key.pair.privateKey));
  const body = '{"a":1}';
  const h = await authHeaders(key, 'post', '/v2/leverage', body, { ts: 1700000000, nonce: 'n-1' });
  const hash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
  const msg = `POST:/v2/leverage:1700000000:n-1:${hash}`;
  assert.equal(signedMessage('post', '/v2/leverage', 1700000000, 'n-1', hash), msg);
  assert.ok(await crypto.subtle.verify({ name: 'Ed25519' }, key.pair.publicKey, fromHex(h['X-API-Wallet-Signature']), new TextEncoder().encode(msg)));
  assert.equal(h['X-API-Wallet-Public-Key'], key.pub); assert.equal(h['X-API-Wallet-Timestamp'], '1700000000'); assert.equal(h['X-API-Wallet-Nonce'], 'n-1');
  // GET hashes the empty string
  const g = await authHeaders(key, 'GET', '/v2/positions?sub_account_id=s', '', { ts: 1, nonce: 'n' });
  const gmsg = 'GET:/v2/positions?sub_account_id=s:1:n:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  assert.ok(await crypto.subtle.verify({ name: 'Ed25519' }, key.pair.publicKey, fromHex(g['X-API-Wallet-Signature']), new TextEncoder().encode(gmsg)));
});

test('client uses the server clock and signs the exact body it sends', async () => {
  const key = await newKey(), calls = [];
  const call = client(key, { now: () => 1_000_000, uuid: () => 'u', fetch: fakeFetch({ 'GET /v2/time': { serverTime: 5_000_000 }, 'POST /v2/leverage': { ok: 1 } }, calls) });
  const r = await call('POST', '/v2/leverage', { symbol: 'BTC-USD', leverage: 3 });
  assert.equal(r.ok, true);
  const c = calls.find(x => x.path === '/v2/leverage');
  assert.equal(c.headers['X-API-Wallet-Timestamp'], '4999'); // server time minus a second
  const hash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(c.body))));
  assert.ok(await crypto.subtle.verify({ name: 'Ed25519' }, key.pair.publicKey, fromHex(c.headers['X-API-Wallet-Signature']),
    new TextEncoder().encode(`POST:/v2/leverage:4999:u:${hash}`)));
});

const addrHex = toHex(bech32Decode(ADDR).bytes);
const wallet = (over = {}) => ({ getChangeAddress: async () => addrHex, getUsedAddresses: async () => [], signData: async (a, p) => ({ signature: `sig(${a.slice(0, 4)},${p.length})`, key: 'cosekey' }), ...over });
const connectRoutes = (over = {}) => ({
  'GET /v2/account?blockchain_address=': fx('strike-account-main.json'),
  'GET /v2/account?account_id=': fx('strike-account-main.json'),
  'POST /auth/builder/request-signature': b => ({ nonce: 'N1', message_to_sign: `Connect via "${b.code}" ${b.fee_share_bps}` }),
  'POST /auth/builder/verify-signature': { account_id: 'acc-main', builder_code: 'cc', fee_share_bps: 0, api_wallet_public_key: 'x' },
  ...over });

test('connect: no fee, CIP-30 signature format, account checked before and after', async () => {
  const calls = [];
  const c = await connect(wallet(), { code: 'cc', fetch: fakeFetch(connectRoutes(), calls) });
  assert.equal(c.accountId, 'acc-main'); assert.equal(c.address, ADDR); assert.deepEqual(c.subs.map(s => s.name), ['Sub1', 'Sub1']);
  const rq = calls.find(x => x.path === '/auth/builder/request-signature').body;
  assert.deepEqual(Object.keys(rq).sort(), ['address', 'chain', 'code', 'fee_share_bps', 'public_key']); // no referral code
  assert.equal(rq.fee_share_bps, 0); assert.equal(FEE_BPS, 0); assert.equal(rq.chain, 'cardano'); assert.equal(rq.public_key, c.key.pub);
  const vf = calls.find(x => x.path === '/auth/builder/verify-signature').body;
  assert.equal(vf.nonce, 'N1'); assert.equal(vf.wallet_signature, `sig(${addrHex.slice(0, 4)},${utf8Hex('Connect via "cc" 0').length}):cosekey`);
});

test('connect refusals: no code, no Strike account, wrong account, a fee, wallet declines', async () => {
  await assert.rejects(connect(wallet(), { code: '', fetch: fakeFetch(connectRoutes()) }), /isn't set up/);
  const calls = [];
  await assert.rejects(connect(wallet(), { code: 'cc', fetch: fakeFetch(connectRoutes({ 'GET /v2/account?blockchain_address=': [404, {}] }), calls) }), /no Strike account/);
  assert.ok(!calls.some(x => x.path.startsWith('/auth/')), 'never asks Strike to connect (it would create an account)');
  await assert.rejects(connect(wallet(), { code: 'cc', fetch: fakeFetch(connectRoutes({ 'POST /auth/builder/verify-signature': { account_id: 'other', fee_share_bps: 0 } })) }), /different account/);
  await assert.rejects(connect(wallet(), { code: 'cc', fetch: fakeFetch(connectRoutes({ 'POST /auth/builder/verify-signature': { account_id: 'acc-main', fee_share_bps: 5 } })) }), /builder fee/);
  await assert.rejects(connect(wallet({ signData: async () => { throw new Error('user declined'); } }), { code: 'cc', fetch: fakeFetch(connectRoutes()) }), /didn't sign/);
  await assert.rejects(connect(wallet(), { code: 'cc', fetch: fakeFetch(connectRoutes({ 'POST /auth/builder/request-signature': [404, { error: 'builder code not found' }] })) }), /builder code not found/);
});

test('connect finds the Strike account on a used address when the change address is new', async () => {
  const other = new Uint8Array(bech32Decode(ADDR).bytes); other[5] ^= 1;
  const known = cardanoAddress(toHex(other));
  const f = fakeFetch(connectRoutes({ 'GET /v2/account?blockchain_address=': (b, u) => (u.searchParams.get('blockchain_address') === known ? fx('strike-account-main.json') : [404, {}]) }));
  const signed = [];
  const c = await connect(wallet({ getUsedAddresses: async () => [toHex(other)], signData: async a => { signed.push(a); return { signature: 's', key: 'k' }; } }), { code: 'cc', fetch: f });
  assert.equal(c.address, known); assert.deepEqual(signed, [toHex(other)]);
});

const MK = {
  'BTC-USD': { tiers: [[1e6, 40, 0.0125, 0]] }, 'PUMP-USD': { tiers: [[1e5, 5, 0.1, 0]] }, 'ZEC-USD': { tiers: [[1e5, 10, 0.05, 0]] },
};
const S = { mode: 'fm', amount: 20, lev: 10, marginMode: 'isolated', cap: 20, tcap: 50, excluded: ['ZEC-USD'], start: 1000 };
const LEAD = '0x10D11287eba086fd52ae41821fdb8d7e612eafdc';

test('plan: settings per market first (capped at the market max, exclusions untouched), then subscribe, then the total cap', () => {
  const p = plan(S, LEAD, MK, 'sub-9');
  assert.deepEqual(p.steps.map(s => `${s.kind}:${s.sym || ''}`), ['mode:BTC-USD', 'lev:BTC-USD', 'mode:PUMP-USD', 'lev:PUMP-USD', 'subscribe:', 'tcap:']);
  assert.deepEqual(p.steps[1].body, { symbol: 'BTC-USD', leverage: 10, sub_account_id: 'sub-9' });
  assert.deepEqual(p.steps[0].body, { symbol: 'BTC-USD', marginMode: 'isolated', sub_account_id: 'sub-9' });
  assert.equal(p.steps[3].body.leverage, 5); assert.deepEqual(p.capped, ['PUMP 5x']);
  assert.deepEqual(p.steps[4].body, { lead_account_id: LEAD.toLowerCase(), platform: 'hyperliquid', copy_mode: 'fixed_amount', margin_per_entry_order: '20',
    max_margin_per_symbol: '20', excluded_symbols: ['ZEC-USD'], copy_existing_positions: false, sub_account_id: 'sub-9' });
  assert.deepEqual(p.steps[5].body, { max_margin_per_symbol: '20', max_margin_total: '50', sub_account_id: 'sub-9' });
  // fixed ratio, no caps, main account
  const q = plan({ ...S, mode: 'fr', amount: 500, cap: 0, tcap: 0, excluded: [] }, LEAD, MK, null);
  assert.deepEqual(q.steps.at(-1).body, { lead_account_id: LEAD.toLowerCase(), platform: 'hyperliquid', copy_mode: 'fixed_ratio', copy_amount: '500', copy_existing_positions: false });
  assert.ok(!q.steps.some(s => 'sub_account_id' in s.body));
});

test('plan refusals: under Strike\'s minimums, not a Hyperliquid wallet', () => {
  assert.match(plan({ ...S, amount: 10 }, LEAD, MK).error, /\$20/);
  assert.match(plan({ ...S, mode: 'fr', amount: 15 }, LEAD, MK).error, /\$20/);
  assert.match(plan(S, 'addr1xyz', MK).error, /Hyperliquid/);
});

test('execute: skips open-position markets, stops before subscribing if a setting failed', async () => {
  const sent = [];
  const call = async (m, path, body) => { sent.push(`${m} ${path} ${body?.symbol || ''}`.trim()); return path === '/v2/leverage' && body.symbol === 'PUMP-USD' ? { ok: false, status: 400, data: { error: 'x' } } : { ok: true, status: 200, data: {} }; };
  const r = await execute(call, plan(S, LEAD, MK, 's'), { skip: ['BTC-USD'], pause: 0 });
  assert.equal(r.ok, false); assert.match(r.error, /PUMP/); assert.ok(!sent.some(x => x.includes('subscribe')));
  assert.ok(!sent.some(x => x.endsWith('BTC-USD')), 'open-position market untouched');
});

test('execute: happy path subscribes then sets the total cap on the new id; read back', async () => {
  const sent = [];
  const call = async (m, path, body) => { sent.push([m, path, body]);
    if (path === '/v2/copy/subscribe') return { ok: true, status: 200, data: { subscription_id: 'sub-new', status: 'active' } };
    if (path.startsWith('/v2/copy/subscriptions')) return { ok: true, status: 200, data: { subscriptions: [{ subscription_id: 'sub-new', margin_per_entry_order: '20' }] } };
    return { ok: true, status: 200, data: m === 'PATCH' ? null : {} }; };
  const steps = [];
  const r = await execute(call, plan(S, LEAD, MK, 's'), { pause: 0, onStep: x => steps.push(x.step) });
  assert.deepEqual(r, { ok: true, subscriptionId: 'sub-new', failed: [] });
  assert.deepEqual(sent.at(-1).slice(0, 2), ['PATCH', '/v2/copy/subscribe/sub-new']);
  assert.deepEqual([...new Set(steps)], ['settings', 'subscribe', 'tcap']);
  assert.equal((await readBack(call, 'sub-new', 's')).margin_per_entry_order, '20');
});

test('execute: a refused subscribe or total cap is reported with Strike\'s words', async () => {
  const no = async (m, path) => (path === '/v2/copy/subscribe' ? { ok: false, status: 400, data: { error: 'lead trader has reached max followers' } } : { ok: true, status: 200, data: {} });
  assert.deepEqual(await execute(no, plan(S, LEAD, MK), { pause: 0 }), { ok: false, failed: [], error: 'lead trader has reached max followers' });
  const capNo = async (m, path) => (path === '/v2/copy/subscribe' ? { ok: true, status: 200, data: { subscription_id: 'i' } } : m === 'PATCH' ? { ok: false, status: 400, data: null } : { ok: true, status: 200, data: {} });
  const r = await execute(capNo, plan(S, LEAD, MK), { pause: 0 });
  assert.equal(r.ok, true); assert.equal(r.subscriptionId, 'i'); assert.match(r.error, /total cap wasn't set/);
});

test('open markets and installed wallets', async () => {
  const call = async () => ({ ok: true, status: 200, data: fx('strike-positions.json') });
  assert.deepEqual(await openMarkets(call), ['BTC-USD']);
  const w = cardanoWallets({ cardano: { eternl: { name: 'eternl', enable() {} }, lace: { name: 'lace', enable() {} }, junk: 1, typhon: { name: 'Typhon' } } });
  assert.deepEqual(w, [{ id: 'eternl', name: 'eternl' }, { id: 'lace', name: 'lace' }]);
});
