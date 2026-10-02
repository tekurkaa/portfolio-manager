"""Live News Intelligence Layer for Breakout Scanner.

Scores breaking headlines based on:
1. Keyword impact tier (1-3 across 12 catalyst categories: FDA, M&A, deals, guidance, AI, etc.)
2. Exponential recency decay (λ = 0.08, half-life ~9 hours, 0 contribution past 48h)
3. Source credibility weighting (Tier 1 WSJ/Reuters/Bloomberg to Tier 4 blogs)
4. News velocity bonus (+3 pts for 3+ articles in 4 hours)
"""

import asyncio
from datetime import datetime, timezone, timedelta
import email.utils
import html
import logging
import math
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx

logger = logging.getLogger("news_intelligence")

# In-memory per-symbol cache: {symbol: (articles_list, score_dict, timestamp)}
NEWS_CACHE: Dict[str, Tuple[List[Dict[str, Any]], Dict[str, Any], float]] = {}
NEWS_CACHE_TTL = 900  # 15 minutes

# ---------------------------------------------------------
# 1. CATALYST KEYWORD DICTIONARY (12 CATEGORIES, 3 TIERS)
# ---------------------------------------------------------

# Tier 1: 10 base points per headline match (Market-Moving)
TIER_1_CATALYSTS: Dict[str, List[str]] = {
    "Regulatory / FDA": [
        "fda approval", "fda breakthrough", "fda fast track", "fda accelerated",
        "fda priority review", "fda orphan drug", "fda clearance", "emergency use authorization",
        "eua granted", "ce mark approval", "health canada approval", "pdufa",
        "compassionate use", "expanded access", "label expansion", "supplemental nda approved",
    ],
    "Clinical Trial Breakthroughs": [
        "phase 3 success", "phase 3 positive", "met primary endpoint",
        "statistically significant", "overall survival benefit", "disease-free survival",
        "pivotal trial results", "landmark trial", "registrational study positive",
        "complete response", "durable response", "progression-free survival",
    ],
    "Mega M&A / Acquisition": [
        "acquisition agreement", "merger agreement", "buyout offer", "takeover bid",
        "strategic acquisition", "going private", "leveraged buyout", "all-cash deal",
        "definitive agreement to acquire", "agreed to be acquired", "tender offer",
        "hostile takeover", "unsolicited bid", "premium to market price",
    ],
    "Landmark Commercial Deals": [
        "multi-billion dollar contract", "landmark agreement", "strategic partnership",
        "exclusive licensing deal", "government contract awarded", "defense contract",
        "nasa contract", "hyperscaler agreement", "joint venture signed",
        "distribution agreement", "commercialization deal", "supply agreement",
    ],
    "Guidance Raises / Earnings Surprise": [
        "raises guidance", "raised guidance", "raise guidance",
        "raises full-year guidance", "raised full-year guidance",
        "raises full year guidance", "raised full year guidance",
        "beats earnings estimates", "earnings beat", "revenue beat",
        "raised eps guidance", "raises eps guidance", "record revenue",
        "record quarter", "all-time high revenue", "raised dividend",
        "special dividend declared", "share buyback program",
        "stock repurchase plan", "earnings per share beat",
    ],
}

# Tier 2: 6 base points per headline match (Significant Catalyst)
TIER_2_CATALYSTS: Dict[str, List[str]] = {
    "Pipeline / Product Milestones": [
        "ind filing", "nda submission", "bla submission", "phase 2 positive",
        "proof of concept", "patent granted", "breakthrough device designation",
        "510k clearance", "technology transfer", "out-licensing deal",
        "pipeline expansion", "new indication", "label update",
    ],
    "Strategic Corporate Actions": [
        "spin-off", "carve-out", "divestiture", "asset sale", "strategic review",
        "exploring sale", "board approved", "activist investor", "proxy fight",
        "strategic alternatives", "joint development agreement", "earn-out",
    ],
    "Index Inclusion / Institutional Activity": [
        "added to s&p 500", "s&p 500 inclusion", "russell 2000 addition",
        "msci inclusion", "nasdaq 100 addition", "index rebalancing",
        "institutional investment", "13f filing", "stake acquired",
        "warren buffett", "michael burry", "ark invest", "hedge fund discloses",
    ],
    "AI / Technology Inflection": [
        "ai partnership", "large language model", "gpu demand surge", "hyperscaler spending",
        "data center expansion", "cloud revenue surges", "ai chip", "autonomous vehicle",
        "robotics deployment", "quantum computing", "foundation model", "inference demand",
    ],
}

