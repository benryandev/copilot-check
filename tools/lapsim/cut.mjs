// The cut line: the shortest polyline through the gate windows in order (dynamic programming over window points).
// With wallsAsGates, every tyre-wall section also counts as a 4.5 m window every 6 m, so the line cannot cut through the walls.
import { wallSpots } from "../../ecosystem/js/walls-math.js";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const K = 61;
const window = (p, w) => Array.from({ length: K }, (_, k) => { const v = -w + 2 * w * k / (K - 1); return [p.x + p.rx * v, p.z + p.rz * v]; });

function shortest(seq) { // seq: windows in order, closed back to the first
  const loop = [...seq, seq[0]];
  let cost = loop[0].map(() => 0);
  const from = [];
  for (let i = 1; i < loop.length; i++) {
    const nc = loop[i].map(() => Infinity), nf = loop[i].map(() => 0);
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
      const d = cost[a] + Math.hypot(loop[i][b][0] - loop[i - 1][a][0], loop[i][b][1] - loop[i - 1][a][1]);
      if (d < nc[b]) { nc[b] = d; nf[b] = a; }
    }
    cost = nc; from.push(nf);
  }
  let b = cost.indexOf(Math.min(...cost)); const L = cost[b];
  const path = [];
  for (let i = loop.length - 1; i >= 1; i--) { path.push(loop[i][b]); b = from[i - 1][b]; }
  path.push(loop[0][b]);
  return { L, path: path.reverse() };
}

/** cutLine(track, { wallsAsGates = true }) -> { L, ratio, path }. ratio = L / track.len. */
export function cutLine(track, { wallsAsGates = true } = {}) {
  let entries = track.gates.map((g) => ({ s: g.s, p: g, w: g.w }));
  if (wallsAsGates) {
    const ss = [...new Set(wallSpots(track, 6).map((sp) => sp.s))]; // one window per 6 m, both sides share it
    entries = entries.concat(ss.map((s) => ({ s, p: track.at(s), w: 4.5 })));
    entries.sort((a, b) => a.s - b.s); // the start line (s = 0) stays first
  }
  const { L, path } = shortest(entries.map((e) => window(e.p, e.w)));
  return { L, ratio: L / track.len, path };
}

// node tools/lapsim/cut.mjs --track <realfi|lagoon|…>: the cut ratio with and without the walls counted as windows
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { trackForCli } = await import("./sim.mjs");
  const { values: a } = parseArgs({ options: { track: { type: "string", default: "realfi" } } });
  const track = await trackForCli(a.track);
  for (const wallsAsGates of [false, true]) {
    const c = cutLine(track, { wallsAsGates });
    console.log(`${track.id} cut ${wallsAsGates ? "with the walls as windows" : "gates only"}: ${c.L.toFixed(1)} m of ${track.len.toFixed(1)}, ratio ${(c.ratio * 100).toFixed(1)}%`);
  }
}
