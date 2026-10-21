import test from 'node:test'; import assert from 'node:assert/strict';
import { parseSettings, goLiveFields, eventWords } from '../src/paper.js';
test('settings parse with caps and exclusions', () => {
  const r = parseSettings({ mode: 'fm', amount: '$50', lev: '5', marginMode: 'isolated', cap: '150', tcap: '', excluded: 'pump, zec-usd', start: '1,000' });
  assert.deepEqual(r.settings, { mode: 'fm', amount: 50, lev: 5, marginMode: 'isolated', cap: 150, tcap: 0, excluded: ['PUMP-USD', 'ZEC-USD'], start: 1000 });
});
test('settings refusals', () => {
  for (const bad of [{ amount: '0' }, { lev: '2.5' }, { lev: '30' }, { cap: '-1' }, { excluded: '<b>' }, { start: '5' }])
    assert.ok(parseSettings({ mode: 'fm', amount: '50', lev: '5', ...bad }).error, JSON.stringify(bad));
  assert.ok(parseSettings({ mode: 'fr', amount: '5', lev: '5' }).error);
});
test('go-live fields', () => {
  const f = goLiveFields({ mode: 'fr', amount: 500, lev: 3, marginMode: 'isolated', cap: 0, tcap: 400, excluded: ['PUMP-USD'] });
  assert.deepEqual(f.map(x => x[1]), ['Fixed ratio', '$500', 'None', '$400', 'PUMP', '3x isolated']);
});
test('event words', () => {
  assert.deepEqual(eventWords({ kind: 'skip', why: 'capped' }), ['Skipped: over a cap', null]);
  assert.deepEqual(eventWords({ kind: 'close', pnl: 5 }), ['Closed (part or all)', 5]);
});
