"""Portfolio historical value calculation using yfinance historical prices."""
import asyncio
import logging
from typing import Any, Dict, List

import yfinance as yf
import pandas as pd

from quotes import _normalize_crypto_symbol as _normalize

logger = logging.getLogger(__name__)

# range -> (period, interval)
RANGE_MAP = {
    "1D": ("2d", "5m"),
    "1W": ("7d", "30m"),
    "1M": ("1mo", "1d"),
    "3M": ("3mo", "1d"),
    "YTD": ("ytd", "1d"),
    "1Y": ("1y", "1d"),
    "5Y": ("5y", "1wk"),
    "ALL": ("max", "1mo"),
}


def _fetch_history_sync(holdings: List[Dict[str, Any]], range_key: str) -> Dict[str, Any]:
    period, interval = RANGE_MAP.get(range_key, RANGE_MAP["1M"])
    symbols = [_normalize(h["symbol"]) for h in holdings]
    qty_map = {_normalize(h["symbol"]): float(h["quantity"]) for h in holdings}
    if not symbols:
        return {"range": range_key, "points": [], "start": None, "end": None, "start_value": 0, "end_value": 0}
    try:
        df = yf.download(
            tickers=symbols, period=period, interval=interval,
            group_by="ticker", auto_adjust=False, progress=False, threads=True,
        )
    except Exception as e:
        logger.warning(f"yf.download failed: {e}")
        return {"range": range_key, "points": [], "start": None, "end": None, "start_value": 0, "end_value": 0}

    # Build per-symbol close series - handle MultiIndex vs flat
    series_map = {}
    is_multi = isinstance(df.columns, pd.MultiIndex)
    for s in symbols:
        try:
            if is_multi:
                # Try (Close, symbol) or (symbol, Close)
                if ("Close", s) in df.columns:
                    col = df[("Close", s)].dropna()
                elif s in df.columns.get_level_values(0):
                    col = df[s]["Close"].dropna()
                else:
                    continue
            else:
                col = df["Close"].dropna() if "Close" in df.columns else None
            if col is not None and not col.empty:
                series_map[s] = col
        except Exception:
            continue

    if not series_map:
        return {"range": range_key, "points": [], "start": None, "end": None, "start_value": 0, "end_value": 0}

    # Align on union index and forward-fill
    all_index = None
    for s, ser in series_map.items():
        all_index = ser.index if all_index is None else all_index.union(ser.index)
    total = pd.Series(0.0, index=all_index)
    for s, ser in series_map.items():
        aligned = ser.reindex(all_index).ffill().bfill()
        total = total.add(aligned * qty_map.get(s, 0), fill_value=0)

    # For 1D: filter to only the single latest trading session
    if range_key == "1D" and not total.empty:
        latest_date = total.index[-1].date()
        total = total[total.index.date == latest_date]

    points = [
        {"t": ts.isoformat(), "v": round(float(v), 2)}
        for ts, v in zip(total.index, total.values)
        if not pd.isna(v)
    ]
    if not points:
        return {"range": range_key, "points": [], "start": None, "end": None, "start_value": 0, "end_value": 0}
    return {
        "range": range_key,
        "points": points,
        "start": points[0]["t"],
        "end": points[-1]["t"],
        "start_value": points[0]["v"],
        "end_value": points[-1]["v"],
        "change": round(points[-1]["v"] - points[0]["v"], 2),
        "change_pct": round(((points[-1]["v"] - points[0]["v"]) / points[0]["v"] * 100) if points[0]["v"] else 0, 3),
    }


async def portfolio_history(holdings: list[dict[str, Any]], range_key: str = "1M", benchmark: str | None = None) -> dict[str, Any]:
    result = await asyncio.to_thread(_fetch_history_sync, holdings, range_key)
    if benchmark and result.get("points"):
        bench_holding = [{"symbol": benchmark.upper(), "quantity": 1.0}]
        b = await asyncio.to_thread(_fetch_history_sync, bench_holding, range_key)
        result["benchmark"] = {
            "symbol": benchmark.upper(),
            "start_value": b.get("start_value"),
            "end_value": b.get("end_value"),
            "change_pct": b.get("change_pct"),
        }
        if b.get("change_pct") is not None and result.get("change_pct") is not None:
            result["alpha_vs_benchmark"] = round(result["change_pct"] - b["change_pct"], 3)
    return result
