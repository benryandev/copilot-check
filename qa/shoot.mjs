// Design-QA screenshots (dev only). Usage: node qa/shoot.mjs [baseUrl] [--states=empty,loading,...] [--widths=375,1280]
// Shoots every state × width × theme full-page to qa/shots/<state>-<width>-<theme>.png and prints:
//   - horizontal overflow (scrollWidth > innerWidth) and elements poking past the right edge;
//   - WCAG AA contrast failures on text, from computed styles (4.5:1, or 3:1 for large text).
// Result states hit Hyperliquid live, so each wallet loads once; widths and themes are then changed in the same page.
import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}

const args = process.argv.slice(2);
const base = (args.find(a => !a.startsWith('--')) || 'http://localhost:8080').replace(/\/$/, '');
const opt = k => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1]?.split(',');
const WIDTHS = (opt('widths') || ['375', '768', '1001', '1024', '1279', '1280', '1440', '1920']).map(Number);
const THEMES = ['light', 'dark'];
const STATES = {
  empty: '/',
  loading: '/?demo=loading',
  error: '/?demo=busy',
  resultA: '/#0x01bb092c2e4fef1d68ef1ca66e9b1db29f0cf7b7',
  resultB: '/#0x42fd5648cf21c158d15e4f58785760755b3f6623',
};
const pick = opt('states') || Object.keys(STATES);
const out = new URL('./shots/', import.meta.url).pathname;
await mkdir(out, { recursive: true });

