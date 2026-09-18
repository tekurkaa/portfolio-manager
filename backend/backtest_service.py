"""Signal backtest: how did today's signal composition perform historically."""
import asyncio
import logging
from typing import Any, Optional, Dict, List

import yfinance as yf
import pandas as pd

from quotes import _normalize_crypto_symbol as _normalize

logger = logging.getLogger(__name__)


def _backtest_sync(symbol: str) -> Dict[str, Any]:
    """For a symbol, evaluate what would happen if today's momentum-signal was applied
    on every day in the last 6 months, then hold for 5/10/20 days."""
    try:
        yh = _normalize(symbol)
        t = yf.Ticker(yh)
        hist = t.history(period="9mo", interval="1d")
        if hist is None or hist.empty or len(hist) < 30:
            return {"symbol": symbol.upper(), "results": None, "error": "insufficient history"}
        closes = hist["Close"].dropna()
        # For each day (from day 5 to len-20): compute 5d momentum → signal → forward return
        pct5 = closes.pct_change(5) * 100
        buys_5, buys_10, buys_20 = [], [], []
        sells_5, sells_10, sells_20 = [], [], []
        holds_5, holds_10, holds_20 = [], [], []
        # thresholds mirror alpha_signal producer (momentum-focused subset)
        for i in range(5, len(closes) - 20):
            mom = pct5.iloc[i]
            if pd.isna(mom): continue
            price = closes.iloc[i]
            fwd5 = (closes.iloc[i+5] - price) / price * 100
            fwd10 = (closes.iloc[i+10] - price) / price * 100
            fwd20 = (closes.iloc[i+20] - price) / price * 100
            # Approx: strong positive momentum ~ BUY; strong negative ~ SELL
            if mom >= 3:
                buys_5.append(fwd5); buys_10.append(fwd10); buys_20.append(fwd20)
            elif mom <= -3:
                sells_5.append(fwd5); sells_10.append(fwd10); sells_20.append(fwd20)
            else:
                holds_5.append(fwd5); holds_10.append(fwd10); holds_20.append(fwd20)

        def summarize(arr):
            if not arr: return {"n": 0, "avg": 0, "win_rate": 0}
            n = len(arr)
            avg = round(sum(arr)/n, 2)
            wins = sum(1 for x in arr if x > 0)
            return {"n": n, "avg": avg, "win_rate": round(wins/n*100, 1)}

        return {
            "symbol": symbol.upper(),
            "sample_days": int(len(closes) - 25),
            "buy": {
                "5d": summarize(buys_5),
                "10d": summarize(buys_10),
                "20d": summarize(buys_20),
            },
            "sell": {
                "5d": summarize(sells_5),
                "10d": summarize(sells_10),
                "20d": summarize(sells_20),
            },
            "hold": {
                "5d": summarize(holds_5),
                "10d": summarize(holds_10),
                "20d": summarize(holds_20),
            },
        }
    except Exception as e:
        logger.warning(f"backtest {symbol}: {e}")
        return {"symbol": symbol.upper(), "results": None, "error": str(e)}


async def backtest_symbol(symbol: str) -> dict[str, Any]:
    return await asyncio.to_thread(_backtest_sync, symbol)


async def backtest_portfolio(symbols: list[str]) -> list[dict[str, Any]]:
    if not symbols:
        return []
    tasks = [backtest_symbol(s) for s in symbols[:12]]
    return await asyncio.gather(*tasks)
