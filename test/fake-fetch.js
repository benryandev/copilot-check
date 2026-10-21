// A fake fetch for tests: routes Strike GETs by path prefix and Hyperliquid POSTs by body type (and dex).
import { readFileSync } from 'node:fs';
const load = v => typeof v === 'string' && v.endsWith('.json') ? readFileSync(new URL(`./fixtures/${v}`, import.meta.url), 'utf8') : typeof v === 'string' ? v : JSON.stringify(v);
export function fake(routes, calls = []) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    let key;
    if (init.method === 'POST' && init.body) { const b = JSON.parse(init.body); key = b.dex ? `${b.type}:${b.dex}` : b.type; }
    else key = Object.keys(routes).find(k => new URL(url).pathname === k || String(url).includes(k));
    let v = routes[key];
    if (typeof v === 'function') v = v(init.body ? JSON.parse(init.body) : url);
    if (typeof v === 'number') return { ok: false, status: v, text: async () => JSON.stringify({ error: 'x' }) };
    if (v === undefined) return { ok: false, status: 404, text: async () => '{"error":"not found"}' };
    return { ok: true, status: 200, text: async () => load(v) };
  };
}
