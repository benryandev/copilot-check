// Emotes (no three.js): node --test qa/emote-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { EMOTES, EMOTE_MS, emoteKey, bubblePose } from '../ecosystem/js/emote-math.js';

test('five emotes, in the agreed order', () => {
  assert.deepEqual(EMOTES.map((e) => e.char), ['👋', '🎉', '🔥', '🏁', '👍']);
  assert.ok(EMOTES.every((e) => typeof e.label === 'string' && e.label.length > 0));
  assert.equal(EMOTE_MS, 3000);
});

test('emoteKey: digits 1 to 5 on the row or the pad pick one; anything else does not', () => {
  assert.equal(emoteKey('Digit1'), 0); assert.equal(emoteKey('Digit5'), 4); assert.equal(emoteKey('Numpad3'), 2);
  assert.equal(emoteKey('Digit6'), -1); assert.equal(emoteKey('Digit0'), -1); assert.equal(emoteKey('KeyE'), -1); assert.equal(emoteKey(undefined), -1);
});

test('bubblePose: pops in with a little overshoot, holds, fades at the end, then is gone', () => {
  const p0 = bubblePose(0); assert.ok(p0.scale < 0.3 && p0.alpha > 0, 'starts small');
  const peak = bubblePose(110); assert.ok(peak.scale > 1.05 && peak.scale < 1.3, `overshoot ${peak.scale}`);
  const hold = bubblePose(1500); assert.ok(Math.abs(hold.scale - 1) < 0.01 && hold.alpha === 1, 'held');
  const fade = bubblePose(EMOTE_MS - 100); assert.ok(fade.alpha > 0 && fade.alpha < 0.5, `fading ${fade.alpha}`);
  assert.equal(bubblePose(EMOTE_MS), null); assert.equal(bubblePose(EMOTE_MS + 50), null);
  assert.deepEqual(bubblePose(-10), bubblePose(0), 'a clock skew before the start reads as the start');
});
