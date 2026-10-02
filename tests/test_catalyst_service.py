import pytest
import httpx
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from catalyst_service import (
    get_ticker_cik_map,
    fetch_recent_8k,
    fetch_earnings_calendar,
    score_catalyst,
    enrich_candidates_with_catalysts,
    clear_catalyst_cache,
)


@pytest.fixture(autouse=True)
def reset_cache():
    clear_catalyst_cache()


@pytest.mark.asyncio
async def test_get_ticker_cik_map_parses_sec_format():
    mock_sec_tickers = {
        "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
        "1": {"cik_str": 1682852, "ticker": "MRNA", "title": "Moderna, Inc."},
        "2": {"cik_str": 1045810, "ticker": "NVDA", "title": "NVIDIA CORP"},
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_sec_tickers

    with patch("httpx.AsyncClient.get", return_value=mock_resp):
        cik_map = await get_ticker_cik_map()
        assert cik_map["AAPL"] == "0000320193"
        assert cik_map["MRNA"] == "0001682852"
        assert cik_map["NVDA"] == "0001045810"


@pytest.mark.asyncio
async def test_fetch_recent_8k_filters_8k_and_recency():
    mock_cik_map = {"MRNA": "0001682852"}
    today = datetime.now()
    d_recent = (today - timedelta(days=3)).strftime("%Y-%m-%d")
    d_old = (today - timedelta(days=45)).strftime("%Y-%m-%d")

    mock_submissions = {
        "filings": {
            "recent": {
                "accessionNumber": ["0001682852-26-000123", "0001682852-26-000120", "0001682852-26-000110"],
                "form": ["8-K", "10-Q", "8-K"],
                "filingDate": [d_recent, d_recent, d_old],
                "primaryDocument": ["mrna-20260925.htm", "mrna-10q.htm", "mrna-old.htm"],
                "primaryDocDescription": [
                    "Item 8.01 FDA Breakthrough Therapy Designation for mRNA cancer vaccine",
                    "Quarterly Report",
                    "Item 5.02 Departure of Director",
                ],
            }
        }
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_submissions

    with patch("catalyst_service.get_ticker_cik_map", return_value=mock_cik_map):
        with patch("httpx.AsyncClient.get", return_value=mock_resp):
            filings = await fetch_recent_8k("MRNA", days=30)
            assert len(filings) == 1
            f = filings[0]
            assert f["form"] == "8-K"
            assert f["filing_date"] == d_recent
            assert "FDA Breakthrough" in f["description"]
            assert "0001682852" in f["url"]


@pytest.mark.asyncio
async def test_fetch_recent_8k_unknown_ticker_returns_empty():
    mock_cik_map = {"AAPL": "0000320193"}
    with patch("catalyst_service.get_ticker_cik_map", return_value=mock_cik_map):
        filings = await fetch_recent_8k("UNKNOWN_TICKER", days=30)
        assert filings == []


@pytest.mark.asyncio
async def test_fetch_earnings_calendar_finnhub_with_key():
    today = datetime.now()
    d_earnings = (today + timedelta(days=2)).strftime("%Y-%m-%d")

    mock_calendar_data = {
        "earningsCalendar": [
            {
                "symbol": "NVDA",
                "date": d_earnings,
                "epsEstimate": 0.75,
                "epsActual": None,
                "hour": "amc",
            },
            {
                "symbol": "MSFT",
                "date": (today + timedelta(days=20)).strftime("%Y-%m-%d"),
                "epsEstimate": 3.10,
                "epsActual": None,
                "hour": "bmo",
            },
        ]
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_calendar_data

    with patch.dict("os.environ", {"FINNHUB_API_KEY": "test_finnhub_key"}):
        with patch("httpx.AsyncClient.get", return_value=mock_resp):
            calendar = await fetch_earnings_calendar(symbols=["NVDA", "AAPL"], days_ahead=14)
            assert "NVDA" in calendar
            assert calendar["NVDA"]["date"] == d_earnings
            assert calendar["NVDA"]["days_until"] == 2
            assert calendar["NVDA"]["hour"] == "amc"
            # MSFT not in requested symbols or beyond 14 days
            assert "MSFT" not in calendar


@pytest.mark.asyncio
async def test_fetch_earnings_calendar_missing_key_returns_empty():
    with patch.dict("os.environ", {"FINNHUB_API_KEY": ""}, clear=False):
        calendar = await fetch_earnings_calendar(["NVDA"])
        assert calendar == {}


def test_score_catalyst_fda_material_keyword_bonus():
    today = datetime.now()
    recent_8ks = [
        {
            "form": "8-K",
            "filing_date": (today - timedelta(days=2)).strftime("%Y-%m-%d"),
            "description": "Item 8.01 FDA approval granted for Phase 3 clinical trial vaccine",
            "url": "https://sec.gov/filing1",
        }
    ]
    bonus, drivers = score_catalyst("MRNA", recent_8ks=recent_8ks, upcoming_earnings=None)
    assert bonus == 20.0
    assert any("Material 8-K" in d or "FDA" in d or "clinical" in d.lower() for d in drivers)


def test_score_catalyst_routine_8k_bonus():
    today = datetime.now()
    recent_8ks = [
        {
            "form": "8-K",
            "filing_date": (today - timedelta(days=5)).strftime("%Y-%m-%d"),
            "description": "Item 5.07 Submission of Matters to a Vote of Security Holders",
            "url": "https://sec.gov/filing2",
        }
    ]
    bonus, drivers = score_catalyst("XYZ", recent_8ks=recent_8ks, upcoming_earnings=None)
    assert bonus == 10.0
    assert any("Recent 8-K filing" in d for d in drivers)


def test_score_catalyst_earnings_proximity_bonus():
    # 2 days away: +20 points
    earnings_2d = {"date": "2026-10-02", "days_until": 2, "eps_estimate": 1.25}
    bonus, drivers = score_catalyst("NVDA", recent_8ks=[], upcoming_earnings=earnings_2d)
    assert bonus == 20.0
    assert any("Earnings in 2 days" in d for d in drivers)

    # 6 days away: +15 points
    earnings_6d = {"date": "2026-10-06", "days_until": 6, "eps_estimate": 1.25}
    bonus_6d, drivers_6d = score_catalyst("NVDA", recent_8ks=[], upcoming_earnings=earnings_6d)
    assert bonus_6d == 15.0
    assert any("Earnings in 6 days" in d for d in drivers_6d)

    # 12 days away: +5 points
    earnings_12d = {"date": "2026-10-12", "days_until": 12, "eps_estimate": 1.25}
    bonus_12d, drivers_12d = score_catalyst("NVDA", recent_8ks=[], upcoming_earnings=earnings_12d)
    assert bonus_12d == 5.0
    assert any("Earnings upcoming" in d for d in drivers_12d)


def test_score_catalyst_capped_at_max():
    # Material 8K (+20) + Earnings in 2d (+20) = 40, should cap at 30.0
    today = datetime.now()
    recent_8ks = [
        {
            "form": "8-K",
            "filing_date": (today - timedelta(days=1)).strftime("%Y-%m-%d"),
            "description": "FDA approval of new drug therapy",
            "url": "https://sec.gov/filing",
        }
    ]
    earnings_2d = {"date": "2026-10-02", "days_until": 2, "eps_estimate": 0.50}
    bonus, drivers = score_catalyst("ABC", recent_8ks=recent_8ks, upcoming_earnings=earnings_2d)
    assert bonus == 30.0
    assert len(drivers) == 2


def test_score_catalyst_no_events():
    bonus, drivers = score_catalyst("XYZ", recent_8ks=[], upcoming_earnings=None)
    assert bonus == 0.0
    assert drivers == []


@pytest.mark.asyncio
async def test_enrich_candidates_with_catalysts():
    candidates = [
        {"symbol": "MRNA", "composite": 60.0, "drivers": ["+5.0% 5d momentum"]},
        {"symbol": "AAPL", "composite": 55.0, "drivers": ["Neutral setup"]},
    ]
    today = datetime.now()
    mock_8ks = {
        "MRNA": [
            {
                "form": "8-K",
                "filing_date": (today - timedelta(days=2)).strftime("%Y-%m-%d"),
                "description": "Item 8.01 FDA approval for mRNA vaccine",
                "url": "https://sec.gov/mrna",
            }
        ],
        "AAPL": [],
    }
    mock_earnings = {
        "AAPL": {"date": (today + timedelta(days=3)).strftime("%Y-%m-%d"), "days_until": 3, "eps_estimate": 1.50}
    }

    with patch("catalyst_service.fetch_recent_8k", side_effect=lambda s, **kw: mock_8ks.get(s, [])):
        with patch("catalyst_service.fetch_earnings_calendar", return_value=mock_earnings):
            enriched = await enrich_candidates_with_catalysts(candidates)
            assert len(enriched) == 2
            mrna = next(c for c in enriched if c["symbol"] == "MRNA")
            aapl = next(c for c in enriched if c["symbol"] == "AAPL")

            # MRNA should have catalyst bonus +20
            assert mrna.get("catalyst_bonus") == 20.0
            assert mrna["composite"] == 80.0
            assert any("FDA" in d or "Material 8-K" in d for d in mrna["drivers"])

            # AAPL should have earnings bonus +20
            assert aapl.get("catalyst_bonus") == 20.0
            assert aapl["composite"] == 75.0
            assert any("Earnings in 3 days" in d for d in aapl["drivers"])


@pytest.mark.asyncio
async def test_fetch_av_news_sentiment():
    from catalyst_service import fetch_av_news_sentiment

    # 1. Missing key
    with patch.dict("os.environ", {"ALPHA_VANTAGE_API_KEY": ""}, clear=False):
        res = await fetch_av_news_sentiment("NVDA")
        assert res is None

    # 2. Success with key
    mock_data = {
        "items": "50",
        "sentiment_score_definition": "...",
        "feed": [
            {
                "title": "NVIDIA reveals next-gen Blackwell architecture",
                "overall_sentiment_score": 0.42,
                "overall_sentiment_label": "Bullish",
                "ticker_sentiment": [
                    {
                        "ticker": "NVDA",
                        "relevance_score": "0.95",
                        "ticker_sentiment_score": "0.45",
                        "ticker_sentiment_label": "Bullish",
                    }
                ],
            }
        ],
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_data

    with patch.dict("os.environ", {"ALPHA_VANTAGE_API_KEY": "demo_key"}):
        with patch("httpx.AsyncClient.get", return_value=mock_resp):
            res = await fetch_av_news_sentiment("NVDA")
            assert res is not None
            assert res["label"] == "Bullish"
            assert res["score"] > 0


@pytest.mark.asyncio
async def test_generate_candidate_theses_success():
    from catalyst_service import generate_candidate_theses

    candidates = [
        {
            "symbol": "MRNA",
            "price": 112.50,
            "composite": 88.0,
            "momentum_5d": 12.4,
            "vol_surge": 2.4,
            "drivers": ["+12.4% 5d momentum", "Recent 8-K: Material FDA/Clinical catalyst"],
            "recent_8k_count": 1,
            "upcoming_earnings": {"date": "2026-10-20", "days_until": 20},
        }
    ]

    mock_gemini_response = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": """```json
[
  {
    "symbol": "MRNA",
    "thesis": "FDA Breakthrough designation de-risks oncology pipeline with heavy call accumulation ahead of earnings.",
    "conviction": 9,
    "catalyst_type": "FDA Breakthrough"
  }
]
```"""
                        }
                    ]
                }
            }
        ]
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_gemini_response

    with patch.dict("os.environ", {"GEMINI_API_KEY": "test_gemini_key"}):
        with patch("httpx.AsyncClient.post", return_value=mock_resp):
            enriched = await generate_candidate_theses(candidates)
            assert len(enriched) == 1
            cand = enriched[0]
            assert cand.get("thesis") == "FDA Breakthrough designation de-risks oncology pipeline with heavy call accumulation ahead of earnings."
            assert cand.get("conviction") == 9
            assert cand.get("catalyst_type") == "FDA Breakthrough"


@pytest.mark.asyncio
async def test_generate_candidate_theses_without_key_returns_gracefully():
    from catalyst_service import generate_candidate_theses

    candidates = [{"symbol": "NVDA", "composite": 75.0}]
    with patch.dict("os.environ", {"GEMINI_API_KEY": ""}, clear=False):
        enriched = await generate_candidate_theses(candidates)
        assert len(enriched) == 1
        assert "thesis" not in enriched[0] or enriched[0]["thesis"] is None


