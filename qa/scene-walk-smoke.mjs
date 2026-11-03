// The scene walk made cheap (ecosystem/js/freeze.js and merge.js): once the world is up and the models are in, most objects
// no longer compose a matrix every frame and the static geometry is merged per material; nothing frozen is moved behind
// three.js's back (a frozen object's matrix must still equal its position, rotation and scale after everything that moves
// or redraws has run); what should move still does (the car, the blimp, the sky dome, a monument's flywheel and the
// Orrery's rings, a spinning model part, the town hall's minute hand); and the merge left nothing it should have taken
// (no two static meshes under one root still share a batch), while the pads and the Orrery's named pedestal are still
// there. Runs the live frame loop on the low tier in a small window (software rendering, so it waits on frames
// generously). Needs the site on http://localhost:8766 (PORT=8766 node qa/serve.mjs). Usage: node qa/scene-walk-smoke.mjs [siteBase]
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8766';
const fail = (m) => { console.log(`FAIL scene walk smoke: ${m}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FUNDING = JSON.parse(readFileSync(new URL('./fixtures/funding-2026-11-02.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 600, height: 400 } });
await ctx.addInitScript(() => localStorage.setItem('eco-quality', 'low'));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  page error', String(e).split('\n')[0]));
await page.goto(`${base}/ecosystem/?arrive=0&mp=0&sound=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 90000 });
await page.evaluate(async () => { const b = await import('/ecosystem/js/build.js'); await b.modelsReady(); window.__b = b; window.__T = await import('/ecosystem/vendor/three.module.min.js'); window.__M = await import('/ecosystem/js/merge.js'); });
await page.click('#start');
await sleep(1500); // the freeze after the models runs on the next tick; a few frames go by

// Few objects compose a matrix every frame once the world is frozen
const census = () => page.evaluate(() => { let total = 0, auto = 0; window.__eco.scene.traverse((o) => { total++; if (o.matrixAutoUpdate) auto++; }); return { total, auto }; });
const c0 = await census();
console.log('     after the models', JSON.stringify(c0));
if (!(c0.total > 500)) fail(`only ${c0.total} objects in the scene`);
if (!(c0.auto <= c0.total * 0.25)) fail(`${c0.auto} of ${c0.total} objects still compose a matrix every frame; a quarter at most should`);

// The merge took everything it should: under each root no two static meshes still share a batch (material, flags, attributes)
const merge = await page.evaluate(() => {
  const e = window.__eco, b = window.__b, M = window.__M, districts = new Set(Object.values(b.districtGroups));
  const left = [];
  let merged = 0, drawables = 0;
  e.scene.traverse((o) => { if (o.userData.merged) merged++; if (o.isMesh || o.isSprite || o.isPoints) drawables++; });
  for (const root of [...districts, e.scene]) {
    const seen = new Map();
    const walk = (o, underLive) => {
      if (o.userData.live === 'deep' || (o !== root && o.userData.keep)) return;
      const live = underLive || !!o.userData.live;
      if (!live && M.mergeable(o)) { const k = M.batchKey(o); seen.set(k, (seen.get(k) || 0) + 1); }
      for (const c of o.children) if (root !== e.scene || !districts.has(c)) walk(c, live);
    };
    walk(root, false);
    for (const [k, n] of seen) if (n > 1) left.push(`${root.userData.key || root.type}: ${n} meshes share ${k.slice(0, 8)}`);
  }
  return { merged, drawables, left, pads: e.pads.every((p) => p.ring.parent && p.disc.parent), orreryModel: e.monuments.state().orreryModel };
});
console.log('     merged meshes', merge.merged, '· drawables', merge.drawables);
if (!(merge.merged >= 20)) fail(`only ${merge.merged} merged meshes; dozens expected`);
if (merge.left.length) fail(`the merge left shared batches: ${merge.left.slice(0, 6).join('; ')}`);
if (!merge.pads) fail('a pad ring or disc is no longer in the scene');
if (!merge.orreryModel) fail("the Orrery's pedestal is no longer found by name (monumentsState)");

