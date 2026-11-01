// Two browsers in the local room: A waves, B sees the bubble over A's car; the room drops a third emote within a second.
// Needs the site on http://localhost:8766 and the room on ws://localhost:8787 (cd ~/Dev/copilot-watch && pnpm run dev:world).
// Usage: node qa/emote-smoke.mjs [siteBase] [wsUrl]
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8766';
const wsUrl = process.argv[3] || 'ws://localhost:8787/ws';
const fail = (m) => { console.log(`FAIL emote smoke: ${m}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.addInitScript((n) => localStorage.setItem('eco-race-name', JSON.stringify(n)), name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [${name}] page error`, String(e).split('\n')[0]));
  await page.goto(`${base}/ecosystem/?arrive=0&ws=${encodeURIComponent(wsUrl)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
  await page.click('#start');
  await page.waitForFunction(() => window.__eco.peersState().status === 'on', null, { timeout: 15000 });
  return page;
}
async function until(fn, what, ms = 8000) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) fail(`${what} (waited ${ms} ms)`); await sleep(150); }
}

try {
  const a = await open('Emote A');
  const b = await open('Emote B');
  const aId = await a.evaluate(() => window.__eco.peersState().me.id);
  await until(() => b.evaluate(() => window.__eco.peersState().peers.some((p) => p.name === 'Emote A')), 'B does not see A');
  // B must have built A's car before a bubble can sit on it: poses flow once A moves a little
  await a.evaluate(() => { window.__eco.keys.up = true; });
  await sleep(1200);
  await a.evaluate(() => { window.__eco.keys.up = false; });
  await until(() => b.evaluate((id) => !!window.__eco.peerGroup(id), aId), "B never built A's car", 20000);

  // A opens the row with E and picks the flag with the 4 key
  await a.keyboard.press('KeyE');
  if (await a.evaluate(() => document.getElementById('emote-row').hidden)) fail('E did not open the row on A');
  await a.keyboard.press('Digit4');
  if (!(await a.evaluate(() => document.getElementById('emote-row').hidden))) fail('the row stayed open after a pick');
  const mine = await a.evaluate(() => window.__eco.emote.active());
  if (!mine.some((x) => x.id === 'me' && x.e === 3)) fail(`A has no bubble of its own: ${JSON.stringify(mine)}`);
  const seen = await until(() => b.evaluate((id) => { const x = window.__eco.emote.active().find((y) => y.id === id); return x || null; }, aId), "B never saw A's flag", 6000);
  if (seen.e !== 3) fail(`B saw emote ${seen.e}, wanted 3`);
  console.log('     B sees the flag over A');

  // Bubbles go after three seconds
  await until(() => b.evaluate((id) => !window.__eco.emote.active().some((y) => y.id === id), aId), "A's bubble never went on B", 5000);

  // Rate: three in a burst, B gets two (the room drops the third)
  for (const e of [0, 1, 2]) { await a.evaluate((e) => window.__eco.emote.send(e), e); await sleep(60); }
  await sleep(800);
  const last = await b.evaluate((id) => window.__eco.emote.active().find((y) => y.id === id)?.e, aId);
  if (last !== 1) fail(`after a burst of three B shows emote ${last}; the room should have dropped the third (wanted 1)`);
  console.log('     the room dropped the third emote in a second');
  console.log('ok   emote smoke');
  await browser.close();
} catch (e) {
  await browser.close().catch(() => {});
  fail(e.message);
}
