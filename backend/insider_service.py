"""Insider / smart money flow tracking.
Congress trades from House Stock Watcher + Senate Stock Watcher (free public JSON).
SEC insider Form 4 filings via EDGAR RSS.
"""
import asyncio
import logging
import time
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

_CACHE: Dict[str, Any] = {}
_CACHE_TTL = 600  # 10 min

HOUSE_URL = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json"
SENATE_URL = "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json"
SEC_FORM4_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=100&output=atom"

HEADERS = {
    "User-Agent": "TerminusInvest/1.0 research@terminus.local",
    "Accept": "application/json, text/xml",
}


async def _cached_get(client: httpx.AsyncClient, url: str, key: str) -> Optional[Any]:
    now = time.time()
    if key in _CACHE:
        data, exp = _CACHE[key]
        if exp > now:
            return data
    try:
        r = await client.get(url, headers=HEADERS, timeout=20.0)
        if r.status_code != 200:
            logger.warning(f"{key} HTTP {r.status_code}")
            return None
        _CACHE[key] = (r, now + _CACHE_TTL)
        return r
    except Exception as e:
        logger.warning(f"{key} fetch failed: {e}")
        return None


def _parse_amount(a: str) -> Optional[str]:
    if not a:
        return None
    return a.replace("$", "").strip()


async def get_congress_trades(limit: int = 60, symbol_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch latest congress trades (House + Senate) unified.
    NOTE: The House/Senate Stock Watcher S3 endpoints are blocked from some networks (403).
    Returns empty list gracefully when unreachable.
    """
    async with httpx.AsyncClient() as client:
        house_r, senate_r = await asyncio.gather(
            _cached_get(client, HOUSE_URL, "house"),
            _cached_get(client, SENATE_URL, "senate"),
        )
    out: List[Dict[str, Any]] = []
    if house_r and house_r.status_code == 200:
        try:
            for t in house_r.json():
                out.append({
                    "chamber": "House",
                    "politician": t.get("representative") or t.get("member"),
                    "party": t.get("party"),
                    "symbol": (t.get("ticker") or "").upper().replace("$", ""),
                    "asset": t.get("asset_description") or t.get("asset"),
                    "type": t.get("type") or t.get("transaction_type"),
                    "amount": _parse_amount(t.get("amount")),
                    "date": t.get("transaction_date") or t.get("date"),
                    "disclosed": t.get("disclosure_date"),
                    "source": "House Stock Watcher",
                })
        except Exception as e:
            logger.warning(f"house parse: {e}")
    if senate_r and senate_r.status_code == 200:
        try:
            for t in senate_r.json():
                out.append({
                    "chamber": "Senate",
                    "politician": t.get("senator") or t.get("member"),
                    "party": t.get("party"),
                    "symbol": (t.get("ticker") or "").upper().replace("--", "").replace("$", ""),
                    "asset": t.get("asset_description") or t.get("asset"),
                    "type": t.get("type") or t.get("transaction_type"),
                    "amount": _parse_amount(t.get("amount")),
                    "date": t.get("transaction_date") or t.get("date"),
                    "disclosed": t.get("disclosure_date"),
                    "source": "Senate Stock Watcher",
                })
        except Exception as e:
            logger.warning(f"senate parse: {e}")
    out.sort(key=lambda x: x.get("date") or "", reverse=True)
    if symbol_filter:
        s = symbol_filter.upper()
        out = [x for x in out if x["symbol"] == s]
    return out[:limit]


async def get_sec_form4(limit: int = 40, symbol_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Latest SEC Form 4 (insider) filings via EDGAR RSS."""
    async with httpx.AsyncClient() as client:
        r = await _cached_get(client, SEC_FORM4_URL, "sec-form4")
    if not r:
        return []
    out: List[Dict[str, Any]] = []
    try:
        ns = {"a": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(r.text)
        for entry in root.findall("a:entry", ns):
            title_el = entry.find("a:title", ns)
            link_el = entry.find("a:link", ns)
            updated_el = entry.find("a:updated", ns)
            title = title_el.text if title_el is not None else ""
            link = link_el.get("href") if link_el is not None else None
            updated = updated_el.text if updated_el is not None else None
            # Titles are like "4 - Company Name (0001234567) (Reporting)"
            company = title.split(" - ", 1)[1] if " - " in title else title
            out.append({
                "title": title,
                "company": company,
                "url": link,
                "filed_at": updated,
                "form": "4",
            })
    except Exception as e:
        logger.warning(f"SEC parse: {e}")
    if symbol_filter:
        s = symbol_filter.upper()
        out = [x for x in out if s in (x["company"] or "").upper()]
    return out[:limit]


async def get_insider_summary(user_symbols: List[str]) -> Dict[str, Any]:
    """Aggregated snapshot: recent congress + SEC insider activity, tagged when hitting held tickers."""
    held = {s.upper() for s in user_symbols}
    congress, form4 = await asyncio.gather(
        get_congress_trades(limit=120),
        get_sec_form4(limit=60),
    )
    # tag hits
    for c in congress:
        c["hit"] = c.get("symbol") in held
    # aggregate per-symbol congress activity (last 30 items)
    per_sym: Dict[str, Dict[str, Any]] = {}
    for c in congress[:200]:
        sym = c.get("symbol") or ""
        if not sym:
            continue
        d = per_sym.setdefault(sym, {"symbol": sym, "buys": 0, "sells": 0, "trades": 0, "held": sym in held})
        t = (c.get("type") or "").lower()
        d["trades"] += 1
        if "purchase" in t or "buy" in t:
            d["buys"] += 1
        elif "sale" in t or "sell" in t:
            d["sells"] += 1
    top_activity = sorted(per_sym.values(), key=lambda x: x["trades"], reverse=True)[:15]
    return {
        "congress": congress[:80],
        "form4": form4[:40],
        "top_activity": top_activity,
        "held_matches": [c for c in congress if c.get("hit")][:30],
        "notice": None if congress else "Congress trade feeds are unreachable from this environment (S3 blocks preview networks). SEC Form 4 insider filings are live below. To enable congress trades, provide a Quiver Quantitative or Financial Modeling Prep API key.",
    }
