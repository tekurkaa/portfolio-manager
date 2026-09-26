"""
Corporate Actions & Dividend Calendar Service (Sprint 2 Feature 10).
Provides dividend metrics, upcoming ex-dividend calendars, 12-month projected
cash flow distribution, and stock split detection without external paid APIs.
"""

import asyncio
import logging
from datetime import datetime, date, timezone
from typing import Dict, List, Any, Optional

import yfinance as yf

logger = logging.getLogger(__name__)

# In-memory cache for corporate actions: {symbol: {"data": {...}, "timestamp": float}}
_ACTIONS_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600 * 2  # 2 hours TTL


def determine_payout_frequency(dividend_dates: List[str]) -> str:
    """
    Determines dividend distribution frequency based on consecutive payment dates.
    Dates are expected in YYYY-MM-DD format.
    """
    if not dividend_dates or len(dividend_dates) < 2:
        return "none"

    parsed = []
    for d in sorted(dividend_dates):
        try:
            parsed.append(datetime.strptime(d[:10], "%Y-%m-%d").date())
        except Exception:
            continue

    if len(parsed) < 2:
        return "none"

    # Calculate average interval in days between consecutive payments
    intervals = [(parsed[i] - parsed[i - 1]).days for i in range(1, len(parsed))]
    avg_interval = sum(intervals) / len(intervals)

    if avg_interval <= 45:
        return "monthly"
    elif avg_interval <= 125:
        return "quarterly"
    elif avg_interval <= 230:
        return "semi-annual"
    else:
        return "annual"


def _format_date(raw: Any) -> Optional[str]:
    """Helper to convert timestamps, date objects, or strings into YYYY-MM-DD."""
    if raw is None:
        return None
    if isinstance(raw, (datetime, date)):
        return raw.strftime("%Y-%m-%d")
    if isinstance(raw, (int, float)):
        # Epoch timestamp
        try:
            return datetime.fromtimestamp(raw, tz=timezone.utc).strftime("%Y-%m-%d")
        except Exception:
            return None
    s = str(raw).strip()
    if len(s) >= 10 and s[:10].replace("-", "").isdigit():
        return s[:10]
    return None


