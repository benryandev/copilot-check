// Go live: turn a paper copy's settings into a real Strike copy through Builder Connect, with no builder fee.
// The signing key is made in this browser tab, can't be exported, is held only in memory, and is gone when the tab
// closes. Strike sends withdrawals only to the user's own wallet, so the key can place copy settings, not move money.
// Everything here is pure or takes its I/O (fetch, wallet, WebCrypto) as arguments, so the tests run it end to end.
import { STRIKE_API } from '../core/http.js';
import { accountByAddress, accountById } from '../core/strike.js';

/** Builder code registered on Strike for this site. Empty = the Go live button stays hidden. */
export const BUILDER_CODE = 'copilotcheck';
/** Builder fee the user approves: none. */
export const FEE_BPS = 0;
/** Strike's copy minimums (/v2/copy/lead-traders: min_margin_per_entry_order, min_copy_amount). */
export const MIN_ENTRY = 20, MIN_COPY = 20;

// ---------- bytes ----------
export const toHex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
export const fromHex = s => new Uint8Array((String(s).match(/../g) || []).map(x => parseInt(x, 16)));
export const utf8Hex = s => toHex(new TextEncoder().encode(s));

// ---------- bech32 (CIP-30 wallets give the address as hex bytes; Strike wants addr1…) ----------
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(v) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let c = 1;
  for (const x of v) { const t = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((t >>> i) & 1) c ^= G[i]; }
  return c >>> 0;
}
const hrpExpand = h => [...[...h].map(c => c.charCodeAt(0) >> 5), 0, ...[...h].map(c => c.charCodeAt(0) & 31)];
function convert(data, from, to, pad) {
  let acc = 0, bits = 0; const out = [], max = (1 << to) - 1;
  for (const v of data) { acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & max); } }
  if (pad && bits) out.push((acc << (to - bits)) & max);
  else if (!pad && (bits >= from || ((acc << (to - bits)) & max))) throw new Error('bad padding');
  return out;
}
export function bech32Encode(hrp, bytes) {
  const d = convert(bytes, 8, 5, true), p = polymod([...hrpExpand(hrp), ...d, 0, 0, 0, 0, 0, 0]) ^ 1;
  return `${hrp}1${[...d, ...Array.from({ length: 6 }, (_, i) => (p >> (5 * (5 - i))) & 31)].map(x => B32[x]).join('')}`;
}
export function bech32Decode(s) {
  const str = String(s).toLowerCase(), i = str.lastIndexOf('1');
  if (i < 1 || str.length - i < 7) throw new Error('not bech32');
  const hrp = str.slice(0, i), d = [...str.slice(i + 1)].map(c => B32.indexOf(c));
  if (d.includes(-1) || polymod([...hrpExpand(hrp), ...d]) !== 1) throw new Error('bad bech32 checksum');
  return { hrp, bytes: new Uint8Array(convert(d.slice(0, -6), 5, 8, false)) };
}
/** CIP-30 hex address → bech32. Header nibble 0–7 are base/enterprise/pointer addresses; network id is the low nibble. */
export function cardanoAddress(hex) {
  const b = fromHex(hex);
  if (!b.length) throw new Error('empty address');
  return bech32Encode((b[0] & 0x0f) === 1 ? 'addr' : 'addr_test', b);
}

// ---------- BLAKE2b (RFC 7693), for Strike's short Cardano sign payload ----------
const IV = [0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n, 0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n];
const SIGMA = [[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],[11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4],[7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],
  [9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13],[2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],[12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11],[13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],
  [6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5],[10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0]];
