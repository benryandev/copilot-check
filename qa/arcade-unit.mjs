// The arcade cabinet's pure parts (no three.js): node --test qa/arcade-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// ---- the device token: people who share one public address each get their own row on a cabinet's board (4 Nov 2026) ----

test('the Flappy Coin game posts the world\'s device token with a score and words address_full for its save note', () => {
  const game = new URL('../ecosystem/arcade/flappy-coin/game.js', import.meta.url), src = readFileSync(game, 'utf8');
  const has = (re, why) => assert.ok(re.test(src), why); // not assert.match: a miss would print the whole game
  // game.js is a classic script in the sandboxed frame, so it loads the helper the race page uses with a dynamic import,
  // inside a try: a browser that cannot keep a token, or a page that cannot load the helper, posts as before
  has(/try \{[^}]*\(await import\('[^']*race-post\.js'\)\)\.deviceToken\(localStorage\)[^}]*\} catch/, 'deviceToken(localStorage) from race-post.js, in a try');
  has(/if \(device\) \w+\.device = device;/, 'the post body carries the token when the browser has one');
  has(/JSON\.stringify\(payload\)/, 'and the token travels in the body that is sent');
  // the specifier, resolved from the game's own URL, is the file that makes the token (the same one the race page keeps as eco-device)
  const spec = src.match(/import\('([^']*race-post\.js)'\)/)?.[1];
  assert.ok(spec, 'the game names the helper');
  assert.match(readFileSync(new URL(spec, game), 'utf8'), /export function deviceToken\(/, `${spec} from the game's folder is the token maker`);
  const reason = src.match(/address_full:\s*'([^']+)'/);
  assert.ok(reason, 'SAVE_ERRORS has address_full');
  assert.equal(reason[1], 'This network already has five names on the board.');
  assert.doesNotMatch(reason[1], /[:;–—]| - /, 'a plain sentence: no colon, semicolon or dash inside it');
});