// Everything that moves or redraws, as the smokes and the shoot drive it, then a drive and a teleport
await page.evaluate((raw) => {
  const e = window.__eco;
  e.yardInject([{ sym: 'BTC', usd: 1200, buy: true }, { sym: 'ETH', usd: 300, buy: false }, { sym: 'SOL', usd: 90, buy: true }, { sym: 'ADA', usd: 5000, buy: false }]);
  e.monuments.injectSlpFills([1, 2, 3, 4, 5].map((i) => ({ id: 3e9 + i, symbol: 'BTC-USD', side: 'buy', size: '0.01', price: '77000', timestamp: Date.now() })));
  e.ridge.set([80120, 80040, 79880, 79910, 79650, 79420, 79500, 79310, 78990, 78760, 78820, 78540, 78410, 78600, 78880, 79050, 78970, 79240, 79480, 79350, 79610, 79820, 79700, 79930]);
  e.windsocks.set(raw);
  e.blimp.setAngle(120);
  e.peersInject([{ id: 'p1', name: 'Juno', colour: '#22d3ee', x: e.car.s.x + 6, z: e.car.s.z + 4, h: 0 }]);
  e.emote.show('me', 1);
  e.ghostPreview(1.4, { name: 'Ben', ms: 25449, splits: [8570, 11900, 16630, 19950, 21840] });
  e.celebrate({ name: 'Aveli', ms: 24650 }, 0.5);
  document.getElementById('theme').click();
  e.keys.up = true;
}, FUNDING);
await sleep(2500);
await page.evaluate(() => { const e = window.__eco; e.peersMove('p1', e.car.s.x + 8, e.car.s.z + 6, 1); e.keys.up = false; e.ghostPreview(null); e.teleport('fillyard'); });
await sleep(1200);

// Nothing frozen was moved without its matrix being composed again
const drift = await page.evaluate(() => {
  const T = window.__T, m = new T.Matrix4(), bad = [];
  window.__eco.scene.traverse((o) => {
    if (o.matrixAutoUpdate) return;
    m.compose(o.position, o.quaternion, o.scale);
    const a = m.elements, b = o.matrix.elements;
    for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-4) { bad.push(`${o.type}${o.name ? ` "${o.name}"` : ''} under ${o.parent?.name || o.parent?.userData?.key || o.parent?.type}`); break; }
  });
  return bad;
});
console.log('     frozen objects moved behind three.js', drift.length);
if (drift.length) fail(`${drift.length} frozen objects were moved without updateMatrix: ${drift.slice(0, 8).join('; ')}`);

// What should move still moves: two readings of each mover's world matrix, 1.2 s apart, while driving
const snap = () => page.evaluate(() => {
  const e = window.__eco, s = e.scene;
  const find = (pred) => { let r = null; s.traverse((o) => { if (!r && pred(o)) r = o; }); return r; };
  const picks = { car: e.car.group, blimp: find((o) => o.userData?.liveries), dome: find((o) => o.isGroup && o.children.some((c) => c.isPoints)), flywheel: s.getObjectByName('flywheel'), orrery: s.getObjectByName('ring_01'), spin: find((o) => o.name.startsWith('spin_')), minuteHand: s.getObjectByName('clockhand_m') };
  const out = {};
  for (const [k, o] of Object.entries(picks)) out[k] = o ? [...o.matrixWorld.elements] : null;
  return out;
});
await page.evaluate(() => { window.__eco.keys.up = true; });
const a = await snap();
await sleep(1200);
const b = await snap();
await page.evaluate(() => { window.__eco.keys.up = false; });
const still = [], absent = [];
for (const k of Object.keys(a)) {
  if (!a[k] || !b[k]) { absent.push(k); continue; }
  if (!a[k].some((v, i) => Math.abs(v - b[k][i]) > 1e-6)) still.push(k);
}
console.log('     movers checked', Object.keys(a).filter((k) => !absent.includes(k)).join(', '), absent.length ? `(absent: ${absent.join(', ')})` : '');
if (still.length) fail(`frozen in place: ${still.join(', ')}`);
const c1 = await census();
console.log('     after the run', JSON.stringify(c1));
console.log(`ok   scene walk smoke: ${c1.total - c1.auto} of ${c1.total} objects frozen, ${merge.merged} merged meshes, nothing moved behind three.js, the movers move`);
await browser.close();
