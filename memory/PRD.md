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
