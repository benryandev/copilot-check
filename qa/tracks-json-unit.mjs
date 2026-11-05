import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../tools/tracks-json.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'ecosystem/tracks/tracks.json');

// First existing sibling copy wins. WATCH_DIR overrides the default locations.
function findSibling(paths) {
  const candidates = [];
  if (process.env.WATCH_DIR) candidates.push(resolve(process.env.WATCH_DIR, 'src/tracks.json'));
  for (const p of paths) candidates.push(resolve(root, p));
  return candidates.find((p) => existsSync(p)) ?? null;
}

test('tracks.json is up to date and the Raceway entry matches the worker as deployed', async () => {
  const fresh = await generate();
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), fresh, 'run node tools/tracks-json.mjs');
  assert.deepEqual(fresh['realfi-v1'], { name: 'RealFi Raceway', checkpoints: [211, 300, 420, 500, 550], length: 642, minMs: 22138, maxSpeed: 29, segMaxSpeed: 36, note: 'pinned to the worker constants of 1 Nov 2026 until the optimiser-derived limits are adopted' });
});
test('the Lagoon is open: minMs is round(0.97 × floorMs) from its lap-simulator results, with both limits', async () => {
  const res = JSON.parse(readFileSync(resolve(root, 'tools/lapsim/results/lagoon.json'), 'utf8'));
  const e = (await generate())['lagoon-v1'];
  assert.equal(e.minMs, Math.round(0.97 * res.floorMs)); assert.equal(e.minMs, 28585);
  assert.equal(e.maxSpeed, res.limits.maxSpeed); assert.equal(e.segMaxSpeed, res.limits.segMaxSpeed);
  for (const k of ['checkpoints', 'length', 'minMs', 'maxSpeed', 'segMaxSpeed']) assert.ok(e[k] != null, k); // the worker's openTracks needs all five
});
test('every entry carries the track name', async () => {
  const out = await generate();
  assert.equal(out['realfi-v1'].name, 'RealFi Raceway');
  for (const [id, e] of Object.entries(out)) assert.ok(typeof e.name === 'string' && e.name.length > 0, id);
});
test('the committed file is the generator output', async () => {
  assert.equal(readFileSync(file, 'utf8'), JSON.stringify(await generate(), null, 2) + '\n');
});
test("the worker's copy matches (skipped when no sibling checkout is present)", (t) => {
  const sib = findSibling(['../copilot-watch-venue/src/tracks.json', '../copilot-watch-registry/src/tracks.json', '../copilot-watch/src/tracks.json']);
  if (!sib) return t.skip('no copilot-watch checkout beside this one');
  assert.equal(readFileSync(sib, 'utf8'), readFileSync(file, 'utf8'));
});
