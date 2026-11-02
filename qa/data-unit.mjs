import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchKlines } from '../ecosystem/js/data.js';
const ok = (body) => async () => ({ ok: true, json: async () => body });
test('fetchKlines returns closes oldest first from Strike rows', async () => {
  const rows = [[1, '1', '2', '0', '78404', '1', 2, '1', 1, '0', '0', '0'], [2, '1', '2', '0', '78758', '1', 3, '1', 1, '0', '0', '0']];
  assert.deepEqual(await fetchKlines('BTC-USD', '1h', 25, ok(rows)), [78404, 78758]);
});
test('fetchKlines is empty on a bad body or a failed fetch', async () => {
  assert.deepEqual(await fetchKlines('BTC-USD', '1h', 25, ok({ error: 'x' })), []);
  assert.deepEqual(await fetchKlines('BTC-USD', '1h', 25, async () => { throw new Error('down'); }), []);
  assert.deepEqual(await fetchKlines('BTC-USD', '1h', 25, async () => ({ ok: false, json: async () => [] })), []);
});
