"""Insider / Congress trade tracking via Kadoa (GitHub raw JSON — free, no keys)."""
import asyncio
import logging
import time
import xml.etree.ElementTree as ET
from typing import Any, Optional, Dict, List

import httpx

logger = logging.getLogger(__name__)

_CACHE: Dict[str, Any] = {}
_CACHE_TTL = 900  # 15 min

KADOA_BASE = "https://raw.githubusercontent.com/kadoa-org/congress-trading-monitor/main/public/data"
KADOA_TICKER = KADOA_BASE + "/ticker/{sym}.json"
KADOA_STATS = KADOA_BASE + "/stats.json"
SEC_FORM4_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=100&output=atom"

HEADERS = {"User-Agent": "TerminusInvest/1.0 research@example.com", "Accept": "application/json"}
SEC_HEADERS = {"User-Agent": "TerminusInvest/1.0 research@example.com", "Accept": "application/xml"}


async def _cached_get(client: httpx.AsyncClient, url: str, key: str, headers=None) -> Optional[Any]:
    now = time.time()
    if key in _CACHE:
        data, exp = _CACHE[key]
        if exp > now:
            return data
    try:
        r = await client.get(url, headers=headers or HEADERS, timeout=25.0)
        if r.status_code != 200:
            logger.warning(f"{key} HTTP {r.status_code}")
            return None
        _CACHE[key] = (r, now + _CACHE_TTL)
        return r
    except Exception as e:
        logger.warning(f"{key} fetch failed: {e}")
        return None


def _politician_from_filer(filer_id: str) -> Dict[str, str]:
    """kadoa filer_id: house_ed_case / senate_thomasr_tillis / oge_donald_trump"""
    if not filer_id:
        return {"chamber": "?", "politician": "?"}
    parts = filer_id.split("_", 1)
    if len(parts) != 2:
        return {"chamber": "?", "politician": filer_id}
    chamber_key = parts[0].lower()
    name_raw = parts[1].replace("_", " ").title()
    chamber = {"house": "House", "senate": "Senate", "oge": "Executive"}.get(chamber_key, chamber_key.title())
    return {"chamber": chamber, "politician": name_raw}


def _normalize_trade(t: Dict[str, Any]) -> Dict[str, Any]:
    who = _politician_from_filer(t.get("filer_id", ""))
    return {
        "chamber": who["chamber"],
        "politician": who["politician"],
        "symbol": (t.get("ticker") or "").upper(),
        "asset": t.get("asset_name"),
        "type": t.get("transaction_type"),
        "amount": t.get("amount_range_label"),
        "amount_low": t.get("amount_range_low"),
        "amount_high": t.get("amount_range_high"),
        "date": t.get("transaction_date"),
        "disclosed": t.get("filing_date") or t.get("notification_date"),
        "comment": t.get("comment"),
        "source": "Kadoa · " + (t.get("source_id") or "congress").replace("_", " "),
    }


async def get_trades_for_symbol(symbol: str, limit: int = 50) -> List[Dict[str, Any]]:
    sym = symbol.upper().strip()
    async with httpx.AsyncClient(follow_redirects=True) as client:
        r = await _cached_get(client, KADOA_TICKER.format(sym=sym), f"kadoa-{sym}")
    if not r:
        return []
    try:
        trades = r.json().get("trades", [])
        normalized = [_normalize_trade(t) for t in trades]
        normalized.sort(key=lambda x: x.get("date") or "", reverse=True)
        return normalized[:limit]
    except Exception as e:
        logger.warning(f"parse kadoa {sym}: {e}")
        return []


async def get_congress_trades(limit: int = 60, symbol_filter: Optional[str] = None,
                              held_symbols: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Fetch recent congress trades. Prioritizes user's held tickers + a set of common S&P names."""
    if symbol_filter:
        return await get_trades_for_symbol(symbol_filter, limit)

    # Fetch held tickers first (most relevant to user), plus most-traded S&P names
    default_syms = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD",
                    "JPM", "BAC", "V", "MA", "WMT", "XOM", "CVX", "PFE", "MRK", "UNH",
                    "HD", "DIS", "NFLX", "CRM", "ORCL", "INTC", "QCOM", "ADBE"]
    held = [s.upper() for s in (held_symbols or [])]
    symbols = list(dict.fromkeys(held + default_syms))[:25]

    tasks = [get_trades_for_symbol(s, 15) for s in symbols]
    results = await asyncio.gather(*tasks)
    all_trades = [t for arr in results for t in arr]
    all_trades.sort(key=lambda x: x.get("date") or "", reverse=True)
    return all_trades[:limit]


async def get_sec_form4(limit: int = 40, symbol_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        r = await _cached_get(client, SEC_FORM4_URL, "sec-form4", headers=SEC_HEADERS)
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
            company = title.split(" - ", 1)[1] if " - " in title else title
            out.append({"title": title, "company": company, "url": link, "filed_at": updated, "form": "4"})
    except Exception as e:
        logger.warning(f"SEC parse: {e}")
    if symbol_filter:
        out = [x for x in out if symbol_filter.upper() in (x["company"] or "").upper()]
    return out[:limit]


async def get_insider_summary(user_symbols: List[str]) -> Dict[str, Any]:
    held = [s.upper() for s in user_symbols]
    congress, form4 = await asyncio.gather(
        get_congress_trades(limit=120, held_symbols=held),
        get_sec_form4(limit=60),
    )
    held_set = set(held)
    for c in congress:
        c["hit"] = c.get("symbol") in held_set

    per_sym: Dict[str, Dict[str, Any]] = {}
    for c in congress[:200]:
        sym = c.get("symbol") or ""
        if not sym:
            continue
        d = per_sym.setdefault(sym, {"symbol": sym, "buys": 0, "sells": 0, "trades": 0, "held": sym in held_set})
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
        "notice": None,
    }