const M64 = (1n << 64n) - 1n, rotr = (x, n) => ((x >> n) | (x << (64n - n))) & M64;
/** BLAKE2b of bytes, unkeyed, `outLen` bytes (Cardano uses 28 for BLAKE2b-224). */
export function blake2b(bytes, outLen = 32) {
  const h = IV.slice(); h[0] ^= 0x01010000n ^ BigInt(outLen);
  const n = bytes.length, blocks = Math.max(1, Math.ceil(n / 128));
  for (let b = 0; b < blocks; b++) {
    const last = b === blocks - 1, m = [];
    for (let i = 0; i < 16; i++) { let w = 0n; for (let j = 7; j >= 0; j--) { const k = b * 128 + i * 8 + j; w = (w << 8n) | BigInt(k < n ? bytes[k] : 0); } m.push(w); }
    const v = [...h, ...IV];
    v[12] ^= BigInt(last ? n : (b + 1) * 128); if (last) v[14] ^= M64;
    const G = (a, b2, c, d, x, y) => {
      v[a] = (v[a] + v[b2] + x) & M64; v[d] = rotr(v[d] ^ v[a], 32n); v[c] = (v[c] + v[d]) & M64; v[b2] = rotr(v[b2] ^ v[c], 24n);
      v[a] = (v[a] + v[b2] + y) & M64; v[d] = rotr(v[d] ^ v[a], 16n); v[c] = (v[c] + v[d]) & M64; v[b2] = rotr(v[b2] ^ v[c], 63n); };
    for (let r = 0; r < 12; r++) { const s = SIGMA[r % 10];
      G(0, 4, 8, 12, m[s[0]], m[s[1]]); G(1, 5, 9, 13, m[s[2]], m[s[3]]); G(2, 6, 10, 14, m[s[4]], m[s[5]]); G(3, 7, 11, 15, m[s[6]], m[s[7]]);
      G(0, 5, 10, 15, m[s[8]], m[s[9]]); G(1, 6, 11, 12, m[s[10]], m[s[11]]); G(2, 7, 8, 13, m[s[12]], m[s[13]]); G(3, 4, 9, 14, m[s[14]], m[s[15]]); }
    for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
  }
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = Number((h[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn);
  return out;
}
/** What Strike's own app asks a Cardano wallet to sign for a message: "Strike:" + 24 hex of its BLAKE2b-224, so a Ledger can show it. */
export const strikeSignPayload = message => utf8Hex(`Strike:${toHex(blake2b(new TextEncoder().encode(message), 28)).slice(0, 24)}`);

// ---------- request signing (Strike API wallet: Ed25519 over METHOD:PATH:TS:NONCE:SHA256(body)) ----------
/** A fresh Ed25519 key pair whose private half can't be exported. */
export async function newKey({ subtle = globalThis.crypto.subtle } = {}) {
  const pair = await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  return { pair, pub: toHex(await subtle.exportKey('raw', pair.publicKey)) };
}

/** The message Strike verifies, exactly. */
export const signedMessage = (method, path, ts, nonce, bodyHash) => `${method.toUpperCase()}:${path}:${ts}:${nonce}:${bodyHash}`;

export async function authHeaders(key, method, path, body, { ts, nonce, subtle = globalThis.crypto.subtle } = {}) {
  const hash = toHex(await subtle.digest('SHA-256', new TextEncoder().encode(body)));
  const msg = signedMessage(method, path, ts, nonce, hash);
  const sig = toHex(await subtle.sign({ name: 'Ed25519' }, key.pair.privateKey, new TextEncoder().encode(msg)));
  return { 'X-API-Wallet-Public-Key': key.pub, 'X-API-Wallet-Signature': sig, 'X-API-Wallet-Timestamp': String(ts), 'X-API-Wallet-Nonce': nonce };
}

/** Signed Strike client. Clock offset from GET /v2/time so a drifting computer clock doesn't fail every call. */
export function client(key, { fetch = globalThis.fetch, now = Date.now, uuid = () => globalThis.crypto.randomUUID(), subtle } = {}) {
  let offset = null;
  const serverNow = async () => {
    if (offset == null) {
      offset = 0;
      try { const t = await (await fetch(`${STRIKE_API}/v2/time`)).json(); if (Number(t.serverTime) > 0) offset = Number(t.serverTime) - now(); } catch { /* keep 0 */ }
    }
    return now() + offset;
  };
  return async function call(method, path, bodyObj) {
    const body = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
    const ts = Math.floor((await serverNow()) / 1000) - 1; // never ahead of the server
    const headers = await authHeaders(key, method, path, body, { ts, nonce: uuid(), subtle });
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetch(STRIKE_API + path, { method, headers, body: body || undefined });
    const text = await r.text(); let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  };
}

// ---------- connect ----------
/** Installed CIP-30 wallets: [{id, name}]. */
export function cardanoWallets(win = globalThis.window) {
  const c = win?.cardano || {};
  return Object.entries(c).filter(([, w]) => w && typeof w.enable === 'function').map(([id, w]) => ({ id, name: String(w.name || id) }))
    .filter((w, i, a) => a.findIndex(x => x.name === w.name) === i);
}

const errOf = (r, fallback) => (r?.data && typeof r.data === 'object' && r.data.error) ? String(r.data.error) : fallback;

/**
 * Wallet → Strike API key. Refuses a wallet with no Strike account, because Strike would create one.
 * @param wallet CIP-30 API from window.cardano[id].enable()
 * @returns {{key, accountId, address, nickname, subs}}
 */
export async function connect(wallet, { code = BUILDER_CODE, fetch = globalThis.fetch, subtle, onStep = () => {} } = {}) {
  if (!code) throw new Error('Go live isn\'t set up on this site yet.');
  onStep('wallet');
  // Strike knows the wallet by one of its addresses; try the change address, then the used ones.
  const hexes = [await wallet.getChangeAddress(), ...((await wallet.getUsedAddresses?.().catch(() => [])) || []).slice(0, 5)];
  let addrHex = null, address = null, acct = null;
  for (const hx of [...new Set(hexes)]) {
    const a = cardanoAddress(hx), r = await accountByAddress(a, { fetch });
    if (r) { addrHex = hx; address = a; acct = r; break; }
  }
  if (!acct) throw new Error('This wallet has no Strike account. Open Strike with it first, then come back.');
  const key = await newKey({ subtle });
  const post = (path, body) => fetch(STRIKE_API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => null) }));
  const ch = await post('/auth/builder/request-signature', { address, chain: 'cardano', code, fee_share_bps: FEE_BPS, public_key: key.pub });
  if (!ch.ok || !ch.data?.nonce) throw new Error(errOf(ch, 'Strike didn\'t start the connection. Try again.'));
  onStep('sign');
  let sig;
  try { sig = await wallet.signData(addrHex, strikeSignPayload(ch.data.message_to_sign)); }
  catch (e) { throw new Error(`The wallet didn't sign (${e?.info || e?.message || 'declined'}), so nothing was connected`); }
  onStep('verify');
  const v = await post('/auth/builder/verify-signature', { nonce: ch.data.nonce, wallet_signature: `${sig.signature}:${sig.key}` });
  if (!v.ok || !v.data?.account_id) throw new Error(errOf(v, 'Strike didn\'t accept the signature.'));
  if (v.data.account_id !== acct.accountId) throw new Error('Strike connected a different account from this wallet\'s. Stopped before changing anything.');
  if (Number(v.data.fee_share_bps) !== FEE_BPS) throw new Error('Strike recorded a builder fee. Stopped before changing anything.');
  const full = await accountById(acct.accountId, { fetch });
  return { key, accountId: acct.accountId, address, nickname: acct.nickname, subs: full?.subs || acct.subs };
}

