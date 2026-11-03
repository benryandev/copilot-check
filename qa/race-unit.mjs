// Pure parts of the race client (no three.js, no DOM): node --test qa/race-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('celebrateOnce: one set of fireworks per record, however many ways the news arrives', async () => {
  const { celebrateOnce } = await import('../ecosystem/js/race-post.js');
  let r = celebrateOnce(null, { name: 'Aveli', ms: 24700 }, 1000);
  assert.equal(r.fire, true);
  r = celebrateOnce(r.seen, { name: 'Aveli', ms: 24700 }, 3000); // the room echoes the setter's own post
  assert.equal(r.fire, false);
  r = celebrateOnce(r.seen, { name: 'Aveli', ms: 24650 }, 4000); // a better one straight after: fire again
  assert.equal(r.fire, true);
  r = celebrateOnce(r.seen, { name: 'Aveli', ms: 24650 }, 4000 + 21_000); // the same news much later (a reconnect replay): fire
  assert.equal(r.fire, true);
});

// ---- the device token: people who share one public address each get their own row on the board (4 Nov 2026) ----

const fakeStore = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const bytes = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 17) % 256);
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

test('deviceToken: 16 random bytes as 32 hex characters, made once, kept in storage, the same on the next call', async () => {
  const { deviceToken, DEVICE_KEY } = await import('../ecosystem/js/race-post.js');
  const store = fakeStore();
  const t = deviceToken(store, bytes);
  assert.equal(t, hex(bytes(16)));
  assert.match(t, /^[0-9a-f]{32}$/);
  assert.equal(DEVICE_KEY, 'eco-device'); assert.equal(store.getItem(DEVICE_KEY), t);
  assert.equal(deviceToken(store, () => bytes(16).map((b) => b ^ 255)), t, 'a second call returns the stored token, not a new one');
});

test('deviceToken: a malformed stored value is replaced; a store that cannot keep it gives null (the worker then keys by address)', async () => {
  const { deviceToken, DEVICE_KEY } = await import('../ecosystem/js/race-post.js');
  for (const bad of ['', 'abc', 'G'.repeat(32), 'f'.repeat(31), 'f'.repeat(33), 'F'.repeat(32)]) {
    const store = fakeStore({ [DEVICE_KEY]: bad });
    assert.equal(deviceToken(store, bytes), hex(bytes(16)), JSON.stringify(bad));
  }
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(deviceToken(throwing, bytes), null);
  const forgetful = { getItem: () => null, setItem() {} }; // writes vanish (private mode): no token rather than a new one per post
  assert.equal(deviceToken(forgetful, bytes), null);
  assert.match(deviceToken(fakeStore()), /^[0-9a-f]{32}$/, 'the real random source');
});

test('race.js posts the device token with a lap and words address_full for the finish sheet', () => {
  const src = readFileSync(new URL('../ecosystem/js/race.js', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*\bdeviceToken\b[^}]*\} from "\.\/race-post\.js"/, 'imported from race-post.js');
  assert.match(src, /\w+\.device = device;/, 'the post body carries the token when the browser has one');
  const reason = src.match(/address_full:\s*"([^"]+)"/);
  assert.ok(reason, 'REASONS has address_full');
  assert.equal(reason[1], 'This network already has five names on the board.');
  assert.doesNotMatch(reason[1], /[:;–—]| - /, 'a plain sentence: no colon, semicolon or dash inside it');
});
