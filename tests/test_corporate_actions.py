"""
Unit & Integration Tests for Corporate Actions & Dividend Calendar (Sprint 2 Feature 10).
Following strict Test-Driven Development (TDD) loop.
"""

import pytest
from datetime import datetime, date
from unittest.mock import patch, MagicMock

# Import the service to be implemented
from corporate_actions_service import (
    get_symbol_corporate_actions,
    compute_portfolio_corporate_actions,
    determine_payout_frequency,
    calculate_split_multiplier,
    apply_split_adjustment_to_holding,
)


def test_determine_payout_frequency():
    # Monthly: ~30 day intervals
    monthly_dates = ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]
    assert determine_payout_frequency(monthly_dates) == "monthly"

    # Quarterly: ~90 day intervals
    quarterly_dates = ["2025-09-15", "2025-12-15", "2026-03-15", "2026-06-15"]
    assert determine_payout_frequency(quarterly_dates) == "quarterly"

    # Semi-Annual: ~180 day intervals
    semi_dates = ["2025-06-15", "2025-12-15", "2026-06-15"]
    assert determine_payout_frequency(semi_dates) == "semi-annual"

    # Annual
    annual_dates = ["2025-05-15", "2026-05-15"]
    assert determine_payout_frequency(annual_dates) == "annual"

    # Empty / Single
    assert determine_payout_frequency([]) == "none"
    assert determine_payout_frequency(["2026-01-15"]) == "none"


def test_compute_portfolio_corporate_actions_annual_income():
    holdings = [
        {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "quantity": 100.0,
            "avg_cost": 150.0,
            "price": 200.0,
            "value": 20000.0,
            "cost_basis": 15000.0,
            "date_of_purchase": "2023-01-15",
            "asset_type": "stock",
        },
        {
            "symbol": "O",
            "name": "Realty Income",
            "quantity": 200.0,
            "avg_cost": 50.0,
            "price": 60.0,
            "value": 12000.0,
            "cost_basis": 10000.0,
            "date_of_purchase": "2024-01-10",
            "asset_type": "stock",
        },
        {
            "symbol": "BTC-USD",
            "name": "Bitcoin",
            "quantity": 0.5,
            "avg_cost": 40000.0,
            "price": 60000.0,
            "value": 30000.0,
            "cost_basis": 20000.0,
            "date_of_purchase": "2024-01-01",
            "asset_type": "crypto",
        },
    ]

    actions_map = {
        "AAPL": {
            "symbol": "AAPL",
            "dividend_rate": 1.00,  # $1.00/yr per share -> 100 shares * $1.00 = $100.00
            "dividend_yield": 0.50, # 0.50%
            "payout_frequency": "quarterly",
            "ex_dividend_date": "2026-08-09",
            "dividend_date": "2026-08-12",
            "last_dividend_value": 0.25,
            "payout_months": [2, 5, 8, 11],
            "splits": [],
        },
        "O": {
            "symbol": "O",
            "dividend_rate": 3.00,  # $3.00/yr per share -> 200 shares * $3.00 = $600.00
            "dividend_yield": 5.00, # 5.00%
            "payout_frequency": "monthly",
            "ex_dividend_date": "2026-09-29",
            "dividend_date": "2026-10-14",
            "last_dividend_value": 0.25,
            "payout_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "splits": [],
        },
        "BTC-USD": {
            "symbol": "BTC-USD",
            "dividend_rate": 0.0,
            "dividend_yield": 0.0,
            "payout_frequency": "none",
            "ex_dividend_date": None,
            "dividend_date": None,
            "last_dividend_value": 0.0,
            "payout_months": [],
            "splits": [],
        },
    }

    result = compute_portfolio_corporate_actions(holdings, actions_map)
    summary = result["summary"]

    # AAPL: 100 * $1.00 = $100
    # O: 200 * $3.00 = $600
    # Total Annual = $700.00
    assert summary["total_annual_income"] == 700.0
    assert round(summary["monthly_average_income"], 2) == round(700.0 / 12, 2)
    assert summary["dividend_paying_count"] == 2
    assert summary["total_holdings_count"] == 3

    # Total Portfolio Value = 20,000 + 12,000 + 30,000 = 62,000
    # Portfolio Yield % = 700 / 62,000 * 100 = 1.129%
    assert round(summary["portfolio_yield"], 2) == 1.13

    # Total Cost Basis = 15,000 + 10,000 + 20,000 = 45,000
    # Yield on Cost % = 700 / 45,000 * 100 = 1.555%
    assert round(summary["yield_on_cost"], 2) == 1.56


