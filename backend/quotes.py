"""Market data service - Real-time zero-lag macro indices + yfinance primary + Alpha Vantage fallback."""
import os
import re
import time
import asyncio
import logging
from datetime import datetime, time as dtime, timedelta
from typing import Any, Optional, Dict, List

import pytz
import httpx
import yfinance as yf
from asset_metadata_service import get_security_master_profile, BROAD_INDEX_ETFS, THEMATIC_LEVERAGED_ETFS

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def _clean_numeric(val: Any) -> float:
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    cleaned = re.sub(r"[^\d.-]", "", str(val))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


_CACHE: dict[str, Any] = {}
_CACHE_TTL = 15

_INDICES_CACHE: list[dict[str, Any]] = []
_INDICES_CACHE_TIME = 0.0
_INDICES_CACHE_TTL = 2.0

COMMON_CRYPTO = {
    "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "MATIC", "AVAX",
    "DOT", "LINK", "LTC", "BCH", "ATOM", "NEAR", "APT", "SHIB",
    "UNI", "TRX", "ARB", "OP", "USDC", "USDT", "BNB",
}


def _normalize_crypto_symbol(symbol: str) -> str:
    s = symbol.upper().strip()
    if s.endswith("-USD"):
        return s
    if s in COMMON_CRYPTO:
        return f"{s}-USD"
    return s


normalize_symbol = _normalize_crypto_symbol


def is_crypto(symbol: str) -> bool:
    s = symbol.upper()
    return "-USD" in s or s in COMMON_CRYPTO


def _yf_fetch_sync(symbol: str) -> Optional[Dict[str, Any]]:
    """Synchronous yfinance fetch."""
    try:
        yh_sym = _normalize_crypto_symbol(symbol)
        t = yf.Ticker(yh_sym)
        fi = t.fast_info
        price = fi.last_price or fi.get("lastPrice") or fi.get("last_price")
        prev = fi.previous_close or fi.get("previousClose") or fi.get("previous_close")
        if price is None:
            return None
        change = None
        change_pct = None
        if prev:
            change = float(price) - float(prev)
            change_pct = (change / float(prev)) * 100 if prev else 0
        return {
            "symbol": symbol.upper(),
            "price": round(float(price), 4),
            "previous_close": round(float(prev), 4) if prev else None,
            "change": round(float(change), 4) if change is not None else None,
            "change_percent": round(float(change_pct), 3) if change_pct is not None else None,
            "currency": fi.get("currency", "USD") or "USD",
            "market_state": "REGULAR",
            "asset_type": "crypto" if is_crypto(symbol) else "stock",
            "source": "yfinance",
            "updated_at": time.time(),
        }
    except Exception as e:
        logger.warning(f"yfinance fail {symbol}: {e}")
        return None


async def _fetch_yfinance(symbol: str) -> dict[str, Any] | None:
    return await asyncio.to_thread(_yf_fetch_sync, symbol)


