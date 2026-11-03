// Frame-time figures for the ?fps=1 readout (no DOM, no three.js): one second of frames summarised, and the three lines
// the readout shows. Unit tests: qa/fps-unit.mjs.

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** Summarise a second of frames. `intervals` are the gaps between frames in ms, `scripts` the frame loop's own time per
 * frame (the draw call included), `draws` the draw call's share of it, `gpus` the GPU's time per frame where the browser
 * reports it (null otherwise). Null when no frame was seen. */
export function frameStats(intervals, scripts = [], draws = [], gpus = []) {
  if (!intervals.length) return null;
  return { n: intervals.length, avg: mean(intervals), worst: Math.max(...intervals), js: mean(scripts), draw: mean(draws), gpu: gpus.length ? mean(gpus) : null };
}

/** The frame loop's sections by their mean time per frame, largest first: [["crates", 18.4], ["car", 2.1], …]. `sums` are
 * the sections' total ms over the second, `n` the frames in it. */
export const sectionMeans = (sums, n) => Object.entries(sums).map(([name, ms]) => [name, n ? ms / n : 0]).sort((a, b) => b[1] - a[1]);

/** The readout: "20.0 ms avg · 33 worst · 50 fps", "js 5.0 ms (draw 3.0) · gpu 4.2 ms", "medium · 480 calls · 310K tris", then the
 * loop's sections, largest first: "crates 18.4 · car 2.1 · world 0.4 · fx 0.3 · hud 0.2". */
export function formatFps(stats, tier, render, sections = []) {
  if (!stats) return `… · ${tier}`;
  const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(Math.round(n)));
  const first = `${stats.avg.toFixed(1)} ms avg · ${Math.round(stats.worst)} worst · ${Math.round(1000 / stats.avg)} fps`;
  const second = `js ${stats.js.toFixed(1)} ms (draw ${stats.draw.toFixed(1)})${stats.gpu == null ? "" : ` · gpu ${stats.gpu.toFixed(1)} ms`}`;
  const third = `${tier} · ${render.calls} calls · ${k(render.triangles)} tris`;
  const fourth = sections.slice(0, 5).map(([name, ms]) => `${name} ${ms.toFixed(1)}`).join(" · ");
  return [first, second, third, fourth].filter(Boolean).join("\n");
}
