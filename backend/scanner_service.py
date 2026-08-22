"""Breakout scanner - composite signal across a universe of tickers.
Combines momentum + volume surge + options tilt + congress activity + sentiment
to surface high-probability BUY candidates BEFORE they break out.
"""
import os
import asyncio
import logging
from typing import List, Dict, Any, Optional

import httpx
import yfinance as yf
import pandas as pd

from signal_service import _options_flow_sync
from sentiment_service import analyze_symbol_public
from insider_service import get_trades_for_symbol

logger = logging.getLogger(__name__)

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
    """Score a single ticker on breakout probability."""
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

        # Options tilt (call vs put volume nearest expiry)
        opt = _options_flow_sync(symbol)
        call_v = sum(x["volume"] for x in opt["flow"] if x["kind"] == "call")
        put_v = sum(x["volume"] for x in opt["flow"] if x["kind"] == "put")
        opt_tilt = (call_v / (call_v + put_v) * 100) if (call_v + put_v) else 50.0
        unusual_calls = sum(1 for x in opt["flow"] if x["kind"] == "call" and x["unusual"])

        # Composite score — breakout-biased
        # Weights: momentum 30 · near-52w 20 · volume surge 20 · options 20 · unusual calls bonus 10
        mom_score = max(0, min(100, 50 + mom5 * 4))           # +12.5% mom => 100
        prox_score = max(0, min(100, (near_high - 80) * 5))    # 80%->0, 100%->100
        vol_score = max(0, min(100, (vol_surge - 1) * 100))    # 2x => 100
        opt_score = opt_tilt
        unusual_bonus = min(30, unusual_calls * 6)

        composite = round(
            0.30 * mom_score + 0.20 * prox_score + 0.20 * vol_score +
            0.20 * opt_score + 0.10 * unusual_bonus, 1
        )

        drivers = []
        if mom5 >= 5: drivers.append(f"+{mom5:.1f}% 5d momentum")
        if mom20 >= 10: drivers.append(f"+{mom20:.1f}% month")
        if vol_surge >= 1.5: drivers.append(f"{vol_surge:.1f}× volume surge")
        if near_high >= 95: drivers.append(f"{near_high:.0f}% of 2mo high — breakout zone")
        if opt_tilt >= 65: drivers.append(f"Call-heavy options ({opt_tilt:.0f}%)")
        if unusual_calls >= 2: drivers.append(f"{unusual_calls} unusual call sweeps")

        return {
            "symbol": symbol,
            "price": round(price, 2),
            "composite": composite,
            "momentum_5d": round(mom5, 2),
            "momentum_20d": round(mom20, 2),
            "vol_surge": round(vol_surge, 2),
            "near_52w_high_pct": round(near_high, 1),
            "options_tilt": round(opt_tilt, 1),
            "unusual_calls": unusual_calls,
            "drivers": drivers or ["Neutral setup"],
        }
    except Exception as e:
        logger.warning(f"scan {symbol}: {e}")
        return None


async def _scan_one(symbol: str) -> Optional[Dict[str, Any]]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _scan_one_sync, symbol)


async def scan_breakouts(extra_symbols: List[str] = None, top_n: int = 15) -> Dict[str, Any]:
    """Scan universe + user's extras. Enrich top candidates with congress activity."""
    symbols = list(dict.fromkeys(UNIVERSE + [s.upper() for s in (extra_symbols or [])]))
    # scan in parallel batches
    sem = asyncio.Semaphore(6)
    async def _bounded(s):
        async with sem:
            return await _scan_one(s)
    results = await asyncio.gather(*[_bounded(s) for s in symbols])
    scored = [r for r in results if r]
    scored.sort(key=lambda x: x["composite"], reverse=True)
    top = scored[:top_n]

    # Enrich top with recent congress buys (last 60 days)
    async def _enrich(r):
        try:
            trades = await get_trades_for_symbol(r["symbol"], 5)
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

    top = await asyncio.gather(*[_enrich(r) for r in top])
    top.sort(key=lambda x: x["composite"], reverse=True)

    # Classify signals
    for r in top:
        if r["composite"] >= 70:
            r["signal"] = "STRONG BUY"
        elif r["composite"] >= 55:
            r["signal"] = "BUY"
        else:
            r["signal"] = "WATCH"

    return {"scanned": len(scored), "universe_size": len(symbols), "candidates": top}


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
