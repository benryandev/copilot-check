// Guides inside the world, end to end (dev only): PORT=8766 node qa/serve.mjs & node qa/guide-smoke.mjs [baseUrl]
//   ?stop=strike → "Read the guide" on the HQ sheet opens the guide in the #guide sheet, the URL becomes the guide's,
//   the world is not reloaded; Back (and Close) return to the pad and the world's URL; the intro's "Start here" link
//   opens the guides index in-world; a guide URL that 404s falls through to a normal navigation. Exits 1 on failure.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}
const base = (process.argv[2] || 'http://localhost:8766').replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };

async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); localStorage.setItem('eco-tier', 'low'); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eco && !document.getElementById('loader'), null, { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { ctx, page, errs };
}
const state = (page) => page.evaluate(() => ({
  guideOpen: document.getElementById('guide').open, stopOpen: document.getElementById('stop').open, path: location.pathname, search: location.search,
  h1: document.querySelector('#guide h1')?.textContent || null, title: document.title, eco: typeof window.__eco, len: history.length, hash: location.hash,
}));

// Open from the HQ sheet, read next, Back
{
  const { ctx, page, errs } = await open('/ecosystem/?mp=0&stop=strike');
  const link = await page.evaluate(() => { const a = document.querySelector('#stop-guides a[data-guide-link]'); return a ? { text: a.textContent, href: a.getAttribute('href') } : null; });
  check(!!link && /^Read the guide: /.test(link.text) && /^\/ecosystem\/guides\/[a-z0-9-]+\/$/.test(link.href), `HQ sheet: guide link "${link?.text}" → ${link?.href}`);
  const before = await state(page);
  await page.click('#stop-guides a[data-guide-link]');
  await page.waitForFunction(() => document.getElementById('guide').open && document.querySelector('#guide h1'), null, { timeout: 20000 });
  const s1 = await state(page);
  check(s1.guideOpen && !s1.stopOpen && s1.path === link.href, `guide open in-world, URL ${s1.path}`);
  check(s1.title.startsWith(s1.h1.slice(0, 20)) && s1.title.endsWith(' · Strike ecosystem'), `title "${s1.title}"`);
  check(s1.eco === 'object' && s1.len === before.len + 1, `no reload (window.__eco kept), history grew by one (${before.len} → ${s1.len})`);
  check(await page.evaluate(() => !document.querySelector('#guide .guide-drive')), 'Drive there removed inside the world');
  const next = await page.evaluate(() => document.querySelector('#guide a[data-guide-link][href^="/ecosystem/guides/"]:not([href="/ecosystem/guides/"])')?.getAttribute('href') || null);
  if (next) {
    await page.click(`#guide a[data-guide-link][href="${next}"]`);
    await page.waitForFunction((n) => location.pathname === n, next, { timeout: 20000 });
    const s2 = await state(page);
    check(s2.guideOpen && s2.path === next && s2.len === s1.len, `read next: ${s2.path}, history entry replaced (${s2.len})`);
  } else console.log('skip read next (one guide built)');
  // A fragment link inside the mounted page scrolls within the sheet and never navigates (a feature guide's TOC)
  const frag = await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: location.pathname + '#next', textContent: 'Jump to Next' });
    document.querySelector('#guide h1').after(a);
    return a.getAttribute('href');
  });
  // links added after the mount are not rewritten, so run the same rule the mount runs
  await page.evaluate(() => { const a = document.querySelector('#guide h1 + a'); a.setAttribute('data-guide-anchor', 'next'); });
  const before2 = await state(page);
  await page.click('#guide h1 + a');
  await page.waitForTimeout(300);
  const s2b = await state(page);
  const nextTop = await page.evaluate(() => document.querySelector('#guide #next').getBoundingClientRect().top);
  check(s2b.guideOpen && s2b.path === before2.path && s2b.len === before2.len && s2b.hash === '', `fragment link (${frag}): sheet open, URL and history unchanged`);
  check(nextTop >= 0 && nextTop < 200, `fragment link scrolled the sheet to Next (top ${Math.round(nextTop)} px)`);
  await page.goBack();
  await page.waitForTimeout(400);
  const s3 = await state(page);
  check(!s3.guideOpen && s3.path === '/ecosystem/' && s3.search === '?mp=0&stop=strike' && s3.eco === 'object', `Back: sheet closed, URL ${s3.path}${s3.search}, world intact`);
  check(!s3.title.includes(' · Strike ecosystem') || s3.title === 'Strike Ecosystem', `title restored "${s3.title}"`);
  await page.goForward();
  await page.waitForFunction(() => document.getElementById('guide').open && document.querySelector('#guide h1'), null, { timeout: 20000 });
  const s3f = await state(page);
  check(s3f.guideOpen && s3f.path.startsWith('/ecosystem/guides/') && s3f.len === s3.len, `Forward: the guide reopens at ${s3f.path} without a new entry`);
  await page.goBack();
  await page.waitForTimeout(400);
  // Close button
  await page.click('#prompt-btn').catch(() => {});
  await page.waitForFunction(() => document.getElementById('stop').open, null, { timeout: 5000 }).catch(() => {});
  await page.click('#stop-guides a[data-guide-link]');
  await page.waitForFunction(() => document.getElementById('guide').open && document.querySelector('#guide h1'), null, { timeout: 20000 });
  await page.click('#guide [data-close]');
  await page.waitForTimeout(400);
  const s4 = await state(page);
  check(!s4.guideOpen && s4.path === '/ecosystem/' && s4.search === '?mp=0&stop=strike' && s4.eco === 'object', `Close: sheet closed, URL ${s4.path}${s4.search}, world intact`);
  check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
