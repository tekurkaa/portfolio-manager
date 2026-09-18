# Feature Test Specification
**Role:** QA Lead  
**Scope:** All user-facing features of the Investment Terminal  
**Format:** Given / When / Then  
**Status:** Draft — not yet implemented as automated tests

---

## Table of Contents
1. [Authentication](#1-authentication)
2. [Portfolio — Holdings CRUD](#2-portfolio--holdings-crud)
3. [Portfolio — Summary KPIs](#3-portfolio--summary-kpis)
4. [Portfolio — History Chart](#4-portfolio--history-chart)
5. [Portfolio — Allocation Treemap](#5-portfolio--allocation-treemap)
6. [Portfolio — CSV Upload (Simple)](#6-portfolio--csv-upload-simple)
7. [Portfolio — Trade Activity Importer (Robinhood)](#7-portfolio--trade-activity-importer-robinhood)
8. [Portfolio — Demo Seed](#8-portfolio--demo-seed)
9. [Watchlist](#9-watchlist)
10. [Stock News Tab](#10-stock-news-tab)
11. [Macro News Tab](#11-macro-news-tab)
12. [Sentiment Tab](#12-sentiment-tab)
13. [Insider Flow Tab](#13-insider-flow-tab)
14. [Scanner Tab — Breakout Scanner](#14-scanner-tab--breakout-scanner)
15. [Scanner — Email Digest Notifications](#15-scanner--email-digest-notifications)
16. [Alpha Signal Tab](#16-alpha-signal-tab)
17. [Backtest Panel](#17-backtest-panel)
18. [Chat Tab — AI Assistant](#18-chat-tab--ai-assistant)
19. [Portfolio Risk Auditor](#19-portfolio-risk-auditor)
20. [Market Quotes & Ticker Bar](#20-market-quotes--ticker-bar)
21. [Empty State — No Holdings](#21-empty-state--no-holdings)
22. [Error Boundary & Network Failures](#22-error-boundary--network-failures)

---

## 1. Authentication

### TC-AUTH-01 — Google OAuth Login
**Given** an unauthenticated user visits the app  
**When** they click "Sign in with Google" on the Login page  
**Then** they are redirected to Google's OAuth consent screen  
**And** upon successful consent, the app receives a session cookie  
**And** `/api/auth/me` returns `user_id`, `email`, `name`, and `picture`  
**And** the user lands on the Portfolio tab

---

### TC-AUTH-02 — Dev Login (Local Mode)
**Given** the backend is running locally with no `GOOGLE_CLIENT_ID`  
**When** `POST /api/auth/dev-login` is called with `{"email": "test@dev.local", "name": "Dev User"}`  
**Then** a session cookie is set with a 30-day expiry  
**And** subsequent calls to `/api/auth/me` return the provided `email` and `name`

---

### TC-AUTH-03 — Session Persistence Across Page Reload
**Given** a logged-in user  
**When** they refresh the browser tab  
**Then** the app reads the session cookie  
**And** the user remains logged in without re-authenticating

---

### TC-AUTH-04 — Logout
**Given** a logged-in user  
**When** they click "Logout" (or call `POST /api/auth/logout`)  
**Then** the session cookie is cleared  
**And** `/api/auth/me` returns `401 Unauthorized`  
**And** the frontend redirects to the Login page

---

### TC-AUTH-05 — Expired / Invalid Session Cookie
**Given** a session cookie that has been revoked or has expired  
**When** the frontend makes any authenticated API call  
**Then** the server returns `401 Unauthorized`  
**And** the frontend redirects to the Login page rather than showing a blank screen

---

### TC-AUTH-06 — Auth Callback with Invalid Session ID
**Given** an attacker provides a fabricated `session_id`  
**When** `POST /api/auth/callback` is called with the fake `session_id`  
**Then** the server returns `401 Unauthorized`  
**And** no cookie is set

---

## 2. Portfolio — Holdings CRUD

### TC-HOLD-01 — Add a Valid Stock Holding
**Given** a logged-in user with an empty portfolio  
**When** they fill in Symbol=`AAPL`, Quantity=`10`, Avg Cost=`180.00` and click "Add"  
**Then** a toast "Added AAPL" is displayed  
**And** the holdings table shows one row for `AAPL` with qty=10 and avg_cost=$180.00  
**And** the summary shows cost_basis = $1,800.00

---

### TC-HOLD-02 — Add a Crypto Holding
**Given** a logged-in user  
**When** they add Symbol=`BTC-USD`, Quantity=`0.5`, Avg Cost=`40000`  
**Then** the holding is saved with `asset_type = "crypto"`  
**And** the `crypto_count` in the summary increments by 1

---

### TC-HOLD-03 — Add an ETF Holding
**Given** a logged-in user  
**When** they add Symbol=`VOO`, Quantity=`5`, Avg Cost=`450`  
**Then** the holding is saved with `asset_type = "etf"` (via asset_metadata_service)  
**And** the `etf_count` in the summary increments by 1

---

### TC-HOLD-04 — Add Holding with Missing Symbol (Validation)
**Given** a logged-in user  
**When** they submit the Add Holding form with Symbol left blank  
**Then** a toast error "Symbol, quantity, and avg cost required" is displayed  
**And** no API call is made  
**And** the holdings list is unchanged

---

### TC-HOLD-05 — Add Holding with Missing Quantity (Validation)
**Given** a logged-in user  
**When** they submit the Add Holding form with Quantity left blank  
**Then** the same validation toast fires  
**And** no new holding is created

---

### TC-HOLD-06 — Add Holding with Zero Quantity (Edge Case)
**Given** a logged-in user  
**When** they submit Symbol=`TSLA`, Quantity=`0`, Avg Cost=`200`  
**Then** the API returns a 422 or the frontend rejects it before submission  
**And** no holding is inserted

---

### TC-HOLD-07 — Add Holding with Negative Cost (Edge Case)
**Given** a logged-in user  
**When** they submit Symbol=`MSFT`, Quantity=`5`, Avg Cost=`-10`  
**Then** the frontend or API rejects the negative cost  
**And** a descriptive error message is shown

---

### TC-HOLD-08 — Add Duplicate Symbol
**Given** a logged-in user who already holds `NVDA`  
**When** they add `NVDA` again with different qty/cost  
**Then** a second separate holding row is created (the manual-add route does not auto-merge)  
**And** both rows appear in the holdings table

---

### TC-HOLD-09 — Delete a Holding
**Given** a user with `AAPL` in their portfolio  
**When** they click the delete icon on the `AAPL` row and confirm  
**Then** `DELETE /api/portfolio/holdings/{id}` is called  
**And** the row is removed from the UI  
**And** all summary KPIs recalculate without `AAPL`

---

### TC-HOLD-10 — Delete a Non-Existent Holding
**Given** a stale UI or race condition where a holding was already deleted  
**When** `DELETE /api/portfolio/holdings/{stale_id}` is called  
**Then** the API returns `404 Not Found`  
**And** the frontend shows an appropriate error toast

---

### TC-HOLD-11 — Update a Holding (PATCH)
**Given** a user with `AAPL` at qty=10  
**When** they edit the row and change Quantity to `15`  
**Then** `PATCH /api/portfolio/holdings/{id}` is called with `{"quantity": 15}`  
**And** the row updates in the UI  
**And** the summary KPIs reflect the new quantity

---

### TC-HOLD-12 — PATCH with No Changed Fields
**Given** a user edits a holding but changes nothing  
**When** `PATCH /api/portfolio/holdings/{id}` is called with an empty body  
**Then** the API returns `400 Bad Request` with "No fields to update"

---

### TC-HOLD-13 — User Isolation (Multi-User)
**Given** User A and User B are both logged in on separate clients  
**When** User A adds a holding  
**Then** User B's holdings list does not include User A's holding  
**And** each user's summary is computed independently

---

## 3. Portfolio — Summary KPIs

### TC-KPI-01 — Total Value Calculation
**Given** a user holds 10 AAPL at current price $190 and 5 MSFT at current price $400  
**When** the portfolio is loaded  
**Then** `total_value = (10 x 190) + (5 x 400) = $3,900.00`

---

### TC-KPI-02 — Total P&L Calculation
**Given** the same user bought AAPL at avg_cost $180 and MSFT at $350  
**When** the portfolio loads  
**Then** `total_cost = (10 x 180) + (5 x 350) = $3,550.00`  
**And** `total_pl = $3,900 - $3,550 = $350.00`  
**And** `total_pl_pct = (350 / 3550) x 100 ~= 9.859%`

---

### TC-KPI-03 — Day Change Calculation
**Given** AAPL `previous_close = $188` and `current_price = $190` with qty=10  
**When** the portfolio loads  
**Then** `day_change = ($190 - $188) x 10 = $20.00`  
**And** `day_change_pct ~= (20 / (3900 - 20)) x 100 ~= 0.515%`

---

### TC-KPI-04 — Fallback to Avg Cost When No Live Quote
**Given** a holding for an illiquid or invalid symbol with no live quote  
**When** the portfolio loads  
**Then** the displayed price equals avg_cost  
**And** pl = $0.00, pl_pct = 0%  
**And** `quote_source = "cost"` (not "live")

---

### TC-KPI-05 — Cost Basis Zero Guard (Division by Zero)
**Given** a holding where avg_cost = 0 (e.g., gifted stock)  
**When** the portfolio loads  
**Then** pl_pct is displayed as 0% (not NaN or Infinity)

---

### TC-KPI-06 — Asset Type Counts
**Given** a portfolio with 3 stocks, 2 ETFs, 1 crypto  
**When** `GET /api/portfolio/holdings` responds  
**Then** the summary contains `stock_count=3`, `etf_count=2`, `crypto_count=1`, `count=6`

---

## 4. Portfolio — History Chart

### TC-CHART-01 — 1D Range Shows Only Latest Trading Session
**Given** a user with positions held since before today  
**When** they select the `1D` range  
**Then** the chart only displays intraday data from the most recent trading session (not multiple days)  
**And** the x-axis shows time intervals (e.g., 9:30am to 4:00pm ET)  
**And** the line is not red due to stale previous-day data being prepended

---

### TC-CHART-02 — 1W Range
**Given** a user with an active portfolio  
**When** they select `1W`  
**Then** the chart shows approximately 5 trading-day data points  
**And** the x-axis labels show weekday dates

---

### TC-CHART-03 — 1M Range
**Given** a user with positions  
**When** they select `1M`  
**Then** the chart shows ~22 trading days  
**And** data points are daily close values

---

### TC-CHART-04 — YTD Range
**Given** a user  
**When** they select `YTD`  
**Then** the chart starts from January 1 of the current year  
**And** shows each trading day up to today

---

### TC-CHART-05 — 1Y and 5Y Ranges
**Given** a user  
**When** they select `1Y` or `5Y`  
**Then** the chart shows 1 year or 5 years of daily data respectively  
**And** the number of data points is roughly proportional to trading days in that period

---

### TC-CHART-06 — Benchmark Overlay
**Given** a user viewing any chart range  
**When** they add a benchmark (e.g., `SPY`)  
**Then** a second line appears on the chart representing SPY normalized to the same starting value as the portfolio  
**And** a legend identifies the two series

---

### TC-CHART-07 — Chart with Single Holding
**Given** a user with exactly one position (e.g., 10 AAPL)  
**When** they view any chart range  
**Then** the chart shows a single value line (not a flat zero line)

---

### TC-CHART-08 — Chart Tooltip on Hover
**Given** a user hovering over a chart data point  
**When** the cursor is on a specific date  
**Then** a tooltip displays the portfolio value and date/time for that point  
**And** if a benchmark is active, both values appear in the tooltip

---

### TC-CHART-09 — Chart Color — Up vs Down
**Given** the portfolio value at the end of the selected range is higher than the start  
**When** the chart renders  
**Then** the line and gradient are green (the "up" color)  
**And** if end value is less than start value, the color is red

---

### TC-CHART-10 — Chart Empty State (No Holdings)
**Given** a user with zero holdings  
**When** any chart range is selected  
**Then** the chart area displays a placeholder message (e.g., "No positions to display")  
**And** no API error is thrown  
**And** the range selector is still visible

---

### TC-CHART-11 — Holdings Added Mid-Range
**Given** a user who added a position mid-way through the selected `1M` range  
**When** the chart renders  
**Then** the historical value before the purchase date correctly reflects only the positions held at that time  
**And** there is no sudden price jump on the day of purchase

---

## 5. Portfolio — Allocation Treemap

### TC-TREEMAP-01 — Treemap Renders All Holdings
**Given** a portfolio with multiple holdings  
**When** the allocation treemap renders  
**Then** each holding appears as a rectangle  
**And** the rectangle size is proportional to its market value share of the total portfolio

---

### TC-TREEMAP-02 — Treemap Color Coding
**Given** a holding with a positive P&L  
**Then** its rectangle is the positive (green) color  
**Given** a holding with a negative P&L  
**Then** its rectangle is the negative (red) color

---

### TC-TREEMAP-03 — Treemap Empty State
**Given** a user with no holdings  
**When** the treemap renders  
**Then** a placeholder or empty state message is shown  
**And** no rendering error occurs

---

## 6. Portfolio — CSV Upload (Simple)

### TC-CSV-01 — Valid CSV Upload
**Given** a CSV file with columns `symbol`, `quantity`, `average cost`  
**When** the user uploads the file via "Upload CSV"  
**Then** `POST /api/portfolio/upload-csv` processes the file  
**And** valid rows are upserted into the user's holdings  
**And** the response includes `imported` (list of symbols) and `count`

---

### TC-CSV-02 — CSV with Alternate Column Names
**Given** a CSV using `ticker`, `shares`, `price` instead of `symbol`, `quantity`, `avg cost`  
**When** it is uploaded  
**Then** the server's flexible column-matching normalizes the names  
**And** the holding is correctly parsed and saved

---

### TC-CSV-03 — CSV with Invalid Rows (Missing Fields)
**Given** a CSV where some rows are missing `symbol` or `quantity`  
**When** it is uploaded  
**Then** invalid rows are skipped silently  
**And** valid rows are still imported  
**And** the response `errors` array is populated with descriptive messages

---

### TC-CSV-04 — CSV with Zero or Negative Quantity
**Given** a CSV row with `quantity = 0` or `quantity = -5`  
**When** it is uploaded  
**Then** that row is skipped  
**And** it does not create a holding

---

### TC-CSV-05 — CSV with Currency Symbols in Cost Column
**Given** a CSV where avg cost is formatted as `$152.30`  
**When** it is uploaded  
**Then** the `$` is stripped and the value is parsed as `152.30`

---

### TC-CSV-06 — Non-CSV / Corrupt File
**Given** a user uploads a `.jpg` or a binary file disguised as `.csv`  
**When** it is uploaded  
**Then** the server returns `400 Bad Request`  
**And** the frontend shows a descriptive error toast

---

## 7. Portfolio — Trade Activity Importer (Robinhood)

### TC-IMPORT-01 — Preview: Parse Valid Robinhood CSV
**Given** a valid Robinhood Trade Activity CSV export  
**When** the user uploads it via the Trade Activity Importer  
**Then** the preview screen shows derived holdings with FIFO-computed quantities and avg costs  
**And** stats include `total_realized_pl`, `trade_count`, and per-symbol lot details  
**And** no data has been written to the database yet

---

### TC-IMPORT-02 — Preview: Closed Positions Excluded
**Given** a Robinhood CSV where the user has fully sold all lots of `GME`  
**When** the preview is generated  
**Then** `GME` does not appear in the derived holdings (qty = 0 after FIFO clearing)

---

### TC-IMPORT-03 — Confirm: Replace Mode
**Given** a user who has previewed derived holdings  
**When** they confirm with `mode = "replace"`  
**Then** all existing holdings and lots are deleted first  
**And** the derived holdings are inserted fresh  
**And** the response contains `imported_count` and `lots_stored`

---

### TC-IMPORT-04 — Confirm: Merge Mode
**Given** a user who already has `AAPL` manually added  
**When** they confirm a Robinhood import with `mode = "merge"`  
**Then** the `AAPL` holding is updated (not duplicated) with the CSV-derived quantity and avg cost  
**And** new symbols not previously held are inserted

---

### TC-IMPORT-05 — Confirm: Empty Holdings List
**Given** a CSV where all positions were fully closed (no active holdings)  
**When** the user confirms the import  
**Then** the API returns `400 Bad Request` with "No holdings to import"

---

### TC-IMPORT-06 — Confirm: Symbol with qty <= 0 Skipped
**Given** a holding in the confirm payload with `quantity = 0`  
**When** the confirm endpoint processes it  
**Then** that holding is silently skipped and not inserted

---

### TC-IMPORT-07 — Invalid / Malformed Robinhood CSV
**Given** a file that is not a valid Robinhood Trade Activity CSV  
**When** it is uploaded to the preview endpoint  
**Then** the server returns `400 Bad Request` with a descriptive error  
**And** the frontend shows the error without crashing

---

## 8. Portfolio — Demo Seed

### TC-DEMO-01 — Seed Demo Portfolio
**Given** a logged-in user (even with existing data)  
**When** they click "Load Demo Portfolio"  
**Then** `POST /api/portfolio/seed-demo` clears all existing holdings  
**And** inserts 12 preset demo positions (AAPL, NVDA, TSLA, MSFT, AMZN, GOOGL, META, VOO, GLD, BTC-USD, ETH-USD, SOL-USD)  
**And** the portfolio table immediately shows all 12 holdings

---

## 9. Watchlist

### TC-WL-01 — Add a Symbol to Watchlist
**Given** a logged-in user  
**When** they type `PLTR` and click "Add to Watchlist"  
**Then** `POST /api/watchlist` is called with `{"symbol": "PLTR"}`  
**And** `PLTR` appears in the watchlist table

---

### TC-WL-02 — Add an Existing Symbol (Idempotency)
**Given** `PLTR` is already in the watchlist  
**When** the user adds `PLTR` again  
**Then** only one entry for `PLTR` exists (upsert behavior)  
**And** no error is shown

---

### TC-WL-03 — Add Empty Symbol (Validation)
**Given** the watchlist add form  
**When** the user submits without entering a symbol  
**Then** the API returns `400 Bad Request` with "symbol required"  
**And** the frontend shows a toast error

---

### TC-WL-04 — Remove a Symbol from Watchlist
**Given** `PLTR` is in the watchlist  
**When** the user clicks remove  
**Then** `DELETE /api/watchlist/PLTR` is called  
**And** `PLTR` is removed from the list

---

### TC-WL-05 — Watchlist Signals Load
**Given** a watchlist with up to 15 symbols  
**When** `GET /api/watchlist/signals` is called  
**Then** alpha signals, price, and change_pct are returned for each symbol  
**And** the UI displays signal strength and price delta

---

### TC-WL-06 — Congress Trades for Watchlist Symbol
**Given** `AAPL` is in the watchlist  
**When** the user clicks to see Congress trades for `AAPL`  
**Then** `GET /api/watchlist/congress/AAPL` returns the most recent 20 congressional trades  
**And** they are displayed in a table with date, politician name, and trade type

---

### TC-WL-07 — Empty Watchlist Signals
**Given** a user with an empty watchlist  
**When** `GET /api/watchlist/signals` is called  
**Then** the response is `{"signals": []}`  
**And** the UI shows an empty state prompt to add symbols

---

## 10. Stock News Tab

### TC-NEWS-01 — News Loads for Held Symbols
**Given** a user who holds `AAPL` and `TSLA`  
**When** they navigate to the Stock News tab  
**Then** news articles relevant to both symbols are fetched  
**And** each article shows title, source, and timestamp

---

### TC-NEWS-02 — Crypto Symbols Stripped of "-USD"
**Given** a user who holds `BTC-USD`  
**When** the stock news is fetched  
**Then** the news query uses `BTC` (not `BTC-USD`)  
**And** relevant Bitcoin news is returned

---

### TC-NEWS-03 — News with No Holdings
**Given** a user with no holdings  
**When** the Stock News tab loads  
**Then** an empty state is shown (e.g., "Add holdings to see relevant news")  
**And** no API error is thrown

---

### TC-NEWS-04 — Duplicate Articles Deduplication
**Given** the news service retrieves the same article from multiple sources  
**When** the response is returned  
**Then** each article URL appears only once  
**And** the article count is accurate

---

## 11. Macro News Tab

### TC-MACRO-01 — Macro News Loads
**Given** any user  
**When** `GET /api/news/macro` is called  
**Then** global financial news articles are returned  
**And** they are displayed with title, source, and timestamp

---

### TC-MACRO-02 — Macro News Empty / Feed Unavailable
**Given** the external macro news source is unreachable  
**When** the tab loads  
**Then** the UI shows a graceful error or empty state  
**And** the app does not crash

---

## 12. Sentiment Tab

### TC-SENT-01 — Portfolio Sentiment Loads
**Given** a user with holdings  
**When** they navigate to the Sentiment tab  
**Then** `GET /api/sentiment/portfolio` returns per-symbol sentiment scores and an average  
**And** a Fear & Greed index value is shown  
**And** each symbol displays its score out of 100

---

### TC-SENT-02 — Sentiment Score Bounds
**Given** any symbol sentiment is computed  
**When** the score is returned  
**Then** it is a value between 0 and 100 inclusive  
**And** negative or above-100 values are never displayed

---

### TC-SENT-03 — Average Score with Empty Portfolio
**Given** a user with no holdings  
**When** `/api/sentiment/portfolio` is called  
**Then** `average_score = 50` (the neutral fallback)  
**And** `per_symbol = []`

---

### TC-SENT-04 — Individual Symbol Sentiment
**Given** any authenticated user  
**When** `GET /api/sentiment/AAPL` is called  
**Then** the sentiment score for `AAPL` specifically is returned  
**And** the symbol matches `AAPL` in the response

---

## 13. Insider Flow Tab

### TC-INSIDER-01 — Insider Summary for Holdings
**Given** a user with holdings  
**When** they view the Insider Flow tab  
**Then** insider buy/sell summaries are shown per symbol  
**And** each row includes filer name, trade type, shares, and date

---

### TC-INSIDER-02 — Congress Trades Table
**Given** a user navigates to the Congress Trades sub-tab  
**When** `GET /api/insider/congress` is called  
**Then** up to 80 congressional trades are displayed  
**And** filtering by symbol reduces the list to that ticker's trades

---

### TC-INSIDER-03 — SEC Form 4 Filings
**Given** a user selects the SEC Form 4 tab  
**When** `GET /api/insider/sec-form4` is called  
**Then** up to 40 Form 4 filings are displayed  
**And** each filing shows issuer, filer, and transaction date

---

### TC-INSIDER-04 — Empty Holdings for Insider Summary
**Given** a user with no holdings  
**When** the Insider Flow tab loads  
**Then** an empty state is displayed  
**And** no API error occurs

---

## 14. Scanner Tab — Breakout Scanner

### TC-SCAN-01 — Breakout Candidates Load
**Given** a logged-in user  
**When** they open the Scanner tab  
**Then** `GET /api/scanner/breakouts` is called  
**And** a list of breakout candidates is displayed with symbol, signal type, and price

---

### TC-SCAN-02 — Watchlist Symbols Included in Scan
**Given** a user has `PLTR` in their watchlist  
**When** the scanner runs  
**Then** `PLTR` is included in the universe of symbols scanned for breakouts  
**And** it appears in results if it meets the breakout criteria

---

### TC-SCAN-03 — Scanner with No Breakouts Found
**Given** market conditions where no symbol meets breakout criteria  
**When** the scanner runs  
**Then** the UI shows "No breakout candidates found" or an equivalent empty state  
**And** no error is thrown

---

## 15. Scanner — Email Digest Notifications

### TC-NOTIF-01 — Enable Notifications
**Given** a user navigates to notification preferences  
**When** they enable notifications and save their email  
**Then** `POST /api/scanner/prefs` stores `{enabled: true, email: "..."}` for that user

---

### TC-NOTIF-02 — Manual Digest Trigger
**Given** a user has notifications enabled  
**When** they click "Send Digest Now"  
**Then** `POST /api/scanner/notify` triggers a scan and sends an email to the stored address  
**And** the response includes `sent: true` and `candidates_count`  
**And** `last_sent_date` is updated to today

---

### TC-NOTIF-03 — Daily Scheduler Does Not Double-Send
**Given** the daily scheduler ran and set `last_sent_date` to today  
**When** the scheduler loop runs again within the same day  
**Then** no additional email is sent to that user

---

### TC-NOTIF-04 — Notification Prefs for New User
**Given** a brand-new user who has never set notification preferences  
**When** `GET /api/scanner/prefs` is called  
**Then** the response defaults to `{enabled: false, email: user_email, last_sent_date: null}`

---

## 16. Alpha Signal Tab

### TC-ALPHA-01 — Alpha Signals Load
**Given** a user with holdings  
**When** they view the Alpha Signal tab  
**Then** `GET /api/signal/alpha` returns signals for all held symbols  
**And** each signal includes a composite score, momentum, and sentiment component

---

### TC-ALPHA-02 — Signal Score Consistency
**Given** a symbol's signal is computed  
**When** the signal is rendered  
**Then** the composite score is between 0 and 100  
**And** the buy/sell/hold recommendation aligns with the score (e.g., score > 70 means "BUY")

---

### TC-ALPHA-03 — Alpha with Empty Portfolio
**Given** a user with no holdings  
**When** `GET /api/signal/alpha` is called  
**Then** the response is `{"signals": []}`  
**And** the UI shows an empty state prompt

---

## 17. Backtest Panel

### TC-BACK-01 — Backtest Runs for Portfolio
**Given** a user with holdings  
**When** they trigger a backtest from the Backtest panel  
**Then** `GET /api/signal/backtest` returns per-symbol backtests  
**And** each result includes annualized return, Sharpe ratio, max drawdown, and win rate

---

### TC-BACK-02 — Backtest with No Holdings
**Given** a user with an empty portfolio  
**When** the Backtest panel loads  
**Then** the API returns `{"backtests": []}`  
**And** the UI shows a placeholder to add holdings first

---

### TC-BACK-03 — Backtest Data Visualized
**Given** backtest results are returned  
**When** the user views the Backtest panel  
**Then** cumulative return values are plotted on a chart over time  
**And** summary statistics (Sharpe, max drawdown) are displayed in a table

---

## 18. Chat Tab — AI Assistant

### TC-CHAT-01 — Send a Message
**Given** a logged-in user is on the Chat tab  
**When** they type "What is my portfolio's total return?" and click Send  
**Then** `POST /api/chat/message` is called with the message text  
**And** the AI responds within a reasonable time  
**And** the response is displayed in the conversation thread

---

### TC-CHAT-02 — Context Awareness (Portfolio Summary Injected)
**Given** a user holds `AAPL` and `NVDA`  
**When** they ask "What do I hold?"  
**Then** the AI's response references both holdings  
**And** does not fabricate symbols the user does not hold

---

### TC-CHAT-03 — Conversation Persistence
**Given** a user has an existing conversation `conv_abc`  
**When** they send a new message with `conversation_id = "conv_abc"`  
**Then** the message is appended to the existing history  
**And** `GET /api/chat/conversations/conv_abc` shows the full thread

---

### TC-CHAT-04 — New Conversation Created Automatically
**Given** a user sends a message without a `conversation_id`  
**When** the API responds  
**Then** a new `conversation_id` is generated and returned  
**And** the conversation is listed in `GET /api/chat/conversations`

---

### TC-CHAT-05 — Delete a Conversation
**Given** a user has conversation `conv_abc`  
**When** they delete it via `DELETE /api/chat/conversations/conv_abc`  
**Then** the conversation is removed from the list  
**And** `GET /api/chat/conversations/conv_abc` returns `404`

---

### TC-CHAT-06 — Empty Message (Validation)
**Given** a user on the Chat tab  
**When** they click Send with an empty input field  
**Then** no API call is made  
**And** the input field shows a validation hint

---

### TC-CHAT-07 — Long Message Handling
**Given** a user pastes a very long message (over 2000 characters)  
**When** they send it  
**Then** the API either truncates or processes it without crashing  
**And** the response is coherent

---

### TC-CHAT-08 — Ticker Extraction from Response
**Given** the AI mentions `$AAPL` and `$GOOG` in its response  
**When** the response is rendered  
**Then** `extracted_tickers = ["AAPL", "GOOG"]` are returned in the API response  
**And** they are displayed as clickable links or chips in the UI

---

## 19. Portfolio Risk Auditor

### TC-RISK-01 — Risk Report Generates
**Given** a user with a diverse portfolio  
**When** they open the Portfolio Risk Auditor  
**Then** a risk report is displayed showing concentration risk, sector exposure, and asset-type breakdown

---

### TC-RISK-02 — High Concentration Warning
**Given** a user where one holding represents more than 50% of total portfolio value  
**When** the risk auditor runs  
**Then** a "High Concentration Risk" warning is shown for that holding  
**And** the warning badge is visually prominent (e.g., red or amber)

---

### TC-RISK-03 — All-Crypto Portfolio Warning
**Given** a user whose portfolio is 100% crypto  
**When** the risk auditor runs  
**Then** a warning about "No broad-market equity exposure" is raised  
**And** a recommendation to add ETFs or stocks is shown

---

### TC-RISK-04 — Dividend KPI
**Given** a portfolio with holdings that pay dividends  
**When** the risk auditor computes KPIs  
**Then** `computeDividendKPI` returns an estimated annual yield percentage  
**And** it is displayed in the KPI summary row

---

### TC-RISK-05 — Risk Auditor Empty State
**Given** a user with no holdings  
**When** the risk auditor loads  
**Then** a placeholder is shown ("Add holdings to generate a risk report")  
**And** no computation errors occur

---

## 20. Market Quotes & Ticker Bar

### TC-QUOTE-01 — Market Indices Load
**Given** any user visits the app  
**When** `GET /api/market/indices` is called  
**Then** market indices (S&P 500, NASDAQ, DOW, etc.) are returned with price and change  
**And** the top ticker bar updates with live values

---

### TC-QUOTE-02 — Individual Quote Lookup
**Given** any user  
**When** `GET /api/market/quote/AAPL` is called  
**Then** the current price, previous close, and change percentage for `AAPL` are returned

---

### TC-QUOTE-03 — Quote for Invalid Symbol
**Given** a user requests a quote for a non-existent symbol  
**When** `GET /api/market/quote/NOTREAL` is called  
**Then** the API returns `404 Not Found` with "No quote for NOTREAL"

---

### TC-QUOTE-04 — Ticker Bar Scrolls Continuously
**Given** the app is open  
**When** the ticker bar is rendered  
**Then** it auto-scrolls horizontally displaying all market indices  
**And** it does not freeze or glitch on page transitions

---

## 21. Empty State — No Holdings

### TC-EMPTY-01 — Empty Portfolio Landing State
**Given** a brand-new user with no holdings  
**When** they land on the Portfolio tab  
**Then** the holdings table shows an empty state message  
**And** the "Add Holding" form and "Load Demo" button are still visible and usable  
**And** all KPIs display $0.00

---

### TC-EMPTY-02 — All Tabs Graceful with Empty Portfolio
**Given** a user with no holdings navigates to Stock News, Sentiment, Insider, Options, or Alpha tabs  
**When** each tab makes API calls that depend on held symbols  
**Then** each tab shows its own empty state message  
**And** no JavaScript errors are thrown  
**And** the tab renders without crashing

---

## 22. Error Boundary & Network Failures

### TC-ERR-01 — Backend Unreachable
**Given** the backend server is down  
**When** the frontend makes any API call  
**Then** each component catches the error gracefully  
**And** a toast error or inline message explains the problem  
**And** the app shell remains visible (no white screen of death)

---

### TC-ERR-02 — API Returns 500 Internal Server Error
**Given** a server-side crash on any endpoint  
**When** the frontend receives a `500` response  
**Then** the component shows an error state  
**And** the Error Boundary (`ErrorBoundary.jsx`) catches any unhandled React exceptions  
**And** it renders a fallback UI with a "Reload" button

---

### TC-ERR-03 — Slow Network / Timeout
**Given** an API call takes longer than expected  
**When** the request is in-flight  
**Then** a loading spinner or skeleton is shown  
**And** if the request ultimately fails, a user-friendly message is displayed

---

### TC-ERR-04 — Stale Data Warning
**Given** yfinance returns cached / delayed data  
**When** the quote is displayed  
**Then** the `quote_source` field indicates the data freshness  
**And** if data is older than 15 minutes during market hours, a visual stale-data indicator is shown

---

### TC-ERR-05 — CORS Failure (Misconfigured Deployment)
**Given** the frontend is deployed to a domain not in `CORS_ORIGINS`  
**When** any API call is made  
**Then** the browser blocks the request with a CORS error  
**And** the app logs a clear error message in the console identifying the CORS issue

---

*End of specification. Total: 90+ scenarios across 22 feature areas.*  
*Next step: Implement as automated tests using pytest (backend) and Playwright/Vitest (frontend).*