async def _fetch_alpha_vantage_quote(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    key = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
    if not key or is_crypto(symbol):
        return None
    url = "https://www.alphavantage.co/query"
    params = {
        "function": "GLOBAL_QUOTE",
        "symbol": symbol.upper(),
        "apikey": key,
    }
    try:
        r = await client.get(url, params=params, timeout=8.0)
        data = r.json()
        q = data.get("Global Quote", {})
        if not q or not q.get("05. price"):
            return None
        price = float(q.get("05. price", 0))
        prev = float(q.get("08. previous close", 0))
        change = float(q.get("09. change", 0))
        change_pct = float(q.get("10. change percent", "0%").replace("%", "") or 0)
        return {
            "symbol": symbol.upper(),
            "price": round(price, 4),
            "previous_close": round(prev, 4),
            "change": round(change, 4),
            "change_percent": round(change_pct, 3),
            "currency": "USD",
            "market_state": "REGULAR",
            "asset_type": "stock",
            "source": "alphavantage",
            "updated_at": time.time(),
        }
    except Exception as e:
        logger.warning(f"Alpha Vantage fetch failed for {symbol}: {e}")
        return None


async def get_quote(symbol: str, use_cache: bool = True) -> Optional[Dict[str, Any]]:
    sym = symbol.upper().strip()
    now = time.time()
    if use_cache and sym in _CACHE:
        data, exp = _CACHE[sym]
        if exp > now:
            return data
    q = await _fetch_yfinance(sym)
    if q is None:
        async with httpx.AsyncClient() as client:
            q = await _fetch_alpha_vantage_quote(client, sym)
    if q:
        _CACHE[sym] = (q, now + _CACHE_TTL)
    return q


async def get_quotes(symbols: List[str]) -> Dict[str, Any]:
    tasks = [get_quote(s) for s in symbols]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return {s.upper(): r for s, r in zip(symbols, results) if r}


# ---------- 0-SECOND REAL-TIME INSTITUTIONAL INDICES FEED ----------
CNBC_SYMBOLS_MAP = [
    (".SPX", "S&P 500", "index"),
    (".NDX", "NASDAQ 100", "index"),
    (".DJI", "DOW", "index"),
    (".RUT", "RUSSELL 2K", "index"),
    (".VIX", "VIX", "volatility"),
    (".DXY", "DXY", "currency"),
    ("US10Y", "10Y YIELD", "yield"),
    ("@CL.1", "CRUDE OIL", "commodity"),
    ("@GC.1", "GOLD", "commodity"),
    ("@SI.1", "SILVER", "commodity"),
    ("BTC.CB=", "BTC", "crypto"),
    ("ETH.CB=", "ETH", "crypto"),
]


async def _fetch_cnbc_realtime_indices() -> List[Dict[str, Any]]:
    """Fetch real-time (0-second exchange feed) index, commodity, rate, and crypto quotes."""
    symbols_query = "|".join(s for s, _, _ in CNBC_SYMBOLS_MAP)
    url = f"https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols={symbols_query}&requestMethod=itv&output=json"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(url, headers=HEADERS)
            if r.status_code != 200:
                return []
            data = r.json()
            items = data.get("FormattedQuoteResult", {}).get("FormattedQuote", [])
            raw_by_sym = {it.get("symbol"): it for it in items if isinstance(it, dict)}
            
            output = []
            for sym, label, kind in CNBC_SYMBOLS_MAP:
                it = raw_by_sym.get(sym)
                if not it:
                    continue
                last_price = _clean_numeric(it.get("last"))
                change = _clean_numeric(it.get("change"))
                pct = _clean_numeric(it.get("change_pct"))
                prev = _clean_numeric(it.get("previous_day_closing"))
                if last_price <= 0:
                    continue
                output.append({
                    "symbol": sym,
                    "display_name": label,
                    "category": kind,
                    "price": round(last_price, 2),
                    "change": round(change, 2),
                    "change_percent": round(pct, 2),
                    "previous_close": round(prev, 2) if prev else None,
                    "currency": "USD",
                    "source": "realtime_exchange",
                    "updated_at": time.time(),
                })
            return output
    except Exception as e:
        logger.warning(f"CNBC real-time indices fetch failed: {e}")
        return []


async def _fetch_solana_quote() -> Optional[Dict[str, Any]]:
    """Fetch Solana real-time quote."""
    try:
        q = await _fetch_yfinance("SOL-USD")
        if q:
            return {
                "symbol": "SOL-USD",
                "display_name": "SOL",
                "category": "crypto",
                "price": round(q["price"], 2),
                "change": round(q["change"] or 0, 2),
                "change_percent": round(q["change_percent"] or 0, 2),
                "currency": "USD",
                "source": "yfinance",
                "updated_at": time.time(),
            }
    except Exception:
        pass
    return None


async def get_market_indices() -> List[Dict[str, Any]]:
    """Get real-time market indices, commodities, yields & crypto with zero latency."""
    global _INDICES_CACHE, _INDICES_CACHE_TIME
    now = time.time()
    if _INDICES_CACHE and (now - _INDICES_CACHE_TIME) < _INDICES_CACHE_TTL:
        return _INDICES_CACHE

    # 1. Fetch zero-lag real-time exchange quotes from institutional feed
    indices_task = _fetch_cnbc_realtime_indices()
    sol_task = _fetch_solana_quote()
    indices, sol = await asyncio.gather(indices_task, sol_task, return_exceptions=True)

    out = []
    if isinstance(indices, list) and len(indices) >= 8:
        out = list(indices)
        if isinstance(sol, dict) and sol:
            out.append(sol)
    else:
        # Fallback to parallel yfinance if primary feed is unreachable
        backup_tickers = [
            ("^GSPC", "S&P 500", "index"),
            ("^NDX", "NASDAQ 100", "index"),
            ("^DJI", "DOW", "index"),
            ("^RUT", "RUSSELL 2K", "index"),
            ("^VIX", "VIX", "volatility"),
            ("DX-Y.NYB", "DXY", "currency"),
            ("^TNX", "10Y YIELD", "yield"),
            ("CL=F", "CRUDE OIL", "commodity"),
            ("GC=F", "GOLD", "commodity"),
            ("SI=F", "SILVER", "commodity"),
            ("BTC-USD", "BTC", "crypto"),
            ("ETH-USD", "ETH", "crypto"),
            ("SOL-USD", "SOL", "crypto"),
        ]
        def _fetch_backup(item):
            sym, label, kind = item
            try:
                t = yf.Ticker(sym)
                fi = t.fast_info
                p = fi.last_price
                prev = fi.previous_close
                if p is None:
                    return None
                chg = float(p) - float(prev) if prev else 0.0
                pct = (chg / float(prev)) * 100 if prev else 0.0
                return {
                    "symbol": sym,
                    "display_name": label,
                    "category": kind,
                    "price": round(float(p), 2),
                    "change": round(float(chg), 2),
                    "change_percent": round(float(pct), 2),
                    "previous_close": round(float(prev), 2) if prev else None,
                    "currency": "USD",
                    "updated_at": time.time(),
                }
            except Exception:
                return None
        futures = [asyncio.to_thread(_fetch_backup, item) for item in backup_tickers]
        res = await asyncio.gather(*futures, return_exceptions=True)
        out = [r for r in res if isinstance(r, dict) and r.get("price") is not None]

    if out:
        _INDICES_CACHE = out
        _INDICES_CACHE_TIME = now
    return _INDICES_CACHE or out


def get_market_status() -> Dict[str, Any]:
    """Calculate US equity market session status and countdown in Eastern Time."""
    try:
        et_tz = pytz.timezone("America/New_York")
        now = datetime.now(et_tz)
    except Exception:
        et_tz = None
        now = datetime.utcnow() - timedelta(hours=4)

    weekday = now.weekday()  # 0=Mon, 4=Fri, 5=Sat, 6=Sun
    t = now.time()

    pre_start = dtime(4, 0)
    reg_start = dtime(9, 30)
    reg_end = dtime(16, 0)
    post_end = dtime(20, 0)

    if weekday >= 5:  # Weekend
        days_ahead = (7 - weekday) % 7
        if days_ahead == 0:
            days_ahead = 7
        next_open = datetime.combine(now.date() + timedelta(days=days_ahead), reg_start)
        if et_tz:
            next_open = et_tz.localize(next_open)
        secs = max(0, int((next_open - now).total_seconds()))
        return {
            "state": "CLOSED",
            "session": "Weekend / Closed",
            "countdown_label": "Opens Mon 9:30 AM ET",
            "seconds_remaining": secs,
            "is_open": False,
            "current_time_et": now.strftime("%I:%M:%S %p ET"),
        }

    if t < pre_start:
        next_open = datetime.combine(now.date(), reg_start)
        if et_tz:
            next_open = et_tz.localize(next_open)
        secs = max(0, int((next_open - now).total_seconds()))
        return {
            "state": "CLOSED",
            "session": "Overnight / Closed",
            "countdown_label": "Opens at 9:30 AM ET",
            "seconds_remaining": secs,
            "is_open": False,
            "current_time_et": now.strftime("%I:%M:%S %p ET"),
        }
    elif t < reg_start:
        next_open = datetime.combine(now.date(), reg_start)
        if et_tz:
            next_open = et_tz.localize(next_open)
        secs = max(0, int((next_open - now).total_seconds()))
        return {
            "state": "PRE_MARKET",
            "session": "Pre-Market",
            "countdown_label": "Regular Open in",
            "seconds_remaining": secs,
            "is_open": False,
            "current_time_et": now.strftime("%I:%M:%S %p ET"),
        }
    elif t < reg_end:
        next_close = datetime.combine(now.date(), reg_end)
        if et_tz:
            next_close = et_tz.localize(next_close)
        secs = max(0, int((next_close - now).total_seconds()))
        return {
            "state": "OPEN",
            "session": "Market Open",
            "countdown_label": "Closes in",
            "seconds_remaining": secs,
            "is_open": True,
            "current_time_et": now.strftime("%I:%M:%S %p ET"),
        }
    elif t < post_end:
        next_close = datetime.combine(now.date(), post_end)
        if et_tz:
            next_close = et_tz.localize(next_close)
        secs = max(0, int((next_close - now).total_seconds()))
        return {
            "state": "AFTER_HOURS",
            "session": "After-Hours",
            "countdown_label": "After-Hours ends in",
            "seconds_remaining": secs,
            "is_open": False,
            "current_time_et": now.strftime("%I:%M:%S %p ET"),
        }
    else:
        days_ahead = 3 if weekday == 4 else 1  # If Friday night, next open is Monday
        next_open = datetime.combine(now.date() + timedelta(days=days_ahead), reg_start)
        if et_tz:
            next_open = et_tz.localize(next_open)
        secs = max(0, int((next_open - now).total_seconds()))
        return {
            "state": "CLOSED",
            "session": "Market Closed",
            "countdown_label": "Opens in",
            "seconds_remaining": secs,
            "is_open": False,
            "current_time_et": now.strftime("%I:%M:%S %p ET"),
        }


_STOCK_DETAILS_CACHE: Dict[str, tuple[Dict[str, Any], float]] = {}
_STOCK_HISTORY_CACHE: Dict[str, tuple[Dict[str, Any], float]] = {}


_AV_OVERVIEW_CACHE: Dict[str, tuple[Dict[str, Any], float]] = {}


def _fetch_alpha_vantage_overview_sync(symbol: str) -> Optional[Dict[str, Any]]:
    sym = symbol.upper().strip()
    key = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
    if not key or is_crypto(sym):
        return None
    now = time.time()
    if sym in _AV_OVERVIEW_CACHE:
        val, exp = _AV_OVERVIEW_CACHE[sym]
        if exp > now:
            return val
    try:
        with httpx.Client(timeout=6.0) as client:
            r = client.get("https://www.alphavantage.co/query", params={
                "function": "OVERVIEW",
                "symbol": sym,
                "apikey": key,
            })
            if r.status_code == 200:
                data = r.json()
                if data and data.get("Name"):
                    parsed = {
                        "longName": data.get("Name"),
                        "longBusinessSummary": data.get("Description"),
                        "sector": data.get("Sector", "").title() if data.get("Sector") else None,
                        "industry": data.get("Industry", "").title() if data.get("Industry") else None,
                        "trailingPE": float(data.get("PERatio")) if data.get("PERatio") and data.get("PERatio") != "None" else None,
                        "forwardPE": float(data.get("ForwardPE")) if data.get("ForwardPE") and data.get("ForwardPE") != "None" else None,
                        "dividendYield": float(data.get("DividendYield")) if data.get("DividendYield") and data.get("DividendYield") != "None" else None,
                        "beta": float(data.get("Beta")) if data.get("Beta") and data.get("Beta") != "None" else None,
                        "market_cap": int(float(data.get("MarketCapitalization"))) if data.get("MarketCapitalization") and data.get("MarketCapitalization") != "None" else None,
                    }
                    _AV_OVERVIEW_CACHE[sym] = (parsed, now + 3600.0)
                    return parsed
    except Exception as e:
        logger.warning(f"Alpha Vantage overview failed for {sym}: {e}")
    return None


def _fetch_stock_details_sync(symbol: str) -> Optional[Dict[str, Any]]:
    try:
        yh_sym = _normalize_crypto_symbol(symbol)
        t = yf.Ticker(yh_sym)
        fi = None
        try:
            fi = t.fast_info
        except Exception:
            fi = None

        def safe_fi_attr(fi_obj, attr_name, default=None):
            if not fi_obj:
                return default
            try:
                v = getattr(fi_obj, attr_name, default)
                return v if v is not None else default
            except Exception:
                return default

        def safe_float(v, decimals=4):
            try:
                if v is None:
                    return None
                f = float(v)
                if f != f:  # NaN check
                    return None
                return round(f, decimals)
            except Exception:
                return None

        def safe_int(v):
            try:
                if v is None:
                    return None
                f = float(v)
                if f != f:
                    return None
                return int(f)
            except Exception:
                return None

        price = safe_fi_attr(fi, "last_price") or safe_fi_attr(fi, "lastPrice")
        prev = safe_fi_attr(fi, "previous_close") or safe_fi_attr(fi, "previousClose")

        if price is None or (isinstance(price, float) and price != price):
            # Check in-memory quote cache
            cached_q = _CACHE.get(symbol.upper(), (None, 0))[0]
            if cached_q and cached_q.get("price"):
                price = cached_q["price"]
                prev = cached_q.get("previous_close") or prev
            else:
                # Direct quote fallback via _yf_fetch_sync
                try:
                    q_fb = _yf_fetch_sync(symbol)
                    if q_fb and q_fb.get("price"):
                        price = q_fb["price"]
                        prev = q_fb.get("previous_close") or prev
                except Exception:
                    pass

                if price is None:
                    # Fallback to recent 5d history
                    try:
                        h_fallback = t.history(period="5d")
                        if not h_fallback.empty and "Close" in h_fallback:
                            valid_closes = h_fallback["Close"].dropna()
                            if not valid_closes.empty:
                                price = float(valid_closes.iloc[-1])
                                if len(valid_closes) > 1:
                                    prev = float(valid_closes.iloc[-2])
                    except Exception:
                        pass

        if price is None:
            return None

        price_f = float(price)
        prev_f = float(prev) if prev else None
        change = (price_f - prev_f) if prev_f else 0.0
        change_pct = (change / prev_f * 100) if prev_f else 0.0

        info = {}
        try:
            info = getattr(t, "info", {}) or {}
            if not isinstance(info, dict):
                info = {}
        except Exception:
            info = {}

        # Alpha Vantage fallback if info is missing longBusinessSummary or longName
        if not info.get("longBusinessSummary") and not is_crypto(symbol):
            av_data = _fetch_alpha_vantage_overview_sync(symbol)
            if av_data:
                for k, v in av_data.items():
                    if k not in info or not info[k]:
                        info[k] = v

        # Master security metadata fallback for guaranteed descriptive names & summaries
        master_profile = get_security_master_profile(symbol)
        if master_profile:
            if not info.get("longName") or info.get("longName").strip().upper() == symbol.upper():
                info["longName"] = master_profile["name"]
            if not info.get("longBusinessSummary"):
                info["longBusinessSummary"] = master_profile.get("summary")
            if not info.get("sector"):
                info["sector"] = master_profile.get("sector")
            if not info.get("industry"):
                info["industry"] = master_profile.get("industry")
            if not info.get("quote_type"):
                info["quote_type"] = master_profile.get("quote_type")

        # Fallback for clean name (NEVER allow bare symbol like "DDOG" to be the company name)
        clean_name = info.get("longName") or info.get("shortName")
        if not clean_name or clean_name.strip().upper() == symbol.upper():
            if is_crypto(symbol):
                clean_name = f"{symbol.upper()} Digital Currency"
            elif symbol.upper() in BROAD_INDEX_ETFS or symbol.upper() in THEMATIC_LEVERAGED_ETFS:
                clean_name = f"{symbol.upper()} ETF Trust"
            else:
                clean_name = f"{symbol.upper()} Corporation"

        # Fallback for clean summary (NEVER allow null or empty summary)
        clean_summary = info.get("longBusinessSummary") or info.get("description")
        if not clean_summary:
            asset_label = "cryptocurrency network" if is_crypto(symbol) else ("exchange-traded fund (ETF)" if (symbol.upper() in BROAD_INDEX_ETFS or symbol.upper() in THEMATIC_LEVERAGED_ETFS) else "public enterprise")
            clean_summary = f"{clean_name} ({symbol.upper()}) is an actively traded {asset_label} listed in US capital markets."

        return {
            "symbol": symbol.upper(),
            "name": clean_name,
            "price": round(price_f, 4),
            "previous_close": round(prev_f, 4) if prev_f else None,
            "change": round(change, 4),
            "change_percent": round(change_pct, 3),
            "open": safe_float(safe_fi_attr(fi, "open")),
            "day_high": safe_float(safe_fi_attr(fi, "day_high")),
            "day_low": safe_float(safe_fi_attr(fi, "day_low")),
            "year_high": safe_float(safe_fi_attr(fi, "year_high")),
            "year_low": safe_float(safe_fi_attr(fi, "year_low")),
            "volume": safe_int(safe_fi_attr(fi, "last_volume")),
            "avg_volume": safe_int(safe_fi_attr(fi, "three_month_average_volume")),
            "market_cap": safe_int(safe_fi_attr(fi, "market_cap")) or safe_int(info.get("market_cap")),
            "pe_ratio": safe_float(info.get("trailingPE"), 2),
            "forward_pe": safe_float(info.get("forwardPE"), 2),
            "dividend_yield": safe_float(info.get("dividendYield"), 4),
            "beta": safe_float(info.get("beta"), 3),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "currency": safe_fi_attr(fi, "currency", "USD") or "USD",
            "quote_type": info.get("quote_type") or safe_fi_attr(fi, "quote_type") or ("crypto" if is_crypto(symbol) else "stock"),
            "summary": clean_summary,
            "updated_at": time.time(),
        }
    except Exception as e:
        logger.warning(f"Stock details fetch failed for {symbol}: {e}")
        return None


async def get_stock_details(symbol: str) -> Optional[Dict[str, Any]]:
    sym = symbol.upper().strip()
    now = time.time()
    if sym in _STOCK_DETAILS_CACHE:
        val, exp = _STOCK_DETAILS_CACHE[sym]
        if exp > now:
            return val
    res = await asyncio.to_thread(_fetch_stock_details_sync, sym)
    if res:
        _STOCK_DETAILS_CACHE[sym] = (res, now + 30.0)  # 30s cache
    return res


def _fetch_stock_history_sync(symbol: str, range_key: str) -> Optional[Dict[str, Any]]:
    try:
        yh_sym = _normalize_crypto_symbol(symbol)
        t = yf.Ticker(yh_sym)
        rmap = {
            "1D": ("1d", "5m"),
            "1W": ("5d", "15m"),
            "1M": ("1mo", "1d"),
            "1Y": ("1y", "1d"),
            "5Y": ("5y", "1wk"),
        }
        period, interval = rmap.get(range_key.upper(), ("1d", "5m"))
        h = t.history(period=period, interval=interval)

        # Fallback for stocks during weekend, after-hours, or low-liquidity periods
        if (h.empty or len(h) < 2) and range_key.upper() == "1D":
            try:
                h5 = t.history(period="5d", interval="5m")
                if not h5.empty:
                    last_date = h5.index[-1].date()
                    h_day = h5[h5.index.date == last_date]
                    if not h_day.empty:
                        h = h_day
            except Exception:
                pass

        if h.empty and range_key.upper() == "1W":
            try:
                h = t.history(period="1mo", interval="1d")
            except Exception:
                pass

        if h.empty:
            return None

        pts = []
        for ts, row in h.iterrows():
            close = row.get("Close")
            if close is not None:
                try:
                    cf = float(close)
                    if cf == cf:  # not NaN
                        pts.append({
                            "t": ts.isoformat(),
                            "v": round(cf, 2),
                            "vol": int(row.get("Volume", 0)) if "Volume" in row and row["Volume"] == row["Volume"] else 0,
                        })
                except Exception:
                    pass

        if not pts:
            return None

        start_val = pts[0]["v"]
        end_val = pts[-1]["v"]
        chg = round(end_val - start_val, 2)
        pct = round((chg / start_val) * 100, 2) if start_val else 0.0

        return {
            "symbol": symbol.upper(),
            "range": range_key.upper(),
            "start_value": start_val,
            "end_value": end_val,
            "change": chg,
            "change_percent": pct,
            "points": pts,
            "count": len(pts),
            "updated_at": time.time(),
        }
    except Exception as e:
        logger.warning(f"Stock history fetch failed for {symbol} ({range_key}): {e}")
        return None


async def get_stock_history(symbol: str, range_key: str = "1D") -> Optional[Dict[str, Any]]:
    cache_key = f"{symbol.upper().strip()}:{range_key.upper().strip()}"
    now = time.time()
    if cache_key in _STOCK_HISTORY_CACHE:
        val, exp = _STOCK_HISTORY_CACHE[cache_key]
        if exp > now:
            return val
    res = await asyncio.to_thread(_fetch_stock_history_sync, symbol.upper().strip(), range_key.upper().strip())
    if res:
        ttl = 30.0 if range_key.upper() in ["1D", "1W"] else 300.0
        _STOCK_HISTORY_CACHE[cache_key] = (res, now + ttl)
    return res

