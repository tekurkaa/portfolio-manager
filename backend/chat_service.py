"""AI chat assistant grounded in portfolio, news, sentiment, congress, options data."""
import os
import re
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx

from quotes import get_quote
from sentiment_service import analyze_symbol_public
from insider_service import get_trades_for_symbol
from signal_service import get_options_flow
from news_service import fetch_symbol_news_live, _fetch_google_news, _fetch_newsapi

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

TICKER_RE = re.compile(r"(?:^|[\s\$\(\[])\$?([A-Z]{2,5})(?=[\s\?\!\.\,\)\]]|$)")
STOPWORDS = {
    "I","A","AN","THE","IS","IT","OF","TO","IN","ON","AT","BY","AND","OR","BUT","FOR","IF","AS","AM","BE",
    "DO","MY","US","GO","SO","UP","NO","OK","HI","AI","LLM","EPS","IPO","CEO","CFO","COO","ETF","S&P","YTD",
    "USD","EUR","API","URL","GDP","CPI","PPI","VIX","BUY","SELL","HOLD","THIS","THAT","WITH","FROM","WILL",
    "WHAT","WHY","HOW","WHO","WHEN","YOUR","MINE","ITS","AGO","YET","NOW","VS","VS.","PER","ONE","TWO","THREE",
    "TEN","YR","YRS","LTC","OTM","ITM","BTW","IMO","LOL",
}
# Common actual tickers we always allow
KNOWN_TICKERS = {
    "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","AMD","INTC","QCOM","MU","MRVL",
    "PLTR","SMCI","ARM","ASML","TSM","LRCX","AMAT","KLAC","ADI","TXN","IBM","CRM","ADBE","NOW","SNOW",
    "MDB","DDOG","NET","CRWD","PANW","ZS","OKTA","TEAM","WDAY","INTU","PYPL","SQ","V","MA","AXP","COIN",
    "HOOD","SOFI","AFRM","UPST","JPM","BAC","GS","MS","WFC","C","SCHW","MRNA","BNTX","REGN","VRTX","LLY",
    "NVO","PFE","MRK","JNJ","ABBV","UNH","CVS","LMT","RTX","NOC","BA","GE","CAT","DE","XOM","CVX","COP",
    "OXY","SLB","MPC","VLO","PSX","WMT","COST","HD","LOW","TGT","MCD","SBUX","NKE","DIS","NFLX",
    "SPOT","UBER","LYFT","ABNB","DASH","BKNG","MAR","HLT","F","GM","RIVN","LCID","NIO","LI","XPEV","BABA",
    "PDD","JD","BIDU","SHOP","MSTR","MARA","RIOT","BTC","ETH","SOL","DOGE","ADA","XRP","LINK","AVAX",
    "SPY","QQQ","IWM","DIA","VOO","VTI","GLD","SLV","USO","TLT","HYG","LQD","XLE","XLF","XLK","XLV","XLY",
    "SMH","SOXX","ARKK","GME","AMC","BB","BBBY","DKNG","CVNA","BYND","LULU","ETSY","EBAY",
}


def extract_tickers(text: str, held: list[str] | None = None) -> list[str]:
    found = []
    # Only scan original text, not upper-cased - protects against random uppercase-inside-word matches
    for m in TICKER_RE.finditer(text):
        sym = m.group(1)
        if sym in STOPWORDS:
            continue
        # Only accept if $-prefixed OR the exact word appears standalone in original casing
        has_dollar = text[max(0, m.start()):m.end()].lstrip().startswith("$") or f"${sym}" in text
        if has_dollar or sym in KNOWN_TICKERS or sym in (held or []):
            if sym not in found:
                found.append(sym)
    return found[:5]


