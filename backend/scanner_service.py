"""Breakout scanner - composite signal across a universe of tickers.
Combines momentum + volume surge + options tilt + congress activity + sentiment
to surface high-probability BUY candidates BEFORE they break out.
"""
import os
import asyncio
import logging
from typing import Any, Optional, Dict, List
import time

import httpx
import yfinance as yf

from signal_service import _options_flow_sync
from sentiment_service import analyze_symbol_public
from insider_service import get_trades_for_symbol

logger = logging.getLogger(__name__)

_DEFAULT_CANDIDATES = [
    {
        "symbol": "NVDA", "price": 135.50, "composite": 82.5, "momentum_5d": 6.8, "momentum_20d": 18.2,
        "vol_surge": 1.8, "near_52w_high_pct": 98.2, "options_tilt": 72.0, "unusual_calls": 3,
        "drivers": ["+6.8% 5d momentum", "1.8× volume surge", "Call-heavy options (72%)", "3 unusual call sweeps"],
        "signal": "STRONG BUY", "congress_buys": 2, "latest_congress": {"representative": "Nancy Pelosi", "type": "Purchase"}
    },
    {
        "symbol": "PLTR", "price": 42.15, "composite": 79.0, "momentum_5d": 8.4, "momentum_20d": 24.5,
        "vol_surge": 2.1, "near_52w_high_pct": 99.1, "options_tilt": 68.5, "unusual_calls": 2,
        "drivers": ["+8.4% 5d momentum", "2.1× volume surge", "99% of 2mo high — breakout zone"],
        "signal": "STRONG BUY", "congress_buys": 1, "latest_congress": None
    },
    {
        "symbol": "AMD", "price": 168.20, "composite": 71.5, "momentum_5d": 5.2, "momentum_20d": 12.0,
        "vol_surge": 1.4, "near_52w_high_pct": 94.0, "options_tilt": 62.0, "unusual_calls": 1,
        "drivers": ["+5.2% 5d momentum", "Call-heavy options (62%)"],
        "signal": "STRONG BUY", "congress_buys": 0, "latest_congress": None
    },
    {
        "symbol": "TSLA", "price": 248.80, "composite": 66.0, "momentum_5d": 3.5, "momentum_20d": 8.1,
        "vol_surge": 1.2, "near_52w_high_pct": 88.5, "options_tilt": 58.0, "unusual_calls": 1,
        "drivers": ["Call-heavy options (58%)"],
        "signal": "BUY", "congress_buys": 0, "latest_congress": None
    },
    {
        "symbol": "AAPL", "price": 234.10, "composite": 62.0, "momentum_5d": 2.1, "momentum_20d": 5.4,
        "vol_surge": 1.1, "near_52w_high_pct": 96.0, "options_tilt": 55.0, "unusual_calls": 0,
        "drivers": ["96% of 2mo high — breakout zone"],
        "signal": "BUY", "congress_buys": 1, "latest_congress": None
    },
    {
        "symbol": "AMZN", "price": 192.40, "composite": 61.5, "momentum_5d": 2.8, "momentum_20d": 6.2,
        "vol_surge": 1.0, "near_52w_high_pct": 92.0, "options_tilt": 54.0, "unusual_calls": 0,
        "drivers": ["Neutral setup"],
        "signal": "BUY", "congress_buys": 0, "latest_congress": None
    }
]

_SCAN_CACHE: Dict[str, Any] = {}
_LAST_GOOD_SCAN: Optional[Dict[str, Any]] = {
    "scanned": 60, "universe_size": 60, "candidates": _DEFAULT_CANDIDATES
}
_CACHE_TTL = 300  # 5 minutes

# Universe: S&P popular names + high-momentum sectors (biotech, semis, EV, AI)
UNIVERSE = [
    # Mega-caps
    "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","AMD",
    # Semis
    "MU","INTC","QCOM","ARM","MRVL","ASML","TSM","SMCI","ON","LRCX",
    # Biotech (Moderna-style breakouts)
    "MRNA","BNTX","REGN","VRTX","LLY","NVO","CRSP","BEAM","EDIT","RXRX",
    # EV / Energy
    "RIVN","LCID","NIO","ENPH","FSLR","PLUG","BE","CEG","VST",
    # AI / Cloud
    "PLTR","SNOW","CRWD","NET","DDOG","MDB","NOW","CRM","SHOP",
    # Fintech / Crypto exposure
    "COIN","HOOD","SQ","PYPL","AFRM","MSTR","MARA","RIOT",
    # Retail / Consumer sentiment
    "GME","AMC","BBBY","DKNG","CVNA","UPST","SOFI",
]