// Runs in the page: overflow and contrast audit.
function audit() {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) acc = blend(c, acc);
    return acc;
  };
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.1 && !el.closest('.sr-only,[hidden],.skip'); };
  const fails = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el) || !visible(el)) continue; seen.add(el);
    const s = getComputedStyle(el), fg0 = parse(s.color); if (!fg0) continue;
    const bg = bgOf(el), fg = fg0.a < 1 ? blend(fg0, bg) : fg0;
    const [L1, L2] = [lum(fg), lum(bg)].sort((a, b) => b - a), ratio = (L1 + 0.05) / (L2 + 0.05);
    const px = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700, large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) fails.push(`${ratio.toFixed(2)}<${need} "${n.textContent.trim().slice(0, 40)}" (${el.tagName.toLowerCase()}.${el.className})`);
  }
  // Non-text contrast (WCAG 1.4.11): a text field's border against what surrounds it, 3:1
  for (const el of document.querySelectorAll('input.br-input')) {
    if (!visible(el)) continue;
    const bc = parse(getComputedStyle(el).borderTopColor), out = bgOf(el.parentElement);
    const [A, B] = [lum(bc), lum(out)].sort((x, y) => y - x), ratio = (A + 0.05) / (B + 0.05);
    if (ratio < 3) fails.push(`${ratio.toFixed(2)}<3 field border (#${el.id})`);
  }
  // Overlap: tags, values and labels must stay inside their own box (cells, stats, findings, chart rows)
  const boxes = '.cell, .br-stat, .br-finding, .m, .used > div, .meta > div, .actions';
  for (const el of document.querySelectorAll(`:is(${boxes}) :is(.br-tag, .net, .kv, .br-stat-value, .br-label, .val, .mono, .br-button)`)) {
    if (!visible(el)) continue;
    const box = el.parentElement.closest(boxes), r = el.getBoundingClientRect(), o = box.getBoundingClientRect();
    if (r.left < o.left - 1 || r.right > o.right + 1 || r.top < o.top - 1 || r.bottom > o.bottom + 1)
      fails.push(`overlap: ${el.className} "${el.textContent.trim().slice(0, 24)}" leaves ${box.className.split(' ')[0]} [${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(o.left)}–${Math.round(o.right)}]`);
  }
  // Chart scale: every bar's length per dollar must match (gains and losses on one scale), within 8%
  const usd = t => { const m = t.replace(/[^0-9.KM−-]/g, '').match(/[−-]?([\d.]+)([KM]?)/); return m ? Number(m[1]) * (m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1) : NaN; };
  const bars = [...document.querySelectorAll('.months .bar')].map(bar => {
    const val = bar.parentElement.querySelector('.val'), r = bar.getBoundingClientRect(), v = usd(val.textContent);
    const horiz = getComputedStyle(bar.parentElement).flexDirection.startsWith('row');
    return { v, px: horiz ? r.width : r.height, t: val.textContent };
  }).filter(b => b.v > 0);
  const big = Math.max(0, ...bars.map(b => b.v));
  const per = bars.filter(b => b.v >= big * 0.1).map(b => ({ ...b, k: b.px / b.v }));
  if (per.length > 1) { const ks = per.map(b => b.k), lo = Math.min(...ks), hi = Math.max(...ks);
    if (hi / lo > 1.08) fails.push(`chart scale differs ${(hi / lo).toFixed(2)}x: ${per.map(b => `${b.t}=${Math.round(b.px)}px`).join(' ')}`); }
  const W = innerWidth, over = document.documentElement.scrollWidth > W;
  const poke = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 0.5 || r.left < -0.5) poke.push(`${el.tagName.toLowerCase()}.${el.className} [${Math.round(r.left)},${Math.round(r.right)}]`);
  }
  // Text clipped inside its own box (overflow hidden/ellipsis)
  const clipped = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el) || !el.childNodes.length || el.matches('svg,svg *,.progress-bar,.matrix')) continue;
    const s = getComputedStyle(el);
    if ((s.overflowX === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.tagName.toLowerCase()}.${el.className} "${el.textContent.trim().slice(0, 30)}"`);
  }
  // Wording rules: descriptive only, no score
  const text = document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title]')].map(e => `${e.getAttribute('aria-label') || ''} ${e.getAttribute('title') || ''}`).join(' ');
  const words = [...new Set((text.match(/recommend\w*|you should|best setting\w*|\bscore\w*/gi) || []).map(w => w.toLowerCase()))];
  return { over, scrollWidth: document.documentElement.scrollWidth, fails, poke: poke.slice(0, 8), clipped: clipped.slice(0, 8), words };
}

const browser = await chromium.launch();
let problems = 0;
// Self-test: the audit must catch a known low-contrast line, overflow and a banned word, or its silence means nothing.
{
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent('<body style="margin:0;background:#fff"><p style="color:#bbb">pale grey text</p><div style="width:600px">wide</div><p>the best settings</p></body>');
  const a = await page.evaluate(audit);
  const ok = a.fails.length === 1 && a.over && a.words.length === 1;
  console.log(ok ? 'ok   audit self-test' : `FAIL audit self-test ${JSON.stringify(a)}`);
  if (!ok) process.exit(1);
  await page.close();
}
for (const state of pick) {
  const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('qa-theme-set')) { localStorage.setItem('theme', 'light'); sessionStorage.setItem('qa-theme-set', '1'); } } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(base + STATES[state], { waitUntil: 'networkidle' });
  if (state.startsWith('result')) {
    await page.waitForSelector('#h-catches, #result .verdict-word', { timeout: 90_000 });
    await page.waitForFunction(() => !/Checking/.test(document.querySelector('#result .verdict-word')?.textContent || ''), null, { timeout: 120_000 });
  }
  await page.evaluate(() => document.fonts.ready);
  for (const theme of THEMES) {
    await page.evaluate(t => { const r = document.documentElement; if (r.classList.contains('dark') !== (t === 'dark')) document.getElementById('theme-toggle').click(); }, theme);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(350);
      const file = `${out}${state}-${w}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const a = await page.evaluate(audit);
      const bad = a.over || a.fails.length || a.poke.length || a.clipped.length || a.words.length;
      if (bad) problems++;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${state}-${w}-${theme}${a.over ? ` overflow ${a.scrollWidth}>${w}` : ''}`);
      for (const f of a.fails) console.log(`     ${/^(overlap|chart)/.test(f) ? "" : "contrast "}${f}`);
      for (const p of a.poke) console.log(`     past edge ${p}`);
      for (const c of a.clipped) console.log(`     clipped ${c}`);
      if (a.words.length) console.log(`     wording ${a.words.join(', ')}`);
    }
  }
  if (errs.length) { problems++; console.log(`     console errors (${state}): ${[...new Set(errs)].join(' | ')}`); }
  await ctx.close();
}
// prefers-reduced-motion: every transition/animation must collapse to ~0 under reduce
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(); await page.goto(base + '/?demo=loading', { waitUntil: 'networkidle' });
  const moving = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => {
    const s = getComputedStyle(el); const d = v => Math.max(...v.split(',').map(x => parseFloat(x) * (x.includes('ms') ? 1 : 1000)));
    return d(s.transitionDuration) > 10 || (s.animationName !== 'none' && d(s.animationDuration) > 10);
  }).map(el => `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className : el.className.baseVal}`));
  console.log(moving.length ? `FAIL reduced-motion still animates: ${moving.join(', ')}` : 'ok   reduced-motion');
  if (moving.length) problems++;
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} problem(s)` : '\nno problems');
