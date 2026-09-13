"""Options flow (unusual activity) + composite Alpha Signal Score via yfinance."""
import asyncio
import logging
import math
import time
from typing import List, Dict, Any, Optional

import yfinance as yf
import pandas as pd

logger = logging.getLogger(__name__)

_ALPHA_CACHE: Dict[str, Any] = {}
_CACHE_TTL = 300  # 5 minutes


def _options_flow_sync(symbol: str) -> Dict[str, Any]:
    try:
        t = yf.Ticker(symbol)
        expiries = t.options[:3]  # nearest 3 expiries
        rows: List[Dict[str, Any]] = []
        for exp in expiries:
            try:
                chain = t.option_chain(exp)
            except Exception:
                continue
            for kind, df in (("call", chain.calls), ("put", chain.puts)):
                if df is None or df.empty:
                    continue
                for _, r in df.iterrows():
                    try:
                        v = r.get("volume")
                        vol = int(v) if v == v and v is not None else 0  # NaN-safe
                        o = r.get("openInterest")
                        oi = int(o) if o == o and o is not None else 0
                    except Exception:
                        continue
                    if vol < 500:
                        continue
                    ratio = (vol / oi) if oi > 0 else float(vol)
                    rows.append({
                        "symbol": symbol.upper(),
                        "expiry": exp,
                        "kind": kind,
                        "strike": float(r.get("strike") or 0),
                        "last": float(r.get("lastPrice") or 0),
                        "volume": vol,
                        "open_interest": oi,
                        "vol_oi_ratio": round(ratio, 2),
                        "iv": round(float(r.get("impliedVolatility") or 0) * 100, 2),
                        "unusual": ratio >= 3 or (oi == 0 and vol >= 1000),
                    })
        rows.sort(key=lambda x: x["vol_oi_ratio"], reverse=True)
        return {"symbol": symbol.upper(), "flow": rows[:30]}
    except Exception as e:
        logger.warning(f"options {symbol}: {e}")
        return {"symbol": symbol.upper(), "flow": []}


async def get_options_flow(symbol: str) -> Dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _options_flow_sync, symbol)


async def get_portfolio_options_flow(symbols: List[str]) -> Dict[str, Any]:
    """Aggregate unusual options activity across held tickers."""
    stocks = [s for s in symbols if "-USD" not in s.upper()][:8]
    tasks = [get_options_flow(s) for s in stocks]
    results = await asyncio.gather(*tasks)
    all_flow: List[Dict[str, Any]] = []
    per_sym = {}
    for r in results:
        per_sym[r["symbol"]] = r["flow"]
        all_flow.extend(r["flow"])
    unusual = [x for x in all_flow if x["unusual"]]
    unusual.sort(key=lambda x: x["vol_oi_ratio"], reverse=True)
    # Bullish vs bearish tilt
    call_vol = sum(x["volume"] for x in all_flow if x["kind"] == "call")
    put_vol = sum(x["volume"] for x in all_flow if x["kind"] == "put")
    put_call_ratio = round(put_vol / call_vol, 3) if call_vol else 0
    return {
        "unusual": unusual[:40],
        "per_symbol": per_sym,
        "total_call_volume": call_vol,
        "total_put_volume": put_vol,
        "put_call_ratio": put_call_ratio,
    }


def _momentum_score_sync(symbol: str) -> float:
    """5-day price momentum → 0-100 score. >50 = bullish momentum."""
    try:
        yh = symbol.upper()
        if yh in {"BTC","ETH","SOL","DOGE","ADA","XRP","MATIC","AVAX","BNB"}:
            yh = f"{yh}-USD"
        t = yf.Ticker(yh)
        hist = t.history(period="10d", interval="1d")
        if hist is None or hist.empty or len(hist) < 2:
            return 50.0
        closes = hist["Close"].dropna()
        if len(closes) < 2:
            return 50.0
        pct5 = float((closes.iloc[-1] - closes.iloc[0]) / closes.iloc[0] * 100)
        # Map ±10% to 0-100
        return max(0.0, min(100.0, 50 + pct5 * 5))
    except Exception:
        return 50.0


async def get_momentum(symbol: str) -> float:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _momentum_score_sync, symbol)


async def alpha_signal(symbols: List[str], sentiment_map: Dict[str, int]) -> List[Dict[str, Any]]:
    """Composite Alpha Signal per holding.
    Score = 0.45 × momentum + 0.40 × sentiment + 0.15 × options bull tilt
    Emits BUY / HOLD / SELL and reasoning.
    """
    if not symbols:
        return []
    clean_syms = [s.upper() for s in symbols[:12]]
    cache_key = "alpha-" + ",".join(sorted(clean_syms))
    now = time.time()
    if cache_key in _ALPHA_CACHE:
        cached_data, exp = _ALPHA_CACHE[cache_key]
        if exp > now:
            return cached_data

    sem = asyncio.Semaphore(4)
    async def _eval_one(s: str) -> Dict[str, Any]:
        async with sem:
            try:
                mom_task = get_momentum(s)
                opt_task = get_options_flow(s)
                mom, opt = await asyncio.gather(mom_task, opt_task)
            except Exception as e:
                logger.warning(f"alpha eval {s}: {e}")
                mom = 50.0
                opt = {"flow": []}

            sent = float(sentiment_map.get(s, 50))
            call_v = sum(x["volume"] for x in opt.get("flow", []) if x.get("kind") == "call")
            put_v = sum(x["volume"] for x in opt.get("flow", []) if x.get("kind") == "put")
            opt_tilt = 50.0
            if call_v + put_v > 0:
                opt_tilt = (call_v / (call_v + put_v)) * 100

            composite = 0.45 * mom + 0.40 * sent + 0.15 * opt_tilt
            composite = round(composite, 1)
            if composite >= 65:
                signal = "BUY"
            elif composite <= 35:
                signal = "SELL"
            else:
                signal = "HOLD"

            drivers = []
            if mom >= 60: drivers.append("Momentum strong (+5d)")
            elif mom <= 40: drivers.append("Momentum weak (-5d)")
            if sent >= 60: drivers.append("StockTwits/Social bullish")
            elif sent <= 40: drivers.append("StockTwits/Social bearish")
            if opt_tilt >= 60: drivers.append("Call-heavy options")
            elif opt_tilt <= 40: drivers.append("Put-heavy options")

            return {
                "symbol": s,
                "signal": signal,
                "composite": composite,
                "momentum": round(mom, 1),
                "sentiment": round(sent, 1),
                "options_tilt": round(opt_tilt, 1),
                "drivers": drivers or ["Neutral across factors"],
            }

    results = await asyncio.gather(*[_eval_one(s) for s in clean_syms])
    out = [r for r in results if r]
    out.sort(key=lambda x: x["composite"], reverse=True)
    _ALPHA_CACHE[cache_key] = (out, now + _CACHE_TTL)
    return out
