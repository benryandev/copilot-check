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
  await page.goto(`${base}/ecosystem/?arrive=0&ws=${encodeURIComponent(wsUrl)}`, { waitUntil: 'domcontentloaded' });
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

// Zones and the duplicate close, without the room: the page points at a port nobody answers, so every connect
// attempt fails fast and is counted; stand-ins are injected, then a server close is simulated through the test hook.
async function zones() {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 520 } });
  await ctx.addInitScript(() => localStorage.setItem('eco-race-name', JSON.stringify('Smoke Z')));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [Z] page error', String(e).split('\n')[0]));
  await page.goto(`${base}/ecosystem/?arrive=0&ws=${encodeURIComponent('ws://127.0.0.1:9/ws')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
  await page.click('#start');
  await page.evaluate(() => {
    const s = window.__eco.car.s;
    window.__eco.peersInject([
      { id: 'zh', name: 'Hub Peer', colour: '#3b82f6', zone: 'hub', x: s.x + 6, z: s.z, h: 0 },
      { id: 'zl', name: 'Lagoon Peer', colour: '#f97316', zone: 'lagoon-v1', x: s.x - 6, z: s.z, h: 0 },
    ]);
  });
  const st = await state(page);
  if (st.online !== 3) fail(`online should be 3 (me + 2 in any zone), is ${st.online}`);
  if (st.zones?.hub !== 2 || st.zones?.['lagoon-v1'] !== 1) fail(`zones should be { hub: 2, lagoon-v1: 1 }, are ${JSON.stringify(st.zones)}`);
  if (st.peers.find((p) => p.id === 'zl')?.zone !== 'lagoon-v1') fail('the lagoon peer has lost its zone');
  await until(async () => (await chip(page)) === '3 driving', `the chip should count everyone ("3 driving"), reads "${await chip(page)}"`);
  await until(() => page.evaluate(() => window.__eco.peerGroup('zh')?.visible === true), "the hub peer's car is never drawn", 15000);
  await sleep(1500);
  const lagoon = await page.evaluate(() => window.__eco.peerGroup('zl')?.visible ?? false);
  if (lagoon) fail("the lagoon peer's car is drawn on the hub");
  // The who's-here sheet: both listed; the lagoon row says where (the registry has no lagoon-v1 name yet: the id fallback)
  await page.click('#peers-chip');
  const rows = await until(() => page.evaluate(() => { const t = [...document.querySelectorAll('#peers-list li')].map((li) => li.textContent); return t.some((x) => x.includes('on lagoon-v1')) ? t : null; }), 'the sheet never says "on lagoon-v1"');
  const hubRow = rows.find((t) => t.startsWith('Hub Peer'));
  if (!hubRow || hubRow.includes(' on ')) fail(`the hub row (my zone) should carry no zone label: ${JSON.stringify(rows)}`);
  if (!rows.some((t) => t.startsWith('Lagoon Peer') && t.includes('on lagoon-v1'))) fail(`the lagoon row should say "on lagoon-v1": ${JSON.stringify(rows)}`);
  if (rows[0].includes(' on ')) fail(`my own row says nothing extra: ${rows[0]}`);
  await page.evaluate(() => document.querySelector('#peers [data-close]').click());
  // A duplicate close is final: status dup, the note, and no reconnect attempt in the next 5 s
  const before = await page.evaluate(() => window.__eco.peersConnects());
  await page.evaluate(() => window.__eco.peersClose(4001, 'dup'));
  if ((await state(page)).status !== 'dup') fail(`status after a dup close should be dup, is ${(await state(page)).status}`);
  const note = await page.evaluate(() => { const n = document.getElementById('peers-note'); return n.hidden ? '' : n.textContent; });
  if (note !== 'This device is driving in another tab') fail(`the note should say "This device is driving in another tab", says "${note}"`);
  await sleep(5000);
  const after = await page.evaluate(() => window.__eco.peersConnects());
  if (after !== before) fail(`a dup close reconnected (${after - before} attempts in 5 s)`);
  if ((await state(page)).status !== 'dup') fail('status left dup');
  if (!/another tab/.test(await chip(page))) fail(`the chip should say another tab, reads "${await chip(page)}"`);
  // Control: any other close reconnects as before
  await page.evaluate(() => window.__eco.peersClose(1006, ''));
  await until(() => page.evaluate((b) => window.__eco.peersConnects() > b, after), 'an ordinary close never reconnected', 35000);
  console.log('ok   peers zones (own zone drawn, everyone counted, zone names in the sheet, dup close final)');
  await ctx.close();
}

try {
  await zones();
  if (process.env.NO_ROOM) { console.log('     room part skipped (NO_ROOM)'); await browser.close(); process.exit(0); }
  const a = await open('Smoke A');
  await until(async () => (await state(a)).status === 'on', 'A never joined the room');
  const b = await open('Smoke B');
  await until(async () => (await state(b)).status === 'on', 'B never joined the room');
  await until(async () => (await state(b)).peers.some((p) => p.name === 'Smoke A'), 'B does not see Smoke A');
  // Others may be in a live room too: the chip must agree with the list, not with an exact count
  await until(async () => { const n = (await state(b)).peers.length; return n >= 1 && (await chip(b)) === `${n + 1} driving`; }, `B's chip should read "<peers+1> driving", reads "${await chip(b)}"`);
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
  // Blocked for a minute: A stays offline (reconnects are refused); B's chip agrees with its shorter list
  await until(async () => { const n = (await state(b)).peers.length; return (await chip(b)) === (n ? `${n + 1} driving` : 'Just you'); }, `B's chip disagrees with its list, reads "${await chip(b)}"`);
  console.log('ok   peers smoke');
  await browser.close();
} catch (e) {
  await browser.close().catch(() => {});
  fail(e.message);
}
