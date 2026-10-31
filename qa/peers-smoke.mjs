// Two browsers in the same room: A appears in B's world, moves, teleports (snaps), is kicked (B sees it go; A reads
// Offline and recovers). Needs the site on http://localhost:8766 (PORT=8766 node qa/serve.mjs) and the room on
// ws://localhost:8787 (cd ~/Dev/copilot-watch && pnpm run dev:world; admin token "test").
// Usage: node qa/peers-smoke.mjs [siteBase] [wsUrl] [adminHttpBase]
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8766';
const wsUrl = process.argv[3] || 'ws://localhost:8787/ws';
const admin = process.argv[4] || 'http://localhost:8787';
const token = process.env.RACE_ADMIN_TOKEN || 'test';
const fail = (m) => { console.log(`FAIL peers smoke: ${m}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 520 } });
  await ctx.addInitScript((n) => localStorage.setItem('eco-race-name', JSON.stringify(n)), name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [${name}] page error`, String(e).split('\n')[0]));
  await page.goto(`${base}/ecosystem/?ws=${encodeURIComponent(wsUrl)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
  await page.click('#start');
  return page;
}
const state = (page) => page.evaluate(() => window.__eco.peersState());
const chip = (page) => page.evaluate(() => { const c = document.getElementById('peers-chip'); return c.hidden ? '(hidden)' : c.querySelector('.chip-long').textContent; });
async function until(fn, what, ms = 6000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) { fail(`${what} (waited ${ms} ms)`); }
    await sleep(150);
  }
}
// Move a page's own car a few metres sideways without the physics (software rendering runs a frame or two a second
// here, so holding the throttle is no measure of distance); the next pose goes out within a second
async function drive(page, metres = 5) {
  await page.evaluate((m) => { window.__eco.car.s.x += m; }, metres);
}
// Position of a peer's car in a page: the tagged group at the peer's interpolated pose. Exposed via peers state + scene.
const peerPos = (page, name) => page.evaluate((n) => {
  const p = window.__eco.peersState().peers.find((q) => q.name === n);
  if (!p) return null;
  const tagged = window.__eco.scene.children.filter((g) => g.type === 'Group' && g.children.some((k) => k.type === 'Sprite'));
  // one remote car per peer; with a single peer in this test the first tagged group is theirs
  const g = tagged[0];
  return g ? { x: g.position.x, z: g.position.z, visible: g.visible, district: p.district } : null;
}, name);

try {
  const a = await open('Smoke A');
  await until(async () => (await state(a)).status === 'on', 'A never joined the room');
  const b = await open('Smoke B');
  await until(async () => (await state(b)).status === 'on', 'B never joined the room');
  await until(async () => (await state(b)).peers.some((p) => p.name === 'Smoke A'), 'B does not see Smoke A');
  await until(async () => (await chip(b)) === '2 driving', `B's chip should read "2 driving", reads "${await chip(b)}"`);
  await a.evaluate(() => window.__eco.teleport('liquidations'));
  await until(async () => { const d = (await state(b)).peers.find((p) => p.name === 'Smoke A')?.district; return d && d !== 'Just arrived' && d !== 'Strike HQ'; }, 'B never saw A arrive at Liquidations');
  const before = await until(async () => { const p = await peerPos(b, 'Smoke A'); return p && p.visible ? p : null; }, "A's car never drawn in B");
  // Drive A forward a few metres; B's copy of A must move
  await drive(a);
  const after = await until(async () => { const p = await peerPos(b, 'Smoke A'); return p && Math.hypot(p.x - before.x, p.z - before.z) > 3 ? p : null; }, "A's car did not move > 3 m in B's world");
  // A reads a sheet for longer than the 15 s "gone" window, then drives on: B must still see A move (the roster survives
  // a quiet spell and the 1 Hz heartbeat runs while the game is paused behind a sheet)
  await a.click('#open-map');
  await sleep(16500);
  await a.evaluate(() => document.querySelector('#map [data-close]').click());
  const parked = await peerPos(b, 'Smoke A');
  const fromX = parked ? parked.x : after.x, fromZ = parked ? parked.z : after.z;
  await drive(a);
  const resumed = await until(async () => { const p = await peerPos(b, 'Smoke A'); return p && Math.hypot(p.x - fromX, p.z - fromZ) > 3 ? p : null; }, "after A sat in a sheet for 16 s, B no longer sees A move");
  Object.assign(after, resumed);
  // Teleport A far away: B's copy must land there within a couple of seconds (software rendering runs a few frames
  // a second here, so this checks the jump arrives, not that it arrived in one frame; the snap itself is one line in
  // peers.js and the server's j flag is unit-tested)
  const t0 = Date.now();
  await a.evaluate(() => window.__eco.teleport('fillyard'));
  await until(async () => { const p = await peerPos(b, 'Smoke A'); return p && Math.hypot(p.x - after.x, p.z - after.z) > 50 ? p : null; }, "B's copy of A never landed at the Fill Yard after the teleport", 2500);
  console.log(`     teleport seen in B after ${Date.now() - t0} ms`);
  if (process.env.NO_KICK) { console.log('ok   peers smoke (join, see, move, teleport; kick skipped)'); await browser.close(); process.exit(0); }
  // Kick A: B sees A leave; A reads Offline then comes back
  const r = await fetch(`${admin}/kick`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-race-admin': token }, body: JSON.stringify({ name: 'Smoke A', minutes: 1 }) });
  const k = await r.json();
  if (!k.closed?.length) fail(`kick closed nobody: ${JSON.stringify(k)}`);
  await until(async () => !(await state(b)).peers.some((p) => p.name === 'Smoke A'), 'B still lists Smoke A after the kick');
  await until(async () => (await chip(a)) === 'Offline', `A's chip should read Offline after the kick, reads "${await chip(a)}"`, 4000);
  // Blocked for a minute: A stays offline (reconnects are refused), B is alone
  await until(async () => (await chip(b)) === 'Just you', `B's chip should read "Just you", reads "${await chip(b)}"`);
  console.log('ok   peers smoke');
  await browser.close();
} catch (e) {
  await browser.close().catch(() => {});
  fail(e.message);
}
