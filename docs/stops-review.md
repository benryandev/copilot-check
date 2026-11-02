# Ecosystem world: every sheet for review (generated 2026-11-02)

Generated from `ecosystem/js/stops.js` by `tools/site-pages.mjs`; do not edit by hand. 70 stops. Empty Builders' Row plots and arcade cabinets are left out.

## Strike HQ

Strike Finance itself, how a first visit goes, and the platform's headline figures.

### Strike Finance

A perpetuals exchange with its own execution layer and settlement on several chains. Strike V1 launched on Cardano in May 2025; V2 moved to a central limit order book.

- Matching, positions, liquidations and funding run on the Strike Node.
- Deposits sit in on-chain locker contracts, with validators signing deposits and withdrawals.
- There's a mobile app, a full API for bots and tools, and fiat on and off ramps.
- The Open Strike button uses Ben Ryan's referral code.

Link: [Docs: Welcome](https://docs.strikefinance.org/getting-started/welcome) · [Open Strike](https://app.strikefinance.org/trade/BTC?referralCode=BenRyan) · live: Users, all time, Volume, all time, 24 h volume

### Getting started

A first visit, from sign-in to a funded account. Sign in with a wallet on Cardano, Ethereum, Solana and more; deposit crypto on any supported chain or pay by card; your balance is held in USD.

- Two ways to fund it (checked in the app on 3 November 2026): send crypto from a Cardano, Ethereum, Solana, Base, Arbitrum or Bitcoin wallet, or pay by card up to $50,000 (Visa or Mastercard). Bank transfer is marked coming soon.
- Every deposit is quoted and verified by Strike's validators, and a volatile asset such as ADA or ETH is swapped to a stablecoin on the way in, so the account is backed one to one in USD.
- Withdrawals need your wallet's signature and a margin check before validators release funds on chain. There's a mobile app and a full API as well.
- The Open Strike button uses Ben Ryan's referral code.

Link: [Docs: Deposits & Withdrawals](https://docs.strikefinance.org/perpetuals/deposits-and-withdrawals) · [Open Strike](https://app.strikefinance.org/trade/BTC?referralCode=BenRyan)

## Perpetuals & Trading

Trading on Strike: the markets, the matching engine, orders, margin, liquidations and the bots.

### Perpetuals

Perpetual futures: go long or short with leverage, and no expiry date to roll. Strike lists crypto, US and Asian stocks, indices, gold, silver and oil.

- Every market has its own leverage limit, which falls as a position gets bigger (margin tiers).
- Funding is paid between longs and shorts to keep the price close to the index.

Link: [Docs: Margin tiers](https://docs.strikefinance.org/perpetuals/margin-tiers) · live: Markets trading, Max leverage, 24 h volume

### Strike Node

Strike's own execution layer. Orders are matched off the base chain so trading can be fast, while deposits stay in on-chain locker contracts.

- Execution happens on the Strike network; settlement and custody stay on the chain.
- Every order gets a sequence number, so all nodes process orders in the same order.

Link: [Docs: Strike Node](https://docs.strikefinance.org/perpetuals/strike-node)

### Markets

Strike lists USD-settled perpetuals in four groups: crypto (BTC, ETH, SOL, ADA, XRP and more), US and Asian stocks (NVDA, TSLA, GOOGL, COIN, SK Hynix), indices (S&P 500, Nasdaq 100) and commodities (gold, silver, WTI oil). Examples as listed on 3 November 2026.

- Every market has its own leverage limit, margin tiers, tick size and minimum order, all published by Strike's public markets endpoint, and the list grows as Strike adds markets.
- The live figure on this pad is the number of markets in trading status, read from Strike's public markets endpoint.

Link: [Docs: Exchange Info](https://docs.strikefinance.org/api/market/rest-api/exchange-info) · [See the markets](https://app.strikefinance.org/trade/BTC) · live: Markets trading

### Order types and fees

Market, limit, stop market, stop limit, take profit and stop loss, trailing stop, scale, TWAP and grid, matched by price then time. Fees are tiered on your rolling 30-day volume.

- Tier 0 (under $100K in 30 days) pays 0.050% as taker and earns a 0.005% maker rebate; tiers recalculate daily at 00:05 UTC, and more volume lowers the taker fee.
- Staked STRIKE unlocks discounts of 5% to 40% on positive fees, from 5,000 STRIKE up. Rebates are unchanged.
- TWAP, grid, trailing stop, scale and RFQ each have their own pad in this plaza.

Link: [Docs: Order Types](https://docs.strikefinance.org/perpetuals/order-types) · [Docs: Trading Fees](https://docs.strikefinance.org/perpetuals/trading-fees)

### Strike RFQ

For orders too big for the visible order book. Market makers (Quoters) look across venues like Binance and Hyperliquid and compete to bring that depth onto Strike's book.

- Strike may suggest RFQ when a market order is large or its estimated slippage is high.
- Orders still execute on Strike's normal order book. It isn't a liquidity guarantee.

Link: [Docs: Strike RFQ](https://docs.strikefinance.org/perpetuals/strike-rfq)

### Margin Modes

Choose per market. Cross margin shares your whole balance across positions; isolated margin ring-fences one position so a loss there can't touch the rest.

- Cross is the default and more capital efficient, but one bad trade can drain shared margin.
- You can run cross on one market and isolated on another at the same time.

Link: [Docs: Margin modes](https://docs.strikefinance.org/perpetuals/margin-modes)

### Liquidations

Staged, not all at once. An account that falls short of margin is first reduced in parts on the public order book; the insurance fund and auto-deleveraging are the last resort.

- The aim is to keep as much of the position open as the margin allows.
- Liquidations carry a fee; the docs cover the full lifecycle.

Link: [Docs: Liquidations](https://docs.strikefinance.org/perpetuals/liquidations) · live: Liquidated, all time

### Sub-accounts

Separate trading accounts under one master account, each with its own balance, positions and risk. Useful for keeping strategies, hedges or tests apart.

- Balances and risk are not combined, so a liquidation in one doesn't reach the others.
- Move funds between the master account and its sub-accounts at any time.

Link: [Docs: Sub-accounts](https://docs.strikefinance.org/perpetuals/sub-accounts)

### Pair trading

The Pair Trading Terminal is a mode of the trade page, with no docs page of its own: one or more long legs against one or more short legs, sized by a split, with the basket's weighted ratio charted. As seen in the app on 3 November 2026.

- Open it from the Carry Scanner's Trade button or a trade URL that names the long and short markets; Create Position places every leg.
- Each leg is an ordinary market order placed one after another. Strike's own Carry Scanner says it: if one leg fails you hold an unhedged position.
- The chart tabs show the basket's weighted ratio, performance and funding, and each leg's own market.

Link: [Pair Trading Terminal in the app](https://app.strikefinance.org/trade/btc?long=btc&short=eth)

### TWAP Bot

Splits one large order into many small ones over a time you choose, to soften the price impact of a single big market order.

- If it falls behind, later slices grow to catch up, within a cap.
- Best effort: no guarantee of a full fill or a set average price.

Link: [Docs: TWAP](https://docs.strikefinance.org/bots/twap)

### Trailing Stop

A stop that follows the price while a trade goes your way, then closes the position if price turns back by the percentage you set.

- On a long it tracks the highest price; on a short, the lowest.
- It only ever moves in your favour.

Link: [Docs: Trailing stop](https://docs.strikefinance.org/bots/trailing-stop)

### Grid Bot

Places a ladder of orders across a price range and tries to buy low and sell higher as price moves through it. Long, neutral or short.

- Works best when price chops sideways inside the range.
- A strong trend out of the range is where it struggles.

Link: [Docs: Grid](https://docs.strikefinance.org/bots/grid)

### Scale Orders

Splits one order into a ladder of up to 100 limit orders across a price range you set, instead of one order at one price.

- Choose where the ladder starts and ends; Size Skew puts more of the size toward either end.
- Live since 31 October 2026 (announced in the app); not in Strike's docs yet, so the link goes to the order types page.

Link: [Docs: Order types](https://docs.strikefinance.org/perpetuals/order-types)

### Funding Comparison

Two pages in the app's Tools menu, with no docs page of their own. Funding Comparison lays Strike's hourly funding on every market beside Binance, Bybit, OKX, Hyperliquid, Lighter, Extended and Variational; the Carry Scanner ranks long/short pairs on Strike by funding carry against spread risk. As seen on 3 November 2026.

- Funding Comparison shows each venue's rate and its gap to Strike's, with a Show Arb only filter for the markets where the gap is widest.
- The Carry Scanner builds candidates from 30 days of hourly bars, sized by beta, with correlation, spread volatility and break-even days for each pair.
- The app's own caveat: funding carry is a live snapshot and moves with the market, and correlation measured from past data can break down.

Link: [Funding Comparison in the app](https://app.strikefinance.org/funding-comparison) · [Carry Scanner in the app](https://app.strikefinance.org/carry-scanner)

### Funding rates

Funding keeps a perpetual's price near its index by moving money between longs and shorts, every hour on the hour UTC. It is paid trader to trader; Strike keeps none of it.

- Rates are quoted on an 8-hour basis and one eighth is paid each hour. Positive means longs pay shorts; negative, shorts pay longs.
- The windsocks on the road in show Strike's rate per 8 hours on each sock, with Bybit, Binance and Hyperliquid in the row behind.
- By default a crypto market carries a 0.01% 8-hour interest rate, while stocks, indices and commodities use a 0.05% dampener band instead; a market can run on different limits. Every rate is capped at 4% per 8 hours either way.

Link: [Docs: Funding Rates](https://docs.strikefinance.org/perpetuals/funding-rates)

## Earn & Vaults

The vaults, Borrow and Earn, copy trading, points and the LP program.

### SLP Vault

The Strike Liquidity Provider (SLP) is Strike's own market-making vault. Depositors hold shares in one shared pool that quotes the order books, so results depend on trading, funding and fees.

- It places bids and asks across supported markets and also receives eligible liquidation backstop positions.
- SLP is the only vault that Borrow and Earn credit can be drawn into, and its vault fee is 0%.

Link: [Docs: SLP Vault](https://docs.strikefinance.org/perpetuals/vaults/slp-vault) · live: SLP vault size, SLP depositors

### Insurance Fund

The old Insurance Fund role now belongs to the SLP vault. It receives eligible liquidation backstop positions and adaptive liquidation fees.

- If a liquidation still needs backstop handling, the engine tries to pass it to SLP. If SLP declines it, auto-deleveraging applies.
- SLP can reduce how often ADL happens, but cannot guarantee every position is accepted.

Link: [Docs: Insurance Fund](https://docs.strikefinance.org/perpetuals/liquidations/insurance-fund)

### Borrow & Earn

Keep a supported asset as collateral and borrow USD that goes straight into the SLP vault. You hold your collateral's price exposure and SLP shares at the same time.

- Draws accrue no borrowing interest, but the USD cannot be withdrawn as cash. It only buys SLP shares.
- Accepted collateral includes ADA, sUSDrf, Aave aUSDC and a SundaeSwap LP token; the app shows the current list.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · live: Open credit lines

### User Vaults

Any trader can open a vault, trade it with depositors' pooled money and earn a commission on profits. Depositors share gains and losses in proportion to their shares.

- Creating one costs 100 USDC, the default leader commission is 10% of profits, and the leader must keep at least 5% of shares.
- Withdrawals are requested, then released after a lockup (default 1 day); the default minimum deposit is $100.

Link: [Docs: Vaults](https://docs.strikefinance.org/perpetuals/vaults) · live: User vaults

### Protocol Vaults

Protocol vaults are created by Strike administrators for official strategies. They have no creation fee, no leader commission, and are verified automatically.

- Strike admins can create more than one, and each runs in its own isolated trading account.
- SLP is the live example: the vault API lists it as a verified protocol vault with 0 commission.

Link: [Docs: Vaults](https://docs.strikefinance.org/perpetuals/vaults)

### Copy Trading

Mirror a lead trader on your own Strike account. Pick a Hyperliquid wallet or a Strike trader, choose how trades are sized, and Strike places matching orders when the lead fills.

- Copies are same-side market orders for executed fills only; Hyperliquid copies usually land within seconds.
- Two sizing modes: fixed ratio of the lead's account, or a fixed margin per entry. Copying starts when you subscribe.

Link: [Docs: Copy Trading](https://docs.strikefinance.org/perpetuals/copy-trading) · live: Allocated to copies, Copy open interest

### Points

Deposit into the SLP vault to earn points each day. At the end of a season, points convert into STRIKE paid on Cardano.

- Each UTC day a fixed pool of points is split between depositors by their time-weighted average deposit. No claim step.
- Points follow the amount deposited, not vault profit or loss. Shares queued for withdrawal and Borrow & Earn deposits do not count.

Link: [Docs: Points](https://docs.strikefinance.org/perpetuals/vaults/points)

### LP Program

The Strike LP Vault Liquidity Program invites users to put ADA or USDM into the SLP vault, so their capital helps power market making across Strike's active trading pairs.

- Fund your Strike account with ADA or USDM, then deposit into the SLP vault from the vault section of the app.
- Deposits join the same shared pool that quotes markets continuously and manages positions across the platform.

Link: [Docs: LP Program](https://docs.strikefinance.org/perpetuals/vaults/strike-lp-vault-liquidity-program)

## Collateral & Stablecoins

What you can deposit, and what you can borrow against.

### USDM

USDM is a stablecoin Strike uses on Cardano. Volatile deposits like ADA are swapped into a stablecoin such as USDM before settlement, and staking rewards are paid out in USDM.

- Deposits that are already stablecoins skip the swap and go straight to the on-chain locker contract.
- Revenue-share rewards land in your Strike account as USDM and can be withdrawn.

Link: [Docs: Exchanger](https://docs.strikefinance.org/perpetuals/deposits-and-withdrawals/exchanger)

### USDC

USDC is a dollar stablecoin that can be deposited to Strike from Ethereum or Solana. Strike accounts are valued in USD, and stablecoin deposits need no swap.

- Strike's builder guide lists USDC deposits on both Ethereum and Solana, with a $5 minimum deposit.
- Withdrawals have rolling 1 hour and 24 hour limits, set per asset such as USDC and across all assets together.

Link: [Docs: Deposits & Withdrawals](https://docs.strikefinance.org/perpetuals/deposits-and-withdrawals)

### ADA

ADA is Cardano's native coin. On Strike it can be deposited and swapped into a USD balance, or kept as ADA to back a Borrow & Earn credit line.

- A collateral deposit keeps your ADA as ADA. A balance deposit exchanges it for spendable USD instead.
- Collateral ADA is not staked and earns nothing by itself, but you keep its price exposure.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · live: Open credit lines

### USDCx/USDM LP

A SundaeSwap liquidity-pool token for the USDCx/USDM pair. Strike accepts it as Borrow & Earn collateral, and it represents a share of that pool.

- Trading fees paid into the pool add to the reserves behind each token, so it grows in value on its own.
- It has its own credit line, with its own collateral and debt, separate from lines backed by other assets.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · live: Open credit lines

### aUSDC

Aave V3 aUSDC on Ethereum is a receipt token for USDC supplied to Aave's lending market. Strike accepts it as Borrow & Earn collateral, deposited from an Ethereum wallet.

- Supply interest from the lending market builds up in the token, so each token is worth more over time.
- Strike prices it per scaled unit, which already includes Aave's liquidity index.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · live: Open credit lines

### USDrf / sUSDrf

USDrf is a stablecoin from RealFi, and sUSDrf is its staked form. Strike accepts sUSDrf as Borrow & Earn collateral, and each token redeems for more USDrf over time.

- On Strike, sUSDrf is held in custody on Cardano while it backs a credit line, and its growth shows as a rising token price.
- Strike's API labels it 'RealFi staked USDrf'. Getting sUSDrf is done through RealFi's own app and terms.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · live: Open credit lines

### enzoBTC

enzoBTC is a bitcoin-backed token from Lorenzo Protocol. Strike accepts it as Borrow & Earn collateral, deposited from an Ethereum wallet; the borrowed USD goes only into the SLP vault.

- Strike's credit settings list it as collateral with Ethereum custody and 8 decimal places.
- It sits on its own credit line, so it neither backs nor is backed by lines opened with other collateral.
- On 2 November 2026 Strike announced $200,000 of BTC supplied to Strike as enzoBTC, with full details to follow; the live figure on this pad counts the open enzoBTC lines.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · live: Open credit lines

## Partners & Integrations

Protocols Strike works with, and the apps that plug Strike in.

### RealFi

RealFi issues USDrf, a Cardano stablecoin backed by real-world credit. Its staked version, sUSDrf, is one of the assets Strike accepts as collateral for Borrow and Earn.

- sUSDrf is staked USDrf. Its value shows up as a rising USDrf-per-sUSDrf rate rather than a growing token count.
- On Strike, sUSDrf can back a credit line that buys shares in the SLP vault, while the sUSDrf stays in your custody.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · [Visit RealFi](https://realfi.co) · live: Open credit lines

### SundaeSwap

SundaeSwap is a Cardano decentralised exchange where people swap tokens and provide liquidity. Strike accepts its USDCx/USDM liquidity pool tokens as Borrow and Earn collateral.

- Holders of the USDCx/USDM LP token own a share of that pool, and trading fees paid into the pool add to the reserves behind each token.
- Strike's credit API lists it as LP_SUNDAE_USDCx_USDM, described as the SundaeSwap V4 USDCx/USDM LP token.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · [Visit SundaeSwap](https://sundae.fi) · live: Open credit lines

### Aave V3

Aave is a lending protocol where people supply assets to earn interest and borrow against collateral. Strike accepts Aave V3 aUSDC on Ethereum as collateral for Borrow and Earn.

- aUSDC is the receipt token Aave gives you when you supply USDC.
- On Strike it can back a Borrow and Earn credit line while it stays supplied on Aave.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · [Visit Aave V3](https://aave.com) · live: Open credit lines

### Unifold

Unifold provides deposit infrastructure that lets apps accept crypto and stablecoin deposits from many chains. Strike's app uses it for its Transfer Crypto and card deposit options.

- Unifold's own page for perpetual exchanges describes cross-chain margin deposits, the use case Strike's deposit screen covers.
- Strike's app deposit flow includes a Transfer Crypto address and a card purchase option, both handled inside the Unifold widget.

Link: [Unifold for perps](https://unifold.io/solutions/perps) · [Visit Unifold](https://unifold.io)

### DEX Aggregators

A DEX aggregator routes one swap across many liquidity pools to find a good price. Strike uses one when a volatile deposit, such as ADA, has to be turned into a stablecoin.

- The swap is placed in a batching window; if it is not filled in time it is cancelled and resubmitted.
- The result is recorded as a deposit receipt, then the stablecoin is locked in Strike's on-chain locker contract.
- DexHunter is a Cardano swap aggregator: it compares prices across many exchanges, splits a swap between them, and has a STRIKE swap page at app.dexhunter.io. The docs don't say which aggregator Strike's own deposits go through.

Link: [Docs: Exchanger](https://docs.strikefinance.org/perpetuals/deposits-and-withdrawals/exchanger) · [DexHunter](https://dexhunter.io)

### Hizz

Hizz is a multi-chain crypto terminal for token discovery, market signals, wallet monitoring and swaps. Since the hackathon it also trades Strike perpetuals from its own Perps tab, marked Powered by Strike.

- Connect a Cardano wallet, sign once to authorise Strike trading, then go long or short with Strike's chart, mark price and funding on the Hizz screen.
- Its token pages list STRIKE with Strike's website and @strikeperps as the links.
- It's an independent tool; Strike doesn't run it.

Link: [Strike perps on Hizz](https://www.hizz.io/perps/BTC-USD) · [Visit Hizz](https://hizz.io)

### Lorenzo

Lorenzo Protocol issues enzoBTC, a bitcoin-backed token Strike takes as Borrow and Earn collateral. Strike's own ecosystem graphic (2 November 2026) lists Lorenzo as a partner for BTC liquidity and yield infrastructure.

- On 2 November 2026 Strike announced $200,000 of BTC supplied to Strike as enzoBTC, with full details to follow.
- enzoBTC is deposited from an Ethereum wallet and sits on its own credit line; the borrowed USD buys SLP vault shares only. Its own pad is in Collateral.
- It's an independent protocol; Strike doesn't run it.

Link: [Docs: Borrow and Earn](https://docs.strikefinance.org/perpetuals/vaults/borrow-and-earn) · [Visit Lorenzo](https://lorenzo-protocol.xyz)

## Developers

The API, builder codes and market data, and the projects built on Strike.

### Copilot Check

Paste a Hyperliquid wallet and see whether it's worth copying on Strike: how much of its profit is on markets Strike lists, the catches in its record, and how a copy would have done at your size.

- Paper Copy runs a trial with your own settings before you risk money.
- Built by Ben Ryan, who also made this map. Independent, not affiliated with Strike.

Link: [Open Copilot Check](https://strike.benryan.com.au) · [Visit Copilot Check](https://github.com/benryandev/copilot-check)

### Copilot Watch

Telegram and Discord alerts for Strike copy traders: when a copy is close to liquidation, when the copied wallet has left a position your copy still holds, or when a trade wasn't copied.

- Runs as a Telegram bot and a Discord bot, with no install and no API key.
- Built by Ben Ryan, who also made this map. Independent, not affiliated with Strike.

Link: [Open in Telegram](https://t.me/CopilotWatchBot) · [Visit Copilot Watch](https://github.com/benryandev/copilot-watch)

### Strike Copilot

Review your Strike copy-trading account, find traders worth copying and set copies up, by chatting with Claude on your own computer.

- Its API key is made on your own computer, and Strike API keys can't withdraw funds.
- Built by Ben Ryan, who also made this map. Independent, not affiliated with Strike.

Link: [Strike Copilot on GitHub](https://github.com/benryandev/strike-copilot)

### Strike tam-tam

Send a short message to any Strike trader as a Cardano NFT. Find them by Strike nickname, ADA Handle or wallet address, write up to 256 characters and your wallet mints it straight into theirs.

- Looks traders up through Strike's public API; the message itself is minted on Cardano, wallet to wallet, with no server holding it.
- Messages can be encrypted on-chain. The Strike version costs about the network fee and minimum ADA, around 1.6 ADA a message.
- By Mato, the maker of matotam.io. Submitted 31 Oct 2026 and checked against the live app.
- Third-party project, listed after a basic check. Not an endorsement: look into it before you connect a wallet or an API key.

Link: [Visit Strike tam-tam](https://strike.matotam.io/) · [On X](https://x.com/matotam_ada)

### REST + WS API

Strike offers REST and WebSocket APIs for market data, trading, accounts, vaults, copy trading and platform stats. Trading uses signed requests from Ed25519 API wallets.

- API wallets can trade but cannot withdraw funds, and the private key never leaves your machine.
- Agent skills for the API install with npx strike-finance-skills install.

Link: [Docs: Getting Started](https://docs.strikefinance.org/api/getting-started)

### Builder Codes

Builder codes let a dApp send its users' trades to Strike and earn a fee on their fills. Fees are credited to the builder's balance and can be withdrawn at any time.

- Register in the Strike dashboard; the fee is set per order with an X-Builder-Fee-Bps header, capped at 100 bps (1%).
- Works for users on Ethereum, Solana and Cardano, and a reference repo on GitHub shows the full flow.

Link: [Docs: Builder Codes](https://docs.strikefinance.org/api/builder-codes)

### Vault Leader API

Vault leaders who already trade by API can trade their vault with the same endpoints and keys by adding a vault_id field. Strike checks that you lead that vault first.

- No separate credentials are needed; find your vault_id with GET /v2/vaults filtered by your leader account id.
- Vault trades run on the vault's own isolated account, apart from your personal positions.

Link: [Docs: Vault Leader](https://docs.strikefinance.org/api/vault-leader)

### L3 Market Data

L3 shows the public order book one order at a time, including each order's queue position at its price. It is public data and needs no authentication.

- L1 gives the best bid and ask, L2 adds up size per price, and L3 lists every visible resting order.
- It comes as a REST snapshot per symbol and a WebSocket stream.

Link: [Docs: L3](https://docs.strikefinance.org/api/l3)

### GitHub

Strike's code lives in the strike-finance GitHub organisation, linked from the Strike website and its Linktree.

- Public repos include perpetuals smart contracts, staking contracts, a builder reference app and API agent skills.
- The org also holds an Android app mirror and a linear vesting contract for the STRIKE token built by Anastasia Labs.
- The perpetuals contracts are written in Aiken, Cardano's smart-contract language, with liquidity, orders, positions and pool validators; their unit tests run with aiken check.

Link: [strike-finance org](https://github.com/strike-finance)

## Analytics & Discovery

Where Strike's numbers and listings live elsewhere.

### DefiLlama

DefiLlama is an independent dashboard that tracks value locked and activity across DeFi protocols. It lists Strike under the name Strike Finance Perpetuals, in the Derivatives category.

- Its Strike page covers Cardano and Ethereum, and links to Strike's site and @strikeperps on X.
- Use it to see Strike's value locked and volume history from a source Strike does not run.

Link: [Strike on DefiLlama](https://defillama.com/protocol/strike-finance-perpetuals) · [Visit DefiLlama](https://defillama.com)

### CoinGecko

CoinGecko is a crypto data site that lists tokens and exchanges. It has a page for the STRIKE token on Cardano and a separate listing for Strike Finance as a decentralised exchange.

- The STRIKE page (strike-2) shows the Cardano policy ID f13ac4d6…, matching Strike's own token.
- An older, unrelated Ethereum token also uses the name Strike, so check the policy ID.

Link: [STRIKE on CoinGecko](https://www.coingecko.com/en/coins/strike-2) · [Visit CoinGecko](https://www.coingecko.com)

### BendingAI

BendingAI is Strike's own Cardano DeFi analytics site: AI insights and token tracking, including a verified record for the STRIKE token.

- Its token data includes Cardano holder counts and DEX liquidity for STRIKE.
- Owned by Strike, run alongside the exchange.

Link: [BendingAI home](https://bending.ai)

### Directories

Three Cardano directories list Strike, each run by someone other than Strike: cardano.org's Apps catalogue under DEX, CardanoCube under DeFi, and Adastack under Perpetuals and Staking.

- cardano.org describes a perpetual futures protocol with on-chain margin, beside Minswap, WingRiders and SundaeSwap; CardanoCube's profile carries a description, token details and team information.
- Adastack, open source under the MIT licence, lists both Strike Finance (perpetuals) and Strike Finance Staking (revenue-share staking) on its dApps page; CardanoCube files Strike under derivatives and investment management.
- cardano.org's catalogue and Adastack are open source, so anyone can send a correction through GitHub.

Link: [Strike on cardano.org](https://cardano.org/apps/strike-finance/) · [Strike on CardanoCube](https://www.cardanocube.com/projects/strike-finance)

## Community & Channels

Referrals, clans, the leaderboard and Strike's own channels.

### Referrals

Create a referral code once you pass $10,000 in trading volume. You earn a share of the fees your referrals pay, and they get a fee discount.

- There are five tiers, Bronze to Diamond, set by the combined lifetime volume of everyone you referred.
- Referrals go two levels deep: you also earn from your referrals' own referrals, with the extra reward paid by Strike.

Link: [Docs: Referrals](https://docs.strikefinance.org/perpetuals/referrals) · live: Referral codes, Referred volume

### Clan Competitions

Timed team events: join or create a clan, trade during the event, and clans compete for a shared prize pool ranked by combined trading volume.

- Be on a clan roster before the roster lock or your volume counts as zero for that event. One clan per account.
- Trades against your own clan's members count at half rate, so only outside volume counts in full.

Link: [Docs: Clan Competitions](https://docs.strikefinance.org/perpetuals/clan-competitions)

### Leaderboard

A ranking of traders on Strike and Hyperliquid by PnL, ROI, volume, win rate, Sharpe ratio and drawdown, over selectable time windows.

- You can look up a specific wallet or nickname's rank directly.
- Clan competitions also have their own leaderboard, ranked by combined clan volume.

Link: [Docs: Leaderboard](https://docs.strikefinance.org/api/platform-stats/leaderboard)

### X (@strikeperps)

Strike's official X account is @strikeperps, linked from the Strike website and its Linktree.

- Handle and link: x.com/strikeperps.
- Both strikefinance.org and Strike's Linktree page point to it.

Link: [@strikeperps](https://x.com/strikeperps)

### Discord

Strike has an official Discord server, linked from the Strike website and its Linktree.

- Invite link: discord.gg/PuWbEmrEee.
- The same invite appears on strikefinance.org and the Strike Linktree.

Link: [Discord invite](https://discord.gg/PuWbEmrEee)

### Docs

Strike's documentation covers the trading engine, vaults, copy trading, bots, tokenomics and a full API reference.

- Add .md to any page URL for a Markdown version; an llms.txt index and full text file are also provided.
- Sections include perpetuals, bots (TWAP, trailing stop, grid), API, vaults and tokenomics.

Link: [Docs: Docs](https://docs.strikefinance.org/getting-started/welcome)

### Medium

Strike's Medium publication, @strikecardano, carries its longer announcements. Its feed on 3 November 2026 led with the posts below.

- Latest: "Strike Hackathon Starts this Wednesday — $3,000 in Prizes" (18 October 2026) and, before it, "Strike Secures $1,000,000 Liquidity Deployment to Unlock the Next Phase of Growth" (15 July 2026).
- Older posts include the 2026 roadmap, the litepaper and the tokenomics article; the docs site covers current V2 mechanics such as liquid staking and vaults.

Link: [Strike on Medium](https://medium.com/@strikecardano)

## Token & Governance

The STRIKE token, staking and revenue share.

### STRIKE

STRIKE is Strike Finance's platform token. Its listed uses are staking for a share of platform revenue, governance votes and discounts on trading fees. Total supply is fixed at 25 million.

- Allocation: 60% public sale, 15% team and advisors, 13% DAO treasury and 12% liquidity.
- Team tokens have a 6 month lock, then unlock monthly over 24 months.

Link: [Docs: Tokenomics](https://docs.strikefinance.org/tokenomics/editor)

### Staking

Opt in once on the Strike staking page and STRIKE in that wallet counts toward platform revenue rewards, even while used in supported DEX pools or lending markets. There is no lockup.

- Balances are snapshotted daily at 00:00 UTC and averaged over time, so holding longer counts for more.
- Supported places include Minswap, CSWAP, Splash, VyFi, SundaeSwap and WingRiders pools, plus Liqwid, Surf, Dano and FluidTokens.
- Still staked the V1 way? Re-stake on the staking page in single address mode and keep the STRIKE in that wallet. V2 reward counting began on 15 May 2026, with daily snapshots at 00:00 UTC.

Link: [Docs: Staking](https://docs.strikefinance.org/tokenomics/markdown)

### Revenue Share

Strike's main revenue is the opening fee traders pay when they open positions. The part of that fee that goes to Strike is paid to eligible stakers every 15 days.

- Opening fees are split between Strike and liquidity providers, and the split can change over time.
- Rewards arrive in your Strike account as USDM, where they can be used for trading, vaults or withdrawal.

Link: [Docs: Staking rewards](https://docs.strikefinance.org/tokenomics/markdown)

### DAO Treasury

13% of the STRIKE supply (3.25 million tokens) is set aside for the DAO. How it is released and used is left to votes by STRIKE holders.

- Stated uses include incentives, initiatives and funding future development, as the community sees fit.
- The DAO share is part of the 25 million total, alongside the public sale, team and liquidity allocations.

Link: [Docs: Tokenomics](https://docs.strikefinance.org/tokenomics/editor)

## Chains & Security

The chains Strike settles on, the custody contracts, validators and the backstop.

### Cardano

Strike V1 launched in May 2025 as the first perpetuals platform on Cardano. V2 runs its own execution layer and uses Cardano and other chains for custody and settlement.

- Matching, liquidations and funding run on the Strike Node; Cardano holds deposited funds in on-chain locker contracts.
- STRIKE staking rewards and Points payouts are on Cardano, and Ethereum or Solana accounts set a Cardano address for Points.

Link: [Docs: Welcome](https://docs.strikefinance.org/getting-started/welcome) · live: Active traders, yesterday

### Ethereum

Ethereum is a supported chain for deposits and withdrawals. ETH and USDC can be sent in, and Ethereum-based tokens can back Borrow & Earn credit lines.

- Docs list Cardano and Ethereum as the supported settlement chains, each with its own locker contract and listener node.
- Ethereum-held collateral assets on Strike include Aave aUSDC and enzoBTC.

Link: [Docs: Deposits & Withdrawals](https://docs.strikefinance.org/perpetuals/deposits-and-withdrawals)

### Solana

Solana wallets can create Strike accounts, deposit SOL or USDC, trade and withdraw. Strike's builder guide lists Solana alongside Ethereum and Cardano.

- Solana sign-ins use Ed25519 signatures, and deposit transactions are returned as base64 Solana transactions.
- Solana account holders set a Cardano address to receive Points payouts.

Link: [Docs: Builder Codes](https://docs.strikefinance.org/api/builder-codes)

### Validator Network

Strike's validators sign deposit quotes, confirm deposits on-chain and co-sign withdrawals. Strike operates them today, with independent operators planned over time.

- Each chain has a listener node that watches its locker contract for incoming deposits.
- Quotes are single-use, and a withdrawal needs your own wallet signature before anything moves.

Link: [Docs: Deposits & Withdrawals](https://docs.strikefinance.org/perpetuals/deposits-and-withdrawals)

### Locker Contracts

Locker contracts are on-chain smart contracts on each supported chain where deposited funds are held. The trading engine only tracks balances and never takes custody.

- Withdrawals have rolling 1 hour and 24 hour limits, per asset and across all assets, plus approval thresholds and emergency controls.
- Strike says no single party has direct access to user funds.

Link: [Docs: Withdrawal Security](https://docs.strikefinance.org/perpetuals/deposits-and-withdrawals/withdrawal-security-and-controls)

## RealFi Raceway

A time-trial track with a shared leaderboard and the leader's ghost.

### RealFi Raceway

A time-trial track in the RealFi colours, out past Partners & Integrations. Cross the start line, take every checkpoint in order and try to beat the best lap.

- The clock starts when you cross the start line going forward and stops when you cross it again. Miss a checkpoint and the lap doesn't count.
- There are three jumps, each with a flat lane beside it, and RealFi crates to knock about. Land a clean jump on the track and the car gets a short speed boost; clip a crate or a bale in the air and it doesn't.
- Your best lap is kept in this browser. Post it to put your name on the top 10 board by the start.
- The fastest lap on the board drives beside you as a ghost, with the leader's name over it. Laps posted before ghosts existed are rebuilt from their checkpoint times, so that ghost follows the centreline at the right pace.

Link: [Visit RealFi](https://realfi.co)

## Fill Yard

Every fill on Strike's order books, arriving as crates on a conveyor.

### Fill Yard

Every trade filled on Strike's order books, as it happens. Each crate is one order: the market's icon, buy or sell, and its size in dollars. Bigger orders, bigger crates.

- The crates come from Strike's public trade stream, the same feed the trading app listens to, so one appears within about a second of the fill.
- The belt runs at a fixed pace. When fills arrive faster than it can carry them they wait at the door, and past six waiting they spill over the side.
- Quiet spells are shown as quiet; nothing is invented. When you arrive the yard holds the most recent fills, and the pile keeps the last forty. Drive into it.

Link: [Docs: Market websocket](https://docs.strikefinance.org/api/market/websocket) · live: Fills, last minute, Traded, last 10 min, Busiest market, 10 min