def test_compute_portfolio_corporate_actions_monthly_distribution():
    holdings = [
        {
            "symbol": "KO",
            "name": "Coca-Cola",
            "quantity": 100.0,
            "avg_cost": 50.0,
            "price": 60.0,
            "value": 6000.0,
            "cost_basis": 5000.0,
            "asset_type": "stock",
        },
        {
            "symbol": "O",
            "name": "Realty Income",
            "quantity": 120.0,
            "avg_cost": 50.0,
            "price": 50.0,
            "value": 6000.0,
            "cost_basis": 6000.0,
            "asset_type": "stock",
        },
    ]

    actions_map = {
        "KO": {
            "symbol": "KO",
            "dividend_rate": 2.00,  # $2.00/yr -> $200 total -> $50 in Mar, Jun, Sep, Dec
            "dividend_yield": 3.33,
            "payout_frequency": "quarterly",
            "ex_dividend_date": "2026-09-14",
            "dividend_date": "2026-09-30",
            "last_dividend_value": 0.50,
            "payout_months": [3, 6, 9, 12],
            "splits": [],
        },
        "O": {
            "symbol": "O",
            "dividend_rate": 3.00,  # $3.00/yr -> $360 total -> $30 each month
            "dividend_yield": 6.00,
            "payout_frequency": "monthly",
            "ex_dividend_date": "2026-09-29",
            "dividend_date": "2026-10-14",
            "last_dividend_value": 0.25,
            "payout_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "splits": [],
        },
    }

    result = compute_portfolio_corporate_actions(holdings, actions_map)
    monthly_flows = result["monthly_cash_flows"]
    assert len(monthly_flows) == 12

    # In Jan (month 1): only O pays ($30.00)
    jan = next(m for m in monthly_flows if m["month_num"] == 1)
    assert jan["amount"] == 30.0
    assert "O" in jan["payers"]
    assert "KO" not in jan["payers"]

    # In Mar (month 3): both O ($30) and KO ($50) pay -> $80.00
    mar = next(m for m in monthly_flows if m["month_num"] == 3)
    assert mar["amount"] == 80.0
    assert "O" in mar["payers"]
    assert "KO" in mar["payers"]


def test_split_detection_pre_and_post_split():
    # NVDA executed a 10:1 split on 2024-06-10
    holdings = [
        {
            "symbol": "NVDA",
            "name": "NVIDIA Corporation",
            "quantity": 50.0,
            "avg_cost": 120.0,
            "value": 6000.0,
            "cost_basis": 6000.0,
            "date_of_purchase": "2023-11-15",  # BEFORE 2024-06-10 split!
            "active_lots": [
                {"date": "2023-11-15", "quantity": 50.0, "price": 120.0}
            ],
            "asset_type": "stock",
        },
        {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "quantity": 25.0,
            "avg_cost": 180.0,
            "value": 4500.0,
            "cost_basis": 4500.0,
            "date_of_purchase": "2025-01-20",  # AFTER 2020-08-31 4:1 split!
            "active_lots": [
                {"date": "2025-01-20", "quantity": 25.0, "price": 180.0}
            ],
            "asset_type": "stock",
        },
    ]

    actions_map = {
        "NVDA": {
            "symbol": "NVDA",
            "dividend_rate": 0.40,
            "dividend_yield": 0.30,
            "payout_frequency": "quarterly",
            "ex_dividend_date": "2026-09-09",
            "dividend_date": "2026-09-30",
            "last_dividend_value": 0.10,
            "payout_months": [3, 6, 9, 12],
            "splits": [
                {"date": "2024-06-10", "ratio": "10:1", "multiplier": 10.0}
            ],
        },
        "AAPL": {
            "symbol": "AAPL",
            "dividend_rate": 1.00,
            "dividend_yield": 0.50,
            "payout_frequency": "quarterly",
            "ex_dividend_date": "2026-08-09",
            "dividend_date": "2026-08-12",
            "last_dividend_value": 0.25,
            "payout_months": [2, 5, 8, 11],
            "splits": [
                {"date": "2020-08-31", "ratio": "4:1", "multiplier": 4.0}
            ],
        },
    }

    # NVDA: bought 50 shares pre-split -> adjusted to 500 shares, avg cost 120 -> 12
    nvda_adj = apply_split_adjustment_to_holding(holdings[0], actions_map["NVDA"]["splits"])
    assert nvda_adj["quantity"] == 500.0
    assert nvda_adj["avg_cost"] == 12.0
    assert round(nvda_adj["quantity"] * nvda_adj["avg_cost"], 2) == 6000.0

    # AAPL: bought post-split -> quantity and avg_cost remain unchanged
    aapl_adj = apply_split_adjustment_to_holding(holdings[1], actions_map["AAPL"]["splits"])
    assert aapl_adj["quantity"] == 25.0
    assert aapl_adj["avg_cost"] == 180.0


