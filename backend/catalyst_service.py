"""Catalyst Intelligence Service.
Monitors forward-looking event catalysts:
1. SEC EDGAR 8-K material event filings (clinical trials, FDA approvals, mergers, contract awards)
2. Finnhub upcoming earnings calendar (pre-earnings momentum setups)

Enriches breakout scanner candidates before large market moves occur.
"""
import os
import re
import time
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# SEC requires a user agent identifying the applicant/application
SEC_USER_AGENT = os.environ.get(
    "SEC_USER_AGENT", "TerminusInvest/1.0 (contact@terminus.local)"
)
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik10}.json"
FINNHUB_CALENDAR_URL = "https://finnhub.io/api/v1/calendar/earnings"

MATERIAL_KEYWORDS = [
    "fda",
    "clinical",
    "approval",
    "merger",
    "acquisition",
    "partnership",
    "contract",
    "guidance",
    "cure",
    "patent",
    "trial",
    "phase 3",
    "phase 2",
    "phase 1",
    "breakthrough",
]

# In-memory caches
_CIK_CACHE: Dict[str, str] = {}
_CIK_CACHE_EXPIRY: float = 0.0
_CIK_CACHE_TTL: float = 86400.0  # 24 hours

_8K_CACHE: Dict[str, Tuple[List[Dict[str, Any]], float]] = {}
_8K_CACHE_TTL: float = 3600.0  # 1 hour

_EARNINGS_CACHE: Dict[str, Tuple[Dict[str, Dict[str, Any]], float]] = {}
_EARNINGS_CACHE_TTL: float = 1800.0  # 30 minutes

_AV_SENTIMENT_CACHE: Dict[str, Tuple[Optional[Dict[str, Any]], float]] = {}
_AV_SENTIMENT_CACHE_TTL: float = 3600.0  # 1 hour

_THESIS_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
_THESIS_CACHE_TTL: float = 900.0  # 15 minutes


def clear_catalyst_cache() -> None:
    """Clear all in-memory catalyst caches (useful in testing or manual refresh)."""
    global _CIK_CACHE, _CIK_CACHE_EXPIRY, _8K_CACHE, _EARNINGS_CACHE, _AV_SENTIMENT_CACHE, _THESIS_CACHE
    _CIK_CACHE.clear()
    _CIK_CACHE_EXPIRY = 0.0
    _8K_CACHE.clear()
    _EARNINGS_CACHE.clear()
    _AV_SENTIMENT_CACHE.clear()
    _THESIS_CACHE.clear()




