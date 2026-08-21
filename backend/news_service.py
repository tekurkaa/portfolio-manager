"""News aggregation via NewsAPI + LLM summarization."""
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone

import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

NEWSAPI_KEY = os.environ.get("NEWSAPI_KEY", "")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


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
        async with httpx.AsyncClient() as client:
            r = await client.get(url, params=params, timeout=15.0)
            if r.status_code != 200:
                logger.warning(f"NewsAPI status {r.status_code}: {r.text[:200]}")
                return []
            data = r.json()
            articles = data.get("articles", [])
            return [
                {
                    "title": a.get("title"),
                    "description": a.get("description"),
                    "url": a.get("url"),
                    "source": (a.get("source") or {}).get("name"),
                    "published_at": a.get("publishedAt"),
                    "image": a.get("urlToImage"),
                }
                for a in articles
                if a.get("title") and a.get("title") != "[Removed]"
            ]
    except Exception as e:
        logger.exception(f"NewsAPI fetch failed: {e}")
        return []


async def _llm_summarize(articles: List[Dict[str, Any]], focus: str) -> Optional[str]:
    """Use Claude to summarize a batch of headlines into a short brief."""
    if not EMERGENT_LLM_KEY or not articles:
        return None
    headlines = "\n".join(
        f"- [{a.get('source','?')}] {a.get('title','')}: {a.get('description') or ''}"
        for a in articles[:15]
    )
    prompt = (
        f"You are a senior financial analyst. Based on these recent headlines about {focus}, "
        f"write a 3-4 sentence executive brief covering: (1) the dominant narrative, "
        f"(2) key market-moving items, (3) directional bias (bullish/bearish/neutral). "
        f"Be direct and terminal-style. No fluff. Use markdown bold sparingly.\n\n"
        f"HEADLINES:\n{headlines}"
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"news-{focus[:20]}",
            system_message="You are a senior financial analyst producing crisp market briefs.",
        ).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        return str(resp).strip() if resp else None
    except Exception as e:
        logger.exception(f"LLM summarize failed: {e}")
        return None


async def get_stock_news(symbols: List[str]) -> Dict[str, Any]:
    """Fetch news specific to held tickers."""
    if not symbols:
        return {"articles": [], "summary": None, "symbols": []}
    # Query in parallel per symbol so tags are accurate
    import asyncio
    tasks = [_fetch_newsapi(f'"{s}" AND (stock OR shares OR earnings OR crypto)', page_size=5, days=5) for s in symbols[:8]]
    results = await asyncio.gather(*tasks)
    combined = []
    for sym, arts in zip(symbols, results):
        for a in arts:
            a["tag"] = sym.upper()
            combined.append(a)
    # dedupe by url
    seen = set()
    unique = []
    for a in combined:
        if a["url"] and a["url"] not in seen:
            seen.add(a["url"])
            unique.append(a)
    unique.sort(key=lambda x: x.get("published_at") or "", reverse=True)
    summary = await _llm_summarize(unique[:15], focus=f"stocks: {', '.join(symbols[:10])}")
    return {"articles": unique[:30], "summary": summary, "symbols": symbols}


async def get_macro_news() -> Dict[str, Any]:
    """Fetch macroeconomic news."""
    query = (
        '(tariffs OR "Federal Reserve" OR "interest rates" OR "bond yields" '
        'OR "gold price" OR "oil price" OR inflation OR recession OR "war" OR geopolitics)'
    )
    articles = await _fetch_newsapi(query, page_size=25, days=3)
    summary = await _llm_summarize(articles[:15], focus="global macroeconomics")
    return {"articles": articles, "summary": summary}
