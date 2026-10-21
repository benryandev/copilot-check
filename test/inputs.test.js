import test from 'node:test'; import assert from 'node:assert/strict';
import { parseInputs, parseFee, errorText } from '../src/app.js';
import { HlBusyError } from '../core/http.js';
const A = '0x' + 'a'.repeat(40);
test('accepts messy hex', () => assert.deepEqual(parseInputs('  0xAB7FB756330E3983E676F44C03DABDA9120AA273/ ', '1000'), { ok: true, addr: '0xab7fb756330e3983e676f44c03dabda9120aa273', size: 1000 }));
test('accepts a pasted explorer URL', () => assert.equal(parseInputs(`https://app.hyperliquid.xyz/explorer/address/${A}`, '').addr, A));
for (const bad of ['addr1qxy…', 'vitalik.eth', '0x' + 'a'.repeat(39), '', '0x' + 'g'.repeat(40), '0x' + 'a'.repeat(41)])
  test(`rejects ${bad || '(blank)'}`, () => assert.equal(parseInputs(bad, '1000').field, 'addr'));
for (const s of ['0', '-5', 'abc', '1e12', '9', '1000001', 'NaN', '1,000,000.5'])
  test(`rejects size ${s}`, () => assert.match(parseInputs(A, s).message, /\$10.*\$1,000,000/));
test('blank size defaults to 1000; $ and commas allowed', () => { assert.equal(parseInputs(A, '').size, 1000); assert.equal(parseInputs(A, '$2,500').size, 2500); });
test('fee', () => { assert.equal(parseFee('0.05'), 0.0005); assert.equal(parseFee('0.035%'), 0.00035); assert.equal(parseFee('9'), 0.0005); assert.equal(parseFee('x'), 0.0005); });
test('error text', () => { assert.match(errorText(new HlBusyError('x')), /busy/); assert.match(errorText(new TypeError('Failed to fetch')), /connection/); });
