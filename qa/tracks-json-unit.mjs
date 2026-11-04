import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from '../tools/tracks-json.mjs';
test('tracks.json is up to date and the Raceway entry matches the worker as deployed', async () => {
  const fresh = await generate();
  assert.deepEqual(JSON.parse(readFileSync('ecosystem/tracks/tracks.json', 'utf8')), fresh, 'run node tools/tracks-json.mjs');
  assert.deepEqual(fresh['realfi-v1'], { checkpoints: [211, 300, 420, 500, 550], length: 642, minMs: 22138, maxSpeed: 29, segMaxSpeed: 36, note: 'pinned to the worker constants of 1 Nov 2026 until the optimiser-derived limits are adopted' });
});
