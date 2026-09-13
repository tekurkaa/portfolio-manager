"""
Trade Import Service for Robinhood Trade Activity CSV.
Parses CSV, filters out options/cash transfers, applies strict FIFO lot clearing
for both stocks and crypto, and derives current active holdings and cost basis.
"""

import csv
import io
import re
import uuid
import logging
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

KNOWN_CRYPTO = {
    "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "MATIC", "AVAX", "DOT",
    "LINK", "LTC", "BCH", "ATOM", "SHIB", "UNI", "BNB", "NEAR", "APT", "TRX",
    "PEPE", "XLM", "ETC", "ALGO", "FIL", "AAVE", "RENDER", "SUI", "FET"
}

OPTION_TRANS_CODES = {"BTO", "STC", "STO", "BTC", "OEXP"}
SKIP_TRANS_CODES = {"ACH", "SLIP", "CDIV", "JNLS", "SPL", "CSD", "MINT", "DIV", "INT", "WIRE", "FEE", "NRAT", "RTP", "REC"}


def parse_amount(raw: Any) -> float:
    """
    Parses currency amounts handling parentheses for negative values:
    '($200.00)' -> -200.0
    '$28.94'    -> 28.94
    '-$50.00'   -> -50.0
    """
    if raw is None or raw == "":
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)
    
    s = str(raw).strip()
    if not s:
        return 0.0
    
    is_negative = False
    if s.startswith("(") and s.endswith(")"):
        is_negative = True
        s = s[1:-1].strip()
    elif s.startswith("-"):
        is_negative = True
        s = s[1:].strip()
    
    s = s.replace("$", "").replace(",", "").strip()
    try:
        val = float(s)
        return -val if is_negative else val
    except ValueError:
        return 0.0


def parse_date(raw: Any) -> Optional[str]:
    """
    Parses dates in M/D/YY, M/D/YYYY, or YYYY-MM-DD format.
    Returns ISO date string 'YYYY-MM-DD' or None if unparseable.
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    
    # Try formats
    formats = ["%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d"]
    for fmt in formats:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.date().isoformat()
        except ValueError:
            continue
    
    # Try ISO substring if timestamp
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
        
    return None


def parse_price(raw: Any) -> float:
    """Strips currency signs and parses price."""
    if raw is None or raw == "":
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_quantity(raw: Any) -> float:
    """Parses trade share/unit quantity."""
    if raw is None or raw == "":
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def detect_asset_type(symbol: str, description: str = "") -> str:
    """Determines if the asset is crypto or stock."""
    sym_clean = symbol.upper().replace("-USD", "").strip()
    if sym_clean in KNOWN_CRYPTO or "-USD" in symbol.upper():
        return "crypto"
    if "crypto" in description.lower() or "bitcoin" in description.lower() or "ethereum" in description.lower():
        return "crypto"
    return "stock"


def is_option_row(trans_code: str, description: str) -> bool:
    """Checks if a row represents an option trade based on trans code or description."""
    tc = (trans_code or "").strip().upper()
    if tc in OPTION_TRANS_CODES:
        return True
    
    desc = description or ""
    # Look for Call/Put pattern in option contracts, e.g., 'NVDA 8/28/2026 Call $255.00'
    if re.search(r"\b(Call|Put)\b", desc, re.IGNORECASE):
        return True
    
    return False


def parse_robinhood_csv(file_bytes: bytes) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Parses raw Robinhood Trade Activity CSV bytes.
    Filters out options, dividends, transfers, and non-trade lines.
    Returns:
        (trades, stats)
    """
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    
    trades: List[Dict[str, Any]] = []
    total_rows = 0
    ignored_options = 0
    ignored_other = 0

    row_index = 0
    for row in reader:
        row_index += 1
        total_rows += 1
        
        # Normalize column keys
        norm = {
            (k.strip().lower() if k else ""): (v.strip() if isinstance(v, str) else v)
            for k, v in row.items() if k
        }
        
        # Extract fields
        activity_date_raw = (
            norm.get("activity date") or norm.get("date") or norm.get("trade date") or norm.get("settle date")
        )
        process_date_raw = norm.get("process date")
        settle_date_raw = norm.get("settle date")
        
        instrument = (
            norm.get("instrument") or norm.get("symbol") or norm.get("ticker") or ""
        ).upper().strip()
        
        description = norm.get("description") or norm.get("name") or ""
        trans_code = (norm.get("trans code") or norm.get("type") or norm.get("action") or "").strip()
        
        qty_raw = norm.get("quantity") or norm.get("shares") or norm.get("qty")
        price_raw = norm.get("price")
        amount_raw = norm.get("amount") or norm.get("net amount")
        
        # Skip option rows
        if is_option_row(trans_code, description):
            ignored_options += 1
            continue
            
        tc_upper = trans_code.upper()
        if tc_upper in SKIP_TRANS_CODES or not instrument:
            ignored_other += 1
            continue
            
        # Only process Buy and Sell actions
        if tc_upper not in {"BUY", "SELL"}:
            ignored_other += 1
            continue
            
        parsed_date = parse_date(activity_date_raw)
        if not parsed_date:
            ignored_other += 1
            continue
            
        quantity = parse_quantity(qty_raw)
        price = parse_price(price_raw)
        amount = parse_amount(amount_raw)
        
        # If price was 0 or missing, derive from amount / quantity if possible
        if price <= 0 and quantity > 0 and amount != 0:
            price = abs(amount) / quantity
            
        if quantity <= 0 or price <= 0:
            ignored_other += 1
            continue
            
        asset_type = detect_asset_type(instrument, description)

        clean_desc = re.sub(r"\s+", " ", description).strip()
        clean_name = re.split(r"\bCUSIP\b", clean_desc, flags=re.IGNORECASE)[0].strip()
        if not clean_name:
            clean_name = instrument

        trades.append({
            "id": str(uuid.uuid4()),
            "row_index": row_index,
            "activity_date": parsed_date,
            "process_date": parse_date(process_date_raw),
            "settle_date": parse_date(settle_date_raw),
            "symbol": instrument,
            "description": clean_name,
            "trans_code": "Buy" if tc_upper == "BUY" else "Sell",
            "quantity": quantity,
            "price": price,
            "amount": amount,
            "asset_type": asset_type,
        })
        
    stats = {
        "total_rows_parsed": total_rows,
        "ignored_options_count": ignored_options,
        "ignored_other_count": ignored_other,
        "total_trades_kept": len(trades),
    }
    
    return trades, stats


