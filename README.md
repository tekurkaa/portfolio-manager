# TERMINUS · Institutional Portfolio Manager & Market Terminal

> Real-time quantitative investment terminal, institutional breakout scanner, multi-source news aggregator, alpha signals engine, and automated daily email digest.

🔗 **Live Production URL**: [https://portfolio-manager-by-atv.vercel.app/](https://portfolio-manager-by-atv.vercel.app/)

---

## ⚡ Overview

**Terminus / Portfolio Manager** is a high-performance, full-stack financial market terminal designed for active equity traders, quantitative analysts, and portfolio managers. It combines sub-second live exchange market feeds, predictive alpha generation models, congressional trading intelligence, and automated breakout alerts in a sleek, dark-mode terminal interface.

---

## ✨ Key Features

### 1. 🟢 Sub-Second Streaming Market Ticker Strip
- **Real-Time Exchange Data**: 0-second latency institutional feed for **NASDAQ 100** (`.NDX`), **S&P 500** (`.SPX`), **Dow Jones** (`.DJI`), **Russell 2000** (`.RUT`), **10-Year Treasury Yield** (`US10Y`), **Crude Oil** (`@CL.1`), **Gold** (`@GC.1`), **Silver** (`@SI.1`), **VIX** (`.VIX`), **US Dollar DXY** (`.DXY`), **Bitcoin**, **Ethereum**, and **Solana**.
- **Micro-Animations**: Real-time green/red price flash pulse animations on price movement.
- **Infinite Marquee**: Seamless hover-to-pause scrolling ticker.

### 2. 📰 Multi-Source Stock & Macro Intelligence
- **Held Position News (`/api/news/stocks`)**: Real-time articles tagged by portfolio symbols (`AAPL`, `NVDA`, `TSLA`, `MSFT`, `BTC`, etc.) aggregating Yahoo Finance ticker feeds and Google Financial News.
- **Macroeconomic Intelligence (`/api/news/macro`)**: Curated macroeconomic wire covering Federal Reserve & rate policy, tariffs & trade disputes, treasury yields, OPEC & energy, inflation / CPI, and geopolitics.
- **NewsAPI Integration**: Optional auto-enrichment via NewsAPI.org.

### 3. 🎯 Breakout Scanner & Automated Daily Email Digest
- **Cross-Sector Scanning**: Scans 60+ high-momentum equities (semis, mega-cap tech, biotech, crypto proxies) combining price momentum, 52-week breakout proximity, unusual call options flow, and recent congressional purchases.
- **Automated Morning Delivery**: Built-in background cron scheduler (`_daily_scheduler_loop`) dispatches styled HTML daily breakout digests to opted-in users via **Resend**.
- **Instant Dispatch**: One-click "Send Now" button from the Scanner tab.

### 4. 🧠 Quantitative Alpha & Options Flow Signals
- **12-Factor Predictive Signal Engine**: Composite directional scoring (*STRONG BUY*, *BUY*, *HOLD*, *REDUCE*).
- **Options Flow & Tilt Tracker**: Tracks call-to-put volume ratios and institutional sweep alerts.
- **Congressional Trading Tracker**: Real-time monitoring of House and Senate financial disclosures.

### 5. 💼 Portfolio & Risk Management
- **Robinhood Activity Importer**: Native import for Robinhood Trade Activity CSVs with FIFO lot accounting, buy/sell parsing, and split/rebalance handling.
- **Portfolio Risk & Diversification Auditor**: Single-asset dual-alert exposure thresholds (hard ceilings for crypto blue chips vs altcoins vs stocks), 20% sector concentration rules, health score scoring, and projected annual dividend cash flow KPIs.
- Real-time P&L calculations, historical equity curves (1D, 1W, 1M, 1Y, 5Y, ALL), and interactive allocation treemaps.
- Instant demo portfolio generation with 12 diversified tech, semi, ETF, and crypto positions.

### 6. 🤖 Grounded AI Chat Assistant
- **Fintech Research Engine**: Multi-turn conversational AI grounded in live portfolio holdings, news events, congress transactions, and quantitative alpha signals.
- **Auto-Ticker Extraction & Conversation Lifecycle**: Thread persistence, automated conversation creation/deletion, and clickable ticker references.

### 7. 🗄️ Dual-Mode Database Architecture
- **Zero-Friction Local Mode**: Automatically detects if MongoDB is running; if not available, gracefully falls back to an embedded JSON document store (`backend/data/local_storage.json`) within 1 second without hanging.
- **Production Mode**: Seamlessly switches to Cloud MongoDB (MongoDB Atlas) when `MONGO_URL` is configured.

---

## 🛠️ Architecture & Tech Stack

```
portfolio-manager/
├── frontend/                # React 19 Single Page Application
│   ├── src/
│   │   ├── components/      # Terminal Tabs (TopTickerBar, Portfolio, Alpha, Scanner, News, Chat, etc.)
│   │   ├── lib/api.js       # Axios HTTP client with credentials & formatting utils
│   │   └── App.js           # Main terminal shell & auth state
│   └── vercel.json          # SPA rewrite rules for production
├── backend/                 # Python FastAPI Backend
│   ├── server.py            # REST API Routes, middleware & background scheduler
│   ├── quotes.py            # Parallelized real-time market data engine
│   ├── news_service.py      # Stock & macro financial news aggregator
│   ├── scanner_service.py   # Breakout scoring engine & Resend email delivery
│   ├── signal_service.py    # Alpha models & options flow calculations
│   ├── trade_import_service.py # Robinhood trade activity CSV parser & lot accountant
│   ├── chat_service.py      # Grounded AI conversation engine
│   ├── insider_service.py   # Congressional trading integration
│   ├── auth.py              # Session management & dev login
│   ├── db.py                # Dual-mode (MongoDB + Local JSON) database engine
│   └── .env                 # Environment configuration & API keys
├── specs/                   # QA test specifications (Given/When/Then format)
│   └── feature-tests.md     # Exhaustive 22-suite specification
├── tests/
│   ├── e2e/                 # Playwright TypeScript E2E test suite (81 tests across 22 suites)
│   ├── helpers/             # E2E test session bootstrap & database reset utilities
│   └── test_*.py            # Pytest backend integration test suite (24 tests)
├── playwright.config.ts     # Playwright configuration (workers: 1, dual backend/frontend webServers)
└── package.json             # Root dependencies & test scripts
```

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm** (or **yarn**)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/tekurkaa/portfolio-manager.git
cd portfolio-manager
```

---

### Step 2: Set Up Backend

1. Create and activate a Python virtual environment:
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure your `.env` file (`backend/.env`):
   ```env
   MONGO_URL=mongodb://localhost:27017
   DB_NAME=portfolio_manager
   CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   COOKIE_SECURE=false

   # API Keys
   ALPHA_VANTAGE_API_KEY=BUYS3Q4CWL278X63
   NEWSAPI_KEY=8c149e153bcf41d19f868bb248113321
   RESEND_API_KEY=re_Yoe8xeMf_AHzQJWhx8mXM2S3GcYdLaoAt
   RESEND_FROM=Terminus <onboarding@resend.dev>
   ```

4. Start the backend server:
   ```bash
   python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
   ```
   *Backend is now running at `http://127.0.0.1:8000`.*

---

### Step 3: Set Up Frontend

1. In a new terminal window:
   ```bash
   cd frontend
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```
   *Frontend is now live at `http://localhost:3000`.*

3. **Login**: Click **"Enter Terminal (Local / Demo)"** for instant one-click access with sample portfolio data.

---

## 🧪 Running the Test Suite

The project features a dual testing setup: backend unit/integration tests with **Pytest** and full end-to-end browser automation with **Playwright (TypeScript)**.

### 1. Backend Integration Tests (Pytest — 24 Tests)
Validates core API routes, dual-mode database CRUD, market quote streaming, trade activity import, and scanner scoring:

```bash
# From the project root
./backend/venv/bin/pytest tests/
```

- `tests/test_api_endpoints.py`: Auth dev-login, session cookies, Bearer tokens, `/api/portfolio/holdings`, trade activity import preview & commit, `/api/chat/*`, `/api/scanner/prefs`.
- `tests/test_quotes.py`: Real-time index parser, equity quotes, batch requests, crypto symbol normalizer.
- `tests/test_news.py`: Stock news by ticker, macro news, HTML cleaner, RFC-822 date parser.
- `tests/test_scanner.py`: Breakout scoring, composite metrics, HTML digest builder.
- `tests/test_db.py`: Local JSON database engine, insertion, queries, updates, upserts, and deletions.

### 2. End-to-End Browser Tests (Playwright — 81 Tests across 22 Suites)
Automates user-facing interactions, state transitions, calculations, and network resilience per [`specs/feature-tests.md`](specs/feature-tests.md):

```bash
# Install Playwright browsers (first-time only)
npx playwright install chromium

# Run all 81 E2E tests (configured with workers: 1 to guarantee database isolation)
npx playwright test

# Run a specific suite (e.g. Holdings CRUD)
npx playwright test tests/e2e/02_holdings.spec.ts

# Run with interactive UI mode
npx playwright test --ui
```

**Coverage Summary**:
- **Suites 01–05**: Authentication, Holdings CRUD, Summary KPIs, History Chart Ranges & Benchmarks, Allocation Treemap.
- **Suites 06–10**: CSV Upload, Robinhood Activity Import, Demo Seed, Watchlist Management, Held Stock News.
- **Suites 11–15**: Macro Intelligence, Reddit/StockTwits Sentiment, Smart Money (Congress/SEC Form 4), Breakout Scanner, Email Notifications.
- **Suites 16–22**: Alpha Signals Engine, 9-Month Backtest Model, AI Chat Assistant, Portfolio Risk Auditor, Market Indices Ticker Bar, Empty State Fallbacks, Error Boundary & Resilience.

---

## ☁️ Deployment Guide

### Deploy Frontend to Vercel
1. Import repository on [Vercel](https://vercel.com/new).
2. Set **Root Directory** to `frontend`.
3. Set **Framework Preset** to `Create React App`.
4. **No additional env vars needed** — `frontend/.env.production` is committed and automatically points to the Render backend.
   - If you redeploy the backend under a different URL, update `frontend/.env.production` accordingly.
5. Click **Deploy**.

### Deploy Backend to Render / Railway / Fly.io
1. Create a new Web Service pointing to `backend/`.
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. Set Environment Variables on Render:
   ```env
   MONGO_URL=mongodb+srv://<username>:<password>@cluster0.mongodb.net/portfolio_manager?retryWrites=true&w=majority
   DB_NAME=portfolio_manager
   CORS_ORIGINS=https://portfolio-manager-by-atv.vercel.app
   COOKIE_SECURE=true
   ALPHA_VANTAGE_API_KEY=BUYS3Q4CWL278X63
   NEWSAPI_KEY=8c149e153bcf41d19f868bb248113321
   RESEND_API_KEY=re_Yoe8xeMf_AHzQJWhx8mXM2S3GcYdLaoAt
   RESEND_FROM=Terminus <onboarding@resend.dev>
   ```

> **Important**: `COOKIE_SECURE=true` is required on Render because the frontend (Vercel) and backend (Render) are on different domains. This sets the cookie to `samesite=none; Secure`, which is necessary for cross-origin cookie acceptance. The app also uses `Authorization: Bearer` header-based auth as a fallback, so even if cookies are blocked by the browser, sessions will still work.

---

## 📜 License
MIT License. Built for high-performance portfolio tracking and quantitative research.
