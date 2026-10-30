// Render tools/og-eco.html to ecosystem/img/og.png (1200x630 share image). Its background, og-eco-world.png, comes
// from `node tools/clip-eco.mjs --still`. Uses Playwright, local or global as qa/shoot.mjs does.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('./og-eco.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('../ecosystem/img/og.png', import.meta.url).pathname });
await browser.close();
console.log('ecosystem/img/og.png written');
