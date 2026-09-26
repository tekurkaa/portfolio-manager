"""
XIRR (Extended Internal Rate of Return) Service.
High-precision, zero-dependency financial math solver implementing Newton-Raphson
with bounded bisection fallback to calculate true annualized money-weighted returns.
"""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union


def calculate_xirr(
    cash_flows: List[Tuple[Union[str, date, datetime], float]],
    max_iterations: int = 100,
    tolerance: float = 1e-6,
) -> Optional[float]:
    """
    Computes Extended Internal Rate of Return (XIRR).
    
    Formula:
        Sum( C_i / (1 + r)^((d_i - d_0) / 365) ) = 0
        
    Args:
        cash_flows: List of (date, amount) tuples.
                    Negative amounts represent cash outflows/investments.
                    Positive amounts represent cash inflows/current market value.
        max_iterations: Maximum Newton-Raphson iterations.
        tolerance: Net Present Value (NPV) convergence tolerance.
        
    Returns:
        Annualized percentage return (e.g., 18.42 for 18.42%) or None if unsolvable.
    """
    cleaned: List[Tuple[date, float]] = []
    for d, amt in cash_flows:
        if amt is None:
            continue
        try:
            val = float(amt)
        except (ValueError, TypeError):
            continue

        if isinstance(d, str):
            try:
                dt = datetime.strptime(d[:10], "%Y-%m-%d").date()
            except ValueError:
                continue
        elif isinstance(d, datetime):
            dt = d.date()
        elif isinstance(d, date):
            dt = d
        else:
            continue

        cleaned.append((dt, val))

    if len(cleaned) < 2:
        return None

    cleaned.sort(key=lambda x: x[0])
    
    pos_count = sum(1 for _, a in cleaned if a > 0)
    neg_count = sum(1 for _, a in cleaned if a < 0)
    if pos_count == 0 or neg_count == 0:
        return None

    d0 = cleaned[0][0]
    dN = cleaned[-1][0]
    total_days = (dN - d0).days

    total_inflows = sum(-a for _, a in cleaned if a < 0)
    total_outflows = sum(a for _, a in cleaned if a > 0)

    # For very short holding horizons (< 7 days), annualizing introduces severe compounding distortion
    # Fallback to simple unannualized return %
    if total_days < 7:
        if total_inflows > 0:
            return round(((total_outflows - total_inflows) / total_inflows) * 100, 2)
        return 0.0

    times = [(d - d0).days / 365.0 for d, _ in cleaned]
    amounts = [a for _, a in cleaned]

    # Initial guess r_0 based on simple annualized return
    simple_ret = (total_outflows - total_inflows) / total_inflows if total_inflows else 0.0
    years = max(total_days / 365.0, 0.05)
    if simple_ret > -0.99:
        try:
            r = (1.0 + simple_ret) ** (1.0 / years) - 1.0
        except Exception:
            r = simple_ret / years
    else:
        r = -0.5
    r = max(-0.95, min(r, 10.0))

    # Newton-Raphson iteration
    for _ in range(max_iterations):
        f_val = 0.0
        df_val = 0.0
        denom_base = 1.0 + r
        if denom_base <= 0.0001:
            denom_base = 0.0001

        for t, a in zip(times, amounts):
            pw = denom_base ** t
            f_val += a / pw
            if t != 0:
                df_val -= t * a / (pw * denom_base)

        if abs(f_val) < tolerance:
            return round(r * 100.0, 2)

        if abs(df_val) < 1e-12:
            break

        step = f_val / df_val
        new_r = r - step
        if new_r <= -0.99:
            r = (r - 0.99) / 2.0
        else:
            r = new_r

    # Bisection fallback if Newton-Raphson did not converge
    low, high = -0.99, 50.0
    for _ in range(80):
        mid = (low + high) / 2.0
        denom_mid = 1.0 + mid
        f_mid = sum(a / (denom_mid ** t) for t, a in zip(times, amounts))
        if abs(f_mid) < tolerance or (high - low) < 1e-5:
            return round(mid * 100.0, 2)
        denom_low = 1.0 + low
        f_low = sum(a / (denom_low ** t) for t, a in zip(times, amounts))
        if (f_mid > 0) == (f_low > 0):
            low = mid
        else:
            high = mid

    return round(r * 100.0, 2)


def compute_holding_xirr(
    holding: Dict[str, Any],
    today_date: Optional[date] = None,
) -> Optional[float]:
    """Computes XIRR for an individual holding across active tax lots."""
    if today_date is None:
        today_date = date.today()

    qty = float(holding.get("quantity") or 0.0)
    current_price = float(holding.get("price") or holding.get("avg_cost") or 0.0)
    current_value = qty * current_price

    if qty <= 0 or current_value <= 0:
        return None

    flows: List[Tuple[Any, float]] = []
    active_lots = holding.get("active_lots")

    if active_lots and isinstance(active_lots, list) and len(active_lots) > 0:
        for lot in active_lots:
            l_qty = float(lot.get("quantity") or 0.0)
            l_px = float(lot.get("price") or 0.0)
            l_date = lot.get("trade_date")
            if l_qty > 0 and l_px > 0 and l_date:
                flows.append((l_date, -(l_qty * l_px)))

    if not flows:
        purchase_date = holding.get("date_of_purchase")
        if not purchase_date:
            created_at = holding.get("created_at")
            purchase_date = created_at[:10] if created_at else (today_date - timedelta(days=90)).isoformat()
        avg_cost = float(holding.get("avg_cost") or 0.0)
        cost_basis = qty * avg_cost
        if cost_basis > 0:
            flows.append((purchase_date, -cost_basis))

    if not flows:
        return None

    flows.append((today_date, current_value))
    return calculate_xirr(flows)


def compute_portfolio_xirr(
    holdings: List[Dict[str, Any]],
    total_value: float,
    today_date: Optional[date] = None,
) -> Optional[float]:
    """Computes composite portfolio XIRR across all held lots and total market value."""
    if today_date is None:
        today_date = date.today()

    if total_value <= 0 or not holdings:
        return None

    flows: List[Tuple[Any, float]] = []

    for h in holdings:
        qty = float(h.get("quantity") or 0.0)
        if qty <= 0:
            continue

        active_lots = h.get("active_lots")
        added_lots = False
        if active_lots and isinstance(active_lots, list) and len(active_lots) > 0:
            for lot in active_lots:
                l_qty = float(lot.get("quantity") or 0.0)
                l_px = float(lot.get("price") or 0.0)
                l_date = lot.get("trade_date")
                if l_qty > 0 and l_px > 0 and l_date:
                    flows.append((l_date, -(l_qty * l_px)))
                    added_lots = True

        if not added_lots:
            p_date = h.get("date_of_purchase")
            if not p_date:
                c_at = h.get("created_at")
                p_date = c_at[:10] if c_at else (today_date - timedelta(days=90)).isoformat()
            avg_cost = float(h.get("avg_cost") or 0.0)
            cost_basis = qty * avg_cost
            if cost_basis > 0:
                flows.append((p_date, -cost_basis))

    if not flows:
        return None

    flows.append((today_date, total_value))
    return calculate_xirr(flows)
