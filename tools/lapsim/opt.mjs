// Hill-climb the lateral path.
//   node tools/lapsim/opt.mjs --track realfi --seed <ghost.json|centreline|ctrl.json> --rng 11 --iters 4000 --out out.json [--amp 0.5]
import { writeFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { makeSim, trackForCli } from "./sim.mjs";

const { values: a } = parseArgs({ options: { track: { type: "string", default: "realfi" }, seed: { type: "string" }, rng: { type: "string", default: "1" }, iters: { type: "string", default: "2000" }, out: { type: "string" }, amp: { type: "string", default: "1" } } });
if (!a.seed || !a.out) { console.error("usage: opt.mjs --track realfi --seed <ghost.json|centreline|ctrl.json> --rng N --iters N --out out.json [--amp X]"); process.exit(2); }
const track = trackForCli(a.track);
const sim = await makeSim({ track, props: "cleared" }); // bales, crates and cones cleared, as in the record holders' sessions
const { LEN } = sim;
let rs = Number(a.rng) || 1; const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const DS = 6, NC = Math.ceil(LEN / DS), LOOK = 9;
let ctrl;
if (a.seed === "centreline") ctrl = new Array(NC).fill(0);
else {
  const j = JSON.parse(readFileSync(a.seed, "utf8"));
  if (j.ctrl) ctrl = j.ctrl;
  else if (j.ghost) { const gp = sim.ghostPath(j.ghost.trace); ctrl = Array.from({ length: NC }, (_, i) => gp(i * DS)); }
  else throw new Error(`${a.seed}: neither a ctrl line nor a ghost`);
}
const evalC = (c) => { const r = sim.runLap(sim.pathFrom(c, DS), { look: LOOK }); return r.valid ? r.ms : 1e9; };
let best = evalC(ctrl), bestC = ctrl.slice();
console.log(`${a.seed} seed: ${best} ms`);
const iters = Number(a.iters), AS = Number(a.amp);
let accepted = 0;
const save = (it) => writeFileSync(a.out, JSON.stringify({ ms: best, ctrl: bestC, DS, look: LOOK, seedName: a.seed, it }));
for (let it = 0; it < iters; it++) {
  const c = bestC.slice();
  const centre = Math.floor(rnd() * NC), w = [1, 1, 2, 3, 5, 8][Math.floor(rnd() * 6)];
  const amp = gauss() * AS * (it < iters * 0.5 ? 1.5 : 0.6);
  for (let k = -3 * w; k <= 3 * w; k++) { const i = (centre + k + NC) % NC; c[i] = Math.max(-18, Math.min(18, c[i] + amp * Math.exp(-(k * k) / (2 * w * w)))); }
  if (rnd() < 0.15) { const j = Math.floor(rnd() * NC); c[j] += gauss() * 0.8; } // plus a point tweak
  const v = evalC(c);
  if (v < best) { best = v; bestC = c; accepted++; }
  if (it % 250 === 0) { console.log(`it ${it} best ${best} accepted ${accepted}`); save(it); }
}
save(iters);
console.log(`DONE ${a.seed}/${a.rng}: ${best} ms`);
