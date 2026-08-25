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
- Real-time P&L calculations, historical equity curves (1D, 1W, 1M, 1Y, ALL), and asset allocation breakdowns.
- Instant demo portfolio generation with 10 diversified tech, semi, and crypto positions.

### 6. 🗄️ Dual-Mode Database Architecture
- **Zero-Friction Local Mode**: Automatically detects if MongoDB is running; if not available, gracefully falls back to an embedded JSON document store (`backend/data/local_storage.json`) within 1 second without hanging.
- **Production Mode**: Seamlessly switches to Cloud MongoDB (MongoDB Atlas) when `MONGO_URL` is configured.

---

## 🛠️ Architecture & Tech Stack

```
portfolio-manager/
├── frontend/                # React 19 Single Page Application
│   ├── src/
│   │   ├── components/      # Terminal Tabs (TopTickerBar, Portfolio, Alpha, Scanner, News, etc.)
│   │   ├── lib/api.js       # Axios HTTP client with credentials & formatting utils
│   │   └── App.js           # Main terminal shell & auth state
│   └── vercel.json          # SPA rewrite rules for production
├── backend/                 # Python FastAPI Backend
│   ├── server.py            # REST API Routes, middleware & background scheduler
│   ├── quotes.py            # Parallelized real-time market data engine
│   ├── news_service.py      # Stock & macro financial news aggregator
│   ├── scanner_service.py   # Breakout scoring engine & Resend email delivery
│   ├── signal_service.py    # Alpha models & options flow calculations
│   ├── insider_service.py   # Congressional trading integration
│   ├── auth.py              # Session management & dev login
│   ├── db.py                # Dual-mode (MongoDB + Local JSON) database engine
│   └── .env                 # Environment configuration & API keys
└── tests/                   # Pytest test suite (16 comprehensive tests)
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

The project includes a full unit and integration test suite covering API routes, database CRUD, quotes streaming, news aggregation, and scanner scoring:

```bash
# From the project root
./backend/venv/bin/pytest tests/
```

**Test Coverage**:
- `tests/test_api_endpoints.py`: Auth dev-login, session cookies, `/api/auth/me`, `/api/market/indices`, `/api/portfolio/holdings`, `/api/scanner/prefs`.
- `tests/test_quotes.py`: Real-time index parser, equity quotes, batch requests, crypto symbol normalizer.
- `tests/test_news.py`: Stock news by ticker, macro news, HTML cleaner, RFC-822 date parser.
- `tests/test_scanner.py`: Breakout scoring, composite metrics, HTML digest builder.
- `tests/test_db.py`: Local JSON database engine, insertion, queries, updates, upserts, and deletions.

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
