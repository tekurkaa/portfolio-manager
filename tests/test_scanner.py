import pytest
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from scanner_service import (
    scan_breakouts,
    build_digest_html,
    send_digest_email,
    clear_scan_cache,
)
from catalyst_service import clear_catalyst_cache



@pytest.mark.asyncio
async def test_scan_breakouts():
    res = await scan_breakouts(extra_symbols=["NVDA", "AAPL"], top_n=5)
    assert "candidates" in res
    assert "universe_size" in res
    assert len(res["candidates"]) > 0

    for c in res["candidates"]:
        assert "symbol" in c
        assert "composite" in c
        assert "signal" in c
        assert c["signal"] in ["STRONG BUY", "BUY", "WATCH"]
        assert "price" in c
        assert "drivers" in c


def test_build_digest_html():
    dummy_scan = {
        "universe_size": 60,
        "candidates": [
            {
                "symbol": "NVDA",
                "signal": "STRONG BUY",
                "composite": 88.5,
                "price": 128.50,
                "drivers": ["Momentum surge", "Call volume"],
            }
        ],
    }
    html = build_digest_html(dummy_scan, "trader@terminus.local")
    assert "NVDA" in html
    assert "STRONG BUY" in html
    assert "88.5" in html
    assert "trader@terminus.local" in html


@pytest.mark.asyncio
async def test_scan_breakouts_integrates_catalysts():
    from unittest.mock import patch
    from datetime import datetime, timedelta

    clear_scan_cache()
    clear_catalyst_cache()

    mock_8ks = [
        {
            "form": "8-K",
            "filing_date": (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d"),
            "description": "Item 8.01 FDA approval granted for breakthrough therapy",
            "url": "https://sec.gov/sample",
        }
    ]

    with patch("catalyst_service.fetch_recent_8k", return_value=mock_8ks):
        res = await scan_breakouts(extra_symbols=["MRNA"], top_n=10)
        assert "candidates" in res
        cand = next((c for c in res["candidates"] if c.get("catalyst_bonus", 0) > 0), None)
        assert cand is not None
        assert cand["catalyst_bonus"] >= 20.0
        assert any("FDA" in d or "Material 8-K" in d for d in cand["drivers"])



