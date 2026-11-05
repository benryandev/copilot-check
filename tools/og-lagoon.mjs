// The Lagoon's share image, ecosystem/tracks/lagoon/og.png (1200x630, R28). Needs `PORT=8766 node qa/serve.mjs` running
// (or pass the origin). Two steps in one run:
//   1. the background: the venue loaded with no flight, the camera held (the overview hook) on the opening flight's
//      aerial (entries.js venueEntry `flight`, arrive.js flightPath) at E of the way down, the HUD hidden, shot at 1800x945 (2400x1260 fails to capture on the software renderer)
//      to tools/og-lagoon-world.png;
//   2. tools/og-lagoon.html (the hub's og-eco.html layout with the venue's title) over it, shot at 1200x630.
//   3. ImageMagick (`magick`) quantises the card to 256 colours, so it stays under 300 KB.
//   node tools/og-lagoon.mjs [http://localhost:8766] [--e=0]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const origin = process.argv.slice(2).find((a) => a.startsWith('http')) || 'http://localhost:8766';
const E = Number((process.argv.find((a) => a.startsWith('--e=')) || '--e=0').slice(4));
const here = (p) => new URL(p, import.meta.url).pathname;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1800, height: 945 } });
await ctx.addInitScript(() => { try { localStorage.setItem('eco-quality', 'high'); } catch {} });
const page = await ctx.newPage();
await page.goto(`${origin}/ecosystem/tracks/lagoon/?mp=0&arrive=0&sound=0#light`);
await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 90000 });
await page.click('#start');
await page.evaluate(() => new Promise((r) => setTimeout(r, 3000))); // models in
await page.evaluate(async (E) => {
  document.querySelectorAll('.hud, .touch').forEach((el) => el.style.setProperty('display', 'none', 'important'));
  const { venueEntry } = await import('/ecosystem/js/entries.js');
  const { flightPath } = await import('/ecosystem/js/arrive.js');
  const lagoon = (await import('/ecosystem/tracks/lagoon.js')).default;
  const entry = venueEntry(lagoon, { slug: 'lagoon' }), e = window.__eco, cam = e.camera;
  // The chase pose the flight ends on: the camera where placeCamera leaves it on the grid
  e.placeCamera(0, true);
  const look = { x: e.car.s.x, y: e.car.s.y + 1, z: e.car.s.z };
  const path = flightPath({ s: e.car.s, chase: { pos: cam.position.clone(), look }, look: entry.flight.look, start: entry.flight });
  const p = path(E);
  // The flight clears the clouds off the venue's middle (arrive.js, entries.js `clouds`); the held camera does the same
  let sky = null; e.scene.traverse((o) => { if (o.userData?.clearClouds) sky = o; });
  const [px, pz] = path.point(E);
  sky?.userData.clearClouds(px, pz, entry.flight.look[0], entry.flight.look[1], 220);
  e.overview(p.pos[0], p.pos[1], p.pos[2], p.look[0], p.look[2]);
  cam.lookAt(...p.look); cam.updateProjectionMatrix();
}, E);
await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
// A large capture on the software renderer sometimes fails once; try again
for (let i = 0; ; i++) { try { await page.screenshot({ path: here("./og-lagoon-world.png"), timeout: 120000 }); break; } catch (err) { if (i >= 3) throw err; await page.waitForTimeout(1000); } }
await ctx.close();

const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await card.goto(new URL('./og-lagoon.html', import.meta.url).href);
await card.evaluate(() => document.fonts.ready);
await card.screenshot({ path: here('../ecosystem/tracks/lagoon/og.png') });
await browser.close();
// The aerial is all texture, so the full-colour PNG is ~770 KB; 256 colours (ImageMagick) bring it under 300 KB
const out = here('../ecosystem/tracks/lagoon/og.png');
execSync(`magick "${out}" -dither FloydSteinberg -colors 256 "PNG8:${out}"`);
console.log(`tools/og-lagoon-world.png and ecosystem/tracks/lagoon/og.png written (flight at e ${E})`);
