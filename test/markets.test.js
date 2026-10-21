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
