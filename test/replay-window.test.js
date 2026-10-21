// The page fetches 90 days once and replays the last 30 by slicing; this checks that equals Copilot's own 30-day run.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { replay, fmSize, frSize, equityFn } from '../core/replay.js';
for (const f of fs.readdirSync('test/fixtures').filter(n => n.startsWith('parity-'))) {
  const fx = JSON.parse(fs.readFileSync(`test/fixtures/${f}`, 'utf8')); const eq = equityFn(fx.equityHistory);
  const t0 = fx.windows[30].t0, orders = fx.windows[90].orders.filter(o => o.t >= t0), marks = fx.windows[90].marks.filter(m => m[0] >= t0);
  for (const e of fx.expected.filter(e => e.days === 30)) test(`${f} 30d sliced from 90d ${e.mode} ${e.lev}x`, () => {
    const r = replay({ orders, marks, start: 1000, size: e.mode === 'fm' ? fmSize(50, e.lev) : frSize(1000, eq), lev: e.lev, fee: 0.0005, mk: fx.mk });
    assert.ok(Math.abs(r.net - e.result.net) <= 5 && Math.abs(r.dd - e.result.dd) <= 5); assert.equal(r.liquidations, e.result.liquidations); assert.equal(r.taken, e.result.taken);
  });
}