def derive_holdings_fifo(trades: List[Dict[str, Any]], stats: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Applies strict FIFO lot clearing for all symbols (both stocks and crypto).
    Calculates Weighted Average Cost from the surviving active lots for UI display.
    """
    if stats is None:
        stats = {
            "total_rows_parsed": len(trades),
            "ignored_options_count": 0,
            "ignored_other_count": 0,
            "total_trades_kept": len(trades),
        }

    # Group trades by symbol
    by_symbol: Dict[str, List[Dict[str, Any]]] = {}
    for t in trades:
        sym = t["symbol"]
        by_symbol.setdefault(sym, []).append(t)

    holdings = []
    closed_positions = []
    total_active_lots = 0

    for symbol, sym_trades in by_symbol.items():
        # Robinhood CSVs are often ordered descending by date (most recent first).
        # We sort by activity_date ASCENDING. If dates are equal, higher row_index in
        # a reverse-chronological CSV means an earlier trade, so secondary sort is -row_index.
        sorted_trades = sorted(
            sym_trades,
            key=lambda x: (x["activity_date"], -x.get("row_index", 0))
        )

        lot_queue: List[Dict[str, Any]] = []

        for trade in sorted_trades:
            action = trade["trans_code"]
            qty = trade["quantity"]
            px = trade["price"]
            trade_date = trade["activity_date"]
            asset_type = trade["asset_type"]

            if action == "Buy":
                lot_queue.append({
                    "lot_id": str(uuid.uuid4()),
                    "symbol": symbol,
                    "quantity": qty,
                    "price": px,
                    "trade_date": trade_date,
                    "asset_type": asset_type,
                    "broker": "robinhood",
                })
            elif action == "Sell":
                sell_rem = qty
                while sell_rem > 1e-8 and lot_queue:
                    oldest_lot = lot_queue[0]
                    if oldest_lot["quantity"] <= sell_rem + 1e-8:
                        sell_rem -= oldest_lot["quantity"]
                        lot_queue.pop(0)
                    else:
                        oldest_lot["quantity"] -= sell_rem
                        sell_rem = 0.0

        # Check surviving lots
        active_qty = sum(lot["quantity"] for lot in lot_queue)
        if active_qty > 1e-6:
            total_cost = sum(lot["price"] * lot["quantity"] for lot in lot_queue)
            avg_cost = total_cost / active_qty
            earliest_date = lot_queue[0]["trade_date"]
            desc = sym_trades[0].get("description") or symbol
            asset_type = sym_trades[0].get("asset_type", "stock")

            total_active_lots += len(lot_queue)

            holdings.append({
                "symbol": symbol,
                "name": desc,
                "quantity": round(active_qty, 6),
                "avg_cost": round(avg_cost, 4),
                "asset_type": asset_type,
                "date_of_purchase": earliest_date,
                "lot_count": len(lot_queue),
                "active_lots": [
                    {
                        "symbol": lot["symbol"],
                        "asset_type": lot["asset_type"],
                        "quantity": round(lot["quantity"], 6),
                        "price": round(lot["price"], 4),
                        "trade_date": lot["trade_date"],
                        "broker": "robinhood",
                    }
                    for lot in lot_queue
                ],
            })
        else:
            closed_positions.append(symbol)

    # Sort holdings alphabetically by symbol
    holdings.sort(key=lambda h: h["symbol"])
    closed_positions.sort()

    return {
        "holdings": holdings,
        "closed_positions": closed_positions,
        "ignored_options_count": stats.get("ignored_options_count", 0),
        "ignored_other_count": stats.get("ignored_other_count", 0),
        "total_rows_parsed": stats.get("total_rows_parsed", 0),
        "total_trades_kept": stats.get("total_trades_kept", 0),
        "total_active_lots": total_active_lots,
    }
