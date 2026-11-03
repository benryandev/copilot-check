// Per-district stills for the layout review (dev only): for every ring district, the driver's eye 24 m inside the HQ
// mouth facing the centre, a three-quarter aerial from 40 m beyond the mouth at 45 m up, and a top-down, at 1440×900.
// Usage: node qa/shoot-districts.mjs [baseUrl] [--themes=dark,light]
// Writes qa/shots/district-<key>-{eye,aerial,top}[-light].png, plus district-<key>-monument for a district with a monument (the car
// 14 m from the centre on the HQ side, facing it), and prints one line per still; exits 1 on any page error.
// The 3D renders in software (SwiftShader): the world gets 9 s for its models and each still 3 s to settle.
import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) || 'http://localhost:8766').replace(/\/$/, '');
const THEMES = (args.find((a) => a.startsWith('--themes='))?.slice(9) || 'dark').split(',');
const out = new URL('./shots/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let errors = 0;
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors++; console.log(`PAGE ERROR (${theme}): ${e.message}`); });
  await page.goto(`${base}/ecosystem/?mp=0&arrive=0#${theme}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 90000 });
  await page.click('#start');
  await sleep(9000);
  const districts = await page.evaluate(async () => {
    const C = await import('/ecosystem/js/content.js');
    return Object.values(C.DISTRICTS).filter((d) => d.plaza !== false && d.hubDir).map((d) => ({ key: d.key, centre: d.centre, radius: d.radius, hubDir: d.hubDir }));
  });
  const suffix = theme === 'dark' ? '' : `-${theme}`;
  const shot = async (name, ms) => { await sleep(ms); await page.screenshot({ path: `${out}district-${name}${suffix}.png` }); console.log(`district-${name}${suffix}`); };
  for (const d of districts) {
    await page.evaluate((d) => {
      const e = window.__eco, [cx, cz] = d.centre, h = d.hubDir;
      const x = cx + h[0] * (d.radius - 24), z = cz + h[1] * (d.radius - 24);
      const dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz);
      e.placeCar(x, z, Math.atan2(-dx / l, -dz / l));
    }, d);
    await shot(`${d.key}-eye`, 3200);
  }
  const withMonument = await page.evaluate(async () => { const C = await import('/ecosystem/js/content.js'); return C.STOPS.filter(C.isMonument).map((s) => s.district); });
  for (const d of districts.filter((d) => withMonument.includes(d.key))) {
    await page.evaluate((d) => {
      const e = window.__eco, [cx, cz] = d.centre, h = d.hubDir;
      const x = cx + h[0] * 14, z = cz + h[1] * 14;
      e.placeCar(x, z, Math.atan2(h[0], h[1])); // facing the centre, as the eye still does
    }, d);
    await shot(`${d.key}-monument`, 3200);
  }
  for (const d of districts) {
    await page.evaluate((d) => { const [cx, cz] = d.centre, h = d.hubDir; window.__eco.overview(cx + h[0] * (d.radius + 40), 45, cz + h[1] * (d.radius + 40), cx, cz); }, d);
    await shot(`${d.key}-aerial`, 1500);
    await page.evaluate((d) => { const [cx, cz] = d.centre; window.__eco.overview(cx, d.radius * 2.6, cz + 0.5, cx, cz); }, d);
    await shot(`${d.key}-top`, 1500);
  }
  await ctx.close();
}
await browser.close();
if (errors) { console.error(`${errors} page error(s)`); process.exit(1); }
console.log('districts: clean');
