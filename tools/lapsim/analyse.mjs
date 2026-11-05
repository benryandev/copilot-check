// Details of a line: splits, sector times against a ghost, path length, grass and air time, sensitivity to lookahead,
// frame rate, start speed and props, an SVG map, and (with --write) the track's floor and speed limits.
//   node tools/lapsim/analyse.mjs --track realfi --line out.json [--ghost ghost.json] [--svg out.svg] [--write] [--physics file.json] [--dt 60]
// --dt is the lap's step as frames per second (60 by default, the floor's convention). A track with an inlet also gets the
// jump sweep: a straight committed approach at shares of tarmac top, at 1/60 and 1/30, wet or dry; --write records it.
// The SVG is written as SVG only; render it to PNG by hand with `qlmanage -t -s 2000 -o . out.svg`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { makeSim, trackForCli } from "./sim.mjs";

const { values: a } = parseArgs({ options: { track: { type: "string", default: "realfi" }, line: { type: "string" }, ghost: { type: "string" }, svg: { type: "string" }, write: { type: "boolean", default: false }, physics: { type: "string" }, dt: { type: "string", default: "60" } } });
if (!a.line) { console.error("usage: analyse.mjs --track realfi --line out.json [--ghost ghost.json] [--svg out.svg] [--write] [--physics file.json]"); process.exit(2); }
const track = await trackForCli(a.track);
const physics = a.physics ? JSON.parse(readFileSync(a.physics, "utf8")) : {};
const cleared = await makeSim({ track, props: "cleared", physics }), placed = await makeSim({ track, props: "placed", physics });
const { LEN, gates } = cleared;
const b = JSON.parse(readFileSync(a.line, "utf8"));
const fmt = (ms) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
const path = cleared.pathFrom(b.ctrl, b.DS), thrFn = b.thr ? cleared.throttleFrom(b.thr, b.DS) : undefined; // no thr: full throttle
const DT = 1 / Number(a.dt);
if (a.write && a.dt !== "60") { console.error("--write records the floor at 1/60 (the floor's convention); drop --dt or --write"); process.exit(2); }
const r = cleared.runLap(path, { look: b.look, log: true, thrFn, dt: DT });
if (!r.valid) { console.error(`${a.line}: no valid lap (${r.reason})`); process.exit(1); }
console.log(`${a.line}: ${fmt(r.ms)} at 1/${a.dt} (stored ${b.ms}), wall hits ${r.wallHits}${r.wallHits ? " (NOT CLEAN)" : ""}`);
{ // where the line lifts: runs of throttle-off frames, as s from-to and the speed at the end of each
  const lifts = []; let cur = null;
  for (const row of r.path) { if (!row[9]) { if (!cur) cur = { from: row[1], v0: row[3] }; cur.to = row[1]; cur.v1 = row[3]; } else if (cur) { lifts.push(cur); cur = null; } }
  if (cur) lifts.push(cur);
  console.log("  lifts", lifts.length ? lifts.map((l) => `s ${l.from}-${l.to} ${l.v0.toFixed(1)}->${l.v1.toFixed(1)}`).join(", ") : "none");
}
const t0 = r.crossings.find((c) => c.i === 0 && c.fwd).t;
const splits = gates.slice(1).map((g) => Math.round((r.crossings.find((c) => c.i === g.i && c.fwd && c.t > t0).t - t0) * 1000)); splits.push(r.ms);
const seg = (v) => v.map((x, i) => x - (i ? v[i - 1] : 0));
console.log("  splits", splits.join(" "), " segs", seg(splits).join(" "));
const ghost = a.ghost ? JSON.parse(readFileSync(a.ghost, "utf8")).ghost : null;
if (ghost) {
  const real = [...ghost.splits, ghost.ms];
  console.log("  ghost", real.join(" "), " segs", seg(real).join(" "), " diff", seg(splits).map((v, i) => v - seg(real)[i]).join(" "));
}
console.log("  gate lat", r.crossings.filter((c) => c.fwd && c.t >= t0 - 1e-9).map((c) => `${c.i}:${c.lat.toFixed(1)}`).join(" "));
const P = r.path; let len = 0, prev = null;
for (const row of P) { if (prev) len += Math.hypot(row[7] - prev[0], row[8] - prev[1]); prev = [row[7], row[8]]; }
console.log(`  path ≈ ${len.toFixed(0)} m, grass ${(P.filter((p) => !p[4]).length * DT).toFixed(2)} s, air ${(P.filter((p) => p[5]).length * DT).toFixed(2)} s, boosting ${(P.filter((p) => p[6] > 0).length * DT).toFixed(2)} s, min speed ${Math.min(...P.map((p) => p[3])).toFixed(1)}, mean ${(P.reduce((s, p) => s + p[3], 0) / P.length).toFixed(2)}`);
const gp = ghost ? cleared.ghostPath(ghost.trace) : null;
if (gp) { let line = "  lat every 20 m (line / ghost): "; for (let s = 0; s < LEN; s += 20) line += `${s}:${path(s).toFixed(0)}/${gp(s).toFixed(0)} `; console.log(line); }
const show = (q) => (q.valid ? fmt(q.ms) : "X " + q.reason);
{ // per sector: time, centreline speed, min and max speed of the line
  const ends = [...gates.map((g) => g.s).slice(1), LEN], starts = [0, ...gates.map((g) => g.s).slice(1)];
  console.log("  sector  from-to     ms   cl m/s  min  max");
  seg(splits).forEach((ms, i) => {
    const rows = P.filter((p) => p[1] >= starts[i] && p[1] < ends[i]), v = rows.map((p) => p[3]);
    console.log(`  ${String(i + 1).padStart(6)}  ${String(starts[i]).padStart(3)}-${String(Math.round(ends[i])).padEnd(3)}  ${String(ms).padStart(5)}  ${((ends[i] - starts[i]) / (ms / 1000)).toFixed(1).padStart(6)}  ${Math.min(...v).toFixed(1)}  ${Math.max(...v).toFixed(1)}`);
  });
}
for (const look of [7, 8, 9, 10, 11]) process.stdout.write(`  look ${look}: ${show(cleared.runLap(path, { look, thrFn }))}  `); console.log();
for (const dt of [1 / 30, 1 / 60, 1 / 120]) process.stdout.write(`  dt 1/${Math.round(1 / dt)}: ${show(cleared.runLap(path, { look: b.look, dt, thrFn }))}  `); console.log();
for (const sp of [21, 24, 25.5]) process.stdout.write(`  start speed ${sp}: ${show(cleared.runLap(path, { look: b.look, startSpeed: sp, thrFn }))}  `); console.log();
if (placed.props.length) { const q = placed.runLap(path, { look: b.look, thrFn }); console.log(`  with props in place: ${show(q)} hits ${q.hits.map((h) => h.kind + "@" + h.s).join(",")}`); }
// The inlet sweep (R10 of plan 5): the jump alone, a straight approach at exactly share × tarmac top, at 1/60 and 1/30
const SHARES = [0.8, 0.85, 0.86, 0.87, 0.88, 0.89, 0.9, 0.92, 0.95, 1];
const inlet = track.water?.length ? {
  halfW: track.water[0].halfW, rampS: track.ramps.find((rp) => Math.abs(rp.s + rp.length - track.water[0].s) < 15)?.s ?? null,
  sweep: [1 / 60, 1 / 30].map((dt) => ({ dt: `1/${Math.round(1 / dt)}`, runs: SHARES.map((sh) => ({ share: sh, ...cleared.inletJump(sh * cleared.physics.tarmac.top, { dt }) })).map(({ dt: _, ...q }) => q) })),
} : null;
if (inlet) {
  inlet.sweep.forEach((sw) => { sw.dryFrom = sw.runs.find((q, i) => !q.wet && sw.runs.slice(i).every((x) => !x.wet))?.share ?? null; });
  console.log(`  inlet halfW ${inlet.halfW}, ramp s ${inlet.rampS}`);
  for (const sw of inlet.sweep) console.log(`    ${sw.dt}: ${sw.runs.map((q) => `${Math.round(q.share * 100)}% ${q.speed.toFixed(1)} ${q.past ?? "-"} m ${q.wet ? "wet" : "dry"}`).join(" | ")}  dry from ${sw.dryFrom}`);
  // The exit sweep (lagoon-v2): from the hairpin's exit (the first walls' end) at v0, full throttle on the car's own physics,
  // at 1/60 and 1/30; lipDist is the ramp's lip past the walls' end, wadesUpTo the highest v0 that lands wet
  if (Array.isArray(track.walls) && track.walls.length) {
    const ramp = track.ramps.find((rp) => rp.s === inlet.rampS), from = track.walls[0].to, lipS = ramp.s + ramp.length;
    const round1 = (v) => Math.round(v * 10) / 10;
    inlet.exit = { from, lipDist: round1(lipS - from), sweep: [1 / 60, 1 / 30].map((dt) => ({ dt: `1/${Math.round(1 / dt)}`, runs: [0, 5, 8, 10, 12, 15, 20, 23].map((v0) => ({ v0, ...cleared.exitJump(v0, { dt }) })) })) };
    for (const sw of inlet.exit.sweep) { const wet = sw.runs.filter((q) => q.wet).map((q) => q.v0); sw.wadesUpTo = wet.length ? Math.max(...wet) : null; }
    console.log(`  exit from s ${from}, lip ${inlet.exit.lipDist} m past it`);
    for (const sw of inlet.exit.sweep) console.log(`    ${sw.dt}: ${sw.runs.map((q) => `${q.v0} ${q.lip ?? "-"} ${q.past ?? "-"} m ${q.wet ? "wet" : "dry"}`).join(" | ")}  wades up to ${sw.wadesUpTo}`);
  }
  // the line's own jump: entry speed, landing and wet or dry at this step
  const i0 = P.findIndex((p) => p[5] && Math.abs(p[1] - track.water[0].s) < 30);
  if (i0 > 0) { let i1 = i0; while (i1 < P.length - 1 && P[i1][5]) i1++; inlet.line = { entry: P[i0 - 1][3], landS: P[i1][1] }; console.log(`    the line's jump: entry ${P[i0 - 1][3]} m/s, lands at s ${P[i1][1]}`); }
}

