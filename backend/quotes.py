"""Market data service - Real-time zero-lag macro indices + yfinance primary + Alpha Vantage fallback."""
import os
import re
import time
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List, Dict, Any
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import httpx
import yfinance as yf

logger = logging.getLogger(__name__)

_CACHE: Dict[str, Any] = {}
_CACHE_TTL = 15

_INDICES_CACHE: List[Dict[str, Any]] = []
_INDICES_CACHE_TIME = 0.0
_INDICES_CACHE_TTL = 2.0  # 2-second ultra-fresh cache for real-time live ticker stream

_EXECUTOR = ThreadPoolExecutor(max_workers=16)

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


def _normalize_crypto_symbol(symbol: str) -> str:
    s = symbol.upper().strip()
    if s.endswith("-USD"):
        return s
    common_crypto = {
        "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "MATIC", "AVAX",
        "DOT", "LINK", "LTC", "BCH", "ATOM", "NEAR", "APT", "SHIB",
        "UNI", "TRX", "ARB", "OP", "USDC", "USDT", "BNB",
    }
    if s in common_crypto:
        return f"{s}-USD"
    return s


def is_crypto(symbol: str) -> bool:
    return "-USD" in symbol.upper() or symbol.upper() in {
        "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "MATIC", "AVAX",
        "DOT", "LINK", "LTC", "BCH", "ATOM", "NEAR", "APT", "SHIB",
        "UNI", "TRX", "ARB", "OP", "USDC", "USDT", "BNB",
    }


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


async def _fetch_yfinance(symbol: str) -> Optional[Dict[str, Any]]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _yf_fetch_sync, symbol)


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
        loop = asyncio.get_running_loop()
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
        futures = [loop.run_in_executor(_EXECUTOR, _fetch_backup, item) for item in backup_tickers]
        res = await asyncio.gather(*futures, return_exceptions=True)
        out = [r for r in res if isinstance(r, dict) and r.get("price") is not None]

    if out:
        _INDICES_CACHE = out
        _INDICES_CACHE_TIME = now
    return _INDICES_CACHE or out