# Tier 3: 3 base points per headline match (Watchlist Catalyst)
TIER_3_CATALYSTS: Dict[str, List[str]] = {
    "Analyst Actions": [
        "price target raised", "upgraded to buy", "upgraded to outperform",
        "strong buy initiation", "buy rating initiation", "added to conviction list",
        "top pick", "bullish thesis", "double upgrade", "exceptional results",
        "outperform initiation",
    ],
    "Macro / Sector Tailwinds": [
        "interest rate cut", "fed pivot", "rate cut expectations", "tariff exemption",
        "trade deal signed", "opec production cut", "supply shortage",
        "sector rotation into", "risk-on sentiment", "short squeeze candidate",
        "heavily shorted", "high short interest",
    ],
    "Earnings Season Signals": [
        "pre-earnings momentum", "whisper number", "consensus beat",
        "guidance above consensus", "upside surprise", "channel checks positive",
        "supplier data positive", "app store data strong", "shipping data",
    ],
}

# ---------------------------------------------------------
# 2. SOURCE CREDIBILITY MAPPINGS
# ---------------------------------------------------------

TIER_1_SOURCES = {
    "wsj", "wall street journal", "bloomberg", "reuters", "financial times",
    "ft", "cnbc", "nyt", "new york times", "ap", "associated press",
    "barron's", "barrons", "dow jones",
}

TIER_2_SOURCES = {
    "yahoo", "yahoo finance", "marketwatch", "seeking alpha", "seeking alpha pro",
    "the motley fool", "motley fool", "investor's business daily", "ibd",
}

TIER_3_SOURCES = {
    "business insider", "thestreet", "investopedia", "zacks", "benzinga",
    "tipranks", "forbes", "fortune", "globenewswire", "business wire", "pr newswire",
}


def get_source_credibility_weight(source: Optional[str]) -> float:
    """Return credibility multiplier based on publication tier."""
    if not source:
        return 0.50
    s_clean = source.strip().lower()
    for name in TIER_1_SOURCES:
        if name in s_clean:
            return 1.00
    for name in TIER_2_SOURCES:
        if name in s_clean:
            return 0.85
    for name in TIER_3_SOURCES:
        if name in s_clean:
            return 0.70
    return 0.50


def match_headline_catalyst(headline: str) -> Tuple[int, Optional[str], Optional[str]]:
    """
    Search headline for catalyst keywords across Tier 1, 2, and 3.
    Returns:
        (tier, category_name, matched_keyword)
        or (0, None, None) if no catalyst keyword matched.
    """
    if not headline:
        return 0, None, None

    h_lower = headline.lower()

    # Search Tier 1 (10 pts)
    for cat, kws in TIER_1_CATALYSTS.items():
        for kw in kws:
            if re.search(r"\b" + re.escape(kw) + r"\b", h_lower):
                return 1, cat, kw

    # Search Tier 2 (6 pts)
    for cat, kws in TIER_2_CATALYSTS.items():
        for kw in kws:
            if re.search(r"\b" + re.escape(kw) + r"\b", h_lower):
                return 2, cat, kw

    # Search Tier 3 (3 pts)
    for cat, kws in TIER_3_CATALYSTS.items():
        for kw in kws:
            if re.search(r"\b" + re.escape(kw) + r"\b", h_lower):
                return 3, cat, kw

    return 0, None, None


# ---------------------------------------------------------
# 2B. TICKER RELEVANCE & NEGATIVE HEADLINE GUARDS
# ---------------------------------------------------------