async def _fetch_ticker_context(symbol: str) -> dict[str, Any]:
    """Pull compact ticker snapshot from all our services — live news via Yahoo + Google + NewsAPI."""
    quote, sent, cong, opts, news_list = await asyncio.gather(
        get_quote(symbol, use_cache=False),
        analyze_symbol_public(symbol),
        get_trades_for_symbol(symbol, 5),
        get_options_flow(symbol),
        fetch_symbol_news_live(symbol),
        return_exceptions=True,
    )

    def _safe(v, d):
        return d if isinstance(v, Exception) or v is None else v

    q = _safe(quote, {}) or {}
    s = _safe(sent, {}) or {}
    c = _safe(cong, []) or []
    o = _safe(opts, {}) or {}
    n = _safe(news_list, []) or []

    call_v = sum(x["volume"] for x in o.get("flow", []) if x.get("kind") == "call")
    put_v = sum(x["volume"] for x in o.get("flow", []) if x.get("kind") == "put")
    return {
        "symbol": symbol,
        "price": q.get("price"),
        "change_percent": q.get("change_percent"),
        "quote_time": q.get("market_state"),
        "sentiment": {"score": s.get("score"), "label": s.get("label"), "themes": s.get("top_themes", [])[:3]},
        "top_reddit": [{"title": p.get("title"), "score": p.get("score"), "url": p.get("url")} for p in s.get("top_posts", [])[:3]],
        "congress_trades": [{"who": t["politician"], "chamber": t["chamber"], "type": t["type"], "amount": t["amount"], "date": t["date"]} for t in c[:3]],
        "options": {"call_volume": call_v, "put_volume": put_v, "put_call_ratio": round(put_v / call_v, 2) if call_v else None},
        "news": [{"title": a.get("title"), "source": a.get("source"), "url": a.get("url"), "published_at": a.get("published_at")} for a in n[:10]],
    }


async def build_grounding(user_question: str, held_symbols: list[str], portfolio_summary: dict[str, Any]) -> dict[str, Any]:
    """Gather context needed to answer question."""
    tickers = extract_tickers(user_question, held_symbols)
    if not tickers and held_symbols:
        tickers = held_symbols[:3]

    tasks = [_fetch_ticker_context(s) for s in tickers[:4]]

    async def _macro():
        gn, na = await asyncio.gather(
            _fetch_google_news("tariffs OR Federal+Reserve OR inflation OR interest+rates OR recession OR war OR gold OR oil", when="1d", limit=10),
            _fetch_newsapi('(tariffs OR "Federal Reserve" OR inflation OR "interest rates" OR recession OR war OR gold OR oil)', page_size=8, days=1),
            return_exceptions=True,
        )
        arr = (gn if isinstance(gn, list) else []) + (na if isinstance(na, list) else [])
        seen = set()
        out = []
        for a in arr:
            if a.get("url") and a["url"] not in seen:
                seen.add(a["url"])
                out.append(a)
        out.sort(key=lambda a: a.get("published_at") or "", reverse=True)
        return out[:10]

    results = await asyncio.gather(*tasks, _macro(), return_exceptions=True)
    ticker_ctx = [r for r in results[:-1] if not isinstance(r, Exception)]
    macro_news = results[-1] if not isinstance(results[-1], Exception) else []
    return {
        "now_utc": datetime.now(timezone.utc).isoformat(),
        "held_symbols": held_symbols,
        "portfolio_summary": portfolio_summary,
        "tickers_context": ticker_ctx,
        "macro_news": [{"title": a.get("title"), "source": a.get("source"), "url": a.get("url"), "published_at": a.get("published_at")} for a in (macro_news or [])[:8]],
        "extracted_tickers": tickers,
    }


