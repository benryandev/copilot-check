// Pure parts of live racing (no three.js, no DOM): node --test qa/race-live-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { gridSlot, positionLine, countdownText, clockOffset } from '../ecosystem/js/race-live-math.js';

test('gridSlot: two staggered columns 3 m apart from 14 m behind the line, host on the left', () => {
  assert.deepEqual(gridSlot(1), { back: 14, v: -1.6 });
  assert.deepEqual(gridSlot(2), { back: 14, v: 1.6 });
  assert.deepEqual(gridSlot(3), { back: 17, v: -1.6 });
  assert.deepEqual(gridSlot(4), { back: 17, v: 1.6 });
  assert.deepEqual(gridSlot(8), { back: 23, v: 1.6 });
});

test('positionLine: position of n, the gap to the car ahead when both are at the same mark, dead heats, nothing for a spectator', () => {
  const order = [
    { id: 'a', cp: 5, at: 24000, fin: true, pos: 1 },
    { id: 'b', cp: 5, at: 24080, fin: true, pos: 1 },
    { id: 'c', cp: 3, at: 15000, fin: false, pos: 3 },
    { id: 'd', cp: 3, at: 15400, fin: false, pos: 4 },
    { id: 'e', cp: 2, at: 14000, fin: false, pos: 5 },
  ];
  assert.equal(positionLine(order, 'a'), 'Dead heat · P1 of 5');
  assert.equal(positionLine(order, 'b'), 'Dead heat · P1 of 5');
  assert.equal(positionLine(order, 'c'), 'P3 of 5', 'the car ahead has finished: no comparable mark');
  assert.equal(positionLine(order, 'd'), 'P4 of 5 · +0.4 s', 'same checkpoint as the car ahead: the gap there');
  assert.equal(positionLine(order, 'e'), 'P5 of 5', 'a checkpoint behind: no gap');
  assert.equal(positionLine(order, 'zz'), null);
  assert.equal(positionLine([], 'a'), null);
  assert.equal(positionLine([{ id: 'a', cp: 0, at: null, fin: false, pos: 1 }, { id: 'b', cp: 0, at: null, fin: false, pos: 2 }], 'b'), 'P2 of 2');
  assert.equal(positionLine([{ id: 'a', cp: 5, at: 24000, fin: true, pos: 1 }, { id: 'b', cp: 5, at: 24350, fin: true, pos: 2 }], 'b'), 'P2 of 2 · +0.4 s');
});

test('countdownText: 3, 2, 1 in the three seconds before, Go for a second after, nothing otherwise', () => {
  const s = 100_000;
  assert.equal(countdownText(s, s - 3500), null);
  assert.equal(countdownText(s, s - 2500), '3');
  assert.equal(countdownText(s, s - 1500), '2');
  assert.equal(countdownText(s, s - 200), '1');
  assert.equal(countdownText(s, s + 200), 'Go');
  assert.equal(countdownText(s, s + 1500), null);
});

test('clockOffset: the median of server-minus-local estimates, half the round trip allowed for; 0 with none', () => {
  assert.equal(clockOffset([]), 0);
  // local clock reads 1000 when sent, 1100 when the pong arrives; the server said 51050 → offset ≈ 50000
  assert.equal(clockOffset([{ sentAt: 1000, receivedAt: 1100, serverNow: 51050 }]), 50000);
  const samples = [
    { sentAt: 0, receivedAt: 100, serverNow: 50050 },
    { sentAt: 1000, receivedAt: 1400, serverNow: 51800 }, // a slow one: 51800 - 1200 = 50600
    { sentAt: 2000, receivedAt: 2100, serverNow: 52040 },
  ];
  assert.equal(clockOffset(samples), 50000, 'the median ignores the slow one'); // estimates 50000, 50600, 49990 → median 50000
});
