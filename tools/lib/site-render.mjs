// Renders the committed site pages from the world's own data: the stops page (every district and stop as
// text), the sitemap, and the review markdown Ben reads before a sheet goes live. Pure strings, no DOM;
// run by tools/site-pages.mjs, checked by qa/site-pages-unit.mjs (drift) and qa/site-render-unit.mjs.

const SITE = 'https://strike.benryan.com.au';
const DOCS = 'https://docs.strikefinance.org';

// Page order: the hub, the ring clockwise from north (content.js ORDER), then the two off-ring places.
export const ORDER = ['hub', 'perps', 'earn', 'collateral', 'partners', 'developers', 'analytics', 'community', 'token', 'chains', 'raceway', 'yard'];

// One line per district, in the same voice as the sheets (Ben reads these with the review markdown).
const DISTRICT_LINES = {
  hub: 'Strike Finance itself, with the platform\'s headline figures.',
  perps: 'Trading on Strike: the markets, the matching engine, orders, margin, liquidations and the bots.',
  earn: 'The vaults, Borrow and Earn, copy trading, points and the LP program.',
  collateral: 'What you can deposit, and what you can borrow against.',
  partners: 'Protocols Strike works with.',
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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Button text as openStop() in main.js shows it: Strike's own docs read "Docs: …", a third-party page names itself
const docsLabel = (stop) => (stop.docs.startsWith(DOCS) ? `Docs: ${stop.docsLabel}` : stop.docsLabel);
const siteOf = (stop) => (stop.site && stop.site !== stop.docs ? stop.site : null);

const byDistrict = (stops, key) => publicStops(stops).filter((s) => s.district === key);

function renderStop(stop, labels) {
  const live = stop.live ? `<p class="stop-live">Live on the pad: ${esc(stop.live.map((k) => labels[k] ?? k).join(', '))}</p>` : '';
  const site = siteOf(stop) ? ` <a class="br-button br-button--secondary" href="${esc(siteOf(stop))}" rel="noopener">${esc(stop.siteLabel || `Visit ${stop.name}`)}</a>` : '';
  return `      <article class="stop district-${esc(stop.district)}" id="stop-${esc(stop.key)}">
        <h3>${esc(stop.name)}</h3>
        <p>${esc(stop.summary)}</p>
        <ul>
${stop.points.map((t) => `          <li>${esc(t)}</li>`).join('\n')}
        </ul>
        ${live}
        <p class="stop-actions"><a class="br-button" href="${stopHref(stop.key)}">Drive there</a> <a class="br-button br-button--secondary" href="${esc(stop.docs)}" rel="noopener">${esc(docsLabel(stop))}</a>${site}</p>
      </article>`;
}

function renderDistrict(key, { stops, districts, labels }) {
  const d = districts[key];
  const drive = key === 'hub' ? '' : ` <a class="district-drive" href="${districtHref(key)}">Drive to this district</a>`;
  return `    <section class="district district-${esc(key)}" id="district-${esc(key)}" aria-labelledby="h-${esc(key)}">
      <h2 id="h-${esc(key)}">${esc(d.name)}</h2>
      <p class="district-line">${esc(DISTRICT_LINES[key] || '')}${drive}</p>
${byDistrict(stops, key).map((s) => renderStop(s, labels)).join('\n')}
    </section>`;
}

// Structured data for the stops page: the page itself and the list of stops (name, one line, its deep link).
// A data block, not a script: the CSP's script-src does not apply to it.
function jsonLd(ctx) {
  const { stops, districts, generated } = ctx;
  const items = publicStops(stops).map((s, i) => ({
    '@type': 'ListItem', position: i + 1, name: s.name, description: s.summary, url: `${SITE}${stopHref(s.key)}`,
    item: { '@type': 'Thing', name: s.name, description: s.summary, url: `${SITE}${stopHref(s.key)}`, additionalType: districts[s.district].name },
  }));
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
  <link rel="stylesheet" href="/css/br.css">
  <link rel="stylesheet" href="/css/app.css">
  <link rel="stylesheet" href="/ecosystem/stops/stops.css">
  <script src="/src/theme.js"></script>
</head>
<body class="stops-page">
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
      <ul>
${nav}
      </ul>
    </nav>
    <main class="stops-main" id="main">
${order.map((k) => renderDistrict(k, ctx)).join('\n')}
    </main>
  </div>
  <footer class="br-band-dark">
    <div class="wrap">
      <p class="foot-note">Live data: Strike public API. Text paraphrases Strike's docs and links the page it came from. General information only, not financial advice.</p>
      <p class="foot-note foot-credit"><img src="/img/br-logo-white.svg" alt="" width="32" height="15"> <span>Independent, not affiliated with Strike. Built by <a href="https://benryan.com.au">Ben Ryan</a>. Made with <a href="https://threejs.org" rel="noopener">three.js</a>. Source on <a href="https://github.com/benryandev/copilot-check">GitHub</a>. Generated ${esc(generated)}.</span></p>
    </div>
  </footer>
  <script src="/src/theme-toggle.js"></script>
</body>
</html>
`;
}

// The Check page's toggle, verbatim (index.html), so the pages feel like one site
export const THEME_TOGGLE = `<button class="theme-toggle" type="button" aria-label="Switch to dark mode" id="theme-toggle">
          <svg class="theme-toggle-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <g class="theme-toggle-rays">
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </g>
            <path class="theme-toggle-path" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
        </button>`;

export function renderSitemap(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>\n    <loc>${esc(e.loc)}</loc>\n    <lastmod>${esc(e.lastmod)}</lastmod>\n  </url>`).join('\n')}
</urlset>
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
      const live = s.live ? ` · live: ${s.live.map((x) => labels[x] ?? x).join(', ')}` : '';
      const site = siteOf(s) ? ` · [${s.siteLabel || `Visit ${s.name}`}](${siteOf(s)})` : '';
      out.push(`Link: [${docsLabel(s)}](${s.docs})${site}${live}`, '');
    }
  }
  return out.join('\n');
}
