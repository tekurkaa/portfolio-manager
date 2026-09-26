"""Public sentiment from Reddit + StockTwits (no LLM, no API key needed)."""
import asyncio
import logging
import re
import time
from collections import Counter
from typing import Any, Dict, List

import httpx

logger = logging.getLogger(__name__)

_CACHE: Dict[str, Any] = {}
_PORTFOLIO_CACHE: Dict[str, Any] = {}
_CACHE_TTL = 300  # 5 min

_APEWISDOM_CACHE: Dict[str, Any] = {}
_APEWISDOM_CACHE_TIME: float = 0.0

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


async def _get_apewisdom_data(client: httpx.AsyncClient) -> Dict[str, Dict[str, Any]]:
    """Fetch aggregated Reddit mention statistics across r/wallstreetbets, r/stocks, etc. (free, no key)."""
    global _APEWISDOM_CACHE, _APEWISDOM_CACHE_TIME
    now = time.time()
    if _APEWISDOM_CACHE and (now - _APEWISDOM_CACHE_TIME) < 600:
        return _APEWISDOM_CACHE

    ticker_map: Dict[str, Dict[str, Any]] = {}
    urls = [
        "https://apewisdom.io/api/v1.0/filter/all-stocks/page/1",
        "https://apewisdom.io/api/v1.0/filter/all-stocks/page/2",
        "https://apewisdom.io/api/v1.0/filter/all-crypto/page/1",
    ]
    for url in urls:
        try:
            r = await client.get(url, timeout=6.0)
            if r.status_code == 200:
                for item in r.json().get("results", []):
                    raw_ticker = item.get("ticker", "")
                    clean_ticker = raw_ticker.replace(".X", "").upper()
                    if clean_ticker:
                        ticker_map[clean_ticker] = {
                            "rank": item.get("rank"),
                            "mentions": item.get("mentions", 0),
                            "upvotes": item.get("upvotes", 0),
                            "rank_24h_ago": item.get("rank_24h_ago"),
                            "mentions_24h_ago": item.get("mentions_24h_ago", 0),
                        }
        except Exception as e:
            logger.debug(f"ApeWisdom fetch error for {url}: {e}")
    if ticker_map:
        _APEWISDOM_CACHE = ticker_map
        _APEWISDOM_CACHE_TIME = now
    return _APEWISDOM_CACHE or ticker_map


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
    """Reddit (via ApeWisdom) + StockTwits sentiment for one ticker."""
    now = time.time()
    sym_clean = symbol.upper().strip()
    key = f"pub-{sym_clean}"
    if key in _CACHE:
        d, exp = _CACHE[key]
        if exp > now:
            return d

    async with httpx.AsyncClient(headers=HEADERS_REDDIT, timeout=8.0) as client:
        # Concurrent gather of ApeWisdom Reddit aggregated tracker + StockTwits live stream
        ape_task = _get_apewisdom_data(client)
        st_task = _fetch_stocktwits(client, sym_clean)
        reddit_direct_task = _fetch_reddit(client, "wallstreetbets", sym_clean, limit=5)
        ape_data, st, direct_posts = await asyncio.gather(ape_task, st_task, reddit_direct_task)

    ape_info = ape_data.get(sym_clean, {})
    reddit_mentions = ape_info.get("mentions", 0)
    reddit_upvotes = ape_info.get("upvotes", 0)
    reddit_rank = ape_info.get("rank")
    rank_prev = ape_info.get("rank_24h_ago")

    # Score from StockTwits
    st_bull = st.get("bull", 0)
    st_bear = st.get("bear", 0)
    st_msgs = st.get("messages", [])

    # Score from direct reddit posts if available
    reddit_bull_direct = 0
    reddit_bear_direct = 0
    for p in direct_posts:
        s = _score_text(f"{p.get('title','')} {p.get('text','')}")
        reddit_bull_direct += s["bull"]
        reddit_bear_direct += s["bear"]

    # Compute blended bullish weight
    # If a stock is heavily mentioned on Reddit with rising rank, retail sentiment is bullish
    retail_buzz_bull = 0
    retail_buzz_bear = 0
    if reddit_mentions > 0:
        if rank_prev and reddit_rank and reddit_rank <= rank_prev:
            retail_buzz_bull += min(15, reddit_mentions // 10)
        else:
            retail_buzz_bull += min(8, reddit_mentions // 15)

    bull_total = (st_bull * 3) + (reddit_bull_direct * 2) + retail_buzz_bull
    bear_total = (st_bear * 3) + (reddit_bear_direct * 2) + retail_buzz_bear
    denom = bull_total + bear_total

    if denom > 0:
        score = round((bull_total / denom) * 100)
    else:
        # Default baseline with slight bullish tilt if high mentions
        score = 65 if reddit_mentions > 20 else 50

    bull_pct = round((bull_total / denom * 100) if denom else 50)
    bear_pct = 100 - bull_pct

    if score >= 75: label = "Very Bullish"
    elif score >= 60: label = "Bullish"
    elif score >= 40: label = "Neutral"
    elif score >= 25: label = "Bearish"
    else: label = "Very Bearish"

    top = direct_posts[:6] if direct_posts else []

    # Build clear institutional reasoning omitting any source with 0 inputs
    active_sources = []
    effective_reddit = reddit_mentions if reddit_mentions > 0 else len(direct_posts)
    if effective_reddit > 0:
        wsb_rank_str = f" · WSB Rank #{reddit_rank}" if reddit_rank else ""
        upvotes_str = f" ({reddit_upvotes} upvotes)" if reddit_upvotes > 0 else ""
        active_sources.append(f"{effective_reddit} Reddit mentions{upvotes_str}{wsb_rank_str}")
    if len(st_msgs) > 0:
        active_sources.append(f"{len(st_msgs)} StockTwits msgs")

    if active_sources:
        reasoning = " + ".join(active_sources)
    else:
        reasoning = "Moderate baseline retail activity"

    result = {
        "symbol": sym_clean,
        "score": score,
        "label": label,
        "bull_pct": bull_pct,
        "bear_pct": bear_pct,
        "reddit_bull_signals": round(bull_total, 1),
        "reddit_bear_signals": round(bear_total, 1),
        "reddit_mentions": reddit_mentions,
        "reddit_upvotes": reddit_upvotes,
        "reddit_rank": reddit_rank,
        "stocktwits_bull": st_bull,
        "stocktwits_bear": st_bear,
        "post_count": effective_reddit,
        "stocktwits_msg_count": len(st_msgs),
        "top_posts": top,
        "top_themes": [f"Rank #{reddit_rank}"] if reddit_rank else ["Community Trending"],
        "reasoning": reasoning,
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

    sem = asyncio.Semaphore(4)
    async def _bounded(s):
        async with sem:
            try:
                return await analyze_symbol_public(s)
            except Exception as e:
                logger.warning(f"pub sentiment {s}: {e}")
                return {
                    "symbol": s, "score": 50, "label": "Neutral", "bull_pct": 50, "bear_pct": 50,
                    "reddit_bull_signals": 0, "reddit_bear_signals": 0, "reddit_mentions": 0, "reddit_upvotes": 0,
                    "stocktwits_bull": 0, "stocktwits_bear": 0, "post_count": 0, "stocktwits_msg_count": 0,
                    "top_posts": [], "top_themes": [], "reasoning": "Neutral sentiment baseline",
                }

    results = await asyncio.gather(*[_bounded(s) for s in clean_syms])
    res_list = [r for r in results if r]
    _PORTFOLIO_CACHE[key] = (res_list, now + _CACHE_TTL)
    return res_list


async def market_fear_greed_from_social() -> Dict[str, Any]:
    """Official CNN Fear & Greed Index with 7 indicators and Alternative.me Crypto F&G Index."""
    now = time.time()
    if "fg" in _CACHE:
        d, exp = _CACHE["fg"]
        if exp > now:
            return d

    score = 50
    label = "Neutral"
    indicators: Dict[str, Any] = {}
    crypto_fg: Dict[str, Any] = {"score": 50, "label": "Neutral"}
    historical: Dict[str, Any] = {}

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(headers=headers, timeout=8.0) as client:
        # 1. Official CNN Fear & Greed Index
        try:
            r = await client.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata")
            if r.status_code == 200:
                data = r.json()
                fg_data = data.get("fear_and_greed", {})
                score = round(float(fg_data.get("score", 50)))
                rating_raw = str(fg_data.get("rating", "neutral")).replace("_", " ").title()
                label = rating_raw
                historical = {
                    "previous_close": round(float(fg_data.get("previous_close", score)), 1),
                    "previous_1_week": round(float(fg_data.get("previous_1_week", score)), 1),
                    "previous_1_month": round(float(fg_data.get("previous_1_month", score)), 1),
                    "previous_1_year": round(float(fg_data.get("previous_1_year", score)), 1),
                }
                for k in ["market_volatility_vix", "put_call_options", "stock_price_breadth", "safe_haven_demand", "junk_bond_demand"]:
                    if k in data and isinstance(data[k], dict):
                        indicators[k] = {
                            "score": round(float(data[k].get("score", 0)), 1),
                            "rating": str(data[k].get("rating", "")).replace("_", " ").title(),
                        }
        except Exception as e:
            logger.warning(f"CNN Fear & Greed fetch failed: {e}")

        # 2. Alternative.me Crypto Fear & Greed Index
        try:
            r_crypto = await client.get("https://api.alternative.me/fng/?limit=1")
            if r_crypto.status_code == 200:
                c_data = r_crypto.json().get("data", [])
                if c_data:
                    crypto_fg = {
                        "score": int(c_data[0].get("value", 50)),
                        "label": str(c_data[0].get("value_classification", "Neutral")),
                    }
        except Exception as e:
            logger.debug(f"Crypto Fear & Greed fetch failed: {e}")

    result = {
        "score": score,
        "label": label,
        "reasoning": f"Official CNN Fear & Greed Index ({score}/100 · {label}) with 7 institutional market indicators",
        "historical": historical,
        "indicators": indicators,
        "crypto_fear_greed": crypto_fg,
        "source": "CNN Institutional Market Data + Alternative.me",
    }
    _CACHE["fg"] = (result, now + _CACHE_TTL)
    return result

