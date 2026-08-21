# Terminus/Invest - Personal Investment Terminal

## Problem Statement
Build a website for investment management with 4 tabs: (1) all investments - stocks & crypto (2) news specific to held stocks (3) macroeconomic news that affect stock market (tariffs, wars, bond market, gold, etc.) (4) public sentiment for held stocks. Broker: Robinhood.

## User Choices
- Holdings: CSV import from Robinhood export (+ manual entry)
- Market data: Alpha Vantage + Yahoo Finance (via yfinance)
- News/Sentiment: NewsAPI + LLM (Claude Sonnet 4.6 via Emergent LLM key)
- Auth: None (single-user personal app)
- Visual: Bloomberg Terminal-inspired dark theme (amber/green/red, monospace)

## Architecture
- Backend: FastAPI (server.py, quotes.py, news_service.py, sentiment_service.py)
- Frontend: React (App.js + 4 tab components + TopTickerBar)
- Data: MongoDB (holdings collection)

## Implemented (Feb 2026)
- Portfolio tab: CSV upload, demo seed, manual add, sortable/filterable table, summary cards, live prices, P/L
- Stock News tab: Filtered per held ticker with tag pills + AI executive brief
- Macro News tab: Theme-based filters (Fed/Tariffs/Bonds/Gold/War/Inflation) + AI brief
- Sentiment tab: SVG gauge, market Fear & Greed, per-symbol bull/bear scores with reasoning + themes
- Top ticker bar (S&P, NASDAQ, DOW, BTC, ETH, GOLD, 10Y, OIL)

## Known Limitations
- **Emergent LLM key budget exhausted**: AI briefs & per-symbol sentiment show default/neutral fallback until user tops up (Profile → Manage plan → Universal Key → Add Balance)
- Alpha Vantage free tier: 25 requests/day (used only as fallback)

## Backlog
- P1: Portfolio allocation pie chart (recharts)
- P1: 30-day performance sparklines per holding
- P2: Dividend income tracker
- P2: Custom watchlists (beyond holdings)
- P2: Price alerts (email/push)
- P3: Multi-portfolio/scenario compare

## Iteration 2 (Feb 2026)
### Added
- Portfolio Value line chart with 8 time ranges (1D/1W/1M/3M/YTD/1Y/5Y/ALL) — simulates historical value using current holdings × historical prices via yfinance
- Stock allocation treemap: size = position value, green = gain, red = loss
- New "SMART MONEY" tab with US Congress trades (STOCK Act) + SEC Form 4 insider filings + top-traded tickers overlay, auto-refresh 5 min
- Sentiment tab rewritten to use Reddit (r/wsb, r/stocks, r/investing) + StockTwits — no LLM key needed, bull/bear engagement-weighted scoring, top posts links, top themes
- News tabs (Stock News + Macro News) now auto-refresh every 60s

### Known Limitations
- Congress trade S3 endpoints (housestockwatcher / senatestockwatcher) return 403 from this preview network — the tab shows a clear notice and falls back to SEC Form 4 which is fully live. To enable, plug in a Quiver Quant or FinancialModelingPrep API key.
- Reddit blocks Emergent's container IPs — Reddit posts return 0. StockTwits carries the sentiment signal (30 messages/symbol with explicit bullish/bearish tags), so scores are still meaningful.

### Optimizations for Alpha
- Smart Money tab surfaces held-ticker matches (bought before market moves)
- Sentiment shows engagement-weighted scores so viral bullish/bearish posts count more
- All news auto-refreshes every 60s so you see market-moving headlines within a minute

## Iteration 3 (Feb 2026)
### Added
- New **ALPHA tab** with two flagship features:
  - **Alpha Signal per holding**: composite score = 0.45 × 5-day momentum + 0.40 × StockTwits sentiment + 0.15 × call/put options tilt. Emits BUY / HOLD / SELL with plain-English drivers.
  - **Unusual Options Flow**: live scan of nearest 3 expiries per held ticker via yfinance. Highlights contracts with volume/OI ≥ 3× (whale bets). Shows put/call ratio for market bias.
- Options + signal endpoints: /api/options/flow, /api/options/{symbol}, /api/signal/alpha

### On Free Congress Alternatives
- Tried Tracefour (no public API), Capitol Trades (rate-limits Emergent IPs), FMP/Quiver demos (401), House disclosures-clerk (PDF only). All free tier congress feeds are either blocked from AWS-backed preview networks or require paid keys. SEC Form 4 remains the reliable free insider source and is live.
