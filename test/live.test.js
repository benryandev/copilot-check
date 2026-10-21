// Read-only smoke test on the public APIs. Skipped unless LIVE=1.
import test from 'node:test'; import assert from 'node:assert/strict';
import * as strike from '../core/strike.js'; import * as hl from '../core/hl.js';
const live = { skip: process.env.LIVE !== '1' };
test('strike markets', live, async () => assert.ok(Object.keys(await strike.markets()).length >= 30));
test('hl clearinghouse', live, async () => assert.equal(typeof (await hl.clearinghouse('0x42fd5648cf21c158d15e4f58785760755b3f6623')).main, 'object'));
test('leaderboard', live, async () => assert.ok((await strike.leaderboard()).length > 50));
