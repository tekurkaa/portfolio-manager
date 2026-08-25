import pytest
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from news_service import (
    _clean_text,
    _parse_rfc822_date,
    get_stock_news,
    get_macro_news,
)


def test_news_formatting_helpers():
    dirty_html = "<p>Nvidia <b>soars</b> to fresh highs! &amp; leads market.</p>"
    clean = _clean_text(dirty_html)
    assert clean == "Nvidia soars to fresh highs! & leads market."
    assert "<" not in clean

    rfc_date = "Sun, 23 Aug 2026 22:15:07 GMT"
    iso_date = _parse_rfc822_date(rfc_date)
    assert "2026-08-23" in iso_date or "2026-08-24" in iso_date
    assert "T" in iso_date


@pytest.mark.asyncio
async def test_get_stock_news():
    res = await get_stock_news(["AAPL", "NVDA"])
    assert "articles" in res
    assert "symbols" in res
    assert isinstance(res["articles"], list)
    assert len(res["articles"]) > 0

    first = res["articles"][0]
    assert "title" in first
    assert "url" in first
    assert "source" in first
    assert "published_at" in first


@pytest.mark.asyncio
async def test_get_macro_news():
    res = await get_macro_news()
    assert "articles" in res
    assert isinstance(res["articles"], list)
    assert len(res["articles"]) > 0

    for a in res["articles"][:5]:
        assert a.get("title")
        assert a.get("url")
        assert a.get("source")
