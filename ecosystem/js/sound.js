// Sound, all synthesised in Web Audio (no files): the engine and the ground under the wheels follow the car; one-shot
// cues for hits, landings, pads, the race and a new #1; a quiet ambient bed. Nothing exists until unlock() runs from
// a click (the browser's autoplay rule), and nothing here throws if the page has no AudioContext.
import { engineParams, surfaceGain, chordAt, CHORD_SEC } from "./sound-math.js";

const SOUND_KEY = "eco-sound", MUSIC_KEY = "eco-music";
const read = (k, dflt) => { try { const v = localStorage.getItem(k); return v == null ? dflt : v === "on"; } catch { return dflt; } };
const write = (k, v) => { try { localStorage.setItem(k, v ? "on" : "off"); } catch {} };

export function createSound({ enabled = true } = {}) {
  let ctx = null, master = null, out = null, unlocked = false;
  let on = read(SOUND_KEY, true), music = read(MUSIC_KEY, true), night = false;
  let engine = null, roll = null, bed = null, noiseBuf = null;
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f(state()));
  const state = () => ({ on, music, ready: !!ctx });

  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  const osc = (type, freq, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; if (dest) o.connect(dest); o.start(); return o; };
  const gainNode = (v, dest) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
  const filter = (type, freq, dest, q = 1) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(dest); return f; };

  /** Create (or resume) the context. Call from a user gesture. */
  function unlock() {
    if (!enabled || typeof AudioContext === "undefined") return;
    if (!ctx) {
      ctx = new AudioContext();
      out = ctx.createDynamicsCompressor();
      out.threshold.value = -18; out.knee.value = 12; out.ratio.value = 6; out.attack.value = 0.003; out.release.value = 0.12;
      out.connect(ctx.destination);
      master = gainNode(on ? 1 : 0, out);
      buildEngine();
      buildRoll();
      if (music) buildBed();
      document.addEventListener("visibilitychange", () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); });
    }
    if (ctx.state === "suspended" && on) ctx.resume();
    if (!unlocked) { unlocked = true; emit(); } // once: later unlocks (every click and key) change nothing listeners care about
  }

  // ── The engine, in layers so it does not drone: the block (detuned saws and a sub through a soft clip and a
  // low-pass that opens with the throttle), an on-throttle exhaust pulse, combustion noise chopped at the firing
  // rate (lumpy at idle, smooth when revving), a gear whine and wind with speed, pitch wobble and drift, and
  // overrun pops when the throttle lifts at speed. Four virtual gears live in sound-math.
  function shaper() {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
    const w = ctx.createWaveShaper(); w.curve = curve; w.oversample = "2x"; return w;
  }
  function buildEngine() {
    const g = gainNode(0, master), f = filter("lowpass", 400, g, 0.9), clip = shaper(); clip.connect(f);
    const a = osc("sawtooth", 60, clip), b = osc("sawtooth", 60, clip), sub = osc("sine", 30, f);
    b.detune.value = 5;
    // Wobble (5.5 Hz, wide at idle, nearly gone at high revs) and a slow drift, both in cents on the saws
    const wob = osc("sine", 5.5, null), wobG = gainNode(12, null); wob.connect(wobG); wobG.connect(a.detune); wobG.connect(b.detune);
    const drift = osc("sine", 0.31, null), driftG = gainNode(7, null); drift.connect(driftG); driftG.connect(a.detune); driftG.connect(b.detune);
    // Exhaust pulse: a square at half the block frequency through a band-pass, heard with the throttle
    const exG = gainNode(0, master), exF = filter("bandpass", 600, exG, 1.2), ex = osc("square", 30, exF);
    // Combustion noise, amplitude-chopped at the firing rate
    const cmG = gainNode(0, master), cmF = filter("bandpass", 1400, cmG, 0.8);
    const cmSrc = ctx.createBufferSource(); cmSrc.buffer = noise(); cmSrc.loop = true; cmSrc.connect(cmF); cmSrc.start();
    const am = osc("square", 12, null), amG = gainNode(0, null); am.connect(amG); amG.connect(cmG.gain);
    // Gear whine and wind, both with road speed
    const whG = gainNode(0, master), wh = osc("sine", 500, whG);
    const wiG = gainNode(0, master), wiF = filter("bandpass", 420, wiG, 0.5);
    const wiSrc = ctx.createBufferSource(); wiSrc.buffer = noise(); wiSrc.loop = true; wiSrc.connect(wiF); wiSrc.start();
    engine = { g, f, a, b, sub, ex, exF, exG, cmG, cmF, am, amG, wh, whG, wiG, wobG, popAt: 0 };
  }
  function engineTick(now, dt, speed, throttle) {
    const e = engineParams(speed, throttle), v = Math.min(1, Math.abs(speed) / 24), load = Math.max(0, throttle);
    const k = 0.09;
    engine.a.frequency.setTargetAtTime(e.freq, now, k);
    engine.b.frequency.setTargetAtTime(e.freq, now, k);
    engine.wobG.gain.setTargetAtTime(2 + 10 * (1 - e.rpm), now, 0.2);
    engine.sub.frequency.setTargetAtTime(e.freq / 2, now, k);
    engine.f.frequency.setTargetAtTime(e.filter, now, 0.1);
    engine.g.gain.setTargetAtTime(e.gain, now, 0.08);
    engine.ex.frequency.setTargetAtTime(e.freq / 2, now, k);
    engine.exF.frequency.setTargetAtTime(480 + e.rpm * 800, now, 0.1);
    engine.exG.gain.setTargetAtTime(e.exhaust, now, 0.08);
    // Chug: deep and slow at idle, shallow and fast when revving
    const fire = 7 + e.rpm * 38, depth = 0.85 - e.rpm * 0.72, base = 0.016 + e.rpm * 0.016 + load * 0.02;
    engine.am.frequency.setTargetAtTime(fire, now, 0.1);
    engine.cmG.gain.setTargetAtTime(base * (1 - depth), now, 0.08);
    engine.amG.gain.setTargetAtTime(base * depth, now, 0.08);
    engine.cmF.frequency.setTargetAtTime(1100 + load * 900, now, 0.1);
    engine.wh.frequency.setTargetAtTime(420 + v * 1500, now, 0.1);
    engine.whG.gain.setTargetAtTime(0.004 * v * v, now, 0.1);
    engine.wiG.gain.setTargetAtTime(0.025 * v * v, now, 0.15);
    // Overrun: lifting off at speed pops and crackles, a few a second, fading as the car slows
    if (throttle <= 0 && Math.abs(speed) > 7 && ctx.currentTime - engine.popAt > 0.12 && Math.random() < dt * (3 + v * 6)) {
      engine.popAt = ctx.currentTime;
      thump({ from: 70, to: 38, dur: 0.07, gain: 0.12 + v * 0.1 });
      burst({ dur: 0.03, freq: 1500 + Math.random() * 1500, q: 1.5, gain: 0.06 });
    }
  }
  // ── The ground: band-passed noise whose level follows speed and surface, with a cobble tremolo ──
  function buildRoll() {
    const g = gainNode(0, master), f = filter("bandpass", 700, g, 0.7);
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true; src.connect(f); src.start();
    const trem = gainNode(1, g); // unused path kept simple: tremolo is applied to g.gain in tick
    roll = { g, f, src, trem, phase: 0 };
  }
  // ── The bed: a slow chord walk, three detuned saws per note, through a gently moving low-pass ──
  function buildBed() {
    const g = gainNode(0, master), f = filter("lowpass", 520, g, 0.6);
    const lfo = osc("sine", 0.07, null); const lfoGain = gainNode(90, f.frequency); lfo.connect(lfoGain);
    const voices = [];
    for (let i = 0; i < 4; i++) {
      const vg = gainNode(0, f);
      const o1 = osc("sawtooth", 130, vg), o2 = osc("sawtooth", 130, vg), o3 = osc("triangle", 130, vg);
      o1.detune.value = -6; o2.detune.value = 6;
      voices.push({ vg, oscs: [o1, o2, o3] });
    }
    bed = { g, f, voices, t: 0, chord: -1 };
    g.gain.setTargetAtTime(0.028, ctx.currentTime, 2);
  }
  function tuneBed() {
    if (!bed) return;
    const c = chordAt(bed.t, night);
    if (c.index === bed.chord) return;
    bed.chord = c.index;
    const now = ctx.currentTime;
    bed.voices.forEach((v, i) => {
      const f = c.notes[i];
      v.vg.gain.setTargetAtTime(0, now, 0.8);
      v.oscs.forEach((o) => o.frequency.setTargetAtTime(f, now + 1.2, 0.3));
      v.vg.gain.setTargetAtTime(0.09, now + 1.6, 1.2);
    });
    bed.f.frequency.setTargetAtTime(c.filter, now, 2);
  }

  /** Every frame: the car's speed (m/s), throttle (-1..1), and the surface under it ('dirt' | 'grass' | 'cobble' | 'air'). */
  function tick(dt, { speed = 0, throttle = 0, surface = "dirt" } = {}) {
    if (!ctx || !on || ctx.state !== "running") return;
    const now = ctx.currentTime;
    engineOff = false;
    engineTick(now, dt, speed, throttle);
    roll.phase += dt * (surface === "cobble" ? 22 : 0);
    const trem = surface === "cobble" ? 0.6 + 0.4 * Math.max(0, Math.sin(roll.phase)) : 1;
    roll.g.gain.setTargetAtTime(surfaceGain(surface, speed) * trem, now, 0.05);
    roll.f.frequency.setTargetAtTime(surface === "grass" ? 520 : surface === "cobble" ? 1100 : 760, now, 0.1);
    if (bed) { bed.t += dt; tuneBed(); }
  }

  /** A sheet is open and the game is paused: switch the engine and the road off (the bed plays on). tick() brings
   * them back when the game resumes. */
  let engineOff = false;
  function pauseEngine() {
    if (!ctx || !engine || engineOff) return;
    engineOff = true;
    const now = ctx.currentTime;
    for (const g of [engine.g, engine.exG, engine.cmG, engine.amG, engine.whG, engine.wiG, roll.g]) g.gain.setTargetAtTime(0, now, 0.12);
    engine.a.frequency.setTargetAtTime(48, now, 0.25); // the revs die away
    engine.b.frequency.setTargetAtTime(48, now, 0.25);
  }

  // ── One-shots ──
  function burst({ at = 0, dur = 0.12, freq = 1200, q = 0.8, gain = 0.3 } = {}) {
    const t = ctx.currentTime + at;
    const g = gainNode(0, master), f = filter("bandpass", freq, g, q);
    const src = ctx.createBufferSource(); src.buffer = noise(); src.connect(f);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function thump({ at = 0, from = 90, to = 40, dur = 0.16, gain = 0.5, type = "sine" } = {}) {
    const t = ctx.currentTime + at;
    const g = gainNode(0, master), o = osc(type, from, g);
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.stop(t + dur + 0.02);
  }
  function note(freq, { at = 0, dur = 0.25, gain = 0.12, type = "sine" } = {}) {
    const t = ctx.currentTime + at;
    const g = gainNode(0, master), o = osc(type, freq, g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.stop(t + dur + 0.02);
  }
  const live = () => ctx && on && ctx.state === "running";
  const cues = {
    /** kind 'crate' | 'bale' | 'cone', strength 0..1 (closing speed over the top speed) */
    hit(kind, strength = 0.5) {
      if (!live()) return;
      const s = Math.min(1, Math.max(0.15, strength));
      if (kind === "crate") { burst({ dur: 0.14, freq: 900, q: 0.6, gain: 0.35 * s }); thump({ from: 110, to: 45, dur: 0.18, gain: 0.5 * s }); }
      else if (kind === "bale") { burst({ dur: 0.2, freq: 380, q: 0.5, gain: 0.3 * s }); thump({ from: 70, to: 35, dur: 0.22, gain: 0.35 * s }); }
      else { burst({ dur: 0.06, freq: 2400, q: 1.2, gain: 0.25 * s }); thump({ from: 420, to: 180, dur: 0.05, gain: 0.12 * s, type: "square" }); }
    },
    land(strength = 0.5) { if (!live()) return; const s = Math.min(1, strength); thump({ from: 80, to: 32, dur: 0.2, gain: 0.45 * s }); burst({ dur: 0.1, freq: 500, q: 0.5, gain: 0.15 * s }); },
    chime() { if (!live()) return; note(659.25, { dur: 0.3, gain: 0.1 }); note(987.77, { at: 0.12, dur: 0.4, gain: 0.08 }); },
    blip() { if (!live()) return; note(880, { dur: 0.09, gain: 0.1, type: "triangle" }); },
    lapStart() { if (!live()) return; note(660, { dur: 0.1, gain: 0.1, type: "triangle" }); note(880, { at: 0.11, dur: 0.16, gain: 0.1, type: "triangle" }); },
    lapFinish() { if (!live()) return; [660, 880, 1320].forEach((f, i) => note(f, { at: i * 0.1, dur: 0.18, gain: 0.1, type: "triangle" })); },
    /** n: 3, 2, 1 beep the same; 0 is Go */
    countdown(n) { if (!live()) return; n > 0 ? note(660, { dur: 0.12, gain: 0.14, type: "square" }) : note(990, { dur: 0.45, gain: 0.14, type: "square" }); },
    clunk() { if (!live()) return; thump({ from: 140, to: 70, dur: 0.09, gain: 0.22, type: "square" }); burst({ dur: 0.05, freq: 1800, q: 1, gain: 0.08 }); },
    /** A new #1: a short fanfare, then pops and crackle as the rockets go up and burst */
    fanfare() {
      if (!live()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, { at: i * 0.11, dur: 0.5, gain: 0.11, type: "triangle" }));
      note(1046.5, { at: 0.6, dur: 1.1, gain: 0.08, type: "triangle" }); note(1318.5, { at: 0.6, dur: 1.1, gain: 0.06, type: "triangle" });
      const delays = [1.4, 1.95, 2.35, 2.9, 3.35, 4.0];
      for (const d of delays) {
        burst({ at: d, dur: 0.25, freq: 300, q: 0.4, gain: 0.35 }); thump({ at: d, from: 120, to: 40, dur: 0.3, gain: 0.3 });
        for (let k = 0; k < 7; k++) burst({ at: d + 0.1 + Math.random() * 0.9, dur: 0.03, freq: 2500 + Math.random() * 2500, q: 2, gain: 0.08 });
      }
    },
  };

  function setOn(v) {
    on = !!v; write(SOUND_KEY, on);
    if (ctx) { if (on && ctx.state === "suspended") ctx.resume(); master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05); }
    emit();
  }
  function setMusic(v) {
    music = !!v; write(MUSIC_KEY, music);
    if (ctx) { if (music && !bed) buildBed(); else if (bed) bed.g.gain.setTargetAtTime(music ? 0.028 : 0, ctx.currentTime, 0.8); }
    emit();
  }
  return { unlock, tick, pauseEngine, state, setOn, setMusic, setNight: (v) => { night = !!v; if (bed) bed.chord = -1; }, onChange: (f) => listeners.add(f), ...cues };
}
