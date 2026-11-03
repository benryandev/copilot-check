// The Save the board image's caption (no DOM): node --test qa/share-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { shareCaption } from '../ecosystem/js/board-share.js';

test('shareCaption names the board, the day and the site in one plain sentence', () => {
  assert.equal(shareCaption(new Date(2026, 10, 3)), 'RealFi Raceway top 10 on 3 November 2026 at strike.benryan.com.au/ecosystem');
  assert.doesNotMatch(shareCaption(), /[:;–—]/);
});
