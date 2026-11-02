// Pieces every generated page shares (the stops page, the guides): the site origin, escaping, the kit's head links,
// icons, and the Check page's theme toggle, so the pages feel like one site.
export const SITE = 'https://strike.benryan.com.au';
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ICON_LINKS = `  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/img/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">`;

export const KIT_LINKS = `  <link rel="preload" href="/fonts/AtkinsonHyperlegibleNext-Variable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/br-fonts.css">
  <link rel="stylesheet" href="/css/br-tokens.css">
  <link rel="stylesheet" href="/css/br-base.css">
  <link rel="stylesheet" href="/css/br-components.css">`;

// The Check page's toggle, verbatim (index.html)
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

// The world's footer line set (ecosystem/index.html), on every page dressed as the world
export const WORLD_FOOT = `  <footer class="hud hud-foot">
    <span class="foot-live">Live data: Strike public API ·</span>
    <span class="foot-credit">Made with <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a></span>
    <span><span class="foot-long">Independent, not affiliated with Strike</span><span class="foot-short">Not affiliated with Strike</span></span>
    <span class="foot-by">· Built by <a href="https://benryan.com.au" target="_blank" rel="noopener">Ben Ryan</a> · <a href="https://github.com/benryandev/copilot-check" target="_blank" rel="noopener">Source</a></span>
  </footer>`;
