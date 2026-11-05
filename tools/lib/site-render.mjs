// Renders the committed site pages from the world's own data: the stops page (every district and stop as
// text), the sitemap, and the review markdown Ben reads before a sheet goes live. Pure strings, no DOM;
// run by tools/site-pages.mjs, checked by qa/site-pages-unit.mjs (drift) and qa/site-render-unit.mjs.

import { SITE, esc, THEME_TOGGLE } from './site-common.mjs';
import { guidePath, guidesForStop, sortedGuides } from './guide-render.mjs';
export { THEME_TOGGLE };
const DOCS = 'https://docs.strikefinance.org';

// Venues (tracks on their own pages, content.js VENUES): a name, one line and a URL. None are open yet, so the lists below
// add nothing while VENUES is empty. A venue's own `line` wins; otherwise a plain default.
export const venueLine = (v) => v.line || `${v.name}, a track on its own page, reached by a road off the ring.`;
const venueList = (ctx) => ctx.venues || [];

// Page order: the hub, the ring clockwise from north (content.js ORDER), then the two off-ring places.
export const ORDER = ['hub', 'perps', 'earn', 'collateral', 'partners', 'developers', 'analytics', 'community', 'token', 'chains', 'raceway', 'yard'];

// One line per district, in the same voice as the sheets (Ben reads these with the review markdown).
const DISTRICT_LINES = {
  hub: 'Strike Finance itself, how a first visit goes, and the platform\'s headline figures.',
  perps: 'Trading on Strike: the markets, the matching engine, orders, margin, liquidations and the bots.',
  earn: 'The vaults, Borrow and Earn, copy trading, points and the LP program.',
  collateral: 'What you can deposit, and what you can borrow against.',
  partners: 'Protocols Strike works with, and the apps that plug Strike in.',
  developers: 'The API, builder codes and market data, and the projects built on Strike.',
  analytics: 'Where Strike\'s numbers and listings live elsewhere.',
  community: 'Referrals, clans, the leaderboard and Strike\'s own channels.',
  token: 'The STRIKE token, staking and revenue share.',
  chains: 'The chains Strike settles on, the custody contracts, validators and the backstop.',
  raceway: 'A time-trial track with a shared leaderboard and the leader\'s ghost.',
  yard: 'Every fill on Strike\'s order books, arriving as crates on a conveyor.',
};

export const stopHref = (key) => `/ecosystem/?stop=${encodeURIComponent(key)}`;
export const districtHref = (key) => `/ecosystem/?district=${encodeURIComponent(key)}`;

// The stops a reader can learn something from: not the empty Builders' Row plots, not the arcade cabinets.
export const publicStops = (stops) => stops.filter((s) => s.shape !== 'plot' && !s.arcade);

// Button text as openStop() in main.js shows it: Strike's own docs read "Docs: …", a third-party page names itself
const docsLabel = (stop) => (stop.docs.startsWith(DOCS) ? `Docs: ${stop.docsLabel}` : stop.docsLabel);
const siteOf = (stop) => (stop.site && stop.site !== stop.docs ? stop.site : null);

const byDistrict = (stops, key) => publicStops(stops).filter((s) => s.district === key);

// A live figure's label. Per-collateral credit-line keys ("lines:<asset>") get their label at runtime in data.js,
// so the static page names them the same way; an unknown key reads as plain words, never as a raw key.
const liveLabel = (k, labels) => labels[k] ?? (k.startsWith('lines:') ? 'Open credit lines' : k.replace(/[_:]+/g, ' '));

function renderStop(stop, labels, guides = {}) {
  const live = stop.live ? `<p class="stop-live">Live on the pad: ${esc(stop.live.map((k) => liveLabel(k, labels)).join(', '))}</p>` : '';
  const guide = guidesForStop(stop.key, guides).map((g) => `        <p class="stop-guide">Read the guide: <a href="${guidePath(g.slug)}">${esc(g.title)}</a></p>`).join('\n');
  const site = siteOf(stop) ? ` <a class="stop-doc" href="${esc(siteOf(stop))}" rel="noopener">${esc(stop.siteLabel || `Visit ${stop.name}`)}</a>` : '';
  return `      <article class="stop district-${esc(stop.district)}" id="stop-${esc(stop.key)}">
        <h3>${esc(stop.name)}</h3>
        <p>${esc(stop.summary)}</p>
        <ul>
${stop.points.map((t) => `          <li>${esc(t)}</li>`).join('\n')}
        </ul>
        ${live}${guide ? `\n${guide}` : ''}
        <p class="stop-actions"><a class="br-button br-button--secondary" href="${stopHref(stop.key)}">Drive there</a> <a class="stop-doc" href="${esc(stop.docs)}" rel="noopener">${esc(docsLabel(stop))}</a>${site}</p>
      </article>`;
}

