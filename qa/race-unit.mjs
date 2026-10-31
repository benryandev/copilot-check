// Pure parts of the race client (no three.js, no DOM): node --test qa/race-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { offerBest, retryAfterMs, recordBest, markPosted } from '../ecosystem/js/race-post.js';

test('offerBest: the device best is offered when it beats this lap and has not been posted', () => {
  assert.equal(offerBest(null, 25000), null);
  assert.equal(offerBest({ ms: 24892, splits: [1, 2] }, 24892), null, 'this lap is the best: the form posts it');
  assert.equal(offerBest({ ms: 24892, splits: [1, 2] }, 24000), null, 'this lap is faster');
  assert.deepEqual(offerBest({ ms: 24892, splits: [1, 2] }, 33645), { ms: 24892, splits: [1, 2] }, 'a slower lap: offer the best');
  assert.equal(offerBest({ ms: 24892, splits: [1, 2], posted: true }, 33645), null, 'already on the board');
  assert.equal(offerBest({ ms: 24892 }, 33645), null, 'no splits saved (an old record): nothing the worker would take');
});

test('recordBest keeps ms, splits and the trace, and only a faster lap replaces it', () => {
  const a = recordBest(null, { ms: 25000, splits: [1], trace: [[0, 0, 0, 0]] });
  assert.deepEqual(a, { ms: 25000, splits: [1], trace: [[0, 0, 0, 0]], posted: false });
  assert.equal(recordBest(a, { ms: 25100, splits: [2], trace: [] }), a, 'slower: unchanged');
  const b = recordBest(a, { ms: 24892, splits: [3], trace: [[1, 1, 1, 1]] });
  assert.equal(b.ms, 24892); assert.equal(b.posted, false);
});

test('markPosted flags the best only when the posted lap is the best', () => {
  const b = { ms: 24892, splits: [1], posted: false };
  assert.equal(markPosted(b, 25000).posted, false);
  assert.equal(markPosted(b, 24892).posted, true);
  assert.equal(markPosted(null, 24892), null);
});

test('retryAfterMs: the worker\'s wait plus a little, capped, and a floor when it says nothing', () => {
  assert.equal(retryAfterMs({ retryAfter: 7 }, null), 7500);
  assert.equal(retryAfterMs({}, '3'), 3500);
  assert.equal(retryAfterMs({}, null), 10500);
  assert.equal(retryAfterMs({ retryAfter: 900 }, null), 30500);
});
