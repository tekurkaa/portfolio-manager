import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from news_intelligence import (
    score_news_impact,
    enrich_candidates_with_news,
    clear_news_cache,
    match_headline_catalyst,
    get_source_credibility_weight,
    is_article_relevant,
    is_negative_headline,
)


def test_get_source_credibility_weight():
    assert get_source_credibility_weight("Bloomberg") == 1.00
    assert get_source_credibility_weight("Reuters") == 1.00
    assert get_source_credibility_weight("Wall Street Journal") == 1.00
    assert get_source_credibility_weight("CNBC") == 1.00
    assert get_source_credibility_weight("Yahoo Finance") == 0.85
    assert get_source_credibility_weight("MarketWatch") == 0.85
    assert get_source_credibility_weight("Business Insider") == 0.70
    assert get_source_credibility_weight("Some Random Blog") == 0.50


def test_match_headline_catalyst():
    # Tier 1 FDA
    tier, cat, kw = match_headline_catalyst("Moderna receives FDA approval for respiratory vaccine")
    assert tier == 1
    assert "FDA" in cat or "Regulatory" in cat

    # Tier 1 M&A
    tier, cat, kw = match_headline_catalyst("Tech giant signs definitive agreement to acquire startup for $10B")
    assert tier == 1
    assert "M&A" in cat or "Acquisition" in cat

    # Tier 2 AI inflection
    tier, cat, kw = match_headline_catalyst("Company announces new AI partnership to accelerate inference demand")
    assert tier == 2

    # Tier 3 Analyst action
    tier, cat, kw = match_headline_catalyst("Goldman Sachs: upgraded to buy with $200 price target")
    assert tier == 3

    # Unmatched headline
    tier, cat, kw = match_headline_catalyst("General market overview on Thursday afternoon")
    assert tier == 0
    assert cat is None


def test_score_news_impact_tier1_breaking():
    now = datetime(2026, 10, 2, 12, 0, 0, tzinfo=timezone.utc)
    articles = [
        {
            "title": "NVIDIA receives FDA clearance for medical AI imaging platform",
            "source": "Reuters",
            "url": "https://reuters.com/news/1",
            "published_at": (now - timedelta(minutes=30)).isoformat(),
        }
    ]
    res = score_news_impact(articles, current_time=now)
    assert res["news_score"] > 9.0  # Tier 1 is 10 pts, with 0.5h decay (~0.96) and 1.0 weight -> ~9.6 pts
    assert res["recency_label"] == "🔴 Breaking"
    assert "FDA" in res["top_headline_tier"]
    assert res["top_headline_source"] == "Reuters"
    assert "30m ago" in res["top_headline_age"]


def test_score_news_impact_tier2_today():
    now = datetime(2026, 10, 2, 18, 0, 0, tzinfo=timezone.utc)
    articles = [
        {
            "title": "Alphabet announces new AI partnership for enterprise automation",
            "source": "Yahoo Finance",
            "url": "https://finance.yahoo.com/news/2",
            "published_at": (now - timedelta(hours=6)).isoformat(),
        }
    ]
    res = score_news_impact(articles, current_time=now)
    # Tier 2 (6 pts) * e^(-0.08 * 6) (= 0.618) * 0.85 (Yahoo) = ~3.15 pts
    assert 2.5 <= res["news_score"] <= 4.0
    assert res["recency_label"] == "🟡 Today"
    assert "AI" in res["top_headline_tier"] or "Inflection" in res["top_headline_tier"]
    assert "6h ago" in res["top_headline_age"]


def test_score_news_impact_velocity_bonus():
    now = datetime(2026, 10, 2, 14, 0, 0, tzinfo=timezone.utc)
    articles = [
        {
            "title": "Tesla upgraded to buy by Morgan Stanley with high price target",
            "source": "Bloomberg",
            "url": "https://bloomberg.com/1",
            "published_at": (now - timedelta(hours=1)).isoformat(),
        },
        {
            "title": "Tesla supplier data positive ahead of quarterly delivery numbers",
            "source": "CNBC",
            "url": "https://cnbc.com/2",
            "published_at": (now - timedelta(hours=2)).isoformat(),
        },
        {
            "title": "Tesla expansion plans move forward in Texas facility",
            "source": "Reuters",
            "url": "https://reuters.com/3",
            "published_at": (now - timedelta(hours=3)).isoformat(),
        },
    ]
    res = score_news_impact(articles, current_time=now)
    assert res["news_velocity"] == 3
    # 3 articles in 4 hours awards +3 velocity bonus
    assert res["news_score"] >= 3.0