def render_grounding_prompt(grounding: Dict[str, Any]) -> str:
    lines = ["<CONTEXT>"]
    lines.append(f"CURRENT TIME (UTC): {grounding.get('now_utc')}")
    lines.append("Anchor every 'recent', 'today', 'this week' claim to this timestamp. Only claim an event is 'upcoming' if its date is after this timestamp.")
    ps = grounding.get("portfolio_summary") or {}
    if ps:
        lines.append(f"\nUSER PORTFOLIO: value ${ps.get('total_value', 0):,.0f} · P/L {ps.get('total_pl_pct', 0):.2f}% · {ps.get('count', 0)} positions ({ps.get('stock_count', 0)} stocks, {ps.get('crypto_count', 0)} crypto)")
    if grounding.get("held_symbols"):
        lines.append(f"HOLDINGS: {', '.join(grounding['held_symbols'])}")
    for t in grounding.get("tickers_context", []):
        lines.append(f"\n### {t['symbol']} (LIVE)")
        if t.get("price") is not None:
            lines.append(f"Price ${t['price']} · Change {t.get('change_percent')}% · State {t.get('quote_time', 'REGULAR')}")
        sent = t.get("sentiment") or {}
        if sent.get("label"):
            lines.append(f"Sentiment: {sent['label']} ({sent.get('score')}/100) · Themes: {', '.join(sent.get('themes', []))}")
        opts = t.get("options") or {}
        if opts.get("call_volume"):
            lines.append(f"Options: {opts['call_volume']:,} calls vs {opts['put_volume']:,} puts (P/C {opts.get('put_call_ratio')})")
        if t.get("congress_trades"):
            lines.append("Recent congress trades:")
            for c in t["congress_trades"]:
                lines.append(f"  - {c['who']} ({c['chamber']}) {c['type']} {c['amount']} on {c['date']}")
        if t.get("top_reddit"):
            lines.append("Top Reddit posts:")
            for p in t["top_reddit"]:
                lines.append(f"  - [{p.get('score')}▲] {p.get('title')}")
        if t.get("news"):
            lines.append(f"News (latest first, {len(t['news'])} items):")
            for a in t["news"]:
                lines.append(f"  - [{a.get('published_at', '?')}] [{a.get('source')}] {a.get('title')}")
    if grounding.get("macro_news"):
        lines.append("\n### MACRO NEWS (latest first)")
        for a in grounding["macro_news"]:
            lines.append(f"  - [{a.get('published_at', '?')}] [{a.get('source')}] {a.get('title')}")
    lines.append("</CONTEXT>")
    return "\n".join(lines)


def collect_sources(grounding: Dict[str, Any]) -> List[Dict[str, Any]]:
    sources = []
    for t in grounding.get("tickers_context", []):
        for a in t.get("news", []):
            if a.get("url"):
                sources.append({"type": "news", "symbol": t["symbol"], "title": a.get("title"), "url": a["url"], "source": a.get("source")})
        for p in t.get("top_reddit", []):
            if p.get("url"):
                sources.append({"type": "reddit", "symbol": t["symbol"], "title": p.get("title"), "url": p["url"], "source": "Reddit"})
    for a in grounding.get("macro_news", []):
        if a.get("url"):
            sources.append({"type": "macro", "title": a.get("title"), "url": a["url"], "source": a.get("source")})
    # dedupe by url
    seen = set()
    unique = []
    for s in sources:
        if s["url"] in seen:
            continue
        seen.add(s["url"])
        unique.append(s)
    return unique[:15]


SYSTEM_MESSAGE = (
    "You are Portfolio Terminal AI, an institutional-grade fintech research assistant. "
    "You answer using ONLY the data provided in <CONTEXT>. The 'CURRENT TIME (UTC)' line at the top of CONTEXT is the definitive 'now' — "
    "every article has a [published_at] timestamp. If an event's date is BEFORE current time, describe it in past tense ('reported earnings', 'moved after'). "
    "Only call something 'upcoming' or 'ahead' if its date is AFTER current time. If a news headline uses forward-looking language "
    "('poised for', 'ahead of earnings') but its published_at predates a known event, treat it as pre-event coverage, not current expectation. "
    "When you cite a stock's price, sentiment, options flow, congress trade, or news headline, base it directly on the CONTEXT block. "
    "Be direct, terminal-style: crisp sentences, no fluff, use bullet points for lists, bold key numbers with **. "
    "If the CONTEXT lacks data to answer confidently, say so plainly and suggest which tab to check. "
    "Never invent price levels, ticker moves, earnings numbers, or news that isn't in the CONTEXT. "
    "Always end with a 1-line disclaimer: 'Not financial advice.'"
)