// ---------- plan ----------
const maxLev = m => Math.max(1, Math.floor(Math.max(...m.tiers.map(t => t[1]))));
const str = n => String(Number(n));

/**
 * Paper settings → the exact calls, in order. Leverage and margin mode are per market on Strike and lock when a
 * market's first position opens, so they go first; excluded markets are left alone.
 * @returns {{error?: string, steps?: {kind, label, method, path, body}[], capped?: string[]}}
 */
export function plan(s, lead, mk, subId = null) {
  if (s.mode === 'fm' && s.amount < MIN_ENTRY) return { error: `Strike's minimum margin per entry is $${MIN_ENTRY}. Raise it, then try again.` };
  if (s.mode === 'fr' && s.amount < MIN_COPY) return { error: `Strike's minimum copy amount is $${MIN_COPY}. Raise it, then try again.` };
  if (!/^0x[0-9a-f]{40}$/i.test(lead)) return { error: 'This paper copy\'s wallet isn\'t a Hyperliquid address.' };
  const sub = subId ? { sub_account_id: subId } : {};
  const ex = new Set(s.excluded), steps = [], capped = [];
  for (const sym of Object.keys(mk).filter(x => !ex.has(x)).sort()) {
    const lev = Math.min(s.lev, maxLev(mk[sym]));
    if (lev < s.lev) capped.push(`${sym.replace(/-USD$/, '')} ${lev}x`);
    steps.push({ kind: 'mode', sym, method: 'POST', path: '/v2/marginMode', body: { symbol: sym, marginMode: s.marginMode, ...sub } });
    steps.push({ kind: 'lev', sym, method: 'POST', path: '/v2/leverage', body: { symbol: sym, leverage: lev, ...sub } });
  }
  const body = { lead_account_id: lead.toLowerCase(), platform: 'hyperliquid', copy_mode: s.mode === 'fm' ? 'fixed_amount' : 'fixed_ratio',
    ...(s.mode === 'fm' ? { margin_per_entry_order: str(s.amount) } : { copy_amount: str(s.amount) }),
    ...(s.cap ? { max_margin_per_symbol: str(s.cap) } : {}), ...(s.excluded.length ? { excluded_symbols: [...s.excluded] } : {}),
    copy_existing_positions: false, ...sub };
  steps.push({ kind: 'subscribe', method: 'POST', path: '/v2/copy/subscribe', body });
  // The total cap isn't a subscribe field; Strike's app sets it with an edit that resends both caps.
  if (s.tcap) steps.push({ kind: 'tcap', method: 'PATCH', path: '/v2/copy/subscribe/{id}', body: { max_margin_per_symbol: str(s.cap || 0), max_margin_total: str(s.tcap), ...sub } });
  return { steps, capped };
}