def test_score_news_impact_old_article_zero():
    now = datetime(2026, 10, 2, 12, 0, 0, tzinfo=timezone.utc)
    articles = [
        {
            "title": "Historic merger agreement signed last week",
            "source": "Reuters",
            "url": "https://reuters.com/old",
            "published_at": (now - timedelta(hours=50)).isoformat(),
        }
    ]
    res = score_news_impact(articles, current_time=now)
    assert res["news_score"] == 0.0
    assert res["news_velocity"] == 0


def test_score_news_impact_source_weighting():
    now = datetime(2026, 10, 2, 12, 0, 0, tzinfo=timezone.utc)
    t1_article = [
        {
            "title": "Raises full-year guidance after record quarter",
            "source": "Wall Street Journal",
            "url": "https://wsj.com/1",
            "published_at": (now - timedelta(hours=2)).isoformat(),
        }
    ]
    t4_article = [
        {
            "title": "Raises full-year guidance after record quarter",
            "source": "Unknown Blogger Feed",
            "url": "https://unknown.com/1",
            "published_at": (now - timedelta(hours=2)).isoformat(),
        }
    ]
    res1 = score_news_impact(t1_article, current_time=now)
    res4 = score_news_impact(t4_article, current_time=now)
    assert res1["news_score"] > res4["news_score"]


@pytest.mark.asyncio
async def test_enrich_candidates_with_news_no_news():
    candidates = [
        {
            "symbol": "FAKE_TICKER_XYZ",
            "composite": 75.0,
            "signal": "BUY",
            "price": 100.0,
            "drivers": ["5D momentum +8%"],
        }
    ]
    enriched = await enrich_candidates_with_news(candidates)
    assert len(enriched) == 1
    c = enriched[0]
    assert "news_score" in c
    assert c["news_score"] == 0.0
    assert c["composite"] == 75.0


@pytest.mark.asyncio
async def test_enrich_candidates_adds_driver_label():
    from unittest.mock import patch

    clear_news_cache()
    now = datetime.now(timezone.utc)
    mock_articles = [
        {
            "title": "Palantir signs landmark agreement for defense technology",
            "source": "Reuters",
            "url": "https://reuters.com/landmark",
            "published_at": (now - timedelta(minutes=25)).isoformat(),
        }
    ]

    with patch("news_intelligence.fetch_candidate_news", return_value=mock_articles):
        candidates = [
            {
                "symbol": "PLTR",
                "composite": 70.0,
                "signal": "BUY",
                "price": 35.0,
                "drivers": ["Call volume surge"],
            }
        ]
        enriched = await enrich_candidates_with_news(candidates)
        assert len(enriched) == 1
        cand = enriched[0]
        assert cand["news_score"] > 8.0
        assert cand["composite"] > 78.0
        assert any("📰" in d and "landmark agreement" in d for d in cand["drivers"])
        assert cand["top_headline"] == "Palantir signs landmark agreement for defense technology"
        assert cand["recency_label"] == "🔴 Breaking"


def test_is_article_relevant_rejects_common_preposition_for_on():
    art = {
        "title": "Energy Services of America stock falls on acquisition news",
        "description": "Energy Services of America (ESOA) dropped after announcing buyout.",
    }
    # "ON" as symbol should NOT match the preposition "on" in "falls on acquisition news"
    assert is_article_relevant(art, "ON") is False


def test_is_article_relevant_accepts_onsemi_company_name():
    art = {
        "title": "ON Semiconductor announces multi-year silicon carbide supply agreement",
        "description": "Onsemi will supply automotive silicon carbide power modules.",
    }
    assert is_article_relevant(art, "ON") is True


def test_is_article_relevant_accepts_cashtag_token():
    art = {
        "title": "Wall Street analysts boost price target on $ON to $95",
        "description": "Firm reiterates overweight on $ON following channel checks.",
    }
    assert is_article_relevant(art, "ON") is True


def test_negative_headline_guarded_against_breakout_bonus():
    # Negative phrases like "stock falls" or "slips" or "misses" should be detected as negative
    assert is_negative_headline("Energy Services of America stock falls on acquisition news") is True
    assert is_negative_headline("Tech giant shares drop 8% after revenue warning") is True
    assert is_negative_headline("Biotech plunges as FDA rejects new drug application") is True
    assert is_negative_headline("Moderna receives FDA approval for respiratory vaccine") is False


def test_score_news_impact_with_symbol_filters_irrelevant_headlines():
    now = datetime(2026, 10, 2, 12, 0, 0, tzinfo=timezone.utc)
    articles = [
        {
            "title": "Energy Services of America stock falls on acquisition news",
            "source": "Investing.com",
            "url": "https://investing.com/news/1",
            "published_at": (now - timedelta(hours=5)).isoformat(),
        }
    ]
    # When scored for "ON", this irrelevant article must be rejected and score 0.0
    res = score_news_impact(articles, symbol="ON", current_time=now)
    assert res["news_score"] == 0.0
    assert res["top_headline"] is None
