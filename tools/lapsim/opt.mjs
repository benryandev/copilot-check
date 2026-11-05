// Hill-climb the lateral path and the throttle (a lift is throttle off over a few control points). Only a clean lap counts:
// valid and no wall hit, so a corner that needs a lift is taken with one rather than by grazing a wall.
//   node tools/lapsim/opt.mjs --track realfi --seed <ghost.json|centreline|ctrl.json> --rng 11 --iters 4000 --out out.json [--amp 0.5] [--physics file.json]
import { writeFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { makeSim, trackForCli } from "./sim.mjs";

const { values: a } = parseArgs({ options: { track: { type: "string", default: "realfi" }, seed: { type: "string" }, rng: { type: "string", default: "1" }, iters: { type: "string", default: "2000" }, out: { type: "string" }, amp: { type: "string", default: "1" }, physics: { type: "string" } } });
if (!a.seed || !a.out) { console.error("usage: opt.mjs --track realfi --seed <ghost.json|centreline|ctrl.json> --rng N --iters N --out out.json [--amp X] [--physics file.json]"); process.exit(2); }
const track = await trackForCli(a.track);
const sim = await makeSim({ track, props: "cleared", physics: a.physics ? JSON.parse(readFileSync(a.physics, "utf8")) : {} }); // bales, crates and cones cleared, as in the record holders' sessions
const { LEN } = sim;
let rs = Number(a.rng) || 1; const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const DS = 6, NC = Math.ceil(LEN / DS), LOOK = 9;
let ctrl, thr = new Array(NC).fill(1); // full throttle unless the seed line carries its own
if (a.seed === "centreline") ctrl = new Array(NC).fill(0);
else {
  const j = JSON.parse(readFileSync(a.seed, "utf8"));
  if (j.ctrl) { ctrl = j.ctrl; if (j.thr) thr = j.thr; }
  else if (j.ghost) { const gp = sim.ghostPath(j.ghost.trace); ctrl = Array.from({ length: NC }, (_, i) => gp(i * DS)); }
  else throw new Error(`${a.seed}: neither a ctrl line nor a ghost`);
}
const HIT_MS = 1000; // each wall hit scores a second, more than any graze saves, so the climb walks a hitting seed clean
if (thr.length !== ctrl.length) throw new Error(`${a.seed}: ${thr.length} throttle values for ${ctrl.length} control points`);
const evalC = (c, t) => { const r = sim.runLap(sim.pathFrom(c, DS), { look: LOOK, thrFn: sim.throttleFrom(t, DS) }); return r.valid ? r.ms + HIT_MS * r.wallHits : 1e9; };
let best = evalC(ctrl, thr), bestC = ctrl.slice(), bestT = thr.slice();
console.log(`${a.seed} seed: ${best} ms`);
const iters = Number(a.iters), AS = Number(a.amp);
let accepted = 0;
const save = (it) => writeFileSync(a.out, JSON.stringify({ ms: best, ctrl: bestC, thr: bestT, DS, look: LOOK, seedName: a.seed, it, physics: sim.physics }));
for (let it = 0; it < iters; it++) {
  const c = bestC.slice(), t = bestT.slice();
  if (rnd() < 0.25) { // a throttle move: lift over (or restore) a run of 1 to 4 control points
    const at = Math.floor(rnd() * NC), n = 1 + Math.floor(rnd() * 4), to = rnd() < 0.5 ? 0 : 1;
    for (let k = 0; k < n; k++) t[(at + k) % NC] = to;
    const v = evalC(c, t);
    if (v < best) { best = v; bestT = t; accepted++; }
    if (it % 250 === 0) { console.log(`it ${it} best ${best} accepted ${accepted}`); save(it); }
    continue;
  }
  const centre = Math.floor(rnd() * NC), w = [1, 1, 2, 3, 5, 8][Math.floor(rnd() * 6)];
  const amp = gauss() * AS * (it < iters * 0.5 ? 1.5 : 0.6);
  for (let k = -3 * w; k <= 3 * w; k++) { const i = (centre + k + NC) % NC; c[i] = Math.max(-18, Math.min(18, c[i] + amp * Math.exp(-(k * k) / (2 * w * w)))); }
  if (rnd() < 0.15) { const j = Math.floor(rnd() * NC); c[j] += gauss() * 0.8; } // plus a point tweak
  const v = evalC(c, t);
  if (v < best) { best = v; bestC = c; accepted++; }
  if (it % 250 === 0) { console.log(`it ${it} best ${best} accepted ${accepted}`); save(it); }
}
save(iters);
const fin = sim.runLap(sim.pathFrom(bestC, DS), { look: LOOK, thrFn: sim.throttleFrom(bestT, DS) });
console.log(`DONE ${a.seed}/${a.rng}: ${fin.ms} ms, ${fin.wallHits} wall hits${fin.wallHits ? " (NOT CLEAN: not a floor)" : ""}, lifting at ${bestT.filter((v) => v < 0.5).length} of ${NC} control points`);