/** Markets with an open position on this account: their margin mode can't change, and their leverage stays put. */
export async function openMarkets(call, subId) {
  const r = await call('GET', `/v2/positions${subId ? `?sub_account_id=${encodeURIComponent(subId)}` : ''}`);
  if (!r.ok) throw new Error(errOf(r, 'Couldn\'t read this account\'s positions.'));
  const list = Array.isArray(r.data) ? r.data : r.data?.positions || [];
  return [...new Set(list.filter(p => Number(p.size) !== 0).map(p => p.symbol))];
}

/**
 * Send the plan. Stops before subscribing if any market's settings failed (a copy there would open at the wrong
 * leverage). Markets in `skip` (open positions) aren't touched.
 * @returns {{ok: boolean, subscriptionId?: string, error?: string, failed: string[]}}
 */
export async function execute(call, p, { skip = [], onStep = () => {}, pause = 120 } = {}) {
  const failed = [], sk = new Set(skip); let id = null, done = 0;
  const settings = p.steps.filter(x => x.kind === 'mode' || x.kind === 'lev');
  for (const st of p.steps) {
    if ((st.kind === 'mode' || st.kind === 'lev') && sk.has(st.sym)) { done++; continue; }
    if (st.kind === 'subscribe') {
      if (failed.length) return { ok: false, failed, error: `Strike didn't take the settings for ${[...new Set(failed)].join(', ')}, so the copy wasn't started.` };
      onStep({ step: 'subscribe' });
      const r = await call(st.method, st.path, st.body);
      id = r.data?.subscription_id;
      if (!r.ok || !id) return { ok: false, failed, error: errOf(r, 'Strike didn\'t start the copy.') };
      continue;
    }
    if (st.kind === 'tcap') {
      onStep({ step: 'tcap' });
      const r = await call(st.method, st.path.replace('{id}', encodeURIComponent(id)), st.body);
      if (!r.ok) return { ok: true, subscriptionId: id, failed, error: `The copy started, but the total cap wasn't set (${errOf(r, `HTTP ${r.status}`)}). Set it in Strike's copy settings.` };
      continue;
    }
    onStep({ step: 'settings', done: ++done, of: settings.length });
    const r = await call(st.method, st.path, st.body);
    if (!r.ok) failed.push(st.sym.replace(/-USD$/, ''));
    if (pause) await new Promise(res => setTimeout(res, pause));
  }
  return { ok: true, subscriptionId: id, failed };
}

/** Read the new subscription back from Strike. */
export async function readBack(call, id, subId) {
  const r = await call('GET', `/v2/copy/subscriptions${subId ? `?sub_account_id=${encodeURIComponent(subId)}` : ''}`);
  const list = Array.isArray(r.data) ? r.data : r.data?.subscriptions || [];
  return list.find(x => x.subscription_id === id) || null;
}