def fetch_symbol_corporate_actions_sync(symbol: str) -> Dict[str, Any]:
    """
    Synchronous corporate actions fetch from yfinance.
    Retrieves forward dividend rate, yield, ex-date, payment date, and historical splits.
    """
    sym = (symbol or "").upper().strip()
    if not sym or sym.endswith("-USD") or sym in {"BTC", "ETH", "SOL", "DOGE", "USDT", "USDC"}:
        # Crypto or empty: zero dividends
        return {
            "symbol": sym,
            "dividend_rate": 0.0,
            "dividend_yield": 0.0,
            "payout_frequency": "none",
            "ex_dividend_date": None,
            "dividend_date": None,
            "last_dividend_value": 0.0,
            "payout_months": [],
            "splits": [],
        }

    try:
        ticker = yf.Ticker(sym)
        info = ticker.info or {}

        # Dividend yield & rate
        div_rate = info.get("dividendRate") or info.get("trailingAnnualDividendRate") or 0.0
        div_yield_raw = info.get("dividendYield") or info.get("trailingAnnualDividendYield") or 0.0
        # Normalise yield to percentage (e.g., 0.024 -> 2.40)
        div_yield = float(div_yield_raw) * 100 if float(div_yield_raw) < 0.25 and float(div_yield_raw) > 0 else float(div_yield_raw)

        # Calendar dates
        cal = {}
        try:
            cal = ticker.calendar or {}
        except Exception:
            pass

        ex_date = _format_date(cal.get("Ex-Dividend Date") or info.get("exDividendDate"))
        pay_date = _format_date(cal.get("Dividend Date"))

        # Dividends series for payout history & frequency
        payout_months: List[int] = []
        div_dates: List[str] = []
        last_div_val = 0.0
        try:
            divs = ticker.dividends
            if divs is not None and not divs.empty:
                recent_divs = divs.tail(8)
                for ts, val in recent_divs.items():
                    d_str = _format_date(ts)
                    if d_str:
                        div_dates.append(d_str)
                    if val and float(val) > 0:
                        last_div_val = float(val)
                payout_months = sorted(list(set(ts.month for ts in divs.tail(6).index)))
                if not div_rate and last_div_val > 0:
                    # Estimate annual rate based on frequency
                    freq_mult = 12 if len(payout_months) >= 10 else (4 if len(payout_months) in [3, 4] else 2)
                    div_rate = round(last_div_val * freq_mult, 3)
        except Exception as e:
            logger.debug(f"Failed to fetch dividend series for {sym}: {e}")

        frequency = determine_payout_frequency(div_dates)
        if frequency == "none" and payout_months:
            frequency = "monthly" if len(payout_months) >= 10 else ("quarterly" if len(payout_months) in [3, 4] else "annual")

        # Splits
        splits_list: List[Dict[str, Any]] = []
        try:
            splits_df = ticker.splits
            if splits_df is not None and not splits_df.empty:
                # Get splits from the last 10 years
                for ts, ratio in splits_df.tail(5).items():
                    split_d = _format_date(ts)
                    ratio_num = float(ratio)
                    if ratio_num > 1.0:
                        ratio_str = f"{int(ratio_num) if ratio_num.is_integer() else ratio_num}:1"
                    else:
                        ratio_str = f"1:{int(1/ratio_num) if (1/ratio_num).is_integer() else round(1/ratio_num, 2)}"
                    splits_list.append({
                        "date": split_d,
                        "ratio": ratio_str,
                        "multiplier": ratio_num,
                    })
        except Exception as e:
            logger.debug(f"Failed to fetch splits for {sym}: {e}")

        return {
            "symbol": sym,
            "dividend_rate": round(float(div_rate), 4),
            "dividend_yield": round(float(div_yield), 2),
            "payout_frequency": frequency,
            "ex_dividend_date": ex_date,
            "dividend_date": pay_date,
            "last_dividend_value": round(float(last_div_val), 4),
            "payout_months": payout_months,
            "splits": splits_list,
        }
    except Exception as e:
        logger.warning(f"Error resolving corporate actions for {sym}: {e}")
        return {
            "symbol": sym,
            "dividend_rate": 0.0,
            "dividend_yield": 0.0,
            "payout_frequency": "none",
            "ex_dividend_date": None,
            "dividend_date": None,
            "last_dividend_value": 0.0,
            "payout_months": [],
            "splits": [],
        }


def get_symbol_corporate_actions(symbol: str) -> Dict[str, Any]:
    """Retrieves corporate actions for a symbol with TTL in-memory caching."""
    sym = (symbol or "").upper().strip()
    now_ts = datetime.now(timezone.utc).timestamp()

    if sym in _ACTIONS_CACHE:
        entry = _ACTIONS_CACHE[sym]
        if now_ts - entry["timestamp"] < CACHE_TTL_SECONDS:
            return entry["data"]

    data = fetch_symbol_corporate_actions_sync(sym)
    _ACTIONS_CACHE[sym] = {"data": data, "timestamp": now_ts}
    return data


