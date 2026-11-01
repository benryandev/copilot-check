// The arcade cabinet's pure parts (no three.js): node --test qa/arcade-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { parseArcadeMessage, marqueeText, frameUrl } from '../ecosystem/js/arcade-math.js';

test('parseArcadeMessage: only well-formed messages from the game are taken', () => {
  assert.equal(parseArcadeMessage(null), null);
  assert.equal(parseArcadeMessage({ t: 'arcade.run' }), null, 'no game');
  assert.equal(parseArcadeMessage({ t: 'other', game: 'flappy-coin' }), null, 'unknown kind');
  assert.deepEqual(parseArcadeMessage({ t: 'arcade.close', game: 'flappy-coin' }), { t: 'close', game: 'flappy-coin' });
  assert.deepEqual(parseArcadeMessage({ t: 'arcade.run', game: 'flappy-coin', score: 120, level: 3, won: false, ms: 20000 }), { t: 'run', game: 'flappy-coin', score: 120, level: 3, won: false });
  assert.equal(parseArcadeMessage({ t: 'arcade.run', game: 'flappy-coin', score: '120', level: 3 }), null, 'score must be a number');
  const top = [{ name: 'Juno', score: 300, level: 4, won: false, at: 1 }, { name: 'x', score: 'bad' }];
  assert.deepEqual(parseArcadeMessage({ t: 'arcade.board', game: 'flappy-coin', top }), { t: 'board', game: 'flappy-coin', top: [{ name: 'Juno', score: 300, level: 4, won: false }] }, 'bad rows dropped');
  assert.deepEqual(parseArcadeMessage({ t: 'arcade.board', game: 'flappy-coin', top: 'nope' }), { t: 'board', game: 'flappy-coin', top: [] });
});

test('marqueeText: the cabinet shows the top score, or an invitation', () => {
  assert.equal(marqueeText([]), 'INSERT COIN');
  assert.equal(marqueeText(null), 'INSERT COIN');
  assert.equal(marqueeText([{ name: 'Juno', score: 300 }]), 'TOP  JUNO  300');
  assert.equal(marqueeText([{ name: 'A very long player name', score: 1234 }]), 'TOP  A VERY LONG…  1234');
});

test('frameUrl: the game lives under /ecosystem/arcade/<slug>/ and follows the world theme', () => {
  assert.equal(frameUrl('flappy-coin', true), '/ecosystem/arcade/flappy-coin/?theme=dark');
  assert.equal(frameUrl('flappy-coin', false), '/ecosystem/arcade/flappy-coin/?theme=light');
  assert.throws(() => frameUrl('../x', true));
});
