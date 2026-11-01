// Renders the background-music sketches (ecosystem/js/music-math.js) to MP3 so they can be judged by ear.
//   node tools/music-demo.mjs [base] [--seconds=40]   → tools/out/music/<key>.mp3
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { const g = execSync('npm root -g').toString().trim(); ({ chromium } = createRequire(`${g}/`)('playwright')); }
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) || 'http://localhost:8766';
const seconds = Number(args.find((a) => a.startsWith('--seconds='))?.slice(10) || 40);
// Variants of one sketch instead of the three sketches: --variants=sprint
const variantsOf = args.find((a) => a.startsWith('--variants='))?.slice(11) || null;
const OUT = new URL('./out/music/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('page error', String(e)));
await page.goto(`${base}/ecosystem/arcade/flappy-coin/`, { waitUntil: 'domcontentloaded' });
const keys = await page.evaluate(async () => Object.keys((await import('/ecosystem/js/music-math.js')).TRACKS));
// name → [sketch key, renderSketch options]; the ramp runs the layers up from a standstill to flat out and back once
const jobs = variantsOf
  ? [[`${variantsOf}`, [variantsOf, {}]], [`${variantsOf}-pulse-lead`, [variantsOf, { lead: 'pulse' }]], [`${variantsOf}-layers-ramp`, [variantsOf, { intensity: 'ramp' }]], [`${variantsOf}-night`, [variantsOf, { night: true }]]]
  : keys.map((k) => [k, [k, {}]]);
for (const [name, [key, opts]] of jobs) {
  const { b64, peak, title, bpm } = await page.evaluate(async ([key, seconds, opts]) => {
    const { renderSketch } = await import('/ecosystem/js/music.js');
    const { TRACKS } = await import('/ecosystem/js/music-math.js');
    if (opts.intensity === 'ramp') opts.intensity = (t) => (t < seconds * 0.6 ? t / (seconds * 0.6) : 1 - (t - seconds * 0.6) / (seconds * 0.4) * 0.8);
    const buf = await renderSketch(key, seconds, 48000, opts);
    const n = buf.length, ch = 2, sr = buf.sampleRate, bytes = 44 + n * ch * 2, out = new DataView(new ArrayBuffer(bytes));
    const str = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const L = buf.getChannelData(0), R = buf.getChannelData(1); let o = 44, peak = 0;
    for (let i = 0; i < n; i++) { for (const c of [L, R]) { const v = Math.max(-1, Math.min(1, c[i])); peak = Math.max(peak, Math.abs(v)); out.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2; } }
    const u8 = new Uint8Array(out.buffer); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { b64: btoa(s), peak, title: TRACKS[key].name, bpm: TRACKS[key].bpm };
  }, [key, seconds, opts]);
  const wav = `${OUT}${name}.wav`;
  writeFileSync(wav, Buffer.from(b64, 'base64'));
  const gain = Math.min(20, -1.0 - 20 * Math.log10(Math.max(peak, 1e-4))).toFixed(1);
  execSync(`ffmpeg -y -loglevel error -i ${wav} -t ${seconds} -af "volume=${gain}dB,afade=t=out:st=${seconds - 2}:d=2" -c:a libmp3lame -b:a 192k ${OUT}${name}.mp3`);
  unlinkSync(wav);
  console.log(`${name}.mp3  ${title}${opts.night ? ' (night)' : ''}${opts.lead ? ` (${opts.lead} lead)` : ''}${opts.intensity ? ' (layers ramp)' : ''}, ${bpm} bpm, ${seconds} s, peak ${(20 * Math.log10(peak)).toFixed(1)} dB before gain ${gain} dB`);
}
await browser.close();