async def get_symbols_corporate_actions_batch(symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    """Fetches corporate actions asynchronously in parallel for multiple symbols."""
    clean_syms = sorted(list(set(s.upper().strip() for s in symbols if s)))
    tasks = [asyncio.to_thread(get_symbol_corporate_actions, sym) for sym in clean_syms]
    results = await asyncio.gather(*tasks)
    return {sym: res for sym, res in zip(clean_syms, results)}


def calculate_split_multiplier(splits: List[Dict[str, Any]], purchase_date: Optional[str]) -> float:
    """
    Computes cumulative split/merge multiplier for all split events occurring strictly
    after purchase_date. Returns 1.0 if purchase_date is missing or no splits occurred.
    """
    if not splits or not purchase_date:
        return 1.0

    p_date = str(purchase_date)[:10]
    total_multiplier = 1.0

    # Sort splits chronologically by date
    sorted_splits = sorted(splits, key=lambda s: str(s.get("date") or ""))
    for sp in sorted_splits:
        sp_date = str(sp.get("date") or "")[:10]
        if sp_date and sp_date > p_date:
            mult = float(sp.get("multiplier") or 1.0)
            if mult > 0:
                total_multiplier *= mult

    return round(total_multiplier, 6)


def apply_split_adjustment_to_holding(
    holding: Dict[str, Any],
    splits: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Applies cumulative split/merge multipliers to a holding and its tax lots.
    Total cost basis is strictly conserved.
    """
    if not splits:
        return holding

    h = dict(holding)
    active_lots = h.get("active_lots")

    if active_lots and len(active_lots) > 0:
        adjusted_lots = []
        total_qty = 0.0
        total_cost = 0.0
        for lot in active_lots:
            l_copy = dict(lot)
            mult = calculate_split_multiplier(splits, l_copy.get("date"))
            orig_qty = float(l_copy.get("quantity") or 0)
            orig_price = float(l_copy.get("price") or l_copy.get("avg_cost") or 0)
            adj_qty = orig_qty * mult
            adj_price = orig_price / mult if mult else orig_price
            l_copy["quantity"] = adj_qty
            l_copy["price"] = adj_price
            total_qty += adj_qty
            total_cost += (adj_qty * adj_price)
            adjusted_lots.append(l_copy)

        h["active_lots"] = adjusted_lots
        if total_qty > 0:
            h["quantity"] = round(total_qty, 6)
            h["avg_cost"] = round(total_cost / total_qty, 6)
    else:
        p_date = h.get("date_of_purchase")
        mult = calculate_split_multiplier(splits, p_date)
        if mult != 1.0:
            orig_qty = float(h.get("quantity") or 0)
            orig_cost = float(h.get("avg_cost") or 0)
            adj_qty = orig_qty * mult
            adj_cost = orig_cost / mult if mult else orig_cost
            h["quantity"] = round(adj_qty, 6)
            h["avg_cost"] = round(adj_cost, 6)

    return h


def compute_portfolio_corporate_actions(
    holdings: List[Dict[str, Any]],
    actions_map: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Computes portfolio-level dividend analytics, 12-month projected cash flow schedule,
    upcoming ex-dividend timelines, and flags pre-split lots.
    """
    if not holdings:
        return {
            "summary": {
                "total_annual_income": 0.0,
                "monthly_average_income": 0.0,
                "portfolio_yield": 0.0,
                "yield_on_cost": 0.0,
                "dividend_paying_count": 0,
                "total_holdings_count": 0,
            },
            "upcoming_events": [],
            "monthly_cash_flows": [
                {"month": m, "month_num": i + 1, "amount": 0.0, "payers": []}
                for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
            ],
            "splits": [],
        }

    total_annual_income = 0.0
    total_portfolio_value = 0.0
    total_cost_basis = 0.0
    dividend_paying_count = 0

    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    monthly_totals = {i + 1: {"amount": 0.0, "payers": set()} for i in range(12)}

    upcoming_events = []
    portfolio_splits = []

    for h in holdings:
        sym = (h.get("symbol") or "").upper().strip()
        qty = float(h.get("quantity") or 0)
        price = float(h.get("price") or h.get("avg_cost") or 0)
        avg_cost = float(h.get("avg_cost") or 0)
        value = float(h.get("value") or (qty * price))
        cost = float(h.get("cost_basis") or (qty * avg_cost))

        total_portfolio_value += value
        total_cost_basis += cost

        act = actions_map.get(sym) or {}
        div_rate = float(act.get("dividend_rate") or 0.0)
        div_yield = float(act.get("dividend_yield") or 0.0)
        payout_freq = act.get("payout_frequency") or "none"
        ex_date = act.get("ex_dividend_date")
        pay_date = act.get("dividend_date")
        last_div = float(act.get("last_dividend_value") or 0.0)
        payout_months = act.get("payout_months") or []

        holding_annual_income = qty * div_rate
        if div_rate > 0 or holding_annual_income > 0:
            dividend_paying_count += 1
            total_annual_income += holding_annual_income

            # Distribute into monthly calendar
            if payout_months:
                amt_per_month = holding_annual_income / len(payout_months)
                for m in payout_months:
                    if 1 <= m <= 12:
                        monthly_totals[m]["amount"] += amt_per_month
                        monthly_totals[m]["payers"].add(sym)
            elif payout_freq == "monthly":
                amt_per_month = holding_annual_income / 12
                for m in range(1, 13):
                    monthly_totals[m]["amount"] += amt_per_month
                    monthly_totals[m]["payers"].add(sym)
            elif payout_freq == "quarterly":
                # Default to Mar, Jun, Sep, Dec if specific months unknown
                amt_per_qtr = holding_annual_income / 4
                for m in [3, 6, 9, 12]:
                    monthly_totals[m]["amount"] += amt_per_qtr
                    monthly_totals[m]["payers"].add(sym)
            else:
                # Default to current month or December
                monthly_totals[12]["amount"] += holding_annual_income
                monthly_totals[12]["payers"].add(sym)

            # Upcoming event entry
            # Estimated single dividend payout
            freq_divisor = 12 if payout_freq == "monthly" else (4 if payout_freq == "quarterly" else (2 if payout_freq == "semi-annual" else 1))
            est_payout = qty * (last_div if last_div > 0 else (div_rate / freq_divisor))

            upcoming_events.append({
                "symbol": sym,
                "name": h.get("name") or sym,
                "asset_type": h.get("asset_type") or "stock",
                "quantity": qty,
                "value": round(value, 2),
                "dividend_rate": round(div_rate, 4),
                "dividend_yield": round(div_yield, 2),
                "payout_frequency": payout_freq,
                "ex_dividend_date": ex_date,
                "dividend_date": pay_date,
                "amount_per_share": round(last_div if last_div > 0 else (div_rate / freq_divisor), 4),
                "estimated_payout": round(est_payout, 2),
                "annual_payout": round(holding_annual_income, 2),
            })

    # Sort upcoming events by ex_dividend_date (if present) or pay_date
    upcoming_events.sort(
        key=lambda x: (x["ex_dividend_date"] is None, x["ex_dividend_date"] or x["dividend_date"] or "9999-99-99")
    )

    # Sort splits by date descending
    portfolio_splits.sort(key=lambda s: s.get("date") or "", reverse=True)

    monthly_cash_flows = [
        {
            "month": month_names[i],
            "month_num": i + 1,
            "amount": round(monthly_totals[i + 1]["amount"], 2),
            "payers": sorted(list(monthly_totals[i + 1]["payers"])),
        }
        for i in range(12)
    ]

    port_yield = (total_annual_income / total_portfolio_value * 100) if total_portfolio_value else 0.0
    yield_on_cost = (total_annual_income / total_cost_basis * 100) if total_cost_basis else 0.0

    return {
        "summary": {
            "total_annual_income": round(total_annual_income, 2),
            "monthly_average_income": round(total_annual_income / 12, 2),
            "portfolio_yield": round(port_yield, 2),
            "yield_on_cost": round(yield_on_cost, 2),
            "dividend_paying_count": dividend_paying_count,
            "total_holdings_count": len(holdings),
        },
        "upcoming_events": upcoming_events,
        "monthly_cash_flows": monthly_cash_flows,
        "splits": portfolio_splits,
    }