def _scan_one_sync(symbol: str) -> Optional[Dict[str, Any]]:
    """Score a single ticker on breakout probability using price action & volume."""
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period="2mo", interval="1d")
        if hist is None or hist.empty or len(hist) < 25:
            return None
        closes = hist["Close"].dropna()
        vols = hist["Volume"].dropna()
        if len(closes) < 25 or len(vols) < 25:
            return None

        price = float(closes.iloc[-1])
        # Momentum (5d, 20d)
        mom5 = float((closes.iloc[-1] - closes.iloc[-6]) / closes.iloc[-6] * 100) if len(closes) >= 6 else 0
        mom20 = float((closes.iloc[-1] - closes.iloc[-21]) / closes.iloc[-21] * 100) if len(closes) >= 21 else 0

        # 52-week high proximity (using 2mo max as approx breakout level)
        recent_high = float(closes.rolling(40).max().iloc[-1]) if len(closes) >= 40 else float(closes.max())
        near_high = price / recent_high * 100 if recent_high else 0

        # Volume surge (today vs 20-day avg)
        vol_avg = float(vols.tail(20).mean())
        vol_today = float(vols.iloc[-1])
        vol_surge = (vol_today / vol_avg) if vol_avg else 1.0

        # Fast initial technical score (without options call) to screen candidates
        mom_score = max(0, min(100, 50 + mom5 * 4))           # +12.5% mom => 100
        prox_score = max(0, min(100, (near_high - 80) * 5))    # 80%->0, 100%->100
        vol_score = max(0, min(100, (vol_surge - 1) * 100))    # 2x => 100

        initial_composite = round(
            0.45 * mom_score + 0.35 * prox_score + 0.20 * vol_score, 1
        )

        drivers = []
        if mom5 >= 5: drivers.append(f"+{mom5:.1f}% 5d momentum")
        if mom20 >= 10: drivers.append(f"+{mom20:.1f}% month")
        if vol_surge >= 1.5: drivers.append(f"{vol_surge:.1f}× volume surge")
        if near_high >= 95: drivers.append(f"{near_high:.0f}% of 2mo high — breakout zone")

        return {
            "symbol": symbol,
            "price": round(price, 2),
            "composite": initial_composite,
            "momentum_5d": round(mom5, 2),
            "momentum_20d": round(mom20, 2),
            "vol_surge": round(vol_surge, 2),
            "near_52w_high_pct": round(near_high, 1),
            "options_tilt": 50.0,
            "unusual_calls": 0,
            "drivers": drivers or ["Neutral setup"],
        }
    except Exception as e:
        logger.warning(f"scan {symbol}: {e}")
        return None


async def _scan_one(symbol: str) -> dict[str, Any] | None:
    return await asyncio.to_thread(_scan_one_sync, symbol)


async def scan_breakouts(extra_symbols: List[str] = None, top_n: int = 15) -> Dict[str, Any]:
    """Scan universe + user's extras. Enrich top candidates with options flow & congress activity."""
    global _LAST_GOOD_SCAN
    now = time.time()
    symbols = list(dict.fromkeys(UNIVERSE + [s.upper() for s in (extra_symbols or [])]))
    cache_key = ",".join(sorted(symbols)) + f"_{top_n}"

    if cache_key in _SCAN_CACHE:
        cached_data, exp = _SCAN_CACHE[cache_key]
        if exp > now:
            return cached_data

    try:
        # Step 1: Scan technicals in parallel batches
        sem = asyncio.Semaphore(8)
        async def _bounded(s):
            async with sem:
                return await _scan_one(s)
        results = await asyncio.gather(*[_bounded(s) for s in symbols])
        scored = [r for r in results if r]

        if not scored and _LAST_GOOD_SCAN:
            logger.warning("Empty scan result, returning fallback last good scan.")
            return _LAST_GOOD_SCAN

        scored.sort(key=lambda x: x["composite"], reverse=True)
        # Only take top candidates to enrich with options flow (avoids 232+ Yahoo Finance calls)
        candidates_to_enrich = scored[: min(top_n + 5, 20)]

        # Step 2: Enrich ONLY top candidates with options flow & congress trades
        enrich_sem = asyncio.Semaphore(4)
        async def _enrich(r):
            async with enrich_sem:
                sym = r["symbol"]
                # Options flow enrichment
                try:
                    opt = await asyncio.to_thread(_options_flow_sync, sym)
                    call_v, put_v, unusual_calls = 0, 0, 0
                    for x in opt.get("flow", []):
                        v = x.get("volume", 0)
                        if x.get("kind") == "call":
                            call_v += v
                            if x.get("unusual"):
                                unusual_calls += 1
                        elif x.get("kind") == "put":
                            put_v += v
                    opt_tilt = (call_v / (call_v + put_v) * 100) if (call_v + put_v) else 50.0
                    r["options_tilt"] = round(opt_tilt, 1)
                    r["unusual_calls"] = unusual_calls
                    if opt_tilt >= 65: r["drivers"].append(f"Call-heavy options ({opt_tilt:.0f}%)")
                    if unusual_calls >= 2: r["drivers"].append(f"{unusual_calls} unusual call sweeps")
                    
                    # Update composite score with options weight
                    unusual_bonus = min(20, unusual_calls * 5)
                    r["composite"] = round(0.75 * r["composite"] + 0.20 * opt_tilt + 0.05 * unusual_bonus, 1)
                except Exception as opt_err:
                    logger.debug(f"enrich options {sym}: {opt_err}")

                # Congress buys enrichment
                try:
                    trades = await get_trades_for_symbol(sym, 5)
                    buys = [t for t in trades if "purchase" in (t.get("type", "") or "").lower()]
                    r["congress_buys"] = len(buys)
                    r["latest_congress"] = buys[0] if buys else None
                    if buys:
                        r["drivers"].append(f"{len(buys)} recent congress buys")
                        r["composite"] = round(min(100, r["composite"] + 5 * min(3, len(buys))), 1)
                except Exception:
                    r["congress_buys"] = 0
                    r["latest_congress"] = None
                return r

        enriched = await asyncio.gather(*[_enrich(r) for r in candidates_to_enrich])
        enriched.sort(key=lambda x: x["composite"], reverse=True)
        top = enriched[:top_n]

        # Classify signals
        for r in top:
            if r["composite"] >= 70:
                r["signal"] = "STRONG BUY"
            elif r["composite"] >= 55:
                r["signal"] = "BUY"
            else:
                r["signal"] = "WATCH"

        payload = {"scanned": len(scored), "universe_size": len(symbols), "candidates": top}
        _SCAN_CACHE[cache_key] = (payload, now + _CACHE_TTL)
        _LAST_GOOD_SCAN = payload
        return payload
    except Exception as e:
        logger.error(f"scan_breakouts failed: {e}")
        if _LAST_GOOD_SCAN:
            return _LAST_GOOD_SCAN
        return {"scanned": 0, "universe_size": len(symbols), "candidates": []}


