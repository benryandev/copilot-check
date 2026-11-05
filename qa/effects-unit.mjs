// The fireworks: bursts open under the day sky's clouds. node --test qa/effects-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { createFireworks, FW_APEX_MIN, FW_APEX_MAX } from '../ecosystem/js/effects.js';
import { readFileSync } from 'node:fs';

// The puff texture is drawn on a canvas; a stub is enough in node (three's CanvasTexture only wraps it)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };

const CLOUD_MIN_Y = Number(/CLOUD_MIN_Y = (\d+)/.exec(readFileSync(new URL('../ecosystem/js/sky.js', import.meta.url), 'utf8'))[1]);

test('a launched firework stays under the cloud floor and the rockets climb at least 14 m', () => {
  const fw = createFireworks();
  fw.userData.launch(0, 0, 0, { rx: 1, rz: 0, count: 8 });
  const pos = fw.geometry.attributes.position, alpha = fw.geometry.attributes.aAlpha;
  let top = -Infinity, rocketTop = -Infinity, sawBurst = false;
  for (let f = 0; f < 180; f++) { // 3 s at 60 Hz
    fw.userData.step(1 / 60);
    let live = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i); if (y < -50) continue;
      top = Math.max(top, y);
      if (Math.abs(alpha.getX(i) - 0.9) < 1e-5) rocketTop = Math.max(rocketTop, y); // the rocket head is the one point drawn at alpha 0.9
      live++;
    }
    if (live > 60) sawBurst = true;
  }
  assert.ok(sawBurst, 'bursts opened within 3 s');
  assert.ok(rocketTop >= 14, `rockets reached ${rocketTop.toFixed(1)} m`);
  assert.ok(top < CLOUD_MIN_Y - 3, `highest particle ${top.toFixed(1)} m, cloud floor ${CLOUD_MIN_Y} m`);
});

test('the apex range sits under the cloud floor with room for the burst', () => {
  assert.ok(FW_APEX_MIN >= 14 && FW_APEX_MAX < CLOUD_MIN_Y - 3);
});
