import pytest
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from scanner_service import (
    scan_breakouts,
    build_digest_html,
    send_digest_email,
)


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
