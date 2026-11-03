// The ?fps=1 readout's figures: node --test qa/fps-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { frameStats, formatFps, sectionMeans } from '../ecosystem/js/fps-math.js';

test('a second of frames: the average and worst interval, the script, draw and GPU means, nothing without frames', () => {
  const s = frameStats([16, 17, 33, 16], [4, 4, 6, 4], [2, 2, 3, 2], [5, 6]);
  assert.equal(s.n, 4); assert.equal(s.avg, 20.5); assert.equal(s.worst, 33); assert.equal(s.js, 4.5); assert.equal(s.draw, 2.25); assert.equal(s.gpu, 5.5);
  assert.equal(frameStats([16], [4], [2]).gpu, null, 'no GPU figure where the browser gives none');
  assert.equal(frameStats([]), null);
});

test('the readout: tenths for the times, whole frames per second, the GPU line only when measured, triangles in thousands', () => {
  const s = frameStats([20, 20], [5, 5], [3, 3], [4.2, 4.2]);
  assert.equal(formatFps(s, 'medium', { calls: 480, triangles: 310400 }), '20.0 ms avg · 20 worst · 50 fps\njs 5.0 ms (draw 3.0) · gpu 4.2 ms\nmedium · 480 calls · 310K tris');
  assert.equal(formatFps(frameStats([16.7], [2], [1]), 'low', { calls: 120, triangles: 9800 }).split('\n').slice(1).join('\n'), 'js 2.0 ms (draw 1.0)\nlow · 120 calls · 9.8K tris');
  assert.equal(formatFps(null, 'low', { calls: 0, triangles: 0 }), '… · low');
});

test('the sections line: means per frame, largest first, at most five', () => {
  const sections = sectionMeans({ car: 20, crates: 184, world: 4, fx: 3, hud: 2, extra: 1 }, 10);
  assert.deepEqual(sections.slice(0, 2), [['crates', 18.4], ['car', 2]]);
  assert.equal(formatFps(frameStats([20], [5], [3]), 'low', { calls: 1, triangles: 1 }, sections).split('\n')[3], 'crates 18.4 · car 2.0 · world 0.4 · fx 0.3 · hud 0.2');
  assert.deepEqual(sectionMeans({}, 0), []);
});
