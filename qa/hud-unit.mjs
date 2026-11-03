// The HUD's footer state (no three.js): node --test qa/hud-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { FOOT, footStep } from '../ecosystem/js/hud-math.js';
const run = (st, speed, secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) st = footStep(st, speed, dt); return st; };

test('footStep hides after a quarter second of driving and shows after a second and a half still', () => {
  assert.deepEqual(FOOT, { hideSpeed: 2, hideAfter: 0.25, showSpeed: 0.5, showAfter: 1.5 });
  let st = { driving: false, t: 0 };
  st = run(st, 6, 0.2); assert.equal(st.driving, false, 'not yet');
  st = run(st, 6, 0.1); assert.equal(st.driving, true, 'driving');
  st = run(st, 0, 1.4); assert.equal(st.driving, true, 'still waiting');
  st = run(st, 0, 0.2); assert.equal(st.driving, false, 'back');
});
test('footStep ignores a short burst', () => { let st = run({ driving: false, t: 0 }, 6, 0.15); st = run(st, 0, 0.5); assert.equal(st.driving, false); assert.equal(st.t, 0); });
test('a slow roll keeps the footer and reverse counts as driving', () => {
  assert.equal(run({ driving: false, t: 0 }, 1.5, 3).driving, false, 'under hideSpeed');
  assert.equal(run({ driving: false, t: 0 }, -6, 0.3).driving, true, 'reversing');
  assert.equal(run({ driving: true, t: 0 }, 1, 3).driving, true, 'a slow roll is not still');
});
