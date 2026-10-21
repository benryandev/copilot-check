# Security

## What Copilot Check does

- Runs entirely in your browser. It reads Hyperliquid's and Strike's **public** APIs directly; there is no server of ours in between, and nothing is stored or logged by this site.
- It never asks for a key, signature or wallet connection. The address you paste is a public Hyperliquid address; it goes into the page URL (after `#`, which browsers don't send to the server) so a report can be shared.

## How the page is protected

- Content Security Policy: scripts, styles, fonts and images from this site only; network requests only to `api.hyperliquid.xyz` and `api.strikefinance.org`; no framing (`frame-ancestors 'none'`). Set in `vercel.json`.
- All data from the APIs is written into the page as text (`textContent`), never as HTML.
- No third-party scripts, analytics, cookies or trackers. No runtime dependencies.

## Reporting a problem

Email ben@benryan.com.au with "Copilot Check security" in the subject. Please don't open a public issue for anything exploitable.