// The intro's Start here link opens the index in-world; the stops page too
{
  const { ctx, page, errs } = await open('/ecosystem/?mp=0&arrive=0');
  await page.click('#intro a[href="/ecosystem/guides/"]');
  await page.waitForFunction(() => document.getElementById('guide').open && document.querySelector('#guide h1'), null, { timeout: 20000 });
  const s = await state(page);
  check(s.guideOpen && s.path === '/ecosystem/guides/' && s.h1 === 'Learn Strike from zero', `intro → guides index in-world: "${s.h1}" at ${s.path}`);
  await page.goBack(); await page.waitForTimeout(300);
  check(!(await state(page)).guideOpen, 'Back from the index closes the sheet (the intro, a one-time sheet, stays closed: the visitor is driving)');
  check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
{
  const { ctx, page, errs } = await open('/ecosystem/?mp=0&arrive=0');
  await page.click('#intro a[href="/ecosystem/stops/"]');
  await page.waitForFunction(() => document.getElementById('guide').open && document.querySelector('#guide h1'), null, { timeout: 20000 });
  const t = await state(page);
  const cards = await page.evaluate(() => document.querySelectorAll('#guide article.stop').length);
  check(t.guideOpen && t.path === '/ecosystem/stops/' && cards > 50, `intro → stops page in-world: ${cards} stops at ${t.path}`);
  check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
// A guide the fetch cannot get: a plain navigation, never an empty sheet
{
  const { ctx, page } = await open('/ecosystem/?mp=0&stop=strike');
  await page.route('**/ecosystem/guides/*/', (route) => route.fulfill({ status: 404, body: 'gone' }));
  await page.click('#stop-guides a[data-guide-link]');
  await page.waitForTimeout(1500);
  const u = new URL(page.url());
  const eco = await page.evaluate(() => typeof window.__eco);
  check(/^\/ecosystem\/guides\/[a-z0-9-]+\/$/.test(u.pathname) && eco === 'undefined', `404 guide: navigated to ${u.pathname} (world unloaded)`);
  await ctx.close();
}
await browser.close();
if (failures.length) { console.log(`guide smoke: ${failures.length} failure(s)`); process.exit(1); }
console.log('guide smoke: ok');
