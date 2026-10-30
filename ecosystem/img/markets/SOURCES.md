# Market crate logos

All 34 icons are Strike Finance's own market icons, as its trading app shows them.
Downloaded 2026-10-30 from `https://app.strikefinance.org/images/<symbol>.webp`
(CXMT: `/images/cxmt.svg`). The paths come from the market registry in the app's JS bundle
(`{symbol, baseSymbol, imageURL, noBg, ...}`); the app falls back to
`https://app.hyperliquid.xyz/coins/<symbol>.svg` only for symbols missing from that registry,
and none of these 34 are.

Converted to 128 x 128 PNG (resized, centred on transparent padding where not square,
metadata stripped). The game clips each to a circle, as the app does (`rounded-full`,
`object-cover`). ADA, NEAR and NIGHT lack `noBg` in the registry, so like the app they sit on
a text-colour disc.

| Symbol | Source path |
|---|---|
| AAOI | /images/aaoi.webp |
| ADA | /images/ada.webp |
| BNB | /images/bnb.webp |
| BTC | /images/btc.webp |
| COIN | /images/coin.webp |
| CRCL | /images/crcl.webp |
| CXMT | /images/cxmt.svg |
| DOGE | /images/doge.webp |
| DRAM | /images/dram.webp |
| ETH | /images/eth.webp |
| GOOGL | /images/googl.webp |
| HYPE | /images/hype.webp |
| LIT | /images/lit.webp |
| MINIMAX | /images/minimax.webp |
| MU | /images/mu.webp |
| NAS100 | /images/nas100.webp |
| NEAR | /images/near.webp |
| NIGHT | /images/night.webp |
| NVDA | /images/nvda.webp |
| PUMP | /images/pump.webp |
| SKHYNIX | /images/skhynix.webp |
| SNDK | /images/sndk.webp |
| SOL | /images/sol.webp |
| SP500 | /images/sp500.webp |
| SPCX | /images/spcx.webp |
| SUI | /images/sui.webp |
| TSLA | /images/tsla.webp |
| UNITREE | /images/unitree.webp |
| WTI | /images/wti.webp |
| XAG | /images/xag.webp |
| XAU | /images/xau.webp |
| XRP | /images/xrp.webp |
| ZEC | /images/zec.webp |
| ZHIPU | /images/zhipu.webp |

A market added later without a file here keeps the text-only crate face.
