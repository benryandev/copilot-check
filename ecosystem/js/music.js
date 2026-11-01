// Plays a music sketch (music-math.js) on a Web Audio context: small synth voices per part, a bus per part, a
// compressor at the end. schedule() takes a window of events, so the same code serves an OfflineAudioContext render
// (one call for the whole piece) and, later, a live player that schedules a little ahead of the clock.
import { TRACKS, eventsFor, loopSeconds } from "./music-math.js";

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createPlayer(ctx, dest, key) {
  const def = TRACKS[key];
  const spb = 60 / def.bpm; // seconds per beat
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -14; out.knee.value = 10; out.ratio.value = 4; out.attack.value = 0.004; out.release.value = 0.15;
  const trim = ctx.createGain(); trim.gain.value = 0.42; // headroom after the compressor: the world's master sits above this
  out.connect(trim); trim.connect(dest);
  const bus = (v) => { const g = ctx.createGain(); g.gain.value = v; g.connect(out); return g; };
  const buses = { drums: bus(0.8), bass: bus(0.6), chord: bus(0.4), lead: bus(0.5), arp: bus(0.22) };
  let noiseBuf = null;
  const noise = () => { if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s; };
  const env = (g, t, peak, dur, attack = 0.004) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
  const osc = (type, f, t0, t1, to) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(t0); o.stop(t1 + 0.05); return o; };
  const filt = (type, f, q, to) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; x.connect(to); return x; };
  let pulse = null;
  const pulseWave = () => { if (pulse) return pulse; const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25); } pulse = ctx.createPeriodicWave(re, im, { disableNormalization: false }); return pulse; };

  const I = {
    kick(t, v) { const g = ctx.createGain(); g.connect(buses.drums); env(g, t, 0.9 * v, 0.28); const o = osc("sine", 160, t, t + 0.3, g); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const cg = ctx.createGain(); cg.connect(buses.drums); env(cg, t, 0.25 * v, 0.03); const n = noise(); n.connect(filt("highpass", 2500, 0.7, cg)); n.start(t); n.stop(t + 0.04); },
    snare(t, v) { const g = ctx.createGain(); g.connect(buses.drums); env(g, t, 0.5 * v, 0.16); const n = noise(); n.connect(filt("bandpass", 1900, 0.8, g)); n.start(t); n.stop(t + 0.2);
      const tg = ctx.createGain(); tg.connect(buses.drums); env(tg, t, 0.3 * v, 0.08); osc("triangle", 195, t, t + 0.1, tg); },
    hat(t, v) { const g = ctx.createGain(); g.connect(buses.drums); env(g, t, 0.25 * v, 0.05); const n = noise(); n.connect(filt("highpass", 7000, 0.7, g)); n.start(t); n.stop(t + 0.07); },
    hatOpen(t, v) { const g = ctx.createGain(); g.connect(buses.drums); env(g, t, 0.22 * v, 0.3); const n = noise(); n.connect(filt("highpass", 6500, 0.7, g)); n.start(t); n.stop(t + 0.35); },
    rim(t, v) { const g = ctx.createGain(); g.connect(buses.drums); env(g, t, 0.35 * v, 0.035); osc("sine", 1750, t, t + 0.04, g); const ng = ctx.createGain(); ng.connect(buses.drums); env(ng, t, 0.15 * v, 0.02); const n = noise(); n.connect(filt("bandpass", 3200, 1.2, ng)); n.start(t); n.stop(t + 0.03); },
    shaker(t, v) { const g = ctx.createGain(); g.connect(buses.drums); env(g, t, 0.18 * v, 0.07, 0.012); const n = noise(); n.connect(filt("bandpass", 5200, 1.0, g)); n.start(t); n.stop(t + 0.09); },
    clap(t, v) { for (const d of [0, 0.012, 0.026]) { const g = ctx.createGain(); g.connect(buses.drums); env(g, t + d, 0.35 * v, 0.1); const n = noise(); n.connect(filt("bandpass", 1300, 1.1, g)); n.start(t + d); n.stop(t + d + 0.12); } },
    bass(t, m, dur, v) {
      const g = ctx.createGain(); g.connect(buses.bass); env(g, t, 0.8 * v, dur + 0.05, 0.006);
      const f = filt("lowpass", 1000, 1.1, g); f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(260, t + Math.min(0.25, dur));
      osc("sawtooth", mtof(m), t, t + dur, f); const sub = osc("square", mtof(m - 12), t, t + dur, f); sub.detune.value = 3;
    },
    chord(t, notes, dur, v) {
      const voice = def.chordVoice;
      for (const [i, m] of notes.entries()) {
        const g = ctx.createGain(); g.connect(buses.chord);
        const f0 = mtof(m), tt = t + i * 0.006;
        if (voice === "rhodes") { env(g, tt, 0.22 * v, dur + 0.25, 0.01); const f = filt("lowpass", 2200, 0.7, g); osc("sine", f0, tt, tt + dur + 0.3, f); const o = osc("triangle", f0, tt, tt + dur + 0.3, f); o.detune.value = 4; }
        else if (voice === "pad") { env(g, tt, 0.16 * v, dur + 0.2, 0.12); const f = filt("lowpass", 1400, 0.8, g); const a = osc("sawtooth", f0, tt, tt + dur + 0.3, f), b = osc("sawtooth", f0, tt, tt + dur + 0.3, f); a.detune.value = -7; b.detune.value = 7; }
        else { env(g, tt, 0.2 * v, dur + 0.08, 0.008); const f = filt("lowpass", 3000, 0.6, g); osc("sine", f0, tt, tt + dur + 0.1, f); const o2 = osc("sine", f0 * 2, tt, tt + dur + 0.1, f); o2.detune.value = 2; const o3 = osc("triangle", f0 * 3, tt, tt + dur + 0.1, f); } // organ: a few drawbars
      }
    },
    lead(t, m, dur, v) {
      const g = ctx.createGain(); g.connect(buses.lead);
      const voice = def.leadVoice, f0 = mtof(m);
      // vibrato that arrives after the note has settled
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(voice === "sax" ? 14 : 7, t + 0.18); lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + 0.2);
      if (voice === "flute") { env(g, t, 0.5 * v, dur + 0.12, 0.02); const f = filt("lowpass", 2600, 0.5, g); const o = osc("triangle", f0, t, t + dur + 0.15, f); lg.connect(o.detune); const s = osc("sine", f0, t, t + dur + 0.15, f); lg.connect(s.detune); const bg = ctx.createGain(); bg.connect(f); env(bg, t, 0.08 * v, 0.05); const n = noise(); n.connect(filt("bandpass", f0 * 2, 3, bg)); n.start(t); n.stop(t + 0.06); }
      else if (voice === "pulse") { env(g, t, 0.42 * v, dur + 0.06, 0.004); const f = filt("lowpass", 4200, 0.6, g); const o = ctx.createOscillator(); o.setPeriodicWave(pulseWave()); o.frequency.value = f0; o.connect(f); o.start(t); o.stop(t + dur + 0.1); lg.connect(o.detune); }
      else { env(g, t, 0.45 * v, dur + 0.15, 0.035); const f = filt("lowpass", 1800, 1.4, g); f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.09); const o = osc("sawtooth", f0, t, t + dur + 0.2, f); lg.connect(o.detune); const o2 = osc("square", f0 / 2, t, t + dur + 0.2, f); o2.detune.value = -3; }
    },
    arp(t, m, dur, v) { const g = ctx.createGain(); g.connect(buses.arp); env(g, t, 0.35 * v, dur, 0.003); osc("triangle", mtof(m), t, t + dur, g); },
  };

  /** Schedule events whose beat time falls in [fromBeat, toBeat), with beat 0 at `t0` seconds on the context clock. */
  function schedule(events, t0, fromBeat, toBeat) {
    for (const e of events) {
      if (e.t < fromBeat || e.t >= toBeat) continue;
      const t = t0 + e.t * spb, dur = e.dur * spb;
      if (e.kind === "chord") I.chord(t, e.notes, dur, e.vel);
      else if (e.kind === "bass" || e.kind === "lead" || e.kind === "arp") I[e.kind](t, e.midi, dur, e.vel);
      else I[e.kind]?.(t, e.vel);
    }
  }
  return { schedule, buses, def, spb };
}

/** Render `seconds` of a sketch into an OfflineAudioContext and return the AudioBuffer. */
export async function renderSketch(key, seconds, sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil((seconds + 1) * sampleRate), sampleRate);
  const p = createPlayer(ctx, ctx.destination, key);
  const loops = Math.ceil(seconds / loopSeconds(key)) + 1;
  p.schedule(eventsFor(key, loops), 0.05, 0, (seconds / p.spb));
  return ctx.startRendering();
}
