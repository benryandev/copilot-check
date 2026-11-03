// The HEIGHT table in content.js must match the glb files: node --test qa/model-heights-unit.mjs
// Regenerate the numbers with: node tools/model-heights.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { HEIGHT, heightOf } from '../ecosystem/js/content.js';
import { glbHeight, TRANSLATED } from '../tools/lib/glb-height.mjs';

const FILE = { hq: 'hq.glb', exchange: 'exchange.glb', slpvault: 'slp-vault.glb', coinstack: 'coin-stack.glb', bridgegate: 'bridge-gate.glb', terminal: 'terminal.glb', observatory: 'observatory.glb', townhall: 'town-hall.glb', rotunda: 'rotunda.glb', gatehouse: 'gatehouse.glb', kiosk: 'kiosk.glb', twin: 'twin.glb', cluster: 'cluster.glb', pillar: 'pillar.glb', dome: 'dome.glb', tower: 'tower.glb', antenna: 'antenna.glb', grid: 'grid.glb', coins: 'coins.glb', vault: 'vault.glb', arch: 'arch.glb', cliff: 'cliff.glb', shop: 'shop.glb', plot: 'plot.glb', slpengine: 'slp-engine.glb', stake: 'stake.glb', plinth: 'chart-plinth.glb', stacks: 'collateral-stacks.glb', beacon: 'beacon.glb', obelisk: 'feed-obelisk.glb', pylons: 'three-pylons.glb', compass: 'compass.glb' };
const models = new URL('../ecosystem/models/', import.meta.url);

test('HEIGHT matches every glb within 0.15 m, and every glb has an entry', () => {
  for (const [shape, file] of Object.entries(FILE)) {
    const h = glbHeight(new URL(file, models), { translations: TRANSLATED.has(file) });
    assert.ok(Math.abs(HEIGHT[shape] - h) < 0.15, `${shape}: table ${HEIGHT[shape]}, glb ${h.toFixed(1)}`);
  }
  const known = new Set(Object.values(FILE));
  for (const f of readdirSync(models)) if (f.endsWith('.glb') && f !== 'car.glb') assert.ok(known.has(f), `${f} has no HEIGHT entry`);
});

test('primitives have heights; an unknown shape falls back to 8 m', () => {
  for (const s of ['clock', 'flag', 'cabinet', 'depot', 'pitbox']) assert.ok(HEIGHT[s] > 0, s);
  assert.equal(heightOf('no-such-shape'), 8);
});
