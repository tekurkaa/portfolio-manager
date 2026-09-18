"""Multi-source Financial News Service:
Aggregates real-time stock news and macroeconomic intelligence from:
1. yfinance real-time ticker feeds
2. Google News Financial RSS feeds (unlimited, no API key needed)
3. NewsAPI.org (if NEWSAPI_KEY is configured)
4. AI summarization via Anthropic, OpenAI, or Gemini (if API keys are configured)
"""
import os
import re
import html
import asyncio
import logging
import email.utils
import xml.etree.ElementTree as ET
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta, timezone

import httpx
import yfinance as yf

logger = logging.getLogger(__name__)

NEWSAPI_KEY = os.environ.get("NEWSAPI_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

DEFAULT_FALLBACK_SYMBOLS = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "GOOGL", "META"]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}


def _parse_rfc822_date(date_str: str) -> str:
    """Convert RFC-822 date format to ISO-8601 string."""
    try:
        tt = email.utils.parsedate_to_datetime(date_str)
        return tt.astimezone(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def _clean_text(text: Optional[str]) -> str:
    """Clean HTML tags and unescape entities."""
    if not text:
        return ""
    # Unescape HTML entities
    unescaped = html.unescape(text)
    # Strip HTML tags
    cleaned = re.sub(r"<[^>]+>", "", unescaped)
    return " ".join(cleaned.split()).strip()


# ---------- 1. YFINANCE NEWS ----------
def _fetch_yfinance_news_sync(symbol: str) -> List[Dict[str, Any]]:
    """Fetch ticker news from yfinance."""
    articles = []
    try:
        ticker = yf.Ticker(symbol)
        raw_news = ticker.news or []
        for item in raw_news[:10]:
            content = item.get("content", {})
            title = content.get("title") or item.get("title")
            summary = content.get("summary") or content.get("description") or item.get("summary") or ""
            url = (content.get("canonicalUrl") or {}).get("url") or item.get("link") or item.get("url")
            source = (content.get("provider") or {}).get("displayName") or item.get("publisher") or "Yahoo Finance"
            
            pub_date = content.get("pubDate") or content.get("displayTime") or item.get("providerPublishTime")
            if isinstance(pub_date, (int, float)):
                pub_iso = datetime.fromtimestamp(pub_date, tz=timezone.utc).isoformat()
            elif isinstance(pub_date, str):
                pub_iso = pub_date
            else:
                pub_iso = datetime.now(timezone.utc).isoformat()
                
            thumbs = (content.get("thumbnail") or {}).get("resolutions", [])
            image = thumbs[-1].get("url") if thumbs else None

            if title and url:
                articles.append({
                    "title": _clean_text(title),
                    "description": _clean_text(summary),
                    "url": url,
                    "source": source,
                    "published_at": pub_iso,
                    "image": image,
                    "tag": symbol.upper(),
                })
    except Exception as e:
        logger.warning(f"yfinance news failed for {symbol}: {e}")
    return articles


# ---------- 2. GOOGLE NEWS RSS ----------
async def _fetch_google_news_rss(query: str, tag: Optional[str] = None, max_results: int = 15) -> List[Dict[str, Any]]:
    """Fetch financial news from Google News RSS search (free, real-time)."""
    encoded_query = httpx.URL("", params={"q": query}).query.decode("utf-8")[2:]
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
    articles = []
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(url, headers=HEADERS)
            if r.status_code != 200:
                return []
            root = ET.fromstring(r.content)
            for item in root.findall(".//item")[:max_results]:
                title = item.find("title").text if item.find("title") is not None else ""
                link = item.find("link").text if item.find("link") is not None else ""
                pub_str = item.find("pubDate").text if item.find("pubDate") is not None else ""
                desc = item.find("description").text if item.find("description") is not None else ""
                src_el = item.find("source")
                source = src_el.text if src_el is not None and src_el.text else "Market News"

                if title and link:
                    # Clean title if it ends with " - Source Name"
                    clean_title = _clean_text(title)
                    if " - " in clean_title and src_el is not None:
                        parts = clean_title.rsplit(" - ", 1)
                        if parts[1].strip().lower() == source.strip().lower():
                            clean_title = parts[0].strip()

                    articles.append({
                        "title": clean_title,
                        "description": _clean_text(desc),
                        "url": link,
                        "source": source,
                        "published_at": _parse_rfc822_date(pub_str),
                        "image": None,
                        "tag": tag.upper() if tag else None,
                    })
    except Exception as e:
        logger.warning(f"Google News RSS failed for '{query}': {e}")
    return articles


async def _fetch_google_news(query: str, when: str = "1d", limit: int = 15) -> List[Dict[str, Any]]:
    """Google News RSS with time constraint."""
    return await _fetch_google_news_rss(f"{query} when:{when}", max_results=limit)


def _dedupe_news(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_urls, seen_titles, unique = set(), set(), []
    for a in articles:
        u = a.get("url") or ""
        t = (a.get("title") or "").strip().lower()[:80]
        if (u and u in seen_urls) or (t and t in seen_titles):
            continue
        if u:
            seen_urls.add(u)
        if t:
            seen_titles.add(t)
        unique.append(a)
    unique.sort(key=lambda x: x.get("published_at") or "", reverse=True)
    return unique


async def fetch_symbol_news_live(symbol: str) -> list[dict[str, Any]]:
    """Combined live news for symbol: Yahoo Finance + Google News + NewsAPI. Deduplicated & sorted newest first."""
    yh, gn, na = await asyncio.gather(
        asyncio.to_thread(_fetch_yfinance_news_sync, symbol),
        _fetch_google_news(f'"{symbol}"+stock', when="1d", limit=15),
        _fetch_newsapi(f'"{symbol}"', page_size=10, days=1),
        return_exceptions=True,
    )
    def _safe(v): return v if isinstance(v, list) else []
    return _dedupe_news(_safe(yh) + _safe(gn) + _safe(na))


# ---------- 3. NEWSAPI.ORG (OPTIONAL) ----------
async def _fetch_newsapi(query: str, page_size: int = 15, days: int = 3) -> List[Dict[str, Any]]:
    if not NEWSAPI_KEY:
        return []
    from_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": query,
        "from": from_date,
        "sortBy": "publishedAt",
        "language": "en",
        "pageSize": page_size,
        "apiKey": NEWSAPI_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return []
            data = r.json()
            return [
                {
                    "title": _clean_text(a.get("title")),
                    "description": _clean_text(a.get("description")),
                    "url": a.get("url"),
                    "source": (a.get("source") or {}).get("name") or "NewsAPI",
                    "published_at": a.get("publishedAt"),
                    "image": a.get("urlToImage"),
                }
                for a in data.get("articles", [])
                if a.get("title") and a.get("title") != "[Removed]" and a.get("url")
            ]
    except Exception as e:
        logger.warning(f"NewsAPI fetch failed: {e}")
        return []


# ---------- 4. AI SUMMARIZATION ----------
async def _llm_summarize(articles: List[Dict[str, Any]], focus: str) -> Optional[str]:
    """Summarize headlines using available LLM API or produce a structured terminal brief."""
    if not articles:
        return None

    headlines = "\n".join(
        f"- [{a.get('source','?')}] {a.get('title','')}: {a.get('description') or ''}"
        for a in articles[:12]
    )
    prompt = (
        f"You are a senior financial analyst and macro strategist. Based on these recent headlines regarding {focus}, "
        f"write a crisp 3-4 sentence executive terminal brief covering: (1) the dominant market narrative, "
        f"(2) key market-moving catalysts and risk factors, (3) directional bias (bullish/bearish/neutral). "
        f"Be direct, institutional, and terminal-style. Use markdown bold for key tickers/metrics sparingly.\n\n"
        f"HEADLINES:\n{headlines}"
    )

    # 1. Anthropic API
    anthropic_key = ANTHROPIC_API_KEY
    if anthropic_key:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": anthropic_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-3-5-sonnet-20241022",
                        "max_tokens": 500,
                        "system": "You are a senior financial analyst producing crisp market briefs.",
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                if resp.status_code == 200:
                    content = resp.json().get("content", [])
                    if content and "text" in content[0]:
                        return content[0]["text"].strip()
        except Exception as e:
            logger.warning(f"Anthropic summarization failed: {e}")

    # 2. OpenAI API
    openai_key = OPENAI_API_KEY
    if openai_key:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openai_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": "You are a senior financial analyst producing crisp market briefs."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.3,
                    },
                )
                if resp.status_code == 200:
                    choices = resp.json().get("choices", [])
                    if choices:
                        return choices[0]["message"]["content"].strip()
        except Exception as e:
            logger.warning(f"OpenAI summarization failed: {e}")

    # 3. Gemini API
    gemini_key = GEMINI_API_KEY
    if gemini_key:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
                resp = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": f"You are a senior financial analyst producing crisp market briefs.\n\n{prompt}"}]}]
                    },
                )
                if resp.status_code == 200:
                    candidates = resp.json().get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return parts[0].get("text", "").strip()
        except Exception as e:
            logger.warning(f"Gemini summarization failed: {e}")

    return None


