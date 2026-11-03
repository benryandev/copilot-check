// Height of a glTF binary from its JSON chunk: the span on y of every mesh's POSITION accessor bounds.
// Two readings. The landmarks (Part A, 3 Nov 2026) are read raw, with no node transforms: the layout rule and the label
// model were tuned and approved by eye on those numbers. That reading is low for eleven of them whose animated part carries
// a node translation (the antenna renders 9.5 m, not 5.5; the observatory 11.2, not 6.0; the SLP vault 10.4, not 12.7):
// re-reading them true re-sorts Perpetuals' rows and the search then misses its own floors, so that is a Part A task,
// logged in the Strike repo. The monuments (Part B1) pivot their parts about their own origins, so their meshes are centred
// and their nodes carry the offsets: they are read with `translations: true`, which is what three.js renders.
import { readFileSync } from 'node:fs';

export const TRANSLATED = new Set(['slp-engine.glb', 'stake.glb', 'chart-plinth.glb', 'collateral-stacks.glb', 'beacon.glb']);

export function glbHeight(path, { translations = false } = {}) {
  const b = readFileSync(path);
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  const parentOf = new Map();
  j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
  const offsetY = (i) => { let y = 0; for (let k = i; k != null; k = parentOf.get(k)) y += j.nodes[k].translation?.[1] ?? 0; return y; };
  let lo = Infinity, hi = -Infinity;
  j.nodes.forEach((n, i) => {
    if (n.mesh == null) return;
    const y = translations ? offsetY(i) : 0;
    for (const p of j.meshes[n.mesh].primitives) {
      const a = j.accessors[p.attributes.POSITION];
      lo = Math.min(lo, y + a.min[1]); hi = Math.max(hi, y + a.max[1]);
    }
  });
  return hi - lo;
}
