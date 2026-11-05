// The fireworks: bursts open under the day sky's clouds. node --test qa/effects-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { createFireworks, FW_APEX_MIN, FW_APEX_MAX } from '../ecosystem/js/effects.js';
import { readFileSync } from 'node:fs';

// The puff texture is drawn on a canvas; a stub is enough in node (three's CanvasTexture only wraps it)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };

const CLOUD_MIN_Y = Number(/CLOUD_MIN_Y = (\d+)/.exec(readFileSync(new URL('../ecosystem/js/sky.js', import.meta.url), 'utf8'))[1]);

test('a launched firework stays under the cloud floor and the rockets climb at least 14 m', () => {
  const fw = createFireworks();
  fw.userData.launch(() => ({ x: 0, y: 0, z: 0, fx: 0, fz: 1, v: 0 }), { count: 8 });
  const pos = fw.geometry.attributes.position, alpha = fw.geometry.attributes.aAlpha;
  let top = -Infinity, rocketTop = -Infinity, sawBurst = false;
  for (let f = 0; f < 360; f++) { // 6 s at 60 Hz
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

test('each rocket leaves ahead of the anchor as it is at that rocket own launch moment', () => {
  const fw = createFireworks(), SPEED = 30, AHEAD = 50;
  let now = 0;
  fw.userData.launch(() => ({ x: 0, y: 0, z: SPEED * now, fx: 0, fz: 1, v: SPEED }), { count: 8, ahead: AHEAD });
  const pos = fw.geometry.attributes.position, alpha = fw.geometry.attributes.aAlpha, seen = new Map(), launches = [];
  for (let f = 0; f < 300; f++) {
    now = (f + 1) / 60;
    fw.userData.step(1 / 60);
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(alpha.getX(i) - 0.9) > 1e-5 || pos.getY(i) > 1 || pos.getY(i) < -50) continue; // a rocket head just off the ground
      const fresh = !(seen.get(i) >= f - 1); seen.set(i, f); if (!fresh) continue; // the first frame this slot holds a rocket
      launches.push({ t: now, x: pos.getX(i), z: pos.getZ(i) });
    }
  }
  assert.equal(launches.length, 8, 'eight rockets');
  assert.ok(launches.at(-1).t > 3, 'the last one leaves after 3 s');
  for (const l of launches) {
    // The burst opens AHEAD in front of the car as it is 1.2 s after the rocket peaks (about 1.7 s on), spread 14 m along the road, 30 m across
    const dz = l.z - SPEED * l.t - AHEAD - SPEED * (1.7 + 1.2);
    assert.ok(Math.abs(dz) <= 14 + 1.5, `launch at ${l.t.toFixed(2)} s is ${dz.toFixed(1)} m off its lead (anchor now ${(SPEED * l.t).toFixed(0)} m)`);
    assert.ok(Math.abs(l.x) <= 30.01);
  }
});

test('the apex range sits under the cloud floor with room for the burst', () => {
  assert.ok(FW_APEX_MIN >= 14 && FW_APEX_MAX < CLOUD_MIN_Y - 3);
});
