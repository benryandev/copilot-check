// Pure parts of the sound module (no AudioContext): node --test qa/sound-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { engineParams, surfaceGain, chordAt, CHORDS } from '../ecosystem/js/sound-math.js';

test('engineParams: four virtual gears, pitch climbs within a gear and drops at the shift, throttle opens and loads', () => {
  const idle = engineParams(0, 0);
  assert.ok(idle.freq >= 50 && idle.freq <= 70, `idle ${idle.freq}`);
  assert.ok(idle.gain > 0 && idle.gain < 0.08, `idle gain ${idle.gain}`);
  assert.equal(idle.gear, 1);
  // Within first gear the pitch rises with speed
  assert.ok(engineParams(3, 1).freq < engineParams(6, 1).freq);
  // Across a shift it drops, then climbs again
  const top1 = engineParams(6.9, 1), low2 = engineParams(7.1, 1);
  assert.equal(top1.gear, 1); assert.equal(low2.gear, 2);
  assert.ok(low2.freq < top1.freq - 30, `shift should drop the pitch: ${top1.freq} → ${low2.freq}`);
  assert.ok(engineParams(12, 1).freq > low2.freq);
  assert.equal(engineParams(24, 1).gear, 4);
  assert.ok(engineParams(24, 1).freq <= 220, `top ${engineParams(24, 1).freq}`);
  // rpm (0..1) is what the layers follow: near 1 at the top of any gear
  assert.ok(engineParams(6.9, 1).rpm > 0.9 && engineParams(24, 1).rpm > 0.9);
  const on = engineParams(12, 1), off = engineParams(12, 0);
  assert.ok(off.gain < on.gain && off.filter < on.filter, 'off the throttle: quieter and duller');
  assert.ok(on.exhaust > off.exhaust, 'the exhaust layer is the on-throttle voice');
  assert.equal(engineParams(-6, -1).freq, engineParams(6, 1).freq, 'reverse sounds like the same speed forward');
});

test('surfaceGain: nothing in the air or standing still, grass louder than dirt, scales with speed', () => {
  assert.equal(surfaceGain('air', 20), 0);
  assert.equal(surfaceGain('dirt', 0), 0);
  assert.ok(surfaceGain('grass', 20) > surfaceGain('dirt', 20));
  assert.ok(surfaceGain('dirt', 20) > surfaceGain('dirt', 10));
  assert.ok(surfaceGain('cobble', 20) > 0 && surfaceGain('grass', 24) <= 0.12);
});

test('chordAt: the bed walks through its chords, one every 12 s, and knows night voicings', () => {
  assert.equal(CHORDS.length >= 4, true);
  assert.deepEqual(chordAt(0).notes, CHORDS[0]);
  assert.deepEqual(chordAt(11.9).notes, CHORDS[0]);
  assert.deepEqual(chordAt(12.1).notes, CHORDS[1]);
  assert.equal(chordAt(12 * CHORDS.length + 1).index, 0, 'wraps');
  const day = chordAt(5, false), night = chordAt(5, true);
  assert.ok(night.filter < day.filter, 'night is darker');
  for (const f of day.notes) assert.ok(f > 60 && f < 400, `voiced low: ${f}`);
});