async def _generate_llm_response(prompt: str) -> str | None:
    """Call LLM with support across standard Anthropic, OpenAI, or Gemini APIs."""
    # 1. Try direct Anthropic API if key is available
    if ANTHROPIC_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-3-5-sonnet-20241022",
                        "max_tokens": 1024,
                        "system": SYSTEM_MESSAGE,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                if r.status_code == 200:
                    data = r.json()
                    content = data.get("content", [])
                    if content and "text" in content[0]:
                        return content[0]["text"].strip()
        except Exception as e:
            logger.warning(f"Direct Anthropic chat failed: {e}")

    # 2. Try OpenAI API if key is available
    if OPENAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": SYSTEM_MESSAGE},
                            {"role": "user", "content": prompt},
                        ],
                    },
                )
                if r.status_code == 200:
                    data = r.json()
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0]["message"]["content"].strip()
        except Exception as e:
            logger.warning(f"Direct OpenAI chat failed: {e}")

    # 3. Try Gemini API if key is available
    if GEMINI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
                r = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": f"{SYSTEM_MESSAGE}\n\n{prompt}"}]}]
                    },
                )
                if r.status_code == 200:
                    data = r.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            return parts[0]["text"].strip()
        except Exception as e:
            logger.warning(f"Direct Gemini chat failed: {e}")

    return None


async def chat_answer(user_question: str, history: list[dict[str, str]],
                      held_symbols: list[str], portfolio_summary: dict[str, Any],
                      session_id: str = "") -> dict[str, Any]:
    grounding = await build_grounding(user_question, held_symbols, portfolio_summary)
    context = render_grounding_prompt(grounding)
    sources = collect_sources(grounding)

    # Build message with history
    prefix = ""
    if history:
        h_lines = []
        for m in history[-6:]:
            role = "USER" if m.get("role") == "user" else "ASSISTANT"
            h_lines.append(f"{role}: {m.get('content', '')[:500]}")
        prefix = "PRIOR CONVERSATION:\n" + "\n".join(h_lines) + "\n\n"
    full_prompt = f"{prefix}{context}\n\nQUESTION: {user_question}"

    answer = await _generate_llm_response(full_prompt)

    if not answer:
        # Grounded fallback when no active LLM key is configured
        ps = grounding.get("portfolio_summary") or {}
        tickers = grounding.get("extracted_tickers") or []
        tickers_str = ", ".join(tickers) if tickers else "your portfolio"
        
        # Build a structured overview from raw grounded data
        brief_bullets = []
        for t in grounding.get("tickers_context", []):
            p = f"${t.get('price')}" if t.get('price') else "N/A"
            chg = f"{t.get('change_percent'):+}%" if t.get('change_percent') is not None else ""
            sent = (t.get('sentiment') or {}).get('label', 'Neutral')
            brief_bullets.append(f"- **{t['symbol']}**: {p} ({chg}) · Sentiment: **{sent}**")
            for c in (t.get("congress_trades") or [])[:2]:
                brief_bullets.append(f"  · Congress: {c['who']} {c['type']} {c['amount']} on {c['date']}")
        
        lines = [
            f"### Terminal Grounded Intelligence for {tickers_str}",
            "",
        ]
        if brief_bullets:
            lines.extend(brief_bullets)
        else:
            lines.append(f"- Portfolio Total Value: **${ps.get('total_value', 0):,.2f}** ({ps.get('total_pl_pct', 0):+.2f}% total return)")
            lines.append(f"- Total Positions: **{ps.get('count', 0)}** ({ps.get('stock_count', 0)} stocks, {ps.get('crypto_count', 0)} crypto)")

        lines.extend([
            "",
            "*(Add `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` for synthesized conversational responses.)*",
            "",
            "Not financial advice.",
        ])
        answer = "\n".join(lines)

    return {
        "answer": answer,
        "sources": sources,
        "extracted_tickers": grounding["extracted_tickers"],
    }
