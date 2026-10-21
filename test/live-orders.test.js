// Live check that the JS fetch builds the same orders as Copilot's Python did for the parity fixture. Skipped unless LIVE=1.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { fetchLead } from '../core/replay.js';

test('wallet 1: JS-built orders equal the fixture orders (90 days)', { skip: process.env.LIVE !== '1', timeout: 180_000 }, async () => {
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/parity-0x838d8e13.json', import.meta.url), 'utf8'));
  const w = fx.windows[90];
  const r = await fetchLead(fx.lead, (w.now - w.t0) / 86_400_000, fx.mk, { now: w.now, maxPages: 50, maxCoins: 0 });
  assert.equal(r.nfills, w.nfills); assert.equal(r.orders.length, w.orders.length);
  r.orders.forEach((o, i) => {
    const e = w.orders[i];
    assert.equal(o.c, e.c, `order ${i} symbol`); assert.equal(o.t, e.t, `order ${i} t`);
    assert.ok(Math.abs(o.q - e.q) <= 1e-9, `order ${i} q ${o.q} vs ${e.q}`); assert.ok(Math.abs(o.sp - e.sp) <= 1e-9, `order ${i} sp`);
  });
});
