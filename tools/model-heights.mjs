#!/usr/bin/env node
// Prints the height of every landmark glb, one line each: `<shape> <metres>`. Paste the numbers into HEIGHT in
// ecosystem/js/content.js when a model changes; qa/model-heights-unit.mjs fails until the table matches.
//   node tools/model-heights.mjs
import { glbHeight, TRANSLATED } from './lib/glb-height.mjs';

// The MODELS map in build.js, copied: build.js needs a DOM, this tool runs in Node.
const FILE = { hq: 'hq.glb', exchange: 'exchange.glb', slpvault: 'slp-vault.glb', coinstack: 'coin-stack.glb', bridgegate: 'bridge-gate.glb', terminal: 'terminal.glb', observatory: 'observatory.glb', townhall: 'town-hall.glb', rotunda: 'rotunda.glb', gatehouse: 'gatehouse.glb', kiosk: 'kiosk.glb', twin: 'twin.glb', cluster: 'cluster.glb', pillar: 'pillar.glb', dome: 'dome.glb', tower: 'tower.glb', antenna: 'antenna.glb', grid: 'grid.glb', coins: 'coins.glb', vault: 'vault.glb', arch: 'arch.glb', cliff: 'cliff.glb', shop: 'shop.glb', plot: 'plot.glb', slpengine: 'slp-engine.glb', stake: 'stake.glb', plinth: 'chart-plinth.glb', stacks: 'collateral-stacks.glb', beacon: 'beacon.glb', obelisk: 'feed-obelisk.glb', pylons: 'three-pylons.glb', compass: 'compass.glb' };
const models = new URL('../ecosystem/models/', import.meta.url);
for (const [shape, file] of Object.entries(FILE)) console.log(`${shape} ${glbHeight(new URL(file, models), { translations: TRANSLATED.has(file) }).toFixed(1)}`);