if (a.write) {
  // sector centreline distance / sector time, the lap's average, and the limits the race server may trust
  const ends = [...gates.map((g) => g.s).slice(1), LEN], starts = [0, ...gates.map((g) => g.s).slice(1)];
  const secSpeeds = seg(splits).map((ms, i) => (ends[i] - starts[i]) / (ms / 1000));
  const avg = LEN / (r.ms / 1000);
  const round1 = (v) => Math.round(v * 10) / 10;
  const out = { track: a.track, floorMs: r.ms, splits, limits: { maxSpeed: round1(avg * 1.08), segMaxSpeed: round1(Math.max(...secSpeeds) * 1.15) }, physics: cleared.physics, ...(inlet ? { inlet } : {}) };
  const dir = fileURLToPath(new URL("./results/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${a.track}.json`, JSON.stringify(out, null, 2) + "\n");
  console.log(`  wrote results/${a.track}.json`, JSON.stringify(out));
}

if (a.svg) {
  const pts = (f, step = 2) => { const o = []; for (let s = 0; s <= LEN; s += step) { const p = track.at(s), l = f(s); o.push([p.x + p.rx * l, p.z + p.rz * l]); } return o; };
  const edge = track.half + 0.3, all = [...pts(() => -edge), ...pts(() => edge)];
  const minX = Math.min(...all.map((p) => p[0])) - 20, maxX = Math.max(...all.map((p) => p[0])) + 20, minZ = Math.min(...all.map((p) => p[1])) - 20, maxZ = Math.max(...all.map((p) => p[1])) + 20;
  const span = Math.max(maxX - minX, maxZ - minZ), W = 1400, H = 1400, cx0 = (minX + maxX) / 2 - span / 2, cz0 = (minZ + maxZ) / 2 - span / 2;
  const X = (x) => ((x - cx0) / span * W).toFixed(1), Z = (z) => ((z - cz0) / span * H).toFixed(1);
  const poly = (v, stroke, w, dash = "") => `<polyline fill="none" stroke="${stroke}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""} points="${v.map((p) => `${X(p[0])},${Z(p[1])}`).join(" ")}"/>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#1d2a1f"/>`;
  svg += `<polygon fill="#555" points="${[...pts(() => -edge), ...pts(() => edge).reverse()].map((p) => `${X(p[0])},${Z(p[1])}`).join(" ")}"/>`;
  svg += poly(pts(() => 0), "#888", 1, "4 6");
  for (const gt of gates) svg += `<line x1="${X(gt.x - gt.rx * 7.5)}" y1="${Z(gt.z - gt.rz * 7.5)}" x2="${X(gt.x + gt.rx * 7.5)}" y2="${Z(gt.z + gt.rz * 7.5)}" stroke="#fff" stroke-width="3"/><text x="${X(gt.x + gt.rx * 11)}" y="${Z(gt.z + gt.rz * 11)}" fill="#fff" font-size="18" font-family="monospace">${gt.i === 0 ? "S/F" : "CP" + gt.i}</text>`;
  for (const rp of track.ramps ?? []) { const p = track.at(rp.s), q = track.at(rp.s + rp.length), o = rp.side * 3.1; svg += `<line x1="${X(p.x + p.rx * o)}" y1="${Z(p.z + p.rz * o)}" x2="${X(q.x + q.rx * o)}" y2="${Z(q.z + q.rz * o)}" stroke="#ffb347" stroke-width="7"/>`; }
  if (gp) svg += poly(pts(gp), "#4fb3ff", 2.5);
  svg += poly(pts(path), "#26fab0", 3);
  svg += `<text x="20" y="30" fill="#26fab0" font-size="22" font-family="monospace">line  ${fmt(r.ms)}</text>`;
  if (ghost) svg += `<text x="20" y="58" fill="#4fb3ff" font-size="22" font-family="monospace">ghost  ${fmt(ghost.ms)}</text>`;
  svg += `<text x="20" y="86" fill="#ffb347" font-size="22" font-family="monospace">ramps</text></svg>`;
  writeFileSync(a.svg, svg);
  console.log("  svg written", a.svg);
}
