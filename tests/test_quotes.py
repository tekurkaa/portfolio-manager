import pytest
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from quotes import (
    _normalize_crypto_symbol,
    is_crypto,
    _clean_numeric,
    get_market_indices,
    get_quote,
    get_quotes,
)


def test_crypto_helpers():
    assert _normalize_crypto_symbol("BTC") == "BTC-USD"
    assert _normalize_crypto_symbol("eth") == "ETH-USD"
    assert _normalize_crypto_symbol("SOL-USD") == "SOL-USD"
    assert _normalize_crypto_symbol("AAPL") == "AAPL"

    assert is_crypto("BTC") is True
    assert is_crypto("BTC-USD") is True
    assert is_crypto("SOL") is True
    assert is_crypto("AAPL") is False


def test_clean_numeric():
    assert _clean_numeric(123.45) == 123.45
    assert _clean_numeric("1,234.56") == 1234.56
    assert _clean_numeric("+5.25%") == 5.25
    assert _clean_numeric("-0.45%") == -0.45
    assert _clean_numeric(None) == 0.0
    assert _clean_numeric("") == 0.0


@pytest.mark.asyncio
async def test_get_market_indices():
    indices = await get_market_indices()
    assert isinstance(indices, list)
    assert len(indices) >= 8

    # Verify required keys
    for item in indices:
        assert "symbol" in item
        assert "display_name" in item
        assert "price" in item
        assert isinstance(item["price"], (int, float))
        assert item["price"] > 0

    symbols = [it["symbol"] for it in indices]
    # Check that major indices and crypto are present
    assert any("SPX" in s or "GSPC" in s for s in symbols)
    assert any("NDX" in s or "IXIC" in s for s in symbols)


@pytest.mark.asyncio
async def test_get_quote_equity():
    q = await get_quote("AAPL")
    assert q is not None
    assert q["symbol"] == "AAPL"
    assert q["price"] > 0
    assert q["currency"] == "USD"


@pytest.mark.asyncio
async def test_get_quotes_batch():
    quotes = await get_quotes(["AAPL", "NVDA"])
    assert "AAPL" in quotes
    assert "NVDA" in quotes
    assert quotes["AAPL"]["price"] > 0
    assert quotes["NVDA"]["price"] > 0


@pytest.mark.asyncio
async def test_stock_details_and_resilience():
    from quotes import get_stock_details
    # Test stock
    d_stock = await get_stock_details("AAPL")
    assert d_stock is not None
    assert d_stock["symbol"] == "AAPL"
    assert d_stock["price"] > 0
    assert "sector" in d_stock

    # Test holding like RVI
    d_rvi = await get_stock_details("RVI")
    assert d_rvi is not None
    assert d_rvi["symbol"] == "RVI"
    assert d_rvi["price"] > 0

    # Test crypto
    d_btc = await get_stock_details("BTC")
    assert d_btc is not None
    assert d_btc["price"] > 0


@pytest.mark.asyncio
async def test_stock_history_resilience():
    from quotes import get_stock_history
    # Test 1D history with fallback for stocks
    h = await get_stock_history("AAPL", "1D")
    assert h is not None
    assert h["symbol"] == "AAPL"
    assert len(h["points"]) > 0

    # Test RVI 1D history
    h_rvi = await get_stock_history("RVI", "1D")
    assert h_rvi is not None
    assert len(h_rvi["points"]) > 0

