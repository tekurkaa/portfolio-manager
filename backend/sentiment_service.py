"""Public sentiment analysis via LLM - batched to minimize cost."""
import os
import json
import logging
import asyncio
from typing import List, Dict, Any

from emergentintegrations.llm.chat import LlmChat, UserMessage
from news_service import _fetch_newsapi

logger = logging.getLogger(__name__)
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


def _default_row(symbol: str, count: int = 0) -> Dict[str, Any]:
    return {
        "symbol": symbol.upper(),
        "score": 50,
        "label": "Neutral",
        "bull_pct": 50,
        "bear_pct": 50,
        "reasoning": "Insufficient data or LLM unavailable.",
        "top_themes": [],
        "article_count": count,
    }


async def analyze_portfolio_sentiment(symbols: List[str]) -> List[Dict[str, Any]]:
    """Batch sentiment analysis: single LLM call for all symbols."""
    if not symbols:
        return []
    symbols = [s.upper() for s in symbols][:10]
    # Fetch news for each symbol
    tasks = [_fetch_newsapi(f'"{s}" AND (stock OR shares OR crypto OR investors OR earnings)', page_size=5, days=5) for s in symbols]
    news_per_sym = await asyncio.gather(*tasks)
    per_symbol_news = {s: arts for s, arts in zip(symbols, news_per_sym)}

    # If no LLM key or no news at all, return defaults
    if not EMERGENT_LLM_KEY:
        return [_default_row(s, len(per_symbol_news[s])) for s in symbols]

    # Build one prompt with all symbols
    blocks = []
    for s in symbols:
        arts = per_symbol_news[s][:5]
        if not arts:
            blocks.append(f"### {s}\n(no recent headlines)\n")
            continue
        lines = "\n".join(f"- {a.get('title','')}: {a.get('description') or ''}" for a in arts)
        blocks.append(f"### {s}\n{lines}\n")

    prompt = (
        "Analyze investor sentiment for each ticker below based on the headlines. "
        "Respond ONLY with valid JSON: a single JSON array where each element matches "
        '{"symbol": <ticker>, "score": <0-100 int>, "label": <"Very Bearish"|"Bearish"|"Neutral"|"Bullish"|"Very Bullish">, '
        '"bull_pct": <0-100>, "bear_pct": <0-100, bull+bear=100>, '
        '"reasoning": <1 sentence max 25 words>, "top_themes": [<3-4 short phrases>]}\n\n'
        + "\n".join(blocks)
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id="portfolio-sentiment",
            system_message="You output ONLY a valid JSON array. No markdown, no code fences, no prose.",
        ).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = str(resp).strip()
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else text
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        # If wrapped in an object, try to find the array
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            for v in parsed.values():
                if isinstance(v, list):
                    parsed = v
                    break
        by_sym = {p["symbol"].upper(): p for p in parsed if isinstance(p, dict) and p.get("symbol")}
        results = []
        for s in symbols:
            p = by_sym.get(s)
            count = len(per_symbol_news[s])
            if not p:
                results.append(_default_row(s, count))
                continue
            results.append({
                "symbol": s,
                "score": int(p.get("score", 50)),
                "label": str(p.get("label", "Neutral")),
                "bull_pct": int(p.get("bull_pct", 50)),
                "bear_pct": int(p.get("bear_pct", 50)),
                "reasoning": str(p.get("reasoning", "")),
                "top_themes": list(p.get("top_themes", []))[:5],
                "article_count": count,
            })
        return results
    except Exception as e:
        logger.warning(f"Batch sentiment failed: {e}")
        return [_default_row(s, len(per_symbol_news[s])) for s in symbols]


async def get_fear_greed() -> Dict[str, Any]:
    """Estimate market fear & greed via LLM (single call)."""
    articles = await _fetch_newsapi(
        '("stock market" OR "S&P 500" OR VIX OR "market sentiment")',
        page_size=12, days=2,
    )
    default = {"score": 50, "label": "Neutral", "reasoning": "Analysis unavailable."}
    if not EMERGENT_LLM_KEY or not articles:
        return default
    headlines = "\n".join(f"- {a.get('title','')}" for a in articles[:12])
    prompt = (
        "Estimate the current US equity market Fear & Greed Index based on these headlines. "
        'Respond ONLY as JSON: {"score": <0-100, 0=Extreme Fear, 100=Extreme Greed>, '
        '"label": <"Extreme Fear"|"Fear"|"Neutral"|"Greed"|"Extreme Greed">, '
        '"reasoning": <1 sentence, max 20 words>}\n\n'
        f"HEADLINES:\n{headlines}"
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id="fear-greed",
            system_message="You output ONLY valid JSON.",
        ).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = str(resp).strip()
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1] if len(parts) > 1 else text
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        parsed = json.loads(text)
        return {
            "score": int(parsed.get("score", 50)),
            "label": str(parsed.get("label", "Neutral")),
            "reasoning": str(parsed.get("reasoning", "")),
        }
    except Exception as e:
        logger.warning(f"Fear/greed failed: {e}")
        return default
