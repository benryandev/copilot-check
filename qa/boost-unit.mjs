// The jump boost rule (no three.js): node --test qa/boost-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { boostFor, boostedTop, BOOST_MULT, BOOST_CAP, BOOST_MIN_AIR } from '../ecosystem/js/boost-math.js';

test('boostFor: a clean landing on the dirt after real air earns a boost that grows with airtime, capped', () => {
  assert.equal(BOOST_MIN_AIR, 0.35);
  assert.equal(boostFor(0.2, true, false), 0, 'a hop is not a jump');
  assert.equal(boostFor(0.6, false, false), 0, 'landing on the grass: nothing');
  assert.equal(boostFor(0.6, true, true), 0, 'clipped a crate or bale in the air: nothing');
  const small = boostFor(0.4, true, false), big = boostFor(0.9, true, false);
  assert.ok(small > 0.8 && small < 1.1, `small ${small}`);
  assert.ok(big > small && big <= 1.6, `big ${big}`);
  assert.equal(boostFor(3, true, false), 1.6, 'capped at 1.6 s');
});

test('boostedTop: 1.2× the top speed, never over the cap (under the leaderboard worker\'s 30 m/s)', () => {
  assert.equal(BOOST_MULT, 1.2); assert.equal(BOOST_CAP, 28);
  assert.equal(boostedTop(24), 28);
  assert.equal(Math.round(boostedTop(19.2) * 100) / 100, 23.04);
});