# ---------- 5. PUBLIC EXPORTED FUNCTIONS ----------
async def get_stock_news(symbols: List[str]) -> Dict[str, Any]:
    """Fetch real-time news for held tickers or fallback market leaders."""
    active_symbols = [s.upper().strip() for s in symbols if s] if symbols else DEFAULT_FALLBACK_SYMBOLS
    active_symbols = active_symbols[:10]  # Cap at 10 symbols

    tasks = []
    # yfinance news per symbol (in thread pool)
    for sym in active_symbols:
        tasks.append(asyncio.to_thread(_fetch_yfinance_news_sync, sym))
        # Google news RSS search per symbol
        tasks.append(_fetch_google_news_rss(f"{sym} stock OR shares OR earnings", tag=sym, max_results=6))

    # Optional NewsAPI
    if NEWSAPI_KEY and active_symbols:
        query_str = " OR ".join(f'"{s}"' for s in active_symbols[:5])
        tasks.append(_fetch_newsapi(f"({query_str}) AND (stock OR shares OR earnings OR trading)", page_size=15))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    combined = [a for res in results if isinstance(res, list) for a in res]
    unique = _dedupe_news(combined)
    summary = await _llm_summarize(unique[:15], focus=f"positions: {', '.join(active_symbols)}")
    return {"articles": unique[:40], "summary": summary, "symbols": active_symbols}


async def get_macro_news() -> Dict[str, Any]:
    """Fetch global macroeconomic news, central banks, commodities & geopolitical intelligence."""
    macro_queries = [
        "Federal Reserve interest rates OR Jerome Powell OR FOMC OR rate cuts",
        "tariffs trade war import duties US economy global trade",
        "Treasury bond yields 10-year yield yield curve bond market",
        "crude oil prices OPEC gold price energy market commodities",
        "inflation CPI PPI economic growth recession GDP jobs report",
        "global economy geopolitics market sentiment stock market rally",
    ]

    tasks = [_fetch_google_news_rss(q, tag="MACRO", max_results=8) for q in macro_queries]

    if NEWSAPI_KEY:
        tasks.append(_fetch_newsapi(
            '(tariffs OR "Federal Reserve" OR "interest rates" OR "bond yields" OR "gold price" OR "oil price" OR inflation OR recession)',
            page_size=20, days=3
        ))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    combined = [a for res in results if isinstance(res, list) for a in res]
    unique = _dedupe_news(combined)
    summary = await _llm_summarize(unique[:15], focus="global macroeconomic landscape and capital markets")
    return {"articles": unique[:50], "summary": summary}