function renderVenues(venues) {
  if (!venues.length) return '';
  return `
    <section class="district district-venues" id="venues" aria-labelledby="h-venues">
      <h2 id="h-venues">Venues</h2>
      <p class="district-line">Tracks on their own pages, each reached by a road off the ring.</p>
${venues.map((v) => `      <article class="stop district-venues" id="venue-${esc(v.key)}">
        <h3>${esc(v.name)}</h3>
        <p>${esc(venueLine(v))}</p>
        <p class="stop-actions"><a class="br-button br-button--secondary" href="${esc(v.url)}">Drive there</a></p>
      </article>`).join('\n')}
    </section>`;
}

function renderDistrict(key, { stops, districts, labels, guides }) {
  const d = districts[key];
  const drive = key === 'hub' ? '' : ` <a class="district-drive" href="${districtHref(key)}">Drive to this district</a>`;
  return `    <section class="district district-${esc(key)}" id="district-${esc(key)}" aria-labelledby="h-${esc(key)}">
      <h2 id="h-${esc(key)}">${esc(d.name)}</h2>
      <p class="district-line">${esc(DISTRICT_LINES[key] || '')}${drive}</p>
${byDistrict(stops, key).map((s) => renderStop(s, labels, guides)).join('\n')}
    </section>`;
}

// Structured data for the stops page: the page itself and the list of stops (name, one line, its deep link).
// A data block, not a script: the CSP's script-src does not apply to it.
function jsonLd(ctx) {
  const { stops, districts, generated } = ctx;
  // Name and link only: the summaries are already in the page, and repeating 69 of them doubled its size
  const items = publicStops(stops).map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: `${s.name} (${districts[s.district].name})`, url: `${SITE}${stopHref(s.key)}` }));
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${SITE}/ecosystem/stops/`, url: `${SITE}/ecosystem/stops/`, name: 'Every stop in the Strike ecosystem',
        description: 'Every district and every stop in the drivable Strike ecosystem map, as text.', dateModified: generated, inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: 'Copilot Check', url: `${SITE}/` },
        author: { '@type': 'Person', name: 'Ben Ryan', url: 'https://benryan.com.au' } },
      { '@type': 'ItemList', name: 'Stops in the Strike ecosystem world', numberOfItems: items.length, itemListOrder: 'https://schema.org/ItemListOrderAscending', itemListElement: items },
    ],
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function renderStopsPage(ctx) {
  const { stops, districts, order = ORDER, generated } = ctx;
  const n = publicStops(stops).length;
  const nav = order.map((k) => `        <li><a href="#district-${esc(k)}">${esc(districts[k].name)}</a></li>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Every stop in the Strike ecosystem</title>
  <meta name="description" content="Every district and every stop in the drivable Strike ecosystem map, as text: what each feature does, in plain words, with a link that opens the world at that pad.">
  <link rel="canonical" href="${SITE}/ecosystem/stops/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Strike Ecosystem">
  <meta property="og:title" content="Every stop in the Strike ecosystem">
  <meta property="og:description" content="The drivable Strike map as text: ${n} stops across ${order.length} districts, each with a link into the world.">
  <meta property="og:url" content="${SITE}/ecosystem/stops/">
  <meta property="og:image" content="${SITE}/ecosystem/img/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Strike Ecosystem: an aerial view of Strike HQ and the dirt roads out to its districts.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Every stop in the Strike ecosystem">
  <meta name="twitter:description" content="The drivable Strike map as text: ${n} stops across ${order.length} districts, each with a link into the world.">
  <meta name="twitter:image" content="${SITE}/ecosystem/img/og.png">
  <script type="application/ld+json">${jsonLd(ctx)}</script>
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/img/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  <link rel="preload" href="/fonts/AtkinsonHyperlegibleNext-Variable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/br-fonts.css">
  <link rel="stylesheet" href="/css/br-tokens.css">
  <link rel="stylesheet" href="/css/br-base.css">
  <link rel="stylesheet" href="/css/br-components.css">
  <link rel="stylesheet" href="/css/page.css">
  <link rel="stylesheet" href="/ecosystem/stops/stops.css">
  <link rel="stylesheet" href="/ecosystem/guides/stills.css">
  <script src="/src/theme.js"></script>
</head>
<body class="stops-page" data-stop="strike">
  <a class="skip" href="#main">Skip to the stops</a>
  <div class="guide-back" aria-hidden="true"></div>
  <header class="stops-head">
    <div class="wrap">
      <div class="topbar">
        <p class="sm">Strike ecosystem<span class="eyebrow-tail"> · as text</span></p>
        ${THEME_TOGGLE}
      </div>
      <h1>Every stop in the Strike ecosystem</h1>
      <p class="lede">Every district and every stop in the drivable map, as text. Each "Drive there" opens the world at that pad. Figures marked live are read from Strike's public API on the pad itself.</p>
      <p class="stops-actions"><a class="br-button" href="/ecosystem/">Drive the world</a> <a class="br-button br-button--secondary" href="/">Copilot Check</a></p>
    </div>
  </header>
  <div class="wrap stops-body">
    <nav class="stops-nav" aria-label="Districts">
      <details class="stops-jump" id="stops-jump">
        <summary>Jump to a district</summary>
        <ul>
${nav}${venueList(ctx).length ? '\n        <li><a href="#venues">Venues</a></li>' : ''}
        </ul>
      </details>
    </nav>
    <main class="stops-main" id="main">
