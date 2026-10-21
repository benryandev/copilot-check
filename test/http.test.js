import test from 'node:test'; import assert from 'node:assert/strict';
import { hlInfo, HlBusyError, strikeGet } from '../core/http.js';
const seq = replies => { let i = 0; return async () => ({ ok: true, status: 200, text: async () => replies[i++] }); };
test('retries null and junk', async () => assert.deepEqual(await hlInfo({ type: 'x' }, { want: Array, waits: [0, 0, 0], fetch: seq(['null', '<html>', '[1]']) }), [1]));
test('throws HlBusyError after retries', async () => assert.rejects(hlInfo({ type: 'x' }, { waits: [0, 0], fetch: seq(['null', 'null']) }), HlBusyError));
test('wrong type rejected', async () => assert.rejects(hlInfo({ type: 'x' }, { want: Array, waits: [0], fetch: seq(['{}']) }), HlBusyError));
test('strikeGet returns {} after failures', async () => assert.deepEqual(await strikeGet('/x', { tries: 2, pause: 0, fetch: seq(['oops', 'null']) }), {}));