def test_corporate_actions_empty_holdings():
    result = compute_portfolio_corporate_actions([], {})
    assert result["summary"]["total_annual_income"] == 0.0
    assert result["summary"]["monthly_average_income"] == 0.0
    assert result["summary"]["portfolio_yield"] == 0.0
    assert result["summary"]["yield_on_cost"] == 0.0
    assert result["summary"]["dividend_paying_count"] == 0
    assert result["upcoming_events"] == []
    assert len(result["monthly_cash_flows"]) == 12
    assert result["splits"] == []


def test_calculate_split_multiplier():
    splits = [
        {"date": "2024-06-10", "ratio": "10:1", "multiplier": 10.0},
        {"date": "2021-07-20", "ratio": "4:1", "multiplier": 4.0},
    ]
    # Bought before 2021 split -> gets both 4.0 and 10.0 = 40.0
    assert calculate_split_multiplier(splits, "2020-01-15") == 40.0
    # Bought between 2021 and 2024 -> gets only 10.0
    assert calculate_split_multiplier(splits, "2023-11-15") == 10.0
    # Bought after 2024 split -> no adjustment (1.0)
    assert calculate_split_multiplier(splits, "2024-07-01") == 1.0
    # No purchase date provided -> no adjustment (1.0)
    assert calculate_split_multiplier(splits, None) == 1.0


def test_apply_split_adjustment_forward_split():
    # User holds 2 shares of NVDA bought at $450 pre-split (total cost $900)
    holding = {
        "symbol": "NVDA",
        "quantity": 2.0,
        "avg_cost": 450.0,
        "date_of_purchase": "2023-11-15",
    }
    splits = [
        {"date": "2024-06-10", "ratio": "10:1", "multiplier": 10.0},
    ]
    adjusted = apply_split_adjustment_to_holding(holding, splits)
    assert adjusted["quantity"] == 20.0
    assert adjusted["avg_cost"] == 45.0
    # Total cost basis must remain exactly conserved
    assert round(adjusted["quantity"] * adjusted["avg_cost"], 2) == 900.0


def test_apply_split_adjustment_reverse_split_merge():
    # Reverse split (merge) 1:10 (multiplier 0.1)
    # User held 100 shares at $1.00 (total cost $100)
    holding = {
        "symbol": "XYZ",
        "quantity": 100.0,
        "avg_cost": 1.0,
        "date_of_purchase": "2024-01-01",
    }
    splits = [
        {"date": "2024-05-01", "ratio": "1:10", "multiplier": 0.1},
    ]
    adjusted = apply_split_adjustment_to_holding(holding, splits)
    assert adjusted["quantity"] == 10.0
    assert adjusted["avg_cost"] == 10.0
    assert round(adjusted["quantity"] * adjusted["avg_cost"], 2) == 100.0


def test_apply_split_adjustment_with_lots():
    # Multi-lot holding: lot 1 bought pre-split (2 shares @ $450), lot 2 bought post-split (5 shares @ $120)
    holding = {
        "symbol": "NVDA",
        "quantity": 7.0,
        "avg_cost": 214.2857,
        "active_lots": [
            {"date": "2023-11-15", "quantity": 2.0, "price": 450.0},
            {"date": "2024-08-01", "quantity": 5.0, "price": 120.0},
        ],
    }
    splits = [
        {"date": "2024-06-10", "ratio": "10:1", "multiplier": 10.0},
    ]
    adjusted = apply_split_adjustment_to_holding(holding, splits)
    # Lot 1 becomes 20 shares @ $45 (cost $900)
    # Lot 2 stays 5 shares @ $120 (cost $600)
    # Total shares = 25, total cost = $1500, avg cost = $60
    assert adjusted["quantity"] == 25.0
    assert adjusted["avg_cost"] == 60.0
    assert round(adjusted["quantity"] * adjusted["avg_cost"], 2) == 1500.0



@pytest.mark.asyncio
async def test_api_market_corporate_actions_symbol():
    import httpx
    from pathlib import Path
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
    from server import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/market/corporate-actions/AAPL")
        assert res.status_code == 200
        data = res.json()
        assert data["symbol"] == "AAPL"
        assert "dividend_rate" in data
        assert "payout_frequency" in data
        assert "splits" in data


@pytest.mark.asyncio
async def test_api_portfolio_corporate_actions_authenticated():
    import httpx
    from pathlib import Path
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
    from server import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Dev login
        login_res = await client.post("/api/auth/dev-login", json={"email": "dividend_tester@terminus.local", "name": "Dividend Tester"})
        assert login_res.status_code == 200

        # Query corporate actions
        res = await client.get("/api/portfolio/corporate-actions", cookies=login_res.cookies)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "total_annual_income" in data["summary"]
        assert "upcoming_events" in data
        assert "monthly_cash_flows" in data
        assert len(data["monthly_cash_flows"]) == 12
        assert "splits" in data

