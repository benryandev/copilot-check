// The ?fps=1 readout: a small panel over the world with the last second's frame figures (fps-math.js), for performance
// checks on a phone, where there are no developer tools. Nothing is created without the flag. Where the browser offers
// GPU timer queries (Chrome on a desktop; Safari does not) the GPU's own time per frame is shown too. QA scripts read the
// same figures from window.__eco.fps.stats() (qa/perf-eco.mjs). The frame loop marks its sections (mark("car") after the car's
// step, and so on); the readout's last line lists them by their mean time per frame, so a slow phone shows where its frame goes.
import { frameStats, formatFps, sectionMeans, loopMs } from "./fps-math.js";

export function createFps({ renderer, tier }) {
  if (new URLSearchParams(location.search).get("fps") !== "1") return null;
  renderer.info.autoReset = false; // the counts then cover every pass of the frame (the shadow map, the bloom chain), not the last pass only
  const gl = renderer.getContext();
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const el = document.createElement("pre");
  el.className = "fps";
  el.setAttribute("aria-hidden", "true");
  el.textContent = formatFps(null, tier(), renderer.info.render);
  document.body.append(el);
  const loop = loopMs(); // the fixed loop's time, once: a few ms with a JIT, tens without
  let intervals = [], scripts = [], draws = [], gpus = [], pending = [], query = null, sums = {};
  let last = performance.now(), t0 = last, tDraw = last, lastMark = last, shownAt = last, lastStats = null;
  const mark = (name) => { const now = performance.now(); sums[name] = (sums[name] || 0) + (now - lastMark); lastMark = now; };
  return {
    begin() { t0 = performance.now(); intervals.push(t0 - last); last = t0; lastMark = t0; renderer.info.reset(); },
    mark, // the end of a section of the frame loop: its time since the last mark goes to `name`
    draw() {
      mark("hud"); // the camera, the HUD's quarter-second chores and the pads' pulse: whatever came after the last mark
      tDraw = performance.now();
      if (ext && !query) { query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); }
    },
    end() {
      const now = performance.now();
      scripts.push(now - t0); draws.push(now - tDraw);
      if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(query); query = null; }
      if (pending.length) { // a query's result lands a frame or two later; a disjoint (the GPU was interrupted) spoils the lot
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        pending = pending.filter((q) => {
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return true;
          if (!disjoint) gpus.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(q);
          return false;
        });
      }
      if (now - shownAt < 1000) return;
      const r = renderer.info.render, sections = sectionMeans(sums, intervals.length);
      lastStats = { ...frameStats(intervals, scripts, draws, gpus), tier: tier(), calls: r.calls, triangles: r.triangles, sections, loop, at: now };
      el.textContent = formatFps(lastStats, tier(), r, sections, loop);
      intervals = []; scripts = []; draws = []; gpus = []; sums = {}; shownAt = now;
    },
    stats: () => lastStats, // the last whole second's figures, or null before the first
  };
}
