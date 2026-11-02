// Renders the site's icon set from img/favicon.svg: img/favicon.ico (one 32 px PNG wrapped in an ICO header,
// which every current browser accepts) and img/apple-touch-icon.png (180 px). Uses Playwright, local or global,
// as tools/og.mjs does. Run: node tools/icons.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const svg = readFileSync(new URL('../img/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();

async function png(size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style></head><body><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
  const buf = await page.screenshot({ omitBackground: true, type: 'png' });
  await page.close();
  return buf;
}

// ICO container: 6-byte header, one 16-byte directory entry, then the PNG bytes as-is
function ico(pngBuf, size) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); entry.writeUInt8(0, 3); entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8); entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

const p32 = await png(32), p180 = await png(180);
// Linked from every page under /img/, and also at the root, where browsers and crawlers look when nothing is linked
for (const dir of ['../img/', '../']) {
  writeFileSync(new URL(`${dir}favicon.ico`, import.meta.url), ico(p32, 32));
  writeFileSync(new URL(`${dir}apple-touch-icon.png`, import.meta.url), p180);
}
await browser.close();
console.log(`favicon.ico (${p32.length} B png in ico) and apple-touch-icon.png (${p180.length} B) written to img/ and the root`);
