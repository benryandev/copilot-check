// Two browsers race each other through the local room: A starts a race from the Who's here sheet, B sees the invite
// and joins, both sit locked on the grid until the shared Go, then report checkpoints and finishes through the test
// hook; the server's order reaches both HUDs and race.end closes it. Needs the site on http://localhost:8766
// (PORT=8766 node qa/serve.mjs) and the room on ws://localhost:8787 (cd ~/Dev/copilot-watch && pnpm run dev:world).
// Usage: node qa/race-live-smoke.mjs [siteBase] [wsUrl]
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8766';
const wsUrl = process.argv[3] || 'ws://localhost:8787/ws';
const fail = (m) => { console.log(`FAIL race live smoke: ${m}`); process.exit(1); };
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
const live = (page) => page.evaluate(() => window.__eco.raceLive());
const car = (page) => page.evaluate(() => ({ x: window.__eco.car.s.x, z: window.__eco.car.s.z }));
async function until(fn, what, ms = 8000) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) fail(`${what} (waited ${ms} ms)`); await sleep(150); }
}
// Where grid slot k is, from the page's own terrain
const slotPos = (page, k) => page.evaluate(async (k) => {
  const { trackAt, trackLen } = await import('/ecosystem/js/terrain.js');
  const { gridSlot } = await import('/ecosystem/js/race-live-math.js');
  const g = gridSlot(k), p = trackAt(trackLen - g.back);
  return { x: p.x + p.rx * g.v, z: p.z + p.rz * g.v };
}, k);
const near = (a, b, d = 1.5) => Math.hypot(a.x - b.x, a.z - b.z) < d;

try {
  const a = await open('Smoke A');
  const b = await open('Smoke B');
  await until(async () => (await b.evaluate(() => window.__eco.peersState().peers.some((p) => p.name === 'Smoke A'))), 'B does not see A');

  // A starts a race from the Who's here sheet
  await a.click('#peers-chip');
  await until(async () => a.evaluate(() => { const btn = document.getElementById('peers-race'); return btn && !btn.disabled && btn.textContent.includes('Start a race'); }), "A's Race button should read Start a race");
  await a.click('#peers-race');
  const ra = await until(async () => { const l = await live(a); return l.race && l.entered ? l : null; }, 'A never entered its own race');
  if (!near(await car(a), await slotPos(a, 1))) fail('A is not on grid slot 1');
  if (!(await a.evaluate(() => window.__eco.raceLive().locked))) fail('A should be locked on the grid');

  // B gets the invite and joins; it is placed on slot 2
  await until(async () => b.evaluate(() => { const i = document.getElementById('race-invite'); return i && !i.hidden && i.textContent.includes('Smoke A started a race'); }), 'B never saw the invite');
  await b.click('#race-invite-join');
  await until(async () => { const l = await live(b); return l.entered && l.race?.grid?.length === 2 ? l : null; }, 'B never joined');
  if (!near(await car(b), await slotPos(b, 2))) fail('B is not on grid slot 2');
  const gridA = await until(async () => { const l = await live(a); return l.race.grid.length === 2 ? l.race.grid : null; }, "A's grid never showed B");
  if (gridA.map((g) => g.slot).join() !== '1,2') fail(`grid slots ${JSON.stringify(gridA)}`);
  console.log(`     both on the grid; Go at ${new Date(ra.race.startsAt).toISOString().slice(11, 19)}`);

  // Throttle held: nobody moves before Go
  const before = await car(b);
  await b.evaluate(() => { window.__eco.keys.up = true; });
  await sleep(1500);
  if (!near(await car(b), before, 0.3)) fail('B moved while locked on the grid');

  // Teleports are refused on the grid
  await b.evaluate(() => window.__eco.teleport('strike'));
  if (!near(await car(b), before, 0.3)) fail('B teleported off the grid');

  // Wait for the countdown and Go (20 s from open); the lock lifts and B rolls
  await until(async () => (await live(b)).state === 'running', 'the race never went running', 30000);
  await until(async () => !(await live(b)).locked, "B's throttle never unlocked after Go", 3000);
  await sleep(2500);
  // Software rendering runs a few frames a second here: the proof of the lock lifting is speed, not distance
  if (!((await b.evaluate(() => window.__eco.car.s.speed)) > 0.5)) fail('B did not get going after Go');
  await b.evaluate(() => { window.__eco.keys.up = false; });

  // Laps through the hook: A finishes first, B 500 ms later
  for (let i = 1; i <= 5; i++) { await a.evaluate((i) => window.__eco.raceLap('cp', i), i); await sleep(60); }
  await a.evaluate(() => window.__eco.raceLap('fin', 25000));
  for (let i = 1; i <= 5; i++) { await b.evaluate((i) => window.__eco.raceLap('cp', i), i); await sleep(60); }
  await until(async () => (await b.evaluate(() => document.getElementById('race-sub').textContent)).includes('P2 of 2'), "B's HUD never read P2 of 2");
  await sleep(500);
  await b.evaluate(() => window.__eco.raceLap('fin', 25500));
  const end = await until(async () => { const l = await live(a); return l.state === 'done' ? l : null; }, 'race.end never arrived at A', 5000);
  if (end.race.order[0].id !== (await a.evaluate(() => window.__eco.peersState().me?.id))) fail(`A should be P1: ${JSON.stringify(end.race.order)}`);
  if (end.race.dnf.length) fail(`unexpected DNF ${JSON.stringify(end.race.dnf)}`);
  console.log('ok   race live smoke');
  await browser.close();
} catch (e) {
  await browser.close().catch(() => {});
  fail(e.message);
}