async def get_ticker_cik_map(client: Optional[httpx.AsyncClient] = None) -> Dict[str, str]:
    """Fetch SEC company tickers JSON and return mapping of uppercase ticker to 10-digit CIK."""
    global _CIK_CACHE, _CIK_CACHE_EXPIRY
    now = time.time()
    if _CIK_CACHE and _CIK_CACHE_EXPIRY > now:
        return _CIK_CACHE

    headers = {"User-Agent": SEC_USER_AGENT}
    try:
        if client:
            resp = await client.get(SEC_TICKERS_URL, headers=headers, timeout=15.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.get(SEC_TICKERS_URL, headers=headers, timeout=15.0)

        if resp.status_code == 200:
            data = resp.json()
            mapping: Dict[str, str] = {}
            for item in data.values():
                t = str(item.get("ticker", "")).strip().upper()
                c = item.get("cik_str")
                if t and c is not None:
                    mapping[t] = str(c).zfill(10)
            _CIK_CACHE = mapping
            _CIK_CACHE_EXPIRY = now + _CIK_CACHE_TTL
            return _CIK_CACHE
        else:
            logger.warning(f"SEC tickers returned status {resp.status_code}")
    except Exception as e:
        logger.warning(f"Failed to fetch SEC tickers: {e}")

    return _CIK_CACHE


async def fetch_recent_8k(
    symbol: str, client: Optional[httpx.AsyncClient] = None, days: int = 30
) -> List[Dict[str, Any]]:
    """Fetch 8-K filings for symbol filed within the past `days` days."""
    sym = symbol.strip().upper()
    now = time.time()

    # Check cache
    if sym in _8K_CACHE:
        filings, exp = _8K_CACHE[sym]
        if exp > now:
            return filings

    cik_map = await get_ticker_cik_map(client=client)
    cik10 = cik_map.get(sym)
    if not cik10:
        return []

    url = SEC_SUBMISSIONS_URL.format(cik10=cik10)
    headers = {"User-Agent": SEC_USER_AGENT}

    try:
        if client:
            resp = await client.get(url, headers=headers, timeout=15.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.get(url, headers=headers, timeout=15.0)

        if resp.status_code != 200:
            logger.debug(f"SEC submissions for {sym} returned status {resp.status_code}")
            return []

        data = resp.json()
        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        filing_dates = recent.get("filingDate", [])
        accessions = recent.get("accessionNumber", [])
        primary_docs = recent.get("primaryDocument", [])
        descriptions = recent.get("primaryDocDescription", [])
        items_list = recent.get("items", [])

        cutoff_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        results: List[Dict[str, Any]] = []

        for i in range(len(forms)):
            form = forms[i] if i < len(forms) else ""
            if form not in ("8-K", "8-K/A"):
                continue

            f_date = filing_dates[i] if i < len(filing_dates) else ""
            if not f_date or f_date < cutoff_date:
                continue

            acc = accessions[i] if i < len(accessions) else ""
            pdoc = primary_docs[i] if i < len(primary_docs) else ""
            desc = descriptions[i] if i < len(descriptions) else ""
            item_desc = items_list[i] if i < len(items_list) else ""
            combined_desc = f"{desc} {item_desc}".strip() or "Current Report (8-K)"

            # Clean accession for URL link
            clean_acc = acc.replace("-", "")
            cik_int = str(int(cik10))
            doc_url = (
                f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{clean_acc}/{pdoc}"
                if acc and pdoc
                else f"https://www.sec.gov/edgar/browse/?CIK={cik10}"
            )

            results.append(
                {
                    "form": form,
                    "filing_date": f_date,
                    "description": combined_desc,
                    "url": doc_url,
                }
            )

        _8K_CACHE[sym] = (results, now + _8K_CACHE_TTL)
        return results
    except Exception as e:
        logger.warning(f"Error fetching 8-K filings for {sym}: {e}")
        return []


async def fetch_earnings_calendar(
    symbols: Optional[List[str]] = None,
    days_ahead: int = 14,
    client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, Dict[str, Any]]:
    """Fetch upcoming earnings from Finnhub within days_ahead for symbols."""
    token = os.environ.get("FINNHUB_API_KEY", "").strip()
    if not token:
        logger.debug("FINNHUB_API_KEY not configured; skipping earnings calendar.")
        return {}

    now = time.time()
    today = datetime.now()
    from_date = today.strftime("%Y-%m-%d")
    to_date = (today + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

    cache_key = f"{from_date}_{to_date}"
    if cache_key in _EARNINGS_CACHE:
        all_data, exp = _EARNINGS_CACHE[cache_key]
        if exp > now:
            if symbols:
                target_syms = {s.upper() for s in symbols}
                return {k: v for k, v in all_data.items() if k in target_syms}
            return all_data

    params = {"from": from_date, "to": to_date, "token": token}
    try:
        if client:
            resp = await client.get(FINNHUB_CALENDAR_URL, params=params, timeout=15.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.get(FINNHUB_CALENDAR_URL, params=params, timeout=15.0)

        if resp.status_code != 200:
            logger.warning(f"Finnhub earnings calendar returned HTTP {resp.status_code}")
            return {}

        raw_list = resp.json().get("earningsCalendar", [])
        mapping: Dict[str, Dict[str, Any]] = {}
        for entry in raw_list:
            sym = str(entry.get("symbol", "")).strip().upper()
            d_str = str(entry.get("date", "")).strip()
            if not sym or not d_str:
                continue

            try:
                e_date = datetime.strptime(d_str, "%Y-%m-%d")
                days_until = (e_date.date() - today.date()).days
            except Exception:
                days_until = 0

            # Store closest earnings event
            if sym not in mapping or (
                0 <= days_until < mapping[sym].get("days_until", 999)
            ):
                mapping[sym] = {
                    "date": d_str,
                    "days_until": max(0, days_until),
                    "eps_estimate": entry.get("epsEstimate"),
                    "eps_actual": entry.get("epsActual"),
                    "hour": entry.get("hour"),
                }

        _EARNINGS_CACHE[cache_key] = (mapping, now + _EARNINGS_CACHE_TTL)
        if symbols:
            target_syms = {s.upper() for s in symbols}
            return {k: v for k, v in mapping.items() if k in target_syms}
        return mapping
    except Exception as e:
        logger.warning(f"Failed to fetch Finnhub earnings calendar: {e}")
        return {}


def score_catalyst(
    symbol: str,
    recent_8ks: List[Dict[str, Any]],
    upcoming_earnings: Optional[Dict[str, Any]] = None,
    ref_date: Optional[datetime] = None,
) -> Tuple[float, List[str]]:
    """Score catalyst events for a ticker. Returns (bonus_points, drivers).
    
    Rules:
    - 8-K with material keywords (FDA, clinical, merger, partnership, etc.): +20.0
    - Routine 8-K in last 14 days: +10.0
    - Earnings in <= 3 days: +20.0
    - Earnings in <= 7 days: +15.0
    - Earnings in <= 14 days: +5.0
    - Total catalyst bonus capped at +30.0
    """
    bonus = 0.0
    drivers: List[str] = []
    today = (ref_date or datetime.now()).date()

    # 1. 8-K Analysis
    if recent_8ks:
        material_found = False
        latest_material_kw = ""
        for filing in recent_8ks:
            desc = filing.get("description", "").lower()
            for kw in MATERIAL_KEYWORDS:
                if re.search(r"\b" + re.escape(kw) + r"\b", desc, re.IGNORECASE):
                    material_found = True
                    latest_material_kw = kw.upper()
                    break
            if material_found:
                break

        if material_found:
            bonus += 20.0
            kw_label = latest_material_kw if latest_material_kw in ("FDA",) else latest_material_kw.title()
            drivers.append(f"Recent 8-K: Material {kw_label}/Clinical catalyst")
        else:
            # Check if filed within last 14 days
            recent_14d = False
            for f in recent_8ks:
                f_date_str = f.get("filing_date", "")
                try:
                    f_d = datetime.strptime(f_date_str, "%Y-%m-%d").date()
                    if (today - f_d).days <= 14:
                        recent_14d = True
                        break
                except Exception:
                    pass
            if recent_14d:
                bonus += 10.0
                f_date = recent_8ks[0].get("filing_date", "")
                drivers.append(f"Recent 8-K filing ({f_date})")

    # 2. Upcoming Earnings Analysis
    if upcoming_earnings:
        d_until = upcoming_earnings.get("days_until", 999)
        e_date = upcoming_earnings.get("date", "")
        if d_until <= 3:
            bonus += 20.0
            drivers.append(f"Earnings in {d_until} days ({e_date})")
        elif d_until <= 7:
            bonus += 15.0
            drivers.append(f"Earnings in {d_until} days ({e_date})")
        elif d_until <= 14:
            bonus += 5.0
            drivers.append(f"Earnings upcoming ({e_date})")

    capped_bonus = min(30.0, bonus)
    return capped_bonus, drivers


async def enrich_candidates_with_catalysts(
    candidates: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Enrich candidate dictionaries with 8-K and earnings catalysts."""
    if not candidates:
        return candidates

    symbols = [c["symbol"] for c in candidates if "symbol" in c]
    earnings_map = await fetch_earnings_calendar(symbols=symbols)

    for c in candidates:
        sym = c.get("symbol", "")
        if not sym:
            continue

        try:
            filings = await fetch_recent_8k(sym, days=30)
            earnings_info = earnings_map.get(sym)

            bonus, cat_drivers = score_catalyst(
                sym, recent_8ks=filings, upcoming_earnings=earnings_info
            )

            if bonus > 0:
                c["catalyst_bonus"] = round(bonus, 1)
                c["composite"] = min(100.0, round(c["composite"] + bonus, 1))

                # Remove placeholder "Neutral setup" if present
                cur_drivers = [d for d in c.get("drivers", []) if d != "Neutral setup"]
                cur_drivers.extend(cat_drivers)
                c["drivers"] = cur_drivers

            c["recent_8k_count"] = len(filings)
            c["upcoming_earnings"] = earnings_info
        except Exception as e:
            logger.debug(f"Error enriching catalyst for {sym}: {e}")

    return candidates


async def fetch_av_news_sentiment(
    symbol: str, client: Optional[httpx.AsyncClient] = None
) -> Optional[Dict[str, Any]]:
    """Fetch Alpha Vantage news sentiment (NEWS_SENTIMENT). Cached for 1 hr to respect 25 req/day limit."""
    key = os.environ.get("ALPHA_VANTAGE_API_KEY", "").strip()
    if not key:
        return None

    sym = symbol.strip().upper()
    now = time.time()
    if sym in _AV_SENTIMENT_CACHE:
        val, exp = _AV_SENTIMENT_CACHE[sym]
        if exp > now:
            return val

    url = "https://www.alphavantage.co/query"
    params = {
        "function": "NEWS_SENTIMENT",
        "tickers": sym,
        "apikey": key,
        "limit": 5,
    }
    try:
        if client:
            resp = await client.get(url, params=params, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.get(url, params=params, timeout=10.0)

        if resp.status_code != 200:
            return None

        data = resp.json()
        feed = data.get("feed", [])
        if not feed:
            return None

        scores = []
        labels = []
        for item in feed:
            for ts in item.get("ticker_sentiment", []):
                if ts.get("ticker", "").upper() == sym:
                    try:
                        scores.append(float(ts.get("ticker_sentiment_score", 0)))
                        labels.append(ts.get("ticker_sentiment_label", ""))
                    except Exception:
                        pass

        if not scores:
            first = feed[0]
            score = float(first.get("overall_sentiment_score", 0))
            label = str(first.get("overall_sentiment_label", "Neutral"))
        else:
            score = sum(scores) / len(scores)
            label = labels[0] if labels else ("Bullish" if score > 0.15 else "Bearish" if score < -0.15 else "Neutral")

        res = {
            "score": round(score, 3),
            "label": label,
            "headline": feed[0].get("title", ""),
            "url": feed[0].get("url", ""),
        }
        _AV_SENTIMENT_CACHE[sym] = (res, now + _AV_SENTIMENT_CACHE_TTL)
        return res
    except Exception as e:
        logger.warning(f"Error fetching Alpha Vantage news sentiment for {sym}: {e}")
        return None


async def generate_candidate_theses(
    candidates: List[Dict[str, Any]], client: Optional[httpx.AsyncClient] = None
) -> List[Dict[str, Any]]:
    """Use Gemini reasoning model (gemini-3.8-flash) to generate institutional breakout theses and conviction scores."""
    if not candidates:
        return candidates

    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not gemini_key:
        return candidates

    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip()
    now = time.time()

    needed_candidates = []
    for c in candidates:
        sym = c.get("symbol", "")
        if not sym:
            continue
        if sym in _THESIS_CACHE:
            cached, exp = _THESIS_CACHE[sym]
            if exp > now:
                c["thesis"] = cached.get("thesis")
                c["conviction"] = cached.get("conviction", 7)
                c["catalyst_type"] = cached.get("catalyst_type", "Breakout Setup")
                continue
        needed_candidates.append(c)

    if not needed_candidates:
        return candidates

    items_desc = []
    for c in needed_candidates[:6]:
        sym = c.get("symbol", "")
        price = c.get("price", 0)
        mom5 = c.get("momentum_5d", 0)
        vol = c.get("vol_surge", 1.0)
        drivers_str = "; ".join(c.get("drivers", []))
        earnings = c.get("upcoming_earnings")
        earnings_str = f"Earnings on {earnings.get('date')} (in {earnings.get('days_until')}d)" if earnings else "No earnings in next 14d"
        items_desc.append(
            f"Ticker: {sym} | Price: ${price} | 5D Mom: {mom5}% | Vol Surge: {vol}x | Setup Drivers: {drivers_str} | Earnings: {earnings_str}"
        )

    prompt = (
        "You are a senior hedge fund strategist and quantitative analyst specializing in momentum and catalyst breakouts.\n"
        "Analyze the following high-probability breakout candidates and formulate a crisp, institutional trade thesis for each.\n\n"
        + "\n".join(items_desc)
        + "\n\n"
        "Return ONLY a valid JSON array of objects with the exact schema:\n"
        "[\n"
        "  {\n"
        "    \"symbol\": \"XYZ\",\n"
        "    \"thesis\": \"1-2 crisp, professional sentences detailing the specific catalyst, volume confirmation, and breakout rationale.\",\n"
        "    \"conviction\": 8,\n"
        "    \"catalyst_type\": \"FDA Breakthrough | Pre-Earnings Squeeze | Volume Surge | Institutional Accumulation\"\n"
        "  }\n"
        "]"
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
    try:
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
        }
        if client:
            resp = await client.post(url, json=payload, timeout=25.0)
        else:
            async with httpx.AsyncClient(timeout=25.0) as c:
                resp = await c.post(url, json=payload, timeout=25.0)

        if resp.status_code == 200:
            raw_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            if raw_text.startswith("```"):
                lines = raw_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw_text = "\n".join(lines).strip()

            import json
            parsed = json.loads(raw_text)
            if isinstance(parsed, list):
                mapping = {item.get("symbol", "").upper(): item for item in parsed if isinstance(item, dict)}
                for c in candidates:
                    sym = c.get("symbol", "").upper()
                    if sym in mapping:
                        info = mapping[sym]
                        thesis = info.get("thesis")
                        conviction = info.get("conviction", 7)
                        cat_type = info.get("catalyst_type", "Breakout Setup")
                        c["thesis"] = thesis
                        c["conviction"] = conviction
                        c["catalyst_type"] = cat_type
                        _THESIS_CACHE[sym] = ({"thesis": thesis, "conviction": conviction, "catalyst_type": cat_type}, now + _THESIS_CACHE_TTL)
    except Exception as e:
        logger.warning(f"Error generating breakout theses with Gemini: {e}")

    return candidates