SHORT_OR_AMBIGUOUS_WORDS = {
    "ON", "IT", "BE", "SO", "NOW", "AI", "CAN", "ALL", "ARE", "FOR", "GO",
    "MET", "SEE", "WELL", "ARM", "NET", "SQ", "SHOP", "EDIT"
}

NEGATIVE_MARKERS = [
    "stock falls", "shares fall", "stock drops", "shares drop", "shares plunge",
    "stock plunges", "plunges", "plunge", "tumbles", "tumble", "slips", "slip",
    "declines", "decline", "drops", "falls", "sinks", "sink", "slumps", "slump",
    "fda rejects", "fda rejection", "fda halt", "clinical hold",
    "misses estimates", "misses revenue", "earnings miss", "revenue miss",
    "slashes guidance", "cuts guidance", "lowers guidance", "guidance cut",
    "sec probe", "investigation", "lawsuit", "class action", "fraud", "subpoena",
    "warning", "recall", "downgraded", "downgrade", "sell rating",
]


def is_negative_headline(headline: str) -> bool:
    """Return True if headline indicates an explicitly negative/bearish event."""
    if not headline:
        return False
    h_lower = headline.lower()
    for marker in NEGATIVE_MARKERS:
        if re.search(r"\b" + re.escape(marker) + r"\b", h_lower):
            return True
    return False


