// Height of a glTF binary from its JSON chunk: the span of every mesh's POSITION accessor bounds on y. No node
// transforms are applied: the landmark models are exported at world scale, which qa/model-heights-unit.mjs relies on.
import { readFileSync } from 'node:fs';

export function glbHeight(path) {
  const b = readFileSync(path);
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  let lo = Infinity, hi = -Infinity;
  for (const m of j.meshes) for (const p of m.primitives) {
    const a = j.accessors[p.attributes.POSITION];
    lo = Math.min(lo, a.min[1]); hi = Math.max(hi, a.max[1]);
  }
  return hi - lo;
}
