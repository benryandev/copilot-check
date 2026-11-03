// The board zoom's camera maths (no three.js): node --test qa/focus-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { FOCUS, frameDistance, focusPose, focusBlend, nearBoard } from '../ecosystem/js/focus-math.js';
const board = { x: 100, y: 12, z: -50, fx: 0, fz: 1, w: 14, h: 10 };

test('frameDistance fits the height on a wide screen and the width on a portrait one', () => {
  assert.deepEqual(FOCUS, { in: 0.9, out: 0.6, margin: 1.15, near: 20, still: 0.5 });
  const wide = frameDistance(14, 10, 55, 1.6), tall = frameDistance(14, 10, 55, 0.46);
  assert.equal(Math.round(wide * 10) / 10, 11.0); // 5 / tan(27.5°) × 1.15
  assert.equal(Math.round(tall * 10) / 10, 33.6); // 7 / (tan(27.5°) × 0.46) × 1.15
  assert.ok(tall > wide);
});
test('frameDistance uses the width on a portrait screen', () => { assert.ok(frameDistance(14, 10, 55, 0.46) > frameDistance(10, 10, 55, 0.46)); });
test('focusPose stands in front of the board at its centre height, looking at the centre', () => {
  const p = focusPose(board, 55, 1.6);
  assert.deepEqual(p.look, { x: 100, y: 12, z: -50 });
  assert.equal(p.cam.x, 100); assert.equal(p.cam.y, 12); assert.equal(Math.round(p.cam.z * 10) / 10, -50 + 11);
});
test('focusPose frames the board in the band above a bar at the bottom of the viewport', () => {
  const aspect = 844 / 390, t = Math.tan((55 * Math.PI) / 360);
  const plain = focusPose(board, 55, aspect);
  const p = focusPose(board, 55, aspect, { inset: 60, viewH: 390 });
  // the band is 330 of 390 px, so the height term grows by 390/330 (the height governs at this aspect)
  assert.equal(Math.round((p.cam.z - board.z) * 100) / 100, Math.round(frameDistance(14, 10, 55, aspect) * (390 / 330) * 100) / 100);
  assert.ok(p.cam.y < plain.cam.y && p.look.y < plain.look.y, 'the camera and the look drop together');
  assert.equal(p.cam.y, p.look.y, 'still level');
  const d = p.cam.z - board.z;
  assert.equal(Math.round((board.y - p.look.y) * 1000) / 1000, Math.round((60 / 390) * d * t * 1000) / 1000, 'the drop centres the board in the band');
  assert.deepEqual(focusPose(board, 55, aspect, { inset: 0, viewH: 390 }), plain, 'no bar, no change');
});
test('focusBlend eases in over 0.9 s and out over 0.6 s', () => {
  assert.equal(Math.round(focusBlend(0, 0.45, true) * 100) / 100, 0.5); assert.equal(focusBlend(0.9, 1, true), 1);
  assert.equal(Math.round(focusBlend(1, 0.3, false) * 100) / 100, 0.5); assert.equal(focusBlend(0.1, 1, false), 0);
});
test('nearBoard: in front and within 20 m, never behind', () => {
  assert.ok(nearBoard({ x: 100, z: -40 }, board)); assert.ok(!nearBoard({ x: 100, z: -60 }, board), 'behind');
  assert.ok(!nearBoard({ x: 100, z: -28 }, board), '22 m away'); assert.ok(nearBoard({ x: 112, z: -40 }, board), 'off to the side, in front');
});
