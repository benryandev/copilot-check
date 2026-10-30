// Render the ecosystem share image: a shot of the world (needs `node qa/serve.mjs` running) into tools/og-eco.html,
// then that page to ecosystem/img/og.png (1200x630). Uses Playwright, local or global as qa/shoot.mjs does.
// `--card` skips the world shot and re-renders the card from the saved tools/og-eco-world.png.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
if (!process.argv.includes('--card')) {
  // Light theme, HUD hidden, an aerial view of HQ with the roads out to the districts. The billboard is edge-on, so
  // no live figure is frozen into an image that X caches.
  const page = await browser.newPage({ viewport: { width: 1056, height: 1004 } });
  await page.goto('http://localhost:8080/ecosystem/#light');
  await page.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
  await page.click('#start');
  await page.evaluate(() => {
    document.querySelectorAll('.hud, .touch').forEach((e) => e.style.setProperty('display', 'none', 'important'));
    window.__eco.overview(30, 30, 55, 0, 0);
  });
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: new URL('./og-eco-world.png', import.meta.url).pathname });
  await page.close();
}
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('./og-eco.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('../ecosystem/img/og.png', import.meta.url).pathname });
await browser.close();
console.log('ecosystem/img/og.png written');
