// The markdown subset the guide build accepts (tools/lib/md.mjs): node --test qa/md-unit.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { mdToHtml, slugify } from '../tools/lib/md.mjs';

test('headings get ids, paragraphs wrap, inline marks and links render', () => {
  assert.equal(mdToHtml('## What is a perp?\n\nA **perp** is a *contract*. See [the docs](https://docs.strikefinance.org/x).'),
    '<h2 id="what-is-a-perp">What is a perp?</h2>\n<p>A <strong>perp</strong> is a <em>contract</em>. See <a href="https://docs.strikefinance.org/x" rel="noopener">the docs</a>.</p>');
  assert.equal(slugify('Long, short & leverage'), 'long-short-leverage');
});
test('lists, tables, blockquotes with a title, hr', () => {
  assert.equal(mdToHtml('- one\n- two'), '<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
  assert.equal(mdToHtml('1. Go\n2. Deposit'), '<ol>\n<li>Go</li>\n<li>Deposit</li>\n</ol>');
  assert.equal(mdToHtml('| Type | Examples |\n|---|---|\n| Crypto | BTC, ETH |'),
    '<table>\n<thead><tr><th>Type</th><th>Examples</th></tr></thead>\n<tbody>\n<tr><td>Crypto</td><td>BTC, ETH</td></tr>\n</tbody>\n</table>');
  assert.equal(mdToHtml('> **How I use it**\n> I copy two traders.'), '<blockquote>\n<p class="callout-title">How I use it</p>\n<p>I copy two traders.</p>\n</blockquote>');
  assert.equal(mdToHtml('---'), '<hr>');
});
test('images go through the hook; text is escaped; unsupported syntax throws', () => {
  assert.equal(mdToHtml('![The trade page](img/trade.png)', { image: (s, a) => `<figure><img src="${s}" alt="${a}"></figure>` }), '<figure><img src="img/trade.png" alt="The trade page"></figure>');
  assert.equal(mdToHtml('Fees < 0.1% & "fair"'), '<p>Fees &lt; 0.1% &amp; &quot;fair&quot;</p>');
  assert.throws(() => mdToHtml('# Title'), /unsupported markdown/);
  assert.throws(() => mdToHtml('```js\nx\n```'), /unsupported markdown/);
  assert.throws(() => mdToHtml('<div>x</div>'), /unsupported markdown/);
});
test('internal and relative links carry no rel; a heading inside a paragraph run is still a heading', () => {
  assert.equal(mdToHtml('[Guides](/ecosystem/guides/) and [site](https://strike.benryan.com.au/)'), '<p><a href="/ecosystem/guides/">Guides</a> and <a href="https://strike.benryan.com.au/">site</a></p>');
  assert.equal(mdToHtml('Para one\nstill one\n### Sub\nPara two'), '<p>Para one still one</p>\n<h3 id="sub">Sub</h3>\n<p>Para two</p>');
});