SYMBOL_ALIASES: Dict[str, Dict[str, Any]] = {
    "ON": {
        "search_query": '"ON Semiconductor" OR onsemi',
        "names": ["on semiconductor", "onsemi", "on semi"],
    },
    "BE": {
        "search_query": '"Bloom Energy"',
        "names": ["bloom energy"],
    },
    "NOW": {
        "search_query": "ServiceNow",
        "names": ["servicenow"],
    },
    "AI": {
        "search_query": '"C3.ai" OR "C3 AI"',
        "names": ["c3.ai", "c3 ai"],
    },
    "NET": {
        "search_query": "Cloudflare",
        "names": ["cloudflare"],
    },
    "SQ": {
        "search_query": '"Block Inc" OR Square',
        "names": ["block inc", "square"],
    },
    "ARM": {
        "search_query": '"Arm Holdings"',
        "names": ["arm holdings"],
    },
    "IT": {
        "search_query": "Gartner",
        "names": ["gartner"],
    },
    "SO": {
        "search_query": '"Southern Company"',
        "names": ["southern company"],
    },
    "CAN": {
        "search_query": "Canaan",
        "names": ["canaan"],
    },
    "ALL": {
        "search_query": "Allstate",
        "names": ["allstate"],
    },
    "ARE": {
        "search_query": '"Alexandria Real Estate"',
        "names": ["alexandria real estate"],
    },
    "FOR": {
        "search_query": "Forestar",
        "names": ["forestar"],
    },
    "GO": {
        "search_query": '"Grocery Outlet"',
        "names": ["grocery outlet"],
    },
    "NVDA": {"search_query": "Nvidia", "names": ["nvidia"]},
    "AAPL": {"search_query": "Apple", "names": ["apple"]},
    "MSFT": {"search_query": "Microsoft", "names": ["microsoft"]},
    "AMZN": {"search_query": "Amazon", "names": ["amazon"]},
    "GOOGL": {"search_query": "Google OR Alphabet", "names": ["google", "alphabet"]},
    "META": {"search_query": "Meta Platforms", "names": ["meta platforms", "facebook"]},
    "TSLA": {"search_query": "Tesla", "names": ["tesla"]},
    "AMD": {"search_query": "AMD", "names": ["amd", "advanced micro devices"]},
    "AVGO": {"search_query": "Broadcom", "names": ["broadcom"]},
    "ORCL": {"search_query": "Oracle", "names": ["oracle"]},
    "MU": {"search_query": "Micron", "names": ["micron"]},
    "INTC": {"search_query": "Intel", "names": ["intel"]},
    "QCOM": {"search_query": "Qualcomm", "names": ["qualcomm"]},
    "MRVL": {"search_query": "Marvell", "names": ["marvell"]},
    "ASML": {"search_query": "ASML", "names": ["asml"]},
    "TSM": {"search_query": "TSMC OR Taiwan Semiconductor", "names": ["tsmc", "taiwan semiconductor"]},
    "SMCI": {"search_query": '"Super Micro Computer" OR Supermicro', "names": ["super micro", "supermicro"]},
    "LRCX": {"search_query": '"Lam Research"', "names": ["lam research"]},
    "MRNA": {"search_query": "Moderna", "names": ["moderna"]},
    "BNTX": {"search_query": "BioNTech", "names": ["biontech"]},
    "REGN": {"search_query": "Regeneron", "names": ["regeneron"]},
    "VRTX": {"search_query": "Vertex Pharmaceuticals", "names": ["vertex"]},
    "LLY": {"search_query": '"Eli Lilly"', "names": ["eli lilly", "lilly"]},
    "NVO": {"search_query": '"Novo Nordisk"', "names": ["novo nordisk"]},
    "CRSP": {"search_query": "CRISPR Therapeutics", "names": ["crispr"]},
    "BEAM": {"search_query": "Beam Therapeutics", "names": ["beam therapeutics"]},
    "EDIT": {"search_query": "Editas Medicine", "names": ["editas medicine", "editas"]},
    "RXRX": {"search_query": "Recursion Pharmaceuticals", "names": ["recursion pharmaceuticals", "rxrx"]},
    "RIVN": {"search_query": "Rivian", "names": ["rivian"]},
    "LCID": {"search_query": "Lucid", "names": ["lucid"]},
    "NIO": {"search_query": "NIO", "names": ["nio"]},
    "ENPH": {"search_query": "Enphase", "names": ["enphase"]},
    "FSLR": {"search_query": '"First Solar"', "names": ["first solar"]},
    "PLUG": {"search_query": '"Plug Power"', "names": ["plug power"]},
    "CEG": {"search_query": '"Constellation Energy"', "names": ["constellation energy"]},
    "VST": {"search_query": "Vistra", "names": ["vistra"]},
    "PLTR": {"search_query": "Palantir", "names": ["palantir"]},
    "SNOW": {"search_query": "Snowflake", "names": ["snowflake"]},
    "CRWD": {"search_query": "CrowdStrike", "names": ["crowdstrike"]},
    "DDOG": {"search_query": "Datadog", "names": ["datadog"]},
    "MDB": {"search_query": "MongoDB", "names": ["mongodb"]},
    "CRM": {"search_query": "Salesforce", "names": ["salesforce"]},
    "SHOP": {"search_query": "Shopify", "names": ["shopify"]},
    "COIN": {"search_query": "Coinbase", "names": ["coinbase"]},
    "HOOD": {"search_query": "Robinhood", "names": ["robinhood"]},
    "PYPL": {"search_query": "PayPal", "names": ["paypal"]},
    "AFRM": {"search_query": "Affirm", "names": ["affirm"]},
    "MSTR": {"search_query": "MicroStrategy", "names": ["microstrategy"]},
    "MARA": {"search_query": '"MARA Holdings"', "names": ["mara holdings", "marathon digital"]},
    "RIOT": {"search_query": '"Riot Platforms"', "names": ["riot platforms"]},
    "GME": {"search_query": "GameStop", "names": ["gamestop"]},
    "AMC": {"search_query": "AMC Entertainment", "names": ["amc entertainment", "amc theatres"]},
    "DKNG": {"search_query": "DraftKings", "names": ["draftkings"]},
    "CVNA": {"search_query": "Carvana", "names": ["carvana"]},
    "UPST": {"search_query": "Upstart", "names": ["upstart"]},
    "SOFI": {"search_query": "SoFi", "names": ["sofi"]},
}


