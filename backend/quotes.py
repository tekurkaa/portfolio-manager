"""Market data service - yfinance primary + Alpha Vantage fallback."""
import os
import time
import asyncio
import logging
from typing import Optional, List, Dict, Any

import httpx
import yfinance as yf

logger = logging.getLogger(__name__)

ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY", "")

_CACHE: Dict[str, Any] = {}
_CACHE_TTL = 60


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
    """Synchronous yfinance fetch (runs in threadpool)."""
    try:
        yh_sym = _normalize_crypto_symbol(symbol)
        t = yf.Ticker(yh_sym)
        fi = t.fast_info
        price = fi.get("lastPrice") or fi.get("last_price")
        prev = fi.get("previousClose") or fi.get("previous_close")
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
        }
    except Exception as e:
        logger.warning(f"yfinance fail {symbol}: {e}")
        return None


async def _fetch_yfinance(symbol: str) -> Optional[Dict[str, Any]]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _yf_fetch_sync, symbol)


async def _fetch_alpha_vantage_quote(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    if not ALPHA_VANTAGE_KEY or is_crypto(symbol):
        return None
    url = "https://www.alphavantage.co/query"
    params = {
        "function": "GLOBAL_QUOTE",
        "symbol": symbol.upper(),
        "apikey": ALPHA_VANTAGE_KEY,
    }
    try:
        r = await client.get(url, params=params, timeout=10.0)
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


async def get_market_indices() -> List[Dict[str, Any]]:
    tickers = [
        ("^GSPC", "S&P 500"),
        ("^IXIC", "NASDAQ"),
        ("^DJI", "DOW"),
        ("BTC-USD", "BTC"),
        ("ETH-USD", "ETH"),
        ("GC=F", "GOLD"),
        ("^TNX", "10Y YIELD"),
        ("CL=F", "OIL"),
    ]
    tasks = [_fetch_yfinance(s) for s, _ in tickers]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    out = []
    for (sym, label), r in zip(tickers, results):
        if r:
            r["display_name"] = label
            out.append(r)
    return out
