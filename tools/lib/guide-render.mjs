// Renders the guides from tools/lib/guides.json (built by tools/guide-build.mjs): one static page per guide at
// /ecosystem/guides/<slug>/, the index at /ecosystem/guides/, the per-stop still CSS, and ecosystem/js/guides.js
// (the world's list of guides, so a stop sheet can say "Read the guide"). Pure strings; run by tools/site-pages.mjs.
// A guide page needs no JavaScript to read; the theme toggle is progressive. Unit tests: qa/guides-render-unit.mjs.
import { SITE, esc, ICON_LINKS, KIT_LINKS, THEME_TOGGLE, WORLD_FOOT } from './site-common.mjs';

export const guidePath = (slug) => `/ecosystem/guides/${encodeURIComponent(slug)}/`;
const SERIES = { 'start-here': 'Start here', feature: 'Strike guide' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const longDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

const list = (guides) => (Array.isArray(guides) ? guides : Object.values(guides));
const bySeries = (a, b) => (a.series === b.series ? a.order - b.order : a.series === 'start-here' ? -1 : 1);
export const sortedGuides = (guides) => list(guides).slice().sort(bySeries);
export const guidesForStop = (stopKey, guides) => sortedGuides(guides).filter((g) => g.stop === stopKey);

// Start Here is a fixed series of five (the 18 Oct spec), so the label counts to five even while guides are still arriving
const START_HERE_COUNT = 5;
const seriesLabel = (g) => (g.series === 'start-here' ? `Start here · ${g.order + 1} of ${START_HERE_COUNT}` : 'Strike guide');
const jsonLd = (graph) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
const website = { '@type': 'WebSite', name: 'Copilot Check', url: `${SITE}/` };
const author = { '@type': 'Person', name: 'Ben Ryan', url: 'https://benryan.com.au' };
const publisher = { '@type': 'Organization', name: 'Copilot Check', url: `${SITE}/` };

// The shell every world-dressed page shares: head, backdrop, HUD, sheet, footer
function shell({ title, description, canonical, ogType, ogImage, ogAlt, extraMeta = '', ld, stop, districtName, eyebrow, main }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="Strike Ecosystem">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage.url}">
  <meta property="og:image:width" content="${ogImage.width}">
  <meta property="og:image:height" content="${ogImage.height}">
  <meta property="og:image:alt" content="${esc(ogAlt)}">
${extraMeta}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${ogImage.url}">
  ${jsonLd(ld)}
${ICON_LINKS}
${KIT_LINKS}
  <link rel="stylesheet" href="/css/page.css">
  <link rel="stylesheet" href="/ecosystem/ecosystem.css">
  <link rel="stylesheet" href="/ecosystem/guides/guides.css">
  <link rel="stylesheet" href="/ecosystem/guides/stills.css">
  <script src="/src/theme.js"></script>
</head>
<body class="guide-page" data-stop="${esc(stop)}">
  <a class="skip" href="#main">Skip to the guide</a>
  <div class="guide-back" aria-hidden="true"></div>
  <header class="hud hud-top">
    <div class="hud-title">
      <p class="br-label">${esc(eyebrow)}</p>
      <p class="hud-district">${esc(districtName)}</p>
    </div>
    <div class="hud-actions">
      <a class="chip" href="/ecosystem/guides/">All guides</a>
      <a class="chip" href="/ecosystem/">Drive</a>
      ${THEME_TOGGLE}
    </div>
  </header>
  <main id="main" class="sheet guide-sheet">
${main}
  </main>
${WORLD_FOOT}
  <script src="/src/theme-toggle.js"></script>
</body>
</html>
`;
}

const wrapTables = (html) => html.replace(/<table>/g, '<div class="table"><table>').replace(/<\/table>/g, '</table></div>');

export function renderGuidePage(g, { guides, stops, districts }) {
  const stop = stops.find((s) => s.key === g.stop);
  const district = districts[stop.district];
  const canonical = `${SITE}${guidePath(g.slug)}`;
  const cover = `${SITE}/ecosystem/guides/img/${g.slug}/cover.png`;
  const next = g.next ? list(guides).find((x) => x.slug === g.next) : null;
  const faqHtml = g.faq.map((f) => `        <h3>${esc(f.q)}</h3>\n        <p>${esc(f.a)}</p>`).join('\n');
  const toc = g.words >= 700 ? `      <nav class="guide-toc" aria-label="On this page"><p class="br-label">On this page</p><ol>\n${g.toc.map((t) => `        <li><a href="#${esc(t.id)}">${esc(t.title)}</a></li>`).join('\n')}\n      </ol></nav>\n` : '';
  const ld = [
    { '@type': 'Article', '@id': `${canonical}#article`, headline: g.title, description: g.subtitle, image: cover, datePublished: g.published, dateModified: g.modified,
      author, publisher, mainEntityOfPage: canonical, isPartOf: website, inLanguage: 'en', isAccessibleForFree: true, wordCount: g.words, about: { '@type': 'Thing', name: 'Strike Finance' } },
    { '@type': 'FAQPage', '@id': `${canonical}#faq`, mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Strike ecosystem', item: `${SITE}/ecosystem/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/ecosystem/guides/` },
      { '@type': 'ListItem', position: 3, name: g.title, item: canonical } ] },
  ];
  const html = wrapTables(g.html);
  if (html.includes('{{')) throw new Error(`${g.slug}: unfilled claim in the output`);
  // The FAQ goes after Things worth knowing, before How I use it and Next (the template order)
  const cutAt = ['<h2 id="how-i-use-it">', '<h2 id="next">'].map((m) => html.indexOf(m)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? html.length;
  const faqSection = `      <section class="guide-faq">
        <h2 id="questions-people-ask">Questions people ask</h2>
${faqHtml}
      </section>`;
  const bodyHtml = `${html.slice(0, cutAt)}\n      </div>\n${faqSection}\n      <div class="guide-body">\n${html.slice(cutAt)}`;
  const main = `    <article class="guide-article">
      <p class="br-label">${esc(seriesLabel(g))}</p>
      <h1 id="guide-title">${esc(g.title)}</h1>
      <p class="guide-sub">${esc(g.subtitle)}</p>
      <p class="guide-meta">Published ${longDate(g.published)} · Facts checked ${longDate(g.checked)} · By <a href="https://benryan.com.au">Ben Ryan</a></p>
      <p class="muted guide-disclosure">Not affiliated with Strike. Not financial advice.</p>
      <section class="guide-minute">
        <h2 id="in-one-minute">In one minute</h2>
        ${g.inOneMinute}
      </section>
${toc}      <div class="guide-body">
${bodyHtml}
      </div>
      <p class="muted guide-disclosure">Not financial advice.</p>
      <div class="sheet-actions">
        <a class="br-button guide-drive" href="/ecosystem/?stop=${encodeURIComponent(g.stop)}"><span class="br-button-label">Drive there</span></a>
${next ? `        <a class="br-button br-button--secondary" href="${guidePath(next.slug)}"><span class="br-button-label">Read next: ${esc(next.title.split(/[?:.]/)[0] + (next.title.includes('?') ? '?' : ''))}</span></a>\n` : ''}        <a class="br-button br-button--secondary" href="/ecosystem/guides/"><span class="br-button-label">All guides</span></a>
      </div>
    </article>`;
  return shell({
    title: `${g.title} · Strike guides`, description: g.subtitle, canonical, ogType: 'article',
    ogImage: { url: cover, width: 1500, height: 600 }, ogAlt: g.title,
    extraMeta: `  <meta property="article:published_time" content="${g.published}">\n  <meta property="article:modified_time" content="${g.modified}">\n  <meta property="article:author" content="https://benryan.com.au">\n`,
    ld, stop: g.stop, districtName: district.name, eyebrow: 'Strike ecosystem · guide', main,
  });
}

