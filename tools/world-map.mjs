// A plan of the whole world, for placing things and judging the layout (Ben, 2 Nov 2026): every road, plaza, stop,
// jump, the river with its bridges and ford, the Raceway and its gates, the Fill Yard, the blimp's loop, north up
// (−z), metres on a grid. Drawn from the same modules the world is built from, so it never goes stale.
//   node tools/world-map.mjs [base] [--only=plan|overview]   → tools/out/showcase/world-map.svg, world-map.png (plan),
//                                       world-overview-day.png (the engine's own view straight down from 700 m)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { const g = execSync('npm root -g').toString().trim(); ({ chromium } = createRequire(`${g}/`)('playwright')); }
const args = process.argv.slice(2), base = args.find((a) => !a.startsWith('--')) || 'http://localhost:8766';
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7) || ''; // plan | overview
const OUT = new URL('./out/showcase/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// ── The plan, drawn in the page from terrain.js and content.js ──
if (ONLY !== 'overview') {
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${base}/ecosystem/arcade/flappy-coin/`, { waitUntil: 'domcontentloaded' }); // any page on the origin
const svg = await page.evaluate(async () => {
  const T = await import('/ecosystem/js/terrain.js');
  const C = await import('/ecosystem/js/content.js');
  const { DISTRICTS, STOPS, RIVER, SPAWN, RACE_TRACK } = C;
  const R = 400, S = 2.6, PAD = 70, W = Math.round(R * 2 * S + PAD * 2); // 2.6 px per metre, 400 m radius, 70 px margin
  const X = (x) => PAD + (x + R) * S, Y = (z) => PAD + (z + R) * S;
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const poly = (pts) => pts.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(' ');
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" font-family="Inter, Helvetica, Arial, sans-serif">`);
  out.push(`<rect width="${W}" height="${W}" fill="#f3f1e8"/>`);
  // 50 m grid and the world's edge
  for (let m = -R; m <= R; m += 50) {
    const major = m % 100 === 0;
    out.push(`<line x1="${X(m)}" y1="${Y(-R)}" x2="${X(m)}" y2="${Y(R)}" stroke="${major ? '#d9d5c6' : '#e8e5d9'}" stroke-width="1"/>`);
    out.push(`<line x1="${X(-R)}" y1="${Y(m)}" x2="${X(R)}" y2="${Y(m)}" stroke="${major ? '#d9d5c6' : '#e8e5d9'}" stroke-width="1"/>`);
    if (major) { out.push(`<text x="${X(m)}" y="${Y(-R) - 10}" font-size="13" fill="#8a867a" text-anchor="middle">${m > 0 ? '+' : ''}${m}</text>`); out.push(`<text x="${X(-R) - 10}" y="${Y(m) + 4}" font-size="13" fill="#8a867a" text-anchor="end">${m > 0 ? '+' : ''}${m}</text>`); }
  }
  out.push(`<circle cx="${X(0)}" cy="${Y(0)}" r="${T.WORLD.radius * S}" fill="#dfe9cf" stroke="#9aa88a" stroke-width="2" stroke-dasharray="10 6"/>`);
  out.push(`<text x="${X(0)}" y="${Y(-T.WORLD.radius) - 14}" font-size="15" fill="#6c7a5c" text-anchor="middle">world edge, r ${T.WORLD.radius} m</text>`);
  // The blimp's loop
  const { BLIMP } = await import('/ecosystem/js/blimp-math.js').catch(() => ({ BLIMP: null }));
  if (BLIMP) out.push(`<circle cx="${X(0)}" cy="${Y(0)}" r="${BLIMP.radius * S}" fill="none" stroke="#1e2a44" stroke-width="1.5" stroke-dasharray="4 8" opacity="0.6"/><text x="${X(BLIMP.radius * 0.72)}" y="${Y(-BLIMP.radius * 0.72) - 6}" font-size="13" fill="#1e2a44" opacity="0.7">blimp loop, r ${BLIMP.radius} m at ${BLIMP.height} m</text>`);
  // Plazas (cobbled discs) and the Fill Yard
  for (const d of Object.values(DISTRICTS)) {
    if (d.plaza === false) continue;
    out.push(`<circle cx="${X(d.centre[0])}" cy="${Y(d.centre[1])}" r="${d.radius * S}" fill="#e9e4d4" stroke="${hex(d.colour)}" stroke-width="4"/>`);
  }
  // The river: the channel as a band, the water's full width
  out.push(`<polyline points="${poly(T.river.pts)}" fill="none" stroke="#4fa3c7" stroke-width="${RIVER.half * 2 * S}" stroke-linecap="round" stroke-linejoin="round"/>`);
  out.push(`<polyline points="${poly(T.river.pts)}" fill="none" stroke="#2b6f93" stroke-width="1.2" stroke-dasharray="3 5" opacity="0.8"/>`);
  // Roads: dirt bands at their real width, the track wider
  for (const r of T.roads) out.push(`<polyline points="${poly(r.pts)}" fill="none" stroke="#c9a977" stroke-width="${r.half * 2 * S}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const r of T.roads) out.push(`<polyline points="${poly(r.pts)}" fill="none" stroke="#a88757" stroke-width="1" stroke-dasharray="6 6" opacity="0.7"/>`);
  // Named roads that are places in their own right (the ridge): a label at the road's far point from HQ
  for (const r of T.roads) {
    if (r.kind !== 'ridge') continue;
    const far = r.pts.reduce((m, p) => (Math.hypot(p[0], p[1]) > Math.hypot(m[0], m[1]) ? p : m), r.pts[0]);
    out.push(`<text x="${X(far[0])}" y="${Y(far[1]) + 30}" font-size="15" font-weight="700" fill="#8a5a2b" text-anchor="middle">Chart Ridge (${r.len.toFixed(0)} m, the last 24 h of BTC)</text>`);
  }
  // Bridges and the ford
  for (const c of T.crossings) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = -fz, rz = fx, L = c.halfLen, Wd = c.halfW;
    const quad = [[c.x - fx * L - rx * Wd, c.z - fz * L - rz * Wd], [c.x + fx * L - rx * Wd, c.z + fz * L - rz * Wd], [c.x + fx * L + rx * Wd, c.z + fz * L + rz * Wd], [c.x - fx * L + rx * Wd, c.z - fz * L + rz * Wd]];
    out.push(`<polygon points="${poly(quad)}" fill="${c.bridge ? '#8a5a2b' : 'none'}" stroke="${c.bridge ? '#5a3a16' : '#2b6f93'}" stroke-width="2" ${c.bridge ? '' : 'stroke-dasharray="4 3"'}/>`);
    out.push(`<text x="${X(c.x + rx * (Wd + 4))}" y="${Y(c.z + rz * (Wd + 4)) + 4}" font-size="12" fill="${c.bridge ? '#5a3a16' : '#2b6f93'}" font-weight="600">${c.bridge ? 'bridge' : 'ford'}</text>`);
  }
  // Jumps: a triangle pointing up the ramp
  for (const j of T.jumps) {
    const tip = [j.ox + j.fx * j.length, j.oz + j.fz * j.length], w = j.width / 2;
    const tri = [[j.ox + j.rx * w, j.oz + j.rz * w], [j.ox - j.rx * w, j.oz - j.rz * w], tip];
    out.push(`<polygon points="${poly(tri)}" fill="${j.stunt ? '#f59e0b' : '#d97706'}" stroke="#7c3a00" stroke-width="1.5"/>`);
  }
  const stunt = T.jumps.find((j) => j.stunt);
  if (stunt) out.push(`<text x="${X(stunt.ox + 4)}" y="${Y(stunt.oz) - 12}" font-size="13" fill="#7c3a00" font-weight="600">epic jump</text>`);
  // Raceway gates, start line and checkpoints
  for (const g of T.raceGates) {
    const a = [g.x + g.rx * g.w, g.z + g.rz * g.w], b = [g.x - g.rx * g.w, g.z - g.rz * g.w];
    out.push(`<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${g.i === 0 ? '#111' : '#0fb89c'}" stroke-width="${g.i === 0 ? 4 : 3}"/>`);
    out.push(`<text x="${X(a[0] + g.rx * 3)}" y="${Y(a[1] + g.rz * 3) + 4}" font-size="12" fill="#064e3b" font-weight="600">${g.i === 0 ? 'start' : 'CP' + g.i}</text>`);
  }
  // Stops: every pad with its name
  const laid = C.layoutStops();
  const slots = Object.fromEntries(T.builderSlots.map((b) => [b.key, [b.x, b.z]]));
  for (const s of STOPS) {
    const p = s.pos || slots[s.key] || laid.get(s.key);
    if (!p) continue;
    const d = DISTRICTS[s.district];
    out.push(`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="5" fill="${hex(d.colour)}" stroke="#222" stroke-width="1"/>`);
    out.push(`<text x="${X(p[0]) + 8}" y="${Y(p[1]) + 4}" font-size="11" fill="#222">${esc(s.name)}</text>`);
  }
  // District billboards and names
  for (const d of Object.values(DISTRICTS)) {
    if (d.plaza === false || d.key === 'yard') { /* no board */ } else { const b = C.boardSpot(d); out.push(`<rect x="${X(b.x) - 5}" y="${Y(b.z) - 3}" width="10" height="6" fill="#333"/>`); }
    const dy = d.key === 'raceway' ? -d.radius * S * 0.32 : -d.radius * S + 22;
    out.push(`<text x="${X(d.centre[0])}" y="${Y(d.centre[1]) + dy}" font-size="${d.key === 'hub' ? 16 : 18}" font-weight="700" fill="${hex(d.colour)}" stroke="#fff" stroke-width="4" paint-order="stroke" text-anchor="middle">${esc(d.name)}</text>`);
  }
  // Spawn and north
  out.push(`<circle cx="${X(SPAWN.x)}" cy="${Y(SPAWN.z)}" r="6" fill="none" stroke="#111" stroke-width="2"/><text x="${X(SPAWN.x) + 9}" y="${Y(SPAWN.z) + 4}" font-size="12" fill="#111">spawn</text>`);
  out.push(`<g transform="translate(${W - PAD - 20}, ${PAD + 40})"><polygon points="0,-26 8,8 0,2 -8,8" fill="#111"/><text y="26" font-size="15" text-anchor="middle" font-weight="700" fill="#111">N</text></g>`);
  out.push(`<text x="${PAD}" y="${W - 22}" font-size="14" fill="#555">Strike ecosystem world, plan view, drawn ${new Date().toISOString().slice(0, 10)} from content.js and terrain.js. Track ${RACE_TRACK.id}, ${RACE_TRACK.length.toFixed(1)} m a lap. Grid 50 m, north up.</text>`);
  out.push('</svg>');
  return out.join('\n');
});
writeFileSync(`${OUT}world-map.svg`, svg);
await page.setViewportSize({ width: 2220, height: 2220 });
await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
await page.screenshot({ path: `${OUT}world-map.png`, fullPage: true });
console.log('world-map.svg, world-map.png');
await ctx.close();
}

