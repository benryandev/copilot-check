// Go live panel walk-through (dev only): a fake CIP-30 wallet and a mocked Strike for every signed or auth call, so
// nothing reaches Strike's write endpoints. Shoots each step at the 8 widths, light and dark, and checks overflow.
// Usage: node qa/serve.mjs & node qa/golive.mjs [baseUrl] [--widths=375,1280]
import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(`${execSync('npm root -g').toString().trim()}/`)('playwright')); }

const args = process.argv.slice(2);
const base = (args.find(a => !a.startsWith('--')) || 'http://localhost:8080').replace(/\/$/, '');
const WIDTHS = (args.find(a => a.startsWith('--widths='))?.split('=')[1]?.split(',') || ['375', '768', '1001', '1024', '1279', '1280', '1440', '1920']).map(Number);
const TRIAL = '/paper/dmlPU88K0egpF3IdPV3Pvg?builder=qa';
// CIP-19 test address (not a real Strike user); the mocked account lookup accepts it.
const ADDR_HEX = '019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251';
const out = new URL('./shots/', import.meta.url).pathname; await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(a => {
  window.cardano = { eternl: { name: 'eternl', enable: async () => ({ getChangeAddress: async () => a, getUsedAddresses: async () => [a], signData: async () => ({ signature: 'cose', key: 'key' }) }) } };
}, ADDR_HEX);
const sent = []; let subBody = {};
await ctx.route('https://api.strikefinance.org/**', async route => {
  const r = route.request(), u = new URL(r.url()), m = r.method(), p = u.pathname;
  const json = v => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(v) });
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (p === '/v2/account') return json({ account_id: 'acc-qa', nickname: 'QA', sub_accounts: [{ account_id: 'sub-qa', name: 'Demo' }] });
  if (p.startsWith('/auth/') || m !== 'GET' || p === '/v2/positions' || p === '/v2/copy/subscriptions' || p === '/v2/time') {
    sent.push(`${m} ${p}`);
    if (p === '/auth/builder/request-signature') return json({ nonce: 'n', message_to_sign: 'Connect' });
    if (p === '/auth/builder/verify-signature') return json({ account_id: 'acc-qa', fee_share_bps: 0 });
    if (p === '/v2/time') return json({ serverTime: Date.now() });
    if (p === '/v2/positions') return json({ count: 1, positions: [{ symbol: 'BTC-USD', size: '0.01' }] });
    if (p === '/v2/copy/subscribe') { subBody = JSON.parse(r.postData() || '{}'); return json({ subscription_id: '01a1-qa', status: 'active' }); }
    if (p === '/v2/copy/subscriptions') return json({ subscriptions: [{ subscription_id: '01a1-qa', status: 'active', ...subBody }] });
    return json({});
  }
  return route.continue();
});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(base + TRIAL);
await page.waitForSelector('#live-start', { timeout: 120_000 });

let problems = 0;
async function shoot(name) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => { if (document.documentElement.classList.contains('dark') !== (t === 'dark')) document.getElementById('theme-toggle').click(); }, theme);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(200);
      const over = await page.evaluate(() => { const b = document.getElementById('live').getBoundingClientRect();
        return { page: document.documentElement.scrollWidth > innerWidth, poke: [...document.querySelectorAll('#live *')].some(e => e.getBoundingClientRect().right > innerWidth + 0.5) }; });
      const bad = over.page || over.poke; if (bad) problems++;
      await page.locator('#live').screenshot({ path: `${out}golive-${name}-${w}-${theme}.png` });
      console.log(`${bad ? 'FAIL' : 'ok  '} ${name}-${w}-${theme}${over.page ? ' page overflow' : ''}${over.poke ? ' past edge' : ''}`);
    }
  }
}
await page.locator('#live').scrollIntoViewIfNeeded();
await shoot('intro');
await page.click('#live-start'); await shoot('wallets');
await page.click('[data-w="eternl"]'); await page.waitForSelector('#live-ok'); await shoot('review');
await page.selectOption('#live-acct', 'sub-qa'); await page.waitForSelector('#live-ok');
console.log('go disabled before tick:', await page.$eval('#live-go', b => b.disabled));
await page.check('#live-ok'); await page.click('#live-go');
await page.waitForSelector('.live-done', { timeout: 60_000 }); await shoot('done');
const kinds = [...new Set(sent.map(s => s.replace(/ \/v2\/(leverage|marginMode)$/, ' settings')))];
console.log('calls:', kinds.join(', '), `(${sent.filter(s => /leverage|marginMode/.test(s)).length} settings calls)`);
if (errs.length) { problems++; console.log('console errors:', [...new Set(errs)].join(' | ')); }
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'no problems');
if (problems) process.exit(1);
