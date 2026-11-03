// The Save the board image (no DOM, stubs where a function needs one): node --test qa/share-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { shareCaption, fitFont, shareBoard } from '../ecosystem/js/board-share.js';

test('shareCaption names the board, the day and the site in one plain sentence', () => {
  assert.equal(shareCaption(new Date(2026, 10, 3)), 'RealFi Raceway top 10 on 3 November 2026 at strike.benryan.com.au/ecosystem');
  assert.doesNotMatch(shareCaption(), /[:;–—]/);
});
test('fitFont steps the caption down until it fits the band, never under the floor', () => {
  assert.equal(fitFont((px) => px * 45, 1320, 44, 24), 29, 'a 76-character mono caption, about 45 px per px of size');
  assert.equal(fitFont((px) => px * 10, 1320, 44, 24), 44, 'fits at the first size');
  assert.equal(fitFont((px) => px * 100, 1320, 44, 24), 24, 'the floor');
});
test('shareBoard shares on a touch screen only, downloads elsewhere, and reports a cancelled sheet', async () => {
  const calls = [];
  const canvas = { toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })) };
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { createElement: () => ({ click() { calls.push('download'); }, remove() {} }), body: { append() {} } } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { canShare: () => true, share: async () => { calls.push('share'); } } });
  assert.equal(await shareBoard(canvas, { share: true }), 'shared');
  assert.equal(await shareBoard(canvas, { share: false }), 'saved', 'a desktop browser with Web Share still saves');
  globalThis.navigator.share = async () => { const e = new Error('closed'); e.name = 'AbortError'; throw e; };
  assert.equal(await shareBoard(canvas, { share: true }), 'cancelled');
  globalThis.navigator.share = async () => { throw new Error('not allowed'); };
  assert.equal(await shareBoard(canvas, { share: true }), 'saved', 'any other refusal falls back to the download');
  assert.deepEqual(calls, ['share', 'download', 'download']);
});