// ── The engine's own view from straight above (clouds hidden: they would cover half the plazas) ──
if (ONLY !== 'plan') {
const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 1600 }, deviceScaleFactor: 1, colorScheme: 'light' });
await ctx2.route(/\/race\/(event|time)$/, (r) => r.fulfill({ status: 204, body: '' }));
const p2 = await ctx2.newPage();
await p2.addInitScript(() => { try { localStorage.setItem('eco-quality', 'high'); } catch {} });
await p2.goto(`${base}/ecosystem/?mp=0&arrive=0#light`, { waitUntil: 'domcontentloaded' });
await p2.waitForFunction(() => window.__eco && document.getElementById('intro').open, null, { timeout: 60000 });
await p2.click('#start');
await p2.evaluate(() => new Promise((r) => setTimeout(r, 4000))); // models in
await p2.evaluate(() => { document.querySelectorAll('.hud, .touch').forEach((el) => el.style.setProperty('display', 'none', 'important')); window.__eco.overview(0, 760, 1, 0, 0); const scene = window.__eco.fireworks.parent; scene.traverse((o) => { if (o.isInstancedMesh && o.frustumCulled === false) o.visible = false; }); });
await p2.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
await p2.screenshot({ path: `${OUT}world-overview-day.png` });
console.log('world-overview-day.png');
}
await browser.close();