export function renderGuidesIndex(file, { stops, districts }) {
  const all = sortedGuides(file.guides);
  const canonical = `${SITE}/ecosystem/guides/`;
  const card = (g) => `        <li><a class="guide-card" href="${guidePath(g.slug)}">
          <img src="/ecosystem/guides/img/${esc(g.slug)}/cover.png" alt="" width="750" height="300" loading="lazy">
          <span class="guide-card-text"><span class="br-label">${esc(seriesLabel(g))}</span><strong>${esc(g.title)}</strong><span class="muted">${esc(g.subtitle)}</span><span class="guide-card-date">Published ${longDate(g.published)}</span></span>
        </a></li>`;
  const start = all.filter((g) => g.series === 'start-here'), features = all.filter((g) => g.series === 'feature');
  const ld = [
    { '@type': 'CollectionPage', '@id': canonical, url: canonical, name: 'Strike guides: start here', description: 'Plain-English guides to Strike Finance, from what a perp is to your first small trade, each one opening inside the drivable ecosystem map.', dateModified: file.generated, isPartOf: website, author, inLanguage: 'en' },
    { '@type': 'ItemList', name: 'Strike guides', numberOfItems: all.length, itemListOrder: 'https://schema.org/ItemListOrderAscending', itemListElement: all.map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: g.title, url: `${SITE}${guidePath(g.slug)}` })) },
  ];
  const main = `    <article class="guide-article guide-index">
      <p class="br-label">Strike guides</p>
      <h1 id="guide-title">Learn Strike from zero</h1>
      <p class="guide-sub">Plain-English guides to Strike Finance, written by someone who uses it: what a perp is, what leverage does, how liquidation works, and how a first small trade goes. Each guide opens inside the drivable ecosystem map, at the place it is about.</p>
      <p class="muted guide-disclosure">Not affiliated with Strike. Not financial advice.</p>
      <section>
        <h2 id="start-here">Start here</h2>
        <ol class="guide-cards">
${start.map(card).join('\n')}
        </ol>
      </section>
${features.length ? `      <section>\n        <h2 id="feature-guides">Feature guides</h2>\n        <ul class="guide-cards">\n${features.map(card).join('\n')}\n        </ul>\n      </section>\n` : ''}      <div class="sheet-actions">
        <a class="br-button guide-drive" href="/ecosystem/?stop=getting-started"><span class="br-button-label">Drive to Getting started</span></a>
        <a class="br-button br-button--secondary" href="/ecosystem/stops/"><span class="br-button-label">Every stop as text</span></a>
      </div>
    </article>`;
  return shell({
    title: 'Strike guides: start here', description: ld[0].description, canonical, ogType: 'website',
    ogImage: { url: `${SITE}/ecosystem/img/og.png`, width: 1200, height: 630 }, ogAlt: 'Strike Ecosystem: an aerial view of Strike HQ and the dirt roads out to its districts.',
    ld, stop: 'strike', districtName: districts.hub.name, eyebrow: 'Strike ecosystem · guides', main,
  });
}

