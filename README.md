# Copilot Check

Paste a Hyperliquid wallet and see whether it's worth copying on Strike: how much of its profit is on markets Strike lists, what it holds now, the catches in its record, and how a copy would have done at your size. Then paper-copy it with your own settings before risking money.

**Try it:** [strike.benryan.com.au](https://strike.benryan.com.au)

Built during the Strike Finance hackathon (22–24 Oct 2026). Not affiliated with Strike Finance. Not financial advice. Past results don't predict future ones.

## What the report shows

- **Verdict:** a short headline and one descriptive sentence, plus the most serious catch.
- **Strike fit:** the share of the wallet's realised P&L (last 90 days, and last 14) that comes from markets Strike lists. A copy can only follow those.
- **What it holds now:** open positions, leverage, distance to liquidation, listed or not.
- **Catches:** wipeouts in its history, high leverage now, close to liquidation on Hyperliquid, young record, profit drifting to unlisted markets, concentration in one coin, large withdrawals, last month's loss.
- **The replay at your size:** every trade the wallet made on a Strike market, copied the way Strike copies, in both copy modes (fixed margin, fixed ratio) at 10x, 5x and 3x, over 90 and 30 days. It uses Strike's fees (0.05% per side by default, editable), closes 10 bp worse, hourly prices, Strike's margin tiers and liquidations. The page says which setting made the most per dollar of drawdown in the replay, described as a fact about the past, not a setting to use.
- **Month by month:** the wallet's own P&L.

## Paper Copy

From a report, or with `/paper <wallet>` in [Copilot Watch](https://t.me/CopilotWatchBot), start a paper copy with your own settings (mode, amount, leverage, isolated or cross, caps, excluded markets). It is back-dated 14 days so it has numbers straight away, and every time the trial page opens it replays the wallet's real trades since then: paper equity, open positions, each entry copied or skipped (and why), the same period under other settings, and the exact fields to enter in Strike's copy dialog to go live. Trials store only the wallet and settings, and end after 30 days.

## How it uses Strike

The report runs in the browser against public APIs; there is no server of ours and nothing about a report is stored. Paper Copy stores only the wallet and settings, with Copilot Watch's Worker, for 30 days.

| Need | Source |
|---|---|
| Strike's markets, minimum order size, margin tiers (max leverage and maintenance margin by size) | Strike `GET /v2/markets` |
| Strike symbol ↔ Hyperliquid coin (including stocks and commodities on Hyperliquid's `xyz` dex: SKHYNIX, XAU, XAG, WTI, NAS100) | `core/markets.js` |
| The wallet's fills (paged, up to 20,000), positions on both dexes, equity history, deposits and withdrawals, hourly candles | Hyperliquid info API |
| "Open in Strike" | `app.strikefinance.org/public-portfolio/<wallet>?platform=hyperliquid` |

The replay (`core/replay.js`) is a line-for-line port of [Strike Copilot](https://github.com/benryandev/strike-copilot)'s Python replay, and is tested against it: `test/replay-parity.test.js` checks 36 cases on three real wallets (2 windows × 2 modes × 3 leverages) for the same net and drawdown within $5 and the same liquidations, entries and wipeouts.

## Run it locally

```sh
pnpm test            # node --test, no dependencies
node qa/serve.mjs    # http://localhost:8080 with the production security headers
```

`core/` is shared with [Copilot Watch](https://github.com/benryandev/copilot-watch); `pnpm core-hash` updates `core/VERSION`, which Watch checks after copying.

## Limits

- Funding is not modelled; neither is Strike's liquidation fee.
- Up to 20,000 fills and hourly prices for the 12 most-traded markets per check, so a very busy wallet is replayed over 30 days only, and a few markets may be replayed without hourly prices (liquidations there aren't checked). The report says when either happens.
- Hyperliquid rate-limits by IP; a busy moment shows "Hyperliquid is busy. Try again in a minute."

## Privacy and security

No accounts, cookies, analytics or keys. A paper copy stores only the wallet and settings (30 days); a report stores nothing. The wallet you paste goes into the URL after `#` (never sent to the server) so a report can be shared. Strict Content Security Policy; all API data is rendered as text. See [SECURITY.md](SECURITY.md).

## Design

Styled with Ben Ryan's design kit (`css/br-*.css`, `fonts/`), copied in before the hackathon window opened as existing brand work; the page's own styles are in `css/app.css` and `css/paper.css`. Fonts: Inter, Geist Mono and Atkinson Hyperlegible Next, each under the SIL Open Font License 1.1 (see `fonts/*-OFL.txt`). The BR. logo is Ben Ryan's mark and isn't covered by the code licence.

## Licence

Code: MIT (see `LICENSE`). Fonts: SIL OFL 1.1.

Built by [Ben Ryan](https://benryan.com.au).
