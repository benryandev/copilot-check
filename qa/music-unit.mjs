// The background-music sketches (no Web Audio): node --test qa/music-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { TRACKS, eventsFor, BARS, barsOf, loopSeconds } from '../ecosystem/js/music-math.js';

test('three sketches, each a 16-bar loop with a tempo and a name', () => {
  assert.deepEqual(Object.keys(TRACKS), ['bossa', 'sprint', 'cruise']);
  for (const t of Object.values(TRACKS)) { assert.ok(t.bpm >= 110 && t.bpm <= 150, t.name); assert.ok(t.name); }
  assert.equal(BARS, 16); assert.equal(barsOf('bossa'), 16); assert.equal(barsOf('sprint'), 24, 'sprint has a third section');
  assert.ok(Math.abs(loopSeconds('sprint') - (24 * 4 * 60) / 140) < 1e-9);
});

test('eventsFor: events are in time order, inside the loop, with sane notes and lengths', () => {
  for (const key of Object.keys(TRACKS)) {
    const ev = eventsFor(key, 2); // two passes of the loop
    assert.ok(ev.length > 400, `${key}: ${ev.length} events`);
    const kinds = new Set(ev.map((e) => e.kind));
    for (const k of ['kick', 'snare', 'hat', 'bass', 'chord', 'lead']) assert.ok(kinds.has(k), `${key} has ${k}`);
    let last = -1;
    for (const e of ev) {
      assert.ok(e.t >= last - 1e-9, `${key} ordered`); last = e.t;
      assert.ok(e.t >= 0 && e.t < 2 * barsOf(key) * 4, `${key} inside two loops: ${e.t}`);
      if (e.midi != null) assert.ok(e.midi >= 28 && e.midi <= 96, `${key} midi ${e.midi}`);
      assert.ok(e.dur > 0 && e.dur <= 8, `${key} dur ${e.dur}`);
      assert.ok(e.vel > 0 && e.vel <= 1, `${key} vel ${e.vel}`);
    }
    // the second pass is the first, shifted by one loop
    const one = eventsFor(key, 1), shift = barsOf(key) * 4;
    assert.deepEqual(ev.slice(one.length).map((e) => ({ ...e, t: Math.round((e.t - shift) * 1000) / 1000 })), one.map((e) => ({ ...e, t: Math.round(e.t * 1000) / 1000 })));
  }
});

test('lead lines do not overlap themselves and stay in a singable range', () => {
  for (const key of Object.keys(TRACKS)) {
    const lead = eventsFor(key, 1).filter((e) => e.kind === 'lead');
    for (let i = 1; i < lead.length; i++) assert.ok(lead[i].t >= lead[i - 1].t + lead[i - 1].dur - 1e-9, `${key} lead overlap at ${lead[i].t}`);
    const notes = lead.map((e) => e.midi);
    assert.ok(Math.max(...notes) - Math.min(...notes) <= 24, `${key} lead range`);
  }
});
