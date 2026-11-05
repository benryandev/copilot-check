// Deep links into the world (?stop=, ?district=), no DOM: node --test qa/deeplink-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { parseDeepLink, stopUrl } from '../ecosystem/js/deeplink-math.js';

const stops = ['strike', 'slp', 'raceway', 'arcade-flappy-coin'], districts = ['hub', 'perps', 'raceway'];

test('parseDeepLink: a known stop or district, the raceway as the start line, anything else ignored', () => {
  assert.deepEqual(parseDeepLink('?stop=slp', stops, districts), { kind: 'stop', key: 'slp' });
  assert.deepEqual(parseDeepLink('?district=perps', stops, districts), { kind: 'district', key: 'perps' });
  assert.deepEqual(parseDeepLink('?stop=raceway', stops, districts), { kind: 'start', key: 'raceway' });
  assert.deepEqual(parseDeepLink('?district=raceway', stops, districts), { kind: 'start', key: 'raceway' });
  assert.deepEqual(parseDeepLink('?stop=linktree', stops, districts), { kind: null, key: null }, 'removed key: ignored');
  for (const k of ['aiken', 'dexhunter', 'migration']) assert.deepEqual(parseDeepLink(`?stop=${k}`, stops, districts), { kind: null, key: null }, `removed key ${k}: ignored`);
  assert.deepEqual(parseDeepLink('?stop=SLP', stops, districts), { kind: null, key: null }, 'case-sensitive, no match');
  assert.deepEqual(parseDeepLink('?stop=<img>', stops, districts), { kind: null, key: null }, 'junk never reaches a lookup');
  assert.deepEqual(parseDeepLink('?stop=slp&district=perps', stops, districts), { kind: 'stop', key: 'slp' }, 'stop wins');
  assert.deepEqual(parseDeepLink('?district=nowhere&stop=slp', stops, districts), { kind: 'stop', key: 'slp' });
  assert.deepEqual(parseDeepLink('?arrive=0&mp=0', stops, districts), { kind: null, key: null }, 'other flags are not links');
  assert.deepEqual(parseDeepLink('', stops, districts), { kind: null, key: null });
});

test('stopUrl builds the shareable link', () => {
  assert.equal(stopUrl('https://strike.benryan.com.au', 'slp'), 'https://strike.benryan.com.au/ecosystem/?stop=slp');
  assert.equal(stopUrl('http://localhost:8080', 'project-tamtam'), 'http://localhost:8080/ecosystem/?stop=project-tamtam');
});

test('?start=1 asks for the grid (a venue honours it; the hub reads it as the Raceway\'s start)', () => {
  assert.deepEqual(parseDeepLink('?start=1', [], []), { kind: 'start', key: 'start' });
  assert.deepEqual(parseDeepLink('?start=0', [], []), { kind: null, key: null });
  assert.deepEqual(parseDeepLink('?start=yes', [], []), { kind: null, key: null });
});