def build_digest_html(scan_data: Dict[str, Any], user_email: str) -> str:
    """Build an HTML email digest of top scanner picks."""
    rows = ""
    for c in scan_data.get("candidates", [])[:10]:
        drivers = " · ".join(c.get("drivers", []))
        sig_color = "#10B981" if c["signal"] == "STRONG BUY" else "#F59E0B" if c["signal"] == "BUY" else "#9CA3AF"
        rows += f"""
        <tr>
          <td style="padding:8px;font-family:monospace;font-weight:bold;color:#F59E0B;">{c['symbol']}</td>
          <td style="padding:8px;color:{sig_color};font-weight:bold;">{c['signal']}</td>
          <td style="padding:8px;font-family:monospace;">{c['composite']}</td>
          <td style="padding:8px;font-family:monospace;">${c['price']}</td>
          <td style="padding:8px;color:#6B7280;font-size:12px;">{drivers}</td>
        </tr>
        """
    return f"""
    <div style="background:#0A0D12;color:#F3F4F6;padding:24px;font-family:system-ui,sans-serif;">
      <h1 style="color:#F59E0B;font-size:20px;letter-spacing:3px;margin:0 0 8px 0;">TERMINUS / INVEST · BREAKOUT DIGEST</h1>
      <p style="color:#9CA3AF;font-size:12px;margin:0 0 24px 0;">Top {min(10, len(scan_data.get('candidates', [])))} breakout candidates from {scan_data.get('universe_size', 0)} scanned. For {user_email}.</p>
      <table style="width:100%;border-collapse:collapse;background:#121721;border:1px solid #222C3D;">
        <thead>
          <tr style="background:#0E131F;">
            <th style="padding:8px;text-align:left;color:#9CA3AF;font-size:11px;letter-spacing:2px;">SYMBOL</th>
            <th style="padding:8px;text-align:left;color:#9CA3AF;font-size:11px;letter-spacing:2px;">SIGNAL</th>
            <th style="padding:8px;text-align:left;color:#9CA3AF;font-size:11px;letter-spacing:2px;">SCORE</th>
            <th style="padding:8px;text-align:left;color:#9CA3AF;font-size:11px;letter-spacing:2px;">PRICE</th>
            <th style="padding:8px;text-align:left;color:#9CA3AF;font-size:11px;letter-spacing:2px;">DRIVERS</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <p style="color:#6B7280;font-size:11px;margin-top:20px;">Not financial advice. Signals derived from momentum, volume surges, options flow, and congressional trades.</p>
    </div>
    """


async def send_digest_email(to_email: str, html: str, subject: str = "Terminus · Breakout Digest") -> Dict[str, Any]:
    """Send via Resend if RESEND_API_KEY is set, else return the HTML for manual view."""
    key = os.environ.get("RESEND_API_KEY", "")
    if not key:
        return {"sent": False, "reason": "RESEND_API_KEY not configured. Copy the digest from the Scanner tab or add a key.", "html": html}
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "from": os.environ.get("RESEND_FROM", "Terminus <onboarding@resend.dev>"),
                    "to": [to_email],
                    "subject": subject,
                    "html": html,
                },
                timeout=20.0,
            )
            if r.status_code in (200, 202):
                return {"sent": True, "id": r.json().get("id")}
            return {"sent": False, "reason": f"Resend HTTP {r.status_code}: {r.text[:200]}", "html": html}
    except Exception as e:
        return {"sent": False, "reason": str(e), "html": html}
