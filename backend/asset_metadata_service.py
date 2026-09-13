"""
Asset Metadata Service.
Provides upstream metadata classification for portfolio holdings:
- asset_type: 'crypto' | 'etf' | 'stock'
- is_broad_market: bool (True for broad index funds, False otherwise)
- sub_type: 'broad_index' | 'leveraged_thematic' | 'blue_chip' | 'speculative' | None
"""

from typing import Dict, Any, Optional

# Broad-market, diversified core index ETFs
BROAD_INDEX_ETFS = {
    "VOO", "QQQ", "SPY", "IVV", "VTI", "IWM", "DIA", "VEA", "VWO", "SCHD",
    "VT", "BND", "AGG", "SPLG", "RSP", "ITOT", "VXUS", "VIG", "IJR", "IJH"
}

# Thematic, leveraged, sector, or commodity ETFs
THEMATIC_LEVERAGED_ETFS = {
    "GLD", "SOXL", "TQQQ", "UPRO", "ARKK", "SLV", "USO", "XLE", "XLF", "XLK",
    "XLU", "XLI", "XLV", "XLP", "XLY", "XLC", "XLRE", "XLB", "SMH", "IBIT",
    "ETHA", "LABU", "TNA", "SQQQ", "SOXS", "SPXU", "UVXY", "GDX", "UNG", "KWEB"
}

KNOWN_CRYPTO = {
    "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "MATIC", "AVAX", "DOT",
    "LINK", "LTC", "BCH", "ATOM", "SHIB", "UNI", "BNB", "NEAR", "APT", "TRX"
}


def resolve_asset_metadata(
    symbol: str,
    description: str = "",
    declared_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Infers asset metadata based on symbol, name/description, and declared asset type.
    Guarantees 'asset_type', 'is_broad_market', and 'sub_type'.
    """
    sym = (symbol or "").upper().replace("-USD", "").strip()
    desc = (description or "").upper()
    decl = (declared_type or "").lower().strip()

    # 1. Crypto Check
    if decl == "crypto" or "-USD" in (symbol or "").upper() or sym in KNOWN_CRYPTO or "CRYPTO" in desc:
        is_blue = sym in ("BTC", "ETH")
        return {
            "asset_type": "crypto",
            "is_broad_market": False,
            "sub_type": "blue_chip" if is_blue else "speculative",
        }

    # 2. Broad Index ETF Check
    if sym in BROAD_INDEX_ETFS or (decl == "etf" and any(k in desc for k in ["S&P 500", "TOTAL STOCK", "NASDAQ 100", "BROAD MARKET", "INDEX ETF"])):
        return {
            "asset_type": "etf",
            "is_broad_market": True,
            "sub_type": "broad_index",
        }

    # 3. Thematic / Leveraged / Sector ETF Check
    if sym in THEMATIC_LEVERAGED_ETFS or decl == "etf" or any(k in desc for k in ["ETF", "TRUST", "LEVERAGED", "BULL 3X", "BEAR 3X", "INDEX FUND", "COMMODITY"]):
        return {
            "asset_type": "etf",
            "is_broad_market": False,
            "sub_type": "leveraged_thematic",
        }

    # 4. Standard Equity Fallback
    return {
        "asset_type": "stock",
        "is_broad_market": False,
        "sub_type": None,
    }
