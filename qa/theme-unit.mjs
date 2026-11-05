// src/theme.js, the classic pre-paint script, run in a vm with fake globals: node --test qa/theme-unit.mjs
// The portal hold class (Task 5 review): only a fresh record for this very page marks it; any other leaves no class.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../src/theme.js', import.meta.url), 'utf8');

function run({ record, path = '/ecosystem/tracks/lagoon/', now = 100_000, storageThrows = false }) {
  const classes = new Set();
  const store = { 'eco-portal': record === undefined ? null : typeof record === 'string' ? record : JSON.stringify(record) };
  vm.runInNewContext(src, {
    localStorage: { getItem: () => 'light' },
    sessionStorage: { getItem: (k) => { if (storageThrows) throw new Error('blocked'); return store[k] ?? null; } },
    location: { hash: '', pathname: path },
    matchMedia: () => ({ matches: false }),
    document: { documentElement: { classList: { add: (c) => classes.add(c) } } },
    Date: { now: () => now },
  });
  return classes;
}

test('theme.js: is-portal only for a fresh record addressed to this page', () => {
  const fresh = { to: '/ecosystem/tracks/lagoon/', at: 90_000 };
  assert.ok(run({ record: fresh }).has('is-portal'));
  assert.ok(run({ record: { ...fresh, at: 70_000 } }).has('is-portal')); // exactly 30 s is fresh, as readPortal
  assert.ok(!run({ record: { ...fresh, at: 69_999 } }).has('is-portal')); // stale
  assert.ok(!run({ record: fresh, path: '/ecosystem/guides/liquidation/' }).has('is-portal')); // a guide page: never
  assert.ok(!run({ record: fresh, path: '/ecosystem/' }).has('is-portal')); // for another page
  assert.ok(!run({ record: '{nope' }).has('is-portal'));
  assert.ok(!run({ record: { to: '/ecosystem/tracks/lagoon/' } }).has('is-portal')); // no time
  assert.ok(!run({}).has('is-portal'));
  const blocked = run({ record: fresh, storageThrows: true });
  assert.ok(!blocked.has('is-portal') && blocked.has('light')); // storage blocked: the theme still applies
});
