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
test('every entry carries the track name', async () => {
  const out = await generate();
  assert.equal(out['realfi-v1'].name, 'RealFi Raceway');
  for (const [id, e] of Object.entries(out)) assert.ok(typeof e.name === 'string' && e.name.length > 0, id);
});
test('the committed file is the generator output', async () => {
  assert.equal(readFileSync(file, 'utf8'), JSON.stringify(await generate(), null, 2) + '\n');
});
test("the worker's copy matches (skipped when no sibling checkout is present)", (t) => {
  const sib = findSibling(['../copilot-watch-registry/src/tracks.json', '../copilot-watch/src/tracks.json']);
  if (!sib) return t.skip('no copilot-watch checkout beside this one');
  assert.equal(readFileSync(sib, 'utf8'), readFileSync(file, 'utf8'));
});
