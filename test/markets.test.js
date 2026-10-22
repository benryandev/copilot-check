import test from 'node:test'; import assert from 'node:assert/strict';
import { buildMarkets, hlMap, tier } from '../core/markets.js';
const strike = {
  'BTC-USD': { status: 'trading', base_asset: 'BTC', order_min_notional: '10', margin_tiers: [{ max_notional: '1000000', max_leverage: '40', maintenance_margin_rate: '0.0125', maintenance_amount: '0' }] },
  'SKHYNIX-USD': { status: 'trading', base_asset: 'SKHYNIX', order_min_notional: '10', margin_tiers: [] },
  'NIGHT-USD': { status: 'trading', base_asset: 'NIGHT' },
  'OLD-USD': { status: 'delisted', base_asset: 'OLD' } };
const mk = buildMarkets(strike, new Set(['BTC']), new Set(['xyz:SKHX', 'xyz:SKHY']));
test('aliases and xyz', () => { assert.equal(mk['SKHYNIX-USD'].hl, 'xyz:SKHX'); assert.equal(mk['NIGHT-USD'].hl, null); assert.ok(!mk['OLD-USD']); });
test('hlMap skips unmapped', () => assert.deepEqual(hlMap(mk), { BTC: 'BTC-USD', 'xyz:SKHX': 'SKHYNIX-USD' }));
test('tier default and maint', () => { assert.deepEqual(tier(mk['SKHYNIX-USD'], 1000), [10, 25]); assert.deepEqual(tier(mk['BTC-USD'], 2000), [40, 25]); });

// 22 Oct 2026: a lead's io:DRAM fill was copied to DRAM-USD, so twins on other builder dexes count too.
test('twins on other builder dexes: alt coins, hlMap both ways, altDexes', async () => {
  const { coinsOf, altDexes } = await import('../core/markets.js');
  const s = { 'DRAM-USD': { status: 'trading', base_asset: 'DRAM' }, 'XAG-USD': { status: 'trading', base_asset: 'XAG' }, 'BTC-USD': { status: 'trading', base_asset: 'BTC' } };
  const m = buildMarkets(s, new Set(['BTC']), new Set(['xyz:DRAM', 'xyz:SILVER']), { io: new Set(['io:DRAM']), para: new Set(['para:SILVER', 'para:BTC']), km: new Set(['km:OTHER']) });
  assert.equal(m['DRAM-USD'].hl, 'xyz:DRAM'); assert.deepEqual(m['DRAM-USD'].alt, ['io:DRAM']);
  assert.deepEqual(m['XAG-USD'].alt, ['para:SILVER']); assert.deepEqual(m['BTC-USD'].alt, ['para:BTC']);
  assert.deepEqual(coinsOf(m['DRAM-USD']), ['xyz:DRAM', 'io:DRAM']);
  const map = hlMap(m); assert.equal(map['io:DRAM'], 'DRAM-USD'); assert.equal(map['xyz:DRAM'], 'DRAM-USD');
  assert.deepEqual(altDexes(m), ['io', 'para']);
  assert.deepEqual(buildMarkets(s, new Set(['BTC']), new Set(['xyz:DRAM']))['DRAM-USD'].alt, []); // old 3-argument call unchanged
});
