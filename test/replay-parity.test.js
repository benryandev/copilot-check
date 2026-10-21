// Parity with Strike Copilot's Python replay (fixtures from tools/make_parity_fixture.py): net and drawdown within $5,
// liquidations, entries taken and wipe-out date equal, on 3 old wallets x 2 windows x 2 modes x 3 leverages.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { replay, fmSize, frSize, equityFn } from '../core/replay.js';

const dir = new URL('./fixtures/', import.meta.url);
for (const f of fs.readdirSync(dir).filter(n => n.startsWith('parity-'))) {
  const fx = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  const eq = equityFn(fx.equityHistory);
  for (const e of fx.expected) test(`${f} ${e.mode} ${e.lev}x ${e.days}d`, () => {
    const w = fx.windows[e.days];
    const size = e.mode === 'fm' ? fmSize(50, e.lev) : frSize(1000, eq);
    const r = replay({ orders: w.orders, marks: w.marks, start: 1000, size, lev: e.lev, fee: 0.0005, mk: fx.mk });
    assert.ok(Math.abs(r.net - e.result.net) <= 5, `net ${r.net} vs ${e.result.net}`);
    assert.ok(Math.abs(r.dd - e.result.dd) <= 5, `dd ${r.dd} vs ${e.result.dd}`);
    assert.equal(r.liquidations, e.result.liquidations); assert.equal(r.taken, e.result.taken);
    assert.equal(r.wiped, e.result.wiped);
  });
}