// One backdrop per stop that has a guide (plus the hub, for the stops page and the index): 960 by default, 1920
// from 961 px, both themes. The selector is the body attribute alone so the stops page shares the file.
export function renderStillsCss(file) {
  const keys = [...new Set(['strike', ...list(file.guides).map((g) => g.stop)])].sort();
  const still = (k, theme, w) => `/ecosystem/guides/img/stills/${k}-${theme}-${w}.jpg`;
  const rules = (w) => keys.map((k) => `[data-stop="${k}"] .guide-back { background-image: url(${still(k, 'light', w)}); }\n:root.dark [data-stop="${k}"] .guide-back { background-image: url(${still(k, 'dark', w)}); }`).join('\n');
  return `/* Generated by tools/site-pages.mjs from tools/lib/guides.json: the world still behind each guide page. Do not edit. */\n${rules(960)}\n@media (min-width: 961px) {\n${rules(1920).split('\n').map((l) => `  ${l}`).join('\n')}\n}\n`;
}

export function renderGuidesModule(file) {
  const items = sortedGuides(file.guides).map((g) => ({ slug: g.slug, title: g.title, stop: g.stop, series: g.series, order: g.order, path: guidePath(g.slug) }));
  return `// Generated by tools/site-pages.mjs from tools/lib/guides.json: the guides the world links from its stop sheets. Do not edit.
export const GUIDES = ${JSON.stringify(items, null, 2)};
export const guidesForStop = (stopKey) => GUIDES.filter((g) => g.stop === stopKey);
`;
}
