# Security

## What Copilot Check does

- The report runs entirely in your browser. It reads Hyperliquid's and Strike's **public** APIs directly; there is no server of ours in between, and nothing about a report is stored or logged.
- Paper Copy is the one exception: starting a paper copy stores the wallet and the settings you chose (nothing else) with [Copilot Watch](https://github.com/benryandev/copilot-watch)'s Cloudflare Worker under a random 128-bit id, so the trial link works later. Anyone with the link can view it, nobody can edit it, and it is deleted after 30 days. The trial page replays the wallet in your browser like a report.
- It never asks for a key, signature or wallet connection. The address you paste is a public Hyperliquid address; it goes into the page URL (after `#`, which browsers don't send to the server) so a report can be shared.

## How the page is protected

- Content Security Policy: scripts, styles, fonts and images from this site only; network requests only to `api.hyperliquid.xyz`, `api.strikefinance.org` and the Paper Copy API (`copilot-watch.benryan.workers.dev`); no framing (`frame-ancestors 'none'`). Set in `vercel.json`.
- All data from the APIs is written into the page as text (`textContent`), never as HTML.
- No third-party scripts, analytics, cookies or trackers. No runtime dependencies.

## Reporting a problem

Email ben@benryan.com.au with "Copilot Check security" in the subject. Please don't open a public issue for anything exploitable.
