"""Public sentiment from Reddit + StockTwits (no LLM, no API key needed)."""
import asyncio
import logging
import re
import time
from collections import Counter
from typing import Any, Optional, Dict, List

import httpx

logger = logging.getLogger(__name__)

_CACHE: Dict[str, Any] = {}
_PORTFOLIO_CACHE: Dict[str, Any] = {}
_CACHE_TTL = 300  # 5 min

BULL_WORDS = {
    "buy", "long", "moon", "rocket", "bullish", "bull", "calls", "yolo",
    "breakout", "rally", "surge", "beat", "beats", "raised", "upgrade",
    "outperform", "strong", "growth", "profit", "gain", "gains", "up",
    "hold", "hodl", "diamond", "squeeze", "green", "pump", "buying",
}
BEAR_WORDS = {
    "sell", "short", "puts", "bearish", "bear", "crash", "dump", "drop",
    "plunge", "miss", "missed", "downgrade", "underperform", "weak",
    "loss", "losses", "down", "red", "bleed", "collapse", "warning",
    "cut", "reduce", "selling", "overvalued",
}

HEADERS_REDDIT = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}
HEADERS_ST = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}

SUBREDDITS = ["wallstreetbets", "stocks", "investing", "StockMarket"]


def _score_text(text: str) -> Dict[str, int]:
    if not text:
        return {"bull": 0, "bear": 0}
    words = re.findall(r"[a-zA-Z]+", text.lower())
    bull = sum(1 for w in words if w in BULL_WORDS)
    bear = sum(1 for w in words if w in BEAR_WORDS)
    return {"bull": bull, "bear": bear}


async def _fetch_reddit(client: httpx.AsyncClient, sub: str, symbol: str, limit: int = 15) -> List[Dict[str, Any]]:
    url = f"https://www.reddit.com/r/{sub}/search.json"
    params = {"q": symbol, "sort": "new", "limit": str(limit), "restrict_sr": "1", "t": "week"}
    try:
        r = await client.get(url, params=params, headers=HEADERS_REDDIT, timeout=3.0)
        if r.status_code != 200:
            return []
        data = r.json()
        posts = []
        for c in data.get("data", {}).get("children", []):
            p = c.get("data", {})
            posts.append({
                "title": p.get("title"),
                "text": p.get("selftext", "")[:400],
                "score": p.get("score", 0),
                "num_comments": p.get("num_comments", 0),
                "url": f"https://reddit.com{p.get('permalink', '')}",
                "subreddit": sub,
                "created_utc": p.get("created_utc"),
                "author": p.get("author"),
            })
        return posts
    except Exception as e:
        logger.debug(f"reddit fetch fail {sub}/{symbol}: {e}")
        return []


async def _fetch_stocktwits(client: httpx.AsyncClient, symbol: str) -> Dict[str, Any]:
    url = f"https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json"
    try:
        r = await client.get(url, headers=HEADERS_ST, timeout=10.0)
        if r.status_code != 200:
            return {"messages": [], "bull": 0, "bear": 0}
        data = r.json()
        msgs = data.get("messages", []) or []
        bull = 0
        bear = 0
        parsed = []
        for m in msgs[:30]:
            sent = ((m.get("entities") or {}).get("sentiment") or {})
            b = sent.get("basic") if isinstance(sent, dict) else None
            if b == "Bullish":
                bull += 1
            elif b == "Bearish":
                bear += 1
            parsed.append({
                "body": m.get("body"),
                "created_at": m.get("created_at"),
                "user": (m.get("user") or {}).get("username"),
                "sentiment": b,
                "url": f"https://stocktwits.com/{(m.get('user') or {}).get('username','')}/message/{m.get('id','')}",
            })
        return {"messages": parsed, "bull": bull, "bear": bear}
    except Exception as e:
        logger.warning(f"stocktwits {symbol}: {e}")
        return {"messages": [], "bull": 0, "bear": 0}