def is_article_relevant(article: Dict[str, Any], symbol: str) -> bool:
    """
    Verify whether an article is truly relevant to the given stock symbol.
    Prevents false positives on tickers that are common English words (e.g. 'ON', 'IT', 'BE').
    """
    if not symbol:
        return True

    sym = symbol.strip().upper()
    title = article.get("title") or ""
    desc = article.get("description") or ""
    text = f"{title} {desc}".lower()
    sym_lower = sym.lower()

    # 1. Check registered company names and aliases
    alias_info = SYMBOL_ALIASES.get(sym)
    if alias_info and "names" in alias_info:
        for name in alias_info["names"]:
            if name.lower() in text:
                return True

    # 2. Check explicit stock / ticker tokens
    # e.g., $ON, (ON), [ON], NASDAQ:ON, NYSE:ON, ON:
    patterns = [
        rf"\${re.escape(sym_lower)}\b",
        rf"\({re.escape(sym_lower)}\)",
        rf"\[{re.escape(sym_lower)}\]",
        rf"\bnasdaq:{re.escape(sym_lower)}\b",
        rf"\bnyse:{re.escape(sym_lower)}\b",
        rf"\b{re.escape(sym_lower)}:\s",
        rf"\b{re.escape(sym_lower)}\s+stock\b",
        rf"\b{re.escape(sym_lower)}\s+shares\b",
        rf"\b{re.escape(sym_lower)}\s+ticker\b",
    ]
    for pat in patterns:
        if re.search(pat, text):
            return True

    # 3. For tickers that are NOT short common words, a clean standalone word boundary match is acceptable
    if sym not in SHORT_OR_AMBIGUOUS_WORDS and len(sym) >= 3:
        if re.search(rf"\b{re.escape(sym_lower)}\b", text):
            return True

    return False


# ---------------------------------------------------------
# 3. SCORING ENGINE (RECENCY DECAY + VELOCITY)
# ---------------------------------------------------------