${order.map((k) => renderDistrict(k, ctx)).join('\n')}${renderVenues(venueList(ctx))}
    </main>
  </div>
  <footer class="br-band-dark">
    <div class="wrap">
      <p class="foot-note">Live data: Strike public API. Text paraphrases Strike's docs and links the page it came from. General information only, not financial advice.</p>
      <p class="foot-note foot-credit"><img src="/img/br-logo-white.svg" alt="" width="32" height="15"> <span>Independent, not affiliated with Strike. Built by <a href="https://benryan.com.au">Ben Ryan</a>. Made with <a href="https://threejs.org" rel="noopener">three.js</a>. Source on <a href="https://github.com/benryandev/copilot-check">GitHub</a>. Generated ${esc(generated)}.</span></p>
    </div>
  </footer>
  <script src="/src/theme-toggle.js"></script>
  <script src="/src/stops.js"></script>
</body>
</html>
`;
}

export function renderSitemap(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>\n    <loc>${esc(e.loc)}</loc>\n    <lastmod>${esc(e.lastmod)}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;
}

// /llms.txt (llmstxt.org): the site's name, a one-paragraph summary, then the tools, the world and the guides, each
// entry a link and one line. The guides come from guides.json, so a new guide appears on the next site-pages run.
// No dates inside, so the file's bytes move only when an entry does.
export function renderLlmsTxt({ guides, venues = [] }) {
  const entry = (name, url, line) => `- [${name}](${url}): ${line}`;
  const guideEntries = sortedGuides(guides).map((g) => entry(g.title, SITE + guidePath(g.slug), g.subtitle));
  const venueSection = venues.length ? `## Venues

${venues.map((v) => entry(v.name, SITE + v.url, venueLine(v))).join('\n')}

` : '';
  return `# Copilot Check

> Independent tools for copy trading on Strike Finance, a perpetuals exchange on Cardano that mirrors Hyperliquid wallets: check a wallet before copying it, paper-copy it with your own settings, get an alert when a copy needs a look, and learn Strike through a drivable 3D map of its ecosystem and plain-English guides.

Built by Ben Ryan. Not affiliated with Strike Finance. Not financial advice; past results do not predict future ones. The tools run in the browser against Strike's and Hyperliquid's public APIs and store nothing about a visitor; a paper copy keeps only the wallet and its settings, for 30 days. Source: https://github.com/benryandev/copilot-check.

## Tools

${entry('Copilot Check', SITE + '/', 'paste a Hyperliquid wallet and see how much of its profit Strike can copy, what it holds now, the catches in its record, and how a copy would have done at your size in both copy modes.')}
${entry('Paper copy', SITE + '/paper.html', 'a paper copy of a wallet with your Strike copy settings, replayed on its real trades with no money; started from a report, or with /paper in Copilot Watch.')}
${entry('Copilot Watch', 'https://t.me/CopilotWatchBot', 'a Telegram bot that sends Telegram and Discord alerts when a copy needs a look; source at https://github.com/benryandev/copilot-watch.')}

## The ecosystem world

${entry('Strike Ecosystem', SITE + '/ecosystem/', 'a drivable 3D map of Strike\'s features, with districts on dirt roads around Strike HQ, a pad at every feature that opens a sheet with live figures, a raceway, and a yard where every trade on Strike arrives as a crate.')}
${entry('Every stop, as text', SITE + '/ecosystem/stops/', 'every district and every stop in the world as plain text, what each feature does, each with a link that opens the world at that pad.')}

${venueSection}## Guides

${entry('Strike guides: start here', SITE + '/ecosystem/guides/', 'plain-English guides to Strike, from what a perp is to a first small trade, each one opening inside the world.')}
${guideEntries.join('\n')}
`;
}

export function renderReview(ctx) {
  const { stops, districts, order = ORDER, labels, generated } = ctx;
  const n = publicStops(stops).length;
  const out = [`# Ecosystem world: every sheet for review (generated ${generated})`, '',
    `Generated from \`ecosystem/js/stops.js\` by \`tools/site-pages.mjs\`; do not edit by hand. ${n} stops. Empty Builders' Row plots and arcade cabinets are left out.`, ''];
  for (const k of order) {
    out.push(`## ${districts[k].name}`, '', DISTRICT_LINES[k] || '', '');
    for (const s of byDistrict(stops, k)) {
      out.push(`### ${s.name}`, '', s.summary, '');
      for (const t of s.points) out.push(`- ${t}`);
      out.push('');
      const live = s.live ? ` · live: ${s.live.map((x) => liveLabel(x, labels)).join(', ')}` : '';
      const site = siteOf(s) ? ` · [${s.siteLabel || `Visit ${s.name}`}](${siteOf(s)})` : '';
      out.push(`Link: [${docsLabel(s)}](${s.docs})${site}${live}`, '');
      for (const g of guidesForStop(s.key, ctx.guides || {})) out.push(`Guide: ${g.title} (${guidePath(g.slug)})`, '');
    }
  }
  return out.join('\n');
}