async def analyze_symbol_public(symbol: str) -> Dict[str, Any]:
    """Reddit + StockTwits sentiment for one ticker."""
    now = time.time()
    key = f"pub-{symbol.upper()}"
    if key in _CACHE:
        d, exp = _CACHE[key]
        if exp > now:
            return d
    async with httpx.AsyncClient() as client:
        reddit_tasks = [_fetch_reddit(client, s, symbol) for s in SUBREDDITS]
        st_task = _fetch_stocktwits(client, symbol)
        reddit_lists, st = await asyncio.gather(asyncio.gather(*reddit_tasks), st_task)
    posts = [p for lst in reddit_lists for p in lst]

    # Score posts
    reddit_bull = 0
    reddit_bear = 0
    total_engagement = 0
    for p in posts:
        s = _score_text(f"{p.get('title','')} {p.get('text','')}")
        # weight by engagement (score + comments) to reflect visibility
        weight = 1 + min((p.get("score", 0) + p.get("num_comments", 0)) / 50, 5)
        reddit_bull += s["bull"] * weight
        reddit_bear += s["bear"] * weight
        total_engagement += p.get("score", 0) + p.get("num_comments", 0)

    # Combine reddit + stocktwits
    bull_total = reddit_bull + st["bull"] * 3   # stocktwits explicit tag is stronger signal
    bear_total = reddit_bear + st["bear"] * 3
    denom = bull_total + bear_total
    if denom > 0:
        score = round((bull_total / denom) * 100)
    else:
        score = 50
    bull_pct = round((bull_total / denom * 100) if denom else 50)
    bear_pct = 100 - bull_pct

    if score >= 75: label = "Very Bullish"
    elif score >= 60: label = "Bullish"
    elif score >= 40: label = "Neutral"
    elif score >= 25: label = "Bearish"
    else: label = "Very Bearish"

    posts.sort(key=lambda p: (p.get("score", 0) + p.get("num_comments", 0)), reverse=True)
    top = posts[:6]

    # Top themes: most common significant words in top posts
    text_blob = " ".join(p.get("title", "") for p in posts[:30]).lower()
    words = re.findall(r"[a-zA-Z]{4,}", text_blob)
    stop = {"this","that","with","from","have","will","they","what","when","your","stock","stocks","shares","price","market","today","about","just","like","been","were","much","also","think","would","could","should"}
    counts = Counter(w for w in words if w not in stop and w != symbol.lower())
    top_themes = [w for w, _ in counts.most_common(5)]

    result = {
        "symbol": symbol.upper(),
        "score": score,
        "label": label,
        "bull_pct": bull_pct,
        "bear_pct": bear_pct,
        "reddit_bull_signals": round(reddit_bull, 1),
        "reddit_bear_signals": round(reddit_bear, 1),
        "stocktwits_bull": st["bull"],
        "stocktwits_bear": st["bear"],
        "post_count": len(posts),
        "stocktwits_msg_count": len(st.get("messages", [])),
        "top_posts": top,
        "top_themes": top_themes,
        "reasoning": f"{len(posts)} Reddit posts + {len(st.get('messages', []))} StockTwits msgs · engagement {total_engagement}",
    }
    _CACHE[key] = (result, now + _CACHE_TTL)
    return result


async def analyze_portfolio_public(symbols: List[str]) -> List[Dict[str, Any]]:
    if not symbols:
        return []
    clean_syms = [s.upper() for s in symbols[:12]]
    key = "port-" + ",".join(sorted(clean_syms))
    now = time.time()
    if key in _PORTFOLIO_CACHE:
        d, exp = _PORTFOLIO_CACHE[key]
        if exp > now:
            return d

    sem = asyncio.Semaphore(3)
    async def _bounded(s):
        async with sem:
            try:
                return await analyze_symbol_public(s)
            except Exception as e:
                logger.warning(f"pub sentiment {s}: {e}")
                return {
                    "symbol": s, "score": 50, "label": "Neutral", "bull_pct": 50, "bear_pct": 50,
                    "reddit_bull_signals": 0, "reddit_bear_signals": 0, "stocktwits_bull": 0, "stocktwits_bear": 0,
                    "post_count": 0, "stocktwits_msg_count": 0, "top_posts": [], "top_themes": [],
                    "reasoning": "Neutral sentiment baseline",
                }

    results = await asyncio.gather(*[_bounded(s) for s in clean_syms])
    res_list = [r for r in results if r]
    _PORTFOLIO_CACHE[key] = (res_list, now + _CACHE_TTL)
    return res_list


async def market_fear_greed_from_social() -> Dict[str, Any]:
    """Approximate market fear/greed from r/wallstreetbets front-page sentiment."""
    now = time.time()
    if "fg" in _CACHE:
        d, exp = _CACHE["fg"]
        if exp > now:
            return d
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(
                "https://www.reddit.com/r/wallstreetbets/hot.json?limit=25",
                headers=HEADERS_REDDIT, timeout=10.0,
            )
            data = r.json() if r.status_code == 200 else {}
        except Exception as e:
            logger.warning(f"wsb fg: {e}")
            data = {}
    bull = 0
    bear = 0
    for c in (data.get("data", {}) or {}).get("children", []):
        p = c.get("data", {})
        s = _score_text(f"{p.get('title','')} {p.get('selftext','')[:200]}")
        w = 1 + min((p.get("score", 0)) / 200, 5)
        bull += s["bull"] * w
        bear += s["bear"] * w
    denom = bull + bear
    score = round((bull / denom * 100) if denom else 50)
    if score >= 75: label = "Extreme Greed"
    elif score >= 60: label = "Greed"
    elif score >= 40: label = "Neutral"
    elif score >= 25: label = "Fear"
    else: label = "Extreme Fear"
    result = {
        "score": score,
        "label": label,
        "reasoning": f"Derived from top {int(bull+bear)} bull/bear signals on r/wallstreetbets hot",
    }
    _CACHE["fg"] = (result, now + _CACHE_TTL)
    return result