def _parse_article_datetime(pub_str: Any) -> Optional[datetime]:
    """Parse article published date into timezone-aware datetime."""
    if not pub_str:
        return None
    if isinstance(pub_str, datetime):
        if pub_str.tzinfo is None:
            return pub_str.replace(tzinfo=timezone.utc)
        return pub_str.astimezone(timezone.utc)
    if isinstance(pub_str, (int, float)):
        return datetime.fromtimestamp(pub_str, tz=timezone.utc)
    if isinstance(pub_str, str):
        try:
            dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            pass
        try:
            dt = email.utils.parsedate_to_datetime(pub_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            pass
    return None


def _format_age(hours_ago: float, minutes_ago: float) -> str:
    """Format human-readable age string."""
    if minutes_ago < 60:
        return f"{int(minutes_ago)}m ago"
    elif hours_ago < 24:
        return f"{int(hours_ago)}h ago"
    elif hours_ago < 48:
        return f"Yesterday ({int(hours_ago)}h ago)"
    else:
        return f"{int(hours_ago // 24)}d ago"


def score_news_impact(
    articles: List[Dict[str, Any]],
    symbol: Optional[str] = None,
    current_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Score news articles using:
      Score = Keyword_Tier_Points × e^(-0.08 × hours) × Source_Credibility
    Plus:
      Velocity bonus: +3 pts if 3+ articles published in the last 4 hours.
    Capped at 25 points maximum.
    Filters out articles not relevant to symbol and ignores negative headlines.
    """
    now = current_time or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    if not articles:
        return {
            "news_score": 0.0,
            "top_headline": None,
            "top_headline_url": None,
            "top_headline_source": None,
            "top_headline_age": None,
            "top_headline_tier": None,
            "news_velocity": 0,
            "recency_label": None,
        }

    total_article_score = 0.0
    articles_in_last_4h = 0
    scored_items: List[Dict[str, Any]] = []

    for art in articles:
        # 1. Relevance filter: if symbol is provided, reject false positives (e.g. preposition "on")
        if symbol and not is_article_relevant(art, symbol):
            continue

        title = art.get("title") or ""
        source = art.get("source") or "News"
        url = art.get("url") or ""
        pub_dt = _parse_article_datetime(art.get("published_at"))

        if not pub_dt:
            # Fallback to current time if unparseable
            pub_dt = now

        hours_ago = max(0.0, (now - pub_dt).total_seconds() / 3600.0)
        minutes_ago = max(0.0, (now - pub_dt).total_seconds() / 60.0)

        # Count velocity in last 4 hours for relevant articles
        if hours_ago <= 4.0:
            articles_in_last_4h += 1

        # Ignore articles older than 48 hours for scoring
        if hours_ago > 48.0:
            continue

        # 2. Bearish / negative headline guard: do not score negative events as breakout catalysts
        if is_negative_headline(title):
            continue

        tier, cat_name, kw = match_headline_catalyst(title)
        tier_points = 10.0 if tier == 1 else (6.0 if tier == 2 else (3.0 if tier == 3 else 0.0))
        recency_mult = math.exp(-0.08 * hours_ago)
        source_weight = get_source_credibility_weight(source)

        item_score = tier_points * recency_mult * source_weight
        total_article_score += item_score

        # Recency badge label
        if hours_ago <= 1.0:
            recency_label = "🔴 Breaking"
        elif hours_ago <= 4.0:
            recency_label = "🟠 Same Session"
        elif hours_ago <= 12.0:
            recency_label = "🟡 Today"
        elif hours_ago <= 24.0:
            recency_label = "🔵 Yesterday"
        elif hours_ago <= 48.0:
            recency_label = "⚪ Fading"
        else:
            recency_label = "—"

        age_str = _format_age(hours_ago, minutes_ago)
        tier_desc = f"Tier {tier} - {cat_name}" if tier > 0 else "General Financial"

        scored_items.append({
            "title": title,
            "source": source,
            "url": url,
            "score": item_score,
            "tier": tier,
            "tier_desc": tier_desc,
            "age_str": age_str,
            "hours_ago": hours_ago,
            "recency_label": recency_label,
        })

    # Velocity bonus
    velocity_bonus = 3.0 if articles_in_last_4h >= 3 else 0.0
    final_score = min(25.0, round(total_article_score + velocity_bonus, 1))

    # Pick top headline
    top_headline = None
    top_url = None
    top_source = None
    top_age = None
    top_tier = None
    top_recency = None

    if scored_items:
        # Sort primarily by score descending, secondarily by recency (least hours_ago)
        scored_items.sort(key=lambda x: (x["score"], -x["hours_ago"]), reverse=True)
        top = scored_items[0]
        # Only attach top headline if it earned positive score
        if top["score"] > 0:
            top_headline = top["title"]
            top_url = top["url"]
            top_source = top["source"]
            top_age = top["age_str"]
            top_tier = top["tier_desc"]
            top_recency = top["recency_label"]
    elif articles:
        # Fallback to the first RELEVANT article if none matched catalyst keywords
        relevant_arts = [a for a in articles if (not symbol or is_article_relevant(a, symbol))]
        if relevant_arts:
            first = relevant_arts[0]
            top_headline = first.get("title")
            top_url = first.get("url")
            top_source = first.get("source")
            pub_dt = _parse_article_datetime(first.get("published_at")) or now
            h_ago = max(0.0, (now - pub_dt).total_seconds() / 3600.0)
            top_age = _format_age(h_ago, h_ago * 60.0)
            top_tier = "General Financial"
            top_recency = "⚪ Older"

    return {
        "news_score": final_score,
        "top_headline": top_headline,
        "top_headline_url": top_url,
        "top_headline_source": top_source,
        "top_headline_age": top_age,
        "top_headline_tier": top_tier,
        "news_velocity": articles_in_last_4h,
        "recency_label": top_recency,
    }


# ---------------------------------------------------------
# 4. FETCHING & CANDIDATE ENRICHMENT PIPELINE
# ---------------------------------------------------------

def clear_news_cache():
    """Clear in-memory news cache."""
    global NEWS_CACHE
    NEWS_CACHE.clear()


async def fetch_candidate_news(symbol: str, client: Optional[httpx.AsyncClient] = None) -> List[Dict[str, Any]]:
    """
    Fetch recent headlines for a symbol from Yahoo Finance RSS and Google News RSS.
    Cached for 15 minutes.
    """
    sym = symbol.upper()
    now_ts = time.time()
    if sym in NEWS_CACHE:
        cached_articles, _, ts = NEWS_CACHE[sym]
        if now_ts - ts < NEWS_CACHE_TTL:
            return cached_articles

    articles: List[Dict[str, Any]] = []

    try:
        from news_service import _fetch_rss_feed, _fetch_google_news_rss
        # Yahoo Finance RSS headline feed per symbol
        yahoo_feed_url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={sym}&region=US&lang=en-US"
        yahoo_articles = await _fetch_rss_feed(yahoo_feed_url, source_name="Yahoo Finance", tag=sym, limit=10)
        articles.extend(yahoo_articles)
    except Exception as e:
        logger.debug(f"Yahoo RSS fetch error for {sym}: {e}")

    # If Yahoo gave few articles, supplement with Google News RSS with targeted query
    if len(articles) < 5:
        try:
            from news_service import _fetch_google_news_rss
            alias = SYMBOL_ALIASES.get(sym)
            if alias and "search_query" in alias:
                g_query = f"{alias['search_query']} stock news"
            else:
                g_query = f"{sym} stock news"
            google_articles = await _fetch_google_news_rss(g_query, max_results=8)
            # Filter relevance immediately
            relevant_google = [a for a in google_articles if is_article_relevant(a, sym)]
            articles.extend(relevant_google)
        except Exception as e:
            logger.debug(f"Google News RSS fetch error for {sym}: {e}")

    # Deduplicate by URL or title
    seen_titles = set()
    deduped: List[Dict[str, Any]] = []
    for a in articles:
        t = (a.get("title") or "").strip().lower()
        if t and t not in seen_titles:
            seen_titles.add(t)
            deduped.append(a)

    deduped = deduped[:10]
    return deduped


async def enrich_candidates_with_news(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Concurrently fetch headlines and calculate news score for candidates.
    Appends news fields, driver bullet, and updates composite score.
    """
    if not candidates:
        return candidates

    sem = asyncio.Semaphore(5)

    async def _process_cand(cand: Dict[str, Any]):
        sym = cand.get("symbol", "")
        async with sem:
            try:
                articles = await fetch_candidate_news(sym)
                impact = score_news_impact(articles, symbol=sym)
            except Exception as e:
                logger.warning(f"Error enriching news for {sym}: {e}")
                impact = {
                    "news_score": 0.0,
                    "top_headline": None,
                    "top_headline_url": None,
                    "top_headline_source": None,
                    "top_headline_age": None,
                    "top_headline_tier": None,
                    "news_velocity": 0,
                    "recency_label": None,
                }

        cand["news_score"] = impact["news_score"]
        cand["top_headline"] = impact["top_headline"]
        cand["top_headline_url"] = impact["top_headline_url"]
        cand["top_headline_source"] = impact["top_headline_source"]
        cand["top_headline_age"] = impact["top_headline_age"]
        cand["top_headline_tier"] = impact["top_headline_tier"]
        cand["news_velocity"] = impact["news_velocity"]
        cand["recency_label"] = impact["recency_label"]

        if cand["news_score"] > 0 and cand["top_headline"]:
            # Append driver badge
            driver_str = (
                f"📰 {cand['recency_label']} ({cand['top_headline_age']}): "
                f"{cand['top_headline']} [{cand['top_headline_source']}]"
            )
            drivers = cand.get("drivers", [])
            drivers.append(driver_str)
            cand["drivers"] = drivers

            # Add to composite score
            cand["composite"] = round(cand.get("composite", 0.0) + cand["news_score"], 1)

    tasks = [_process_cand(c) for c in candidates]
    await asyncio.gather(*tasks, return_exceptions=True)

    # Re-sort candidates by updated composite score
    candidates.sort(key=lambda x: x.get("composite", 0.0), reverse=True)
    return candidates
